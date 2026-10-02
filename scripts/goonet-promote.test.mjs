#!/usr/bin/env node
// "Add this imported car to inventory" — end-to-end contract.
//
//   node scripts/goonet-promote.test.mjs
//
// The owner's report: pressing **Inventory** on a Japan dealer stock row showed
// an error, the car never turned up in the CRM Inventory, and the row never said
// it had been added — so it looked like every press was the first one.
//
// Two things were wrong, and both are pinned here against the REAL handler
// (api/goonet-stock.js) and the REAL promotion code (api/goonet-sync.js):
//
//   1. Supabase resolves `{error}` instead of throwing, and the promotion used
//      to ignore every result. A failed insert still answered "Moved … to
//      vehicles" and still stamped `promoted = 'vehicles'` on the dealer row.
//      The CRM therefore claimed a car was added when it was not — and the
//      importer believed it too. Now every write is checked, the error is
//      surfaced with its reason, and the `promoted` flag is only written after
//      the copy really landed.
//   2. A car that was already copied reported as a fresh add, so the screen
//      gave no way to tell "added" from "not added yet". The route now says
//      whether the car was already there (`state.already_in_inventory`), and
//      the CRM renders it as "In inventory".
//
// Plus: the scheduled importer must survive a failed copy. A promotion error
// during a cron run is reported in the run report and the run carries on.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

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

const dir = path.dirname(fileURLToPath(import.meta.url));
const listingHtml = readFileSync(path.join(dir, 'fixtures/goonet-listing.html'), 'utf8');
const detailHtml = readFileSync(path.join(dir, 'fixtures/goonet-detail.html'), 'utf8');

// ---- In-memory Supabase-shaped client ---------------------------------------
// `fail` injects a write failure — `{table:'vehicles', op:'insert'}` stands in
// for the database rejecting a write (missing column, revoked grant, …), which
// is exactly the case the old code answered with a cheerful "Moved".
function memDb(seed = {}, fail = {}) {
  const tables = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map(r => ({ ...r }));
  const rowsOf = n => (tables[n] || (tables[n] = []));
  let seq = 0;
  const matches = (r, filters) => filters.every(f => f(r));

  function from(name) {
    const rows = rowsOf(name);
    const opFails = op => fail && fail.table === name && fail.op === op
      ? { message: fail.message || `simulated ${op} failure on ${name}` } : null;
    function query() {
      const ctx = { filters: [], order: null, limitN: null };
      const settle = () => {
        let out = rows.filter(r => matches(r, ctx.filters));
        if (ctx.order) out = out.slice().sort(ctx.order);
        if (ctx.limitN) out = out.slice(0, ctx.limitN);
        return out;
      };
      const api = {
        select: () => api,
        eq: (k, v) => { ctx.filters.push(r => r[k] === v); return api; },
        lt: (k, v) => { ctx.filters.push(r => r[k] < v); return api; },
        gte: (k, v) => { ctx.filters.push(r => r[k] >= v); return api; },
        order: (k, o = {}) => {
          const dir = o.ascending === false ? -1 : 1;
          ctx.order = (a, b) => dir * String(a[k] ?? '').localeCompare(String(b[k] ?? ''), undefined, { numeric: true });
          return api;
        },
        limit: n => { ctx.limitN = n; return api; },
        maybeSingle: async () => ({ data: settle()[0] || null, error: null }),
        single: async () => {
          const out = settle();
          return out.length ? { data: out[0], error: null }
            : { data: null, error: { message: 'JSON object requested, multiple (or no) rows returned' } };
        },
        then(resolve) {
          if (api.patch) {
            const err = opFails('update');
            if (err) return resolve({ data: null, error: err });
            settle().forEach(r => Object.assign(r, api.patch));
          }
          if (api.remove) settle().forEach(r => { const i = rows.indexOf(r); if (i >= 0) rows.splice(i, 1); });
          return resolve({ data: settle(), error: null });
        }
      };
      return api;
    }
    return {
      select: () => query(),
      eq: (k, v) => query().eq(k, v),
      order: (k, o) => query().order(k, o),
      limit: n => query().limit(n),
      single: () => query().single(),
      maybeSingle: () => query().maybeSingle(),
      then: res => query().then(res),
      insert(rec) {
        const err = opFails('insert');
        if (err) {
          return { data: null, error: err, select: () => ({ single: async () => ({ data: null, error: err }) }), then: r => r({ data: null, error: err }) };
        }
        for (const r of (Array.isArray(rec) ? rec : [rec])) {
          const bad = unknownColumn(name, r);
          if (bad) {
            const schemaErr = schemaCacheError(name, bad);
            return { data: null, error: schemaErr, select: () => ({ single: async () => ({ data: null, error: schemaErr }) }), then: x => x({ data: null, error: schemaErr }) };
          }
        }
        const list = (Array.isArray(rec) ? rec : [rec]).map(r => ({ ...r, id: r.id || 'id-' + (++seq) }));
        for (const r of list) {
          const dupKey = r.goonet_id !== undefined ? 'goonet_id' : (r.key !== undefined ? 'key' : (r.stock_no !== undefined ? 'stock_no' : null));
          if (dupKey && rows.some(x => String(x[dupKey]) === String(r[dupKey]))) {
            const dup = { message: `duplicate key value violates unique constraint "${name}_${dupKey}_key"` };
            return { data: null, error: dup, select: () => ({ single: async () => ({ data: null, error: dup }) }), then: r => r({ data: null, error: dup }) };
          }
          rows.push(r);
        }
        return {
          data: list[0], error: null,
          select: () => ({ single: async () => ({ data: list[0], error: null }), then: r => r({ data: list, error: null }) }),
          then: r => r({ data: list, error: null })
        };
      },
      update(patch) {
        const bad = unknownColumn(name, patch);
        if (bad) {
          const schemaErr = schemaCacheError(name, bad);
          const api = query();
          api.patch = null;
          api.then = res => res({ data: null, error: schemaErr });
          return api;
        }
        const api = query(); api.patch = patch; return api;
      },
      delete() { const api = query(); api.remove = true; return api; },
      upsert(rec) {
        for (const item of (Array.isArray(rec) ? rec : [rec])) {
          const existing = rows.find(r => r.key !== undefined && r.key === item.key)
            || rows.find(r => r.goonet_id !== undefined && r.goonet_id === item.goonet_id);
          if (existing) Object.assign(existing, item);
          else rows.push({ ...item, id: item.id || 'id-' + (++seq) });
        }
        return { error: null, then: r => r({ error: null }) };
      }
    };
  }
  return { db: { from }, tables };
}

// ---- PostgREST's schema cache ----------------------------------------------
// Supabase answers a write that names a column the table does not have with
//    Could not find the 'created_by' column of 'japan_dealer_stock' in the
//    schema cache
// and that is EXACTLY the error the owner reported while adding an imported car
// to inventory. The memDb used to accept any key, so it happily stored
// `created_by` on a dealer row and no test could see the difference between an
// insert that would work and one the live schema rejects. The column lists
// below mirror supabase/SETUP-EVERYTHING.sql (plus the MIGRATION-2026-10
// note that image paths stay text), so the harness now refuses what PostgREST
// refuses. Keep them in step with the schema.
const COLUMNS = {
  japan_dealer_stock: ['id', 'goonet_id', 'stock_no', 'make', 'model', 'year', 'km', 'fuel',
    'body', 'price_jpy', 'price_usd', 'price', 'image', 'images', 'grade', 'status', 'location',
    'tr', 'drv', 'eng', 'seats', 'col', 'st', 'vendor', 'goonet_url', 'photo_count',
    'quality_score', 'available', 'promoted', 'imported_at', 'last_seen_at', 'delisted_at',
    'updated_at', 'rotation_state'],
  vehicles: ['id', 'stock_no', 'make', 'model', 'year', 'price', 'status', 'location', 'steering',
    'colour', 'interior', 'notes', 'created_by', 'created_at', 'updated_at', 'image', 'images',
    'gallery', 'vendor', 'cost_price', 'freight_cost', 'duty_cost', 'other_cost',
    'sourcing_currency'],
  site_listings: ['id', 'stock_no', 'make', 'model', 'year', 'km', 'fuel', 'body', 'price',
    'image', 'images', 'gallery', 'grade', 'status', 'location', 'tr', 'drv', 'eng', 'seats',
    'col', 'st', 'published', 'sort_order', 'created_at', 'updated_at'],
  activities: ['id', 'action', 'actor', 'entity_type', 'entity_id', 'created_by', 'created_at'],
  site_settings: ['key', 'value', 'label', 'updated_at']
};
function schemaCacheError(table, key) {
  return { message: `Could not find the '${key}' column of '${table}' in the schema cache` };
}
function unknownColumn(table, rec) {
  const allowed = COLUMNS[table];
  if (!allowed) return null;
  return Object.keys(rec || {}).find(k => !allowed.includes(k)) || null;
}

function fakeRes() {
  const r = { statusCode: 0, body: null, headers: {} };
  r.status = code => { r.statusCode = code; return r; };
  r.setHeader = (k, v) => { r.headers[String(k).toLowerCase()] = v; };
  r.end = payload => { try { r.body = JSON.parse(payload); } catch { r.body = payload; } };
  return r;
}

const userFor = (id, role) => async () => ({
  user: { id, email: role + '@ar7traders.com' },
  profile: { id, full_name: role + ' user', role, active: true }
});
const { DEFAULTS } = await import('../api/_perm.js');
const permsFor = async role => DEFAULTS[role] || {};
const injectedFor = (db, role = 'admin') => ({ db, getUser: userFor(role + '1', role), permsFor });

// A dealer row shaped exactly like a live import (Japanese colour/location and
// the photo gallery included), so nothing here is easier than the real thing.
const REF = '700054106930260929001';
const dealerRow = (over = {}) => ({
  id: 'row-1', goonet_id: REF, stock_no: REF,
  make: 'Toyota', model: 'Prius', year: 2020, km: '51000',
  fuel: 'Hybrid', body: 'Sedan', price_jpy: 1925000, price_usd: 13090, price: '$13,090',
  image: 'https://picture1.goo-net.com/7000541069/30260929/J/x00.jpg',
  images: ['https://picture1.goo-net.com/7000541069/30260929/J/x00.jpg',
    'https://picture1.goo-net.com/054/0541069/J/x01.jpg'],
  grade: '4', status: 'New Arrival', location: '埼玉県', tr: 'AT', drv: '2WD', eng: '1,800cc',
  seats: 5, col: 'プラチナホワイトパールマイカ', st: 'RHD', vendor: 'Goo-net',
  goonet_url: `https://www.goo-net.com/usedcar/spread/goo/15/${REF}.html`,
  photo_count: 69, quality_score: 90, available: true, promoted: 'none',
  imported_at: '2026-10-02T18:12:35.361+00:00', last_seen_at: '2026-10-02T18:12:35.361+00:00',
  delisted_at: null, updated_at: '2026-10-02T18:12:35.361+00:00',
  ...over
});

const { default: handler } = await import('../api/goonet-stock.js');
const { promoteToInventory, promoteToListings } = await import('../api/goonet-sync.js');

async function call(req, injected) {
  const res = fakeRes();
  const realError = console.error;
  console.error = () => {};
  try { await handler(req, res, injected); } finally { console.error = realError; }
  return res;
}
// THE CALL THE CRM ACTUALLY MAKES: the action in the query string, a plain
// body, no `action` in it. The server used to dispatch on `req.body.action`
// only, so this exact request skipped the promote route, fell through to the
// CRUD insert and came back with `null value in column "goonet_id" … violates
// not-null constraint` — the error the owner saw. Every test below uses this
// shape on purpose.
const crmReq = (action, body) => ({
  method: 'POST', query: { action }, headers: { authorization: 'Bearer ok' }, body
});
const promoteReq = (target, id = 'row-1') => crmReq('promote', { id, target });
const seedWith = (over = {}) => memDb({
  site_settings: [],
  japan_dealer_stock: [dealerRow(over)],
  site_listings: [],
  vehicles: [],
  activities: [],
  goonet_blocklist: []
});

// ---------------------------------------------------------------------------
console.log('\n1) Inventory: the car really lands in the vehicles table');
{
  const { db, tables } = seedWith();
  const r = await call(promoteReq('vehicles'), injectedFor(db));

  eq(r.statusCode, 200, 'promoting answers 200');
  eq(tables.vehicles.length, 1, 'exactly one inventory vehicle is created');
  const v = tables.vehicles[0];
  eq(v.stock_no, REF, 'the vehicle is keyed on the dealer stock number');
  eq(v.status, 'available', 'it is available stock, like any other car');
  eq(v.vendor, 'Goo-net', 'the sourcing vendor is recorded');
  eq(Number(v.price), 13090, 'the selling price starts at the converted dealer price');
  eq(Number(v.cost_price), 13090, 'the cost price is recorded for the profit tab');
  eq(v.images.length, 2, 'the photo gallery comes with it');
  eq(tables.japan_dealer_stock[0].promoted, 'vehicles', 'the dealer row is flagged as promoted');
  ok(/in CRM inventory/i.test(r.body.message) && !/already/i.test(r.body.message),
    'the notice reports a fresh add (' + r.body.message + ')');
  eq(r.body.state, { on_website: false, in_inventory: true, already_in_inventory: false, already_on_website: false },
    'the response carries the state the CRM renders');
  ok(tables.activities.some(a => /CRM inventory/.test(a.action)), 'the activity log records who added it');
  ok(tables.site_listings.length === 0, 'nothing is published on the website by an inventory-only action');
}

// ---------------------------------------------------------------------------
console.log('\n2) Pressing Inventory again says "already added" — and cannot duplicate');
{
  const { db, tables } = seedWith({ promoted: 'vehicles' });
  // The car is already in the inventory (the first press succeeded).
  tables.vehicles.push({ id: 'v-1', stock_no: REF, make: 'Toyota', model: 'Prius', status: 'available', price: 13090 });

  const r = await call(promoteReq('vehicles'), injectedFor(db));
  eq(r.statusCode, 200, 'a second press still answers 200');
  eq(tables.vehicles.length, 1, 'no second vehicle row is created');
  eq(r.body.state.already_in_inventory, true, 'the response says it was already in the inventory');
  ok(/already in CRM inventory/i.test(r.body.message), 'the notice says so in words (' + r.body.message + ')');
  ok(/refreshed/i.test(r.body.message), 'and admits the details were only refreshed');
}

// A car that reached the inventory but whose flag was never written (the state
// the old silent-failure code left behind) is recognised from the records
// themselves, not from the flag.
{
  const { db, tables } = seedWith({ promoted: 'none' });
  tables.vehicles.push({ id: 'v-1', stock_no: REF, status: 'available' });
  const r = await call(promoteReq('vehicles'), injectedFor(db));
  eq(r.body.state.already_in_inventory, true, 'an un-flagged car already in the inventory is reported as added');
  eq(tables.japan_dealer_stock[0].promoted, 'vehicles', 'and the missing flag is repaired');
  eq(tables.vehicles.length, 1, 'without duplicating the vehicle');
}

// ---------------------------------------------------------------------------
console.log('\n3) Website: a listing is published, never into the showroom slots');
{
  const { db, tables } = seedWith();
  tables.site_listings.push({ id: 'l-12', stock_no: 'AR7-26012', sort_order: 12, published: true });

  const r = await call(promoteReq('listings'), injectedFor(db));
  eq(r.statusCode, 200, 'publishing answers 200');
  eq(tables.site_listings.length, 2, 'the listing is created');
  const l = tables.site_listings.find(x => x.stock_no === REF);
  eq(l.published, true, 'it is published straight away');
  eq(Number(l.sort_order), 13, 'it lands after the 12 showroom cars, not on top of them');
  eq(tables.japan_dealer_stock[0].promoted, 'listings', 'the dealer row is flagged for the website');
  ok(/published on the website/i.test(r.body.message), 'the notice says it went live');
  eq(tables.vehicles.length, 0, 'an inventory vehicle is not created by a website-only action');
}

// Publishing a car that is already in the inventory makes it 'both' — the CRM
// reads that single value to show both ticks.
{
  const { db, tables } = seedWith({ promoted: 'vehicles' });
  await call(promoteReq('listings'), injectedFor(db));
  eq(tables.japan_dealer_stock[0].promoted, 'both', 'a car in both places is flagged "both"');
  eq(tables.site_listings.length, 1, 'the website listing exists');
}

// ---------------------------------------------------------------------------
console.log('\n4) The regression: a failed write can never look like a success');
{
  // Control case first: the same call with a healthy database succeeds, so the
  // assertions below really are about the injected failure.
  const healthy = seedWith();
  const control = await call(promoteReq('vehicles'), injectedFor(healthy.db));
  ok(control.statusCode === 200 && healthy.tables.vehicles.length === 1,
    'the control case (healthy database) still succeeds');

  const faulted = memDb({
    site_settings: [], japan_dealer_stock: [dealerRow()], site_listings: [], vehicles: [], activities: [], goonet_blocklist: []
  }, { table: 'vehicles', op: 'insert', message: 'permission denied for table vehicles' });
  const r2 = await call(promoteReq('vehicles'), injectedFor(faulted.db));

  ok(r2.statusCode >= 400, 'a rejected insert is not reported as success (HTTP ' + r2.statusCode + ')');
  ok(/CRM inventory/i.test(String(r2.body?.error)) && /permission denied/.test(String(r2.body?.error)),
    'the error names the step and the database reason ("' + r2.body?.error + '")');
  eq(faulted.tables.vehicles.length, 0, 'no vehicle was created');
  eq(faulted.tables.japan_dealer_stock[0].promoted, 'none',
    'the dealer row is NOT marked promoted — the CRM will not claim a car is in the inventory when it is not');
  ok(!faulted.tables.activities.some(a => /CRM inventory/.test(a.action)),
    'no "promoted to CRM inventory" line is written to the activity log');

  // …and the same guarantee for the website copy.
  const faulted2 = memDb({
    site_settings: [], japan_dealer_stock: [dealerRow()], site_listings: [], vehicles: [], activities: [], goonet_blocklist: []
  }, { table: 'site_listings', op: 'insert', message: 'column "published" does not exist' });
  const r3 = await call(promoteReq('listings'), injectedFor(faulted2.db));
  ok(r3.statusCode >= 400 && /website/i.test(String(r3.body?.error)), 'a rejected website copy reports the website step');
  eq(faulted2.tables.japan_dealer_stock[0].promoted, 'none', 'and the website flag is not written either');
}

// ---------------------------------------------------------------------------
console.log('\n5) "both": one press copies to both places and reports both');
{
  const { db, tables } = seedWith();
  const r = await call(promoteReq('both'), injectedFor(db));
  eq(tables.vehicles.length, 1, 'the inventory copy exists');
  eq(tables.site_listings.length, 1, 'the website copy exists');
  eq(tables.japan_dealer_stock[0].promoted, 'both', 'the row is flagged "both"');
  eq(r.body.promoted, 'both', 'the response carries the new state back to the CRM');
  eq([r.body.state.on_website, r.body.state.in_inventory], [true, true],
    'a "both" car reports both places — "both" is a token, not a substring to search');
  ok(/inventory/i.test(r.body.message) && /website/i.test(r.body.message), 'the notice mentions both destinations');
}

// ---------------------------------------------------------------------------
console.log('\n6) Permissions: staff without stock rights cannot copy anything');
{
  const { db, tables } = seedWith();
  const r = await call(promoteReq('vehicles'), injectedFor(db, 'sales'));
  eq(r.statusCode, 403, 'a sales member is refused');
  eq(tables.vehicles.length, 0, 'and nothing is written');
  const { db: db2, tables: t2 } = seedWith();
  const okr = await call(promoteReq('vehicles'), injectedFor(db2, 'manager'));
  ok(okr.statusCode === 200 && t2.vehicles.length === 1, 'a manager (stock rights) can still add a car');
}

// ---------------------------------------------------------------------------
console.log('\n7) Delist still hides the published copy');
{
  const { db, tables } = seedWith({ promoted: 'both' });
  tables.site_listings.push({ id: 'l-1', stock_no: REF, published: true, sort_order: 13 });
  tables.vehicles.push({ id: 'v-1', stock_no: REF, status: 'available' });

  const r = await call(crmReq('delist', { id: 'row-1', available: false }), injectedFor(db));
  eq(r.statusCode, 200, 'delisting answers 200');
  eq(tables.japan_dealer_stock[0].available, false, 'the dealer row is marked unavailable');
  eq(tables.site_listings[0].published, false, 'the website listing is hidden, not deleted');
  eq(tables.vehicles[0].status, 'available', 'the inventory copy is left alone — it is internal stock');
}

// ---------------------------------------------------------------------------
console.log('\n8) The copy helpers tell the caller the truth on their own');
{
  const { db, tables } = seedWith();
  const first = await promoteToInventory(db, dealerRow(), 'test');
  eq(first, { target: 'vehicles', stock_no: REF, already: false, created: true, promoted: 'vehicles' },
    'a fresh copy reports created');
  const second = await promoteToInventory(db, dealerRow(), 'test');
  eq(second.already, true, 'a repeat copy reports already');
  eq(tables.vehicles.length, 1, 'and still leaves exactly one vehicle behind');

  const noStock = dealerRow({ stock_no: null, goonet_id: null });
  let threw = null;
  try { await promoteToInventory(db, noStock, 'test'); } catch (e) { threw = e; }
  ok(threw && /stock number/i.test(threw.message), 'a row with no stock number is refused with a reason, not a crash');
  let threw2 = null;
  try { await promoteToListings(db, noStock, 'test'); } catch (e) { threw2 = e; }
  ok(threw2 && /stock number/i.test(threw2.message), 'the website copy refuses it too');
}

// ---------------------------------------------------------------------------
// The scheduled importer must keep working when a copy fails: the run reports
// the failure and carries on to the next car.
console.log('\n9) The importer survives a failed promotion (weekly auto-promote)');
{
  const { db, tables } = memDb({
    site_settings: [
      ['goonet_min_photos', '3'], ['goonet_max_new_per_run', '1'], ['goonet_max_delist_per_run', '1'],
      ['goonet_weekly_delist_limit', '0'], ['goonet_weekly_promote_limit', '1'],
      ['goonet_auto_promote', 'true'], ['goonet_jpy_usd_rate', '0.0068'],
      ['goonet_bookmark_page', '1'], ['goonet_search_url', 'https://www.goo-net.com/usedcar/price--100/']
    ].map(([key, value]) => ({ key, value })),
    // A fresh, high-scoring car waiting for the weekly auto-promote…
    japan_dealer_stock: [dealerRow({ quality_score: 99, imported_at: new Date().toISOString() })],
    site_listings: [], vehicles: [], activities: [], goonet_blocklist: []
  }, { table: 'site_listings', op: 'insert', message: 'permission denied for table site_listings' });

  const realFetch = global.fetch;
  global.fetch = async (url) => {
    const u = String(url);
    let body = '', status = 200;
    if (u === 'https://www.goo-net.com/') body = '<html><body>goo-net</body></html>';
    else if (u.startsWith('https://r.jina.ai/')) { body = ''; status = 500; }
    else if (u.includes('price--100')) body = listingHtml;
    else if (u.includes('/usedcar/spread/goo/')) body = detailHtml;
    else { body = '<html><body>ページが見つかりません</body></html>'; status = 404; }
    return { ok: status < 400, status, text: async () => body };
  };

  const { default: syncHandler } = await import('../api/goonet-sync.js');
  const res = fakeRes();
  // The scheduled path authenticates with the sync key (that is how the cron
  // calls it), so the run itself is exercised, not the sign-in screen.
  process.env.GOONET_SYNC_KEY = 'promote-test-key';
  const realError2 = console.error;
  console.error = () => {};
  try {
    await syncHandler({ method: 'POST', query: { key: 'promote-test-key' }, headers: {} }, res, { db });
  } finally { console.error = realError2; global.fetch = realFetch; delete process.env.GOONET_SYNC_KEY; }

  eq(res.statusCode, 200, 'the run still finishes 200 — one bad copy does not kill the cron');
  ok(res.body?.failed >= 1, 'the report counts the failed copy (failed: ' + res.body?.failed + ')');
  ok((res.body?.skipped || []).some(s => /permission denied/.test(s)),
    'and carries the database reason in the report');
  eq(res.body?.promoted, 0, 'no car is counted as promoted');
  const waiting = tables.japan_dealer_stock.find(r => r.id === 'row-1');
  eq(waiting.promoted, 'none', 'the car is left unpromoted so a later run can try again');
  ok(tables.japan_dealer_stock.length >= 1 && Array.isArray(tables.activities), 'the importer went on to do its other work');
}

// ---------------------------------------------------------------------------
console.log('\n10) The plain insert path, and the schema cache that broke it');

{
  // The owner's error, verbatim:
  //   Could not find the 'created_by' column of 'japan_dealer_stock' in the
  //   schema cache
  // The endpoint was adding `created_by` to this payload — a column the dealer
  // table does not have (supabase/SETUP-EVERYTHING.sql) — so PostgREST rejected
  // every plain insert, whichever way the request reached this branch. The
  // caller is recorded in `activities`, which does have the column.
  const { db, tables } = memDb({ site_settings: [], japan_dealer_stock: [dealerRow()], activities: [] });
  const res = await call({
    method: 'POST', query: {}, headers: { authorization: 'Bearer ok' },
    body: { goonet_id: 'NEW-9001', stock_no: 'NEW-9001', make: 'Honda', model: 'Fit', year: 2019, created_by: 'smuggled' }
  }, injectedFor(db));
  eq(res.statusCode, 201, 'a plain insert from the CRM editor works');
  const added = tables.japan_dealer_stock.find(r => r.stock_no === 'NEW-9001');
  ok(!!added, 'the car is in Japan dealer stock');
  ok(!('created_by' in (added || {})), "nothing writes 'created_by' to the dealer row — the column does not exist");
  ok(tables.activities.some(a => /Added imported car Honda Fit/.test(a.action)),
    'the caller is recorded in the activity log instead');
}

{
  // The harness now enforces the same schema PostgREST does, so a future write
  // that names a column the table lacks fails the build instead of the owner.
  const { db } = memDb({ japan_dealer_stock: [] });
  const bad = await db.from('japan_dealer_stock').insert({ goonet_id: 'X', make: 'A', model: 'B', created_by: 'u1' });
  eq(bad.error?.message,
    "Could not find the 'created_by' column of 'japan_dealer_stock' in the schema cache",
    "a write naming a missing column reproduces the owner's error exactly");
}

{
  // And a row with no identifier is refused with a sentence, not with a raw
  // not-null-constraint message.
  const { db } = memDb({ site_settings: [], japan_dealer_stock: [dealerRow()], activities: [] });
  const res = await call({
    method: 'POST', query: {}, headers: { authorization: 'Bearer ok' }, body: { make: 'Honda', model: 'Fit' }
  }, injectedFor(db));
  eq(res.statusCode, 400, 'an insert with no stock number is refused');
  ok(/stock number/i.test(res.body?.error || ''), 'the message says what is missing: ' + res.body?.error);
  eq(/violates not-null constraint/.test(res.body?.error || ''), false, 'not a raw database error');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
