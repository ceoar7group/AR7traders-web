#!/usr/bin/env node
// Goo-net importer — command line entry point.
//
// Scrapes goo-net-exchange.com for high-quality used-car listings, imports the
// good ones into Supabase `site_listings` (source='goonet', dealer_stock=true),
// refreshes cars it has seen before, and hides cars that have gone unavailable
// — while protecting pinned/manual cars and respecting the daily limit.
//
//   SUPABASE_URL="https://xxx.supabase.co" \
//   SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
//   node scripts/goonet-scraper.mjs
//
// Flags:
//   --dry-run      print the plan, write nothing
//   --limit N      override the daily import limit for this run
//   --pages N      override how many search pages to walk
//   --url "https://…"   extra search URL to scrape (repeatable)
//   --demo         run end-to-end against bundled sample HTML (no network,
//                  needs a Supabase target or stays in dry-run mode)
//   --help         usage
import {runGoonetSync, normaliseConfig, parseDetailHtml, isHighQuality, toListing} from './goonet-core.mjs';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const args = process.argv.slice(2);
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
  Goo-net importer — feeds the website "Dealer Stock" page.

  Usage:
    node scripts/goonet-scraper.mjs [flags]

  Flags:
    --dry-run         show what would change, write nothing
    --limit N         max NEW cars to import this run (default from settings, 40)
    --pages N         search pages to walk (default from settings, 6)
    --url "https://…" extra goo-net-exchange search URL (repeatable)
    --demo            use bundled sample listings (no network)
    --help            this message

  Env (required unless --demo):
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
`);
  process.exit(0);
}

const dryRun = args.includes('--dry-run');
const demo = args.includes('--demo');
const limit = numArg('--limit');
const pages = numArg('--pages');
const extraUrls = args
  .filter((a, i) => a === '--url' && args[i + 1])
  .map(a => args[args.indexOf(a) + 1]);
function numArg(name) {
  const i = args.indexOf(name);
  return i >= 0 && args[i + 1] ? Number(args[i + 1]) : null;
}

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!demo && (!url || !key)) {
  console.error('\n  Missing credentials. Set both, then re-run:\n');
  console.error('  SUPABASE_URL="https://xxx.supabase.co" \\');
  console.error('  SUPABASE_SERVICE_ROLE_KEY="eyJ..." \\');
  console.error('  node scripts/goonet-scraper.mjs\n');
  process.exit(1);
}

if (demo && (!url || !key)) {
  // Demo without a database: just print what a sample listing parses into,
  // so the parser/quality rules can be eyeballed without credentials.
  const sample = sampleDetailHtml();
  const car = parseDetailHtml(sample, 'https://www.goo-net-exchange.com/usedcars/TOYOTA/LAND_CRUISER/700056069430260821001/');
  console.log('\n  DEMO — parsed sample listing:\n');
  console.log('  quality pass:', isHighQuality(car, 10));
  console.log('  mapped row:');
  console.dir(toListing(car), {depth: null});
  console.log('\n  (set SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY to run --demo against the database.)\n');
  process.exit(0);
}

// Lazy-load the Supabase client only when we actually need the database, so
// `--demo` / `--dry-run` still work in a checkout without node_modules.
let createClient;
try {
  ({createClient} = await import('@supabase/supabase-js'));
} catch {
  console.error('\n  The @supabase/supabase-js package is not installed.\n  Run `npm install` first, then re-run.\n');
  process.exit(1);
}
const db = createClient(url, key, {auth: {persistSession: false}});

console.log('\nGoo-net importer starting…\n');
console.log(`  Mode: ${dryRun ? 'DRY RUN (nothing will be written)' : 'live'}${demo ? ' · DEMO DATA' : ''}`);
if (limit) console.log(`  Daily limit override: ${limit}`);
if (pages) console.log(`  Page limit override: ${pages}`);

let fetchImpl;
let urls;
if (demo) {
  // Bundled sample detail HTML so the whole pipeline runs with no network.
  const sample = sampleDetailHtml();
  fetchImpl = async (u) => {
    if (u.includes('/usedcars/')) {
      return {ok: true, text: async () => sample};
    }
    return {ok: false, status: 404, text: async () => ''};
  };
  urls = ['https://www.goo-net-exchange.com/usedcars/TOYOTA/LAND_CRUISER/'];
} else {
  fetchImpl = globalThis.fetch;
}

try {
  const config = normaliseConfig({});
  if (limit) config.dailyLimit = Math.max(1, Math.floor(limit));
  if (pages) config.pageLimit = Math.max(1, Math.floor(pages));
  const result = await runGoonetSync({
    db,
    fetchImpl,
    config,
    urls: urls || (extraUrls.length ? extraUrls : undefined),
    dryRun,
    onProgress: p => {
      if (p.step === 'search') console.log(`  ▸ search page ${p.page}: ${p.url}`);
      else if (p.step === 'search-done') console.log(`  ▸ found ${p.candidates} candidate listings`);
      else if (p.step === 'detail') console.log(`  ▸ detail: ${p.url}`);
      else if (p.step === 'detail-done') console.log(`  ▸ ${p.fetched} high-quality listings parsed`);
    }
  });

  if (result.skipped) {
    console.log(`\n  Skipped: ${result.reason || 'unknown'}\n`);
    process.exit(0);
  }

  console.log(`\n  ✓ Summary: ${result.summary}`);
  console.log(`    ${result.fetchedCount} high-quality listings scraped from ${result.candidateCount} candidates\n`);

  // Audit trail.
  if (!dryRun && !demo) {
    try {
      await db.from('activities').insert({
        action: `Goo-net sync — ${result.summary}`,
        actor: 'goonet-scraper.mjs (CLI)',
        entity_type: 'site_listings'
      });
    } catch (e) {
      console.error(`  (activity log skipped: ${e.message})`);
    }
  }
  process.exit(0);
} catch (e) {
  console.error(`\n  ✗ Goo-net sync failed: ${e.message}\n`);
  process.exit(1);
}

// A realistic goo-net-exchange.com detail page (post-normalisation) used by
// --demo so the parser + quality rules run without a live network.
function sampleDetailHtml() {
  return `
<title>TOYOTA LAND CRUISER ZX | 2020 | PEARL | 31070 km | details</title>
<img src="https://picture1.goo-net.com/7000560694/30260821/J/70005606943026082100100.jpg">
${Array.from({length: 25}, (_, i) => `<img src="https://picture1.goo-net.com/056/0560694/J/0560694A30260821W001${String(i + 1).padStart(2, '0')}.jpg">`).join('\n')}
<img src="https://www.goo-net-exchange.com/common/assets/img/common/icon/icn_camera.svg">26
<h3>TOYOTA LAND CRUISER ZX</h3>
<strong>Stock Number:</strong> 0560694A30260821W001
<strong>Car Price (FOB)</strong>
¥7,330,000
2020
<img src="https://www.goo-net-exchange.com/common/assets/img/common/icon/icn_location.svg">
Chiba Japan
<table>
<tr><th>Month/Year</th><td>12.2020</td></tr>
<tr><th>Color</th><td>PEARL</td></tr>
<tr><th>Mileage</th><td>31,070 km</td></tr>
<tr><th>Repaired</th><td>No Repair History</td></tr>
<tr><th>Steering</th><td>Right</td></tr>
<tr><th>Transmission</th><td>AT</td></tr>
<tr><th>Fuel</th><td>GASOLINE</td></tr>
<tr><th>Drive System</th><td>4WD</td></tr>
<tr><th>Doors</th><td>5D</td></tr>
<tr><th>Displacement</th><td>4600cc</td></tr>
<tr><th>Chassis No</th><td>URJ202-420****</td></tr>
</table>
`;
}
