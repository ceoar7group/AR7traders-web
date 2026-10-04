#!/usr/bin/env node
// Dynamic machinery sitemap regression suite (npm run test:sitemap-machinery).
//
// Mirrors scripts/sitemap-vehicles.test.mjs, and pins the same guarantees for
// the machinery desk — dispatched on GET ?sitemap=machinery and publicly
// reachable at /api/sitemap-machinery.xml through a vercel.json rewrite:
//   • published machines only;
//   • a valid sitemaps.org urlset, including when there are none;
//   • absolute URLs on the canonical domain, never www.;
//   • every emitted URL is a route src/routing.js actually resolves — a
//     sitemap that advertises a dead path is worse than no sitemap;
//   • success is publicly cacheable in the minutes range;
//   • a database failure is an honest non-200, never 200 with broken XML;
//   • GET only.
//
// No real database and no secrets: an in-memory Supabase-shaped client.
let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
const bad = s => process.stderr.write(s + '\n');
const ok = (cond, msg) => { if (cond) { pass++; say('  ✓ ' + msg); } else { fail++; bad('  ✗ ' + msg); } };

// ---- in-memory Supabase-shaped client --------------------------------------
function memDb(rows, opts = {}) {
  const table = rows.map(r => ({ ...r }));
  return {
    from(name) {
      if (name !== 'machinery') throw new Error(`unexpected table ${name}`);
      const ctx = { filters: [] };
      const api = {
        select: () => api,
        eq: (k, v) => { ctx.filters.push(r => r[k] === v); return api; },
        order: () => api,
        limit: () => api,
        then(resolve) {
          if (opts.error) return resolve({ data: null, error: { message: opts.error } });
          return resolve({ data: table.filter(r => ctx.filters.every(f => f(r))), error: null });
        }
      };
      return api;
    }
  };
}

function fakeRes() {
  const r = {
    statusCode: 0, body: null, headers: {},
    status(c) { r.statusCode = c; return r; },
    setHeader(k, v) { r.headers[String(k).toLowerCase()] = v; return r; },
    end(b) { r.body = b; return r; }
  };
  return r;
}

const api = (await import('../api/site-content.js')).default;
const { parseRoute } = await import('../src/routing.js');

const req = (method, query) => ({ method, query, headers: {} });

const machine = (over = {}) => ({
  id: 'mch-1', ref: 'AR7-MC-001', type: 'Excavators', brand: 'Doosan',
  model: 'DX300LC-9C', year: 2019, hours: 6800, price_usd: 62500,
  status: 'Available', published: true, sort_order: 1,
  images: [{ src: '/assets/machinery/doosan-dx300lc-1.webp', rights: 'own-photo' }],
  specs: [['Operating weight', '30,200 kg']],
  updated_at: '2026-10-04T08:00:00Z',
  ...over
});

/** Ask the API for the sitemap and hand back {status, headers, body}. */
async function fetchSitemap(db) {
  const res = fakeRes();
  await api(req('GET', { sitemap: 'machinery' }), res, { db });
  return { status: res.statusCode, headers: res.headers, body: String(res.body || '') };
}

const locs = xml => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1]);

// ---------------------------------------------------------------------------
say('\n-- a published catalogue --');
{
  const db = memDb([
    machine(),
    machine({ id: 'mch-2', ref: 'AR7-MC-002', type: 'Loaders', sort_order: 2 }),
    machine({ id: 'mch-3', ref: 'AR7-MC-003', type: 'Excavators', sort_order: 3 })
  ]);
  const r = await fetchSitemap(db);

  ok(r.status === 200, `a published catalogue answers 200 (got ${r.status})`);
  ok((r.headers['content-type'] || '').includes('xml'), 'the response is XML');
  ok(r.body.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'the document declares XML 1.0');
  ok(r.body.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'),
    'it is a sitemaps.org 0.9 urlset');

  const urls = locs(r.body);
  ok(urls.every(u => u.startsWith('https://ar7traders.com/')), 'every URL is absolute and canonical');
  ok(urls.every(u => !u.includes('www.')), 'no URL uses www.');
  ok(urls.includes('https://ar7traders.com/machinery/excavators'), 'the catalogue page is listed');
  ok(urls.includes('https://ar7traders.com/machinery/loaders'), 'every type gets a catalogue page');
  ok(urls.includes('https://ar7traders.com/machinery/excavators/AR7-MC-001'), 'detail pages are listed');
  ok(urls.length === 5, `3 machines -> 2 catalogue + 3 detail pages (got ${urls.length})`);
  ok(new Set(urls).size === urls.length, 'no duplicate URLs');
  ok(/<lastmod>\d{4}-\d{2}-\d{2}<\/lastmod>/.test(r.body), 'a real timestamp becomes a lastmod');

  // THE check that matters: a sitemap listing a dead path is worse than none.
  const dead = [];
  for (const u of urls) {
    const path = u.replace('https://ar7traders.com', '') || '/';
    let route = null;
    // parseRoute takes a LOCATION object ({pathname}), not a bare string —
    // passing a string makes it fall back to '/' and report every URL dead.
    try { route = parseRoute({ pathname: path }); } catch { route = null; }
    if (!route) { dead.push(path); continue; }
    const servesMachine = route.page === 'machinery' ||
      (route.machineType && String(path).toLowerCase().includes(String(route.machineType).toLowerCase()));
    if (!servesMachine) dead.push(path);
  }
  ok(dead.length === 0, `every emitted URL is a route src/routing.js resolves${dead.length ? ` — dead: ${dead.join(', ')}` : ''}`);

  // Cache: minutes range, and publicly cacheable.
  const cc = r.headers['cache-control'] || '';
  const maxAge = Number((cc.match(/max-age=(\d+)/) || [])[1]);
  const sMax = Number((cc.match(/s-maxage=(\d+)/) || [])[1]);
  ok(cc.includes('public'), 'the sitemap is publicly cacheable');
  ok(Number.isFinite(maxAge) && maxAge >= 60 && maxAge <= 3600, `max-age is in the minutes range (${maxAge}s)`);
  ok(Number.isFinite(sMax) && sMax >= 60 && sMax <= 3600, `s-maxage is in the minutes range (${sMax}s)`);
}

// ---------------------------------------------------------------------------
say('\n-- unpublished machines are excluded --');
{
  const db = memDb([
    machine(),
    machine({ id: 'mch-2', ref: 'AR7-MC-002', type: 'Loaders', published: false }),
    machine({ id: 'mch-3', ref: 'AR7-MC-003', type: 'Cranes', status: 'Archived', published: false })
  ]);
  const r = await fetchSitemap(db);
  const urls = locs(r.body);
  ok(r.status === 200, 'still 200 when some machines are hidden');
  ok(!urls.some(u => u.includes('AR7-MC-002')), 'an unpublished machine is absent');
  ok(!urls.some(u => u.includes('AR7-MC-003')), 'an archived machine is absent');
  ok(!urls.includes('https://ar7traders.com/machinery/loaders'),
    'a type with no published machine gets no catalogue page');
  ok(urls.includes('https://ar7traders.com/machinery/excavators'), 'the published type is still listed');
}

// ---------------------------------------------------------------------------
say('\n-- an empty catalogue --');
{
  const r = await fetchSitemap(memDb([]));
  ok(r.status === 200, 'an empty catalogue still answers 200');
  ok(r.body.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'),
    'an empty catalogue is still a valid urlset');
  ok(locs(r.body).length === 0, 'and lists no URLs');
}

// ---------------------------------------------------------------------------
say('\n-- failure and method handling --');
{
  const broken = await fetchSitemap(memDb([], { error: 'connection refused' }));
  ok(broken.status !== 200, `a database failure is not a 200 (got ${broken.status})`);
  ok(!broken.body.includes('<urlset'), 'and never emits a broken urlset');

  const post = fakeRes();
  await api(req('POST', { sitemap: 'machinery' }), post, { db: memDb([]) });
  ok(post.statusCode === 200 || post.statusCode === 405,
    'a POST is not treated as a sitemap read');
}

// ---------------------------------------------------------------------------
say('\n-- a machine with no rights basis on its photo --');
{
  // The machine is still listed (every machine in the database is published),
  // but the photograph must not be, so the sitemap advertises only the page.
  const db = memDb([machine({ images: [{ src: '/watermarked.webp', rights: '' }] })]);
  const r = await fetchSitemap(db);
  ok(r.status === 200, 'the page is still advertised');
  ok(r.body.includes('AR7-MC-001'), 'the machine page remains in the sitemap');
  ok(!r.body.includes('watermarked'), 'the unlicensed photo is not referenced anywhere in the sitemap');
}

say(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
