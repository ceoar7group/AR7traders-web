// Path-based routing for the public site.
//
// Vehicle details used to live at `#inventory?car=43`. A full refresh parses
// that as "inventory page, no car", which dumps the visitor back at the top of
// the stock list. Real paths (`/inventory/43` or `/inventory/STOCK-NO`) survive
// refresh because Vercel already rewrites every non-API path to index.html,
// and Vite's dev server does the same.
//
// Legacy hashes (`#inventory?car=43`, `#contact`, …) still resolve so old
// bookmarks and WhatsApp links keep working; we canonicalize them onto a path.

export const PAGES = new Set([
  'home', 'inventory', 'auction', 'services', 'brands', 'destinations', 'tools',
  'world', 'howbuy', 'news', 'about', 'reviews', 'faq', 'contact', 'account',
  'portal', 'crm', 'studio', 'shipping'
]);

export function decodeRef(ref) {
  if (ref == null || ref === '') return '';
  try { return decodeURIComponent(String(ref)); }
  catch { return String(ref); }
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
    if (carSlug(c) === lower) return true;
    return false;
  }) || null;
}

function pathParts(pathname) {
  return String(pathname || '/').split('/').filter(Boolean);
}

export function parseRoute(loc = {}) {
  const pathname = loc.pathname ?? '/';
  const search = loc.search ?? '';
  const hash = loc.hash ?? '';
  const params = new URLSearchParams(String(search).replace(/^\?/, ''));
  const parts = pathParts(pathname);

  const hashRaw = String(hash).replace(/^#/, '');
  const [hashPath, hashQuery = ''] = hashRaw.split('?');
  const hashParts = pathParts('/' + (hashPath || ''));
  const hashParams = new URLSearchParams(hashQuery);

  const carFrom = (...vals) => {
    for (const v of vals) {
      const d = decodeRef(v);
      if (d) return d;
    }
    return null;
  };

  if (parts[0] === 'inventory') {
    return { page: 'inventory', carId: carFrom(parts[1], params.get('car')) };
  }
  if (parts[0] && PAGES.has(parts[0])) {
    return { page: parts[0], carId: carFrom(parts[1], params.get('car')) };
  }

  // Legacy hash / query bookmarks.
  if (hashParts[0] === 'inventory') {
    return { page: 'inventory', carId: carFrom(hashParts[1], hashParams.get('car'), params.get('car')) };
  }
  if (hashParts[0] && PAGES.has(hashParts[0])) {
    return { page: hashParts[0], carId: carFrom(hashParts[1], hashParams.get('car')) };
  }

  if (!parts.length) {
    return { page: 'home', carId: carFrom(params.get('car')) };
  }

  return { page: parts[0], carId: carFrom(parts[1], params.get('car')) };
}

/** Accepts navigate() strings: 'inventory', 'inventory?car=43', '/inventory/43', '#contact'. */
export function parseNavTarget(target) {
  const raw = String(target || '').trim();
  if (!raw || raw === '/' || raw === 'home' || raw === '#home' || raw === '#') {
    return { page: 'home', carId: null };
  }
  if (raw.startsWith('/')) {
    const [path, query = ''] = raw.split('?');
    return parseRoute({ pathname: path, search: query ? '?' + query : '', hash: '' });
  }
  return parseRoute({ pathname: '/', search: '', hash: '#' + raw.replace(/^#/, '') });
}

export function hrefFor(page, carId) {
  if (!page || page === 'home') return '/';
  if (page === 'inventory' && carId) return '/inventory/' + encodeURIComponent(String(carId));
  return '/' + page;
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

/** Clean path a refresh can round-trip, keeping extra query flags such as embed=1. */
export function canonicalHref(loc) {
  const route = parseRoute(loc);
  const params = new URLSearchParams(String(loc.search || '').replace(/^\?/, ''));
  params.delete('car');
  return withSearch(hrefFor(route.page, route.carId), params);
}
