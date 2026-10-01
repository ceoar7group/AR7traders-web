// Shared helpers for vehicle URL building — used by BOTH client routing
// (src/routing.js) and server sitemap (api/site-content.js).
//
// Extracted 2026-09-29 to deduplicate carRef/hrefFor that were previously
// inlined in two places and pinned by scripts/sitemap-vehicles.test.mjs.
// The pin remains valid: both originals now import from here, so the test
// still guarantees the URLs match.
//
// Keep this module tiny and dependency-free — it must work in both Vite
// (browser) and Vercel Serverless (Node) runtimes.

export function carRef(c) {
  if (!c) return '';
  const stock = c.stock_no && String(c.stock_no).trim();
  return stock || String(c.id);
}

export function hrefFor(page, carId) {
  if (!page || page === 'home') return '/';
  if ((page === 'inventory' || page === 'news') && carId) {
    return '/' + page + '/' + encodeURIComponent(String(carId));
  }
  return '/' + page;
}
