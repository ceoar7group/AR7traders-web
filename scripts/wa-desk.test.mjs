// WhatsApp desk contract tests (npm run test:wa).
//
// Pins the round-21 promises:
//   • api/_wa.js parses Meta's nested webhook payload into flat events,
//     matches senders to leads by phone tail, and never throws on junk.
//   • The public webhook on /api/leads?wa=webhook does Meta's GET handshake
//     only with the right verify token, refuses POSTs without the URL key,
//     stores inbound messages, and NEVER auto-replies unless the owner set
//     wa_auto_reply=on.
//   • The staff desk on /api/crm?entity=wa lists conversations for any
//     signed-in member, requires leads.write to send, answers 503 with the
//     setup path when the Cloud API env is missing, and sends via Graph when
//     configured.
// In-memory db + injected hooks — no real network, no secrets.
let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
const ok = (cond, msg) => { if (cond) { pass++; say('  ✓ ' + msg); } else { fail++; process.stderr.write('  ✗ ' + msg + '\n'); } };

import { parseWebhookEvents, leadIdForNumber, waConfigured } from '../api/_wa.js';

// ---------------------------------------------------------------------------
say('1) parseWebhookEvents — Meta payload → flat events');
{
  const payload = {
    entry: [{
      changes: [{
        value: {
          contacts: [{ wa_id: '254711223344', profile: { name: 'Daniel M' } }],
          messages: [
            { from: '254711223344', id: 'wamid.A', type: 'text', text: { body: 'Hello, is the Vitz available?' } },
            { from: '254711223344', id: 'wamid.B', type: 'image' }
          ],
          statuses: [{ id: 'wamid.OUT1', status: 'delivered' }]
        }
      }]
    }]
  };
  const ev = parseWebhookEvents(payload);
  ok(ev.length === 3, 'three events parsed (2 messages + 1 status)');
  ok(ev[0].kind === 'message' && ev[0].wa_id === '254711223344', 'message event carries the sender wa_id');
  ok(ev[0].body === 'Hello, is the Vitz available?', 'text body is extracted');
  ok(ev[0].profile_name === 'Daniel M', 'profile name resolved from contacts');
  ok(ev[1].body === '[image message]', 'non-text message gets an honest placeholder body');
  ok(ev[2].kind === 'status' && ev[2].status === 'delivered', 'status event parsed');
  ok(parseWebhookEvents(null).length === 0, 'null payload → no events, no throw');
  ok(parseWebhookEvents({ entry: [{ changes: [{}] }] }).length === 0, 'junk payload → no events, no throw');
}

// ---------------------------------------------------------------------------
say('\n2) leadIdForNumber — phone-tail matching');
{
  const leads = [
    { id: 'L1', phone: '+254 711 223344' },
    { id: 'L2', phone: '+92 300 1234567' },
    { id: 'L3', phone: null }
  ];
  ok(leadIdForNumber('254711223344', leads) === 'L1', 'international format matches the formatted lead phone');
  ok(leadIdForNumber('923001234567', leads) === 'L2', 'second lead matches by tail');
  ok(leadIdForNumber('15550000000', leads) === null, 'unknown number → null');
  ok(leadIdForNumber('44', leads) === null, 'too-short number never matches');
}

// ---------------------------------------------------------------------------
// Shared in-memory db (shapes used by api/_wa.js only).
function memDb(seed = {}) {
  const tables = {};
  for (const [n, rows] of Object.entries(seed)) tables[n] = rows.map(r => ({ ...r }));
  const rowsOf = n => (tables[n] || (tables[n] = []));
  let seq = 0;
  const from = name => {
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
        contains: (k, v) => { ctx.filters.push(r => (r[k] || []).includes(v[0])); return api; },
        order: (k, o = {}) => { const d = o.ascending === false ? -1 : 1; ctx.order = (a, b) => d * String(a[k] ?? '').localeCompare(String(b[k] ?? '')); return api; },
        limit: n => { ctx.limitN = n; return api; },
        single: async () => { const out = settle(); return out.length ? { data: out[0], error: null } : { data: null, error: new Error('no row') }; },
        then(resolve) { return resolve({ data: settle(), error: null }); }
      };
      return api;
    };
    return {
      select: () => start(),
      insert(rec) {
        const list = (Array.isArray(rec) ? rec : [rec]).map(r => ({ ...r, id: r.id || 'id-' + (++seq) }));
        // Simulate the unique msg_id index: a duplicate is an error, not a row.
        const dup = list.some(r => r.msg_id && rows.some(x => x.msg_id === r.msg_id));
        if (dup) return { error: { code: '23505' }, select: () => ({ single: async () => ({ data: null, error: { code: '23505' } }) }), then(res) { return res({ error: { code: '23505' } }); } };
        rows.push(...list);
        return {
          error: null, data: list[0],
          select: () => ({ single: async () => ({ data: list[0], error: null }) }),
          then(res) { return res({ data: list, error: null }); }
        };
      },
      update(patch) {
        return { eq: (k, v) => ({ then(res) { rows.filter(r => r[k] === v).forEach(r => Object.assign(r, patch)); return res({ error: null }); } }) };
      }
    };
  };
  return { db: { from }, tables };
}
function fakeRes() {
  const r = { statusCode: 0, body: null, headers: {} };
  r.status = code => { r.statusCode = code; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.end = p => { try { r.body = JSON.parse(p); } catch { r.body = p; } };
  return r;
}
async function run(handler, req, injected) {
  const res = fakeRes();
  const realErr = console.error; console.error = () => { };
  try { await handler(req, res, injected); } finally { console.error = realErr; }
  return res;
}

const leadsApi = (await import('../api/leads.js')).default;
const crm = (await import('../api/crm.js')).default;
import { DEFAULTS } from '../api/_perm.js';
const permsFor = async role => DEFAULTS[role] || {};
const userFor = (id, role) => async () => ({ user: { id, email: role + '@ar7' }, profile: { id, full_name: role + ' user', role, active: true, email: role + '@ar7' }, db: null });
const ENV = { WHATSAPP_TOKEN: 'tkn', WHATSAPP_PHONE_ID: '1234567890', WHATSAPP_VERIFY_TOKEN: 'vt-secret' };

// ---------------------------------------------------------------------------
say('\n3) public webhook on /api/leads?wa=webhook');
{
  ok(waConfigured(ENV) === true && waConfigured({}) === false, 'waConfigured needs all three env vars');

  // GET handshake
  let r = await run(leadsApi, { method: 'GET', query: { wa: 'webhook', 'hub.mode': 'subscribe', 'hub.verify_token': 'vt-secret', 'hub.challenge': '12345' } }, { db: memDb().db, env: ENV });
  ok(r.statusCode === 200 && String(r.body) === '12345', 'GET with the right verify token echoes hub.challenge');
  r = await run(leadsApi, { method: 'GET', query: { wa: 'webhook', 'hub.mode': 'subscribe', 'hub.verify_token': 'WRONG', 'hub.challenge': '12345' } }, { db: memDb().db, env: ENV });
  ok(r.statusCode === 403, 'GET with a wrong verify token is refused');

  // POST without the URL key is not Meta
  r = await run(leadsApi, { method: 'POST', query: { wa: 'webhook' }, body: {} }, { db: memDb().db, env: ENV });
  ok(r.statusCode === 403, 'POST without the key is refused');

  // POST with key stores the inbound message and links the lead
  const { db, tables } = memDb({ leads: [{ id: 'L1', phone: '+254 711 223344' }] });
  const payload = { entry: [{ changes: [{ value: { contacts: [{ wa_id: '254711223344', profile: { name: 'Daniel' } }], messages: [{ from: '254711223344', id: 'wamid.X', type: 'text', text: { body: 'Price for the Vitz?' } }] } }] }] };
  r = await run(leadsApi, { method: 'POST', query: { wa: 'webhook', key: 'vt-secret' }, body: payload }, { db, env: ENV });
  ok(r.statusCode === 200 && r.body.ok === true, 'webhook POST answers 200 (Meta must not retry)');
  const stored = tables.wa_messages || [];
  ok(stored.length === 1 && stored[0].direction === 'in' && stored[0].body === 'Price for the Vitz?', 'inbound message stored');
  ok(stored[0].lead_id === 'L1', 'sender matched to the existing lead by phone tail');

  // Meta retry (same msg_id) must not duplicate
  r = await run(leadsApi, { method: 'POST', query: { wa: 'webhook', key: 'vt-secret' }, body: payload }, { db, env: ENV });
  ok(r.statusCode === 200 && (tables.wa_messages || []).length === 1, 'duplicate msg_id (Meta retry) stores nothing new');

  // Auto-reply stays OFF by default: no outbound row, no fetch
  ok(!(tables.wa_messages || []).some(m => m.direction === 'out'), 'no auto-reply without wa_auto_reply=on');

  // With wa_auto_reply=on an AI/canned reply goes out through Graph
  {
    const { db: db2, tables: t2 } = memDb({ leads: [], site_settings: [{ key: 'wa_auto_reply', value: 'on' }] });
    const calls = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ messages: [{ id: 'wamid.OUT' }] }) }; };
    try {
      const p2 = { entry: [{ changes: [{ value: { contacts: [{ wa_id: '923001234567', profile: { name: 'Ali' } }], messages: [{ from: '923001234567', id: 'wamid.Y', type: 'text', text: { body: 'Salam, do you ship to Karachi?' } }] } }] }] };
      await run(leadsApi, { method: 'POST', query: { wa: 'webhook', key: 'vt-secret' }, body: p2 }, { db: db2, env: ENV });
    } finally { globalThis.fetch = realFetch; }
    const out = (t2.wa_messages || []).filter(m => m.direction === 'out');
    ok(out.length === 1 && out[0].msg_id === 'wamid.OUT', 'wa_auto_reply=on sends exactly one reply');
    ok(calls.length >= 1 && String(calls[0].url).includes('graph.facebook.com'), 'reply goes through the Graph API');
    ok(['AI agent', 'Auto-reply'].includes(out[0].actor), 'auto-reply is honestly attributed, never as a human');
  }

  // Ordinary lead POSTs still work with the webhook branch in place
  const { db: db3 } = memDb({ leads: [] });
  r = await run(leadsApi, { method: 'POST', query: {}, body: { name: 'Buyer', phone: '+254700000000', country: 'Kenya', source: 'Website' } }, { db: db3, notify: false });
  ok(r.statusCode === 201 && r.body.ok === true, 'plain enquiry POST is untouched by the webhook branch');
}

// ---------------------------------------------------------------------------
say('\n4) staff desk on /api/crm?entity=wa');
{
  const seed = {
    wa_messages: [
      { id: 'm1', wa_id: '254711223344', profile_name: 'Daniel', direction: 'in', body: 'Hello', created_at: '2026-11-01T10:00:00Z' },
      { id: 'm2', wa_id: '254711223344', direction: 'out', body: 'Hi Daniel!', actor: 'Sara', created_at: '2026-11-01T10:05:00Z' },
      { id: 'm3', wa_id: '923001234567', profile_name: 'Ali', direction: 'in', body: 'Price?', created_at: '2026-11-02T09:00:00Z' }
    ]
  };

  // Any signed-in member may read
  let { db } = memDb(seed);
  let r = await run(crm, { method: 'GET', query: { entity: 'wa' }, headers: { authorization: 'Bearer ok' } }, { db, getUser: userFor('v1', 'viewer'), permsFor, env: {} });
  ok(r.statusCode === 200 && r.body.configured === false, 'GET works for a viewer and reports configured:false without env');
  ok((r.body.conversations || []).length === 2, 'conversations grouped per number');
  const daniel = r.body.conversations.find(c => c.wa_id === '254711223344');
  ok(daniel && daniel.name === 'Daniel' && daniel.count === 2, 'conversation carries name and message count');

  // Thread read
  ({ db } = memDb(seed));
  r = await run(crm, { method: 'GET', query: { entity: 'wa', with: '254711223344' }, headers: { authorization: 'Bearer ok' } }, { db, getUser: userFor('v1', 'viewer'), permsFor, env: {} });
  ok(r.statusCode === 200 && (r.body.messages || []).length === 2, 'thread read returns the two messages for that number');

  // Viewer cannot send
  ({ db } = memDb(seed));
  r = await run(crm, { method: 'POST', query: { entity: 'wa' }, headers: { authorization: 'Bearer ok' }, body: { to: '254711223344', body: 'hi' } }, { db, getUser: userFor('v1', 'viewer'), permsFor, env: ENV });
  ok(r.statusCode === 403, 'viewer (no leads.write) cannot send');

  // Sales without env → honest 503 with the setup path
  ({ db } = memDb(seed));
  r = await run(crm, { method: 'POST', query: { entity: 'wa' }, headers: { authorization: 'Bearer ok' }, body: { to: '254711223344', body: 'hi' } }, { db, getUser: userFor('s1', 'sales'), permsFor, env: {} });
  ok(r.statusCode === 503 && /WHATSAPP_TOKEN/.test(r.body.error || ''), 'unconfigured send answers 503 naming the env vars');

  // Sales with env sends through Graph and stores the outbound row
  const mem = memDb(seed);
  const calls = [];
  const fetchStub = async (url, init) => { calls.push({ url, init }); return { ok: true, json: async () => ({ messages: [{ id: 'wamid.SENT' }] }) }; };
  r = await run(crm, { method: 'POST', query: { entity: 'wa' }, headers: { authorization: 'Bearer ok' }, body: { to: '+254 711 223344', body: 'Your Vitz invoice is ready.' } }, { db: mem.db, getUser: userFor('s1', 'sales'), permsFor, env: ENV, fetch: fetchStub });
  ok(r.statusCode === 201 && r.body.msg_id === 'wamid.SENT', 'send stores the outbound row with the Graph message id');
  ok(calls.length === 1 && calls[0].url.includes('/1234567890/messages'), 'Graph called on the configured phone-number id');
  ok(JSON.parse(calls[0].init.body).to === '254711223344', 'recipient number is normalised to digits');

  // AI draft endpoint never sends — no fetch, just text
  const mem2 = memDb(seed);
  const calls2 = [];
  r = await run(crm, { method: 'POST', query: { entity: 'wa' }, headers: { authorization: 'Bearer ok' }, body: { ai: 'draft', wa_id: '254711223344' } }, { db: mem2.db, getUser: userFor('s1', 'sales'), permsFor, env: ENV, fetch: async (...a) => { calls2.push(a); return { ok: true, json: async () => ({}) }; } });
  ok(r.statusCode === 200 && typeof r.body.text === 'string' && r.body.text.length > 10, 'AI draft returns reply text');
  ok(r.body.source === 'canned' || r.body.source === 'ai', 'draft is honest about its source');
  ok((mem2.tables.wa_messages || []).length === 3, 'drafting stores nothing and sends nothing');

  // Unknown entity contract still intact
  ({ db } = memDb(seed));
  r = await run(crm, { method: 'GET', query: { entity: 'nope' }, headers: { authorization: 'Bearer ok' } }, { db, getUser: userFor('v1', 'viewer'), permsFor, env: {} });
  ok(r.statusCode === 400, 'unknown entity still 400s');
}

// ---------------------------------------------------------------------------
say('\n5) prospects entity rides the generic CRM contract');
{
  const { db, tables } = memDb({ prospects: [] });
  let r = await run(crm, { method: 'POST', query: { entity: 'prospects' }, headers: { authorization: 'Bearer ok' }, body: { company: 'Mombasa Auto', website: 'https://example.co.ke', emails: ['sales@example.co.ke'], phones: [], status: 'new', evil_column: 'x' } }, { db, getUser: userFor('s1', 'sales'), permsFor });
  ok(r.statusCode === 201 && r.body.company === 'Mombasa Auto', 'sales can create a prospect (leads.write)');
  ok(!('evil_column' in (tables.prospects[0] || {})), 'non-whitelisted columns are stripped');
  r = await run(crm, { method: 'POST', query: { entity: 'prospects' }, headers: { authorization: 'Bearer ok' }, body: { company: 'Nope Ltd' } }, { db, getUser: userFor('v1', 'viewer'), permsFor });
  ok(r.statusCode === 403, 'viewer cannot create prospects');
  r = await run(crm, { method: 'GET', query: { entity: 'prospects' }, headers: { authorization: 'Bearer ok' } }, { db, getUser: userFor('v1', 'viewer'), permsFor });
  ok(r.statusCode === 200 && r.body.length === 1, 'any signed-in member can read prospects');
}

say(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
