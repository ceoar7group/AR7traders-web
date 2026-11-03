// Public enquiry endpoint validation (npm run test:leads).
//
// /api/leads is the only unauthenticated write on the site. Before this it
// accepted a name of any length and any string at all as an email, so one
// crafted POST could store a megabyte of text in leads.name, and a malformed
// address would arrive in the CRM looking like a real contact.
let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
const bad = s => process.stderr.write(s + '\n');
const ok = (cond, msg) => { if (cond) { pass++; say('  ✓ ' + msg); } else { fail++; bad('  ✗ ' + msg); } };

function memDb(seed = {}, failures = {}) {
  const tables = { leads: [], activities: [], ...(seed || {}) };
  const from = name => {
    const rows = tables[name] || (tables[name] = []);
    const q = {
      _f: null, _lim: null,
      select: (...cols) => q,
      eq: (k, v) => { q._f = r => r[k] === v; return q; },
      limit: n => { q._lim = n; return q; },
      then: resolve => resolve({ data: (q._f ? rows.filter(q._f) : rows).slice(0, q._lim || rows.length), error: null }),
      catch() { return Promise.resolve({ data: [], error: null }); },
      insert(rec) {
        if (failures[name]) {
          const result = { data: null, error: failures[name] };
          return { select: () => ({ single: async () => result }), then: resolve => resolve(result) };
        }
        const row = { ...rec, id: name === 'leads' ? 'lead-1' : 'activity-1' };
        rows.push(row);
        const result = { data: row, error: null };
        return { select: () => ({ single: async () => result }), then: resolve => resolve(result) };
      }
    };
    return q;
  };
  return { db: { from }, tables };
}
function fakeRes() {
  const r = { statusCode: 0, body: null, headers: {} };
  r.status = c => { r.statusCode = c; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.end = p => { try { r.body = JSON.parse(p); } catch { r.body = p; } };
  return r;
}
const { default: handler } = await import('../api/leads.js');
async function post(body, seed, failures = {}, options = {}) {
  const { db, tables } = memDb(seed, failures);
  const res = fakeRes();
  const logs = [];
  const realError = console.error; console.error = (...args) => logs.push(args);
  try { await handler({ method: 'POST', body }, res, { db, notify: options.notify ?? false }); } finally { console.error = realError; }
  return { res, tables, logs };
}

say('\napi/leads.js — the public enquiry form');
{
  let { res, tables } = await post({ name: 'Imran Khan', email: 'imran@example.com', phone: '+92 300 1234567', country: 'Pakistan', vehicle_interest: 'Toyota Aqua' });
  ok(res.statusCode === 201, `a complete enquiry is accepted (${res.statusCode})`);
  ok(tables.leads[0].source === 'Website' && tables.leads[0].status === 'new', 'the lead is tagged as a new website lead');
  ok(tables.activities.length === 1, 'the enquiry is written to the activity log');
}
{
  const { res, tables } = await post({ name: 'Imran Khan', email: 'not-an-email' });
  ok(res.statusCode === 400, `a malformed email is refused (${res.statusCode})`);
  ok(tables.leads.length === 0, 'the bad email never reached the database');
}
{
  const { res } = await post({ name: 'Imran Khan', email: 'a b@c d.com' });
  ok(res.statusCode === 400, 'an email containing spaces is refused');
}
{
  const { res, tables } = await post({ name: 'Imran Khan', phone: '+92 300 1234567' });
  ok(res.statusCode === 201, 'a phone-only enquiry is still accepted');
  ok(tables.leads[0].email === null, 'email is stored as null, not an empty string');
}
{
  const { res } = await post({ name: 'I', email: 'a@b.com' });
  ok(res.statusCode === 400, 'a one-character name is refused');
}
{
  const { res } = await post({ email: 'a@b.com' });
  ok(res.statusCode === 400, 'a nameless enquiry is refused');
}
{
  const { res, tables } = await post({ name: 'X'.repeat(5000), email: 'a@b.com', phone: '+92 300 1234567' });
  ok(res.statusCode === 400 && res.body.field === 'name', 'an oversized name is refused with a useful field error');
  ok(tables.leads.length === 0, 'the oversized name never reaches the database');
}
{
  const { res, tables } = await post({ name: 'Imran Khan', email: 'a@b.com', phone: '+92 300 1234567', vehicle_interest: 'Y'.repeat(9000) });
  ok(tables.leads[0].vehicle_interest.length === 180, `vehicle_interest is capped at 180 characters (got ${tables.leads[0].vehicle_interest.length})`);
  ok(res.statusCode === 201, 'the enquiry still goes through');
}
{
  const { res, tables } = await post({ name: 'Imran Khan', email: 'a@b.com', phone: '+92 300 1234567', budget: 'not-a-number' });
  ok(tables.leads[0].budget === null, 'a non-numeric budget is stored as null, not NaN');
  ok(res.statusCode === 201, 'the enquiry still goes through');
}
{
  const { tables } = await post({ name: 'Imran Khan', email: 'a@b.com', phone: '+92 300 1234567', budget: 25000 });
  ok(tables.leads[0].budget === 25000, 'a real budget is kept');
}
{
  const { tables } = await post({ name: 'Imran Khan', email: 'a@b.com', phone: '+92 300 1234567', budget: -5 });
  ok(tables.leads[0].budget === null, 'a negative budget is dropped');
}
{
  const { tables } = await post({ name: 'Imran Khan', email: 'a@b.com', phone: '+92 300 1234567' });
  ok(tables.leads[0].country === 'Other', 'a missing country defaults to Other');
  ok(tables.leads[0].vehicle_interest === 'General enquiry', 'a missing interest defaults to General enquiry');
}
{
  const { res, tables } = await post({ website: 'https://spam.example', name: 'bot', email: 'b@b.com' });
  ok(res.statusCode === 400 && res.body.ok !== true && tables.leads.length === 0, 'the honeypot is refused without a fake success or a database write');
}
{
  const res = fakeRes();
  const { db } = memDb();
  await handler({ method: 'GET' }, res, { db });
  ok(res.statusCode === 405, 'GET is refused');
}


say('\napi/leads.js — mandatory phone and honest persistence');
for (const phone of [undefined, '', '   ', '123456', '+1234567890123456', 'call me', '+92 (300) 123-4567 ext']) {
  const { res, tables } = await post({ name: 'Fixture Buyer', email: 'fixture@example.test', phone });
  ok(res.statusCode === 400 && res.body.field === 'phone' && tables.leads.length === 0,
    `missing/invalid phone is refused before persistence (${JSON.stringify(phone)})`);
}
for (const phone of ['+92 300 1234567', '+44 7347 132624', '0300 1234567', '(020) 7946-0958', '+1 (415) 555-2671']) {
  const { res, tables } = await post({ name: 'Fixture Buyer', email: 'fixture@example.test', phone });
  ok(res.statusCode === 201 && tables.leads[0].phone === phone.replace(/\s+/g, ' '),
    `international/national phone is accepted (${phone})`);
}
{
  const { res, tables } = await post({ name: 'Fixture Buyer', phone: '0300 1234567', message: 'Please quote a Toyota Aqua to Karachi.', source: 'Website contact', vehicle_interest: 'Toyota Aqua' });
  ok(res.statusCode === 201 && res.body.ok === true && res.body.id === 'lead-1', 'success includes the persisted lead id');
  ok(tables.leads[0].notes.includes('Customer enquiry:') && tables.leads[0].notes.includes('Toyota Aqua to Karachi'), 'the buyer message is stored in CRM notes');
  ok(tables.leads[0].source === 'Website contact', 'the contact source is preserved from the allowlist');
  ok(tables.activities[0].action === 'New website enquiry' && !tables.activities[0].action.includes('Fixture Buyer'), 'the activity log contains no customer name');
}
{
  const { res, tables } = await post({ name: 'Fixture Buyer', phone: '0300 1234567', source: 'Staff admin' });
  ok(res.statusCode === 201 && tables.leads[0].source === 'Website', 'an unknown source cannot spoof an internal lead source');
}
{
  const { res, tables, logs } = await post({ name: 'Fixture Buyer', email: 'fixture@example.test', phone: '+92 300 1234567' }, {}, { leads: { code: '42501', message: 'permission denied for fixture@example.test +92 300 1234567' } });
  ok(res.statusCode === 503 && res.body.ok !== true && tables.leads.length === 0, 'a database permission failure is never reported as sent');
  ok(!JSON.stringify(logs).includes('fixture@example.test') && !JSON.stringify(logs).includes('300 1234567'), 'database failure logs contain no email or phone');
}
{
  const { res, tables } = await post({ name: 'Fixture Buyer', phone: '+92 300 1234567' }, {}, { activities: { code: '42501', message: 'activity denied' } });
  ok(res.statusCode === 201 && tables.leads.length === 1, 'an activity-log failure does not lose an already persisted lead');
}
{
  const res = fakeRes();
  await handler({ method: 'POST', body: { name: 'Fixture Buyer', email: 'fixture@example.test' } }, res);
  ok(res.statusCode === 400 && res.body.field === 'phone', 'missing phone is a client error even before database configuration is needed');
}
{
  const { res, tables } = await post(JSON.stringify({ name: 'Fixture Buyer', phone: '+92 300 1234567' }));
  ok(res.statusCode === 201 && tables.leads.length === 1, 'a JSON string body is parsed safely');
}
{
  const { res, tables } = await post({ name: 'Fixture Buyer', phone: '+92 300 1234567', email: 'not-an-email' });
  ok(res.statusCode === 400 && res.body.field === 'email' && tables.leads.length === 0, 'a supplied email must still be valid');
}

say('\napi/leads.js — the on-site assistant (action:"chat")');
{
  const { res } = await post({ action: 'chat', message: 'Hello!' });
  ok(res.statusCode === 200 && res.body.source === 'playbook' && /AR7 Traders assistant/.test(res.body.reply),
    'without an LLM key a canned playbook answers (always 200, never an error)');
}
{
  const { res } = await post({ action: 'chat', message: 'How much would a 2020 Land Cruiser cost to ship?' });
  ok(res.body.reply.includes('ar7tradersinfo@gmail.com') && res.body.reply.includes('+447347132624'),
    'the playbook points at the real inbox and WhatsApp number');
}
{
  const { res } = await post({ action: 'chat', message: '   ' });
  ok(res.statusCode === 400, 'an empty chat message is refused');
}
{
  const { res } = await post({ action: 'chat', message: 'X'.repeat(5000) });
  ok(res.statusCode === 200, 'an oversized chat message is accepted (capped, not an error)');
}
{
  process.env.GEMINI_API_KEY = 'test-gemini';
  const seen = [];
  const realFetch = global.fetch;
  global.fetch = async (u, opts) => {
    seen.push({ u: String(u), opts });
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'We have a 2021 Toyota Corolla Cross in Gifu, $18,400 export.' }] } }] }) };
  };
  const { res } = await post({ action: 'chat', message: 'Do you have a Corolla Cross?', history: [{ role: 'user', content: 'hi' }] },
    { site_listings: [{ make: 'Toyota', model: 'Corolla Cross', year: 2021, km: '30,000', price: '$18,400', location: 'Gifu', published: true }],
      site_settings: [{ key: 'contact_email', value: 'ar7tradersinfo@gmail.com' }] });
  global.fetch = realFetch;
  const llmCall = seen.find(c => c.u.includes('generativelanguage'));
  const prompt = llmCall ? JSON.stringify(llmCall.opts.body) : '';
  ok(res.statusCode === 200 && res.body.source === 'gemini'
    && prompt.includes('Corolla Cross') && prompt.includes('ar7tradersinfo@gmail.com'),
    'with GEMINI_API_KEY the LLM answers, grounded in live site_listings + the contact settings');
  delete process.env.GEMINI_API_KEY;
}
{
  process.env.GEMINI_API_KEY = 'test-gemini';
  const realFetch = global.fetch;
  global.fetch = async (u) => {
    if (String(u).includes('generativelanguage')) return { ok: false, status: 500, json: async () => ({ error: { message: 'boom' } }) };
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const { res } = await post({ action: 'chat', message: 'Shipping time?' });
  global.fetch = realFetch;
  delete process.env.GEMINI_API_KEY;
  ok(res.statusCode === 200 && res.body.source === 'playbook',
    'an LLM failure degrades to the playbook — the widget never sees an error');
}

say('\napi/leads.js — instant lead e-mail (Resend, fire-and-forget)');
{
  process.env.RESEND_API_KEY = 're_test';
  process.env.LEAD_NOTIFY_TO = 'owner@example.com';
  const seen = [];
  const realFetch = global.fetch;
  global.fetch = async (u, opts) => { seen.push({ u: String(u), opts }); return { ok: true, status: 200, json: async () => ({ id: 'mail-1' }) }; };
  const { res, tables } = await post({ name: 'Imran Khan', email: 'imran@example.com', phone: '+92 300 1234567', country: 'Pakistan' }, {}, {}, { notify: true });
  global.fetch = realFetch;
  const mail = seen.find(c => c.u.includes('api.resend.com'));
  ok(res.statusCode === 201 && mail && mail.opts.headers.Authorization === 'Bearer re_test'
    && JSON.stringify(mail.opts.body).includes('imran@example.com') && tables.leads.length === 1,
    'a new lead triggers the Resend notify — Bearer key + lead details, and the 201 is not blocked');
  delete process.env.RESEND_API_KEY;
  delete process.env.LEAD_NOTIFY_TO;
}
{
  process.env.RESEND_API_KEY = 're_test';
  process.env.LEAD_NOTIFY_TO = 'owner@example.com';
  const realFetch = global.fetch;
  global.fetch = async () => { throw new Error('resend down'); };
  const { res } = await post({ name: 'Imran Khan', email: 'a@b.com', phone: '+92 300 1234567' }, {}, {}, { notify: true });
  global.fetch = realFetch;
  delete process.env.RESEND_API_KEY;
  delete process.env.LEAD_NOTIFY_TO;
  ok(res.statusCode === 201, 'a Resend outage never blocks the 201');
}
{
  const seen = [];
  const realFetch = global.fetch;
  global.fetch = async (u) => { seen.push(String(u)); return { ok: true, status: 200, json: async () => ({}) }; };
  const { res } = await post({ name: 'Imran Khan', email: 'a@b.com', phone: '+92 300 1234567' });
  global.fetch = realFetch;
  ok(res.statusCode === 201 && seen.length === 0, 'without RESEND_API_KEY no mail call is made');
}

say(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
