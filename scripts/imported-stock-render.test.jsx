// Imported dealer stock behaves like AR7's own inventory.
//
// Boots the real site in jsdom with a fetch stub that answers BOTH hydration
// sources — /api/site-content?entity=listings and /api/goonet-stock — the way
// production does, then checks that an imported car:
//   • appears in /inventory (in the Japan inventory group, not showroom)
//   • is searchable/filterable like any other car
//   • opens the full detail page (/inventory/<stock>) with specs, CIF and Save
//   • appears on /japan-stock
//   • never renders the source's name or a link back to it
// and that promoted / parked rows are not rendered as imported cars at all.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'https://ar7traders.com/',
  pretendToBeVisual: true
});

const g = globalThis;
const setGlobal = (k, v) => {
  try { g[k] = v; }
  catch { Object.defineProperty(g, k, { value: v, writable: true, configurable: true }); }
};
setGlobal('window', dom.window);
setGlobal('document', dom.window.document);
setGlobal('navigator', dom.window.navigator);
setGlobal('location', dom.window.location);
setGlobal('history', dom.window.history);
setGlobal('HTMLElement', dom.window.HTMLElement);
setGlobal('Element', dom.window.Element);
setGlobal('Node', dom.window.Node);
setGlobal('Event', dom.window.Event);
setGlobal('MouseEvent', dom.window.MouseEvent);
setGlobal('CustomEvent', dom.window.CustomEvent);
setGlobal('KeyboardEvent', dom.window.KeyboardEvent);
setGlobal('PopStateEvent', dom.window.PopStateEvent);
setGlobal('getComputedStyle', dom.window.getComputedStyle);
setGlobal('requestAnimationFrame', cb => setTimeout(() => cb(Date.now()), 0));
setGlobal('cancelAnimationFrame', id => clearTimeout(id));
setGlobal('IS_REACT_ACT_ENVIRONMENT', true);
dom.window.scrollTo = () => {};
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
dom.window.matchMedia = dom.window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
dom.window.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
dom.window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
setGlobal('scrollTo', dom.window.scrollTo);
setGlobal('matchMedia', dom.window.matchMedia);
setGlobal('IntersectionObserver', dom.window.IntersectionObserver);
setGlobal('ResizeObserver', dom.window.ResizeObserver);
setGlobal('addEventListener', dom.window.addEventListener.bind(dom.window));
setGlobal('removeEventListener', dom.window.removeEventListener.bind(dom.window));
setGlobal('dispatchEvent', dom.window.dispatchEvent.bind(dom.window));
setGlobal('localStorage', dom.window.localStorage);
setGlobal('sessionStorage', dom.window.sessionStorage);

// ---- the two hydration sources ---------------------------------------------
const LIVE_IMPORT = {
  id: 'r1', goonet_id: '1001974A30260726W001', stock_no: '1001974A30260726W001',
  make: 'Mazda', model: 'CX-30 20S L Package', year: 2021, km: '41,000',
  fuel: 'Petrol', body: 'SUV', price: '$14,100', price_jpy: 2070000, price_usd: 14100,
  image: 'https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00101.jpg',
  images: ['https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00101.jpg',
           'https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00102.jpg',
           'https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00103.jpg'],
  grade: '4.0', status: 'New Arrival', location: 'Hiroshima',
  tr: 'AT', drv: '2WD', eng: '2,000cc', seats: 5, col: 'Gray Metallic', st: 'RHD',
  available: true, promoted: 'none', rotation_state: 'live'
};
// Promoted to the website already (in site_listings) — must not be mapped twice.
const PROMOTED = { ...LIVE_IMPORT, id: 'r2', goonet_id: '0208264A20260802D002', stock_no: '0208264A20260802D002', model: 'Harrier Z Leather Package', make: 'Toyota', promoted: 'listings' };
// Parked by the rotation system — outside the live window.
const PARKED = { ...LIVE_IMPORT, id: 'r3', goonet_id: '0561037A30260717W002', stock_no: '0561037A30260717W002', model: 'Vezel Hybrid Z', make: 'Honda', rotation_state: 'parked' };
// A second live imported car, so the detail page has a related-stock sibling.
const LIVE_IMPORT_2 = {
  ...LIVE_IMPORT, id: 'r4', goonet_id: '0207429A30260819W007', stock_no: '0207429A30260819W007',
  make: 'Toyota', model: 'Land Cruiser 250 VX', year: 2024, km: '15,000', price: '$38,700',
  price_usd: 38700, image: 'https://picture1.goo-net.com/020/0207429/Q/b01.jpg',
  images: ['https://picture1.goo-net.com/020/0207429/Q/b01.jpg'], location: 'Aichi', col: 'Black'
};
const DEALER = [LIVE_IMPORT, LIVE_IMPORT_2, PROMOTED, PARKED];
const LISTINGS = [{
  id: 1, stock_no: 'AR7-26001', make: 'Rolls-Royce', model: 'Ghost', year: 2023, km: '2,150',
  fuel: 'Petrol', body: 'Luxury', price: '$189,000', image: '/assets/lux/rolls-royce-ghost.webp',
  images: ['/assets/lux/rolls-royce-ghost.webp'], grade: '5.0', status: 'In Stock',
  location: 'Tokyo', tr: 'AT', drv: 'RWD', eng: '6,750cc', seats: 5, col: 'Black', st: 'RHD',
  published: true, sort_order: 1
}];

setGlobal('fetch', url => {
  const u = String(url);
  const body = u.includes('/api/site-content') ? LISTINGS
    : u.includes('/api/goonet-stock') ? DEALER
    : null;
  if (body) return Promise.resolve({ ok: true, status: 200, json: async () => body, text: async () => '' });
  return Promise.resolve({ ok: false, status: 404, json: async () => ({}), text: async () => '' });
});

const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { App } = await import('../src/main.jsx');
const { CurrencyProvider } = await import('../src/currency.jsx');

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log('  ✓ ' + msg); }
  else { fail++; process.stderr.write('  ✗ ' + msg + '\n'); }
};
const errors = [];
console.error = (...a) => { errors.push(a.map(String).join(' ')); };
const text = () => document.body.textContent;
const html = () => document.body.innerHTML;

const container = document.createElement('div');
document.body.appendChild(container);
const root = createRoot(container);
await act(async () => { root.render(React.createElement(CurrencyProvider, null, React.createElement(App))); });
// one more tick so the hydration fetches settle inside act()
await act(async () => { await Promise.resolve(); });

const goto = async (path) => {
  await act(async () => {
    dom.window.history.pushState({}, '', path);
    dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate', { state: {} }));
  });
};

console.log('\n-- imported cars join the inventory --');
await goto('/inventory');
ok(!text().includes('The page failed to load'), 'the app did not crash');
ok(text().includes('Mazda') && text().includes('CX-30 20S L Package'),
  'the imported dealer car appears in the inventory');
ok(text().includes('Japan inventory'), 'it is listed under Japan inventory, not showroom');
ok(!text().includes('Vezel Hybrid Z'), 'a parked (rotation) row is not rendered');
ok(!/goo-?net/i.test(text()), 'no source name appears in the inventory copy');
ok(![...document.querySelectorAll('a')].some(a => /goo-?net/i.test(a.getAttribute('href') || '')),
  'no link points at the source');
ok([...document.querySelectorAll('img')].every(i => !/goo-?net/i.test(i.getAttribute('src') || '') || /^https:\/\/picture1\.goo-net\.com\//.test(i.getAttribute('src'))),
  'the only source-host reference is the car photo itself (never the listing page)');
{
  const groups = [...document.querySelectorAll('.inventory-group')];
  const japan = groups.find(sec => (sec.textContent || '').includes('Japan inventory'));
  const showroom = groups.find(sec => (sec.textContent || '').includes('Showroom cars'));
  ok(!!japan && japan.textContent.includes('CX-30'), 'the imported car sits in the Japan inventory group');
  ok(!!showroom && !showroom.textContent.includes('CX-30'), 'it is not in the showroom group');
}
ok(/41,000/.test(text()), 'its mileage renders');
ok(text().includes('$14,100'), 'its dealer price renders (no conversion invented)');

console.log('\n-- the imported car is searchable like any other car --');
{
  const input = document.querySelector('.inv-search input');
  ok(!!input, 'the inventory search box exists');
  if (input) {
    const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
    await act(async () => {
      setter.call(input, '1001974A30260726W001');
      input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    ok(text().includes('CX-30'), 'searching by stock number finds the imported car');
    ok(document.querySelectorAll('.car-card').length === 1, 'the search narrows the grid to that car');
  }
}

console.log('\n-- the full detail page (the showroom experience) --');
await goto('/inventory/1001974A30260726W001');
ok(text().includes('CX-30'), 'the imported car opens its own detail page');
ok(text().includes('Full specifications'), 'the detail page renders the full spec table');
ok(text().includes('Hiroshima'), 'the dealer location comes from the row');
ok(text().includes('2,000cc') && text().includes('4.0'), 'engine and grade render');
ok(text().includes('CIF') || text().includes('Landed cost'), 'the CIF estimate section renders');
ok(text().includes('Save'), 'the car can be saved like any other');
ok(text().includes('SIMILAR STOCK') && text().includes('Land Cruiser 250 VX'),
  'related stock renders and finds the other imported SUV');
ok(!/goo-?net/i.test(text()), 'no source name leaks into the detail page copy');
ok(![...document.querySelectorAll('a')].some(a => /goo-?net/i.test(a.getAttribute('href') || '')),
  'the detail page has no link back to the source');
ok(!text().includes('Chassis no.'), 'no chassis number is fabricated for the imported car');
ok(!text().includes('Auction venue'), 'no auction venue is fabricated for the imported car');
ok(!text().includes('Interior'), 'no interior is fabricated for the imported car');

console.log('\n-- /japan-stock shows the same imported cars --');
await goto('/japan-stock');
ok(text().includes('CX-30'), 'the imported car is on the Japan dealer stock page');
ok(text().includes('1001974A30260726W001') || text().includes('Mazda'), 'its stock number/make is shown');
ok(!text().includes('Vezel Hybrid Z'), 'the parked row stays hidden there too');

console.log('\n-- no source naming anywhere in the rendered app --');
ok(!/goo-?net/i.test(text()), 'the rendered copy never names the source');
ok(![...document.querySelectorAll('a')].some(a => /goo-?net/i.test(a.getAttribute('href') || '')),
  'the rendered app has no link back to the source');
ok(errors.filter(e => /hook|Hooks|rendered fewer/i.test(e)).length === 0, 'no hook-order violations');
ok(errors.length === 0, `nothing logged as an error${errors.length ? ' — ' + errors[0] : ''}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
