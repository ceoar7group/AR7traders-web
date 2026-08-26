// Render smoke test: the CRM inventory EntityView (vehicles + listings) in
// table and photo-card modes — status chips, sortable headers, photo-count
// thumbs, image fallbacks and the search-aware empty state render to static
// markup without crashing (SSR-style; effects don't run).
import React from 'react';
import { renderToString } from 'react-dom/server';
import { EntityView } from '../src/crm.jsx';
import { CurrencyProvider } from '../src/currency.jsx';

// Minimal localStorage stub (the currency provider reads/writes it eagerly).
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k)
};
globalThis.fetch = () => Promise.resolve({ ok: false, json: async () => ({}) });

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error('FAIL:', msg); } else console.log('ok  :', msg); };

const STATUS = ['available', 'reserved', 'sold', 'in_preparation', 'in_transit', 'auction_watch'];
const vehicles = [
  { id: 'v1', stock_no: 'AR7-1', make: 'Audi', model: 'R8 V10', year: 2021, price: 155000, status: 'available', image: '/assets/gallery/audi-r8-v10-01.webp', images: ['/assets/gallery/audi-r8-v10-01.webp', '/assets/gallery/audi-r8-v10-02.webp'] },
  { id: 'v2', stock_no: 'AR7-2', make: 'Lexus', model: 'LC 500', year: 2021, price: 95000, status: 'reserved', image: '/assets/gallery/lexus-lc-500-01.jpg' },
  { id: 'v3', stock_no: 'AR7-3', make: 'Toyota', model: 'Land Cruiser ZX', year: 2022, price: 58900, status: 'in_transit' }, // no photos at all
  { id: 'v4', stock_no: 'AR7-4', make: 'Rolls-Royce', model: 'Ghost', year: 2023, price: 189000, status: 'available', images: ['/assets/lux/rolls-royce-ghost.jpg'] }
];
const noop = () => {};
const props = {
  entity: 'vehicles', rows: vehicles, onEdit: noop, onDelete: noop,
  onManagePhotos: noop, onViewGallery: noop, onQuickPatch: noop, statusOptions: STATUS
};

// --- Inventory table view -------------------------------------------------
const tableHtml = renderToString(
  <CurrencyProvider><EntityView {...props} /></CurrencyProvider>
);
ok(tableHtml.includes('inventory vehicles'), 'table: count badge text renders');
ok(tableHtml.includes('entity-status-chips'), 'table: status chip row renders');
{
  const chips = tableHtml.slice(tableHtml.indexOf('entity-status-chips'), tableHtml.indexOf('entity-view-toolbar'));
  ok((chips.match(/<em>/g) || []).length === 5, 'table: All + 3 status + no-photos chips carry counts');
}
ok(tableHtml.includes('No photos'), 'table: no-photos chip appears for empty gallery');
ok((tableHtml.match(/class="th-sort( |")/g) || []).length === 7, 'table: all 7 columns sortable');
ok(tableHtml.includes('crm-status-select'), 'table: inline status picker renders');
ok(tableHtml.includes('thumb-count'), 'table: photo-count thumb renders');
ok(tableHtml.includes('src="/assets/ar7-mark.png"'), 'table: photo-less vehicle falls back to brand mark');

// --- Inventory photo-card grid --------------------------------------------
const gridHtml = renderToString(
  <CurrencyProvider><EntityView {...props} defaultViewMode="grid" /></CurrencyProvider>
);
ok(gridHtml.includes('vehicle-card-grid'), 'grid: card grid renders');
ok((gridHtml.match(/class="vcard"/g) || []).length === 4, 'grid: one card per vehicle');
ok(gridHtml.includes('vcard-photo-count'), 'grid: photo count badge renders');
ok(gridHtml.includes('crm-status-select'), 'grid: status is changeable from cards too');

// --- Website cars get the same affordances ---------------------------------
const listings = vehicles.map((v, i) => ({ ...v, id: 'l' + (i + 1), published: i % 2 === 0 }));
const listingHtml = renderToString(
  <CurrencyProvider><EntityView {...props} entity="listings" rows={listings} statusOptions={['live', 'hidden', 'sold']} /></CurrencyProvider>
);
ok(listingHtml.includes('website showroom listings'), 'listings: count badge text renders');
ok((listingHtml.match(/class="th-sort( |")/g) || []).length === 8, 'listings: all 8 columns sortable');

// --- Search-aware empty state ----------------------------------------------
const emptyHtml = renderToString(
  <CurrencyProvider><EntityView {...props} rows={[]} query="zzz" onClearSearch={noop} /></CurrencyProvider>
);
ok(emptyHtml.includes('No records match your search'), 'empty: search wording when query active');
ok(emptyHtml.includes('Clear search'), 'empty: clear-search action offered');
const bareEmptyHtml = renderToString(
  <CurrencyProvider><EntityView {...props} rows={[]} /></CurrencyProvider>
);
ok(bareEmptyHtml.includes('No records yet'), 'empty: plain wording without query');
ok(!bareEmptyHtml.includes('Clear search'), 'empty: no clear action without query');

// --- Leads view regression check -------------------------------------------
const leads = [
  { id: 'x1', name: 'Ahmed', email: 'a@x.com', country: 'PK', vehicle_interest: 'Land Cruiser', status: 'new', budget: 65000 },
  { id: 'x2', name: 'Mary', email: 'm@x.com', country: 'KE', vehicle_interest: 'RX 450h', status: 'won', budget: 42000 }
];
const leadHtml = renderToString(
  <CurrencyProvider><EntityView {...props} entity="leads" rows={leads} statusOptions={['new', 'qualified', 'won', 'lost']} /></CurrencyProvider>
);
ok(leadHtml.includes('crm-lead-grid'), 'leads: card view still renders');
ok(leadHtml.includes('In progress'), 'leads: chip labels still render');
ok(!leadHtml.includes('entity-status-chips'), 'leads: vehicle chip row not applied');

console.log(failed ? `\n${failed} FAILURES` : '\nALL PASS');
process.exit(failed ? 1 : 0);
