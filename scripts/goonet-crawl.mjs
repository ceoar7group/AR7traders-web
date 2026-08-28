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
//   --min-photos N  override the photo quality gate (default: 8)
//   --base URL      override the goo-net listing URL
import {createClient} from '@supabase/supabase-js';
import {
  fetchPage, parseListingPage, parseDetailPage, mergeCardAndDetail,
  qualityScore, listingPageUrlFor, DEFAULT_SEARCH_URL, UA
} from './goonet-core.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const pageArg = args.find(x => x === '--page') ? Number(args[args.indexOf('--page') + 1]) : 1;
const minPhotosArg = args.find(x => x === '--min-photos') ? Number(args[args.indexOf('--min-photos') + 1]) : 8;
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
console.log(`  Gate: ${minPhotosArg}+ photos · mode: ${dryRun ? 'DRY RUN (nothing written)' : 'live'}\n`);

const fetched = await fetchPage(pageUrl, { timeoutMs: 9000 });
if (!fetched.ok) {
  console.error(`  ✗ Fetch failed (HTTP ${fetched.status})${fetched.error ? ' — ' + fetched.error : ''}`);
  process.exit(1);
}
const page = parseListingPage(fetched.html, pageUrl);
console.log(`  Listing page: ${page.cars.length} cars (pagination max ${page.pagination.total})\n`);

let imported = 0, skipped = 0;
for (const card of page.cars) {
  const detail = await fetchPage(card.url, { timeoutMs: 6000 });
  const car = detail.ok ? mergeCardAndDetail(card, parseDetailPage(detail.html, card.url)) : card;
  const q = qualityScore(car, { minPhotos: minPhotosArg });
  if (!q.pass) {
    console.log(`  – SKIP ${card.stock_no} ${car.make || '?'} ${car.model || ''} (${q.reasons.join(', ')})`);
    skipped++;
    continue;
  }
  console.log(`  + ${car.year || '—'} ${car.make} ${car.model} · ${car.price || '—'} · ${q.photo_count} photos · score ${q.score}`);
  imported++;
}

console.log(`\n  Would import ${imported}, skip ${skipped}`);

if (dryRun) {
  console.log('  DRY RUN complete — no changes written.\n');
  process.exit(0);
}

// Live mode: insert the passing cars (same shape the Vercel function uses).
for (const card of page.cars) {
  const detail = await fetchPage(card.url, { timeoutMs: 6000 });
  const car = detail.ok ? mergeCardAndDetail(card, parseDetailPage(detail.html, card.url)) : card;
  const q = qualityScore(car, { minPhotos: minPhotosArg });
  if (!q.pass) continue;
  const now = new Date().toISOString();
  const { error } = await db.from('japan_dealer_stock').insert({
    goonet_id: String(card.goonet_id),
    stock_no: card.stock_no || card.goonet_id,
    make: car.make || 'Unknown', model: car.model || 'Car',
    year: car.year, km: car.km, fuel: car.fuel, body: car.body,
    price_jpy: car.price_jpy, price_usd: car.price_usd, price: car.price,
    image: car.image, images: car.images, grade: car.grade,
    status: 'New Arrival', location: car.location || 'Japan',
    tr: car.tr, drv: car.drv, eng: car.eng, seats: car.seats,
    col: car.col, st: car.st, vendor: 'Goo-net', goonet_url: card.url,
    photo_count: car.photo_count || (car.images || []).length,
    quality_score: q.score, available: true, promoted: 'none',
    imported_at: now, last_seen_at: now, updated_at: now
  });
  if (error && !/duplicate/i.test(error.message)) console.error(`  ✗ insert failed for ${card.stock_no}: ${error.message}`);
}

console.log('  ✓ Live import complete.\n');
process.exit(0);
