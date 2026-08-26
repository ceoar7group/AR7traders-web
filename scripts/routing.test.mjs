import {
  parseRoute, parseNavTarget, hrefFor, hrefFromTarget, canonicalHref,
  findCar, carRef, carSlug
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

const legacySlash = parseRoute({ pathname: '/', hash: '#inventory/44', search: '' });
ok(legacySlash.page === 'inventory' && legacySlash.carId === '44', 'legacy #inventory/44 still opens the car');

ok(parseRoute({ pathname: '/', hash: '#contact', search: '' }).page === 'contact', 'legacy #contact still works');
ok(parseNavTarget('inventory?car=51').carId === '51', 'navigate("inventory?car=51") parses');
ok(parseNavTarget('inventory').page === 'inventory' && !parseNavTarget('inventory').carId, 'navigate("inventory") is the list');
ok(hrefFor('inventory', '43') === '/inventory/43', 'href for a car is a real path');
ok(hrefFromTarget('inventory?car=43') === '/inventory/43', 'old navigate target becomes /inventory/43');
ok(canonicalHref({ pathname: '/', hash: '#inventory?car=43', search: '' }) === '/inventory/43', 'canonical upgrade drops the hash');
ok(canonicalHref({ pathname: '/inventory/43', hash: '', search: '?embed=1' }) === '/inventory/43?embed=1', 'embed query is preserved');

const cars = [
  { id: 43, make: 'Toyota', model: 'Harrier S', year: 2023, stock_no: '0710232A30260801W001' },
  { id: 1, make: 'Rolls-Royce', model: 'Ghost', year: 2023 }
];
ok(findCar(cars, '43')?.make === 'Toyota', 'find by numeric id');
ok(findCar(cars, 43)?.make === 'Toyota', 'find by number id');
ok(findCar(cars, '0710232A30260801W001')?.id === 43, 'find by stock number');
ok(findCar(cars, carSlug(cars[0]))?.id === 43, 'find by slug');
ok(carRef(cars[0]) === '0710232A30260801W001', 'prefer stock number in the URL');
ok(carRef(cars[1]) === '1', 'fall back to id when no stock number');
ok(!findCar(cars, 'missing'), 'unknown ref returns null — do not silently pick another car');

console.log(failed ? `\n${failed} FAILURES` : '\nALL PASS');
process.exit(failed ? 1 : 0);
