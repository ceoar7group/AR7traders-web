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
//   • it advertises exactly what the SITE is serving: the published database
//     rows when there are any, otherwise the built-in catalogue the client
//     keeps in place (hydrateMachines) — so a missing table no longer hides
//     live pages from a crawler behind a 503, it names the source instead
//     (X-Machinery-Source) and caches briefly;
//   • never 200 with broken XML, whatever the database did;
//   • GET only (405 with Allow).
//
// No real database and no secrets: an in-memory Supabase-shaped client.
import { readFileSync } from 'node:fs';

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
          // A string is the "something went wrong" case; an object is the
          // Supabase shape ({message, code}), which the classifier reads.
          if (opts.error) return resolve({ data: null, error: typeof opts.error === 'string' ? { message: opts.error } : opts.error });
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
const { builtinCatalogueMachines, machineryDoctor } = await import('../api/_machinery.js');
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
  // The other side of the rule: when the database answers with rows, those are
  // the pages the site renders, so those are the only ones advertised.
  {
    const db = memDb([machine()]);
    const r = await fetchSitemap(db);
    ok(r.headers['x-machinery-source'] === 'database', 'a readable database names itself as the source');
    ok(!r.headers['x-machinery-storage'], 'with no storage problem to report');
    const urls = locs(r.body);
    ok(urls.some(u => u.endsWith('/machinery/excavators/AR7-MC-001')), 'the stored machine is advertised');
    ok(!urls.some(u => u.includes('AR7-MC-002')),
      'and a built-in catalogue row the database did not return is NOT advertised');
  }
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
say('\n-- an empty database: the site is showing the built-in catalogue --');
{
  // hydrateMachines() keeps the built-in catalogue when a response is empty, so
  // the machinery pages are live. This sitemap must advertise them rather than
  // serve an empty urlset that tells a crawler the section does not exist.
  const r = await fetchSitemap(memDb([]));
  ok(r.status === 200, 'an empty database still answers 200');
  ok(r.headers['x-machinery-source'] === 'bundled-catalogue',
    `and names the source the site is serving (${r.headers['x-machinery-source']})`);
  ok(r.body.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'),
    'the body is still a valid urlset');
  const urls = locs(r.body);
  ok(urls.length === 16,
    `the built-in catalogue is advertised: 4 type pages + 12 machines (${urls.length} URL(s))`);
  ok(urls.includes('https://ar7traders.com/machinery/excavators/AR7-MC-001'),
    'including the machine pages themselves');
  ok(urls.every(u => u.startsWith('https://ar7traders.com/')), 'all on the canonical domain');
  ok(urls.every(u => !u.includes('www.')), 'never www.');
  ok(urls.every(u => parseRoute(new URL(u).pathname) !== null),
    'every advertised URL is a route the SPA resolves');
  ok(r.headers['cache-control'].includes('max-age=60'),
    `and it caches only briefly, so the real rows appear as soon as the migration runs (${r.headers['cache-control']})`);
}

// ---------------------------------------------------------------------------
say('\n-- the storage failure production is in right now --');
{
  // The exact production answer: public.machinery does not exist. Used to be an
  // anonymous 503 that Search Console reported on a sitemap robots.txt declares,
  // while the site happily served the built-in catalogue at every one of those
  // URLs.
  // PostgREST's real shape: code PGRST205 + the message production returns.
  const error = { message: "Could not find the table 'public.machinery' in the schema cache", code: 'PGRST205' };
  const r = await fetchSitemap(memDb([], { error }));
  ok(r.status === 200, `a missing table no longer makes the sitemap unfetchable (got ${r.status})`);
  ok(!r.body.includes('<urlset') === false, 'and it still emits a real urlset');
  ok(r.headers['x-machinery-source'] === 'bundled-catalogue', 'naming the built-in catalogue as the source');
  ok(r.headers['x-machinery-storage'] === 'missing-table', 'and reporting the storage state it failed with');
  ok(locs(r.body).length === 16, 'with the pages the website is actually serving');

  // Any read failure behaves the same way: the site keeps the built-in
  // catalogue, so the sitemap does too.
  const transient = await fetchSitemap(memDb([], { error: 'connection refused' }));
  ok(transient.status === 200 && transient.headers['x-machinery-source'] === 'bundled-catalogue',
    'a transient read failure degrades the same way, like the client does');
  ok(transient.headers['x-machinery-storage'] === 'unknown',
    `and reports the state the classifier gave it (${transient.headers['x-machinery-storage']})`);
  ok(!transient.body.includes('<urlset') === false, 'never 200 with broken XML');

  const post = fakeRes();
  await api(req('POST', { sitemap: 'machinery' }), post, { db: memDb([]) });
  ok(post.statusCode === 405 && post.headers.allow === 'GET',
    `a POST is refused with Allow: GET (got ${post.statusCode})`);
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

// ---------------------------------------------------------------------------
say('\n-- the dynamic fallback and the static sitemap agree --');
{
  // public/sitemap.xml already lists the built-in catalogue's machinery URLs —
  // it is generated from the same MACHINES export (scripts/seo-agent.mjs). Two
  // documents that describe one catalogue must not disagree: a crawler that
  // reads both would otherwise see the section twice with different members.
  const staticXml = readFileSync(new URL('../public/sitemap.xml', import.meta.url), 'utf8');
  const r = await fetchSitemap(memDb([]));
  const dynamic = locs(r.body);
  const missingFromStatic = dynamic.filter(u => !staticXml.includes(`<loc>${u}</loc>`));
  ok(missingFromStatic.length === 0,
    `every URL the fallback advertises is already in public/sitemap.xml${missingFromStatic.length ? ' — missing ' + missingFromStatic.slice(0, 3).join(', ') : ''}`);

  // And the static sitemap's machinery machine pages must all be real routes —
  // the same rule the dynamic one is held to.
  const staticMachinery = [...staticXml.matchAll(/<loc>https:\/\/ar7traders\.com(\/machinery[^<]*)<\/loc>/g)]
    .map(m => m[1]).filter(p => p.split('/').length === 4);
  ok(staticMachinery.length === 12, `public/sitemap.xml lists the 12 built-in machine pages (${staticMachinery.length})`);
  ok(staticMachinery.every(p => parseRoute(p) !== null), 'and every one resolves in the SPA router');
  const orphaned = staticMachinery.filter(p => !dynamic.includes('https://ar7traders.com' + p));
  ok(orphaned.length === 0,
    `and the dynamic sitemap advertises every one of them while it is serving the fallback${orphaned.length ? ' — ' + orphaned.slice(0, 3).join(', ') : ''}`);
}

// ---------------------------------------------------------------------------
say('\n-- both responses are well-formed XML, not just well-shaped strings --');
{
  // A regex over <loc> happily matches a document no crawler can parse. jsdom's
  // XML parser is the honest check: one urlset element, the sitemaps.org
  // namespace, and exactly one <loc> per <url>.
  const { JSDOM } = await import('jsdom');
  const parse = xml => new JSDOM(xml, { contentType: 'text/xml' }).window.document;

  for (const [label, r] of [
    ['database rows', await fetchSitemap(memDb([machine()]))],
    ['the built-in catalogue', await fetchSitemap(memDb([]))]
  ]) {
    const doc = parse(r.body);
    ok(doc.querySelector('parsererror') === null, `${label}: parses as XML with no error`);
    const root = doc.documentElement;
    ok(root.tagName === 'urlset', `${label}: the root element is urlset (${root.tagName})`);
    ok(root.namespaceURI === 'http://www.sitemaps.org/schemas/sitemap/0.9',
      `${label}: in the sitemaps.org namespace`);
    const urls = [...doc.getElementsByTagName('url')];
    ok(urls.length === locs(r.body).length,
      `${label}: ${urls.length} <url> element(s), one per <loc>`);
    const locsPerUrl = urls.map(u => u.getElementsByTagName('loc').length);
    ok(locsPerUrl.every(n => n === 1), `${label}: every <url> carries exactly one <loc>`);
    const emptyLoc = urls.filter(u => !(u.getElementsByTagName('loc')[0]?.textContent || '').trim());
    ok(emptyLoc.length === 0, `${label}: no empty <loc>`);
    ok(urls.every(u => {
      const raw = u.getElementsByTagName('loc')[0].textContent;
      return raw.startsWith('https://') && !/\s/.test(raw) && parseRoute(new URL(raw).pathname) !== null;
    }), `${label}: every loc is an absolute, whitespace-free, resolvable URL`);
  }
}

// ---------------------------------------------------------------------------
say('\n-- the doctor and the sitemap describe the same catalogue --');
{
  // Two answers to "what is the public site showing?": the CRM's doctor names
  // the source, and this sitemap advertises the pages. If they ever disagree,
  // the owner is told something the crawler is not.
  const fallback = builtinCatalogueMachines();
  ok(fallback.length === 12, `the built-in catalogue has 12 addressable machines (${fallback.length})`);
  ok(fallback.every(m => m.type && m.ref && m.published === true),
    'each one carries the type, the public reference and a published flag');
  ok(new Set(fallback.map(m => m.ref)).size === fallback.length, 'and the references are unique');
  ok(fallback.every(m => parseRoute('/machinery/' + m.type.toLowerCase() + '/' + m.ref) !== null),
    'every built-in machine resolves to a route');

  // The sitemap's fallback must be exactly this list.
  const r = await fetchSitemap(memDb([], { error: { message: 'boom', code: 'XX000' } }));
  const advertised = new Set(locs(r.body));
  const missing = fallback.filter(m => !advertised.has('https://ar7traders.com/machinery/' + m.type.toLowerCase() + '/' + m.ref));
  ok(missing.length === 0,
    `the sitemap advertises every machine the doctor says is on the site${missing.length ? ' — missing ' + missing.map(m => m.ref).join(', ') : ''}`);

  // And the doctor's own words for a missing table.
  const report = await machineryDoctor({
    from() {
      const q = { select: () => q, limit: () => q, order: () => q, eq: () => q, range: () => q,
        then: resolve => resolve({ data: null, error: { message: "Could not find the table 'public.machinery' in the schema cache", code: 'PGRST205' } }) };
      return q;
    }
  });
  ok(report.storage.state === 'missing-table', 'the doctor names the missing table');
  ok(/built-in/i.test(report.catalogue.publicSource), `and says the public catalogue is the built-in one (${report.catalogue.publicSource})`);
  ok(report.catalogue.fallback === fallback.length,
    'counting exactly the machines this sitemap advertises');
}

say(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
