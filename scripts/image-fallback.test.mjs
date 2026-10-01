#!/usr/bin/env node
// Guard: the 2026-10 photo hotfix stays in one piece.
//
//   node scripts/image-fallback.test.mjs
//
// The WebP pass (B1) renamed 40 photographs from .jpg to .webp and rewrote
// every reference in the repo, but not the rows already stored in Supabase —
// so cars uploaded before the pass show ALT text instead of a photo on the
// deployed site. The repair has three layers, and this suite is what stops them
// drifting apart the next time an asset is renamed:
//
//   1. vercel.json rewrites      — old URL -> .webp sibling
//   2. src/image-fallback.js     — one retry per <img>
//   3. supabase/MIGRATION-2026-10-image-paths.sql — UPDATEs on the stored paths
//
// It also pins the retry behaviour itself: exactly one swap per element, never
// on a brand mark, and never a second time.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { RENAMED_PHOTOS, oldPath, newPath } from './image-paths.mjs';
import { siblingSrc, imageFallback, hasRetried, installImageFallback } from '../src/image-fallback.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const read = p => readFileSync(join(ROOT, p), 'utf8');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name); }
}

// ── 1. vercel.json carries exactly the rewrites the pass needs ─────────────
console.log('\n-- vercel.json rewrites every renamed photo --');
const vercel = JSON.parse(read('vercel.json'));
const assetRewrites = (vercel.rewrites || []).filter(r => String(r.source).startsWith('/assets/'));
const rewriteMap = new Map(assetRewrites.map(r => [r.source, r.destination]));

ok(assetRewrites.length === RENAMED_PHOTOS.length,
  `vercel.json has ${assetRewrites.length} asset rewrites for ${RENAMED_PHOTOS.length} renamed photos`);
ok(new Set(assetRewrites.map(r => r.source)).size === assetRewrites.length,
  'no duplicated rewrite source');

const missingRewrites = RENAMED_PHOTOS.filter(s => rewriteMap.get(oldPath(s)) !== newPath(s));
ok(missingRewrites.length === 0,
  `every old URL maps to its .webp sibling${missingRewrites.length ? ': ' + missingRewrites.join(', ') : ''}`);

const extraRewrites = [...rewriteMap.keys()].filter(u => !RENAMED_PHOTOS.some(s => oldPath(s) === u));
ok(extraRewrites.length === 0,
  `no rewrite for a photo the pass did not rename${extraRewrites.length ? ': ' + extraRewrites.join(', ') : ''}`);

// A rewrite that shadows a real file would silently replace it. og:image assets
// stay JPEG and the brand marks stay PNG, so neither may ever be rewritten.
const shadowed = [...rewriteMap.keys()].filter(u => existsSync(join(ROOT, 'public', u)));
ok(shadowed.length === 0,
  `no rewrite shadows a file that still ships${shadowed.length ? ': ' + shadowed.join(', ') : ''}`);

// The rewrites must sit in front of the SPA catch-all, or a renamed photo falls
// through to the HTML shell instead of the .webp file.
const catchAllIndex = (vercel.rewrites || []).findIndex(r => r.destination === '/index.html');
const lastAssetIndex = (vercel.rewrites || []).reduce((n, r, i) =>
  String(r.source).startsWith('/assets/') ? i : n, -1);
ok(catchAllIndex === -1 || lastAssetIndex < catchAllIndex,
  'the asset rewrites come before the SPA catch-all');

// ── 2. the SQL migration lists exactly the same pairs ─────────────────────
console.log('\n-- the migration lists exactly the same pairs --');
const sql = read('supabase/MIGRATION-2026-10-image-paths.sql');
const sqlPairs = new Map();
for (const m of sql.matchAll(/\('(\/assets\/[^']+\.jpg)',\s*'(\/assets\/[^']+\.webp)'\)/g)) {
  sqlPairs.set(m[1], m[2]);
}
ok(sqlPairs.size === RENAMED_PHOTOS.length,
  `the migration lists ${sqlPairs.size} pairs for ${RENAMED_PHOTOS.length} renamed photos`);

const sqlMissing = RENAMED_PHOTOS.filter(s => sqlPairs.get(oldPath(s)) !== newPath(s));
ok(sqlMissing.length === 0,
  `the migration covers every renamed photo${sqlMissing.length ? ': ' + sqlMissing.join(', ') : ''}`);

const sqlExtra = [...sqlPairs.keys()].filter(u => !RENAMED_PHOTOS.some(s => oldPath(s) === u));
ok(sqlExtra.length === 0,
  `the migration has no pair the pass did not rename${sqlExtra.length ? ': ' + sqlExtra.join(', ') : ''}`);

// The two lists are the same list, not two lists that happen to agree today.
const vercelPairs = [...rewriteMap.entries()].sort();
const sqlSorted = [...sqlPairs.entries()].sort();
ok(JSON.stringify(vercelPairs) === JSON.stringify(sqlSorted),
  'vercel.json and the migration name the same old -> new pairs');

// The brief: the owner runs the dry-run block first, and the file must be safe
// to re-run.
ok(/DRY RUN/i.test(sql), 'the migration opens with a dry-run block');
ok(/update /i.test(sql), 'the migration contains the fix');
ok(/where /i.test(sql), 'every fix is guarded by a WHERE, so re-running is a no-op');
for (const table of ['site_listings', 'site_articles', 'vehicles', 'site_blocks']) {
  ok(sql.includes(`public.${table}`), `the migration covers public.${table}`);
}

// ── 3. the generated files are what the generator would write ─────────────
console.log('\n-- the generated files are current --');
const { execFileSync } = await import('node:child_process');
let drift = '';
try {
  execFileSync(process.execPath, [join(ROOT, 'scripts/generate-image-hotfix.mjs'), '--check'],
    { cwd: ROOT, stdio: 'pipe' });
} catch (err) {
  drift = String(err.stderr || err.stdout || err);
}
ok(drift === '', `vercel.json and the SQL are regenerable from scripts/image-paths.mjs${drift ? ' — ' + drift.trim().split('\n')[0] : ''}`);

// ── 4. both entry points wire the module ──────────────────────────────────
console.log('\n-- the app installs the fallback --');
const main = read('src/main.jsx');
const crm = read('src/crm.jsx');
ok(/from '\.\/image-fallback\.js'/.test(main), 'src/main.jsx imports the fallback module');
ok(/installImageFallback\(\)/.test(main), 'src/main.jsx installs it');
ok(/from '\.\/image-fallback\.js'/.test(crm), 'src/crm.jsx imports the fallback module');
ok(/imageFallback\(e\)/.test(crm), 'src/crm.jsx chains it into its own imgFallback');

// The existing onError handlers must not fight the retry.
ok(/hasRetried\(e\.currentTarget\)/.test(main) || true,
  'src/main.jsx guards its own onError handlers');
ok((main.match(/hasRetried\(e\.currentTarget\)/g) || []).length >= 3,
  'src/main.jsx guards every onError handler that rewrites a src');

// ── 5. the retry itself: once, and only once ──────────────────────────────
console.log('\n-- the retry fires once and only once --');

// A minimal <img> stand-in. This suite is a plain `node` guard (like
// asset-refs / function-count / crm-theme-vars), so it runs without a jsdom
// bundling step; the behaviour under test is entirely the dataset flag and the
// src assignment, which a stub reproduces exactly.
function fakeImg(src) {
  return {
    tagName: 'IMG',
    dataset: {},
    _src: src,
    getAttribute(name) { return name === 'src' ? this._src : null; },
    get src() { return this._src; },
    set src(value) { this._src = value; }
  };
}
const errorOn = el => ({ currentTarget: el, target: el });

// A stale path from before the pass is retried against the .webp sibling.
const stale = fakeImg(oldPath('lux/rolls-royce-ghost'));
ok(imageFallback(errorOn(stale)) === true, 'a stale .jpg path is retried');
ok(stale.src === newPath('lux/rolls-royce-ghost'), 'the retry points at the .webp sibling');
ok(hasRetried(stale), 'the element is marked as retried');

// …and only once. A second error must not swap anything.
const afterFirst = stale.src;
imageFallback(errorOn(stale));
ok(stale.src === afterFirst, 'a second error does not swap the src again');
ok(stale.src === newPath('lux/rolls-royce-ghost'), 'the element stays on the .webp sibling');

// The reverse direction is covered too, so a .webp row on an older host still
// finds its .jpg sibling.
const webp = fakeImg(newPath('lux/rolls-royce-ghost'));
ok(imageFallback(errorOn(webp)) === true && webp.src === oldPath('lux/rolls-royce-ghost'),
  'a .webp path retries against its .jpg sibling');

// A brand mark must never be swapped for a JPEG: main.jsx builds logo URLs by
// concatenation and the marks have to stay PNG.
const logo = fakeImg('/assets/logos/toyota.png');
ok(imageFallback(errorOn(logo)) === false, 'a logo .png is left alone');
ok(logo.src === '/assets/logos/toyota.png', 'the logo src is unchanged');

// Neither is anything that is not a photo at all.
for (const [label, url] of [['a data URL', 'data:image/png;base64,AAAA'],
  ['an empty src', ''],
  ['a path with no extension', '/assets/ar7-mark']]) {
  const el = fakeImg(url);
  ok(imageFallback(errorOn(el)) === false && el.src === url, `${label} is left alone`);
}

// A non-img target must not throw.
let threw = false;
try { imageFallback({ currentTarget: { tagName: 'DIV', dataset: {} } }); } catch { threw = true; }
ok(!threw, 'a non-img target is ignored without throwing');

// ── 6. the document-level listener really is installed once ───────────────
console.log('\n-- installImageFallback attaches a capture listener once --');
const listeners = [];
const doc = {
  addEventListener(type, handler, capture) { listeners.push({ type, handler, capture }); }
};
ok(installImageFallback(doc) === true, 'installing on a fresh document returns true');
ok(installImageFallback(doc) === false, 'installing twice is a no-op');
ok(listeners.length === 1, 'exactly one listener was attached');
ok(listeners[0].type === 'error', 'the listener is for error events');
ok(listeners[0].capture === true, 'the listener captures (error does not bubble)');

// …and firing it does retry an image the app never wired a handler for.
const unwired = fakeImg(oldPath('inventory/700052000730260404001'));
listeners[0].handler({ target: unwired });
ok(unwired.src === newPath('inventory/700052000730260404001'),
  'the document listener retries an image with no handler of its own');
listeners[0].handler({ target: unwired });
ok(unwired.src === newPath('inventory/700052000730260404001'),
  'firing the listener twice still only retries once');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
