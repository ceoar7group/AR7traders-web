// Goo-net dealer stock importer — runs on Vercel as a serverless function.
//
// Triggered two ways:
//   1. Scheduled: the GitHub Actions workflow (.github/workflows/goonet-sync.yml)
//      calls this once a day with ?key=<GOONET_SYNC_KEY>. Free on Vercel
//      Hobby — no cron add-on needed, nothing runs when the site is idle.
//   2. Manual: the CRM "Run import now" button (admin, Bearer token).
//
// Each run is deliberately small so it stays inside the free tier's function
// time limit and never slows the site down:
//   • crawls ONE goo-net listing page (bookmarked, resumes next run — the
//     bookmark only moves when the page was actually read, never past a stub)
//   • imports at most `goonet_max_new_per_run` new cars that PASS the quality
//     gate (minimum photo count etc. — configured in the CRM)
//   • checks at most `goonet_max_delist_per_run` existing cars for delisting
//   • weekly maintenance (once every 7 days): delists a FEW older cars and
//     auto-promotes a FEW fresh high-quality cars to the website
//
// All rules live in site_settings (editable from CRM → Japan dealer stock),
// so nothing needs a redeploy to tune.
import {adminClient, send} from './_supabase.js';
import {
  fetchPage, isDelistedPage, parseListingPage, parseDetailPage,
  mergeCardAndDetail, qualityScore, detailUrlFor, listingPageUrlFor,
  pageDiagnostics, DEFAULT_SEARCH_URL, FALLBACK_SEARCH_URL,
  GATE_PAGE_BYTES, relayApiKey,
  llmConfigured, extractCardsWithLlm, buildParserDiagnostic
} from '../scripts/goonet-core.mjs';

export const config = { maxDuration: 60 };

// Vercel Hobby runs this function for up to `maxDuration` (60s, set below).
// The budget is split: a hard stop for the whole run, and a separate allowance
// for the import loop. It used to be one 8s budget measured from the start of
// the request — the listing fetch (up to 7s) plus a relay or rescue fetch could
// consume all of it, so the import loop began already over budget and the run
// reported `inserted: 0` even though goo-net had been read perfectly.
const RUN_BUDGET_MS = 45000;      // hard stop for the whole run
const IMPORT_BUDGET_MS = 30000;   // the import loop's own allowance
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

async function settings(db) {
  const { data } = await db.from('site_settings').select('key,value');
  const out = {};
  (data || []).forEach(r => { out[r.key] = r.value; });
  return out;
}

async function setSetting(db, key, value) {
  await db.from('site_settings').upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: 'key' });
}

function num(v, dflt) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : dflt;
}
function bool(v, dflt) {
  if (v === undefined || v === null || v === '') return dflt;
  return String(v).toLowerCase() === 'true' || v === '1';
}

async function getKnownIds(db) {
  const { data } = await db.from('japan_dealer_stock').select('goonet_id');
  return new Set((data || []).map(r => String(r.goonet_id)));
}

// Check if a goonet_id has been blocklisted (previously deleted or failed quality)
async function isBlocked(db, goonetId) {
  const { data } = await db.from('goonet_blocklist')
    .select('goonet_id')
    .eq('goonet_id', String(goonetId))
    .maybeSingle();
  return !!data;
}

// A goo-net car that no longer exists → remove it from the site too.
export async function delistCar(db, row, actor = 'Goo-net sync') {
  const now = new Date().toISOString();
  const { error: hideErr } = await db.from('japan_dealer_stock')
    .update({ available: false, delisted_at: now, updated_at: now })
    .eq('id', row.id);
  if (hideErr) throw promotionError('Could not delist the car', hideErr);

  // If the same car was promoted to the website, hide that listing as well
  // (reversible — re-publish from CRM → Website cars any time).
  if (promotesToListings(row) && row.stock_no) {
    const { data: listing, error: listErr } = await db.from('site_listings').select('id,published').eq('stock_no', row.stock_no).maybeSingle();
    if (listErr) throw promotionError('Could not check the website listing to hide', listErr);
    if (listing && listing.published !== false) {
      const { error } = await db.from('site_listings').update({ published: false, updated_at: now }).eq('id', listing.id);
      if (error) throw promotionError('Could not hide the website listing', error);
    }
  }
  try {
    await db.from('activities').insert({
      action: `Delisted ${row.make} ${row.model} (${row.stock_no}) from Goo-net — hidden from website`,
      actor, entity_type: 'japan_dealer_stock', entity_id: row.id
    });
  } catch (e) { console.error('activity log failed', e.message); }
}

// ---- Promotion: dealer stock → website listing / CRM inventory -------------
//
// A promotion is a COPY plus a flag on the dealer row. Two rules keep it
// honest, both learned from a live failure the owner reported ("I added an
// imported car to inventory and got an error, and the CRM never showed it as
// added"):
//
//   1. Every write is checked. Supabase resolves `{error}` instead of throwing,
//      so the old code happily answered "Moved Toyota Prius to vehicles" when
//      the insert had in fact failed — the notice said added, the Inventory tab
//      said nothing, and the next press behaved like the first one.
//   2. The `promoted` flag is written LAST, only after the copy really landed.
//      Flipping it first (or regardless) made the CRM believe a car was in the
//      inventory when it was not, which is exactly what the owner saw.
//
// Both helpers return what actually happened — `already` tells the caller the
// car was in the destination before this call, so the CRM can say so instead of
// reporting a fresh add every time.
function promotionError(step, error) {
  const detail = error?.message || 'unknown database error';
  return Object.assign(new Error(`${step} — ${detail}`), { status: 500 });
}

/** The stock number a promotion is keyed on; '' when the row has none. */
export function stockRef(row) {
  return String(row?.stock_no || row?.goonet_id || '').trim();
}

// `promoted` is 'none' | 'listings' | 'vehicles' | 'both'. Reading it with
// `String(promoted).includes('listings')` looks right and is wrong for 'both':
// "both".includes('listings') is false, so a car that was on the website AND in
// the inventory was treated as if it were in neither — delisting it left the
// website copy published, and re-promoting it downgraded 'both' back to a
// single destination.
export function promotesToListings(row) {
  const v = String(row?.promoted || '').trim().toLowerCase();
  return v === 'both' || v.includes('listings');
}
export function promotesToInventory(row) {
  const v = String(row?.promoted || '').trim().toLowerCase();
  return v === 'both' || v.includes('vehicles');
}

export async function promoteToListings(db, row, actor = 'Goo-net sync') {
  const now = new Date().toISOString();
  const stockNo = stockRef(row);
  if (!stockNo) throw Object.assign(new Error('This car has no stock number, so it cannot be published'), { status: 400 });
  const listing = {
    stock_no: stockNo,
    make: row.make, model: row.model, year: row.year, km: row.km,
    fuel: row.fuel || 'Petrol', body: row.body || 'SUV',
    price: row.price || (row.price_usd ? '$' + Math.round(row.price_usd).toLocaleString('en-US') : '$15,000'),
    image: row.image, images: row.images,
    grade: row.grade || '4.0', status: 'In Stock', location: row.location || 'Japan',
    tr: row.tr, drv: row.drv, eng: row.eng, seats: row.seats, col: row.col, st: row.st,
    published: true, updated_at: now
  };
  const { data: existing, error: readErr } = await db.from('site_listings')
    .select('id,sort_order').eq('stock_no', stockNo).maybeSingle();
  if (readErr) throw promotionError('Could not check the website listing', readErr);

  if (existing) {
    listing.sort_order = existing.sort_order;
    const { error } = await db.from('site_listings').update(listing).eq('id', existing.id);
    if (error) throw promotionError('Could not update the website listing', error);
  } else {
    const { data: maxRow, error: maxErr } = await db.from('site_listings')
      .select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
    if (maxErr) throw promotionError('Could not read the website listing order', maxErr);
    listing.sort_order = (maxRow?.sort_order || 12) + 1; // keep positions 1–12 as the showroom
    const { error } = await db.from('site_listings').insert(listing);
    if (error) throw promotionError('Could not publish the car on the website', error);
  }

  // The copy is on the website — only now is it safe to mark the dealer row.
  const promoted = promotesToInventory(row) ? 'both' : 'listings';
  const { error: flagErr } = await db.from('japan_dealer_stock')
    .update({ promoted, updated_at: now }).eq('id', row.id);
  if (flagErr) throw promotionError('The car reached the website but its dealer row could not be marked as promoted', flagErr);

  try {
    await db.from('activities').insert({
      action: `Promoted ${row.make} ${row.model} (${row.stock_no}) to the public website`,
      actor, entity_type: 'japan_dealer_stock', entity_id: row.id
    });
  } catch (e) { console.error('activity log failed', e.message); }

  return { target: 'listings', stock_no: stockNo, already: !!existing, created: !existing, promoted };
}

export async function promoteToInventory(db, row, actor = 'Goo-net sync') {
  const now = new Date().toISOString();
  const stockNo = stockRef(row);
  if (!stockNo) throw Object.assign(new Error('This car has no stock number, so it cannot be added to inventory'), { status: 400 });
  const vehicle = {
    stock_no: stockNo,
    make: row.make, model: row.model, year: row.year,
    price: row.price_usd || 0,
    status: 'available', location: row.location || 'Japan',
    steering: row.st, colour: row.col, interior: null,
    image: row.image, images: row.images,
    vendor: 'Goo-net',
    cost_price: row.price_usd || 0,
    notes: `Imported from Goo-net (${row.goonet_url || ''}). Quality score ${row.quality_score || 0}, ${row.photo_count || 0} photos.`,
    updated_at: now
  };
  const { data: existing, error: readErr } = await db.from('vehicles')
    .select('id').eq('stock_no', stockNo).maybeSingle();
  if (readErr) throw promotionError('Could not check the CRM inventory', readErr);

  let already = !!existing;
  if (existing) {
    const { error } = await db.from('vehicles').update(vehicle).eq('id', existing.id);
    if (error) throw promotionError('Could not update the car in CRM inventory', error);
  } else {
    const { error } = await db.from('vehicles').insert(vehicle);
    // Two presses in the same second, or a car added by hand in the Inventory
    // tab while this ran: the unique stock number wins, and the honest answer
    // is "it is in the inventory", not a 500.
    if (error && /duplicate|unique/i.test(error.message || '')) {
      already = true;
      const { error: updateErr } = await db.from('vehicles').update(vehicle).eq('stock_no', stockNo);
      if (updateErr) throw promotionError('Could not update the car in CRM inventory', updateErr);
    } else if (error) {
      throw promotionError('Could not add the car to CRM inventory', error);
    }
  }

  const promoted = promotesToListings(row) ? 'both' : 'vehicles';
  const { error: flagErr } = await db.from('japan_dealer_stock')
    .update({ promoted, updated_at: now }).eq('id', row.id);
  if (flagErr) throw promotionError('The car reached the inventory but its dealer row could not be marked as promoted', flagErr);

  try {
    await db.from('activities').insert({
      action: `Promoted ${row.make} ${row.model} (${row.stock_no}) to CRM inventory`,
      actor, entity_type: 'japan_dealer_stock', entity_id: row.id
    });
  } catch (e) { console.error('activity log failed', e.message); }

  return { target: 'vehicles', stock_no: stockNo, already, created: !already, promoted };
}

// The scheduled importer must never die because one car's copy failed. A
// promotion error on a cron run is recorded in the run report (so the CRM's
// "Run import now" notice shows it) and the run carries on with the next car.
// The CRM's own Publish/Inventory buttons get the same error thrown back at
// them instead, because there a person can act on it.
async function carryOn(report, stepPromise, row) {
  try {
    await stepPromise;
    return true;
  } catch (e) {
    const label = `${row?.stock_no || row?.goonet_id || 'car'} ${row?.make || ''} ${row?.model || ''}`.trim();
    report.skipped.push(`${label}: ${e.message}`);
    report.failed = (report.failed || 0) + 1;
    console.error('goonet-sync promotion failed:', e.message);
    return false;
  }
}

/**
 * The nightly machinery pass.
 *
 * It never invents anything: it re-reads links a human already imported, so
 * the worst a bad run can do is change a price — and every price change is
 * recorded old → new before it is overwritten.
 *
 * A machine the supplier no longer lists is FLAGGED with
 * `source_missing_since`, not delisted. A supplier hiding a listing over a
 * weekend is not the same thing as the machine being gone, and only the owner
 * can tell those apart.
 */
async function machineryJob(db, actor, { overBudget, res }) {
  const { previewMachine, toRow, planImport, applyImport } = await import('./_machinery-import.js');
  const { readMachineryRows, machineryVisibility } = await import('./_machinery.js');

  const report = {
    job: 'machinery', actor, sources: 0, seen: 0, created: 0, updated: 0,
    rePriced: [], unchanged: 0, missing: 0, flagged: 0, cleared: 0,
    failed: [], note: null
  };

  const all = await readMachineryRows(db);
  report.inventory = machineryVisibility(all);
  // Oldest checks first so large catalogues do not recheck only page one.
  const sourced = all.filter(r => r.source_url && r.status !== 'Archived')
    .sort((a,b) => String(a.source_last_seen_at || '').localeCompare(String(b.source_last_seen_at || '')));
  report.sources = sourced.length;

  if (!sourced.length) {
    report.note = 'No imported machines have a source link yet, so there is nothing to re-check.';
    return send(res, 200, report);
  }

  const candidates = [];
  // Which machines were ALREADY flagged before this run, so the report can say
  // how many came back. applyImport() clears the flag as part of its update,
  // so count cleared flags from the stored rows after the update.
  const wasFlagged = new Set(sourced.filter(r => r.source_missing_since).map(r => String(r.id)));

  for (const row of sourced) {
    if (overBudget()) { report.note = `Stopped early: ${report.seen}/${sourced.length} sources checked before the time limit.`; break; }
    try {
      const p = await previewMachine({
        url: row.source_url,
        // The rights basis already recorded on the row is reused. The operator
        // decided it once; a nightly job must not quietly widen it.
        rights: row.rights_basis || null,
        adapter: row.adapter || null
      });
      if (!p.ok) {
        // Unreadable (bot gate, expired listing) is not the same as gone, but
        // it is worth recording rather than swallowing.
        report.failed.push({ ref: row.ref, reason: p.error });
        // Only a confirmed gone response can flag THIS row. A timeout/403 or
        // an unvisited sibling on the same host must never look delisted.
        if ([404, 410].includes(p.sourceStatus) && !row.source_missing_since) {
          const { error } = await db.from('machinery')
            .update({ source_missing_since: new Date().toISOString() }).eq('id', row.id);
          if (error) report.failed.push({ ref: row.ref, reason: error.message });
          else report.flagged++;
        }
        continue;
      }
      report.seen++;
      // Keep this machine's own reference — toMachine() would otherwise
      // invent 'AR7-MC-NEW' and the run would rewrite the reference (and so
      // the URL) of a machine that is already listed.
      candidates.push(toRow(p.machine, {
        rights: row.rights_basis || null, adapter: p.source?.adapter, ref: row.ref
      }));
    } catch (e) {
      report.failed.push({ ref: row.ref, reason: e.message });
    }
  }

  if (candidates.length) {
    const plan = planImport(all, candidates);
    // A scheduled price refresh is not an instruction to republish a hidden
    // listing or change Reserved/Sold back to Available.
    for (const u of plan.updates) {
      for (const key of ['published', 'status', 'hold_reason', 'published_by', 'published_by_name', 'published_at', 'imported_at']) {
        if (key in u.before) u.next[key] = u.before[key];
        else delete u.next[key];
      }
    }
    report.failed.push(...plan.errors.map(e => ({ ref: e.ref, reason: e.errors.map(x => x.message).join('; ') })));
    const out = await applyImport(db, plan, { id: null, full_name: actor, email: null });
    report.created = out.created.length;
    report.updated = out.updated.length;
    report.rePriced = out.rePriced.map(r => ({ ref: r.ref, before: r.before, after: r.after }));
    report.failed.push(...out.failed.map(f => ({ ref: f.ref, reason: f.error })));
    report.unchanged = out.updated.length - out.rePriced.length;
  }

  // A detail-page recheck is NOT a complete supplier inventory crawl.
  // Timeouts, bot gates and unvisited rows do not prove removal. Never pass
  // this partial seenIds list to markStale (which flags all absent host rows).
  // Count what actually came back: flagged before this run, clean now.
  if (wasFlagged.size) {
    const { data: after } = await db.from('machinery').select('*');
    report.cleared = (Array.isArray(after) ? after : [])
      .filter(r => wasFlagged.has(String(r.id)) && !r.source_missing_since).length;
  }
  report.missing = report.flagged;

  return send(res, 200, report);
}

export default async function handler(req, res, injected) {
  // injected = { db } — test hook only; Vercel always calls (req, res).
  if (!injected || typeof injected !== 'object') injected = {};
  // ---- Auth: sync key (scheduled runs) OR admin token (CRM button) --------
  let actor = 'Goo-net sync (scheduled)';
  const key = String(req.query?.key || '');
  const expectedKey = process.env.GOONET_SYNC_KEY || '';
  if (!(expectedKey && key && key === expectedKey)) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return send(res, 401, { error: 'Missing sync key. Scheduled runs pass ?key=…, the CRM button signs in.' });
    try {
      const db = adminClient();
      const { data: user } = await db.auth.getUser(token);
      if (!user?.user) return send(res, 401, { error: 'Invalid token' });
      const { data: profile } = await db.from('profiles').select('full_name,role').eq('id', user.user.id).single();
      if (!profile || profile.role !== 'admin') return send(res, 403, { error: 'Admin access required' });
      actor = profile.full_name || user.user.email;
    } catch (e) {
      return send(res, 401, { error: e.message || 'Unauthorized' });
    }
  }

  let db;
  try { db = injected.db || adminClient(); }
  catch (e) { return send(res, 500, { error: e.message, stage: 'database-configuration' }); }
  const start = Date.now();
  const overBudget = () => Date.now() - start > RUN_BUDGET_MS;

  // ---- Machinery nightly pass: ?job=machinery ------------------------------
  // The same function, dispatched on a query param nothing else uses, so the
  // scheduled machinery run costs no extra Serverless Function. It re-reads
  // every machine that came from a link, records any price change, and flags
  // (never deletes) the ones the supplier has taken down.
  if (['machinery', 'machinery-audit'].includes(String(req.query?.job || ''))) {
    try {
      if (req.query.job === 'machinery-audit') {
        const { readMachineryRows, machineryVisibility } = await import('./_machinery.js');
        return send(res, 200, { job: 'machinery-audit', readOnly: true,
          inventory: machineryVisibility(await readMachineryRows(db)) });
      }
      return await machineryJob(db, actor, { overBudget, res });
    } catch (e) {
      console.error('machinery-sync failed', e);
      return send(res, 500, { error: 'Machinery sync failed', details: e.message || 'Unknown error', code: e.code || null,
        hint: ['42P01', '42703', 'PGRST205'].includes(e.code) ? 'Apply the machinery schema migration in supabase/MIGRATION-2026-10-machinery.sql and check schema compatibility.' : 'Check the Vercel function log and Supabase service-role configuration.' });
    }
  }
  const report = {
    page: null, cardsSeen: 0, inserted: 0, updated: 0,
    // Honest pipeline counts: candidates discovered on the page, cards that
    // parsed into real vehicles, cars already in stock, and cars the quality
    // gate refused (each with its reason in `skipped`).
    discovered: 0, alreadyKnown: 0, rejected: 0, cardSource: null,
    delisted: 0, delistedWeekly: 0, promoted: 0,
    // A copy that could not be written (a promotion/delist failure) — its
    // reason is in `skipped`, and the run continued rather than aborting.
    failed: 0,
    // blocked: goo-net answered with its bot-gate stub, so this run read
    // nothing. It must never be dressed up as "caught up".
    blocked: false, bookmarkAdvanced: false, parseMiss: false, diagnostics: null,
    skipped: [], note: null,
    // The AI fallback report (llm: {via, model, extracted, error?}) is only
    // present once an LLM key exists and a run the regex parser could not read
    // asked the LLM to extract the cards. Absent (no key) means the fallback
    // was never called; extracted: 0 means it was tried and found nothing.
    // When it fires, the cards go through the SAME quality gate as regex cards.
    // How the listing page was read ('direct' or 'relay'), and whether the
    // relay runs with an API key. When a blocked report shows
    // relayKey: 'free (no key)', the keyless relay tier is the first suspect
    // — see GOONET-SYNC.md → "The importer is blocked every run".
    via: 'direct', relayKey: relayApiKey() ? 'configured' : 'free (no key)'
  };

  try {
    const s = await settings(db);
    const minPhotos = num(s.goonet_min_photos, 5);
    const minYear = num(s.goonet_min_year, 2000);
    const maxNew = num(s.goonet_max_new_per_run, 6);
    const maxDelistCheck = num(s.goonet_max_delist_per_run, 5);
    const weeklyDelistLimit = num(s.goonet_weekly_delist_limit, 5);
    const weeklyPromoteLimit = num(s.goonet_weekly_promote_limit, 2);
    const autoPromote = bool(s.goonet_auto_promote, true);
    const baseUrl = s.goonet_search_url || DEFAULT_SEARCH_URL;
    const bookmark = Math.max(1, num(s.goonet_bookmark_page, 1));

    // ---- 1. Crawl the bookmarked listing page -----------------------------
    const pageUrl = listingPageUrlFor(baseUrl, bookmark);
    const fetched = await fetchPage(pageUrl, { timeoutMs: 7000 });
    if (!fetched.ok && fetched.status !== 404) {
      return send(res, 502, { error: 'Could not fetch ' + pageUrl + (fetched.error ? ' — ' + fetched.error : '') });
    }
    if (fetched.status === 404) {
      report.note = 'Listing page not found (maybe the search URL changed). Reset the bookmark from CRM → Japan dealer stock.';
      report.page = bookmark;
      await setSetting(db, 'goonet_last_run_at', new Date().toISOString());
      return send(res, 200, report);
    }
    let page = parseListingPage(fetched.html, pageUrl);
    let usedFetch = fetched;

    // Rescue: the bookmarked search can come back (nearly) empty — retry the
    // same bookmark page against a wider, always-populated search.
    if (page.cars.length < 2) {
      const rescueUrl = listingPageUrlFor(FALLBACK_SEARCH_URL, bookmark);
      if (rescueUrl !== pageUrl) {
        const rescue = await fetchPage(rescueUrl, { timeoutMs: 7000 });
        if (rescue.ok) {
          const rescuePage = parseListingPage(rescue.html, rescueUrl);
          if (rescuePage.cars.length > page.cars.length) {
            page = rescuePage;
            usedFetch = rescue;
          }
        }
      }
    }

    if (usedFetch.via === 'relay') {
      report.note = 'goo-net blocked the direct request (bot protection) — page fetched via relay.';
    }

    report.page = bookmark;
    report.cardsSeen = page.cars.length;
    report.via = usedFetch.via || 'direct';

    // ---- Why did we see (almost) no cards? --------------------------------
    // Two unrelated failures look identical in the counts, and telling them
    // apart is the whole point of the report:
    //   • blocked   — goo-net handed back a gate interstitial: no car links to
    //                 read, plus its own wording or a suspiciously small body.
    //   • parseMiss — goo-net handed back a REAL listing page (many car links,
    //                 ~1 MB) but the parser understood almost none of it, i.e.
    //                 the card markup changed. That is our bug, not a blockade.
    let blocked = false;
    let parseMiss = false;
    let thinRunDiag = null;
    report.cardSource = page.diagnostics?.cardSource || null;
    report.discovered = Math.max(
      (page.diagnostics?.domCards || 0) + (page.diagnostics?.structuredCandidates || 0),
      page.cars.length
    );
    if (page.cars.length < 2) {
      const directDiag = fetched.directDiagnostics || pageDiagnostics(fetched.html || '');
      // Diagnostics for the HTML we actually parsed (via relay or rescue
      // search), which is not necessarily what the direct request handed back.
      const finalDiag = pageDiagnostics(usedFetch.html || '', usedFetch.meta || null);
      const rawLinks = Math.max(directDiag.spreadLinks || 0, finalDiag.spreadLinks || 0);
      const gateWords = [...new Set([...(directDiag.gateMarkers || []), ...(finalDiag.gateMarkers || [])])];
      // Size is judged in BYTES now: the gate interstitial is a small body,
      // and a legacy-encoded page decodes to fewer characters than it has
      // bytes, so a character count could under-report a real page.
      const bodyBytes = usedFetch.meta?.byteLength ?? finalDiag.bytes ?? (directDiag.contentLength || 0);
      const thin = bodyBytes < GATE_PAGE_BYTES;
      const relayTried = (fetched.diagnostics && fetched.diagnostics.relayAttempted) === true;
      // A DOM anchor count of 0 with dozens of links is NOT a bot gate: the
      // page was served in full and every link sits in structured data or a
      // script. Say so, because it is a different fix.
      blocked = rawLinks < 2 && (gateWords.length > 0 || thin || usedFetch.via === 'relay');
      parseMiss = !blocked;
      thinRunDiag = {
        pageUrl, sourceUrl: usedFetch.diagnostics?.url || pageUrl,
        bookmarkHeldOn: bookmark, parsedCards: page.cars.length,
        rawCarLinks: rawLinks,
        domCarLinks: finalDiag.domCarLinks ?? 0,
        structuredCars: finalDiag.jsonLdCars ?? 0,
        cardSource: page.diagnostics?.cardSource || 'none',
        directStatus: fetched.status ?? 0,
        directBytes: bodyBytes,
        directChars: finalDiag.chars ?? (usedFetch.html || '').length,
        charset: finalDiag.charset || null,
        charsetSource: finalDiag.charsetSource || null,
        contentType: finalDiag.contentType || '',
        replacements: finalDiag.replacements || 0,
        directMarkers: directDiag.markers || [],
        gateMarkers: gateWords, relayAttempted: relayTried, relayUsed: usedFetch.via === 'relay',
        rescueUsed: usedFetch !== fetched, finalStub: finalDiag.stub === true
      };

      // Evidence pipeline: store a bounded slice of the exact markup goo-net
      // served this run — anchored on a real DOM car card whenever there is
      // one, with the structured data named explicitly when there is not —
      // plus the charset/byte facts. The CRM surfaces it via "Copy parser
      // diagnostic" (GET /api/goonet-stock?action=diag).
      try {
        await setSetting(db, 'goonet_parsemiss_sample', JSON.stringify(buildParserDiagnostic({
          html: usedFetch.html || '',
          page: pageUrl,
          source: usedFetch.diagnostics?.url || pageUrl,
          via: usedFetch.via || 'direct',
          run: blocked ? 'blocked' : 'parseMiss',
          meta: usedFetch.meta || null
        })));
      } catch (e) { console.error('goonet evidence save failed', e.message); }
    } else {
      // A clean read (2+ cards by the regex parser) means the last stored
      // diagnostic is stale — drop it so nobody copies an old sample.
      try { await db.from('site_settings').delete().eq('key', 'goonet_parsemiss_sample'); } catch { /* evidence is best-effort */ }
    }

    // ---- AI fallback: a REAL page the regex parser could not read ---------
    // With GEMINI_API_KEY (or OPENAI_API_KEY) the LLM extracts the cards
    // (strict JSON schema) and they flow into the normal import loop below —
    // same detail fetch, same quality gate, same required fields. No key →
    // never called; the run keeps its honest parseMiss report.
    let llmUsed = false;
    if (parseMiss && llmConfigured() && !overBudget()) {
      const llm = await extractCardsWithLlm(usedFetch.html, { baseUrl: pageUrl, timeoutMs: 25000 });
      if (llm.cards.length > 0) {
        llmUsed = true;
        report.llm = { via: llm.via, model: llm.model, extracted: llm.cards.length };
        page = {
          cars: llm.cards,
          pagination: page.pagination,
          diagnostics: { parseStatus: 'llm_fallback', cardCount: llm.cards.length, fallbackTemplate: false }
        };
        report.cardsSeen = llm.cards.length;
      } else {
        report.llm = { via: llm.via, model: llm.model, extracted: 0, error: llm.error || 'no cards extracted' };
      }
    }

    // ---- 2. Import new cars that pass the quality gate --------------------
    const known = await getKnownIds(db);
    const importStart = Date.now();
    const overImportBudget = () => overBudget() || Date.now() - importStart > IMPORT_BUDGET_MS;
    let imported = 0;
    for (const card of page.cars) {
      if (overImportBudget() || imported >= maxNew) break;
      if (known.has(String(card.goonet_id))) { report.alreadyKnown++; continue; }
      const blocked = await isBlocked(db, card.goonet_id);
      if (blocked) {
        report.rejected++;
        report.skipped.push(`${card.stock_no}: blocked (previously deleted)`);
        continue;
      }

      // Fetch the detail page: full gallery + specs drive the quality gate.
      // A card whose <h3> title link did not parse has no `url`, but its stock
      // id is enough to rebuild the canonical detail URL — without this the car
      // was skipped as "detail fetch failed" even though goo-net had it.
      const detailUrl = card.url || detailUrlFor(card.goonet_id);
      if (!detailUrl) { report.rejected++; report.skipped.push(`${card.stock_no}: no usable detail URL`); continue; }
      const detailFetched = await fetchPage(detailUrl, { timeoutMs: 5000, purpose: 'detail' });
      let car = card;
      if (detailFetched.ok) {
        car = mergeCardAndDetail(card, parseDetailPage(detailFetched.html, card.url));
      } else {
        report.rejected++;
        report.skipped.push(`${card.stock_no}: detail fetch failed`);
        continue;
      }
      const q = qualityScore(car, { minPhotos, minYear });
      if (!q.pass) {
        report.rejected++;
        report.skipped.push(`${card.stock_no} ${car.make || ''} ${car.model || ''} (${q.reasons.join(', ')})`);
        continue;
      }

      // Verify at least the configured minimum number of images exist.
      // This gate must follow `minPhotos` (site setting or its default) —
      // a hardcoded 8 here used to re-impose a stricter rule than the
      // quality gate and reject cars even when the operator lowered
      // goonet_min_photos in the CRM.
      if (!car.images || car.images.length < minPhotos) {
        report.rejected++;
        report.skipped.push(`${card.stock_no}: only ${car.images?.length || 0} images (need ${minPhotos}+)`);
        continue;
      }

      // Verify all required fields
      const requiredFields = ['make', 'model', 'year', 'price_jpy', 'km', 'fuel', 'body'];
      const missingFields = requiredFields.filter(f => !car[f] || car[f] === 'Unknown' || car[f] === '');
      if (missingFields.length > 0) {
        report.rejected++;
        report.skipped.push(`${card.stock_no}: missing fields: ${missingFields.join(', ')}`);
        continue;
      }

      const now = new Date().toISOString();
      const row = {
        goonet_id: String(card.goonet_id),
        stock_no: card.stock_no || card.goonet_id,
        make: car.make || 'Unknown', model: car.model || 'Car',
        year: car.year, km: car.km, fuel: car.fuel, body: car.body,
        price_jpy: car.price_jpy, price_usd: car.price_usd, price: car.price,
        image: car.image, images: car.images,
        grade: car.grade, status: 'New Arrival', location: car.location || 'Japan',
        tr: car.tr, drv: car.drv, eng: car.eng, seats: car.seats,
        col: car.col, st: car.st,
        vendor: 'Goo-net', goonet_url: detailUrl,
        photo_count: car.photo_count || (car.images || []).length,
        quality_score: q.score,
        available: true, promoted: 'none',
        imported_at: now, last_seen_at: now, updated_at: now
      };
      const { error } = await db.from('japan_dealer_stock').insert(row);
      if (!error) { imported++; known.add(String(card.goonet_id)); }
      else if (!/duplicate/i.test(error.message)) { report.rejected++; report.skipped.push(`${card.stock_no}: ${error.message}`); }
    }
    report.inserted = imported;

    // Advance the bookmark so the next run crawls the next page.
    //
    // Only advance when the page yielded a real listing (2+ cards). A bot-gate
    // stub parses as 1 card, and 1 is truthy — advancing on it silently walked
    // the crawler past every page it never read, so a blocked day could skip
    // hundreds of cars while reporting a clean run. Re-reading a page is
    // harmless; skipping one loses stock.
    // An AI-fallback run read the page through the LLM, not the parser — the
    // parser may still be missing cards beyond the extraction window, so the
    // bookmark stays held exactly like a plain parse miss.
    const advance = page.cars.length >= 2 && !llmUsed;
    const nextBookmark = advance ? bookmark + 1 : bookmark;
    await setSetting(db, 'goonet_bookmark_page', String(nextBookmark));
    await setSetting(db, 'goonet_last_run_at', new Date().toISOString());
    report.bookmarkAdvanced = advance;

    if (blocked) {
      // Be honest: this run read nothing. Do not call it "caught up".
      report.blocked = true;
      const relayTried = thinRunDiag.relayAttempted;
      report.note = 'goo-net is bot-gating this host: the listing page came back as a stub ('
        + page.cars.length + ' card' + (page.cars.length === 1 ? '' : 's') + ', no car links to read)'
        + (relayTried ? ', and the relay could not read more of it either' : '')
        + '. The bookmark was held on page ' + bookmark + ' so no pages were skipped — '
        + 'retry later, or point goonet_search_url at a search this host can read.';
      report.diagnostics = thinRunDiag;
      // Steps 3–5 are skipped on purpose: a run that read nothing must not
      // mutate the catalogue. The delist check re-reads detail pages from the
      // same gated host, and the weekly sweep would delist or promote cars
      // based on a day when goo-net answered with nothing but a stub.
      return send(res, 200, report);
    }

    if (parseMiss) {
      // We reached goo-net and it answered properly — the importer is the one
      // that could not read the answer. Say so, and keep doing the rest of the
      // run's work (delist checks and weekly maintenance do not depend on the
      // listing parser), but hold the bookmark: crawling on while blind would
      // skip pages exactly like the old bug did.
      report.parseMiss = true;
      if (report.llm && report.llm.extracted > 0) {
        // Self-heal worked: name it so the owner sees the import happened and
        // knows the regex parser still needs the markup fix (the saved sample
        // backs it up).
        report.note = 'The card parser could not read the current goo-net markup ('
          + thinRunDiag.rawCarLinks + ' car links, ' + thinRunDiag.directBytes + ' bytes) — '
          + 'AI fallback (' + report.llm.via + ') extracted ' + report.llm.extracted
          + ' card(s) from the live page and ran them through the normal quality gate. '
          + 'The bookmark was held on page ' + bookmark + '; press "Copy parser diagnostic" '
          + 'to get the saved markup sample for the parser fix.';
      } else {
        const readCount = report.llm ? 0 : page.cars.length;
        const why = thinRunDiag.domCarLinks < 2
          ? ' Every car link on the page is inside structured data or a script (' + thinRunDiag.structuredCars
            + ' ItemList entries, ' + thinRunDiag.domCarLinks + ' markup anchors) — the card markup or the '
            + 'link shape changed, so this is a parser fix, not a bot block.'
          : ' The page linked ' + thinRunDiag.domCarLinks + ' cars in markup but no card region parsed'
            + ' — the card markup changed, so this is a parser fix, not a bot block.';
        report.note = 'Goo-net returned a real listing page (' + thinRunDiag.rawCarLinks
          + ' distinct car links, ' + thinRunDiag.directBytes + ' bytes, charset '
          + (thinRunDiag.charset || 'unknown') + ' from ' + (thinRunDiag.charsetSource || 'n/a') + ') but the importer only read '
          + readCount + ' card' + (readCount === 1 ? '' : 's') + '.' + why
          + (report.llm ? ' The AI fallback was tried but extracted no usable cards (' + report.llm.error + '). ' : ' ')
          + 'The bookmark was held on page ' + bookmark + ' so no pages were skipped; '
          + 'press "Copy parser diagnostic" for the saved markup sample.';
      }
      report.diagnostics = thinRunDiag;
    }

    // ---- 3. Delist check on a few existing cars ---------------------------
    if (!overBudget()) {
      const { data: checkRows } = await db.from('japan_dealer_stock')
        .select('*').eq('available', true).order('last_seen_at', { ascending: true })
        .limit(maxDelistCheck);
      for (const row of checkRows || []) {
        if (overBudget()) break;
        const url = row.goonet_url || detailUrlFor(row.goonet_id);
        if (!url) continue;
        const d = await fetchPage(url, { timeoutMs: 4000, allowRelay: false });
        if (isDelistedPage(d)) {
          if (await carryOn(report, delistCar(db, row, actor), row)) report.delisted++;
        } else if (d.ok) {
          await db.from('japan_dealer_stock').update({ last_seen_at: new Date().toISOString() }).eq('id', row.id);
        }
      }
    }

    // ---- 4. Weekly maintenance: delist a FEW older cars -------------------
    const lastWeeklyDelist = s.goonet_last_weekly_delist ? Date.parse(s.goonet_last_weekly_delist) : 0;
    if (!overBudget() && Date.now() - lastWeeklyDelist > WEEK_MS) {
      const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const { data: oldCars } = await db.from('japan_dealer_stock')
        .select('*').eq('available', true).lt('imported_at', cutoff)
        .order('quality_score', { ascending: true }).limit(weeklyDelistLimit);
      for (const row of oldCars || []) {
        if (overBudget()) break;
        if (await carryOn(report, delistCar(db, row, actor + ' (weekly maintenance)'), row)) report.delistedWeekly++;
      }
      await setSetting(db, 'goonet_last_weekly_delist', new Date().toISOString());
    }

    // ---- 5. Weekly maintenance: promote a FEW fresh cars to the website ---
    const lastWeeklyPromote = s.goonet_last_weekly_promote ? Date.parse(s.goonet_last_weekly_promote) : 0;
    if (!overBudget() && autoPromote && Date.now() - lastWeeklyPromote > WEEK_MS) {
      const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
      const { data: fresh } = await db.from('japan_dealer_stock')
        .select('*').eq('available', true).eq('promoted', 'none')
        .gte('imported_at', since).order('quality_score', { ascending: false })
        .limit(weeklyPromoteLimit);
      for (const row of fresh || []) {
        if (overBudget()) break;
        if (await carryOn(report, promoteToListings(db, row, actor + ' (weekly auto-promote)'), row)) report.promoted++;
      }
      await setSetting(db, 'goonet_last_weekly_promote', new Date().toISOString());
    }

    if (!report.note && report.cardSource === 'structured') {
      report.note = 'Read the listing page through its structured data (' + report.cardsSeen
        + ' ItemList candidate' + (report.cardsSeen === 1 ? '' : 's') + '): no markup car anchors could be '
        + 'used, so every candidate was verified against its own detail page before the quality gate.';
    }
    report.note = report.note || (report.inserted === 0 && report.delisted === 0 && report.promoted === 0
      ? 'Nothing new this run — the importer is caught up or still quality-gating.'
        + (report.alreadyKnown ? ' ' + report.alreadyKnown + ' car(s) were already in stock.' : '') : null);
    return send(res, 200, report);
  } catch (e) {
    console.error('goonet-sync failed', e);
    return send(res, 500, { error: e.message || 'Sync failed' });
  }
}
