// CRM authorization regression suite (npm run test:authz).
//
// The Team & permissions grid in the CRM promises that each role may only do
// what its boxes allow. The API used to ignore that: /api/crm accepted POST
// and PATCH from ANY authenticated member, so a Viewer — every box unticked —
// could create and edit leads, customers and inventory by calling the endpoint
// directly. /api/site-content and /api/goonet-stock hard-required role=admin,
// which contradicted the "Edit the public website" box the grid shows ticked
// for Manager. Approvals applied a requester-supplied payload unfiltered.
//
// These tests pin the corrected contract. No real database and no secrets: an
// in-memory Supabase-shaped client plus injected getUser/permsFor, the same
// pattern as settings-api.test.mjs.
let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
const bad = s => process.stderr.write(s + '\n');
const ok = (cond, msg) => { if (cond) { pass++; say('  ✓ ' + msg); } else { fail++; bad('  ✗ ' + msg); } };

// ---------------------------------------------------------------------------
// In-memory database. Supports the query shapes the API layer actually uses:
// select/order/limit/eq awaited as a promise, and insert/update/delete chains
// ending in .single().
function memDb(seed = {}) {
  const tables = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map(r => ({ ...r }));
  const rowsOf = n => (tables[n] || (tables[n] = []));
  let seq = 0;

  function from(name) {
    const rows = rowsOf(name);
    const start = () => {
      const ctx = { filters: [], order: null, limitN: null };
      const settle = () => {
        let out = rows.filter(r => ctx.filters.every(f => f(r)));
        if (ctx.order) out = out.slice().sort(ctx.order);
        if (ctx.limitN) out = out.slice(0, ctx.limitN);
        return out;
      };
      const api = {
        select: () => api,
        eq: (k, v) => { ctx.filters.push(r => r[k] === v); return api; },
        order: (k, o = {}) => {
          const dir = o.ascending === false ? -1 : 1;
          ctx.order = (a, b) => dir * String(a[k] ?? '').localeCompare(String(b[k] ?? ''));
          return api;
        },
        limit: n => { ctx.limitN = n; return api; },
        single: async () => {
          const out = settle();
          return out.length === 1 ? { data: out[0], error: null } : { data: null, error: new Error('no row') };
        },
        maybeSingle: async () => ({ data: settle()[0] || null, error: null }),
        then(resolve) { return resolve({ data: settle(), error: null }); }
      };
      return api;
    };
    return {
      select: () => start(),
      eq: (k, v) => start().eq(k, v),
      order: (k, o) => start().order(k, o),
      limit: n => start().limit(n),
      single: () => start().single(),
      maybeSingle: () => start().maybeSingle(),
      then(resolve) { return start().then(resolve); },
      // Not `async`: the real client's insert() returns a thenable query
      // builder, so `.insert(x).select().single()` chains synchronously and
      // `await insert(x)` also works. An async method would hand back a
      // Promise, which has no .select.
      insert(rec) {
        const list = (Array.isArray(rec) ? rec : [rec]).map(r => ({ ...r, id: r.id || 'id-' + (++seq) }));
        rows.push(...list);
        return {
          data: list[0], error: null,
          select: () => ({
            single: async () => ({ data: list[0], error: null }),
            then(resolve) { return resolve({ data: list, error: null }); }
          }),
          then(resolve) { return resolve({ data: list, error: null }); }
        };
      },
      update(patch) {
        return {
          eq: (k, v) => ({
            select: () => ({
              single: async () => {
                const hit = rows.find(r => r[k] === v);
                if (!hit) return { data: null, error: new Error('no row') };
                Object.assign(hit, patch);
                return { data: hit, error: null };
              }
            }),
            count: async () => ({ count: rows.filter(r => r[k] === v).length }),
            then(resolve) {
              rows.filter(r => r[k] === v).forEach(r => Object.assign(r, patch));
              return resolve({ error: null });
            }
          })
        };
      },
      delete() {
        return {
          eq: (k, v) => ({
            then(resolve) {
              const keep = rows.filter(r => r[k] !== v);
              rows.length = 0; rows.push(...keep);
              return resolve({ error: null });
            }
          })
        };
      }
    };
  }
  return { db: { from }, tables };
}

function fakeRes() {
  const r = { statusCode: 0, body: null, headers: {} };
  r.status = code => { r.statusCode = code; return r; };
  r.statusCode = 0;
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.end = payload => { try { r.body = JSON.parse(payload); } catch { r.body = payload; } };
  return r;
}

// The live matrix, so the tests fail if a default is changed by accident.
import { DEFAULTS } from '../api/_perm.js';
const permsFor = async role => DEFAULTS[role] || {};

const userFor = (id, role) => async req => {
  const h = req.headers?.authorization || '';
  if (!h.startsWith('Bearer ')) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  const profile = { id, full_name: role + ' user', role, active: true, email: role + '@ar7traders.com' };
  return { user: { id, email: profile.email }, profile, db: null };
};

async function run(handler, req, injected) {
  const res = fakeRes();
  const realError = console.error;
  console.error = () => {};
  try { await handler(req, res, injected); } finally { console.error = realError; }
  return res;
}

const crm = (await import('../api/crm.js')).default;
const siteContent = (await import('../api/site-content.js')).default;
const goonet = (await import('../api/goonet-stock.js')).default;
const approvals = (await import('../api/approvals.js')).default;

const auth = role => ({ headers: { authorization: 'Bearer ok' } });
const post = (role, body) => ({ method: 'POST', query: {}, headers: { authorization: 'Bearer ok' }, body });

say('\n1) api/crm.js — writes need the entity permission');
{
  const { db, tables } = memDb({ leads: [], vehicles: [], activities: [], approval_requests: [] });

  // viewer: every box unticked
  let r = await run(crm, { method: 'POST', query: { entity: 'leads' }, ...auth('viewer'), body: { name: 'Sneaky' } }, { db, getUser: userFor('v1', 'viewer'), permsFor });
  ok(r.statusCode === 403, `a viewer cannot create a lead (${r.statusCode} ${r.body?.error || ''})`);
  ok((tables.leads || []).length === 0, 'the refused lead never reached the table');

  r = await run(crm, { method: 'PATCH', query: { entity: 'leads' }, ...auth('viewer'), body: { id: 'x', status: 'won' } }, { db, getUser: userFor('v1', 'viewer'), permsFor });
  ok(r.statusCode === 403, 'a viewer cannot edit a lead');

  // sales has vehicles.write = false
  r = await run(crm, { method: 'POST', query: { entity: 'vehicles' }, ...auth('sales'), body: { stock_no: 'AR7-1', make: 'Toyota', model: 'Axio' } }, { db, getUser: userFor('s1', 'sales'), permsFor });
  ok(r.statusCode === 403, `sales cannot create inventory — vehicles.write is off (${r.statusCode})`);
  ok((tables.vehicles || []).length === 0, 'the refused vehicle never reached the table');

  // but sales may create a lead
  r = await run(crm, { method: 'POST', query: { entity: 'leads' }, ...auth('sales'), body: { name: 'Real Enquiry', email: 'a@b.com' } }, { db, getUser: userFor('s1', 'sales'), permsFor });
  ok(r.statusCode === 201, `sales can still create a lead (${r.statusCode})`);
  ok((tables.leads || []).length === 1, 'the allowed lead was stored');

  // accounts has leads.write = false
  r = await run(crm, { method: 'POST', query: { entity: 'leads' }, ...auth('accounts'), body: { name: 'Nope' } }, { db, getUser: userFor('a1', 'accounts'), permsFor });
  ok(r.statusCode === 403, `accounts cannot create a lead — leads.write is off (${r.statusCode})`);

  // manager may edit inventory
  r = await run(crm, { method: 'POST', query: { entity: 'vehicles' }, ...auth('manager'), body: { stock_no: 'AR7-2', make: 'Honda', model: 'Vezel' } }, { db, getUser: userFor('m1', 'manager'), permsFor });
  ok(r.statusCode === 201, `manager can create inventory (${r.statusCode})`);

  // admin may edit anything
  r = await run(crm, { method: 'POST', query: { entity: 'quotes' }, ...auth('admin'), body: { quote_no: 'Q1', customer_name: 'C', vehicle: 'V' } }, { db, getUser: userFor('ad1', 'admin'), permsFor });
  ok(r.statusCode === 201, `admin can create a quote (${r.statusCode})`);

  // reads stay open to every role
  r = await run(crm, { method: 'GET', query: { entity: 'leads' }, ...auth('viewer') }, { db, getUser: userFor('v1', 'viewer'), permsFor });
  ok(r.statusCode === 200 && Array.isArray(r.body), 'a viewer can still read leads (the CRM screens are read-only views)');

  // unauthenticated stays a 401
  r = await run(crm, { method: 'POST', query: { entity: 'leads' }, headers: {}, body: { name: 'Anon' } }, { db, getUser: userFor('x', 'viewer'), permsFor });
  ok(r.statusCode === 401, 'an unauthenticated POST is refused');
  ok((tables.leads || []).length === 1, 'the anonymous POST stored nothing');
}

say('\n2) api/crm.js — the activity log is read-only');
{
  const { db, tables } = memDb({ activities: [{ id: 'act-1', action: 'Seeded entry', actor: 'System' }], leads: [] });
  const injected = { db, getUser: userFor('ad1', 'admin'), permsFor };

  let r = await run(crm, { method: 'GET', query: { entity: 'activities' }, ...auth('admin') }, injected);
  ok(r.statusCode === 200 && r.body.length === 1, 'the activity log is still readable');

  r = await run(crm, { method: 'POST', query: { entity: 'activities' }, ...auth('admin'), body: { action: 'Forged', actor: 'Me' } }, injected);
  ok(r.statusCode === 403, `even an admin cannot insert a forged log entry (${r.statusCode})`);
  ok(tables.activities.length === 1 && tables.activities[0].action === 'Seeded entry', 'nothing was added to the audit trail');

  r = await run(crm, { method: 'PATCH', query: { entity: 'activities' }, ...auth('admin'), body: { id: 'act-1', action: 'Rewritten' } }, injected);
  ok(r.statusCode === 403, 'an existing log entry cannot be rewritten');
  ok(tables.activities[0].action === 'Seeded entry', 'the original entry is untouched');

  r = await run(crm, { method: 'DELETE', query: { entity: 'activities', id: 'act-1' }, ...auth('admin') }, injected);
  ok(r.statusCode === 403, 'a log entry cannot be deleted');
  ok(tables.activities.length === 1, 'the entry is still there');
}

say('\n3) api/crm.js — delete still routes through approval');
{
  const { db, tables } = memDb({ leads: [{ id: 'l1', name: 'Keep me' }], activities: [], approval_requests: [] });
  // manager: delete.direct = false -> approval request, record survives
  let r = await run(crm, { method: 'DELETE', query: { entity: 'leads', id: 'l1' }, ...auth('manager') }, { db, getUser: userFor('m1', 'manager'), permsFor });
  ok(r.statusCode === 202 && r.body.pending === true, `a manager gets an approval request, not a deletion (${r.statusCode})`);
  ok(tables.leads.length === 1, 'the record is still there while the request is pending');
  ok(tables.approval_requests.length === 1, 'the approval request was recorded');

  // admin: delete.direct = true -> really deleted
  r = await run(crm, { method: 'DELETE', query: { entity: 'leads', id: 'l1' }, ...auth('admin') }, { db, getUser: userFor('ad1', 'admin'), permsFor });
  ok(r.statusCode === 200 && tables.leads.length === 0, 'an admin deletes directly');
}

say('\n4) api/site-content.js — site.write, not a hard-coded role');
{
  const { db, tables } = memDb({ site_listings: [], activities: [] });
  const listing = { method: 'POST', query: { entity: 'listings' }, body: { stock_no: 'AR7-9', make: 'Mazda', model: 'CX-5', published: true } };

  let r = await run(siteContent, { ...listing, ...auth('manager') }, { db, getUser: userFor('m1', 'manager'), permsFor });
  ok(r.statusCode === 200, `a manager can edit the website — the grid said they could (${r.statusCode} ${r.body?.error || ''})`);
  ok((tables.site_listings || []).length === 1, 'the manager’s listing was stored');

  r = await run(siteContent, { ...listing, ...auth('sales') }, { db, getUser: userFor('s1', 'sales'), permsFor });
  ok(r.statusCode === 403, `sales is refused — site.write is off (${r.statusCode})`);
  ok(tables.site_listings.length === 1, 'the refused listing stored nothing');

  r = await run(siteContent, { ...listing, ...auth('admin') }, { db, getUser: userFor('ad1', 'admin'), permsFor });
  ok(r.statusCode === 200, 'an admin can still edit the website');

  // public read needs no token at all
  r = await run(siteContent, { method: 'GET', query: { entity: 'listings' }, headers: {} }, { db, permsFor });
  ok(r.statusCode === 200 && Array.isArray(r.body), 'the public website can still read listings anonymously');
}

say('\n5) api/goonet-stock.js — site.write, not a hard-coded role');
{
  const { db, tables } = memDb({ japan_dealer_stock: [], activities: [] });
  const body = { method: 'POST', query: {}, body: { make: 'Nissan', model: 'Note', stock_no: 'G-1' } };

  let r = await run(goonet, { ...body, ...auth('manager') }, { db, getUser: userFor('m1', 'manager'), permsFor });
  ok(r.statusCode === 201, `a manager can add imported stock (${r.statusCode} ${r.body?.error || ''})`);

  r = await run(goonet, { ...body, ...auth('accounts') }, { db, getUser: userFor('a1', 'accounts'), permsFor });
  ok(r.statusCode === 403, `accounts is refused — site.write is off (${r.statusCode})`);

  r = await run(goonet, { method: 'GET', query: {}, headers: {} }, { db, permsFor });
  ok(r.statusCode === 200, 'the public Japan stock page still reads anonymously');
}

say('\n6) api/approvals.js — a requester cannot smuggle columns past the approver');
{
  const { db, tables } = memDb({
    approval_requests: [],
    vehicles: [{ id: 'v1', stock_no: 'AR7-1', price: 1000, status: 'available', make: 'Toyota' }],
    activities: []
  });
  const injected = { db, getUser: userFor('s1', 'sales'), permsFor };

  // A crafted request tries to rewrite columns no endpoint exposes.
  let r = await run(approvals, post('sales', {
    kind: 'price_change', entity_type: 'vehicles', entity_id: 'v1',
    entity_label: 'AR7-1', payload: { price: 1, created_by: 'attacker', stock_no: 'HACKED', not_a_column: 'x' }
  }), injected);
  ok(r.statusCode === 201, 'the request itself is accepted for review');
  const stored = tables.approval_requests[0].payload;
  ok(Object.keys(stored).sort().join(',') === 'price,stock_no',
    `only writable columns are stored (${JSON.stringify(stored)})`);
  ok(!('created_by' in stored) && !('not_a_column' in stored), 'created_by and unknown columns were dropped');

  // An unknown record type is refused up front rather than parked forever.
  r = await run(approvals, post('sales', { kind: 'delete', entity_type: 'role_permissions', entity_id: 'x' }), injected);
  ok(r.statusCode === 400, `an approval cannot target an arbitrary table (${r.statusCode})`);
  r = await run(approvals, post('sales', { kind: 'drop_table', entity_type: 'vehicles', entity_id: 'v1' }), injected);
  ok(r.statusCode === 400, `an unknown request kind is refused (${r.statusCode})`);

  // The real table defaults status to 'pending'; the in-memory mock has no
  // column defaults, so set it the way the database would have.
  tables.approval_requests[0].status = 'pending';

  // Now decide it as a manager (approvals.decide = true).
  const decide = { db, getUser: userFor('m1', 'manager'), permsFor };
  r = await run(approvals, { method: 'POST', query: { decide: '1' }, ...auth('manager'), body: { id: tables.approval_requests[0].id, decision: 'approved' } }, decide);
  ok(r.statusCode === 200, `the manager can approve it (${r.statusCode} ${r.body?.error || ''})`);
  const car = tables.vehicles[0];
  ok(car.price === 1, 'the approved change was applied');
  ok(car.created_by === undefined && car.not_a_column === undefined, 'no smuggled column reached the row');

  // A request that carries nothing applicable cannot be "approved".
  const { db: db2, tables: t2 } = memDb({
    approval_requests: [{ id: 'ar-2', kind: 'update', entity_type: 'vehicles', entity_id: 'v1', status: 'pending', payload: { created_by: 'x' } }],
    vehicles: [{ id: 'v1', created_by: 'original' }], activities: []
  });
  r = await run(approvals, { method: 'POST', query: { decide: '1' }, ...auth('manager'), body: { id: 'ar-2', decision: 'approved' } }, { db: db2, getUser: userFor('m1', 'manager'), permsFor });
  ok(r.statusCode === 400, `a payload with nothing applicable is refused (${r.statusCode})`);
  ok(t2.vehicles[0].created_by === 'original', 'the untouched row kept its original value');

  // sales may not decide anything
  r = await run(approvals, { method: 'POST', query: { decide: '1' }, ...auth('sales'), body: { id: 'ar-2', decision: 'approved' } }, { db: db2, getUser: userFor('s1', 'sales'), permsFor });
  ok(r.statusCode === 403, `sales cannot approve its own or anyone's request (${r.statusCode})`);
}

say('\n7) the code defaults match the database seed');
{
  const { PERMISSION_KEYS, ROLES } = await import('../api/_perm.js');
  const fs = await import('node:fs');
  const sql = fs.readFileSync(new URL('../supabase/SETUP-EVERYTHING.sql', import.meta.url), 'utf8');
  for (const key of PERMISSION_KEYS) {
    for (const role of ROLES) {
      const expected = role === 'admin' ? true : !!(DEFAULTS[role] || {})[key];
      const re = new RegExp(`\\('${role}','${key.replace(/\./g, '\\.')}',(true|false)\\)`);
      const m = sql.match(re);
      if (!m) { ok(false, `seed is missing ('${role}','${key}')`); continue; }
      ok((m[1] === 'true') === expected, `seed ('${role}','${key}') = ${m[1]} matches the code default ${expected}`);
    }
  }
}

say(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
