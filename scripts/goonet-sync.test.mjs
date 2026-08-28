#!/usr/bin/env node
// Integration test for the Vercel importer (api/goonet-sync.js) run flow.
// Uses an in-memory Supabase-shaped client and a mocked global.fetch that
// serves fixture HTML — no network, no real database. Run:
//   node scripts/goonet-sync.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name); }
}

const dir = path.dirname(fileURLToPath(import.meta.url));

// ---- Tiny in-memory database shaped like the Supabase query builder -------
function memDb() {
  const tables = {};
  function from(name) {
    const rows = tables[name] || (tables[name] = []);
    function q() {
      const ctx = { filters: [], order: null, limitN: null, cols: ['*'] };
      const api = {
        select: (...cols) => {
          ctx.cols = cols.length ? cols.flatMap(c => String(c).split(',').map(s => s.trim()).filter(Boolean)) : ['*'];
          return api;
        },
        eq: (k, v) => { ctx.filters.push(r => r[k] === v); return api; },
        lt: (k, v) => { ctx.filters.push(r => r[k] < v); return api; },
        gte: (k, v) => { ctx.filters.push(r => r[k] >= v); return api; },
        order: (k, opts = {}) => {
          ctx.order = (a, b) => {
            const av = a[k], bv = b[k];
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            const c = String(av).localeCompare(String(bv), undefined, { numeric: true });
            return opts.ascending === false ? -c : c;
          };
          return api;
        },
        limit: n => { ctx.limitN = n; return api; },
        _rows() {
          let out = rows.filter(r => ctx.filters.every(f => f(r)));
          if (ctx.order) out = out.slice().sort(ctx.order);
          if (ctx.limitN) out = out.slice(0, ctx.limitN);
          if (ctx.cols[0] === '*') return out;
          return out.map(r => Object.fromEntries(ctx.cols.map(c => [c, r[c]])));
        },
        maybeSingle: async () => ({ data: api._rows()[0] || null, error: null }),
        single: async () => {
          const r = api._rows()[0];
          return r ? { data: r, error: null } : { data: null, error: new Error('not found') };
        },
        // Supabase query builders are thenable — awaiting resolves {data, error}.
        then(resolve) { return resolve({ data: api._rows(), error: null }); },
        catch() { return Promise.resolve({ data: [], error: new Error('cancelled') }); }
      };
      return api;
    }
    return {
      select: (...cols) => q().select(...cols),
      eq: (k, v) => q().eq(k, v),
      lt: (k, v) => q().lt(k, v),
      gte: (k, v) => q().gte(k, v),
      order: (k, o) => q().order(k, o),
      limit: n => q().limit(n),
      maybeSingle: async () => q().maybeSingle(),
      single: async () => q().single(),
      async insert(rowsIn) {
        for (const r of (Array.isArray(rowsIn) ? rowsIn : [rowsIn])) {
          rows.push({ ...r, id: r.id || 'id-' + Math.random().toString(36).slice(2) });
        }
        return { error: null };
      },
      update(patch) {
        // Chainable like Supabase: .update(patch).eq(k, v) → await for {error}.
        const chain = q();
        chain.then = resolve => {
          chain._rows().forEach(r => Object.assign(r, patch));
          return resolve({ error: null });
        };
        return chain;
      },
      delete() {
        const chain = q();
        chain.then = resolve => {
          const doomed = chain._rows();
          doomed.forEach(r => { const i = rows.indexOf(r); if (i >= 0) rows.splice(i, 1); });
          return resolve({ error: null });
        };
        return chain;
      },
      async upsert(list) {
        for (const item of (Array.isArray(list) ? list : [list])) {
          const existing = rows.find(r => r.key === item.key);
          if (existing) Object.assign(existing, item);
          else rows.push({ ...item });
        }
        return { error: null };
      }
    };
  }
  return {
    db: {
      from,
      auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'admin@ar7traders.com' } }, error: null }) }
    },
    tables
  };
}

// ---- Fixtures --------------------------------------------------------------
const listingHtml = readFileSync(path.join(dir, 'fixtures/goonet-listing.html'), 'utf8');
const detailHtml = readFileSync(path.join(dir, 'fixtures/goonet-detail.html'), 'utf8');
const notFoundHtml = '<html><body>ページが見つかりません。　Not,found.</body></html>';

// ---- Import the handler with the fixture-driven fetch ----------------------
const { db, tables } = memDb();
const seedSettings = [
  ['goonet_min_photos', '3'],
  ['goonet_max_new_per_run', '2'],
  ['goonet_max_delist_per_run', '2'],
  ['goonet_weekly_delist_limit', '1'],
  ['goonet_weekly_promote_limit', '1'],
  ['goonet_auto_promote', 'true'],
  ['goonet_jpy_usd_rate', '0.0068'],
  ['goonet_bookmark_page', '1'],
  ['goonet_search_url', 'https://www.goo-net.com/usedcar/price--100/']
];
tables.site_settings = seedSettings.map(([key, value]) => ({ key, value }));
// One existing car that is "delisted" on goo-net (its url returns 404).
tables.japan_dealer_stock = [{
  id: 'old-1', goonet_id: '988026062900208975002', stock_no: '988026062900208975002',
  make: 'Nissan', model: 'Note', available: true, promoted: 'none',
  goonet_url: 'https://www.goo-net.com/usedcar/spread/goo/15/988026062900208975002.html',
  last_seen_at: '2026-01-01T00:00:00Z', imported_at: '2026-01-01T00:00:00Z', quality_score: 50
}];

const fetchCalls = [];
global.fetch = async (url) => {
  const u = String(url);
  fetchCalls.push(u);
  let body = '';
  let status = 200;
  if (u.includes('/usedcar/spread/goo/15/988026062900208975002')) { body = notFoundHtml; }
  else if (u.includes('/usedcar/spread/goo/15/988026081900208975001')) { body = detailHtml; }
  else if (u.includes('price--100')) { body = listingHtml; }
  else if (u.includes('/usedcar/spread/goo/')) { body = detailHtml; }
  else { status = 404; }
  return { ok: status < 400, status, text: async () => body };
};

const { default: handler } = await import('../api/goonet-sync.js');

function fakeRes() {
  const r = { statusCode: 0, body: null };
  r.status = code => { r.statusCode = code; return r; };
  r.setHeader = () => {};
  r.end = json => { r.body = JSON.parse(json); };
  return r;
}

const req = { method: 'POST', query: { key: 'test-key' }, headers: {} };
process.env.GOONET_SYNC_KEY = 'test-key';

const res = fakeRes();
await handler(req, res, { db });

// ---- Assertions -------------------------------------------------------------
const stock = tables.japan_dealer_stock;
const settings = Object.fromEntries(tables.site_settings.map(r => [r.key, r.value]));
const inserted = stock.filter(r => r.goonet_id === '988026081900208975001');
const delistedOld = stock.find(r => r.id === 'old-1');
const activities = tables.activities || [];

ok(res.statusCode === 200, 'handler responded 200');
ok(stock.length >= 2, 'run inserted at least one new car');
ok(inserted[0]?.make === 'Honda' && inserted[0]?.model === 'N-BOX', 'inserted car has parsed make/model');
ok(inserted[0]?.year === 2014, 'inserted car has year');
ok(inserted[0]?.photo_count >= 3, 'inserted car passed the photo gate');
ok(inserted[0]?.quality_score > 0, 'inserted car has a quality score');
ok(delistedOld?.available === false, 'delisted car marked unavailable');
ok(Number(settings.goonet_bookmark_page) === 2, 'bookmark advanced to page 2');
ok(fetchCalls.length >= 3, 'fetch was called for listing + detail + delist check');
ok(fetchCalls[0].includes('price--100'), 'first fetch was the listing page');
ok(activities.length >= 1, 'activity log written');
ok(activities.some(a => String(a.action || '').includes('Delisted')), 'delist logged');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
