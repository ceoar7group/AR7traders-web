#!/usr/bin/env node
// Regenerates the three layers of the 2026-10 photo hotfix from
// scripts/image-paths.mjs, so the lists can never drift apart.
//
//   node scripts/generate-image-hotfix.mjs [--check]
//
// --check exits non-zero when a generated file is out of date (used by
// scripts/image-fallback.test.mjs instead of re-parsing both by hand).
//
// Run this whenever assets are renamed again: the WebP pass (B1) renamed 40
// photographs from .jpg to .webp and rewrote every reference in the repo, but
// not the rows already stored in Supabase — so a car uploaded before the pass
// still asks for the old name and shows ALT text instead of a photo.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { RENAMED_PHOTOS, oldPath, newPath } from './image-paths.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = p => readFileSync(join(ROOT, p), 'utf8');

// ── layer 1: vercel.json rewrites ──────────────────────────────────────────
function vercelRewrites() {
  return RENAMED_PHOTOS.map(stem => ({
    source: oldPath(stem),
    destination: newPath(stem)
  }));
}

function buildVercel() {
  const config = JSON.parse(read('vercel.json'));
  const assetRewrites = vercelRewrites();
  const catchAll = '/index.html';

  // Drop any previous copy of the generated rewrites, keep everything else,
  // and hold the SPA catch-all back so the asset rewrites can go in front of
  // it: a renamed photo must be served from its .webp sibling, not the HTML
  // shell that the catch-all would otherwise fall through to.
  const existing = (config.rewrites || []).filter(r =>
    !assetRewrites.some(a => a.source === r.source));
  const catchAlls = existing.filter(r => r.destination === catchAll);
  const head = existing.filter(r => r.destination !== catchAll);
  config.rewrites = [...head, ...assetRewrites, ...catchAlls];
  return JSON.stringify(config, null, 2) + '\n';
}

// ── layer 3: the SQL migration ─────────────────────────────────────────────
// Every column that can hold a photo path. jsonb columns are rewritten through
// their text form so one replace() fixes a whole gallery array. Both the
// dry-run block and the fix read the same `renamed` VALUES list, so there is
// exactly one place the 40 pairs are spelled out.
const SQL_TARGETS = [
  ['public.site_listings', 'image', 'text'],
  ['public.site_listings', 'images', 'jsonb'],
  ['public.site_listings', 'gallery', 'jsonb'],
  ['public.site_articles', 'image', 'text'],
  ['public.site_articles', 'body', 'text'],
  ['public.vehicles', 'image', 'text'],
  ['public.vehicles', 'images', 'jsonb'],
  ['public.vehicles', 'gallery', 'jsonb'],
  ['public.site_blocks', 'value', 'text']
];

/** The `renamed` VALUES list: one row per photograph the WebP pass moved. */
function renamedValues(indent) {
  const pad = ' '.repeat(indent);
  return RENAMED_PHOTOS.map((s, i) =>
    `${pad}  ('${oldPath(s)}', '${newPath(s)}')${i === RENAMED_PHOTOS.length - 1 ? '' : ','}`);
}

function buildSql() {
  const L = [];
  L.push('-- ---------------------------------------------------------------------------');
  L.push('-- MIGRATION 2026-10 — image paths after the WebP pass');
  L.push('-- ---------------------------------------------------------------------------');
  L.push('-- The October 2026 image pass renamed 40 photographs in public/assets from');
  L.push('-- .jpg to .webp and rewrote every reference in the repository. Rows that were');
  L.push('-- already stored in Supabase kept the old name, so on the live site the');
  L.push('-- showroom / inventory cards for cars uploaded before the pass render the ALT');
  L.push('-- text instead of a photo. Cars uploaded after the pass are fine.');
  L.push('--');
  L.push('-- This file cleans those stored paths. It is OPTIONAL: vercel.json already');
  L.push('-- rewrites each old URL to its .webp sibling and src/image-fallback.js retries');
  L.push('-- an <img> once against the sibling extension, so the site works without it.');
  L.push('-- Run it when convenient — it is safe to re-run (every pass only touches rows');
  L.push('-- that still mention an old path) and it only ever moves a .jpg name onto the');
  L.push('-- .webp file that actually ships.');
  L.push('--');
  L.push('-- Paste into the Supabase SQL editor. Read the dry-run block first: it shows');
  L.push('-- exactly what is left to fix before anything is written.');
  L.push('-- ---------------------------------------------------------------------------');
  L.push('');
  L.push('-- ============ 1. DRY RUN — what still points at a renamed photo ============');
  L.push('-- Nothing below writes. Run it, look at the rows, then run section 2.');
  L.push('-- A row listed here after section 2 points at a path that is not in the list —');
  L.push('-- fix that row by hand, or re-upload the car through the CRM.');
  L.push('');
  L.push('with renamed(old_path, new_path) as (');
  L.push('  values');
  L.push(...renamedValues(0));
  L.push(')');
  for (const [table, column, type] of SQL_TARGETS) {
    const cast = type === 'jsonb' ? '::text' : '';
    L.push(`select '${table}.${column}' as where_it_is, t.id, r.old_path as stale_path,`);
    L.push(`       t.${column} as stored_value`);
    L.push(`  from ${table} t`);
    L.push(`  join renamed r on t.${column}${cast} like '%' || r.old_path || '%';`);
    L.push('');
  }
  L.push('-- ============ 2. THE FIX ============');
  L.push('-- One pass per column that can hold a photo path, looping over the same list.');
  L.push('-- Looping matters: a gallery can hold several renamed photos, and one UPDATE');
  L.push('-- ... FROM would only ever fix the first of them.');
  L.push('-- A column your install does not have is skipped with a notice rather than');
  L.push('-- aborting the whole file.');
  L.push('');
  for (const [table, column, type] of SQL_TARGETS) {
    const cast = type === 'jsonb' ? '::text' : '';
    const retype = type === 'jsonb' ? '::jsonb' : '';
    L.push(`-- ---- ${table}.${column} ----`);
    L.push('do $$');
    L.push('declare r record;');
    L.push('begin');
    L.push('  for r in (');
    L.push('    values');
    L.push(...renamedValues(4));
    L.push('  ) as v(old_path, new_path) loop');
    L.push(`    update ${table}`);
    L.push(`       set ${column} = replace(${column}${cast}, r.old_path, r.new_path)${retype}`);
    L.push(`     where ${column}${cast} like '%' || r.old_path || '%';`);
    L.push('  end loop;');
    L.push(`exception when undefined_column then`);
    L.push(`  raise notice '${table}.${column}: column not present on this install — skipped';`);
    L.push('end $$;');
    L.push('');
  }
  L.push('-- ============ 3. VERIFY ============');
  L.push('-- Re-run the dry-run block in section 1. It should return no rows.');
  L.push('');
  return L.join('\n');
}

// ---------------------------------------------------------------------------
const check = process.argv.includes('--check');
const outputs = [
  ['vercel.json', buildVercel()],
  ['supabase/MIGRATION-2026-10-image-paths.sql', buildSql()]
];

let drift = 0;
for (const [rel, next] of outputs) {
  const current = existsSync(join(ROOT, rel)) ? read(rel) : '';
  if (current === next) {
    console.log(`  ✓ ${rel} is up to date (${RENAMED_PHOTOS.length} renamed photos)`);
    continue;
  }
  drift++;
  if (check) {
    console.error(`  ✗ ${rel} is out of date — run: node scripts/generate-image-hotfix.mjs`);
  } else {
    writeFileSync(join(ROOT, rel), next);
    console.log(`  ✓ wrote ${rel}`);
  }
}
process.exit(check && drift ? 1 : 0);
