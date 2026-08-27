import {
  parseRoute, parseNavTarget, hrefFor, hrefFromTarget, canonicalHref,
  findCar, carRef, carSlug, hashFor, LAST_VEHICLE_KEY
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

const store = { [LAST_VEHICLE_KEY]: '51' };
globalThis.sessionStorage = {
  getItem: k => store[k] || null,
  setItem: (k, v) => { store[k] = String(v); },
  removeItem: k => { delete store[k]; }
};
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
