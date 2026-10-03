// Public-site routing.
//
// Vehicle details MUST survive a refresh. Two things historically broke that:
//   1. `#inventory?car=43` — many browsers keep only `#inventory` after reload
//      because `?` looks like a query string. Never put `?` in the hash.
//   2. Preview / iframe reloads that drop the pathname back to `/` or `/inventory`.
//
// We write the car into three places so any one of them is enough on reload:
//   • path   /inventory/STOCK
//   • hash   #/inventory/STOCK   (no question mark)
//   • sessionStorage last-open vehicle (restored only on an actual reload)

export const PAGES = new Set([
  'home', 'inventory', 'auction', 'services', 'brands', 'destinations', 'tools',
  'world', 'howbuy', 'news', 'about', 'reviews', 'faq', 'contact', 'account',
  'portal', 'crm', 'studio', 'shipping', 'japan-stock', 'machinery', 'seo'
]);

export const LAST_VEHICLE_KEY = 'ar7-open-vehicle';

export function decodeRef(ref) {
  if (ref == null || ref === '') return '';
  let raw = String(ref);
  try { raw = decodeURIComponent(raw); } catch { /* keep raw */ }
  // `#inventory%3Fcar%3D43` from browsers that encode the old query-in-hash.
  try { raw = decodeURIComponent(raw); } catch { /* already decoded */ }
  return raw;
}

import { carRef as _carRef, hrefFor as _hrefFor, machineHrefFor, brandFromSlug, slugify, carLandingPath } from './sitemap-helpers.js';
export const carRef = _carRef;
export const hrefFor = _hrefFor;

export { slugify };

/** Inverse of slugify for matching against inventory rows. */
export const unslug = value => String(value || '').trim().toLowerCase().replace(/[-_]+/g, ' ');

/**
 * Indexable brand/model landing pages — the structure that carries search
 * traffic for every car exporter (/cars/toyota, /cars/toyota/land-cruiser).
 * Returning a real path (not a query string) is what lets these rank: the
 * query-string filter view stays canonical to the path.
 */
export function carLandingHref(make, model) {
  return carLandingPath(make, model);
}

export function carSlug(c) {
  return [c?.year, c?.make, c?.model, c?.id]
    .filter(v => v != null && v !== '')
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function findCar(list, ref) {
  const raw = decodeRef(ref);
  if (!raw) return null;
  const lower = raw.toLowerCase();
  const num = Number(raw);
  const numOk = Number.isFinite(num) && String(num) === String(raw).trim();
  return (list || []).find(c => {
    if (c == null) return false;
    if (String(c.id) === raw) return true;
    if (numOk && Number(c.id) === num) return true;
    if (c.stock_no && String(c.stock_no) === raw) return true;
    if (c.sort_order != null && String(c.sort_order) === raw) return true;
    if (numOk && Number(c.sort_order) === num) return true;
    if (carSlug(c) === lower) return true;
    return false;
  }) || null;
}

function pathParts(pathname) {
  return String(pathname || '/').split('/').filter(Boolean);
}

function carFrom(...vals) {
  for (const v of vals) {
    const d = decodeRef(v);
    if (d) return d;
  }
  return null;
}

function parseHash(hash) {
  const raw = decodeRef(String(hash || '').replace(/^#/, ''));
  if (!raw) return { page: null, carId: null, make: null };
  const [hashPath, hashQuery = ''] = raw.split('?');
  const hashParts = pathParts('/' + (hashPath || '').replace(/^\/+/, ''));
  const hashParams = new URLSearchParams(hashQuery);
  const page = hashParts[0] || null;
  const carId = carFrom(
    (page === 'inventory' || page === 'news') ? hashParts[1] : null,
    hashParams.get('car'),
    hashParams.get('id')
  );
  return { page, carId, make: makeFrom(hashParams.get('make')) };
}

/** Brand filter carried in the URL as `?make=Toyota` (never in the hash). */
export function makeFrom(value) {
  const raw = decodeRef(value == null ? '' : value).trim();
  if (!raw) return null;
  if (/^(all|any)$/i.test(raw)) return null;
  return raw.slice(0, 40);
}

/**
 * Real, shareable href for "show me this brand's stock".
 *
 * 2026-10-03 (SEO): this used to return `/inventory?make=Toyota`. Filtered
 * query-string views have no independent ranking value and cannot be linked
 * from a sitemap, so brand links now point at the crawlable landing path
 * `/cars/toyota` (optionally `/cars/toyota/land-cruiser`). Old
 * `?make=` URLs still resolve — `parseRoute` reads them — and every page
 * canonicalises to the path form.
 */
export function inventoryHref(make, model) {
  const m = makeFrom(make);
  if (!m) return '/inventory';
  return carLandingHref(m, model);
}

export function parseRoute(loc = {}, { restoreOnReload = false } = {}) {
  const pathname = loc.pathname ?? '/';
  const search = loc.search ?? '';
  const hash = loc.hash ?? '';
  const params = new URLSearchParams(String(search).replace(/^\?/, ''));
  const parts = pathParts(pathname);
  const hashed = parseHash(hash);

  let page = null;
  let carId = null;
  let makeSlug = null;
  let modelSlug = null;
  let machineType = null;
  let machineRef = null;

  if (parts[0] === 'inventory') {
    page = 'inventory';
    carId = carFrom(parts[1], params.get('car'), hashed.carId);
  } else if (parts[0] === 'cars' && parts[1]) {
    // /cars/toyota and /cars/toyota/land-cruiser — indexable landing pages.
    // They render the inventory list with its filters pre-applied; the model
    // stays in `carModel` so the page can title itself correctly.
    page = 'inventory';
    makeSlug = parts[1];
    modelSlug = parts[2] || null;
  } else if (parts[0] === 'machinery' && parts[1]) {
    // /machinery/excavators, /machinery/loaders … — one indexable page per
    // equipment type, the way machinery marketplaces organise their catalogues.
    // /machinery/excavators/AR7-MC-001 is one machine: its own URL, its own
    // title, the same shape as /inventory/<ref> on the car side.
    page = 'machinery';
    machineType = unslug(parts[1]);
    machineRef = parts[2] ? decodeRef(parts[2]) : null;
  } else if (parts[0] && PAGES.has(parts[0])) {
    page = parts[0];
    carId = carFrom(parts[1], params.get('car'), hashed.carId);
  } else if (hashed.page && PAGES.has(hashed.page)) {
    page = hashed.page;
    carId = hashed.carId || carFrom(params.get('car'));
  } else if (!parts.length) {
    page = 'home';
    carId = carFrom(params.get('car'), hashed.carId);
  } else {
    page = parts[0];
    carId = carFrom(parts[1], params.get('car'), hashed.carId);
  }

  // The brand filter only means something on the inventory list. A deep link to
  // one car (`/inventory/43?make=Toyota`) must not filter the list behind it.
  const make = (page === 'inventory' && !carId)
    ? (brandFromSlug(decodeRef(makeSlug)) || makeFrom(params.get('make')) || hashed.make)
    : null;
  const model = (page === 'inventory' && !carId && modelSlug) ? unslug(modelSlug) : null;

  // A brand link is an explicit "show me this list" — never let the
  // last-open-vehicle restore hijack it into a detail page.
  // Only restore on an explicit boot-time reload check (`restoreOnReload`),
  // never during in-app navigation, popstate, or link href generation
  // (because `performance.getEntriesByType('navigation')[0].type === 'reload'`
  // stays true for the entire lifetime of a reloaded tab).
  if (!carId && !make && restoreOnReload && (page === 'inventory' || page === 'home' || !page)) {
    const saved = readLastVehicle();
    if (saved) {
      page = 'inventory';
      carId = saved;
    }
  }

  return { page: page || 'home', carId: carId || null, make, model, machineType, machineRef: machineRef || null };
}

/** Accepts navigate() strings: 'inventory', 'inventory?car=43', '/inventory/43', '#contact'. */
export function parseNavTarget(target) {
  const raw = String(target || '').trim();
  if (!raw || raw === '/' || raw === 'home' || raw === '#home' || raw === '#') {
    return { page: 'home', carId: null };
  }
  if (raw.startsWith('/')) {
    const [path, rest = ''] = raw.split('?');
    const [query, hash = ''] = rest.split('#');
    return parseRoute({
      pathname: path,
      search: query ? '?' + query : '',
      hash: hash ? '#' + hash : ''
    });
  }
  return parseRoute({ pathname: '/', search: '', hash: '#' + raw.replace(/^#/, '') });
}

/** Hash form that never contains `?`, so a refresh cannot strip the car. */
export function hashFor(page, carId) {
  if (!page || page === 'home') return '';
  if ((page === 'inventory' || page === 'news') && carId) {
    return '#/' + page + '/' + encodeURIComponent(String(carId));
  }
  return '#/' + page;
}

export function hrefFromTarget(target) {
  const r = typeof target === 'string' ? parseNavTarget(target) : (target || {});
  // A machine's own page has its own URL shape, like a car's. Without this the
  // href of every machinery <a> collapsed to /machinery, so the detail page was
  // unreachable by link — the bug the client-mount test now pins.
  if (r.page === 'machinery' && r.machineType) return machineHrefFor(r.machineType, r.machineRef);
  const href = hrefFor(r.page, r.carId);
  // Brand filters live in the query string, never in the hash (a `?` in the
  // hash is dropped by browsers on reload — see the note at the top).
  return r.make ? withSearch(href, 'make=' + encodeURIComponent(r.make)) : href;
}

export function withSearch(href, search) {
  const q = search instanceof URLSearchParams
    ? search.toString()
    : String(search || '').replace(/^\?/, '');
  if (!q) return href;
  return href + (href.includes('?') ? '&' : '?') + q;
}

export function canonicalHref(loc) {
  const route = parseRoute(loc);
  const params = new URLSearchParams(String(loc.search || '').replace(/^\?/, ''));
  params.delete('car');
  if (route.make) params.set('make', route.make);
  else params.delete('make');
  return withSearch(hrefFor(route.page, route.carId), params) + hashFor(route.page, route.carId);
}

/**
 * Click handler for real <a href> page links. A plain left-click is handled
 * in-app (SPA navigation); any other gesture — Ctrl/Cmd+click, Shift+click,
 * middle-click, right-click — falls through to the browser, so "Open link in
 * new tab / new window" works natively on every page link.
 */
export function linkClick(target, navigate, opts = {}) {
  return (e) => {
    if (e.defaultPrevented) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(target, opts);
  };
}

export function isReload() {
  try {
    const nav = performance.getEntriesByType?.('navigation')?.[0];
    if (nav) return nav.type === 'reload';
    return performance.navigation?.type === 1;
  } catch { return false; }
}

export function readLastVehicle() {
  try { return sessionStorage.getItem(LAST_VEHICLE_KEY) || null; }
  catch { return null; }
}

export function rememberVehicle(carId) {
  try {
    if (carId) sessionStorage.setItem(LAST_VEHICLE_KEY, String(carId));
    else sessionStorage.removeItem(LAST_VEHICLE_KEY);
  } catch { /* private mode */ }
}

export function writeLocation(page, carId, { replace = false, make = null, machineType = null, machineRef = null } = {}) {
  const params = new URLSearchParams(String(location.search || '').replace(/^\?/, ''));
  params.delete('car');
  const m = makeFrom(make);
  params.delete('make');
  // A brand view lives at its landing path now, so the address bar, the
  // canonical and the sitemap all agree on one URL per brand. A machine page
  // keeps its own path for the same reason: refresh, share and Back must all
  // land on the machine, never on the catalogue.
  const path = (page === 'machinery' && machineType)
    ? machineHrefFor(machineType, machineRef)
    : (m && page === 'inventory' && !carId) ? carLandingHref(m) : hrefFor(page, carId);
  const url = withSearch(path, params) + hashFor(page, carId);
  rememberVehicle(page === 'inventory' ? carId : null);
  const now = (typeof location === 'undefined')
    ? ''
    : location.pathname + (location.search || '') + (location.hash || '');
  if (now === url) return url;
  try {
    const fn = replace ? history.replaceState : history.pushState;
    fn.call(history, page === 'machinery' ? { page, carId, machineType, machineRef } : { page, carId }, '', url);
  } catch {
    try { location.hash = hashFor(page, carId).replace(/^#/, '') || ''; }
    catch { /* ignore */ }
  }
  return url;
}
