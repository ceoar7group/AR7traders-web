// Saved searches & stock alerts — the matcher, the sweep and the API routes.
//
//   node scripts/saved-searches.test.mjs
//
// Everything runs against injected fakes: no network, no Supabase.

import {
  normalizeCriteria, criteriaIsEmpty, matchesCriteria, describeCriteria,
  defaultSearchName, criteriaHref, moneyNumber
} from '../src/saved-search.js';
import {
  stockRef, evaluateSearch, nextSeenRefs, alertEmail, runAlertSweep,
  MAX_SEEN_REFS
} from '../api/_stock-alerts.js';
import handler from '../api/my-account.js';

let passed = 0, failed = 0;
const ok = (cond, label) => {
  if (cond) { passed++; console.log('  \u2713 ' + label); }
  else { failed++; console.error('  \u2717 ' + label); }
};

/* ---------- fixtures ----------------------------------------------------- */

const STOCK = [
  { stock_no: 'LC250', make: 'Toyota', model: 'Land Cruiser 250 VX', year: 2024,
    km: '15,000', fuel: 'Petrol', body: 'SUV', price: '$38,700', tr: 'AT', st: 'RHD', location: 'Aichi' },
  { stock_no: 'PRIUS17', make: 'Toyota', model: 'Prius S', year: 2017,
    km: '81,000', fuel: 'Hybrid', body: 'Sedan', price: '$10,600', tr: 'AT', st: 'RHD', location: 'Okayama' },
  { stock_no: 'HURACAN', make: 'Lamborghini', model: 'Huracan', year: 2021,
    km: '6,295', fuel: 'Petrol', body: 'Coupe', price: '$293,182', tr: 'AT', st: 'LHD', location: 'Aichi' }
];

const toyotaSuv = { make: 'Toyota', body: 'SUV', price_max: 60000, year_min: 2020 };

/* ---------- criteria module ---------------------------------------------- */

console.log('\n-- criteria: normalize / match / describe --');

const n = normalizeCriteria({ make: ' Toyota ', body: 'All', price_max: '60,000', year_min: 2020, junk: 'x' });
ok(n.make === 'Toyota' && n.body === null && n.price_max === 60000 && !('junk' in n),
  'normalizeCriteria trims, drops "All"/"Any" placeholders and unknown keys');
ok(criteriaIsEmpty({ make: 'All', q: '  ' }) === true, 'all-placeholder criteria counts as empty');
ok(criteriaIsEmpty(toyotaSuv) === false, 'a real constraint is not empty');

ok(matchesCriteria(STOCK[0], toyotaSuv) === true, 'the 2024 Land Cruiser matches Toyota SUV under $60k, 2020+');
ok(matchesCriteria(STOCK[1], toyotaSuv) === false, 'the 2017 Prius fails it (body + year)');
ok(matchesCriteria(STOCK[2], toyotaSuv) === false, 'the Huracan fails it (make)');
ok(matchesCriteria(STOCK[0], { q: 'land cruiser' }) === true, 'free-text matches make+model case-insensitively');
ok(matchesCriteria(STOCK[1], { km_max: 100000 }) === true && matchesCriteria(STOCK[1], { km_max: 50000 }) === false,
  'km ceiling parses the "81,000" odometer string');
ok(matchesCriteria({ ...STOCK[0], price: null }, { price_max: 60000 }) === false,
  'a car with no price never matches a budget ceiling (price is a claim, not a default)');
ok(moneyNumber('$38,700') === 38700, 'moneyNumber parses currency strings');

const chips = describeCriteria(toyotaSuv);
ok(chips.includes('Toyota') && chips.includes('SUV') && chips.some(c => c.includes('60,000')) && chips.includes('2020+'),
  'describeCriteria renders human chips (' + chips.join(' · ') + ')');
ok(describeCriteria({}).join() === 'All stock', 'empty criteria describes as "All stock"');
ok(defaultSearchName(toyotaSuv).length <= 60 && defaultSearchName(toyotaSuv).startsWith('Toyota'),
  'defaultSearchName starts with the make and stays short');
ok(criteriaHref(toyotaSuv, (mk, md) => `/inventory?make=${mk}`) === '/inventory?make=Toyota',
  'criteriaHref delegates make/model to the router helper');

/* ---------- sweep internals ----------------------------------------------- */

console.log('\n-- sweep: evaluate / seen_refs / e-mail --');

const search = { id: 's1', name: 'Toyota SUVs', criteria: toyotaSuv, seen_refs: [], email: 'b@x.com', email_alerts: true };
let ev = evaluateSearch(search, STOCK);
ok(ev.matchRefs.join() === 'LC250' && ev.newRefs.join() === 'LC250',
  'a fresh search sees the matching car as NEW');
ev = evaluateSearch({ ...search, seen_refs: ['LC250'] }, STOCK);
ok(ev.matchRefs.length === 1 && ev.newRefs.length === 0,
  'a car already in seen_refs never re-alerts');
ok(stockRef({ stock_no: ' X1 ' }) === 'X1' && stockRef({}) === null, 'stockRef trims and rejects blanks');

const seen = nextSeenRefs({ seen_refs: Array.from({ length: MAX_SEEN_REFS }, (_, i) => 'r' + i) }, ['new-ref']);
ok(seen.length === MAX_SEEN_REFS && seen.at(-1) === 'new-ref' && !seen.includes('r0'),
  'seen_refs is capped at ' + MAX_SEEN_REFS + ' with the oldest trimmed first');

const mail = alertEmail(search, [STOCK[0]]);
ok(mail.subject === 'New in stock: 2024 Toyota Land Cruiser 250 VX', 'single-car subject names the car');
ok(mail.text.includes('/inventory/LC250') && mail.html.includes('/inventory/LC250'),
  'the e-mail links straight to the vehicle page');
ok(mail.text.includes('/account'), 'the e-mail points at the account page to manage alerts');
const many = alertEmail(search, Array.from({ length: 9 }, (_, i) => ({ ...STOCK[0], stock_no: 'C' + i })));
ok(many.subject.startsWith('9 new cars') && many.text.includes('and 3 more'),
  'a big batch becomes a digest (6 shown, "…and 3 more")');

/* ---------- a fake Supabase ------------------------------------------------ */

function fakeDb(rows) {
  const calls = { updates: [], inserts: [], deletes: [] };
  const db = {
    calls,
    from(table) {
      const q = {
        _table: table, _filters: {}, _count: null,
        select(_cols, opts) { if (opts?.count) q._count = true; return q; },
        eq(k, v) { q._filters[k] = v; return q; },
        order() { return q; },
        is() { return q; }, ilike() { return q; }, limit() { return q; },
        insert(payload) { calls.inserts.push({ table, payload }); q._inserted = payload; return q; },
        update(payload) { q._update = payload; return q; },
        delete() { q._delete = true; return q; },
        single() { q._single = true; return q; },
        then(resolve) {
          if (q._inserted) return resolve({ data: { id: 'new-id', created_at: 'now', ...q._inserted }, error: null });
          if (q._update) { calls.updates.push({ table, id: q._filters.id, patch: q._update }); 
            const row = rows.find(r => r.id === q._filters.id && (!q._filters.auth_user_id || r.auth_user_id === q._filters.auth_user_id));
            return resolve(row ? { data: { ...row, ...q._update }, error: null } : { data: null, error: { message: 'not found' } });
          }
          if (q._delete) { calls.deletes.push({ table, id: q._filters.id }); return resolve({ error: null }); }
          if (q._count) return resolve({ count: rows.filter(r => r.auth_user_id === q._filters.auth_user_id).length });
          let data = rows.filter(r => Object.entries(q._filters).every(([k, v]) => r[k] === v));
          // 2026-11-08: saved_favourites shares this fake (the ?favourites
          // routes live on the same function); other tables stay empty.
          if (table !== 'saved_searches' && table !== 'saved_favourites') data = [];
          if (q._single) return resolve(data[0] ? { data: data[0], error: null } : { data: null, error: { message: 'not found' } });
          return resolve({ data, error: null });
        }
      };
      return q;
    }
  };
  return db;
}

/* ---------- runAlertSweep -------------------------------------------------- */

console.log('\n-- runAlertSweep --');

{
  const rows = [
    { id: 'a', auth_user_id: 'u1', email: 'b@x.com', email_alerts: true,  name: 'Toyota SUVs', criteria: toyotaSuv, seen_refs: [] },
    { id: 'b', auth_user_id: 'u2', email: 'c@x.com', email_alerts: false, name: 'Muted',       criteria: toyotaSuv, seen_refs: [] },
    { id: 'c', auth_user_id: 'u3', email: 'd@x.com', email_alerts: true,  name: 'Seen',        criteria: toyotaSuv, seen_refs: ['LC250'] }
  ];
  const db = fakeDb(rows);
  const sent = [];
  const result = await runAlertSweep(db, {
    stock: STOCK,
    emailFn: async (to, msg) => { sent.push({ to, subject: msg.subject }); return 'sent'; },
    now: new Date('2026-11-07T00:00:00Z')
  });
  ok(result.checked === 3 && result.matched === 2 && result.emailed === 1,
    `sweep: 3 checked, 2 with new matches, 1 e-mailed (${JSON.stringify(result)})`);
  ok(sent.length === 1 && sent[0].to === 'b@x.com', 'only the un-muted owner with new stock gets mail');
  const aPatch = db.calls.updates.find(u => u.id === 'a')?.patch;
  ok(Array.isArray(aPatch?.seen_refs) && aPatch.seen_refs.includes('LC250') && aPatch.last_notified_at,
    'the alerted search persists seen_refs + last_notified_at');
  const bPatch = db.calls.updates.find(u => u.id === 'b')?.patch;
  ok(Array.isArray(bPatch?.seen_refs) && !bPatch.last_notified_at,
    'the muted search still advances seen_refs (no backlog bomb when unmuted) but records no notification');
  const cPatch = db.calls.updates.find(u => u.id === 'c')?.patch;
  ok(cPatch && !cPatch.seen_refs && !cPatch.last_notified_at && cPatch.last_checked_at,
    'an already-seen search only refreshes last_checked_at');
}

/* ---------- the API routes -------------------------------------------------- */

console.log('\n-- /api/my-account?searches routes --');

function call(method, { query = {}, body = null, user, db, stock } = {}) {
  return new Promise(resolve => {
    const req = { method, query, body, headers: {} };
    const res = {
      _status: 200, _headers: {},
      status(c) { this._status = c; return this; },
      setHeader(k, v) { this._headers[k] = v; return this; },
      end(payload) { resolve({ status: this._status, json: JSON.parse(payload || '{}') }); }
    };
    handler(req, res, { user, db, stock });
  });
}

const user = { id: 'u1', email: 'buyer@example.com' };

{
  const db = fakeDb([]);
  const r = await call('POST', { query: { searches: '1' }, user, db, stock: STOCK,
    body: { name: '', criteria: toyotaSuv, email_alerts: true } });
  ok(r.status === 200 && r.json.search.id === 'new-id', 'POST creates a saved search');
  ok(r.json.search.name.startsWith('Toyota'), 'a blank name falls back to the criteria description');
  ok(r.json.search.matches === 1 && r.json.search.new_matches === 0, 'creation reports current matches and zero NEW');
  const inserted = db.calls.inserts[0].payload;
  ok(inserted.auth_user_id === 'u1' && inserted.email === 'buyer@example.com',
    'the row is bound to the auth user and captures their confirmed e-mail');
  ok(Array.isArray(inserted.seen_refs) && inserted.seen_refs.includes('LC250'),
    'seen_refs is seeded with today\u2019s matches — alerts are about FUTURE stock');
}
{
  const r = await call('POST', { query: { searches: '1' }, user, db: fakeDb([]), stock: STOCK,
    body: { criteria: { make: 'All', q: ' ' } } });
  ok(r.status === 400, 'an empty criteria (match-everything alert) is rejected');
}
{
  const ten = Array.from({ length: 10 }, (_, i) => ({ id: 'r' + i, auth_user_id: 'u1' }));
  const r = await call('POST', { query: { searches: '1' }, user, db: fakeDb(ten), stock: STOCK,
    body: { criteria: toyotaSuv } });
  ok(r.status === 400 && /10 saved searches/.test(r.json.error), 'the per-user cap of 10 holds');
}
{
  const rows = [{ id: 's1', auth_user_id: 'u1', name: 'Mine', criteria: toyotaSuv, seen_refs: [], email_alerts: true, created_at: 'x' }];
  const r = await call('GET', { query: { searches: '1' }, user, db: fakeDb(rows), stock: STOCK });
  ok(r.status === 200 && r.json.searches.length === 1
    && r.json.searches[0].matches === 1 && r.json.searches[0].new_matches === 1
    && r.json.searches[0].new_refs.join() === 'LC250',
    'GET lists the user\u2019s searches with live match / NEW counts');
}
{
  const rows = [{ id: 's1', auth_user_id: 'u1', criteria: toyotaSuv, seen_refs: [], email_alerts: true }];
  const db = fakeDb(rows);
  const r = await call('PATCH', { query: { searches: '1' }, user, db, stock: STOCK,
    body: { id: 's1', ack: true } });
  ok(r.status === 200 && db.calls.updates[0].patch.seen_refs.includes('LC250'),
    'PATCH ack folds the current matches into seen_refs (NEW badge resets)');
  const r2 = await call('PATCH', { query: { searches: '1' }, user, db, stock: STOCK,
    body: { id: 's1', email_alerts: false } });
  ok(r2.status === 200 && r2.json.search.email_alerts === false, 'PATCH toggles e-mail alerts');
}
{
  const db = fakeDb([{ id: 's1', auth_user_id: 'u1', criteria: toyotaSuv, seen_refs: [] }]);
  const r = await call('DELETE', { query: { searches: '1', id: 's1' }, user, db });
  ok(r.status === 200 && db.calls.deletes.length === 1, 'DELETE removes the search');
}
{
  const r = await call('GET', { query: { searches: '1' }, db: fakeDb([]) });
  ok(r.status === 401, 'no token, no searches (401)');
}

/* ---------- ?favourites routes (2026-11-08) ------------------------------- */

console.log('\n-- /api/my-account?favourites routes --');

{
  const r = await call('GET', { query: { favourites: '1' }, db: fakeDb([]) });
  ok(r.status === 401, 'no token, no favourites (401)');
}
{
  const r = await call('GET', { query: { favourites: '1' }, user, db: fakeDb([]) });
  ok(r.status === 200 && Array.isArray(r.json.refs) && r.json.refs.length === 0,
    'GET with no row yet returns an empty refs array');
}
{
  const rows = [{ id: 'f1', auth_user_id: 'u1', refs: ['LC250', 'GONE99'] }];
  const r = await call('GET', { query: { favourites: '1' }, user, db: fakeDb(rows) });
  ok(r.status === 200 && r.json.refs.join() === 'LC250,GONE99',
    'GET returns the stored refs, including ones no longer in stock');
}
{
  const db = fakeDb([]);
  const r = await call('PUT', { query: { favourites: '1' }, user, db,
    body: { refs: ['LC250', ' LC250 ', '', 'PRIUS17', 42, null] } });
  ok(r.status === 200 && r.json.refs.join() === 'LC250,PRIUS17,42',
    'PUT dedupes, trims and drops empty refs before storing');
  const ins = db.calls.inserts[0];
  ok(ins && ins.table === 'saved_favourites' && ins.payload.auth_user_id === 'u1',
    'first PUT inserts a row bound to the auth user');
}
{
  const rows = [{ id: 'f1', auth_user_id: 'u1', refs: ['OLD1'] }];
  const db = fakeDb(rows);
  const r = await call('PUT', { query: { favourites: '1' }, user, db,
    body: { refs: ['LC250'] } });
  ok(r.status === 200 && db.calls.updates.length === 1
    && db.calls.updates[0].table === 'saved_favourites'
    && db.calls.updates[0].patch.refs.join() === 'LC250',
    'a later PUT updates the existing row in place (one row per user)');
}
{
  const db = fakeDb([]);
  const flood = Array.from({ length: 300 }, (_, i) => 'REF' + i);
  const r = await call('PUT', { query: { favourites: '1' }, user, db, body: { refs: flood } });
  ok(r.status === 200 && r.json.refs.length === 200, 'refs are capped at 200 per user');
}
{
  const r = await call('DELETE', { query: { favourites: '1' }, user, db: fakeDb([]) });
  ok(r.status === 405, 'unsupported methods on ?favourites answer 405');
}

console.log('\n-- ?alerts=run guard --');
{
  process.env.GOONET_SYNC_KEY = 'sweep-key';
  const bad = await call('GET', { query: { alerts: 'run', key: 'wrong' }, db: fakeDb([]) });
  ok(bad.status === 401, 'the sweep rejects a wrong key');
  const good = await call('GET', { query: { alerts: 'run', key: 'sweep-key' }, db: fakeDb([]), stock: STOCK });
  ok(good.status === 200 && good.json.checked === 0, 'the right key runs the sweep (0 searches, 0 mails)');
  delete process.env.GOONET_SYNC_KEY;
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed) process.exit(1);
