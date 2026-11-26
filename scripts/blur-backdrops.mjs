// Pre-blurred hero backdrops (2026-11-13, performance round).
//
// Machine slides in the home hero fit with object-fit:contain and fill the
// space around the machine with a blurred copy of the same photo. That blur
// used to be CSS `filter: blur(22px) brightness(.72) saturate(1.08)` applied
// at paint time — and a live filter anywhere inside an animated slide stops
// Chrome from compositing the slide's transform/opacity transitions
// (Lighthouse: "non-composited animations", "minimize main-thread work").
//
// This script bakes that exact look into a tiny 28px-wide `.blurbg.webp`
// variant of every machinery photo at build time. The browser's own upscale
// of a 28px image IS the blur; brightness and saturation are baked with
// sharp. The hero then renders the backdrop with `filter: none` and the
// compositor animates the slide on the GPU.
//
// Idempotent and incremental: existing variants newer than their source are
// skipped, so the step costs ~nothing on unchanged trees. New machinery
// photos (CRM sync commits them under public/assets/machinery/) get their
// variant on the next build automatically.
import {readdir, stat} from 'node:fs/promises';
import {join} from 'node:path';
import sharp from 'sharp';

const DIR = new URL('../public/assets/machinery/', import.meta.url).pathname;
const sources = (await readdir(DIR)).filter(f => f.endsWith('.webp') && !f.endsWith('.blurbg.webp'));
let made = 0;
for (const f of sources) {
  const src = join(DIR, f);
  const out = join(DIR, f.replace(/\.webp$/, '.blurbg.webp'));
  const [s, o] = await Promise.all([stat(src), stat(out).catch(() => null)]);
  if (o && o.mtimeMs >= s.mtimeMs) continue;
  await sharp(src)
    .resize(28)                                   // the upscale is the blur
    .blur(1)                                      // soften the 28px grid itself
    .modulate({brightness: .72, saturation: 1.08}) // match the old CSS filter
    .webp({quality: 50})
    .toFile(out);
  made++;
}
console.log(`blur-backdrops: ${made} generated, ${sources.length - made} up to date.`);
