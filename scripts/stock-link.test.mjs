// Stock links for staff replies (npm run test:stock-link).
//
// The CRM's WhatsApp desk inserts a listing link into a reply. What the customer
// receives is therefore the public page's own forward text plus the listing URL
// — and WhatsApp renders the 1200×630 card behind that URL only because
// api/_wa.js sends with preview_url: true.
//
// This suite pins the three things that can go wrong in a staff-facing tool:
//   • a link to a car the site is not showing (sold, draft, unpublished);
//   • a reference that does not match the URL the card is keyed by;
//   • a message that claims more than the listing says.
import assert from 'node:assert/strict';

const { stockRefOf, publishedStock, matchStock, stockLinkFor, appendStockLink } =
  await import('../src/stock-link.js');
const { vehicleShareMessage } = await import('../src/vehicle-actions.jsx');

let pass = 0; const failures = [];
const ok = (cond, msg) => { if (cond) pass++; else failures.push(msg); };
const eq = (a, b, msg) => ok(a === b, `${msg} (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`);

const CAR = {
  id: 7, stock_no: 'AR7-0007', make: 'Toyota', model: 'Harrier S', year: 2019,
  price: '$12,500', status: 'In Stock', published: true
};
const SOLD = { id: 8, stock_no: 'AR7-SOLD', make: 'Nissan', model: 'Note', year: 2017, price: '$6,000', status: 'Sold', published: true };
const DRAFT = { id: 9, stock_no: 'AR7-DRAFT', make: 'Honda', model: 'Fit', year: 2018, published: false };
const NO_STOCK_NO = { id: 42, make: 'Suzuki', model: 'Every', year: 2020, published: true };

console.log('-- the reference a link is built from is the site\'s own --');
{
  eq(stockRefOf(CAR), 'AR7-0007', 'a listing with a stock number uses it');
  eq(stockRefOf(NO_STOCK_NO), 'AR7-26042', 'a listing without one uses the same row-id fallback the public site derives');
  eq(stockRefOf(null), null, 'and no row means no reference');
  eq(stockRefOf({ id: 1, stock_no: '   ' }), 'AR7-26001', 'a blank stock number is not treated as a reference');
}

console.log('\n-- only stock the website shows may be offered --');
{
  eq(publishedStock([CAR, DRAFT]).length, 1, 'an unpublished draft is not offered');
  eq(publishedStock([CAR, ...(SOLD ? [SOLD] : [])]).length, 2,
    'a sold car stays reachable (the site lists it until it is removed) — the desk decides');
  eq(publishedStock(null).length, 0, 'no rows is an empty list, not a crash');
  ok(matchStock([CAR, DRAFT], '').every(c => c.published !== false), 'the picker never lists a draft');

  eq(matchStock([CAR], 'toyota').length, 1, 'a make finds the car');
  eq(matchStock([CAR], 'harrier').length, 1, 'a model finds the car');
  eq(matchStock([CAR], 'ar7-0007').length, 1, 'the stock reference finds the car');
  eq(matchStock([CAR], '2019').length, 1, 'the year finds the car');
  eq(matchStock([CAR], 'toyota 2019').length, 1, 'every word must match, so two words narrow rather than widen');
  eq(matchStock([CAR], 'toyota 2021').length, 0, 'and a word that matches nothing excludes the car');
  eq(matchStock([CAR], 'nissan').length, 0, 'another make does not match');
  eq(matchStock([CAR], '  HARRIER  ').length, 1, 'search is trimmed and case-insensitive');
  eq(matchStock(Array.from({ length: 20 }, (_, i) => ({ ...CAR, id: i, stock_no: 'AR7-' + i })), '').length, 8,
    'an empty query lists at most eight rows');
  eq(matchStock([CAR], '', 0).length, 0, 'and the limit is honoured');
}

console.log('\n-- the inserted message is the page\'s own --');
{
  const link = stockLinkFor(CAR, 'https://ar7traders.com');
  eq(link, `${vehicleShareMessage(CAR, 'AR7-0007')} https://ar7traders.com/inventory/AR7-0007`,
    'the link text is the public forward text plus the absolute listing URL');
  ok(link.includes('$12,500 FOB'), 'the published price is carried, labelled FOB');
  ok(!/verified|guarantee|best price/i.test(link), 'no claim the listing does not make');
  ok(stockLinkFor(CAR, 'https://ar7traders.com/').endsWith('/inventory/AR7-0007'),
    'a trailing slash on the origin does not double up');
  ok(stockLinkFor({ ...CAR, stock_no: 'AR7 7/../x' }).includes('/inventory/AR7%207%2F..%2Fx'),
    'a reference is URL-encoded, so a hostile value cannot climb out of the path');
  ok(!stockLinkFor(DRAFT).includes('/inventory/'), 'a draft with no reference gets text but no link');
  ok(stockLinkFor(NO_STOCK_NO, 'https://ar7traders.com').includes('/inventory/AR7-26042'),
    'a listing without a stock number links to the same reference the page uses');

  eq(appendStockLink('', CAR, 'https://ar7traders.com'), stockLinkFor(CAR), 'an empty draft becomes the link');
  eq(appendStockLink('   ', CAR, 'https://ar7traders.com'), stockLinkFor(CAR), 'whitespace counts as empty');
  eq(appendStockLink('Thanks for your message.\n', CAR, 'https://ar7traders.com'),
    `Thanks for your message.\n${stockLinkFor(CAR)}`,
    'an existing draft keeps its own wording and gets the link on a new line');
  ok(!appendStockLink('Hi', CAR, 'https://ar7traders.com').includes('\n\n'), 'and never inserts a blank line');
}

if (failures.length) {
  for (const f of failures) console.error('  ✗ ' + f);
  console.log(`\n${pass} passed, ${failures.length} failed`);
  process.exit(1);
}
assert.ok(pass > 0);
console.log(`\n${pass} passed, 0 failed`);
