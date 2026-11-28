// Lead e-mail delivery check (npm run test:lead-mail).
//
// 2026-11-25 (owner: "can you do lead emails with my current email?").
// The owner needs to be able to answer two questions without digging through
// Vercel: "where would a lead email go?" and "did it actually send?".
// `?leadmail=status|test` is that answer, and this suite pins it:
//   • it is admin-gated (settings.write) — it sends mail and reveals the inbox;
//   • status never sends anything;
//   • test sends a clearly-labelled, non-customer message and reports the
//     provider's own outcome, including the fix when Resend refuses;
//   • the recipient follows CRM → Settings → Enquiry inbox first, which is the
//     field the owner actually edits.
let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
const bad = s => process.stderr.write(s + '\n');
const ok = (cond, msg) => { if (cond) { pass++; say('  ✓ ' + msg); } else { fail++; bad('  ✗ ' + msg); } };

const { default: handler } = await import('../api/site-content.js');

function fakeDb(settings = []) {
  const tables = { site_settings: settings };
  return {
    tables,
    from(table) {
      tables[table] = tables[table] || [];
      const q = {
        _filters: [],
        select: () => q,
        eq: (k, v) => { q._filters.push([k, v]); return q; },
        limit: () => q,
        then: resolve => {
          let rows = tables[table];
          for (const [k, v] of q._filters) rows = rows.filter(r => r[k] === v);
          return Promise.resolve({ data: rows, error: null }).then(resolve);
        }
      };
      return q;
    }
  };
}

const parseBody = body => {
  if (typeof body !== 'string') return body;
  try { return JSON.parse(body); } catch { return body; }
};
const run = (req, injected) => new Promise(resolve => {
  const res = {
    statusCode: 200, headers: {},
    setHeader(k, v) { this.headers[k] = v; },
    status(c) { this.statusCode = c; return this; },
    json(body) { resolve({ statusCode: this.statusCode, body: parseBody(body) }); },
    end(body) { resolve({ statusCode: this.statusCode, body: parseBody(body) }); }
  };
  handler({ query: {}, headers: {}, body: null, method: 'GET', ...req }, res, injected).catch(e => resolve({ statusCode: 500, body: { error: e.message } }));
});
const userFor = role => async () => ({ user: { id: role, email: role + '@ar7.test' }, profile: { id: role, role, full_name: role } });
const permsFor = async role => ({ 'site.write': ['admin', 'manager'].includes(role), 'settings.write': role === 'admin' });

const settings = [
  { key: 'enquiry_inbox', value: 'owner@ar7traders.com' },
  { key: 'contact_email', value: 'hello@ar7traders.com' }
];
const admin = { db: fakeDb(settings), getUser: userFor('admin'), permsFor, env: { RESEND_API_KEY: 'test-key' } };

say('\n1) status: where a lead email would go, without sending');
{
  let sent = 0;
  const inject = { ...admin, fetch: async () => { sent++; return { ok: true, status: 200 }; } };
  const r = await run({ method: 'GET', query: { leadmail: 'status' } }, inject);
  ok(r.statusCode === 200, `status answers (${r.statusCode})`);
  ok(r.body.recipients?.[0] === 'owner@ar7traders.com', 'the CRM enquiry inbox comes first');
  ok(r.body.sender === 'AR7 Traders <onboarding@resend.dev>', 'the sender is named, so a refused sender is diagnosable');
  ok(r.body.keyConfigured === true, 'and it says whether a provider key exists');
  ok(sent === 0, 'status sends nothing');
}

say('\n2) test: one labelled email, the provider’s own answer');
{
  const calls = [];
  const inject = {
    ...admin,
    fetch: async (url2, opts) => { calls.push(JSON.parse(opts.body)); return { ok: true, status: 200 }; }
  };
  const r = await run({ method: 'POST', query: { leadmail: 'test' } }, inject);
  ok(r.statusCode === 200 && r.body.ok === true, `the test reports success (${r.statusCode})`);
  ok(calls.length === 1, 'exactly one email is sent');
  ok(calls[0].to[0] === 'owner@ar7traders.com', 'to the configured inbox');
  ok(/test lead/i.test(calls[0].subject) && /not a customer enquiry/i.test(calls[0].text),
    'clearly labelled as a test, never mistakable for a real lead');
  ok(!/@example\.(com|org)/.test(JSON.stringify(calls[0])), 'no placeholder address is sent along with it');

  const refused = await run({ method: 'POST', query: { leadmail: 'test' } }, {
    ...admin, fetch: async () => ({ ok: false, status: 403 })
  });
  ok(refused.body.ok === false && refused.body.code === 'HTTP_403' && /verify ar7traders\.com/i.test(refused.body.hint || ''),
    'a refusal comes back with the exact fix, not a shrug');
}

say('\n3) the check is admin-only and the inbox is editable without a deploy');
{
  const manager = await run({ method: 'POST', query: { leadmail: 'test' } }, {
    db: fakeDb(settings), getUser: userFor('manager'), permsFor, env: { RESEND_API_KEY: 'k' }, fetch: async () => ({ ok: true, status: 200 })
  });
  ok(manager.statusCode === 403, `a manager cannot send test mail (${manager.statusCode})`);

  const anon = await run({ method: 'POST', query: { leadmail: 'test' } }, {
    db: fakeDb(settings), getUser: async () => { throw Object.assign(new Error('Unauthorized'), { status: 401 }); }, permsFor
  });
  ok(anon.statusCode === 401, 'and a signed-out caller is refused');

  const moved = await run({ method: 'GET', query: { leadmail: 'status' } }, {
    db: fakeDb([{ key: 'enquiry_inbox', value: 'ceoar7grouplimited@gmail.com' }]),
    getUser: userFor('admin'), permsFor, env: {}
  });
  ok(moved.body.recipients?.[0] === 'ceoar7grouplimited@gmail.com',
    'changing the inbox in Settings changes where leads go — no Vercel edit needed');
  ok(moved.body.keyConfigured === false, 'and with no key it says so plainly');
}

say('');
say(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
