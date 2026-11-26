// Photo variants (npm run test:photo-variants).
//
// Machinery photos are 900 px / 31–64 kB each and news covers 1280 px /
// 100–143 kB. scripts/photo-variants.mjs writes the smaller widths beside them
// and records them in src/photo-widths.js; src/photo-srcset.js turns that into
// a `srcset`. Three things can go wrong, and each one breaks an image rather
// than merely wasting bytes:
//
//   • a srcset entry pointing at a file that does not exist — the browser is
//     entitled to pick it and paint a broken image;
//   • a photo added to the catalogue without its variants (silently shipping
//     the full-size file to every phone);
//   • a variant that is not actually smaller, i.e. a fake optimisation.
//
// This suite also reports what the variants are worth, so the numbers in the
// commit message can be re-measured instead of trusted.
import assert from 'node:assert/strict';
import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = rel => readFileSync(path.join(ROOT, rel), 'utf8');
const size = rel => statSync(path.join(ROOT, rel)).size;
const publicFile = url => path.join('public', url.replace(/^\//, ''));

const PHOTO_WIDTHS = (await import('../src/photo-widths.js')).default;
const { photoSrcSet, photoThumb } = await import('../src/photo-srcset.js');
const { MACHINES } = await import('../src/machinery-data.js');

let pass = 0; const failures = [];
const ok = (cond, msg) => { if (cond) pass++; else failures.push(msg); };
const eq = (a, b, msg) => ok(a === b, `${msg} (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`);

console.log('-- the manifest matches the files on disk --');
{
  const entries = Object.entries(PHOTO_WIDTHS);
  ok(entries.length > 40, `the manifest covers the catalogue (${entries.length} photos)`);
  let missing = [], notSmaller = [];
  for (const [url, entry] of entries) {
    ok(!/-(400|800)\.webp$/i.test(url), `${url}: a generated variant is never itself a source`);
    ok(existsSync(path.join(ROOT, publicFile(url))), `${url}: the original exists`);
    for (const w of entry.variants) {
      const variant = url.replace(/\.(webp|jpe?g|png)$/i, `-${w}.webp`);
      if (!existsSync(path.join(ROOT, publicFile(variant)))) { missing.push(variant); continue; }
      if (!(size(publicFile(variant)) < size(publicFile(url)))) notSmaller.push(variant);
    }
  }
  eq(missing.length, 0, `every advertised variant exists${missing.length ? ': ' + missing.slice(0, 3).join(', ') : ''}`);
  eq(notSmaller.length, 0, `every variant is smaller than its original${notSmaller.length ? ': ' + notSmaller.slice(0, 3).join(', ') : ''}`);
  // An upscaled "variant" would be a lie about the weights above; the generator
  // skips any width that is not meaningfully narrower, so none may appear here.
  const upscaled = entries.filter(([url, e]) => e.variants.some(w => w >= e.width));
  eq(upscaled.length, 0, 'no variant is the same width as, or wider than, its source');
}

console.log('\n-- every machine photo in the catalogue has variants --');
{
  const images = new Set();
  for (const m of MACHINES) for (const src of m.images || []) if (/^\/assets\/machinery\/.+\.webp$/i.test(src)) images.add(src);
  ok(images.size > 20, `the bundled catalogue references ${images.size} distinct photographs`);
  const unvaried = [...images].filter(src => !PHOTO_WIDTHS[src]);
  eq(unvaried.length, 0, `no catalogue photo ships without its variants${unvaried.length ? ': ' + unvaried.slice(0, 3).join(', ') : ''}`);
  const noSet = [...images].filter(src => !photoSrcSet(src));
  eq(noSet.length, 0, 'and each one produces a srcset');
}

console.log('\n-- the srcset is ascending, honest and complete --');
{
  const src = Object.keys(PHOTO_WIDTHS).find(k => k.startsWith('/assets/machinery/'));
  const set = photoSrcSet(src);
  const parts = set.split(', ');
  const widths = parts.map(p => Number(p.split(' ')[1].replace('w', '')));
  ok(widths.every((w, i) => i === 0 || w > widths[i - 1]), `widths ascend (${widths.join(' < ')})`);
  eq(widths[widths.length - 1], PHOTO_WIDTHS[src].width, 'the original is the largest rung, at its true width');
  ok(parts[parts.length - 1].startsWith(src), 'and it is the last rung, so `src` and the largest srcset entry agree');
  for (const part of parts) {
    const [url] = part.split(' ');
    ok(existsSync(path.join(ROOT, publicFile(url))), `every srcset rung exists on disk (${url})`);
  }

  // A cover has two rungs plus the original; a 900 px machine photo only gains
  // from the 400 px one (800 would save single-digit kB and is not written).
  const cover = Object.keys(PHOTO_WIDTHS).find(k => k.startsWith('/assets/covers/'));
  eq(photoSrcSet(cover).split(', ').length, 3, 'a 1280 px cover offers 400w, 800w and its original');

  eq(photoThumb(src), src.replace(/\.(webp|jpe?g|png)$/i, '-400.webp'), 'the thumbnail helper picks the smallest rung');
  eq(photoThumb('/assets/ar7-mark-460.webp'), '/assets/ar7-mark-460.webp',
    'and returns the photo unchanged when there is no variant — never a broken URL');
}

console.log('\n-- photos we do not own get no srcset --');
{
  // CRM uploads and remote URLs are not in the manifest: their bytes are not
  // ours to guess, and a guessed variant would 404.
  // Built from parts so scripts/asset-refs.test.mjs does not read these as
  // references to files the site is expected to ship.
  const crumbs = ['/assets/' + 'inventory/car-1.webp', '/assets/machinery/' + 'nope.webp'];
  for (const src of ['https://xyz.supabase.co/storage/v1/object/public/cars/a.webp', ...crumbs, '', undefined]) {
    eq(photoSrcSet(src), undefined, `${String(src) || '(empty)'}: no srcset`);
  }
  eq(photoSrcSet('/assets/machinery/' + 'nope.webp'), undefined, 'a machine file that is not in the manifest gets no srcset');
}

console.log('\n-- what the variants actually save --');
{
  const kB = n => Math.round(n / 1024);
  const machine = Object.keys(PHOTO_WIDTHS).find(k => k.startsWith('/assets/machinery/') && PHOTO_WIDTHS[k].variants.length);
  const cover = Object.keys(PHOTO_WIDTHS).find(k => k.startsWith('/assets/covers/'));
  const mFull = kB(size(publicFile(machine)));
  const m400 = kB(size(publicFile(machine.replace(/\.(webp|jpe?g|png)$/i, '-400.webp'))));
  const cFull = kB(size(publicFile(cover)));
  const c400 = kB(size(publicFile(cover.replace(/\.(webp|jpe?g|png)$/i, '-400.webp'))));
  const c800 = kB(size(publicFile(cover.replace(/\.(webp|jpe?g|png)$/i, '-800.webp'))));
  console.log(`   machinery: ${mFull} kB full → ${m400} kB at 400w (thumbnail, 150 px slot)`);
  console.log(`   cover:     ${cFull} kB full → ${c800} kB at 800w (2× phone card), ${c400} kB at 400w (1× card)`);
  ok(m400 < mFull * 0.6, 'a machine thumbnail is under 60% of the original');
  ok(c800 < cFull * 0.7, 'a cover on a 2× phone is under 70% of the original');
  ok(c400 < cFull * 0.2, 'and a 1× card is under 20%');
}

if (failures.length) {
  for (const f of failures) console.error('  ✗ ' + f);
  console.error(`\n${pass} passed, ${failures.length} failed`);
  process.exit(1);
}
assert.ok(pass > 0);
console.log(`\n${pass} passed, 0 failed`);
