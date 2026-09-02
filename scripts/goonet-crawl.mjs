#!/usr/bin/env node
// Terminal runner for the Goo-net importer — same core as the Vercel function
// (api/goonet-sync.js) and the CRM "Run import now" button.
//
//   SUPABASE_URL="https://xxx.supabase.co" \
//   SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
//   node scripts/goonet-crawl.mjs [--dry-run] [--page N] [--min-photos N]
//
//   --dry-run       print what would be imported, write nothing
//   --page N        start at listing page N (default: 1)
//   --min-photos N  raise the photo quality gate (default and floor: 8 —
//                   a lower value is ignored, exactly like the importer)
//   --base URL      override the goo-net listing URL
//
// Applies the SAME rules as the scheduled importer (importVerdict in
// api/goonet-sync.js): cars already in japan_dealer_stock are skipped, cars
// on goonet_blocklist (deleted before) are skipped with the reason
// "blocked (previously deleted)", detail pages that say "listed until…" are
// skipped, and only cars with 8+ photos and every required field are written.
import {createClient} from '@supabase/supabase-js';
import {
  fetchPage, parseListingPage, parseDetailPage, mergeCardAndDetail,
  listingPageUrlFor, detailUrlFor, isDelistedPage, DEFAULT_SEARCH_URL, DEFAULT_MIN_PHOTOS
} from './goonet-core.mjs';
import { importVerdict, getBlockedIds } from '../api/goonet-sync.js';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const pageArg = args.find(x => x === '--page') ? Number(args[args.indexOf('--page') + 1]) : 1;
const minPhotosRaw = args.find(x => x === '--min-photos') ? Number(args[args.indexOf('--min-photos') + 1]) : DEFAULT_MIN_PHOTOS;
const minPhotos = Math.max(DEFAULT_MIN_PHOTOS, Number.isFinite(minPhotosRaw) ? minPhotosRaw : DEFAULT_MIN_PHOTOS);
const baseArg = args.find(x => x === '--base') ? args[args.indexOf('--base') + 1] : DEFAULT_SEARCH_URL;

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('\n  Missing credentials. Set both, then re-run:\n');
  console.error('  SUPABASE_URL="https://xxx.supabase.co" \\');
  console.error('  SUPABASE_SERVICE_ROLE_KEY="eyJ..." \\');
  console.error('  node scripts/goonet-crawl.mjs --dry-run\n');
  process.exit(1);
}

const db = createClient(url, key, { auth: { persistSession: false } });
const pageUrl = listingPageUrlFor(baseArg, Math.max(1, pageArg));
console.log(`\n  Fetching ${pageUrl}`);
console.log(`  Gate: ${minPhotos}+ photos, model year 2000+, all required fields · mode: ${dryRun ? 'DRY RUN (nothing written)' : 'live'}\n`);

const fetched = await fetchPage(pageUrl, { timeoutMs: 9000 });
if (!fetched.ok) {
  console.error(`  ✗ Fetch failed (HTTP ${fetched.status})${fetched.error ? ' — ' + fetched.error : ''}`);
  process.exit(1);
}
const page = parseListingPage(fetched.html, pageUrl);
console.log(`  Listing page: ${page.cars.length} cars (pagination max ${page.pagination.total})\n`);

const { data: knownRows } = await db.from('japan_dealer_stock').select('goonet_id');
const known = new Set((knownRows || []).map(r => String(r.goonet_id)));
const blocklist = await getBlockedIds(db);
if (!blocklist.available) {
  console.warn('  ! goonet_blocklist table is missing — deleted cars cannot be remembered. Run supabase/SETUP-EVERYTHING.sql.\n');
}

let imported = 0, skipped = 0;
for (const card of page.cars) {
  const gid = String(card.goonet_id || '');
  if (!gid) { console.log('  – SKIP card without a stock number'); skipped++; continue; }
  if (known.has(gid)) { console.log(`  = ${card.stock_no} already imported`); continue; }
  if (blocklist.ids.has(gid)) {
    console.log(`  – SKIP ${card.stock_no}: blocked (previously deleted)`);
    skipped++;
    continue;
  }
  const detailUrl = card.url || detailUrlFor(gid);
  const detail = await fetchPage(detailUrl, { timeoutMs: 6000 });
  if (!detail.ok) { console.log(`  – SKIP ${card.stock_no}: detail fetch failed (HTTP ${detail.status})`); skipped++; continue; }
  if (isDelistedPage(detail)) { console.log(`  – SKIP ${card.stock_no}: already delisted on goo-net`); skipped++; continue; }
  const car = mergeCardAndDetail(card, parseDetailPage(detail.html, detailUrl));
  const q = importVerdict(car, { minPhotos });
  if (!q.ok) {
    console.log(`  – SKIP ${card.stock_no} ${car.make || '?'} ${car.model || ''} (${q.problems.join(', ')})`);
    skipped++;
    continue;
  }
  console.log(`  + ${car.year} ${car.make} ${car.model} · ${car.price || '—'} · ${q.photo_count} photos · score ${q.score}`);
  if (dryRun) { imported++; continue; }

  const now = new Date().toISOString();
  const { error } = await db.from('japan_dealer_stock').insert({
    goonet_id: gid,
    stock_no: card.stock_no || gid,
    make: car.make, model: car.model,
    year: car.year, km: car.km, fuel: car.fuel, body: car.body,
    price_jpy: car.price_jpy, price_usd: car.price_usd, price: car.price,
    image: car.image || car.images[0], images: car.images, grade: car.grade,
    status: 'New Arrival', location: car.location || 'Japan',
    tr: car.tr, drv: car.drv, eng: car.eng, seats: car.seats,
    col: car.col, st: car.st, vendor: 'Goo-net', goonet_url: detailUrl,
    photo_count: car.images.length,
    quality_score: q.score, available: true, promoted: 'none',
    imported_at: now, last_seen_at: now, updated_at: now
  });
  if (error && !/duplicate/i.test(error.message)) console.error(`  ✗ insert failed for ${card.stock_no}: ${error.message}`);
  else { imported++; known.add(gid); }
}

console.log(`\n  ${dryRun ? 'Would import' : 'Imported'} ${imported}, skipped ${skipped}`);
console.log(dryRun ? '  DRY RUN complete — no changes written.\n' : '  ✓ Live import complete.\n');
process.exit(0);
