// Goo-net search-and-import preview + deselection test (npm run test:goonet-preview).
//
// Verifies the live (VITE_CRM_DEMO=false) GoonetStockView flow:
//   1. Searching a car keyword calls onRun(keyword, { preview: true, sort: 'price_asc', ... })
//      first — writing nothing until the operator confirms.
//   2. Matching candidates render sorted low-to-high with a clear match count,
//      prices, specs, and individual checkboxes.
//   3. Deselecting individual cars updates the count and import button label
//      and sends ONLY the remaining selectedIds when confirming import.
//   4. Deselect all disables import; Select all restores all candidates.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
  url: 'https://ar7traders.com/crm',
  pretendToBeVisual: true
});

const g = globalThis;
const setGlobal = (k, v) => {
  try { g[k] = v; }
  catch { Object.defineProperty(g, k, { value: v, writable: true, configurable: true }); }
};
for (const k of ['window', 'document', 'navigator', 'location', 'history', 'HTMLElement', 'Element',
  'Node', 'Event', 'MouseEvent', 'CustomEvent', 'KeyboardEvent', 'PopStateEvent',
  'getComputedStyle', 'localStorage', 'sessionStorage']) setGlobal(k, dom.window[k === 'window' ? 'window' : k]);
setGlobal('window', dom.window);
setGlobal('requestAnimationFrame', cb => setTimeout(() => cb(Date.now()), 0));
setGlobal('cancelAnimationFrame', id => clearTimeout(id));
setGlobal('IS_REACT_ACT_ENVIRONMENT', true);
setGlobal('scrollTo', () => {});
setGlobal('matchMedia', dom.window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
setGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
setGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
setGlobal('addEventListener', dom.window.addEventListener.bind(dom.window));
setGlobal('removeEventListener', dom.window.removeEventListener.bind(dom.window));
setGlobal('dispatchEvent', dom.window.dispatchEvent.bind(dom.window));
dom.window.scrollTo = () => {};
dom.window.HTMLElement.prototype.scrollIntoView = function () {};

const errors = [];
const realError = console.error;
console.error = (...args) => { errors.push(args.map(String).join(' ')); realError(...args); };

let pass = 0, fail = 0;
const say = m => process.stdout.write(m + '\n');
const ok = (cond, label) => {
  if (cond) { pass++; process.stdout.write(`  \u2713 ${label}\n`); }
  else { fail++; process.stdout.write(`  \u2717 ${label}\n`); }
};

globalThis.fetch = async (url) => {
  if (String(url).startsWith('/api/settings')) {
    return {
      ok: true,
      status: 200,
      json: async () => ({
        goonet_sort_order: 'price_asc',
        goonet_max_price_jpy: '1500000',
        goonet_min_price_jpy: ''
      })
    };
  }
  return { ok: true, status: 200, json: async () => ({}) };
};

const React = await import('react');
const { createRoot } = await import('react-dom/client');
const { act } = React;
const { GoonetStockView } = await import('../src/crm.jsx');

const PREVIEW_CANDIDATES = [
  {
    goonet_id: 'car-cheap',
    stock_no: 'AR7-001',
    make: 'Toyota',
    model: 'Prius',
    year: 2016,
    km: 72000,
    fuel: 'Hybrid',
    tr: 'AT',
    location: 'Gifu',
    price_jpy: 348000,
    price_usd: 2366,
    price: '$2,366',
    photo_count: 8,
    quality_score: 92,
    image: 'https://picture1.goo-net.com/car-cheap.jpg',
    goonet_url: 'https://www.goo-net-exchange.com/usedcars/TOYOTA/PRIUS/car-cheap/'
  },
  {
    goonet_id: 'car-mid',
    stock_no: 'AR7-002',
    make: 'Toyota',
    model: 'Prius',
    year: 2017,
    km: 58000,
    fuel: 'Hybrid',
    tr: 'AT',
    location: 'Aichi',
    price_jpy: 680000,
    price_usd: 4624,
    price: '$4,624',
    photo_count: 10,
    quality_score: 95,
    image: 'https://picture1.goo-net.com/car-mid.jpg',
    goonet_url: 'https://www.goo-net-exchange.com/usedcars/TOYOTA/PRIUS/car-mid/'
  },
  {
    goonet_id: 'car-top',
    stock_no: 'AR7-003',
    make: 'Toyota',
    model: 'Prius',
    year: 2018,
    km: 41000,
    fuel: 'Hybrid',
    tr: 'AT',
    location: 'Osaka',
    price_jpy: 1250000,
    price_usd: 8500,
    price: '$8,500',
    photo_count: 12,
    quality_score: 97,
    image: 'https://picture1.goo-net.com/car-top.jpg',
    goonet_url: 'https://www.goo-net-exchange.com/usedcars/TOYOTA/PRIUS/car-top/'
  }
];

const runCalls = [];
const notices = [];
const host = document.getElementById('root');
const root = createRoot(host);

async function onRun(keyword, opts = {}) {
  runCalls.push({ keyword, opts });
  if (opts.preview) {
    return {
      ok: true,
      preview: true,
      keyword,
      cardsSeen: 4,
      alreadyKnown: 1,
      rejected: 1,
      skipped: ['AR7-999: price ¥2,100,000 exceeds max ¥1,500,000'],
      readyCount: PREVIEW_CANDIDATES.length,
      wouldImport: PREVIEW_CANDIDATES.length,
      candidates: PREVIEW_CANDIDATES,
      note: `Preview for "${keyword}" — 3 cars ready to import (low to high price).`
    };
  }
  return {
    ok: true,
    keyword,
    page: 1,
    inserted: opts.selectedIds?.length || 0,
    delisted: 0,
    promoted: 0,
    rejected: 0,
    skipped: []
  };
}

await act(async () => {
  root.render(React.createElement(GoonetStockView, {
    token: 'tok-admin',
    rows: [],
    profile: { role: 'admin', full_name: 'Admin' },
    notify: msg => notices.push(msg),
    onEdit: () => {},
    onDelete: () => {},
    onManagePhotos: () => {},
    onViewGallery: () => {},
    onPromote: () => {},
    onDelist: () => {},
    onRun,
    onResetBookmark: () => {},
    onCopyDiag: () => {},
    onRefresh: async () => {},
    syncing: false,
    listings: [],
    vehicles: []
  }));
});
await act(async () => { await Promise.resolve(); });

say('\n-- Goo-net search-and-preview flow --');
const qInput = host.querySelector('.crm-goonet-ondemand-q input');
const maxInput = host.querySelector('input[aria-label="Max price JPY"]');
const sortSelect = host.querySelector('select[aria-label="Search sort order"]');
ok(!!qInput && !!maxInput && !!sortSelect, 'search input, max JPY input, and price sort select render');
ok(maxInput.value === '1500000', `max JPY field loaded desk default (${maxInput.value})`);
ok(sortSelect.value === 'price_asc', `sort order defaulted to low-to-high (${sortSelect.value})`);

const nativeSet = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
await act(async () => {
  nativeSet.call(qInput, 'Toyota Prius');
  qInput.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
});

const form = host.querySelector('.crm-goonet-ondemand');
await act(async () => {
  form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true }));
});

ok(runCalls.length === 1 && runCalls[0].keyword === 'Toyota Prius' && runCalls[0].opts.preview === true,
  'submitting search calls read-only preview first instead of immediate DB insert');
ok(runCalls[0].opts.maxPriceJpy === '1500000' && runCalls[0].opts.sort === 'price_asc',
  'preview call passes maxPriceJpy and price_asc sort order');

const previewSec = host.querySelector('.crm-goonet-preview');
ok(!!previewSec, 'preview panel renders below search bar');
ok(/3 cars ready to import/.test(previewSec?.textContent || ''), 'preview headline states total matching car count');

const cards = [...host.querySelectorAll('.crm-goonet-preview-card')];
ok(cards.length === 3, `all 3 preview cards rendered (${cards.length})`);
ok(/¥348,000/.test(cards[0]?.textContent || '') && /¥1,250,000/.test(cards[2]?.textContent || ''),
  'cards display lowest price first (¥348,000 first, ¥1,250,000 last)');
ok(cards.every(c => c.querySelector('input[type="checkbox"]')?.checked),
  'all 3 matching cars start checked');

say('\n-- deselecting individual cars before import --');
const deselectAllBtn = [...previewSec.querySelectorAll('button')].find(b => /Deselect all/i.test(b.textContent));
const selectAllBtn = [...previewSec.querySelectorAll('button')].find(b => /^Select all$/i.test(b.textContent.trim()));
await act(async () => { deselectAllBtn.click(); });
const importBtnAfterNone = [...previewSec.querySelectorAll('button')].find(b => /Import/i.test(b.textContent));
ok(importBtnAfterNone?.disabled === true && /0 of 3 selected/.test(previewSec.textContent),
  'Deselect all clears all checkboxes and disables the Import button');

await act(async () => { selectAllBtn.click(); });
ok(/3 of 3 selected/.test(previewSec.textContent), 'Select all restores all 3 cars');

// Deselect the middle car (car-mid) so only cheapest and top remain checked.
const midCheckbox = cards[1].querySelector('input[type="checkbox"]');
await act(async () => { midCheckbox.click(); });
ok(/2 of 3 selected/.test(previewSec.textContent), 'unchecking one car updates count to 2 of 3 selected');
const importBtn = [...previewSec.querySelectorAll('button')].find(b => /Import 2 selected cars/.test(b.textContent));
ok(!!importBtn && !importBtn.disabled, 'Import button reflects exact remaining selection ("Import 2 selected cars")');

await act(async () => { importBtn.click(); });
ok(runCalls.length === 2 && !runCalls[1].opts.preview, 'confirming fires non-preview import request');
ok(JSON.stringify(runCalls[1].opts.selectedIds) === JSON.stringify(['car-cheap', 'car-top']),
  `only the 2 kept cars were sent in selectedIds (${JSON.stringify(runCalls[1].opts.selectedIds)})`);
ok(!host.querySelector('.crm-goonet-preview'), 'preview closes cleanly after import succeeds');

await act(async () => { root.unmount(); });
console.error = realError;
ok(errors.filter(e => !/not wrapped in act|Not implemented|jsdom/i.test(e)).length === 0, 'no React runtime errors logged');

say(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
