#!/usr/bin/env node
// Machinery import agent (npm run test:machinery-import).
//
// Pins the contract that makes an import safe to run against a source we do
// not control:
//   • step=preview WRITES NOTHING — not a row, not an activity, not a log;
//   • step=confirm writes only what the operator approved;
//   • a photo with no rights basis is never imported, let alone published;
//   • the same machine seen twice UPDATES (and records a re-price) instead of
//     being imported again;
//   • a machine that goes missing is FLAGGED, never deleted;
//   • both steps need site.write, and neither works anonymously.
//
// No network and no database: the supplier page is a fixture and the Supabase
// client is an in-memory fake.
let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
const bad = s => process.stderr.write(s + '\n');
const ok = (cond, msg) => { if (cond) { pass++; say('  ✓ ' + msg); } else { fail++; bad('  ✗ ' + msg); } };

// ---- in-memory Supabase-shaped client --------------------------------------
function fakeDb(seed = {}) {
  const tables = { machinery: [], activities: [], site_settings: [], ...seed };
  let seq = 0;
  const clone = r => JSON.parse(JSON.stringify(r));
  const apply = (rows, f) => rows.filter(r => f.every(([c, v]) => String(r[c]) === String(v)));

  function q(table) {
    const api = {
      _f: [], _m: 'select', _p: null,
      select() { return this; }, order: () => api, limit: () => api,
      eq(c, v) { api._f.push([c, v]); return api; },
      insert(p) { api._m = 'insert'; api._p = p; return api; },
      update(p) { api._m = 'update'; api._p = p; return api; },
      delete() { api._m = 'delete'; return api; },
      single() { api._single = true; return api; },
      maybeSingle() { api._single = true; return api; },
      then(resolve) {
        const rows = tables[table] || [];
        if (api._m === 'insert') {
          const row = { id: 'id-' + (++seq), ...clone(api._p) };
          rows.push(row); return resolve({ data: clone(row), error: null });
        }
        if (api._m === 'update') {
          const hits = apply(rows, api._f);
          for (const r of hits) Object.assign(r, clone(api._p));
          return resolve({ data: hits[0] ? clone(hits[0]) : null, error: null });
        }
        if (api._m === 'delete') {
          const hits = apply(rows, api._f);
          for (const r of hits) rows.splice(rows.indexOf(r), 1);
          return resolve({ data: null, error: null });
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
  const r = {
    statusCode: 0, body: null, headers: {},
    status(c) { r.statusCode = c; return r; },
    setHeader(k, v) { r.headers[String(k).toLowerCase()] = v; return r; },
    end(b) { r.body = b; return r; },
    json: () => (typeof r.body === 'string' ? JSON.parse(r.body) : r.body)
  };
  return r;
}

const api = (await import('../api/site-content.js')).default;
const req = (method, query, body) => ({ method, query, body, headers: {} });

const ADMIN = { id: 'u-admin', role: 'admin', full_name: 'Sara Malik', email: 'sara@ar7.test' };
const SALES = { id: 'u-sales', role: 'sales', full_name: 'Omar Ali', email: 'omar@ar7.test' };
const asUser = profile => ({
  getUser: async () => ({ user: { id: profile.id }, profile, db: null }),
  permsFor: async role => ({ 'site.write': role === 'admin' || role === 'manager' })
});

// A supplier product page with JSON-LD, the shape most marketplaces publish.
const PAGE = url => `<!doctype html><html><head>
<title>Used Doosan DX300LC-9C Crawler Excavator 2019 for sale</title>
<meta property="og:title" content="Used Doosan DX300LC-9C Crawler Excavator 2019">
<meta property="og:image" content="https://supplier.example/p/dx300-1.jpg">
<script type="application/ld+json">{"@type":"Product","name":"Doosan DX300LC-9C Crawler Excavator","brand":{"name":"Doosan"},"offers":{"price":50000,"priceCurrency":"USD"},"image":["https://supplier.example/p/dx300-1.jpg","https://supplier.example/p/dx300-2.jpg"]}</script>
</head><body><h1>Used Doosan DX300LC-9C Crawler Excavator 2019</h1>
<table><tr><th>Operating weight</th><td>30,200 kg</td></tr><tr><th>Engine</th><td>Doosan DE08TIS</td></tr><tr><th>Year</th><td>2019</td></tr><tr><th>Hours</th><td>6800</td></tr></table>
<img src="https://supplier.example/p/dx300-3.jpg">
</body></html>`;

const URL_A = 'https://supplier.example/p/dx300';
const URL_B = 'https://supplier.example/p/dx420';

// ---------------------------------------------------------------------------
say('\n-- preview writes nothing --');
{
  const db = fakeDb();
  const res = fakeRes();
  await api(req('POST', { import: 'machinery', step: 'preview' }, { url: URL_A, rights: 'supplier-permission' }), res, {
    db, ...asUser(ADMIN),
    // The page is fetched by the adapter; stand the network call in.
    fetchPage: null
  });
  // No fetch stub was supplied, so this exercises the real fetch path — which
  // cannot reach the network here. Assert the contract we CAN assert offline:
  // the DB is untouched either way.
  ok(db._tables.machinery.length === 0, 'a preview created no machinery row');
  ok(db._tables.activities.length === 0, 'a preview wrote no activity entry');
  ok(res.statusCode === 422 || res.statusCode === 200,
    `an unreachable supplier is an honest non-crash (got ${res.statusCode})`);
  if (res.statusCode === 422) ok(/could not read|no product data/i.test(res.json().error), 'and says why, in words');
}

// Everything below drives the agent with the page supplied directly, which is
// how the scheduled job uses it (it has already fetched the page).
const preview = (db, body, user = ADMIN) => {
  const res = fakeRes();
  return api(req('POST', { import: 'machinery', step: 'preview' }, body), res, { db, ...asUser(user) }).then(() => res);
};

say('\n-- preview reads a supplier page --');
{
  const db = fakeDb();
  const res = await preview(db, { url: URL_A, rights: 'supplier-permission', html: PAGE(URL_A) });
  ok(res.statusCode === 200, `a readable page previews (got ${res.statusCode})`);
  const b = res.json();
  ok(b.preview === true && b.written === false, 'the response says it is a preview that wrote nothing');
  ok(b.machine?.brand === 'Doosan', `the brand was read (${b.machine?.brand})`);
  ok(b.machine?.type === 'Excavators', `the type was classified (${b.machine?.type})`);
  ok(b.machine?.year === 2019, `the year was read (${b.machine?.year})`);
  ok(b.machine?.supplierPrice === 50000, `the supplier price was read (${b.machine?.supplierPrice})`);
  ok(b.machine?.listPrice > b.machine?.supplierPrice, 'the list price carries the markup');
  ok(b.machine?.images?.length >= 2, `photos were found (${b.machine?.images?.length})`);
  ok(b.would.create === 1, 'it says it would create one new machine');
  ok(b.would.update === 0, 'and update nothing');
  ok(!!b.confirmWith?.url, 'it echoes back what to confirm with');
  ok(db._tables.machinery.length === 0, 'and still nothing was written');
}

say('\n-- no rights basis means no photos --');
{
  const db = fakeDb();
  const res = await preview(db, { url: URL_A, rights: '', html: PAGE(URL_A) });
  const b = res.json();
  ok(b.machine?.images?.length === 0, 'no photographs were imported');
  ok(b.machine?.photosPending === true, 'the machine is marked as awaiting photos');
  ok(b.warnings.some(w => /rights basis/i.test(w)), 'and the operator is told why');
  ok(b.warnings.some(w => /supplier-permission/.test(w)), 'the warning names the accepted bases');
  // The machine is nevertheless importable — every machine is listed.
  ok(b.would.create === 1, 'the machine is still importable without photos');
}

say('\n-- a page with nothing to read --');
{
  const db = fakeDb();
  const res = await preview(db, { url: URL_A, rights: 'own-photo', html: '<html><body><p>Log in to continue</p></body></html>' });
  ok(res.statusCode === 422, `an unreadable page is refused (got ${res.statusCode})`);
  ok(/no product data|log in|login/i.test(res.json().error), 'and the reason is explained');

  const noUrl = await preview(db, { url: '', rights: 'own-photo' });
  ok(noUrl.statusCode === 400, 'an empty link is refused');

  const badUrl = await preview(db, { url: 'not-a-link', html: PAGE(URL_A) });
  ok(badUrl.statusCode === 400, 'a non-web address is refused');
  ok(/http/i.test(badUrl.json().error), 'and the message says what a link should look like');
}

say('\n-- confirm writes what was approved --');
{
  const db = fakeDb();
  const p = await preview(db, { url: URL_A, rights: 'supplier-permission', html: PAGE(URL_A) });
  const shown = p.json();

  const c = fakeRes();
  await api(req('POST', { import: 'machinery', step: 'confirm' },
    { machines: [shown.machine], rights: 'supplier-permission', adapter: shown.source.adapter }), c, { db, ...asUser(ADMIN) });
  ok(c.statusCode === 200, `confirm succeeds (got ${c.statusCode})`);
  const b = c.json();
  ok(b.imported === 1, `one machine was imported (${b.imported})`);
  ok(db._tables.machinery.length === 1, 'exactly one row exists');

  const row = db._tables.machinery[0];
  ok(row.published === true, 'the imported machine is published — every machine is');
  ok(row.published_by === 'auto', "published_by records that the importer did it, not a person");
  ok(/auto/i.test(row.published_by_name || ''), `and the CRM can show that (${row.published_by_name})`);
  ok(!!row.created_by_name, `who ran the import is recorded (${row.created_by_name})`);
  ok(!!row.imported_at, 'the import time is recorded');
  ok(row.source_url === URL_A, 'the source link is kept');
  ok(row.adapter === shown.source.adapter, 'and which adapter read it');
  ok(row.rights_basis === 'supplier-permission', 'the rights basis is stored on the row');
  ok(row.images.every(i => i.rights === 'supplier-permission'), 'every stored photo carries the basis');
  ok(!!row.source_last_seen_at, 'the source was marked as seen just now');
}

say('\n-- the same machine twice updates, and logs the re-price --');
{
  const db = fakeDb();
  const p1 = await preview(db, { url: URL_A, rights: 'own-photo', html: PAGE(URL_A) });
  await api(req('POST', { import: 'machinery', step: 'confirm' },
    { machines: [p1.json().machine], rights: 'own-photo' }), fakeRes(), { db, ...asUser(ADMIN) });
  ok(db._tables.machinery.length === 1, 'first import creates one row');

  // The supplier drops the price. Same URL, so this is the SAME machine.
  const cheaper = PAGE(URL_A).replace('"price":50000', '"price":44000');
  const p2 = await preview(db, { url: URL_A, rights: 'own-photo', html: cheaper });
  ok(p2.json().would.update === 1, 'the second preview says it would update, not create');
  ok(p2.json().would.create === 0, 'and would not create a duplicate');
  ok(p2.json().would.rePrice.length === 1, 'it reports the price change up front');

  const c2 = fakeRes();
  await api(req('POST', { import: 'machinery', step: 'confirm' },
    { machines: [p2.json().machine], rights: 'own-photo' }), c2, { db, ...asUser(ADMIN) });
  const b2 = c2.json();
  ok(b2.imported === 0 && b2.updated === 1, `it updated rather than duplicating (${b2.imported} created, ${b2.updated} updated)`);
  ok(db._tables.machinery.length === 1, 'still exactly one row');
  const row = db._tables.machinery[0];
  ok(row.price_before_usd === 62500, `the old price was kept (${row.price_before_usd})`);
  ok(Number(row.price_usd) < 62500, `the new price is lower (${row.price_usd})`);
  ok(!!row.price_changed_at, 'and the change is timestamped');
  ok(b2.rePriced?.[0]?.before === 62500, 'the response reports was → now');
}

say('\n-- a different machine is a different machine --');
{
  const db = fakeDb();
  const p1 = await preview(db, { url: URL_A, rights: 'own-photo', html: PAGE(URL_A) });
  await api(req('POST', { import: 'machinery', step: 'confirm' }, { machines: [p1.json().machine], rights: 'own-photo' }), fakeRes(), { db, ...asUser(ADMIN) });
  const p2 = await preview(db, { url: URL_B, rights: 'own-photo', html: PAGE(URL_B) });
  await api(req('POST', { import: 'machinery', step: 'confirm' }, { machines: [p2.json().machine], rights: 'own-photo' }), fakeRes(), { db, ...asUser(ADMIN) });
  ok(db._tables.machinery.length === 2, `two different links make two machines (${db._tables.machinery.length})`);
}

say('\n-- permissions --');
{
  const db = fakeDb();
  const p = await preview(db, { url: URL_A, rights: 'own-photo', html: PAGE(URL_A) });
  const body = { machines: [p.json().machine], rights: 'own-photo' };

  const anonP = await preview(db, { url: URL_A, rights: 'own-photo', html: PAGE(URL_A) }, null);
  const anonRes = fakeRes();
  await api(req('POST', { import: 'machinery', step: 'preview' }, { url: URL_A, html: PAGE(URL_A) }), anonRes, { db });
  ok(anonRes.statusCode === 401, `an anonymous caller cannot preview (got ${anonRes.statusCode})`);

  const anonC = fakeRes();
  await api(req('POST', { import: 'machinery', step: 'confirm' }, body), anonC, { db });
  ok(anonC.statusCode === 401, `an anonymous caller cannot import (got ${anonC.statusCode})`);

  const denied = fakeRes();
  await api(req('POST', { import: 'machinery', step: 'confirm' }, body), denied, { db, ...asUser(SALES) });
  ok(denied.statusCode === 403, `a role without site.write cannot import (got ${denied.statusCode})`);

  const deniedP = fakeRes();
  await api(req('POST', { import: 'machinery', step: 'preview' }, { url: URL_A, html: PAGE(URL_A) }), deniedP, { db, ...asUser(SALES) });
  ok(deniedP.statusCode === 403, 'and cannot preview either');
  ok(db._tables.machinery.length === 0, 'nothing was written by any of them');
}

say('\n-- guard rails --');
{
  const db = fakeDb();
  const empty = fakeRes();
  await api(req('POST', { import: 'machinery', step: 'confirm' }, { machines: [] }), empty, { db, ...asUser(ADMIN) });
  ok(empty.statusCode === 400, 'confirming nothing is refused');

  const tooMany = fakeRes();
  const many = new Array(60).fill({ ref: 'AR7-MC-X', type: 'Excavators', brand: 'B', model: 'M', year: 2020, price_usd: 1 });
  await api(req('POST', { import: 'machinery', step: 'confirm' }, { machines: many }), tooMany, { db, ...asUser(ADMIN) });
  ok(tooMany.statusCode === 400, `a runaway batch is refused (got ${tooMany.statusCode})`);
  ok(/at most/i.test(tooMany.json().error), 'with a ceiling stated');

  const unknown = fakeRes();
  await api(req('POST', { import: 'machinery', step: 'teleport' }, {}), unknown, { db, ...asUser(ADMIN) });
  ok(unknown.statusCode === 400, 'an unknown step is refused');
  ok(/preview.*confirm|confirm/i.test(unknown.json().error), 'and the valid steps are named');
}

say('\n-- a machine that goes missing is flagged, never deleted --');
{
  const db = fakeDb();
  const p = await preview(db, { url: URL_A, rights: 'own-photo', html: PAGE(URL_A) });
  await api(req('POST', { import: 'machinery', step: 'confirm' }, { machines: [p.json().machine], rights: 'own-photo' }), fakeRes(), { db, ...asUser(ADMIN) });
  ok(db._tables.machinery.length === 1, 'one machine imported');

  // A run that did not see it.
  const stale = fakeRes();
  await api(req('POST', { import: 'machinery', step: 'stale' }, { sourceHost: 'supplier.example', seenIds: [] }), stale, { db, ...asUser(ADMIN) });
  ok(stale.statusCode === 200, 'the staleness pass runs');
  ok(stale.json().flagged === 1, `the unseen machine was flagged (${stale.json().flagged})`);
  ok(db._tables.machinery.length === 1, 'and it was NOT deleted — only the owner removes a machine');
  ok(!!db._tables.machinery[0].source_missing_since, 'the row records when it went missing');
  ok(db._tables.machinery[0].published === true, 'and it stays listed — a supplier hiding a listing for a weekend is not the same as it being gone');

  // A run that sees it again clears the flag.
  const again = fakeRes();
  await api(req('POST', { import: 'machinery', step: 'stale' }, { sourceHost: 'supplier.example', seenIds: [db._tables.machinery[0].id] }), again, { db, ...asUser(ADMIN) });
  ok(again.json().cleared === 1, 'seeing it again clears the flag');
  ok(!db._tables.machinery[0].source_missing_since, 'and the row is clean');
}

say(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
