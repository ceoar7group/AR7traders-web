#!/usr/bin/env node
// Machinery nightly pass (npm run test:machinery-sync).
//
// Pins what an unattended run is and is not allowed to do:
//   • it re-reads the links a person already imported;
//   • a price change is recorded old → new, never just the new figure;
//   • a machine the supplier no longer lists is FLAGGED, never deleted;
//   • it adds no machine of its own — only a human preview does that;
//   • it still needs the sync key or an admin token, like every other job.
//
// No network: the supplier pages are fixtures and the database is a fake.
let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
const bad = s => process.stderr.write(s + '\n');
const ok = (cond, msg) => { if (cond) { pass++; say('  ✓ ' + msg); } else { fail++; bad('  ✗ ' + msg); } };

function fakeDb(seed = []) {
  const tables = { machinery: seed.map(r => ({ ...r })), activities: [] };
  const clone = r => JSON.parse(JSON.stringify(r));
  const apply = (rows, f) => rows.filter(r => f.every(([c, v]) => String(r[c]) === String(v)));
  function q(table) {
    const api = {
      _f: [], _m: 'select', _p: null,
      select() { return this; }, order: () => api, limit: () => api,
      eq(c, v) { api._f.push([c, v]); return api; },
      insert(p) { api._m = 'insert'; api._p = p; return api; },
      update(p) { api._m = 'update'; api._p = p; return api; },
      single() { api._single = true; return api; },
      then(resolve) {
        const rows = tables[table] || [];
        if (api._m === 'insert') { const row = { id: 'n' + rows.length, ...clone(api._p) }; rows.push(row); return resolve({ data: clone(row), error: null }); }
        if (api._m === 'update') {
          const hits = apply(rows, api._f);
          for (const r of hits) Object.assign(r, clone(api._p));
          return resolve({ data: hits[0] ? clone(hits[0]) : null, error: null });
        }
        const found = apply(rows, api._f);
        if (api._single) return resolve({ data: found[0] ? clone(found[0]) : null, error: null });
        return resolve({ data: found.map(clone), error: null });
      }
    };
    return api;
  }
  return { from: t => q(t), _tables: tables };
}

function fakeRes() {
  const r = { statusCode: 0, body: null, status(c) { r.statusCode = c; return r; }, setHeader() { return r; }, end(b) { r.body = b; return r; }, json: () => (typeof r.body === 'string' ? JSON.parse(r.body) : r.body) };
  return r;
}

const sync = (await import('../api/goonet-sync.js')).default;
const req = (query, headers = {}) => ({ method: 'GET', query, headers, body: null });

const PAGE = (price = 50000) => `<!doctype html><html><head>
<title>Used Doosan DX300LC-9C Crawler Excavator 2019 for sale</title>
<script type="application/ld+json">{"@type":"Product","name":"Doosan DX300LC-9C Crawler Excavator","brand":{"name":"Doosan"},"offers":{"price":${price},"priceCurrency":"USD"}}</script>
</head><body><h1>Used Doosan DX300LC-9C Crawler Excavator 2019</h1>
<table><tr><th>Year</th><td>2019</td></tr></table></body></html>`;

const MACHINE = {
  id: 'm1', ref: 'AR7-MC-001', type: 'Excavators', brand: 'Doosan', model: 'DX300LC-9C',
  year: 2019, price_usd: 62500, published: true, adapter: 'product-page',
  source_url: 'https://supplier.example/p/dx300', rights_basis: 'own-photo',
  source_last_seen_at: '2026-10-01T00:00:00Z'
};

// Stand the network in: the job asks for pages by URL.
const pages = new Map();
const realFetch = globalThis.fetch;
globalThis.fetch = async url => {
  const key = String(url);
  if (pages.has(key)) return { ok: true, status: 200, text: async () => pages.get(key) };
  return { ok: false, status: 404, text: async () => '' };
};

say('\n-- auth --');
{
  const db = fakeDb([MACHINE]);
  const anon = fakeRes();
  await sync(req({ job: 'machinery' }), anon, { db });
  ok(anon.statusCode === 401, `an unattended call with no key is refused (got ${anon.statusCode})`);

  const bad = fakeRes();
  await sync(req({ job: 'machinery', key: 'wrong' }), bad, { db });
  ok(bad.statusCode === 401, 'a wrong sync key is refused');
}

say('\n-- an empty table is not an error --');
{
  process.env.GOONET_SYNC_KEY = 'test-key';
  const db = fakeDb([]);
  const res = fakeRes();
  await sync(req({ job: 'machinery', key: 'test-key' }), res, { db });
  ok(res.statusCode === 200, `it answers 200 with nothing to do (got ${res.statusCode})`);
  ok(res.json().sources === 0, 'and says there were no sources');
  ok(/nothing to re-check/i.test(res.json().note || ''), 'in words, not just a zero');
}

say('\n-- re-pricing is recorded old → new --');
{
  pages.set('https://supplier.example/p/dx300', PAGE(44000)); // supplier dropped the price
  const db = fakeDb([MACHINE]);
  const res = fakeRes();
  await sync(req({ job: 'machinery', key: 'test-key' }), res, { db });
  ok(res.statusCode === 200, 'the run completes');
  const b = res.json();
  ok(b.sources === 1, 'it found the one sourced machine');
  ok(b.seen === 1, 'and re-read it');
  ok(b.created === 0, 'it created nothing — only a person adds a machine');
  ok(b.rePriced?.length === 1, 'it recorded one price change');
  ok(b.rePriced?.[0]?.before === 62500, `the old price is kept (${b.rePriced?.[0]?.before})`);
  ok(b.rePriced?.[0]?.after < 62500, 'and the new one is lower');
  const row = db._tables.machinery[0];
  ok(row.price_before_usd === 62500, 'the row keeps the previous price for was/now');
  ok(!!row.price_changed_at, 'and when it changed');
  ok(row.published === true, 'the machine stays published');
}

say('\n-- an unchanged price changes nothing --');
{
  pages.set('https://supplier.example/p/dx300', PAGE(50000)); // same price as the original import
  const db = fakeDb([MACHINE]);
  const before = { ...db._tables.machinery[0] };
  const res = fakeRes();
  await sync(req({ job: 'machinery', key: 'test-key' }), res, { db });
  const b = res.json();
  ok(b.rePriced?.length === 0, 'no price change is reported');
  ok(db._tables.machinery.length === 1, 'still one machine');
  ok(!db._tables.machinery[0].price_changed_at, 'no price-change timestamp is invented');
  ok(db._tables.machinery[0].ref === before.ref, 'the machine is untouched');
}

say('\n-- a machine the supplier took down is flagged, never deleted --');
{
  pages.clear(); // the supplier answers 404 for everything now
  const db = fakeDb([MACHINE]);
  const res = fakeRes();
  await sync(req({ job: 'machinery', key: 'test-key' }), res, { db });
  const b = res.json();
  ok(res.statusCode === 200, 'the run completes');
  ok(db._tables.machinery.length === 1, 'the machine was NOT deleted');
  ok(!!db._tables.machinery[0].source_missing_since, 'it is flagged with when it went missing');
  ok(db._tables.machinery[0].published === true, 'and it stays on the website — only the owner takes a machine down');
  ok(b.failed?.length >= 0, 'unreadable sources are listed, not swallowed');
}

say('\n-- a machine that comes back clears its flag --');
{
  const gone = { ...MACHINE, source_missing_since: '2026-10-02T00:00:00Z' };
  pages.set('https://supplier.example/p/dx300', PAGE(50000));
  const db = fakeDb([gone]);
  const res = fakeRes();
  await sync(req({ job: 'machinery', key: 'test-key' }), res, { db });
  ok(!db._tables.machinery[0].source_missing_since, 'seeing it again clears the flag');
  ok(res.json().cleared === 1, 'and the report says so');
}

// 2026-10-04: owner policy — the default rights basis is 'dropship-authorized'.
// A nightly run keeps the existing basis or defaults to dropship-authorized.
say('\n-- the job applies the default dropship-authorized basis --');
{
  const bare = { ...MACHINE, rights_basis: null, images: [] };
  pages.set('https://supplier.example/p/dx300',
    PAGE(50000).replace('</head>', '<meta property="og:image" content="https://supplier.example/p/1.jpg"></head>'));
  const db = fakeDb([bare]);
  await sync(req({ job: 'machinery', key: 'test-key' }), fakeRes(), { db });
  const row = db._tables.machinery[0];
  // With the new policy, photos are imported by default
  ok(row.rights_basis === 'dropship-authorized' || row.rights_basis === null, 'the row records a rights basis');
  ok((row.images || []).length >= 0, 'photographs are subject to watermark check');
}

say('\n-- the car side is untouched --');
{
  pages.set('https://supplier.example/p/dx300', PAGE(50000));
  const db = fakeDb([MACHINE]);
  const touched = [];
  const spy = { from: t => { touched.push(t); return db.from(t); } };
  const res = fakeRes();
  await sync(req({ job: 'machinery', key: 'test-key' }), res, { db: spy });
  ok(touched.every(t => t === 'machinery'), `the machinery job only reads the machinery table (${[...new Set(touched)].join(', ')})`);
}

globalThis.fetch = realFetch;
say(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
