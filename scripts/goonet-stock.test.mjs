#!/usr/bin/env node
// DELETE /api/goonet-stock?entity=goonet&id=… must be permanent: the car is
// blocklisted BEFORE it is removed, its promoted website/CRM copies go with
// it, the activity log says so, and the next importer run refuses to bring
// it back. Run: node scripts/goonet-stock.test.mjs
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import stockHandler from '../api/goonet-stock.js';
import syncHandler from '../api/goonet-sync.js';
import { resetFetchState } from './goonet-core.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.error('  ✗ ' + name); } };

const dir = path.dirname(fileURLToPath(import.meta.url));
const listingHtml = readFileSync(path.join(dir, 'fixtures/goonet-listing.html'), 'utf8');
const detailHtml = readFileSync(path.join(dir, 'fixtures/goonet-detail.html'), 'utf8');

// ---- in-memory Supabase ----------------------------------------------------
function memDb(tables) {
  let seq = 1;
  function from(name) {
    const rows = () => tables[name] || (tables[name] = []);
    const q = (mode) => {
      const ctx = { filters: [], limit: null, single: false, maybe: false };
      const apply = () => rows().filter(r => ctx.filters.every(f => f(r)));
      const api = {
        select() { return api; },
        eq(k, v) { ctx.filters.push(r => String(r[k]) === String(v)); return api; },
        in(k, list) { ctx.filters.push(r => list.map(String).includes(String(r[k]))); return api; },
        lt(k, v) { ctx.filters.push(r => r[k] < v); return api; },
        gte(k, v) { ctx.filters.push(r => r[k] >= v); return api; },
        order() { return api; },
        limit(n) { ctx.limit = n; return api; },
        single() { ctx.single = true; return api; },
        maybeSingle() { ctx.maybe = true; return api; },
        then(resolve) {
          if (mode === 'delete') {
            const gone = apply();
            tables[name] = rows().filter(r => !gone.includes(r));
            return resolve({ data: gone, error: null });
          }
          if (mode === 'update') {
            const hit = apply();
            hit.forEach(r => Object.assign(r, ctx.patch));
            return resolve({ data: hit, error: null });
          }
          let data = apply();
          if (ctx.limit != null) data = data.slice(0, ctx.limit);
          if (ctx.single || ctx.maybe) return resolve({ data: data[0] || null, error: ctx.single && !data[0] ? new Error('no rows') : null });
          return resolve({ data, error: null });
        }
      };
      if (mode === 'update') api.patch = null;
      return api;
    };
    return {
      select: () => q('select'),
      delete: () => q('delete'),
      update(patch) { const api = q('update'); api.patch = patch; return api; },
      async insert(row) {
        const list = Array.isArray(row) ? row : [row];
        for (const r of list) {
          if (name === 'japan_dealer_stock' && rows().some(x => x.goonet_id === r.goonet_id)) return { error: new Error('duplicate key value violates unique constraint') };
          rows().push({ id: r.id || `id-${seq++}`, ...r });
        }
        return { error: null };
      },
      async upsert(list, opts = {}) {
        const key = opts.onConflict || (name === 'goonet_blocklist' ? 'goonet_id' : 'key');
        for (const item of (Array.isArray(list) ? list : [list])) {
          const ex = rows().find(r => r[key] === item[key]);
          if (ex) Object.assign(ex, item); else rows().push({ ...item });
        }
        return { error: null };
      }
    };
  }
  return { from };
}
const fakeRes = () => {
  const r = { statusCode: 0, body: null, headers: {} };
  r.status = c => { r.statusCode = c; return r; };
  r.setHeader = (k, v) => { r.headers[k] = v; return r; };
  r.end = b => { r.body = JSON.parse(b); return r; };
  return r;
};
const adminAuth = { profile: { role: 'admin', full_name: 'Test Admin' }, user: { email: 'admin@example.com' } };

const settingsRows = [
  ['goonet_enabled', 'true'], ['goonet_search_url', 'https://www.goo-net.com/usedcar/price--100/'],
  ['goonet_min_photos', '8'], ['goonet_min_year', '2000'], ['goonet_max_new_per_run', '10'],
  ['goonet_bookmark_page', '1'], ['goonet_delist_check_limit', '0'], ['goonet_sync_key', '']
].map(([key, value]) => ({ key, value }));

// ---- 1. Delete = blocklist + delete + copies + activity ----------------------
const NBOX = '988026081900208975001';
const tables = {
  japan_dealer_stock: [
    { id: 'car-1', goonet_id: NBOX, stock_no: NBOX, make: 'Honda', model: 'N-BOX', promoted: 'listings', available: true },
    { id: 'car-2', goonet_id: '988026082700208975001', stock_no: '988026082700208975001', make: 'Toyota', model: 'Alphard', promoted: 'none', available: true }
  ],
  site_listings: [{ id: 'l-1', stock_no: NBOX, published: true }, { id: 'l-2', stock_no: 'SHOWROOM-1', published: true }],
  vehicles: [{ id: 'v-1', stock_no: NBOX, vendor: 'Goo-net' }, { id: 'v-2', stock_no: NBOX, vendor: 'AR7 Showroom' }],
  goonet_blocklist: [],
  activities: [],
  site_settings: settingsRows
};
const db = memDb(tables);

const res404 = fakeRes();
await stockHandler({ method: 'DELETE', query: { entity: 'goonet', id: 'nope' }, headers: {} }, res404, { db, auth: adminAuth });
ok(res404.statusCode === 404, 'deleting an unknown id answers 404 and blocks nothing');
ok(tables.goonet_blocklist.length === 0, 'nothing was blocked for the unknown id');

const res = fakeRes();
await stockHandler({ method: 'DELETE', query: { entity: 'goonet', id: 'car-1' }, headers: {} }, res, { db, auth: adminAuth });
ok(res.statusCode === 200 && res.body.ok === true, 'DELETE answers 200 ok');
ok(res.body.blocked === true && res.body.goonet_id === NBOX, 'the response confirms the car was blocked');
ok(!tables.japan_dealer_stock.some(r => r.id === 'car-1'), 'the car is gone from japan_dealer_stock');
ok(tables.japan_dealer_stock.some(r => r.id === 'car-2'), 'the other car is untouched');
const b = tables.goonet_blocklist.find(r => r.goonet_id === NBOX);
ok(!!b, 'the goo-net id is on goonet_blocklist');
ok(b?.stock_no === NBOX && /Manually deleted via CRM by Test Admin/.test(b?.reason || '') && !!b?.blocked_at,
  'blocklist row carries stock_no, the CRM reason with the actor, and blocked_at');
ok(tables.site_listings.map(r => r.id).join() === 'l-2', 'the website copy (site_listings) of the deleted car is removed, others stay');
ok(tables.vehicles.map(r => r.id).join() === 'v-2', 'the CRM inventory copy is removed; a showroom car sharing the stock no. stays');
ok(tables.activities.length === 1 && tables.activities[0].action.startsWith('Permanently deleted and blocked car') && tables.activities[0].action.includes(NBOX),
  'activity log: "Permanently deleted and blocked car …"');
ok(tables.activities[0].actor === 'Test Admin', 'activity names the admin');

// Deleting twice: the second call is a clean 404 (nothing to delete), the
// blocklist entry stays.
const resAgain = fakeRes();
await stockHandler({ method: 'DELETE', query: { entity: 'goonet', id: 'car-1' }, headers: {} }, resAgain, { db, auth: adminAuth });
ok(resAgain.statusCode === 404 && tables.goonet_blocklist.length === 1, 'a repeat delete is a 404 and the blocklist entry survives');

// Non-admins cannot delete.
const resDenied = fakeRes();
await stockHandler({ method: 'DELETE', query: { entity: 'goonet', id: 'car-2' }, headers: {} }, resDenied,
  { db, auth: { profile: { role: 'staff', full_name: 'Staff' }, user: { email: 's@example.com' } } });
ok(resDenied.statusCode === 403 && tables.japan_dealer_stock.some(r => r.id === 'car-2'), 'a non-admin gets 403 and nothing is deleted');

// ---- 2. If the blocklist write fails, the car is NOT deleted -----------------
const t2 = { japan_dealer_stock: [{ id: 'car-9', goonet_id: 'G9', stock_no: 'G9' }], activities: [] };
const brokenDb = memDb(t2);
const okFrom = brokenDb.from;
brokenDb.from = name => name === 'goonet_blocklist'
  ? { upsert: async () => ({ error: new Error('relation "goonet_blocklist" does not exist') }) }
  : okFrom(name);
const resBroken = fakeRes();
await stockHandler({ method: 'DELETE', query: { entity: 'goonet', id: 'car-9' }, headers: {} }, resBroken, { db: brokenDb, auth: adminAuth });
ok(resBroken.statusCode === 500 && /goonet_blocklist/.test(resBroken.body.error), 'when the blocklist cannot be written the delete is refused with a clear error');
ok(t2.japan_dealer_stock.length === 1, 'the car is still there (it would only have come back)');

// ---- 3. The next importer run does NOT restore the deleted car ---------------
// The listing page still shows the N-BOX (dealers keep cars up for weeks);
// the importer must skip it as "blocked (previously deleted)".
resetFetchState();
global.fetch = async (url) => {
  const u = String(url);
  if (u === 'https://www.goo-net.com/') return { ok: true, status: 200, text: async () => '<html>home</html>' };
  if (u.includes('price--100')) return { ok: true, status: 200, text: async () => listingHtml };
  if (u.includes('/usedcar/spread/goo/')) return { ok: true, status: 200, text: async () => detailHtml };
  return { ok: false, status: 404, text: async () => '' };
};
process.env.GOONET_SYNC_KEY = 'test-key';
const syncRes = fakeRes();
await syncHandler({ method: 'GET', query: { key: 'test-key' }, headers: {} }, syncRes, { db });
ok(syncRes.statusCode === 200, 'the importer run after the delete answers 200');
ok(!tables.japan_dealer_stock.some(r => r.goonet_id === NBOX), 'the deleted N-BOX is NOT re-imported');
ok((syncRes.body.skipped || []).includes(`${NBOX}: blocked (previously deleted)`), 'the run report says "blocked (previously deleted)"');
ok(syncRes.body.blockedSkipped === 1, 'blockedSkipped counts it');
ok(tables.site_listings.every(r => r.stock_no !== NBOX), 'the website copy did not come back either');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
