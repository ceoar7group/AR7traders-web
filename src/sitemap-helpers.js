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

/**
 * The URL of one machine's own page: /machinery/<type-slug>/<REF>.
 *
 * Mirrors `hrefFor` for cars: the client router (src/routing.js), the
 * catalogue (src/machinery-data.js) and the sitemap must agree on one URL
 * shape, so all three call this rather than each building the string.
 */
export function machineHrefFor(type, ref) {
  if (!type) return '/machinery';
  const base = '/machinery/' + String(type).toLowerCase();
  return ref ? base + '/' + encodeURIComponent(String(ref)) : base;
}

export function hrefFor(page, carId) {
  if (!page || page === 'home') return '/';
  if ((page === 'inventory' || page === 'news') && carId) {
    return '/' + page + '/' + encodeURIComponent(String(carId));
  }
  return '/' + page;
}

/**
 * Canonical display name for a brand slug (`mercedes-benz` -> `Mercedes-Benz`).
 *
 * 2026-10-03 (SEO): landing paths carry slugs, but the inventory filter and
 * every heading must keep the real brand name. Kept here — not in seo.js —
 * because routing.js imports this file and seo.js imports routing.js, so a
 * lookup there would be a cycle.
 */
const BRAND_NAMES = {
  toyota: 'Toyota', lexus: 'Lexus', honda: 'Honda', nissan: 'Nissan', mazda: 'Mazda',
  'mercedes-benz': 'Mercedes-Benz', bmw: 'BMW', porsche: 'Porsche', 'land-rover': 'Land Rover',
  audi: 'Audi', suzuki: 'Suzuki', subaru: 'Subaru', mitsubishi: 'Mitsubishi', daihatsu: 'Daihatsu',
  'rolls-royce': 'Rolls-Royce', bentley: 'Bentley', lamborghini: 'Lamborghini', ferrari: 'Ferrari',
  bugatti: 'Bugatti', mclaren: 'McLaren', mini: 'MINI', volkswagen: 'Volkswagen', ford: 'Ford',
  chevrolet: 'Chevrolet', hyundai: 'Hyundai', kia: 'Kia', volvo: 'Volvo', jeep: 'Jeep'
};

export function brandFromSlug(slug) {
  const key = String(slug || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!key) return null;
  if (BRAND_NAMES[key]) return BRAND_NAMES[key];
  // Unknown make: title-case the slug so an odd brand still reads properly
  // instead of showing a raw URL fragment in a heading.
  return key.split('-').map(w => w ? w[0].toUpperCase() + w.slice(1) : w).join('-');
}

/** URL slug for a make or model name: "Land Cruiser" -> "land-cruiser". */
export function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * The indexable landing path for a brand (and optionally a model):
 *   carLandingPath('Toyota')                  -> '/cars/toyota'
 *   carLandingPath('Toyota', 'Land Cruiser')  -> '/cars/toyota/land-cruiser'
 * Shared with the serverless sitemap so a crawl target and a link can never
 * drift apart.
 */
export function carLandingPath(make, model) {
  const m = slugify(make);
  if (!m) return '/inventory';
  return '/cars/' + m + (model ? '/' + slugify(model) : '');
}
