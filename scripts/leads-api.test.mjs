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

function memDb(seed = {}) {
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
        const list = [rec].map(r => ({ ...r, id: 'lead-1' }));
        rows.push(...list);
        return { data: list[0], error: null,
          select: () => ({ single: async () => ({ data: list[0], error: null }) }) };
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
async function post(body, seed) {
  const { db, tables } = memDb(seed);
  const res = fakeRes();
  const realError = console.error; console.error = () => {};
  try { await handler({ method: 'POST', body }, res, { db }); } finally { console.error = realError; }
  return { res, tables };
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
  const { res, tables } = await post({ name: 'X'.repeat(5000), email: 'a@b.com' });
  ok(res.statusCode === 201, 'an oversized name is accepted rather than erroring out');
  ok(tables.leads[0].name.length === 120, `the stored name is capped at 120 characters (got ${tables.leads[0].name.length})`);
}
{
  const { res, tables } = await post({ name: 'Imran Khan', email: 'a@b.com', vehicle_interest: 'Y'.repeat(9000) });
  ok(tables.leads[0].vehicle_interest.length === 180, `vehicle_interest is capped at 180 characters (got ${tables.leads[0].vehicle_interest.length})`);
  ok(res.statusCode === 201, 'the enquiry still goes through');
}
{
  const { res, tables } = await post({ name: 'Imran Khan', email: 'a@b.com', budget: 'not-a-number' });
  ok(tables.leads[0].budget === null, 'a non-numeric budget is stored as null, not NaN');
  ok(res.statusCode === 201, 'the enquiry still goes through');
}
{
  const { tables } = await post({ name: 'Imran Khan', email: 'a@b.com', budget: 25000 });
  ok(tables.leads[0].budget === 25000, 'a real budget is kept');
}
{
  const { tables } = await post({ name: 'Imran Khan', email: 'a@b.com', budget: -5 });
  ok(tables.leads[0].budget === null, 'a negative budget is dropped');
}
{
  const { tables } = await post({ name: 'Imran Khan', email: 'a@b.com' });
  ok(tables.leads[0].country === 'Other', 'a missing country defaults to Other');
  ok(tables.leads[0].vehicle_interest === 'General enquiry', 'a missing interest defaults to General enquiry');
}
{
  const { res, tables } = await post({ website: 'https://spam.example', name: 'bot', email: 'b@b.com' });
  ok(res.statusCode === 200 && tables.leads.length === 0, 'the honeypot field silently drops bot submissions');
}
{
  const res = fakeRes();
  const { db } = memDb();
  await handler({ method: 'GET' }, res, { db });
  ok(res.statusCode === 405, 'GET is refused');
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
  const { res, tables } = await post({ name: 'Imran Khan', email: 'imran@example.com', country: 'Pakistan' });
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
  const { res } = await post({ name: 'Imran Khan', email: 'a@b.com' });
  global.fetch = realFetch;
  delete process.env.RESEND_API_KEY;
  delete process.env.LEAD_NOTIFY_TO;
  ok(res.statusCode === 201, 'a Resend outage never blocks the 201');
}
{
  const seen = [];
  const realFetch = global.fetch;
  global.fetch = async (u) => { seen.push(String(u)); return { ok: true, status: 200, json: async () => ({}) }; };
  const { res } = await post({ name: 'Imran Khan', email: 'a@b.com' });
  global.fetch = realFetch;
  ok(res.statusCode === 201 && seen.length === 0, 'without RESEND_API_KEY no mail call is made');
}

say(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
