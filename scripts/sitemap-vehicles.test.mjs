// Dynamic vehicle sitemap regression suite (npm run test:sitemap-vehicles).
//
// Pins the contract of the vehicle sitemap in api/site-content.js —
// dispatched on GET ?sitemap=vehicles, publicly reachable at
// /api/sitemap-vehicles.xml via a vercel.json rewrite:
//   • only published rows, sold/private/delisted stock excluded;
//   • URLs follow carRef (stock_no, else row id) and are XML-safe;
//   • <lastmod> only for real timestamps;
//   • empty result is still a valid urlset;
//   • success is publicly cacheable in the minutes range;
//   • database failure → honest non-200, never 200 with malformed XML;
//   • GET only.
//
// No real database, no secrets: an in-memory Supabase-shaped client, the
// same pattern as scripts/settings-api.test.mjs.
let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
const bad = s => process.stderr.write(s + '\n');
const ok = (cond, msg) => { if (cond) { pass++; say('  ✓ ' + msg); } else { fail++; bad('  ✗ ' + msg); } };

// ---- in-memory Supabase-shaped client ---------------------------------------
function memDb(seedRows, opts = {}) {
  const rows = seedRows.map(r => ({ ...r }));
  return {
    from(name) {
      if (name !== 'site_listings') throw new Error(`unexpected table ${name}`);
      const ctx = { filters: [] };
      const api = {
        select: () => api,
        eq: (k, v) => { ctx.filters.push(r => r[k] === v); return api; },
        order: () => api,
        limit: () => api,
        then(resolve) {
          if (opts.error) return resolve({ data: null, error: { message: opts.error } });
          return resolve({ data: rows.filter(r => ctx.filters.every(f => f(r))), error: null });
        }
      };
      return api;
    }
  };
}

function fakeRes() {
  return {
    statusCode: 0, body: null, headers: {},
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.body = String(b); }
  };
}

const { sitemapVehicles: handler, buildXml, esc, lastmodOf } =
  await import('../api/site-content.js');

async function run(req, db) {
  const res = fakeRes();
  const realError = console.error;
  console.error = () => {};   // expected failure paths log; keep output readable
  try { await handler(req, res, db ? { db } : {}); }
  finally { console.error = realError; }
  return res;
}

const locs = xml => [...String(xml).matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1]);
// Decode XML entities (the five predefined ones) for round-trip checks.
const unesc = s => String(s).replace(/&lt;/g, '<').replace(/&gt;/g, '>')
  .replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

const SEED = [
  { id: 'r1', stock_no: 'AR7-26001', status: 'In Stock', published: true, updated_at: '2026-09-20T10:00:00Z', sort_order: 1 },
  { id: 'r2', stock_no: 'AR7-26002', status: 'Auction', published: true, updated_at: '2026-09-21T10:00:00Z', sort_order: 2 },
  { id: 'r3', stock_no: 'AR7-26003', status: 'New Arrival', published: true, updated_at: null, sort_order: 3 },
  { id: 'r4', stock_no: 'AR7-26004', status: 'Sold', published: true, updated_at: '2026-09-22T10:00:00Z', sort_order: 4 },
  { id: 'r5', stock_no: 'AR7-26005', status: 'In Stock', published: false, updated_at: '2026-09-22T10:00:00Z', sort_order: 5 },
  { id: 'r6', stock_no: 'AR7-26006', status: 'Delisted', published: true, updated_at: '2026-09-22T10:00:00Z', sort_order: 6 },
  { id: 'r7', stock_no: 'AR7-26007', status: 'Private', published: true, updated_at: '2026-09-22T10:00:00Z', sort_order: 7 }
];

// ---- happy path: filtering, URLs, cache -------------------------------------
{
  const res = await run({ method: 'GET' }, memDb(SEED));
  ok(res.statusCode === 200, 'GET responds 200');
  ok(String(res.headers['content-type']).startsWith('application/xml'), 'response is application/xml');
  ok(res.headers['cache-control'] === 'public, max-age=120, s-maxage=600',
    'success is publicly cached in the minutes range (like goonet-stock)');
  const body = String(res.body);
  ok(body.startsWith('<?xml version="1.0" encoding="UTF-8"?>') && body.trimEnd().endsWith('</urlset>'),
    'body is a complete urlset document');
  const found = locs(body);
  ok(found.length === 3, `only the 3 public, available cars are listed (found ${found.length})`);
  ok(found.includes('https://ar7traders.com/inventory/AR7-26001') &&
     found.includes('https://ar7traders.com/inventory/AR7-26002') &&
     found.includes('https://ar7traders.com/inventory/AR7-26003'),
    'URLs use the stock number via carRef');
  ok(!found.some(l => l.includes('AR7-26004')) && !found.some(l => l.includes('AR7-26005')) &&
     !found.some(l => l.includes('AR7-26006')) && !found.some(l => l.includes('AR7-26007')),
    'sold, unpublished, delisted and private stock is excluded');
  ok(found.every(l => l.startsWith('https://ar7traders.com/inventory/')),
    'every loc is an absolute https vehicle URL');
}

// ---- lastmod only for real timestamps ---------------------------------------
{
  const res = await run({ method: 'GET' }, memDb(SEED));
  const body = String(res.body);
  const blocks = body.match(/<url>[\s\S]*?<\/url>/g) || [];
  const withLastmod = blocks.filter(b => b.includes('<lastmod>'));
  ok(withLastmod.length === 2, `lastmod only where a real updated_at exists (found ${withLastmod.length})`);
  ok(withLastmod.every(b => /<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(b)), 'lastmod is YYYY-MM-DD');
  const blocks2 = body.match(/<url>[\s\S]*?<\/url>/g) || [];
  const b3 = blocks2.find(b => b.includes('AR7-26003')) || '';
  ok(b3 !== '' && !b3.includes('<lastmod>'),
    'a row with updated_at null gets no lastmod');
}

// ---- escaping: hostile stock numbers stay well-formed ------------------------
{
  const hostile = [{ id: 'r9', stock_no: "AR7-X & <Y> 'Z' \"Q\"", status: 'In Stock', published: true, updated_at: '2026-09-28T00:00:00Z' }];
  const res = await run({ method: 'GET' }, memDb(hostile));
  ok(res.statusCode === 200, 'hostile stock number still responds 200');
  const body = String(res.body);
  const raw = body.match(/<loc>([^<]*)<\/loc>/)?.[1] || '';
  ok(raw !== '' && !raw.includes('<Y>') && !raw.includes('"Q"'), 'special characters never break the XML structure');
  ok(!/(^|[^&])</.test(body.replace(/<url>|<\/url>|<urlset[^>]*>|<\/urlset>|<loc>|<\/loc>|<lastmod>|<\/lastmod>|<\?xml[^?]*\?>|\n| /g, '')),
    'no unescaped angle brackets outside the tags themselves');
  const decoded = decodeURIComponent(unesc(raw));
  ok(decoded === 'https://ar7traders.com/inventory/AR7-X & <Y> \'Z\' "Q"',
    `round-trip decodes to the original ref (${decoded})`);
  ok(esc('a&b<c>d"e\'f') === 'a&amp;b&lt;c&gt;d&quot;e&apos;f', 'esc() covers all five XML entities');
}

// ---- carRef fallbacks ---------------------------------------------------------
{
  const noStock = [{ id: 'row-9', stock_no: null, status: 'In Stock', published: true, updated_at: 'bogus-date' }];
  const res = await run({ method: 'GET' }, memDb(noStock));
  const found = locs(res.body);
  ok(found.length === 1 && found[0] === 'https://ar7traders.com/inventory/row-9',
    'row id is used when no stock number exists');
  ok(!String(res.body).includes('<lastmod>'), 'an unparseable updated_at gets no lastmod');
  const neither = buildXml([{ status: 'In Stock', published: true }]);
  ok(neither.startsWith('<?xml') && locs(neither).length === 0 && neither.includes('</urlset>'),
    'a row with neither stock_no nor id is skipped, not published as /undefined');
}

// ---- empty result is still a valid sitemap ------------------------------------
{
  const res = await run({ method: 'GET' }, memDb([]));
  ok(res.statusCode === 200, 'empty table responds 200');
  const body = String(res.body);
  ok(body.includes('<urlset') && body.includes('</urlset>') && locs(body).length === 0,
    'empty result is a valid urlset with zero entries');
}

// ---- failure modes: honest errors, never 200 + garbage -------------------------
{
  const res = await run({ method: 'GET' }, memDb(SEED, { error: 'relation does not exist' }));
  ok(res.statusCode === 503, 'database error responds 503, not 200');
  ok(!String(res.body).includes('<urlset'), 'error response carries no XML that could be mistaken for a sitemap');
  ok(res.headers['cache-control'] === 'no-store', 'error responses are not cached');
}
{
  const res = await run({ method: 'POST' }, memDb(SEED));
  ok(res.statusCode === 405, 'POST responds 405');
  ok(res.headers['allow'] === 'GET', '405 advertises GET');
}

// ---- method/sanity: buildXml is idempotent for repeat rows ---------------------
{
  const xml1 = buildXml(SEED.filter(r => r.published));
  const xml2 = buildXml(SEED.filter(r => r.published));
  ok(xml1 === xml2, 'buildXml is deterministic for the same rows');
  ok(lastmodOf('') === null && lastmodOf(undefined) === null && lastmodOf('nope') === null,
    'lastmodOf rejects empty and invalid timestamps');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
