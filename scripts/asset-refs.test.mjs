#!/usr/bin/env node
// Guard: every image the site asks for exists, and public/ stays light.
//
//   node scripts/asset-refs.test.mjs
//
// Phase B1 moved the photographic assets to WebP. That kind of change is silent
// when it breaks: a mistyped path or a stale `.jpg` only shows up as a blank
// card in the browser. This suite walks every `/assets/...` literal in the
// shipped source and asserts the file is on disk, expands the template-built
// galleries in src/main.jsx, and keeps a weight budget on public/.
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, relative, extname } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC = join(ROOT, 'public');

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name); }
}
const read = p => readFileSync(join(ROOT, p), 'utf8');

// Mirrors the reference-rewrite roots in scripts/optimize-assets.mjs.
const ROOTS = ['src', 'scripts', 'public', 'supabase', 'api', 'crm-preview'];
const EXT = /\.(jsx?|mjs|css|html|txt|xml|json|md|sql)$/i;
const MAX_PUBLIC_BYTES = 2.5 * 1000 * 1000; // the B1 brief: public/ under 2.5 MB
const MAX_FILE_BYTES = 200 * 1024;

const SKIP = /(^|[\\/])(node_modules|\.git|dist|build|\.tmp)([\\/]|$)/;
function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (SKIP.test(full)) continue;
    if (entry.isDirectory()) walk(full, out);
    else out.push(full);
  }
  return out;
}

const sourceFiles = [
  ...ROOTS.flatMap(r => (existsSync(join(ROOT, r)) ? walk(join(ROOT, r)) : [])),
  join(ROOT, 'index.html'),
  ...readdirSync(ROOT).filter(f => f.endsWith('.md')).map(f => join(ROOT, f)),
].filter(f => EXT.test(f) && !f.includes('node_modules'));

// ── 1. Every literal /assets/… reference resolves ─────────────────────────────
console.log('\n-- every asset reference resolves --');
const REF_RE = /['"`(](\/?assets\/[A-Za-z0-9._/-]+\.(?:jpe?g|png|webp|svg|avif))/g;
const missing = new Set();
let checked = 0;
for (const file of sourceFiles) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(REF_RE)) {
    checked++;
    const rel = m[1].replace(/^\//, '');
    if (!existsSync(join(PUBLIC, rel))) missing.add(`${relative(ROOT, file)} -> ${m[1]}`);
  }
}
// scripts/header-render.test.jsx asserts the logo helper's URL shape with a
// make that ships no logo file, so a literal in a test fixture is not a defect.
const missingReal = [...missing].filter(m => !m.startsWith('scripts/header-render.test.jsx'));
ok(checked > 0, `scanned asset literals (${checked} references)`);
ok(missingReal.length === 0, `no broken asset references${missingReal.length ? ': ' + missingReal.join(', ') : ''}`);

// ── 2. No stale .jpg reference to a photo that is now WebP ───────────────────
// Catches paths split across arguments or built by concatenation, which the
// literal scan above cannot see.
console.log('\n-- no references to replaced photos --');
const webpStems = new Set(
  walk(PUBLIC).filter(f => f.endsWith('.webp'))
    .map(f => relative(PUBLIC, f).replace(/\.webp$/i, '').split('/').pop()));
const stale = new Set();
for (const file of sourceFiles) {
  const text = readFileSync(file, 'utf8');
  for (const m of text.matchAll(/([A-Za-z0-9._-]+)\.jpe?g\b/gi)) {
    if (webpStems.has(m[1])) stale.add(`${relative(ROOT, file)} -> ${m[0]}`);
  }
}
ok(stale.size === 0, `no stale .jpg references to WebP photos${stale.size ? ': ' + [...stale].slice(0, 5).join(', ') : ''}`);

// ── 3. Template-built galleries resolve too ──────────────────────────────────
console.log('\n-- template-built gallery paths resolve --');
const main = read('src/main.jsx');
const galleryBlock = main.slice(main.indexOf('const VEHICLE_GALLERIES'), main.indexOf('const galleryFor'));
const templates = [...galleryBlock.matchAll(/`(\/assets\/[^`]+)`/g)].map(m => m[1]);
ok(templates.length >= 2, 'src/main.jsx still builds model galleries from templates');
for (const tpl of templates) {
  const paths = [1, 2, 3, 4, 5].map(n =>
    tpl.replace(/\$\{String\(n\)\.padStart\(2,'0'\)\}/, String(n).padStart(2, '0'))
       .replace(/\$\{n\}/g, String(n)));
  const bad = paths.filter(p => !existsSync(join(PUBLIC, p.replace(/^\//, ''))));
  ok(bad.length === 0, `${tpl} → ${bad.length ? 'missing ' + bad.join(', ') : 'all 5 frames present'}`);
}

// ── 3. Brand marks stay PNG (main.jsx concatenates `/assets/logos/<make>.png`) ─
console.log('\n-- brand marks keep their extension --');
const logoDir = join(PUBLIC, 'assets/logos');
const logoFiles = readdirSync(logoDir).sort();
ok(logoFiles.length >= 18, `${logoFiles.length} brand logos ship`);
const notPng = logoFiles.filter(f => extname(f) !== '.png');
ok(notPng.length === 0, `every logo is a .png (found ${notPng.join(', ') || 'none'})`);
for (const mark of ['assets/ar7-logo.png', 'assets/ar7-mark.png']) {
  ok(existsSync(join(PUBLIC, mark)), `${mark} stays a PNG (HTML/JSON-LD/favicon reference it)`);
}
const makes = [...new Set([...main.matchAll(/make:'([^']+)'/g)].map(m => m[1].toLowerCase()))];
const noLogo = makes.filter(m => !existsSync(join(logoDir, `${m}.png`)));
ok(noLogo.length === 0, `every shipped make has a logo (missing: ${noLogo.join(', ') || 'none'})`);

// ── 5. Weight budget ────────────────────────────────────────────────────────
console.log('\n-- public/ weight budget --');
const publicFiles = walk(PUBLIC);
let total = 0, heaviest = { size: 0, file: '' };
for (const file of publicFiles) {
  const size = statSync(file).size;
  total += size;
  if (size > heaviest.size) heaviest = { size, file };
}
const mb = n => (n / 1e6).toFixed(2) + ' MB';
ok(total <= MAX_PUBLIC_BYTES, `public/ is ${mb(total)} (budget ${mb(MAX_PUBLIC_BYTES)})`);
ok(heaviest.size <= MAX_FILE_BYTES, `heaviest file is ${relative(PUBLIC, heaviest.file)} at ${Math.round(heaviest.size / 1024)} KB (cap ${MAX_FILE_BYTES / 1024} KB)`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
