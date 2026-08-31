import {
  parseRoute, parseNavTarget, hrefFor, hrefFromTarget, canonicalHref,
  findCar, carRef, carSlug, hashFor, writeLocation, makeFrom, inventoryHref,
  LAST_VEHICLE_KEY
} from '../src/routing.js';

let failed = 0;
const ok = (cond, msg) => {
  if (!cond) { failed++; console.error('FAIL:', msg); }
  else console.log('ok  :', msg);
};

ok(parseRoute({ pathname: '/', hash: '', search: '' }).page === 'home', 'bare path is home');
ok(parseRoute({ pathname: '/inventory', hash: '', search: '' }).page === 'inventory', '/inventory is inventory');
ok(parseRoute({ pathname: '/inventory/43', hash: '', search: '' }).carId === '43', '/inventory/43 keeps the car id');
ok(parseRoute({ pathname: '/inventory/0710232A30260801W001', hash: '', search: '' }).carId === '0710232A30260801W001', 'stock numbers stay in the path');

const legacy = parseRoute({ pathname: '/', hash: '#inventory?car=43', search: '' });
ok(legacy.page === 'inventory' && legacy.carId === '43', 'legacy #inventory?car=43 still opens the car');

const encoded = parseRoute({ pathname: '/', hash: '#inventory%3Fcar%3D43', search: '' });
ok(encoded.page === 'inventory' && encoded.carId === '43', 'encoded #inventory%3Fcar%3D43 still opens the car');

const dual = parseRoute({ pathname: '/inventory/43', hash: '#/inventory/43', search: '' });
ok(dual.page === 'inventory' && dual.carId === '43', 'path + #/inventory/43 dual-write still opens the car');

const hashOnly = parseRoute({ pathname: '/', hash: '#/inventory/43', search: '' });
ok(hashOnly.page === 'inventory' && hashOnly.carId === '43', '#/inventory/43 (no question mark) opens the car');

const stripped = parseRoute({ pathname: '/', hash: '#inventory', search: '' });
ok(stripped.page === 'inventory' && !stripped.carId, 'stripped #inventory is the list when nothing is saved');

const legacySlash = parseRoute({ pathname: '/', hash: '#inventory/44', search: '' });
ok(legacySlash.page === 'inventory' && legacySlash.carId === '44', 'legacy #inventory/44 still opens the car');

ok(parseRoute({ pathname: '/', hash: '#contact', search: '' }).page === 'contact', 'legacy #contact still works');
ok(parseNavTarget('inventory?car=51').carId === '51', 'navigate("inventory?car=51") parses');
ok(parseNavTarget('inventory').page === 'inventory' && !parseNavTarget('inventory').carId, 'navigate("inventory") is the list');
ok(hrefFor('inventory', '43') === '/inventory/43', 'href for a car is a real path');
ok(hashFor('inventory', '43') === '#/inventory/43', 'hash for a car never contains ?');
ok(!hashFor('inventory', '43').includes('?'), 'vehicle hash has no question mark');
ok(hrefFromTarget('inventory?car=43') === '/inventory/43', 'old navigate target becomes /inventory/43');
ok(canonicalHref({ pathname: '/', hash: '#inventory?car=43', search: '' }) === '/inventory/43#/inventory/43', 'canonical upgrade writes path and safe hash');
ok(canonicalHref({ pathname: '/inventory/43', hash: '', search: '?embed=1' }) === '/inventory/43?embed=1#/inventory/43', 'embed query is preserved next to the hash');

// ---- Brand filter: /inventory?make=Toyota ---------------------------------
// The header's Brands dropdown must produce a real link that survives a
// refresh, a new tab and a copy/paste — not an in-memory "pending" variable.
ok(makeFrom('Toyota') === 'Toyota', 'makeFrom keeps a real brand');
ok(makeFrom('All') === null && makeFrom('') === null && makeFrom(null) === null, 'makeFrom drops the "All" placeholder');
ok(inventoryHref('Toyota') === '/inventory?make=Toyota', 'brand link is a real inventory URL');
ok(inventoryHref('All') === '/inventory', '"All brands" links to the plain list');
ok(inventoryHref('Mercedes-Benz') === '/inventory?make=Mercedes-Benz', 'hyphenated brands stay intact');

const brandQuery = parseRoute({ pathname: '/inventory', hash: '', search: '?make=Toyota' });
ok(brandQuery.page === 'inventory' && brandQuery.make === 'Toyota' && !brandQuery.carId, '/inventory?make=Toyota carries the brand filter');
ok(parseNavTarget('/inventory?make=Nissan').make === 'Nissan', 'navigate("/inventory?make=Nissan") parses the brand');
ok(parseNavTarget('inventory?make=Nissan').make === 'Nissan', 'navigate("inventory?make=Nissan") parses the brand');
ok(hrefFromTarget('inventory?make=Nissan') === '/inventory?make=Nissan', 'brand navigate target becomes a shareable href');
ok(!hashFor('inventory', null).includes('?'), 'brand hash still never contains ?');
ok(!hrefFromTarget('inventory?make=Nissan').includes('#'), 'brand href keeps the filter out of the hash');

const brandAndCar = parseRoute({ pathname: '/inventory/43', hash: '', search: '?make=Toyota' });
ok(!brandAndCar.make && brandAndCar.carId === '43', 'a car deep link ignores the brand filter behind it');

ok(canonicalHref({ pathname: '/inventory', hash: '', search: '?make=Toyota&embed=1' }) === '/inventory?make=Toyota&embed=1#/inventory', 'canonical keeps the brand filter with other query params');

// writeLocation must persist the filter (and clear it when we leave the list).
const store = { [LAST_VEHICLE_KEY]: '51' };
globalThis.sessionStorage = {
  getItem: k => store[k] || null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
let pushed = '';
globalThis.location = { pathname: '/', search: '', hash: '', origin: 'https://ar7traders.com' };
globalThis.history = { pushState: (s, t, url) => { pushed = url; }, replaceState: (s, t, url) => { pushed = url; } };
ok(writeLocation('inventory', null, { make: 'Toyota' }) === '/inventory?make=Toyota#/inventory', 'writeLocation writes the brand filter into the URL');
ok(pushed === '/inventory?make=Toyota#/inventory', 'the brand filter reaches history.pushState');
location.pathname = '/inventory'; location.search = '?make=Toyota'; location.hash = '#/inventory';
ok(writeLocation('inventory', null) === '/inventory#/inventory', 'leaving a brand clears ?make from the URL');
location.search = ''; location.hash = '';
ok(writeLocation('inventory', '43', { make: 'Toyota' }) === '/inventory/43#/inventory/43', 'opening a car drops the brand filter from the URL');
ok(parseRoute({ pathname: '/inventory', hash: '', search: '?make=Toyota' }, { restoreOnReload: true }).carId === null, 'a brand link is never hijacked by the last-open vehicle');

store[LAST_VEHICLE_KEY] = '51'; // the writeLocation calls above clear it
const restored = parseRoute({ pathname: '/', hash: '', search: '' }, { restoreOnReload: true });
ok(restored.page === 'inventory' && restored.carId === '51', 'reload of / restores the last open vehicle');
const restoredHash = parseRoute({ pathname: '/', hash: '#inventory', search: '' }, { restoreOnReload: true });
ok(restoredHash.page === 'inventory' && restoredHash.carId === '51', 'reload of #inventory restores the last open vehicle');

const cars = [
  { id: 'uuid-43', make: 'Toyota', model: 'Harrier S', year: 2023, stock_no: '0710232A30260801W001', sort_order: 43 },
  { id: 1, make: 'Rolls-Royce', model: 'Ghost', year: 2023 }
];
ok(findCar(cars, '43')?.make === 'Toyota', 'find by sort_order when CRM keeps uuid ids');
ok(findCar(cars, 43)?.make === 'Toyota', 'find by number sort_order');
ok(findCar(cars, '0710232A30260801W001')?.id === 'uuid-43', 'find by stock number');
ok(findCar(cars, carSlug(cars[0]))?.id === 'uuid-43', 'find by slug');
ok(carRef(cars[0]) === '0710232A30260801W001', 'prefer stock number in the URL');
ok(carRef(cars[1]) === '1', 'fall back to id when no stock number');
ok(!findCar(cars, 'missing'), 'unknown ref returns null — do not silently pick another car');

console.log(failed ? `\n${failed} FAILURES` : '\nALL PASS');
process.exit(failed ? 1 : 0);
