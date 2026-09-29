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

function memDb() {
  const tables = { leads: [], activities: [] };
  const from = name => {
    const rows = tables[name] || (tables[name] = []);
    return {
      insert(rec) {
        const list = [rec].map(r => ({ ...r, id: 'lead-1' }));
        rows.push(...list);
        return { data: list[0], error: null,
          select: () => ({ single: async () => ({ data: list[0], error: null }) }) };
      }
    };
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
async function post(body) {
  const { db, tables } = memDb();
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

say(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
