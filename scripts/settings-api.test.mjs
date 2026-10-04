// Settings API security regression suite (npm run test:settings).
//
// Unauthenticated GET /api/settings used to return EVERY site_settings row —
// including importer tuning and operational timestamps — to anyone. These tests
// pin the fixed contract:
//   • anonymous GET → public allowlist only, publicly cacheable;
//   • authenticated GET → full settings for staff, private + never cached;
//   • bad token → 401 (never a silent downgrade to the public subset);
//   • PATCH keeps auth + settings.write enforcement and validates keys/values.
//
// No real database, no secrets: an in-memory Supabase-shaped client and an
// injected user resolver, same pattern as goonet-sync.test.mjs.
let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
const bad = s => process.stderr.write(s + '\n');
const ok = (cond, msg) => { if (cond) { pass++; say('  ✓ ' + msg); } else { fail++; bad('  ✗ ' + msg); } };

function memDb(seedRows) {
  const tables = { site_settings: [], activities: [] };
  tables.site_settings.push(...seedRows.map(r => ({ ...r })));
  function from(name) {
    const rows = tables[name] || (tables[name] = []);
    function q() {
      const ctx = { filters: [], order: null, limitN: null, cols: ['*'] };
      const api = {
        select: (...cols) => { ctx.cols = cols.length ? cols.flatMap(c => String(c).split(',').map(s => s.trim()).filter(Boolean)) : ['*']; return api; },
        eq: (k, v) => { ctx.filters.push(r => r[k] === v); return api; },
        order: (k, opts = {}) => { ctx.order = (a, b) => String(a[k] ?? '').localeCompare(String(b[k] ?? ''), undefined, { numeric: true }); return api; },
        limit: n => { ctx.limitN = n; return api; },
        _rows() { let out = rows.filter(r => ctx.filters.every(f => f(r))); if (ctx.order) out = out.slice().sort(ctx.order); if (ctx.limitN) out = out.slice(0, ctx.limitN); return out; },
        maybeSingle: async () => ({ data: api._rows()[0] || null, error: null }),
        then(resolve) { return resolve({ data: api._rows(), error: null }); }
      };
      return api;
    }
    return {
      select: (...cols) => q().select(...cols),
      eq: (k, v) => q().eq(k, v),
      order: (k, o) => q().order(k, o),
      maybeSingle: async () => q().maybeSingle(),
      async insert(r) { rows.push({ ...(Array.isArray(r) ? r[0] : r) }); return { error: null }; },
      async upsert(item) {
        const list = Array.isArray(item) ? item : [item];
        for (const it of list) {
          const existing = rows.find(r => r.key === it.key);
          if (existing) Object.assign(existing, it);
          else rows.push({ ...it });
        }
        return { error: null };
      }
    };
  }
  return { db: { from }, tables };
}

const SEED = [
  { key: 'contact_email', value: 'ar7tradersinfo@gmail.com', label: 'Public contact email' },
  { key: 'contact_phone', value: '+44 7347 132624', label: 'Public phone number' },
  { key: 'whatsapp_number', value: '+447347132624', label: 'WhatsApp button number' },
  { key: 'whatsapp_message', value: 'Hello AR7 Traders', label: 'WhatsApp pre-filled message' },
  { key: 'contact_address', value: 'Tokyo, Japan', label: 'Public address' },
  { key: 'enquiry_inbox', value: 'ar7tradersinfo@gmail.com', label: 'Where website enquiries are sent' },
  { key: 'exchange_rates', value: '{"USD":1,"JPY":155}', label: 'Display currency rates per 1 USD (JSON)' },
  { key: 'exchange_rates_updated', value: '2026-09-28T00:00:00Z', label: 'When rates were last saved' },
  { key: 'stock_discounts', value: JSON.stringify({version: 1, items: { 'car:AR7-42': {kind: 'car', ref: 'AR7-42', percent: 15, until: null} }}), label: 'Public discounts by stock reference' },
  { key: 'offer', value: '{"active":true,"scope":"all","percent":20}', label: 'retired global offer' },
  { key: 'base_currency', value: 'USD', label: 'Ledger base currency' },
  { key: 'default_customer_currency', value: 'USD', label: 'Default currency for new customer accounts' },
  { key: 'goonet_search_url', value: 'https://www.goo-net.com/usedcar/price-100-300/', label: 'Goo-net search page' },
  { key: 'goonet_bookmark_page', value: '7', label: 'Next goo-net listing page to crawl' },
  { key: 'goonet_last_run_at', value: '2026-09-28T01:23:45Z', label: 'When the importer last ran' },
  { key: 'goonet_sync_key_hint', value: 'internal-only value', label: 'Operational' }
];

function fakeRes() {
  const r = { statusCode: 0, body: null, headers: {} };
  r.status = code => { r.statusCode = code; return r; };
  r.setHeader = (k, v) => { r.headers[k.toLowerCase()] = v; };
  r.end = json => { r.body = JSON.parse(json); };
  return r;
}

const adminProfile = { id: 'u1', full_name: 'Admin', role: 'admin', active: true };
const managerProfile = { id: 'u2', full_name: 'Manager', role: 'manager', active: true };
const getUser = profile => async req => {
  const h = req.headers?.authorization || '';
  if (!h.startsWith('Bearer ') || !h.includes('ok')) throw Object.assign(new Error('Unauthorized'), { status: 401 });
  return { user: { id: profile.id }, profile, db: null };
};
const permsFor = async role => (role === 'admin' ? { 'settings.write': true } : { 'settings.write': false });

const { default: handler } = await import('../api/settings.js');

async function run(req, injected) {
  const res = fakeRes();
  // Expected auth failures log via console.error in the handler; keep the
  // test output readable without hiding anything from the assertions.
  const realError = console.error;
  console.error = () => {};
  try { await handler(req, res, injected); }
  finally { console.error = realError; }
  return res;
}

// ---- anonymous GET: public allowlist only -----------------------------------
{
  const { db, tables } = memDb(SEED);
  const res = await run({ method: 'GET', headers: {} }, { db });
  ok(res.statusCode === 200, 'anonymous GET responds 200');
  const keys = Object.keys(res.body).sort();
  ok(keys.join(',') === 'contact_address,contact_email,contact_phone,enquiry_inbox,exchange_rates,exchange_rates_updated,stock_discounts,whatsapp_message,whatsapp_number',
    'anonymous GET returns exactly the public allowlist, including item-specific public prices');
  ok(!('goonet_bookmark_page' in res.body) && !('goonet_search_url' in res.body) && !('goonet_last_run_at' in res.body),
    'importer/operational settings are not readable anonymously');
  ok(!('default_customer_currency' in res.body) && !('base_currency' in res.body),
    'internal defaults are not readable anonymously');
  ok(String(res.headers['cache-control']).startsWith('public'), 'public response is publicly cacheable');
  ok(res.body.contact_email === 'ar7tradersinfo@gmail.com', 'public contact values pass through unchanged');
  ok(res.body.exchange_rates === '{"USD":1,"JPY":155}', 'exchange rates stay readable for the currency picker');
  ok(res.body.stock_discounts.includes('car:AR7-42') && !('offer' in res.body),
    'public per-stock discounts are readable while the retired global offer is not exposed');
}
// A blanked-out public value is omitted so the site falls back to defaults.
{
  const { db } = memDb([...SEED, { key: 'contact_email', value: '' }]);
  const res = await run({ method: 'GET', headers: {} }, { db });
  ok(!('contact_email' in res.body), 'an empty saved contact is omitted, not published blank');
}

// ---- authenticated GET: full settings, private, never cached ----------------
{
  const { db } = memDb(SEED);
  const res = await run({ method: 'GET', headers: { authorization: 'Bearer ok' } }, { db, getUser: getUser(adminProfile) });
  ok(res.statusCode === 200, 'authenticated GET responds 200');
  ok(res.body.goonet_bookmark_page === '7' && res.body.default_customer_currency === 'USD',
    'authenticated GET returns operational settings for the CRM forms');
  ok(res.headers['cache-control'] === 'private, no-store', 'authenticated response is private and never cached');
}
// A bad token is a real 401 — the CRM must re-auth, not silently see less.
{
  const { db } = memDb(SEED);
  const res = await run({ method: 'GET', headers: { authorization: 'Bearer expired' } }, { db, getUser: getUser(adminProfile) });
  ok(res.statusCode === 401, 'expired token on GET returns 401');
  const res2 = await run({ method: 'GET', headers: {} }, { db }); // control: anon still fine
  ok(res2.statusCode === 200 && !('goonet_bookmark_page' in res2.body), 'anonymous GET still works after a failed authed read');
}

// ---- PATCH: auth + permission + validation -----------------------------------
{
  const { db, tables } = memDb(SEED);
  const res = await run({ method: 'PATCH', headers: {} }, { db, getUser: getUser(adminProfile), permsFor });
  ok(res.statusCode === 401, 'PATCH without a token is 401');
}
{
  const { db, tables } = memDb(SEED);
  const res = await run({ method: 'PATCH', headers: { authorization: 'Bearer ok' }, body: { contact_phone: '+44 7347 132624' } },
    { db, getUser: getUser(managerProfile), permsFor });
  ok(res.statusCode === 403, 'PATCH without settings.write is 403');
  ok(!tables.site_settings.find(r => r.key === 'contact_phone' && r.updated_at), 'rejected PATCH wrote nothing');
}
{
  const { db, tables } = memDb(SEED);
  const res = await run({ method: 'PATCH', headers: { authorization: 'Bearer ok' },
    body: { contact_email: 'newdesk@ar7traders.example', goonet_min_photos: '4' } },
    { db, getUser: getUser(adminProfile), permsFor });
  ok(res.statusCode === 200 && res.body.ok === true, 'admin PATCH with valid keys succeeds');
  ok(tables.site_settings.find(r => r.key === 'contact_email').value === 'newdesk@ar7traders.example', 'contact value upserted');
  ok(tables.site_settings.find(r => r.key === 'goonet_min_photos')?.value === '4', 'known importer key upserted (CRM importer form)');
  ok(tables.activities.length >= 1, 'activity log written');
}
// Campaign margin messaging remains a separate PromoBar feature; it does not
// replace or edit the item-keyed stock_discounts price map.
{
  const {db} = memDb(SEED);
  const promo = {active: true, headline: 'Excavator desk spotlight', cta: 'See machines',
    href: '/machinery', discount: 12, until: '2026-12-31'};
  const res = await run({method: 'PATCH', headers: {authorization: 'Bearer ok'},
    body: {promo: JSON.stringify(promo)}}, {db, getUser: getUser(adminProfile), permsFor});
  ok(res.statusCode === 200, 'owner-confirmed campaign margin messaging stays available in PromoBar');
}

// Per-stock prices are public but only a validated car:REF / machine:REF map is writable.
{
  const { db, tables } = memDb(SEED);
  const discounts = {version: 1, items: {
    'machine:AR7-MC-004': {kind: 'machine', ref: 'AR7-MC-004', percent: 22, until: '2026-12-31'}
  }};
  const res = await run({method: 'PATCH', headers: {authorization: 'Bearer ok'},
    body: {stock_discounts: JSON.stringify(discounts)}},
    {db, getUser: getUser(adminProfile), permsFor});
  ok(res.statusCode === 200, 'PATCH accepts valid stock-specific discounts through the existing settings API');
  ok(tables.site_settings.find(r => r.key === 'stock_discounts')?.value === JSON.stringify(discounts),
    'the existing settings entity persists the item-keyed public discount');
}

// Validation: unknown keys, bad emails, oversized values, objects.
{
  const { db } = memDb(SEED);
  const cases = [
    [{ not_a_setting: 'x' }, 'unknown key', /Unknown setting key/],
    [{ offer: '{"active":true,"scope":"all","percent":20}' }, 'retired global offer setting', /Unknown setting key/],
    [{ stock_discounts: 'not-json' }, 'malformed stock discounts', /stock_discounts must be a JSON object/],
    [{ promo: JSON.stringify({active: true, headline: 'Sale', cta: 'Browse', href: '/inventory', until: '2026-02-30'}) },
      'impossible campaign end date', /real YYYY-MM-DD/],
    [{ contact_email: 'not-an-email' }, 'invalid email', /valid email/],
    [{ contact_phone: 'x'.repeat(400) }, 'oversized value', /too long/],
    [{ whatsapp_message: { nested: true } }, 'object value', /must be a string/]
  ];
  for (const [body, name, re] of cases) {
    const res = await run({ method: 'PATCH', headers: { authorization: 'Bearer ok' }, body }, { db, getUser: getUser(adminProfile), permsFor });
    ok(res.statusCode === 400 && re.test(res.body.error || ''), `PATCH rejected for ${name} (${res.body?.error || ''})`);
  }
  const res = await run({ method: 'PATCH', headers: { authorization: 'Bearer ok' }, body: {} }, { db, getUser: getUser(adminProfile), permsFor });
  ok(res.statusCode === 400, 'empty PATCH is a 400');
}
// Exchange-rate blob gets a larger but still bounded cap.
{
  const { db } = memDb(SEED);
  const big = JSON.stringify({ USD: 1, JPY: '0'.repeat(7000) });
  const res = await run({ method: 'PATCH', headers: { authorization: 'Bearer ok' }, body: { exchange_rates: big } },
    { db, getUser: getUser(adminProfile), permsFor });
  ok(res.statusCode === 200, 'a realistic exchange-rate JSON passes validation');
  const res2 = await run({ method: 'PATCH', headers: { authorization: 'Bearer ok' }, body: { exchange_rates: 'x'.repeat(9000) } },
    { db, getUser: getUser(adminProfile), permsFor });
  ok(res2.statusCode === 400, 'an absurd exchange-rate payload is rejected');
}

// ---- method guard -------------------------------------------------------------
{
  const { db } = memDb(SEED);
  const res = await run({ method: 'DELETE', headers: {} }, { db });
  ok(res.statusCode === 405, 'unsupported method is 405');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
