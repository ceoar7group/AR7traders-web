#!/usr/bin/env node
// Sync the live website stock (Supabase `site_listings`) with the real 25-car
// stock in src/site-content.seed.json — 12 showroom cars
// (AR7-26001–AR7-26012, with photo galleries) + 13 authentic Goo-net cars.
//
//   SUPABASE_URL="https://xxx.supabase.co" \
//   SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
//   node scripts/sync-site-listings.mjs
//
// Flags:
//   --dry-run       show what would change, write nothing
//   --hard-delete   DELETE database rows that are not in the seed instead of
//                   hiding them with published=false (the default is
//                   reversible — re-publish from the CRM any time)
//
// The CRM's one-click "Sync website stock to latest" button (api/site-sync.js)
// runs this exact same logic on the server (scripts/sync-core.mjs).
import {createClient} from '@supabase/supabase-js';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {computePlan, applyPlan, summarize} from './sync-core.mjs';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const hardDelete = args.includes('--hard-delete');

const dir = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(readFileSync(path.join(dir, '../src/site-content.seed.json'), 'utf8'));
const seedListings = seed.listings || [];

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('\n  Missing credentials. Set both, then re-run:\n');
  console.error('  SUPABASE_URL="https://xxx.supabase.co" \\');
  console.error('  SUPABASE_SERVICE_ROLE_KEY="eyJ..." \\');
  console.error('  node scripts/sync-site-listings.mjs\n');
  process.exit(1);
}

const db = createClient(url, key, {auth: {persistSession: false}});

console.log('\nSyncing website stock with src/site-content.seed.json…\n');
console.log(`  Seed: ${seedListings.length} cars (${seedListings.slice(0, 12).length} showroom positions 1–12 + ${Math.max(0, seedListings.length - 12)} Goo-net)`);
console.log(`  Mode: ${dryRun ? 'DRY RUN (nothing will be written)' : 'live'} · ${hardDelete ? 'STALE ROWS WILL BE DELETED' : 'stale rows only hidden (published=false)'}\n`);

const {data: dbRows, error: readErr} = await db.from('site_listings').select('*');
if (readErr) {
  console.error(`  ✗ Could not read site_listings: ${readErr.message}`);
  console.error('    Did you run supabase/site-content.sql in the Supabase SQL Editor?');
  process.exit(1);
}
console.log(`  Database: ${dbRows.length} rows in site_listings\n`);

const plan = computePlan(seedListings, dbRows, {hardDelete});

if (plan.toInsert.length) {
  console.log(`  + INSERT ${plan.toInsert.length}:`);
  plan.toInsert.forEach(r => console.log(`      ${r.stock_no}  ${r.make} ${r.model}  (position ${r.sort_order})`));
}
if (plan.toUpdate.length) {
  console.log(`  ~ UPDATE ${plan.toUpdate.length}:`);
  plan.toUpdate.forEach(r => console.log(`      ${r.stock_no}  → ${r.changes.join(', ')}`));
}
console.log(`  • UNCHANGED ${plan.unchanged.length}: already match the seed`);
if (plan.toDelete.length) {
  console.log(`  - DELETE ${plan.toDelete.length} (not in seed):`);
  plan.toDelete.forEach(r => console.log(`      ${r.stock_no}  ${r.make} ${r.model}  (published: ${r.published})`));
} else if (plan.toUnpublish.length) {
  console.log(`  - HIDE ${plan.toUnpublish.length} (not in seed, published=false, reversible):`);
  plan.toUnpublish.forEach(r => console.log(`      ${r.stock_no}  ${r.make} ${r.model}`));
} else {
  console.log(`  - nothing to hide: every database row is in the seed`);
}

if (dryRun) {
  console.log('\n  DRY RUN complete — no changes written.\n');
  process.exit(0);
}

try {
  const done = await applyPlan(db, plan);
  console.log(`\n  ✓ Done: ${summarize(plan, done)}\n`);

  // Audit trail for the CRM activity log.
  try {
    const {error} = await db.from('activities').insert({
      action: `Synced website stock to latest seed — ${summarize(plan, done)}`,
      actor: 'sync-site-listings.mjs (CLI)',
      entity_type: 'site_listings'
    });
    if (error) console.error(`  (activity log skipped: ${error.message})`);
  } catch (e) {
    console.error(`  (activity log skipped: ${e.message})`);
  }

  console.log('  The public website now reads the synced stock via');
  console.log('  /api/site-content?entity=listings (hard-refresh if cached).\n');
  process.exit(0);
} catch (e) {
  console.error(`\n  ✗ Sync failed: ${e.message}`);
  console.error('  Re-run with --dry-run to see the current plan.\n');
  process.exit(1);
}
