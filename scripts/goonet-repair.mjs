#!/usr/bin/env node
// Repair already-imported Japan dealer stock rows that the old parser stored
// wrong — the wrong make (a Honda N-BOX saved as NISSAN because goo-net's
// navigation mentions other brands) and spec fields that swallowed the next
// equipment-list word (ミッション → パワーステアリングＨ).
//
//   node scripts/goonet-repair.mjs --dry-run          show what would change (default)
//   node scripts/goonet-repair.mjs --dry-run --limit 50
//   SUPABASE_URL="https://xxx.supabase.co" \
//   SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
//   node scripts/goonet-repair.mjs --write            apply the changes
//
// What it may write: ONLY make, model, tr, col, seats, eng, grade.
// What it never writes: price (jpy/usd/display), image/images/photo_count,
// available/delisted_at, promoted, status, location, goonet_url, quality_score.
// A price or a promotion is the owner's decision; the parser only repairs the
// fields it can re-read from the car's own detail page.
//
// The detail page is re-fetched per row (one goo-net request each), so keep the
// batch small. Rows whose page is gone (404 / delisted notice) are skipped and
// listed — the delist check, not this script, owns availability.
import { fileURLToPath } from 'node:url';
import {
  fetchPage, parseDetailPage, isDelistedPage, makeFromModel,
  isTransmissionValue, isColourValue
} from './goonet-core.mjs';

// The complete set of columns this script is allowed to write.
export const REPAIR_COLUMNS = ['make', 'model', 'tr', 'col', 'seats', 'eng', 'grade'];

export function gradeFrom(ext, int) {
  if (!ext || !int) return null;
  return String(Math.round(((ext + int) / 2) * 2) / 2);
}

const str = v => (v === null || v === undefined ? '' : String(v).trim());

/**
 * Compare one stored row with the freshly parsed detail page and return only
 * the fields that should change. Returns null when the page did not parse as a
 * real vehicle page (a gate or error page must never overwrite good data).
 *
 * Rules, deliberately conservative:
 *   • make    — a real brand; never a value that contradicts the model→brand
 *               table, and never 'Unknown'.
 *   • model   — only when the page names one and it differs.
 *   • tr/col  — only when the stored value is missing or does not LOOK like the
 *               field (that is the reported defect); a value that already looks
 *               like a transmission/colour is left alone.
 *   • seats/eng — only when the stored value is empty.
 *   • grade   — the mean of the page's 外装/内装 ratings, written when the page
 *               states both.
 */
export function repairFields(row, detail) {
  if (!detail || !detail.make || detail.make === 'Unknown' || !detail.title) return null;
  const out = {};

  const modelBrand = makeFromModel(detail.title);
  const make = str(detail.make);
  if (make && make !== str(row.make) && (!modelBrand || modelBrand === make)) out.make = make;

  const model = str(detail.model);
  if (model && model.length <= 48 && model !== str(row.model)) out.model = model;

  const tr = str(detail.tr);
  if (tr && !isTransmissionValue(row.tr) && isTransmissionValue(tr)) out.tr = tr;

  const col = str(detail.col);
  if (col && !isColourValue(row.col) && isColourValue(col)) out.col = col;

  if (detail.seats && !row.seats) out.seats = detail.seats;
  if (str(detail.eng) && !str(row.eng)) out.eng = str(detail.eng);

  const grade = gradeFrom(detail.ext_rating, detail.int_rating);
  if (grade && grade !== str(row.grade)) out.grade = grade;

  return Object.keys(out).length ? out : null;
}

/** One row → { id, stock, fields } or { id, stock, skip } for the report. */
export async function inspectRow(row, { timeoutMs = 8000, fetchImpl = fetchPage } = {}) {
  const url = row.goonet_url;
  const label = row.stock_no || row.goonet_id || row.id;
  if (!url) return { id: row.id, stock: label, skip: 'no goonet_url stored' };
  let fetched;
  try {
    fetched = await fetchImpl(url, { timeoutMs, purpose: 'detail' });
  } catch (e) {
    return { id: row.id, stock: label, skip: 'fetch failed: ' + (e.message || 'error') };
  }
  if (!fetched.ok || isDelistedPage(fetched)) {
    return { id: row.id, stock: label, skip: fetched.status === 404 ? 'page gone (404)' : 'page not readable' };
  }
  const detail = parseDetailPage(fetched.html, url);
  const fields = repairFields(row, detail);
  if (!fields) return { id: row.id, stock: label, skip: 'already correct' };
  return { id: row.id, stock: label, fields };
}

export function formatChange(row, fields) {
  const parts = Object.entries(fields).map(([k, v]) => `${k}: ${str(row[k]) || '—'} → ${v}`);
  return `${row.stock_no || row.goonet_id || row.id}  ${parts.join('  ·  ')}`;
}

async function main() {
  const args = process.argv.slice(2);
  const write = args.includes('--write');
  const limitArg = args.find(a => a.startsWith('--limit'));
  const limit = limitArg ? Number(limitArg.split('=')[1] || args[args.indexOf(limitArg) + 1]) || 25 : 25;

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error('\n  Needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (server-side key, never a VITE_ one).');
    console.error('  Nothing was fetched and nothing was written.\n');
    process.exit(1);
  }

  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(url, key, { auth: { persistSession: false } });
  const { data: rows, error } = await db.from('japan_dealer_stock')
    .select('id,goonet_id,stock_no,make,model,tr,col,seats,eng,grade,goonet_url')
    .not('goonet_url', 'is', null)
    .order('imported_at', { ascending: true })
    .limit(limit);
  if (error) { console.error('  ✗ could not read japan_dealer_stock:', error.message); process.exit(1); }

  console.log(`\n  ${write ? 'WRITE' : 'DRY RUN'} — checking ${rows.length} row(s), limit ${limit}\n`);
  let changed = 0;
  const skips = [];
  for (const row of rows) {
    const res = await inspectRow(row);
    if (res.fields) {
      changed++;
      console.log('  ' + formatChange(row, res.fields));
      if (write) {
        // Only REPAIR_COLUMNS ever reach the database.
        const payload = {};
        for (const k of REPAIR_COLUMNS) if (k in res.fields) payload[k] = res.fields[k];
        payload.updated_at = new Date().toISOString();
        const { error: upErr } = await db.from('japan_dealer_stock').update(payload).eq('id', row.id);
        if (upErr) { console.error(`    ✗ update failed for ${res.stock}: ${upErr.message}`); changed--; }
      }
    } else {
      skips.push(`${res.stock}: ${res.skip}`);
    }
  }

  if (skips.length) {
    console.log('\n  Skipped (nothing to repair):');
    for (const s of skips) console.log('    – ' + s);
  }
  console.log(`\n  ${changed} row(s) ${write ? 'updated' : 'would be updated'}.`);
  if (!write) console.log('  Nothing was written. Re-run with --write to apply.\n');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main().catch(e => { console.error('  ✗ repair failed:', e.message); process.exit(1); });
}
