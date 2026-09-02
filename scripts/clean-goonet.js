#!/usr/bin/env node
// One-off (re-runnable) cleanup of bad Goo-net imports.
//
//   SUPABASE_URL="https://xxx.supabase.co" \
//   SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
//   node scripts/clean-goonet.js [--dry-run] [--min-photos 8] [--keep-copies]
//
//   --dry-run       list what would be blocked/deleted, change nothing
//   --min-photos N  photo threshold (default 8 — the importer's floor)
//   --keep-copies   do NOT delete the website (site_listings) / CRM
//                   inventory (vehicles) copies promoted from the bad cars
//
// For every car in japan_dealer_stock that has fewer than N photos, or is
// missing make / model / year / price, or carries a placeholder heading
// ("Unknown", "Car", "Used Car"), the script:
//   1. adds its goo-net id to goonet_blocklist (so the importer never brings
//      it back — this is what stops "deleted cars re-uploading"),
//   2. deletes it from japan_dealer_stock,
//   3. deletes the copies promoted to site_listings / vehicles (same stock no.).
//
// The rules are evaluated here in Node on the rows themselves rather than in
// a PostgREST filter: PostgREST cannot call jsonb_array_length() inside
// .or(), so a filter like `jsonb_array_length(images).lt.8` is rejected and
// nothing would be cleaned. The SQL equivalent is supabase/goonet-cleanup.sql.
import { adminClient } from '../api/_supabase.js';
import { isGenericModel, DEFAULT_MIN_PHOTOS, DEFAULT_MIN_YEAR } from './goonet-core.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const keepCopies = args.includes('--keep-copies');
const minPhotosArg = args.includes('--min-photos') ? Number(args[args.indexOf('--min-photos') + 1]) : DEFAULT_MIN_PHOTOS;
const minPhotos = Number.isFinite(minPhotosArg) && minPhotosArg > 0 ? Math.round(minPhotosArg) : DEFAULT_MIN_PHOTOS;

// Why a row is bad, or null when it is fine. Exported for the test.
export function badReason(car, { minPhotos: min = DEFAULT_MIN_PHOTOS, minYear = DEFAULT_MIN_YEAR } = {}) {
  const gallery = Array.isArray(car.images) ? car.images.filter(Boolean) : [];
  const photos = Math.min(Number(car.photo_count) || 0, gallery.length);
  if (photos < min) return `Cleanup: only ${photos} photos (<${min})`;
  if (!car.make || !String(car.make).trim() || car.make === 'Unknown') return `Cleanup: missing make (make:${car.make})`;
  if (!car.model || !String(car.model).trim() || isGenericModel(car.model, car.make)) return `Cleanup: generic/missing model (model:${car.model})`;
  const year = Number(car.year);
  if (!Number.isInteger(year) || year < minYear) return `Cleanup: missing/old year (year:${car.year})`;
  const price = Number(car.price_jpy);
  if (!(price > 0)) {
    const usd = Number(car.price_usd);
    if (!(usd > 0)) return `Cleanup: missing price (price_jpy:${car.price_jpy}, price_usd:${car.price_usd})`;
  }
  return null;
}

const chunk = (arr, n) => Array.from({ length: Math.ceil(arr.length / n) }, (_, i) => arr.slice(i * n, i * n + n));

export async function cleanup(db, { dryRun: dry = false, minPhotos: min = DEFAULT_MIN_PHOTOS, keepCopies: keep = false, log = console.log } = {}) {
  log(`Starting Goo-net cleanup… (rule: ${min}+ photos, model year ${DEFAULT_MIN_YEAR}+, complete make/model/price)${dry ? ' — DRY RUN' : ''}`);

  // 0. The blocklist must exist, otherwise deleted cars just come back.
  const probe = await db.from('goonet_blocklist').select('goonet_id').limit(1);
  if (probe.error) {
    throw new Error(`goonet_blocklist is missing (${probe.error.message}). Run supabase/goonet-cleanup.sql or SETUP-EVERYTHING.sql first.`);
  }

  // 1. Read every car (only the columns the rules need).
  const all = [];
  const pageSize = 1000;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await db.from('japan_dealer_stock')
      .select('id, goonet_id, stock_no, make, model, year, price_jpy, price_usd, photo_count, images, promoted')
      .order('imported_at', { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw new Error(`Could not read japan_dealer_stock: ${error.message}`);
    all.push(...(data || []));
    if (!data || data.length < pageSize) break;
  }
  log(`Checked ${all.length} imported cars`);

  // 2. Apply the rules.
  const bad = [];
  for (const car of all) {
    const reason = badReason(car, { minPhotos: min });
    if (reason) bad.push({ ...car, reason });
  }
  const byPhotos = bad.filter(c => c.reason.includes('photos')).length;
  log(`Found ${byPhotos} cars with insufficient photos`);
  log(`Found ${bad.length - byPhotos} cars with missing/incorrect details`);
  for (const c of bad) log(`  – ${c.stock_no || c.goonet_id}  ${c.make || '?'} ${c.model || ''}  →  ${c.reason}`);

  const summary = { checked: all.length, bad: bad.length, blocked: 0, deleted: 0, listingsRemoved: 0, vehiclesRemoved: 0, dryRun: dry };
  if (!bad.length) { log('Nothing to clean — every imported car meets the rules.'); return summary; }
  if (dry) { log(`DRY RUN — would block and delete ${bad.length} cars. Re-run without --dry-run to apply.`); return summary; }

  // 3. Block first (so a crash between steps still leaves them blocked).
  const now = new Date().toISOString();
  for (const part of chunk(bad, 200)) {
    const rows = part.filter(c => c.goonet_id).map(c => ({
      goonet_id: String(c.goonet_id), stock_no: c.stock_no || null, reason: c.reason, blocked_at: now
    }));
    const { error } = await db.from('goonet_blocklist').upsert(rows, { onConflict: 'goonet_id' });
    if (error) throw new Error(`Blocklist write failed: ${error.message}`);
    summary.blocked += rows.length;
  }
  log(`Blocked ${summary.blocked} goo-net ids`);

  // 4. Remove the promoted copies (website cars + CRM inventory).
  if (!keep) {
    const stockNos = [...new Set(bad.map(c => c.stock_no).filter(Boolean))];
    for (const part of chunk(stockNos, 200)) {
      const { data: l, error: lErr } = await db.from('site_listings').delete().in('stock_no', part).select('id');
      if (lErr) log(`  ! site_listings cleanup failed: ${lErr.message}`);
      else summary.listingsRemoved += (l || []).length;
      const { data: v, error: vErr } = await db.from('vehicles').delete().eq('vendor', 'Goo-net').in('stock_no', part).select('id');
      if (vErr) log(`  ! vehicles cleanup failed: ${vErr.message}`);
      else summary.vehiclesRemoved += (v || []).length;
    }
    log(`Removed ${summary.listingsRemoved} website listings and ${summary.vehiclesRemoved} CRM vehicles promoted from them`);
  }

  // 5. Delete the bad cars.
  for (const part of chunk(bad.map(c => c.id), 200)) {
    const { error } = await db.from('japan_dealer_stock').delete().in('id', part);
    if (error) throw new Error(`Delete failed: ${error.message}`);
    summary.deleted += part.length;
  }
  log(`Deleted ${summary.deleted} cars`);

  try {
    await db.from('activities').insert({
      action: `Goo-net cleanup: blocked and deleted ${summary.deleted} bad imports (<${min} photos or missing details)`,
      actor: 'Goo-net cleanup script', entity_type: 'japan_dealer_stock', entity_id: null
    });
  } catch { /* activity log is best-effort */ }

  log('Cleanup complete!');
  return summary;
}

// ---- CLI -------------------------------------------------------------------
const isMain = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (isMain) {
  let db;
  try {
    db = adminClient();
  } catch (e) {
    console.error('\n  ' + e.message + '\n  Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY, then re-run.\n');
    process.exit(1);
  }
  cleanup(db, { dryRun, minPhotos, keepCopies })
    .then(summary => { console.log(JSON.stringify(summary)); process.exit(0); })
    .catch(e => { console.error('\n  ✗ ' + (e.message || e) + '\n'); process.exit(1); });
}
