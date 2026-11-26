// Responsive photographs for the photos the site owns.
//
// Every machinery photograph and news cover used to ship one file at full
// width: six machinery cards on a phone pulled ~250 kB of 900 px images into
// 390 px slots, and a /news card pulled a 1280 px, 100–143 kB cover.
//
// scripts/photo-variants.mjs writes the smaller widths beside the originals and
// records them in photo-widths.js. That manifest is the whole reason this
// module is safe: a `srcset` entry pointing at a file that does not exist is
// worse than no srcset at all — the browser is entitled to pick it and show a
// broken image. Anything not in the manifest (CRM uploads, remote URLs, photos
// added without running the script) gets no srcset and simply uses `src`.
//
//   npm run photos          regenerate the variants and the manifest
//   npm run test:photo-variants -- --check   fail if they drift
import PHOTO_WIDTHS from './photo-widths.js';

/** Width-labelled variants of one photo, smallest first, original last. */
const ladder = src => {
  const entry = PHOTO_WIDTHS[src];
  if (!entry || !Array.isArray(entry.variants) || !entry.variants.length) return null;
  const rungs = entry.variants
    .map(Number)
    .filter(w => Number.isFinite(w) && w > 0)
    // Variants are always .webp, whatever the source was: a 149 kB JPEG cover
    // becomes a 20 kB webp at 400w.
    .map(w => ({ width: w, path: src.replace(/\.(webp|jpe?g|png)$/i, `-${w}.webp`) }));
  if (Number(entry.width) > 0) rungs.push({ width: Number(entry.width), path: src });
  return rungs.sort((a, b) => a.width - b.width);
};

/** `srcSet` for a photo we own, or undefined for one we do not. Pair it with a
 *  `sizes` attribute: without one the browser assumes 100vw. */
export function photoSrcSet(src) {
  const rungs = ladder(src);
  if (!rungs) return undefined;
  // Ascending widths, no duplicate paths (a browser picking from a descending
  // srcset resolves it badly), so what the phone downloads is the smallest file
  // that covers its real pixels.
  const seen = new Set();
  return rungs
    .filter(({ path }) => !seen.has(path) && seen.add(path))
    .map(({ width, path }) => `${path} ${width}w`)
    .join(', ');
}

/** The smallest variant, for slots that never grow (thumbnails): ~14–20 kB
 *  instead of the 31–64 kB original. Falls back to the photo itself. */
export function photoThumb(src) {
  const rungs = ladder(src);
  return rungs && rungs.length ? rungs[0].path : src;
}
