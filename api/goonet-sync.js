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
//   • crawls ONE goo-net listing page (bookmarked, resumes next run)
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
  DEFAULT_SEARCH_URL
} from '../scripts/goonet-core.mjs';

export const config = { maxDuration: 60 };

const TIME_BUDGET_MS = 8000;      // stay well inside Vercel Hobby's 10s cap
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
  const overBudget = () => Date.now() - start > TIME_BUDGET_MS;
  const report = {
    page: null, cardsSeen: 0, inserted: 0, updated: 0,
    delisted: 0, delistedWeekly: 0, promoted: 0,
    skipped: [], note: null
  };

  try {
    const s = await settings(db);
    const minPhotos = num(s.goonet_min_photos, 8);
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
    const page = parseListingPage(fetched.html, pageUrl);
    report.page = bookmark;
    report.cardsSeen = page.cars.length;

    // ---- 2. Import new cars that pass the quality gate --------------------
    const known = await getKnownIds(db);
    let imported = 0;
    for (const card of page.cars) {
      if (overBudget() || imported >= maxNew) break;
      if (known.has(String(card.goonet_id))) continue;

      // Fetch the detail page: full gallery + specs drive the quality gate.
      const detailFetched = await fetchPage(card.url, { timeoutMs: 5000 });
      let car = card;
      if (detailFetched.ok) {
        car = mergeCardAndDetail(card, parseDetailPage(detailFetched.html, card.url));
      } else {
        report.skipped.push(`${card.stock_no}: detail fetch failed`);
        continue;
      }
      const q = qualityScore(car, { minPhotos });
      if (!q.pass) {
        report.skipped.push(`${card.stock_no} ${car.make || ''} ${car.model || ''} (${q.reasons.join(', ')})`);
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
        vendor: 'Goo-net', goonet_url: card.url,
        photo_count: car.photo_count || (car.images || []).length,
        quality_score: q.score,
        available: true, promoted: 'none',
        imported_at: now, last_seen_at: now, updated_at: now
      };
      const { error } = await db.from('japan_dealer_stock').insert(row);
      if (!error) { imported++; known.add(String(card.goonet_id)); }
      else if (!/duplicate/i.test(error.message)) report.skipped.push(`${card.stock_no}: ${error.message}`);
    }
    report.inserted = imported;

    // Advance the bookmark so the next run crawls the next page. Only advance
    // when we actually saw cards (a parse miss on the same page would spin).
    const nextBookmark = (page.cars.length ? bookmark + 1 : bookmark);
    await setSetting(db, 'goonet_bookmark_page', String(nextBookmark));
    await setSetting(db, 'goonet_last_run_at', new Date().toISOString());

    // ---- 3. Delist check on a few existing cars ---------------------------
    if (!overBudget()) {
      const { data: checkRows } = await db.from('japan_dealer_stock')
        .select('*').eq('available', true).order('last_seen_at', { ascending: true })
        .limit(maxDelistCheck);
      for (const row of checkRows || []) {
        if (overBudget()) break;
        const url = row.goonet_url || detailUrlFor(row.goonet_id);
        if (!url) continue;
        const d = await fetchPage(url, { timeoutMs: 4000 });
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
