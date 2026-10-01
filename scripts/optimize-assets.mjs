#!/usr/bin/env node
// One-off (re-runnable) image pass over public/, plus the reference rewrites it
// needs.
//
//   node scripts/optimize-assets.mjs --dry-run     report only (default)
//   node scripts/optimize-assets.mjs --write       convert/recompress + rewrite refs
//   node scripts/optimize-assets.mjs --write --max 1280 --quality 68
//
// The site shipped 8.3 MB of photography and every visitor on a phone paid for
// it. This converts the photo folders to WebP at a web-appropriate size and
// quality, recompresses the files that must keep their format (og:image social
// cards stay JPEG; logo PNGs stay PNG), and rewrites every reference to a
// converted file across the repo (src, index.html, public, scripts, supabase,
// docs) — so nothing 404s.
//
// Safety rules, in order:
//   • a file is only replaced when the result is meaningfully smaller;
//   • anything sharp cannot decode is left exactly as it was;
//   • og:image / twitter:image assets keep their JPEG format and dimensions;
//   • --dry-run writes nothing at all.
//
// Sharp is a server-side dependency and is only ever imported here (never from
// src/ — see scripts/asset-refs.test.mjs).
import { readdirSync, statSync, readFileSync, writeFileSync, renameSync, unlinkSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const PUBLIC_DIR = path.join(ROOT, 'public');
const TEXT_EXT = /\.(jsx?|mjs|cjs|html|json|txt|sql|md|css)$/i;
const SKIP_PATH = /(^|[\\/])(node_modules|dist|\.git|\.tmp)([\\/]|$)/;
const OG_DIR = path.join(PUBLIC_DIR, 'assets', 'og');

const args = process.argv.slice(2);
const write = args.includes('--write');
const argValue = (name, dflt) => {
  const i = args.indexOf(name);
  if (i < 0) return dflt;
  const v = Number(args[i + 1] ?? args[i].split('=')[1]);
  return Number.isFinite(v) && v > 0 ? v : dflt;
};
const MAX_WIDTH = argValue('--max', 820);
const QUALITY = argValue('--quality', 52);
const MIN_BYTES = argValue('--min-bytes', 12 * 1024);

const kb = n => (n / 1024).toFixed(0) + ' KB';

function walk(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (SKIP_PATH.test(full)) continue;
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(jpe?g|png|webp)$/i.test(entry.name)) out.push(full);
  }
  return out;
}

function textFiles(dir, out = []) {
  if (!existsSync(dir)) return out;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (SKIP_PATH.test(full)) continue;
    if (entry.isDirectory()) textFiles(full, out);
    else if (TEXT_EXT.test(entry.name)) out.push(full);
  }
  return out;
}

// Per-path caps: brand logos render at 44x26 CSS pixels (retina wants ~88x52),
// the AR7 emblem at ~200 px, og:image cards at their social size. There is no
// reason to ship a 700 px logo.
// Assets used as og:image / twitter:image stay JPEG: social scrapers are
// conservative about WebP, and their declared width/height in index.html and
// src/seo.js must keep matching the real file, so they are never resized.
function socialCards() {
  const set = new Set();
  const add = (text, re) => {
    for (const m of text.matchAll(re)) set.add('/' + m[1].replace(/^\//, ''));
  };
  try {
    add(readFileSync(path.join(ROOT, 'index.html'), 'utf8'),
      /<meta[^>]+(?:property="og:image"|name="twitter:image")[^>]+content="[^"]*?(assets\/[A-Za-z0-9._/-]+\.(?:jpe?g|png|webp))/gi);
  } catch { /* index.html always exists, but stay quiet if it does not */ }
  try {
    add(readFileSync(path.join(ROOT, 'src', 'seo.js'), 'utf8'),
      /\bimage:\s*[^'"`]*['"`]\/?(assets\/[A-Za-z0-9._/-]+\.(?:jpe?g|png|webp))/g);
  } catch { /* optional */ }
  return set;
}

function widthCapFor(file) {
  const rel = path.relative(PUBLIC_DIR, file).split(path.sep).join('/');
  if (rel.startsWith('assets/logos/')) return 200;
  if (/ar7-logo/.test(rel)) return 480;
  // Page banners live at the top level of assets/ and run full-bleed, so they
  // keep more pixels than the card photos in the sub-folders.
  if (!rel.replace(/^assets\//, '').includes('/')) return Math.max(MAX_WIDTH, 1000);
  return MAX_WIDTH;
}

// Brand marks stay PNG on purpose: src/main.jsx builds logo URLs by string
// concatenation (`/assets/logos/<make>.png`), and the AR7 marks are referenced
// from static HTML, favicons and JSON-LD. Only photographs are converted.
function isBrandMark(file) {
  const rel = path.relative(PUBLIC_DIR, file).split(path.sep).join('/');
  return rel.startsWith('assets/logos/') || /^assets\/ar7-[^/]*\.png$/i.test(rel);
}

async function convert(file, sharp) {
  const before = statSync(file).size;
  const input = readFileSync(file);
  const meta = await sharp(input).metadata();
  let pipeline = sharp(input).rotate();
  const cap = widthCapFor(file);
  if ((meta.width || 0) > cap) pipeline = pipeline.resize({ width: cap, withoutEnlargement: true });
  const out = await pipeline.webp({ quality: QUALITY, effort: 5 }).toBuffer();
  if (out.length >= before * 0.9) return { before, after: before, changed: false };
  const target = file.replace(/\.(jpe?g|png|webp)$/i, '.webp');
  if (write) {
    writeFileSync(target, out);
    if (target !== file) unlinkSync(file);
  }
  return { before, after: out.length, changed: true, target };
}

async function recompress(file, sharp, social = false) {
  const before = statSync(file).size;
  if (before < MIN_BYTES) return { before, after: before, changed: false };
  const input = readFileSync(file);
  const meta = await sharp(input).metadata();
  let pipeline = sharp(input).rotate();
  const cap = widthCapFor(file);
  if (!social && (meta.width || 0) > cap && path.dirname(file) !== OG_DIR) {
    pipeline = pipeline.resize({ width: cap, withoutEnlargement: true });
  }
  // Only social cards and the favicon-sized mark stay in their original format
  // (see isBrandMark/socialCards); their quality is pinned so they never look
  // degraded.
  if (/\.png$/i.test(file)) pipeline = pipeline.png({ compressionLevel: 9, palette: true, quality: 84, effort: 7 });
  else if (/\.webp$/i.test(file)) pipeline = pipeline.webp({ quality: QUALITY, effort: 5 });
  else pipeline = pipeline.jpeg({ quality: social ? 70 : Math.min(QUALITY, 62), mozjpeg: true, progressive: true });
  const out = await pipeline.toBuffer();
  if (out.length >= before * (social ? 0.9 : 0.92)) return { before, after: before, changed: false };
  if (write) writeFileSync(file, out);
  return { before, after: out.length, changed: true, target: file };
}

// Rewrite every reference to a converted file. A converted photo keeps its
// folder and stem — only the extension changes — so a plain string replace of
// the public path is exact and safe.
function rewriteReferences(renames) {
  if (!renames.size) return 0;
  const roots = ['src', 'scripts', 'public', 'supabase', 'api', 'crm-preview'];
  const files = [...roots.flatMap(r => textFiles(path.join(ROOT, r))), path.join(ROOT, 'index.html'),
    ...readdirSync(ROOT).filter(f => f.endsWith('.md')).map(f => path.join(ROOT, f))];
  // Template-built paths (`/assets/gallery/x-${String(n).padStart(2,'0')}.webp`)
  // never contain a full file name, so renames alone cannot rewrite them. For
  // any folder whose photos all moved to WebP, rewrite the extension inside the
  // folder's asset paths too.
  const dirs = new Set([...renames.keys()].map(p => p.slice(0, p.lastIndexOf('/'))));
  const fullyConverted = [...dirs].filter(dir =>
    existsSync(path.join(PUBLIC_DIR, dir.replace(/^\//, ''))) &&
    !walk(path.join(PUBLIC_DIR, dir.replace(/^\//, ''))).some(f => /\.jpe?g$/i.test(f)));
  const dirPatterns = fullyConverted.map(dir =>
    [new RegExp(`(${dir.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/[\\s\\S]{0,200}?)\\.jpe?g\\b`, 'gi'), '$1.webp']);
  let touched = 0;
  for (const file of files) {
    let text;
    try { text = readFileSync(file, 'utf8'); } catch { continue; }
    let next = text;
    for (const [from, to] of renames) {
      if (next.includes(from)) next = next.split(from).join(to);
    }
    for (const [re, to] of dirPatterns) next = next.replace(re, to);
    if (next !== text) {
      touched++;
      if (write) writeFileSync(file, next);
      console.log(`  ${write ? '✓' : '·'} rewrote ${path.relative(ROOT, file)}`);
    }
  }
  return touched;
}

async function main() {
  const { default: sharp } = await import('sharp');
  const files = walk(PUBLIC_DIR).sort();
  let totalBefore = 0, totalAfter = 0;
  const renames = new Map();
  const social = socialCards();
  const changed = [], kept = [];
  for (const file of files) {
    const rel = path.relative(ROOT, file).split(path.sep).join('/');
    const publicPath = '/' + path.relative(PUBLIC_DIR, file).split(path.sep).join('/');
    const isOg = file.startsWith(OG_DIR + path.sep);
    // Photographs go WebP. og:image cards stay JPEG for social scrapers and
    // brand marks stay PNG (see isBrandMark).
    const isFavicon = /ar7-mark\.png$/i.test(file);
    const isSocial = isOg || social.has(publicPath);
    const convertToWebp = (/\.(jpe?g|png)$/i.test(file)) && !isSocial && !isFavicon && !isBrandMark(file);
    let result;
    try {
      result = convertToWebp ? await convert(file, sharp) : await recompress(file, sharp, isSocial);
    } catch (e) {
      kept.push(`  – ${rel}: left as-is (${e.message})`);
      const size = statSync(file).size;
      totalBefore += size; totalAfter += size;
      continue;
    }
    totalBefore += result.before;
    totalAfter += result.after;
    if (result.changed) {
      changed.push(`  ${write ? '✓' : '·'} ${rel}  ${kb(result.before)} → ${kb(result.after)}`);
      if (result.target && result.target !== file) {
        renames.set(publicPath, '/' + path.relative(PUBLIC_DIR, result.target).split(path.sep).join('/'));
      }
    } else {
      kept.push(`  – ${rel} (no gain)`);
    }
  }
  console.log(`\n  ${write ? 'WROTE' : 'DRY RUN'} — ${files.length} image(s): ${changed.length} improved, ${kept.length} kept`);
  console.log(changed.join('\n'));
  if (kept.length) console.log('\n  kept as-is:\n' + kept.slice(0, 15).join('\n') + (kept.length > 15 ? `\n  … and ${kept.length - 15} more` : ''));
  if (renames.size) {
    console.log(`\n  ${renames.size} file(s) change extension — ${write ? 'rewriting' : 'would rewrite'} references:`);
    for (const [from, to] of [...renames].slice(0, 8)) console.log(`    ${from} → ${to}`);
    if (renames.size > 8) console.log(`    … and ${renames.size - 8} more`);
    const touched = rewriteReferences(renames);
    console.log(`  ${write ? 'rewrote' : 'would rewrite'} ${touched} source file(s)`);
  }
  console.log(`\n  total: ${(totalBefore / 1048576).toFixed(2)} MB → ${(totalAfter / 1048576).toFixed(2)} MB`
    + (write ? ' (written)' : ' (nothing written — pass --write)') + '\n');
}

const isMain = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) main().catch(e => { console.error('  ✗ optimize-assets failed:', e.message); process.exit(1); });
