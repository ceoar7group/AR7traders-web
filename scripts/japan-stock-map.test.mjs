#!/usr/bin/env node
// Unit tests for src/japan-stock-map.js — the dealer-row → site-car mapper.
//
//   node scripts/japan-stock-map.test.mjs
import {
  mapDealerRows, dealerImages, dealerPrice, importedCarId,
  isPromotedRow, isParkedRow, isImportedCar, IMPORTED_ID_PREFIX
} from '../src/japan-stock-map.js';

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name); }
}
function eq(a, b, name) {
  const same = JSON.stringify(a) === JSON.stringify(b);
  if (same) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error(`  ✗ ${name}\n      expected ${JSON.stringify(b)}\n      received ${JSON.stringify(a)}`); }
}

const row = {
  id: 'r1', goonet_id: '1001974A30260726W001', stock_no: '1001974A30260726W001',
  make: 'Mazda', model: 'CX-30 20S L Package', year: 2021, km: '41,000',
  fuel: 'Petrol', body: 'SUV', price: '$14,100', price_jpy: 2070000, price_usd: 14100,
  image: 'https://picture1.goo-net.com/100/1001974/J/a01.jpg',
  images: ['https://picture1.goo-net.com/100/1001974/J/a01.jpg', 'https://picture1.goo-net.com/100/1001974/J/a02.jpg'],
  grade: '4.0', status: 'New Arrival', location: 'Hiroshima',
  tr: 'AT', drv: '2WD', eng: '2,000cc', seats: 5, col: 'Gray Metallic', st: 'RHD',
  available: true, promoted: 'none'
};

console.log('\n-- ids and flags --');
eq(importedCarId(row), IMPORTED_ID_PREFIX + '1001974A30260726W001', 'the id is jdk-<goonet_id>');
eq(importedCarId({ stock_no: 'X1' }), 'jdk-X1', 'the stock number is the fallback id');
eq(importedCarId({}), null, 'a row with no id at all yields null');
ok(isPromotedRow({ promoted: 'listings' }) && isPromotedRow({ promoted: 'both' }) && !isPromotedRow({ promoted: 'vehicles' }),
  'promotion detection');
ok(isParkedRow({ rotation_state: 'parked' }) && !isParkedRow({ rotation_state: 'live' }) && !isParkedRow({}),
  'parked detection (missing rotation_state is live, never parked)');

console.log('\n-- the mapped car --');
const [car] = mapDealerRows([row]);
eq(car.id, 'jdk-1001974A30260726W001', 'mapped id');
eq(car.imported, true, 'imported: true (isShowroom excludes it)');
ok(isImportedCar(car) && !isImportedCar({ id: 1 }), 'isImportedCar only matches imported cars');
eq(car.stock_no, '1001974A30260726W001', 'stock number preserved for the detail URL');
eq(car.year, 2021, 'year is a number');
eq(car.price, '$14,100', 'the dealer price string is used as-is');
eq(car.photo_count, 2, 'photo count from the gallery');
eq(car.images.length, 2, 'gallery preserved');
eq(car.tr, 'AT', 'transmission preserved (already repaired at import time)');
eq(car.eng, '2,000cc', 'engine preserved');
eq(car.location, 'Hiroshima', 'location preserved');
ok(!('goonet_url' in car), 'the source URL is never mapped into the site car');

console.log('\n-- exclusion rules --');
eq(mapDealerRows([{ ...row, promoted: 'listings' }]).length, 0, 'a promoted row is not mapped again (already in site_listings)');
eq(mapDealerRows([{ ...row, promoted: 'both' }]).length, 0, 'promoted "both" is excluded too');
eq(mapDealerRows([{ ...row, available: false }]).length, 0, 'a delisted row is hidden');
eq(mapDealerRows([{ ...row, rotation_state: 'parked' }]).length, 0, 'a parked row is hidden');
eq(mapDealerRows([{ ...row, rotation_state: 'parked' }], { includeParked: true }).length, 1,
  'includeParked keeps it for CRM/dev tooling');
eq(mapDealerRows([null, undefined, {}]).length, 0, 'junk rows are skipped, never rendered');
eq(mapDealerRows(null).length, 0, 'a null payload yields no cars');
eq(mapDealerRows([row, { ...row, rotation_state: 'parked' }, { ...row, promoted: 'listings' }]).length, 1,
  'mixed payload: only the live unpromoted car is mapped');

console.log('\n-- honest fields (nothing invented) --');
const sparse = mapDealerRows([{ goonet_id: 'X9', available: true }])[0];
eq(sparse.make, null, 'a missing make stays null');
eq(sparse.year, null, 'a missing year stays null');
eq(sparse.price, null, 'a missing price stays null');
eq(sparse.images, [], 'no photos → empty gallery');
eq(sparse.image, null, 'no cover photo is invented');
eq(sparse.status, 'In Stock', 'status falls back to the site wording');
eq(sparse.location, 'Japan', 'location falls back to Japan');
eq(sparse.doors, undefined, 'doors are not set here (the site enrich pass owns them)');

console.log('\n-- helpers --');
eq(dealerImages({ images: '["a.jpg","b.jpg"]' }).length, 2, 'JSON-string galleries are parsed');
eq(dealerImages({ images: 'a.jpg, b.jpg' }), ['a.jpg', 'b.jpg'], 'comma galleries are split');
eq(dealerImages({ image: 'cover.jpg', images: ['x.jpg'] })[0], 'cover.jpg', 'the cover photo leads the gallery');
eq(dealerImages({}), [], 'no images → empty list');
eq(dealerPrice({ price_usd: 14100 }), '$14,100', 'price_usd is formatted when there is no display price');
eq(dealerPrice({ price_jpy: 2070000 }), null, 'a yen price alone is never converted into a made-up USD figure');
eq(dealerPrice({ price: '$0' }), '$0', 'an explicit display price is never rewritten');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
