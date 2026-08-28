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
  'portal', 'crm', 'studio', 'shipping'
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

export function carSlug(c) {
  return [c?.year, c?.make, c?.model, c?.id]
    .filter(v => v != null && v !== '')
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function carRef(c) {
  if (!c) return '';
  const stock = c.stock_no && String(c.stock_no).trim();
  return stock || String(c.id);
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
  if (!raw) return { page: null, carId: null };
  const [hashPath, hashQuery = ''] = raw.split('?');
  const hashParts = pathParts('/' + (hashPath || '').replace(/^\/+/, ''));
  const hashParams = new URLSearchParams(hashQuery);
  const page = hashParts[0] || null;
  const carId = carFrom(
    page === 'inventory' ? hashParts[1] : null,
    hashParams.get('car'),
    hashParams.get('id')
  );
  return { page, carId };
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

  if (parts[0] === 'inventory') {
    page = 'inventory';
    carId = carFrom(parts[1], params.get('car'), hashed.carId);
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

  if (!carId && (restoreOnReload || isReload()) && (page === 'inventory' || page === 'home' || !page)) {
    const saved = readLastVehicle();
    if (saved) {
      page = 'inventory';
      carId = saved;
    }
  }

  return { page: page || 'home', carId: carId || null };
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

export function hrefFor(page, carId) {
  if (!page || page === 'home') return '/';
  if (page === 'inventory' && carId) return '/inventory/' + encodeURIComponent(String(carId));
  return '/' + page;
}

/** Hash form that never contains `?`, so a refresh cannot strip the car. */
export function hashFor(page, carId) {
  if (!page || page === 'home') return '';
  if (page === 'inventory' && carId) return '#/inventory/' + encodeURIComponent(String(carId));
  return '#/' + page;
}

export function hrefFromTarget(target) {
  const r = typeof target === 'string' ? parseNavTarget(target) : (target || {});
  return hrefFor(r.page, r.carId);
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

export function writeLocation(page, carId, { replace = false } = {}) {
  const params = new URLSearchParams(String(location.search || '').replace(/^\?/, ''));
  params.delete('car');
  const url = withSearch(hrefFor(page, carId), params) + hashFor(page, carId);
  rememberVehicle(page === 'inventory' ? carId : null);
  const now = (typeof location === 'undefined')
    ? ''
    : location.pathname + (location.search || '') + (location.hash || '');
  if (now === url) return url;
  try {
    const fn = replace ? history.replaceState : history.pushState;
    fn.call(history, { page, carId }, '', url);
  } catch {
    try { location.hash = hashFor(page, carId).replace(/^#/, '') || ''; }
    catch { /* ignore */ }
  }
  return url;
}
