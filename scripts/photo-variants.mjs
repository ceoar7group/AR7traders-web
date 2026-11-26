#!/usr/bin/env node
// Photo variants for the machinery catalogue (npm run photos / npm run
// test:photo-variants -- --check).
//
// Every machinery photograph is one file, 900 px wide and 31–64 kB. A phone
// showing six catalogue cards therefore downloaded ~250 kB of photographs into
// slots that are 390 px wide, and the detail page's 150 px thumbnail strip
// pulled the same 900 px files.
//
// This script writes the smaller widths once, beside the original, and records
// the widths in src/photo-widths.js so the app can put an honest `srcset`
// together (a srcset entry pointing at a file that does not exist is worse than
// no srcset at all — the browser may pick it and show a broken image).
//
//   node scripts/photo-variants.mjs            generate what is missing or stale
//   node scripts/photo-variants.mjs --force    regenerate everything
//   node scripts/photo-variants.mjs --check    verify only (exit 1 on drift)
//
// Wire it into CI so a newly added photograph cannot ship without its variants.
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Everything under these directories is a catalogue photograph, so every file
// gets variants whether or not the code mentions it yet.
const PHOTO_DIRS = ['machinery', 'covers', 'showroom'];
// Plus any photo the app itself points at (news covers and page heroes live at
// the root of public/assets, outside the two catalogue folders).
const SCAN_SOURCES = ['src'];
const MIN_BYTES = 20 * 1024;   // a 6 kB icon does not need a 400w sibling
const SOURCE_RE = /^\/assets\/[\w./-]+\.(?:webp|jpe?g|png)$/i;
const MANIFEST = path.join(ROOT, 'src/photo-widths.js');
// Card and thumbnail widths. A variant is only written when it is meaningfully
// narrower than the source (≤85%): 900 → 800 saves single-digit kB and only
// adds a file, while 900 → 400 is what a card or a thumbnail actually wants.
const WIDTHS = [400, 800];
// Widths that may already exist by hand (the hero photographs ship 560/760
// siblings). Those are recorded in the manifest and reused as-is — generating a
// second, near-identical set would double the files for no gain.
const KNOWN_WIDTHS = [400, 560, 760, 800];
const QUALITY = 78;


const args = new Set(process.argv.slice(2));
const CHECK = args.has('--check');
const FORCE = args.has('--force');

// Only the widths this script writes count as variants: ar7-mark-460.webp is a
// hand-made asset, not a generated sibling of ar7-mark.webp.
const isVariant = name => new RegExp(`-(${KNOWN_WIDTHS.join('|')})\\.webp$`, 'i').test(name);
const isSource = name => /\.(webp|jpe?g|png)$/i.test(name) && !isVariant(name) && !/\.blurbg\.webp$/i.test(name);
const variantPath = (file, width) => file.replace(/\.(webp|jpe?g|png)$/i, `-${width}.webp`);

/** Every /assets/… path the app mentions, so a referenced photo without
 *  variants is caught rather than silently shipping at full size. */
function referencedAssets(dir) {
  const out = new Set();
  const walk = d => {
    for (const entry of readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(js|jsx|mjs)$/i.test(entry.name)) {
        const text = readFileSync(p, 'utf8');
        for (const m of text.matchAll(/['"`](\/assets\/[\w./-]+\.(?:webp|jpe?g|png))['"`]/gi)) out.add(m[1]);
      }
    }
  };
  walk(dir);
  return out;
}

const manifest = {};

async function main() {
  let written = 0, skipped = 0, sources = 0;
  const problems = [];

  const referenced = new Set([...referencedAssets(path.join(ROOT, 'src'))]);
  const seen = new Set();
  // Catalogue folders first (with their public prefix), then every referenced
  // photo anywhere under public/assets.
  const passes = [
    ...PHOTO_DIRS.map(dir => ({ dir, only: null })),
    { dir: '', only: referenced }
  ];

  for (const { dir, only } of passes) {
    const photoDir = path.join(ROOT, 'public/assets', dir);
    const prefix = `/assets/${dir ? dir + '/' : ''}`;
    const files = readdirSync(photoDir).filter(isSource).sort()
      .filter(name => (only ? only.has(prefix + name) : true))
      .filter(name => !seen.has(prefix + name))
      .filter(name => statSync(path.join(photoDir, name)).size >= MIN_BYTES);
    for (const name of files) seen.add(prefix + name);
    sources += files.length;

    for (const name of files) {
      const file = path.join(photoDir, name);
      const meta = await sharp(file).metadata();
      const width = Number(meta.width) || 0;
      // Hand-made siblings first: if the photograph already ships widths, those
      // are the ladder — nothing new is written beside them.
      const existing = KNOWN_WIDTHS.filter(w => existsSync(path.join(photoDir, variantPath(name, w))));
      const variants = [...existing];
      for (const target of existing.length ? [] : WIDTHS) {
        if (target >= width * 0.85) continue;    // never upscale, and not worth 10%
        const out = path.join(photoDir, variantPath(name, target));
        variants.push(target);
        const fresh = existsSync(out) && statSync(out).mtimeMs >= statSync(file).mtimeMs;
        if (CHECK) {
          if (!existsSync(out)) problems.push(`${dir}/${name}: missing ${target}w variant`);
          else if (!fresh) problems.push(`${dir}/${name}: ${target}w variant is older than the photo`);
          continue;
        }
        if (fresh && !FORCE) { skipped++; continue; }
        await sharp(file)
          .resize({ width: target, withoutEnlargement: true })
          .webp({ quality: QUALITY, effort: 5 })
          .toFile(out);
        written++;
      }
      manifest[prefix + name] = { width, variants };
    }

    // A variant whose source is gone must not linger in the manifest or on disk.
    const known = new Set(files.flatMap(n => KNOWN_WIDTHS.map(w => variantPath(n, w))));
    for (const name of readdirSync(photoDir)) {
      if (isVariant(name) && !known.has(name)) problems.push(`${prefix + name}: variant without a source photo`);
    }
  }

  // A .js module rather than .json: every surface that reads it (the browser
  // bundle and the Node test suites) imports it the same way, with no import
  // attributes or loader flags.
  const body = '// Generated by scripts/photo-variants.mjs — do not edit by hand.\n'
    + '// npm run photos\n'
    + 'export default ' + JSON.stringify(manifest, null, 2) + ';\n';
  const current = existsSync(MANIFEST) ? readFileSync(MANIFEST, 'utf8') : '';
  if (CHECK) {
    if (current !== body) problems.push('src/photo-widths.js is out of date — run `npm run photos`');
    if (problems.length) {
      console.error(`✗ ${problems.length} photo-variant problem(s):`);
      for (const p of problems) console.error('  - ' + p);
      process.exit(1);
    }
    const total = Object.keys(manifest).length;
    console.log(`✓ ${total} photos (${PHOTO_DIRS.join(', ')}), variants present and current (${countVariants(manifest)} files)`);
    return;
  }

  if (current !== body) writeFileSync(MANIFEST, body);
  console.log(`photos: ${sources} sources in ${PHOTO_DIRS.join(', ')}, ${written} variant(s) written, ${skipped} already current`);
  if (problems.length) for (const p of problems) console.warn('  ! ' + p);
}

const countVariants = m => Object.values(m).reduce((n, e) => n + e.variants.length, 0);

main().catch(err => { console.error(err); process.exit(1); });
