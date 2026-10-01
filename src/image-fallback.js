// Photo-path fallback for the 2026-10 WebP pass.
//
// The image pass (B1) renamed 40 photographs in public/assets from `.jpg` to
// `.webp` and rewrote every reference in the repository — but not the rows
// already stored in Supabase. A car uploaded before the pass therefore asks for
// `/assets/….jpg`, which no longer exists on disk, and the browser shows the
// ALT text instead of a photo. Cars uploaded after the pass are fine.
//
// Three layers repair that, and this file is the middle one:
//
//   1. vercel.json rewrites each renamed photo's old URL to its .webp sibling
//      (network layer — covers the deployed site);
//   2. this module retries the <img> once against the sibling extension
//      (app layer — covers any host the rewrites do not reach, and any image
//      whose URL arrives with a query string the rewrite does not match);
//   3. supabase/MIGRATION-2026-10-image-paths.sql cleans the stored paths
//      (database layer — the actual fix).
//
// All three are generated from scripts/image-paths.mjs, so they cannot drift;
// scripts/image-fallback.test.mjs is the guard.
//
// The retry fires once and only once per element. A photo that is genuinely
// missing must not ping-pong between two extensions on every scroll.

// Extensions the rename actually moved. `.png` is deliberately absent: brand
// marks must stay PNG — src/main.jsx builds logo URLs by string concatenation
// (`/assets/logos/<make>.png`) and swapping one for a JPEG changes how the mark
// renders. Logos keep their own fallback (logoOnError in src/site-header.jsx).
const SIBLING_EXTENSIONS = [
  [/\.jpe?g$/i, '.webp'],
  [/\.webp$/i, '.jpg']
];

// Dataset flag set on an element that has already had its one retry. Other
// onError handlers in the app read this so they do not fight this module:
// see the guards in src/main.jsx and src/crm.jsx.
export const RETRY_FLAG = 'imgFb';

/** The sibling-extension URL for a photo path, or '' when there is none. */
export function siblingSrc(src) {
  const url = src == null ? '' : String(src);
  if (!url || /^(data|blob):/i.test(url)) return '';
  for (const [pattern, extension] of SIBLING_EXTENSIONS) {
    if (pattern.test(url)) return url.replace(pattern, extension);
  }
  return '';
}

/** True once an element has had its one retry (or has none to make). */
export function hasRetried(el) {
  return !!(el && el.dataset && el.dataset[RETRY_FLAG]);
}

/**
 * onError handler: retry the image once against its sibling extension.
 * Safe to attach directly (`<img onError={imageFallback}>`) or to install
 * globally with installImageFallback(). Returns true when it swapped the src.
 */
export function imageFallback(event) {
  const el = event && (event.currentTarget || event.target);
  if (!el || el.tagName !== 'IMG') return false;
  // One retry per element, ever.
  if (hasRetried(el)) return false;
  el.dataset[RETRY_FLAG] = '1';

  const next = siblingSrc(el.getAttribute && el.getAttribute('src'));
  if (!next) return false;
  el.src = next;
  return true;
}

/**
 * Catches every <img> error in the document, including ones no component
 * wires a handler for. Installed once per document; calling it again is a
 * no-op. `error` does not bubble, so the listener has to capture.
 */
export function installImageFallback(doc) {
  const root = doc || (typeof document === 'undefined' ? null : document);
  if (!root || root.__ar7ImageFallback) return false;
  root.__ar7ImageFallback = true;
  root.addEventListener('error', imageFallback, true);
  return true;
}
