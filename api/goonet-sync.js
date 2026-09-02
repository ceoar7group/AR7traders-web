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
//     gate (8+ photos, model year, price and EVERY required field — see
//     qualityScore in scripts/goonet-core.mjs; the photo/year limits are
//     configurable in the CRM, never below the hard floor)
//   • never re-imports a car that was deleted: every deletion (CRM button,
//     cleanup script, SQL) records the goo-net id in `goonet_blocklist`, and
//     the import loop skips anything on that list
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
  pageDiagnostics, isGenericModel, DEFAULT_SEARCH_URL, FALLBACK_SEARCH_URL,
  DEFAULT_MIN_PHOTOS, DEFAULT_MIN_YEAR, REQUIRED_FIELDS
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
// A bot-gate interstitial is a few KB; a real goo-net listing page is ~1 MB.
// Used only to name the cause when a page has no car links to read.
const GATE_PAGE_BYTES = 64_000;

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

// ---- Blocklist: cars that must never come back -----------------------------
// `goonet_blocklist(goonet_id primary key, stock_no, reason, blocked_at)`.
// A deleted car used to reappear on the next run because the importer only
// checked "is this id in japan_dealer_stock right now?" — and after a delete
// it was not. The blocklist is the permanent memory of every deletion.
export async function isBlocked(db, goonetId) {
  const { data } = await db.from('goonet_blocklist')
    .select('goonet_id')
    .eq('goonet_id', String(goonetId))
    .maybeSingle();
  return !!data;
}

// One round-trip for the whole run (the per-id check above stays available
// for callers that only have one id). Falls back to an empty set when the
// table does not exist yet, so a database that has not run the SQL still
// imports — it just cannot remember deletions until it does.
export async function getBlockedIds(db) {
  try {
    const { data, error } = await db.from('goonet_blocklist').select('goonet_id');
    if (error) return { ids: new Set(), available: false, error: error.message };
    return { ids: new Set((data || []).map(r => String(r.goonet_id))), available: true };
  } catch (e) {
    return { ids: new Set(), available: false, error: e.message };
  }
}

export async function blockCar(db, { goonet_id, stock_no, reason }) {
  if (!goonet_id) return { error: 'goonet_id is required' };
  try {
    const { error } = await db.from('goonet_blocklist').upsert({
      goonet_id: String(goonet_id),
      stock_no: stock_no || null,
      reason: reason || 'Deleted',
      blocked_at: new Date().toISOString()
    }, { onConflict: 'goonet_id' });
    return { error: error ? error.message : null };
  } catch (e) {
    return { error: e.message };
  }
}

// The CRM can raise these limits, never lower them below the floor: the whole
// point of the rebuild is that a 1-photo car cannot get in by editing a
// setting.
const MIN_PHOTOS_FLOOR = DEFAULT_MIN_PHOTOS;   // 8
const MIN_YEAR_FLOOR = DEFAULT_MIN_YEAR;       // 2000

// Every rule the importer applies AFTER the detail page was read. Exported so
// the CLI runner and the tests apply exactly the same checks.
export function importVerdict(car, { minPhotos = MIN_PHOTOS_FLOOR, minYear = MIN_YEAR_FLOOR } = {}) {
  const q = qualityScore(car, { minPhotos, minYear });
  const problems = [...q.reasons.filter(r => q.hardReasons.includes(r))];
  // Belt and braces — the gate already enforces these, but the import row is
  // built from `car`, so verify the exact values that will be written.
  const images = (car.images || []).filter(Boolean);
  if (images.length < minPhotos) problems.push(`only ${images.length} images (need ${minPhotos}+)`);
  const missing = REQUIRED_FIELDS.filter(f => !car[f] || car[f] === 'Unknown' || String(car[f]).trim() === '');
  if (missing.length) problems.push(`missing fields: ${missing.join(', ')}`);
  if (isGenericModel(car.model, car.make)) problems.push(`generic heading "${car.model || ''}"`);
  if (!car.stock_no && !car.goonet_id) problems.push('no stock number');
  return { ok: problems.length === 0, score: q.score, problems: [...new Set(problems)], photo_count: images.length };
}

// A goo-net car that no longer exists → remove it from the site too.
export async function delistCar(db, row, actor = 'Goo-net sync') {
  const now = new Date().toISOString();
  await db.from('japan_dealer_stock')
    .update({ available: false, delisted_at: now, updated_at: now })
    .eq('id', row.id);

  // If the same car was promoted to the website, hide that listing as well
  // (reversible — re-publish from CRM → Website cars any time).
  if (String(row.promoted || '').includes('listings') && row.stock_no) {
    const { data: listing } = await db.from('site_listings').select('id,published').eq('stock_no', row.stock_no).maybeSingle();
    if (listing && listing.published !== false) {
      await db.from('site_listings').update({ published: false, updated_at: now }).eq('id', listing.id);
    }
  }
  try {
    await db.from('activities').insert({
      action: `Delisted ${row.make} ${row.model} (${row.stock_no}) from Goo-net — hidden from website`,
      actor, entity_type: 'japan_dealer_stock', entity_id: row.id
    });
  } catch (e) { console.error('activity log failed', e.message); }
}

export async function promoteToListings(db, row, actor = 'Goo-net sync') {
  const now = new Date().toISOString();
  const listing = {
    stock_no: row.stock_no || row.goonet_id,
    make: row.make, model: row.model, year: row.year, km: row.km,
    fuel: row.fuel || 'Petrol', body: row.body || 'SUV',
    price: row.price || (row.price_usd ? '$' + Math.round(row.price_usd).toLocaleString('en-US') : '$15,000'),
    image: row.image, images: row.images,
    grade: row.grade || '4.0', status: 'In Stock', location: row.location || 'Japan',
    tr: row.tr, drv: row.drv, eng: row.eng, seats: row.seats, col: row.col, st: row.st,
    published: true, updated_at: now
  };
  const { data: existing } = await db.from('site_listings').select('id,sort_order').eq('stock_no', listing.stock_no).maybeSingle();
  if (existing) {
    listing.sort_order = existing.sort_order;
    await db.from('site_listings').update(listing).eq('id', existing.id);
  } else {
    const { data: maxRow } = await db.from('site_listings').select('sort_order').order('sort_order', { ascending: false }).limit(1).maybeSingle();
    listing.sort_order = (maxRow?.sort_order || 12) + 1; // keep positions 1–12 as the showroom
    await db.from('site_listings').insert(listing);
  }
  await db.from('japan_dealer_stock')
    .update({ promoted: String(row.promoted || '').includes('vehicles') ? 'both' : 'listings', updated_at: now })
    .eq('id', row.id);
  try {
    await db.from('activities').insert({
      action: `Promoted ${row.make} ${row.model} (${row.stock_no}) to the public website`,
      actor, entity_type: 'japan_dealer_stock', entity_id: row.id
    });
  } catch (e) { console.error('activity log failed', e.message); }
}

export async function promoteToInventory(db, row, actor = 'Goo-net sync') {
  const now = new Date().toISOString();
  const vehicle = {
    stock_no: row.stock_no || row.goonet_id,
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
  const { data: existing } = await db.from('vehicles').select('id').eq('stock_no', vehicle.stock_no).maybeSingle();
  if (existing) {
    await db.from('vehicles').update(vehicle).eq('id', existing.id);
  } else {
    await db.from('vehicles').insert(vehicle);
  }
  await db.from('japan_dealer_stock')
    .update({ promoted: String(row.promoted || '').includes('listings') ? 'both' : 'vehicles', updated_at: now })
    .eq('id', row.id);
  try {
    await db.from('activities').insert({
      action: `Promoted ${row.make} ${row.model} (${row.stock_no}) to CRM inventory`,
      actor, entity_type: 'japan_dealer_stock', entity_id: row.id
    });
  } catch (e) { console.error('activity log failed', e.message); }
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

  const db = injected.db || adminClient();
  const start = Date.now();
  const overBudget = () => Date.now() - start > RUN_BUDGET_MS;
  const report = {
    page: null, cardsSeen: 0, inserted: 0, updated: 0,
    delisted: 0, delistedWeekly: 0, promoted: 0,
    // blocked: goo-net answered with its bot-gate stub, so this run read
    // nothing. It must never be dressed up as "caught up".
    blocked: false, bookmarkAdvanced: false, parseMiss: false, diagnostics: null,
    // Cars skipped because they were deleted before (goonet_blocklist).
    blockedSkipped: 0, blocklistAvailable: true,
    rules: { minPhotos: null, minYear: null, requiredFields: REQUIRED_FIELDS },
    skipped: [], note: null
  };

  try {
    const s = await settings(db);
    // Minimum 8 photos, not 5 — and a CRM value below the floor is ignored.
    const minPhotos = Math.max(MIN_PHOTOS_FLOOR, num(s.goonet_min_photos, MIN_PHOTOS_FLOOR));
    const minYear = Math.max(MIN_YEAR_FLOOR, num(s.goonet_min_year, MIN_YEAR_FLOOR));
    const maxNew = num(s.goonet_max_new_per_run, 6);
    const maxDelistCheck = num(s.goonet_max_delist_per_run, 5);
    const weeklyDelistLimit = num(s.goonet_weekly_delist_limit, 5);
    const weeklyPromoteLimit = num(s.goonet_weekly_promote_limit, 2);
    const autoPromote = bool(s.goonet_auto_promote, true);
    const baseUrl = s.goonet_search_url || DEFAULT_SEARCH_URL;
    const bookmark = Math.max(1, num(s.goonet_bookmark_page, 1));
    report.rules.minPhotos = minPhotos;
    report.rules.minYear = minYear;

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
    if (page.cars.length < 2) {
      const directDiag = fetched.directDiagnostics || pageDiagnostics(fetched.html || '');
      // Diagnostics for the HTML we actually parsed (via relay or rescue
      // search), which is not necessarily what the direct request handed back.
      const finalDiag = pageDiagnostics(usedFetch.html || '');
      const rawLinks = Math.max(directDiag.spreadLinks || 0, finalDiag.spreadLinks || 0);
      const gateWords = [...new Set([...(directDiag.gateMarkers || []), ...(finalDiag.gateMarkers || [])])];
      const thin = (directDiag.contentLength || 0) < GATE_PAGE_BYTES;
      const relayTried = (fetched.diagnostics && fetched.diagnostics.relayAttempted) === true;
      blocked = rawLinks < 2 && (gateWords.length > 0 || thin || usedFetch.via === 'relay');
      parseMiss = !blocked;
      thinRunDiag = {
        pageUrl, bookmarkHeldOn: bookmark, parsedCards: page.cars.length,
        rawCarLinks: rawLinks, directStatus: fetched.status ?? 0,
        directBytes: directDiag.contentLength ?? 0, directMarkers: directDiag.markers || [],
        gateMarkers: gateWords, relayAttempted: relayTried, relayUsed: usedFetch.via === 'relay',
        rescueUsed: usedFetch !== fetched, finalStub: finalDiag.stub === true
      };
    }

    // ---- 2. Import new cars that pass the quality gate --------------------
    const known = await getKnownIds(db);
    const blocklist = await getBlockedIds(db);
    report.blocklistAvailable = blocklist.available;
    if (!blocklist.available) {
      report.note = (report.note ? report.note + ' ' : '')
        + 'goonet_blocklist table is missing — run supabase/SETUP-EVERYTHING.sql so deleted cars stay deleted.';
    }
    const importStart = Date.now();
    const overImportBudget = () => overBudget() || Date.now() - importStart > IMPORT_BUDGET_MS;
    let imported = 0;
    for (const card of page.cars) {
      if (overImportBudget() || imported >= maxNew) break;
      const gid = String(card.goonet_id || '');
      if (!gid || !card.stock_no) { report.skipped.push(`${gid || '?'}: no stock number`); continue; }
      if (known.has(gid)) continue;

      // Previously deleted (CRM delete, cleanup script, SQL) → never again.
      const blocked = blocklist.ids.has(gid);
      if (blocked) {
        report.blockedSkipped++;
        report.skipped.push(`${card.stock_no}: blocked (previously deleted)`);
        continue;
      }

      // Fetch the detail page: full gallery + specs drive the quality gate.
      // A card whose <h3> title link did not parse has no `url`, but its stock
      // id is enough to rebuild the canonical detail URL — without this the car
      // was skipped as "detail fetch failed" even though goo-net had it.
      const detailUrl = card.url || detailUrlFor(card.goonet_id);
      if (!detailUrl) { report.skipped.push(`${card.stock_no}: no usable detail URL`); continue; }
      const detailFetched = await fetchPage(detailUrl, { timeoutMs: 5000 });
      if (!detailFetched.ok) {
        report.skipped.push(`${card.stock_no}: detail fetch failed`);
        continue;
      }
      // goo-net answers 404 / "listed until …" for a car that is already gone
      // — it must not be imported just because the listing page still had it.
      if (isDelistedPage(detailFetched)) {
        report.skipped.push(`${card.stock_no}: already delisted on goo-net`);
        continue;
      }
      const car = mergeCardAndDetail(card, parseDetailPage(detailFetched.html, detailUrl));

      // ---- Quality gate: 8+ photos, valid year/price, every required field,
      // a real make/model heading, no card/detail mismatch (importVerdict) ----
      const q = importVerdict(car, { minPhotos, minYear });
      if (!q.ok) {
        report.skipped.push(`${card.stock_no} ${car.make || ''} ${car.model || ''} (${q.problems.join(', ')})`);
        continue;
      }

      const now = new Date().toISOString();
      const row = {
        goonet_id: gid,
        stock_no: card.stock_no || gid,
        make: car.make, model: car.model,
        year: car.year, km: car.km, fuel: car.fuel, body: car.body,
        price_jpy: car.price_jpy, price_usd: car.price_usd, price: car.price,
        image: car.image || car.images[0], images: car.images,
        grade: car.grade, status: 'New Arrival', location: car.location || 'Japan',
        tr: car.tr, drv: car.drv, eng: car.eng, seats: car.seats,
        col: car.col, st: car.st,
        vendor: 'Goo-net', goonet_url: detailUrl,
        photo_count: car.images.length,
        quality_score: q.score,
        available: true, promoted: 'none',
        imported_at: now, last_seen_at: now, updated_at: now
      };
      const { error } = await db.from('japan_dealer_stock').insert(row);
      if (!error) { imported++; known.add(gid); }
      else if (!/duplicate/i.test(error.message)) report.skipped.push(`${card.stock_no}: ${error.message}`);
    }
    report.inserted = imported;

    // Advance the bookmark so the next run crawls the next page.
    //
    // Only advance when the page yielded a real listing (2+ cards). A bot-gate
    // stub parses as 1 card, and 1 is truthy — advancing on it silently walked
    // the crawler past every page it never read, so a blocked day could skip
    // hundreds of cars while reporting a clean run. Re-reading a page is
    // harmless; skipping one loses stock.
    const advance = page.cars.length >= 2;
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
      report.note = 'Goo-net returned a real listing page (' + thinRunDiag.rawCarLinks
        + ' car links, ' + thinRunDiag.directBytes + ' bytes) but the importer only read '
        + page.cars.length + ' card' + (page.cars.length === 1 ? '' : 's')
        + ' — the card markup has changed, so this is a parser fix, not a bot block. '
        + 'The bookmark was held on page ' + bookmark + ' so no pages were skipped; '
        + 'update parseCard in scripts/goonet-core.mjs (GOONET-SYNC.md → "Parser says no cards").';
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
          await delistCar(db, row, actor);
          report.delisted++;
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
        await delistCar(db, row, actor + ' (weekly maintenance)');
        report.delistedWeekly++;
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
        await promoteToListings(db, row, actor + ' (weekly auto-promote)');
        report.promoted++;
      }
      await setSetting(db, 'goonet_last_weekly_promote', new Date().toISOString());
    }

    report.note = report.note || (report.inserted === 0 && report.delisted === 0 && report.promoted === 0
      ? 'Nothing new this run — the importer is caught up or still quality-gating.' : null);
    return send(res, 200, report);
  } catch (e) {
    console.error('goonet-sync failed', e);
    return send(res, 500, { error: e.message || 'Sync failed' });
  }
}
