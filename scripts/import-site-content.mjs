#!/usr/bin/env node
// One-time import: pushes the website's current content into Supabase so the
// CRM starts with the real 42 cars / 6 routes / 4 articles instead of blanks.
//
//   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node scripts/import-site-content.mjs
//
// Safe to re-run: existing rows are skipped, never duplicated or overwritten.
import {createClient} from '@supabase/supabase-js';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(readFileSync(path.join(dir, '../src/site-content.seed.json'), 'utf8'));

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error('\n  Missing credentials.\n');
  console.error('  SUPABASE_URL="https://xxx.supabase.co" \\');
  console.error('  SUPABASE_SERVICE_ROLE_KEY="eyJ..." \\');
  console.error('  node scripts/import-site-content.mjs\n');
  process.exit(1);
}

const db = createClient(url, key, {auth: {persistSession: false}});

async function importTable(table, rows, uniqueCol, mapRow) {
  const {data: existing, error: readErr} = await db.from(table).select(uniqueCol);
  if (readErr) {
    console.error(`  ✗ ${table}: ${readErr.message}`);
    console.error(`    Did you run supabase/site-content.sql first?`);
    return false;
  }
  const have = new Set((existing || []).map(r => String(r[uniqueCol])));
  const fresh = rows.map(mapRow).filter(r => !have.has(String(r[uniqueCol])));

  if (!fresh.length) {
    console.log(`  • ${table}: already populated (${have.size} rows), skipped`);
    return true;
  }
  const {error} = await db.from(table).insert(fresh);
  if (error) {
    console.error(`  ✗ ${table}: ${error.message}`);
    return false;
  }
  console.log(`  ✓ ${table}: imported ${fresh.length} rows`);
  return true;
}

const DUTY = {Pakistan: 48, UAE: 5, Kenya: 25, 'United Kingdom': 10, 'New Zealand': 10, Tanzania: 25};

console.log('\nImporting website content into Supabase…\n');

let ok = true;
ok = await importTable('site_listings', seed.listings, 'stock_no', (c, i) => ({
  stock_no: c.stock_no, make: c.make, model: c.model, year: c.year, km: c.km,
  fuel: c.fuel, body: c.body, price: c.price, image: c.image, grade: c.grade,
  status: c.status, location: c.location, tr: c.tr, drv: c.drv, eng: c.eng,
  seats: c.seats, col: c.col, st: c.st, published: true, sort_order: c.id ?? i + 1
})) && ok;

ok = await importTable('site_routes', seed.routes, 'country', (r, i) => ({
  country: r.country, port: r.port, transit: r.transit, popular: r.popular,
  freight_base: r.freight_base, duty_pct: DUTY[r.country] ?? 0,
  published: true, sort_order: i + 1
})) && ok;

ok = await importTable('site_articles', seed.articles, 'title', (a, i) => ({
  title: a.title, category: a.category, date: a.date, read_min: a.read_min,
  image: a.image, excerpt: a.excerpt, body: a.body,
  published: true, sort_order: i + 1
})) && ok;

console.log(ok ? '\nDone. Open /#crm and check "Website cars".\n'
               : '\nFinished with errors — see above.\n');
process.exit(ok ? 0 : 1);
