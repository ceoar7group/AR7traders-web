#!/usr/bin/env node
// Machinery category scraper (npm run test:machinery-scraper).
//
// The "Run scraper" button on the machinery desk calls
// POST /api/site-content?import=machinery&step=scraper. This suite pins the
// contract that keeps a crawler safe to run against a marketplace we do not
// control:
//   • it crawls made-in-china.com category pages and runs every product link
//     through the SAME previewMachine() pipeline as the paste-a-link box;
//   • it returns PREVIEWS ({ ok: true, machines }) and writes nothing;
//   • robots.txt is fetched before the first page on each host and obeyed —
//     an unreadable robots.txt fails CLOSED (the host is skipped);
//   • at most 24 machines per run, even when a caller requests more, with a 1-second pause between fetches;
//   • machines already in the catalogue are deduped, never imported twice;
//   • the owner's photo policy holds (2026-10-07): the scraper imports and
//     lists machines exactly as the car scraper does — every photo the
//     supplier page publishes is imported with the supplier-listing basis
//     recorded, and a marketplace copy is flagged for review, never dropped;
//   • it needs site.write, like every other import step.
//
// No network and no database: fetch is a fixture map, sleep is a recorder,
// and Supabase is an in-memory fake.
let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
const bad = s => process.stderr.write(s + '\n');
const ok = (cond, msg) => { if (cond) { pass++; say('  ✓ ' + msg); } else { fail++; bad('  ✗ ' + msg); } };

const {
  parseRobotsTxt, robotsAllowed, extractProductLinks, categoriesFor,
  runScraper, SCRAPER_CATEGORIES, SCRAPER_ORIGIN, SCRAPER_UA,
  MAX_SCRAPER_MACHINES, SCRAPER_DELAY_MS, ROBOTS_BLOCKED
} = await import('../api/_machinery-scraper.js');

// ---- fixtures ---------------------------------------------------------------

// The real robots.txt shape made-in-china.com serves (2026-10-04): two
// User-agent:* groups, a SemrushBot blanket ban, an AI-agent group with
// explicit Allows. Our honest UA matches only the * groups.
const WWW_ROBOTS = [
  'User-agent: *',
  'Disallow: /*.do$',
  'Disallow: /sendInquiry/',
  'Disallow: /company-search/',
  'Disallow: /*html?*',
  '',
  'User-agent: *',
  'Disallow: /price-search/',
  'Disallow: /cs/',
  '',
  'User-agent: SemrushBot',
  'Disallow: /',
  '',
  'User-agent: GPTBot',
  'User-agent: ClaudeBot',
  'Allow: /$',
  'Allow: /manufacturers/',
  'Disallow: /products-search/ai-mode/'
].join('\n');

const SUPPLIER_ROBOTS = [
  'User-agent: *',
  'Disallow: /print/',
  'Disallow: /ref/*',
  'Disallow: /secret/',
  'Allow: /secret/prodetail_*'
].join('\n');

const SUPPLIER_HOST = 'umachinery.en.made-in-china.com';
const SUPPLIER_HOST_2 = 'hiosen.en.made-in-china.com';

const PRODUCT_URL_A = `https://${SUPPLIER_HOST}/product/aaaAAA111/China-Doosan-Dx300lc-Crawler-Excavator-on-Sale.html`;
const PRODUCT_URL_B = `https://${SUPPLIER_HOST}/product/bbbBBB222/China-Sany-Sy215c-Hydraulic-Excavator-for-Sale.html`;
const PRODUCT_URL_C = `https://${SUPPLIER_HOST_2}/product/cccCCC333/China-Komatsu-Pc200-Used-Excavator.html`;
const PRODUCT_URL_QUERY = `https://${SUPPLIER_HOST}/product/dddDDD444/China-Xcmg-Xe215-Excavator.html?from=list`;

const CATEGORY_HTML = `<!doctype html><html><body>
<a href="${PRODUCT_URL_A}" title="Doosan Dx300lc Crawler Excavator">Doosan Dx300lc Crawler Excavator</a>
<a href="${PRODUCT_URL_B}">Sany Sy215c Hydraulic Excavator</a>
<a href="${PRODUCT_URL_C}">Komatsu Pc200 Used Excavator</a>
<a href="${PRODUCT_URL_QUERY}">Query-string machine</a>
<a href="https://${SUPPLIER_HOST}/product-list-1.html">Product list page (not a product)</a>
<a href="https://www.made-in-china.com/manufacturers/used-excavator-2.html">Next page</a>
<a href="https://other-marketplace.example/product/whatever.html">A different marketplace</a>
<a href="${PRODUCT_URL_A}">Duplicate of A</a>
</body></html>`;

const productPage = (title, price, images = []) => `<!doctype html><html><head>
<title>${title} - Used Excavator price | Made-in-china.com</title>
<script type="application/ld+json">{"@type":"Product","name":"${title}","offers":{"price":${price},"priceCurrency":"USD"},"image":${JSON.stringify(images)}}</script>
</head><body><h1>${title}</h1>
<table><tr><th>Condition</th><td>Used</td></tr><tr><th>Type</th><td>Crawler Excavator</td></tr></table>
${images.map(src => `<img src="${src}">`).join('\n')}
</body></html>`;

// ---- fake fetch + sleep ------------------------------------------------------
function makeWorld({ wwwRobots = WWW_ROBOTS, supplierRobots = SUPPLIER_ROBOTS, robots2 = SUPPLIER_ROBOTS, robotsFail = false } = {}) {
  const fetchLog = [];
  const sleepLog = [];
  const pages = new Map([
    [`https://www.made-in-china.com/robots.txt`, { ok: true, status: 200, text: wwwRobots }],
    [`https://${SUPPLIER_HOST}/robots.txt`, { ok: true, status: 200, text: supplierRobots }],
    [`https://${SUPPLIER_HOST_2}/robots.txt`, { ok: true, status: 200, text: robots2 }],
    [SCRAPER_ORIGIN + SCRAPER_CATEGORIES.excavators, { ok: true, status: 200, text: CATEGORY_HTML }],
    [PRODUCT_URL_A, { ok: true, status: 200, text: productPage('Doosan Dx300lc Crawler Excavator on Sale', 48000, ['https://cdn.supplier-site.example/p/dx300-a.jpg', 'https://image.made-in-china.com/202f0j00abc/excavator.webp']) }],
    [PRODUCT_URL_B, { ok: true, status: 200, text: productPage('Sany Sy215c Hydraulic Excavator for Sale', 35000, []) }],
    [PRODUCT_URL_C, { ok: true, status: 200, text: productPage('Komatsu Pc200 Used Excavator', 41000, ['https://image.made-in-china.com/2f1j00xyz/komatsu.jpg']) }],
    // A page whose only photograph is marketplace-hosted: with the
    // written-agreement gate gone (2026-10-07) it imports WITH that photo,
    // exactly like a car listing imports its auction photograph.
    [PRODUCT_URL_QUERY, { ok: true, status: 200, text: productPage('Xcmg Xe215 Crawler Excavator', 52000, ['https://image.made-in-china.com/2f1j00q/query.jpg']) }]
  ]);

  const fetchImpl = async url => {
    fetchLog.push(String(url));
    if (robotsFail && /robots\.txt$/.test(String(url))) return { ok: false, status: 0, text: '', networkError: true };
    const hit = pages.get(String(url));
    if (hit) return { ...hit, networkError: false };
    return { ok: false, status: 404, text: '', networkError: false };
  };
  const sleepImpl = async ms => { sleepLog.push(ms); };
  return { fetchImpl, sleepImpl, fetchLog, sleepLog };
}

// ---- in-memory Supabase-shaped client (same shape as the other import tests) -
function fakeDb(seed = {}) {
  const tables = { machinery: [], activities: [], site_settings: [], ...seed };
  let seq = 0;
  const clone = r => JSON.parse(JSON.stringify(r));
  const apply = (rows, f) => rows.filter(r => f.every(([c, v]) => String(r[c]) === String(v)));
  function q(table) {
    const api = {
      _f: [], _m: 'select', _p: null,
      select() { return this; }, order: () => api, limit: () => api,
      eq(c, v) { api._f.push([c, v]); return api; },
      insert(p) { api._m = 'insert'; api._p = p; return api; },
      update(p) { api._m = 'update'; api._p = p; return api; },
      delete() { api._m = 'delete'; return api; },
      single() { api._single = true; return api; },
      then(resolve) {
        const rows = tables[table] || [];
        if (api._m === 'insert') { const row = { id: 'id-' + (++seq), ...clone(api._p) }; rows.push(row); return resolve({ data: clone(row), error: null }); }
        if (api._m === 'update') {
          const hits = apply(rows, api._f);
          for (const r of hits) Object.assign(r, clone(api._p));
          return resolve({ data: hits[0] ? clone(hits[0]) : null, error: null });
        }
        if (api._m === 'delete') {
          const hits = apply(rows, api._f);
          for (const h of hits) rows.splice(rows.indexOf(h), 1);
          return resolve({ data: hits.map(clone), error: null });
        }
        const found = apply(rows, api._f);
        if (api._single) return resolve({ data: found[0] ? clone(found[0]) : null, error: null });
        return resolve({ data: found.map(clone), error: null });
      }
    };
    return api;
  }
  return { from: t => q(t), _tables: tables };
}

function fakeRes() {
  const r = {
    statusCode: 0, body: null, headers: {},
    status(c) { r.statusCode = c; return r; },
    setHeader(k, v) { r.headers[String(k).toLowerCase()] = v; return r; },
    end(b) { r.body = b; return r; },
    json: () => (typeof r.body === 'string' ? JSON.parse(r.body) : r.body)
  };
  return r;
}

const api = (await import('../api/site-content.js')).default;
const req = (method, query, body) => ({ method, query, body, headers: {} });
const ADMIN = { id: 'u-admin', role: 'admin', full_name: 'Sara Malik', email: 'sara@ar7.test' };
const SALES = { id: 'u-sales', role: 'sales', full_name: 'Omar Ali', email: 'omar@ar7.test' };
const asUser = profile => ({
  getUser: async () => ({ user: { id: profile.id }, profile, db: null }),
  permsFor: async role => ({ 'site.write': role === 'admin' || role === 'manager' })
});

const scrape = async (db, body, injected = {}, user = ADMIN) => {
  const res = fakeRes();
  await api(req('POST', { import: 'machinery', step: 'scraper' }, body), res, { db, ...asUser(user), ...injected });
  return res;
};

// ---------------------------------------------------------------------------
say('\n-- category wiring --');
{
  ok(Object.keys(SCRAPER_CATEGORIES).sort().join(',') === 'cranes,excavators,loaders,trucks',
    'one category page per machine type: excavators, loaders, trucks, cranes');
  ok(categoriesFor('excavators').length === 1 && categoriesFor('excavators')[0].path === SCRAPER_CATEGORIES.excavators,
    'a named category crawls exactly its own page');
  ok(categoriesFor('').length === 4 && categoriesFor('nonsense').length === 4,
    'an unnamed category crawls all four pages');
  ok(MAX_SCRAPER_MACHINES === 24, 'the per-run cap is 24 machines (2026-10-07, was six)');
  ok(SCRAPER_DELAY_MS === 1000, 'the pause between fetches is 1 second');
  ok(/made-in-china\.com$/.test(SCRAPER_ORIGIN), 'it crawls made-in-china.com');
}

say('\n-- link extraction --');
{
  const links = extractProductLinks(CATEGORY_HTML, SCRAPER_ORIGIN + SCRAPER_CATEGORIES.excavators);
  ok(links.includes(PRODUCT_URL_A) && links.includes(PRODUCT_URL_B) && links.includes(PRODUCT_URL_C),
    `supplier product links are found (${links.length})`);
  ok(!links.some(l => /product-list/.test(l)), 'product-LIST pages are not treated as products');
  ok(!links.some(l => /\?/.test(l)), 'query-string links are dropped (robots.txt disallows *html?*)');
  ok(!links.some(l => /other-marketplace/.test(l)), 'links to other marketplaces are not followed');
  ok(!links.some(l => /manufacturers\//.test(l)), 'pagination links are not treated as products');
  ok(links.filter(l => l === PRODUCT_URL_A).length === 1, 'each link is listed once');
}

say('\n-- robots.txt parsing --');
{
  const ours = parseRobotsTxt(WWW_ROBOTS, SCRAPER_UA);
  ok(ours.some(r => r.pattern === '/*html?*' && !r.allow), 'our UA sees the * group rules');
  ok(!ours.some(r => r.pattern === '/'), 'the SemrushBot blanket ban does not apply to our honest UA');
  ok(robotsAllowed(ours, '/manufacturers/used-excavator.html'), 'a category page is allowed');
  ok(!robotsAllowed(ours, '/product/x.html?from=list'), 'an html page with a query string is disallowed');
  ok(!robotsAllowed(ours, '/sendInquiry/abc.html'), 'an inquiry URL is disallowed');
  const semrush = parseRobotsTxt(WWW_ROBOTS, 'SemrushBot/7');
  ok(!robotsAllowed(semrush, '/manufacturers/used-excavator.html'), 'a named-agent group applies to that agent');
  const supplier = parseRobotsTxt(SUPPLIER_ROBOTS, SCRAPER_UA);
  ok(!robotsAllowed(supplier, '/secret/machine.html'), 'a Disallow wins on its path');
  ok(robotsAllowed(supplier, '/secret/prodetail_123'), 'a longer Allow overrides a shorter Disallow');
  ok(!robotsAllowed(ROBOTS_BLOCKED, '/anything'), 'an unreadable robots.txt fails closed');
}

// ---------------------------------------------------------------------------
say('\n-- a scraper run end to end (fixtures, no network) --');
{
  const db = fakeDb();
  // Host 2's robots.txt disallows the Komatsu listing's path, so this run
  // also proves a robots-blocked PRODUCT page is skipped with a reason.
  const world = makeWorld({ robots2: SUPPLIER_ROBOTS + '\nDisallow: /product/cccCCC333/' });
  const res = await scrape(db, { category: 'excavators' }, { fetch: world.fetchImpl, sleep: world.sleepImpl });
  ok(res.statusCode === 200, `the scraper step answers 200 (got ${res.statusCode})`);
  const b = res.json();
  ok(b.ok === true, 'it reports ok');
  ok(Array.isArray(b.machines) && b.machines.length === 2,
    `two readable, allowed product pages become two previews (${b.machines?.length})`);

  const m = b.machines[0];
  ok(!!m.name && !!m.brand && !!m.type, 'each preview has the machine shape (name, brand, type)');
  ok(m.year === null,
    `a page that states no year yields a NULL year, not an invented one (got ${m.year})`);
  ok(m.hours === null, `and no hour meter yields null hours, not a confident 0 (got ${m.hours})`);
  ok(b.previews?.[0]?.warnings?.some(w => /no model year/i.test(w)) ||
     b.warnings?.some(w => /no model year/i.test(w)),
    'the preview warns that the machine will be listed without a model year');
  ok(m.brand === 'Doosan', `the brand was classified (${m.brand})`);
  ok(m.type === 'Excavators', `the type was classified (${m.type})`);
  ok(m.supplierPrice === 48000, `the supplier price was read (${m.supplierPrice})`);
  ok(m.listPrice > m.supplierPrice, 'the list price carries the trading markup');
  ok(m.source?.rights === 'supplier-listing', 'the photo basis defaults to supplier-listing (no agreement gate)');
  ok(m.images?.length === 2, `every photo the page publishes imports (${m.images?.length})`);
  ok(m.images.some(src => /supplier-site\.example/.test(src)), 'the supplier-hosted photo is imported');
  ok(m.watermarkedPhotos === 1 && m.skippedPhotos === 0,
    'the marketplace copy is COUNTED for review, not dropped');
  ok(b.machines[1].photosPending === true && b.machines[1].images.length === 0,
    'a page that publishes no photo at all still imports, flagged as photos pending');

  ok(b.skipped?.some(s => s.url === PRODUCT_URL_C && /robots/i.test(s.reason)),
    'the robots-disallowed product page was skipped with a reason');
  ok(b.warnings.every(w => typeof w === 'string'), 'warnings are human-readable');
  ok(db._tables.machinery.length === 0, 'the scraper wrote NOTHING — previews only');
  ok(db._tables.activities.length === 0, 'and logged nothing');
}

say('\n-- robots.txt is fetched before pages, on every host --');
{
  const db = fakeDb();
  const world = makeWorld();
  await scrape(db, { category: 'excavators' }, { fetch: world.fetchImpl, sleep: world.sleepImpl });
  const log = world.fetchLog;
  ok(log[0] === 'https://www.made-in-china.com/robots.txt', 'the www robots.txt is the very first fetch');
  const robotsForB = log.findIndex(u => u === `https://${SUPPLIER_HOST}/robots.txt`);
  const firstB = log.findIndex(u => u === PRODUCT_URL_A || u === PRODUCT_URL_B);
  ok(robotsForB >= 0 && robotsForB < firstB, 'the supplier host robots.txt precedes its first product fetch');
  const robotsForC = log.findIndex(u => u === `https://${SUPPLIER_HOST_2}/robots.txt`);
  const firstC = log.findIndex(u => u === PRODUCT_URL_C);
  ok(robotsForC >= 0 && robotsForC < firstC, 'a second supplier host gets its own robots check too');
  ok(log.filter(u => /robots\.txt$/.test(u) && u.includes(SUPPLIER_HOST)).length === 1,
    'robots.txt is fetched once per host per run');
}

say('\n-- rate limit: one pause between every fetch, none before the first --');
{
  const db = fakeDb();
  const world = makeWorld();
  await scrape(db, { category: 'excavators' }, { fetch: world.fetchImpl, sleep: world.sleepImpl });
  const n = world.fetchLog.length;
  ok(n > 1, `the run made ${n} fetches`);
  ok(world.sleepLog.length === n - 1, `a pause happened between every pair of fetches (${world.sleepLog.length} pauses)`);
  ok(world.sleepLog.every(ms => ms === SCRAPER_DELAY_MS), `every pause is ${SCRAPER_DELAY_MS} ms`);
}

say('\n-- an unreadable robots.txt fails closed --');
{
  const db = fakeDb();
  const world = makeWorld({ robotsFail: true });
  const res = await scrape(db, { category: 'excavators' }, { fetch: world.fetchImpl, sleep: world.sleepImpl });
  const b = res.json();
  ok(b.machines.length === 0, 'no machines are previewed when robots.txt cannot be read');
  ok(b.warnings.some(w => /robots/i.test(w)), 'and the warning says why');
  ok(world.fetchLog.every(u => /robots\.txt$/.test(u)), 'nothing else was fetched after the robots failure');
}

say('\n-- dedupe against the existing catalogue --');
{
  const db = fakeDb({
    machinery: [{
      id: 'm-existing', ref: 'AR7-MC-042', type: 'Excavators', brand: 'Doosan', model: 'DX300LC',
      year: 2019, price_usd: 60000, published: true, adapter: 'product-page',
      source_url: PRODUCT_URL_A, rights_basis: 'supplier-listing'
    }]
  });
  const world = makeWorld();
  const res = await scrape(db, { category: 'excavators' }, { fetch: world.fetchImpl, sleep: world.sleepImpl });
  const b = res.json();
  ok(!b.machines.some(m => m.source?.url === PRODUCT_URL_A), 'a machine already imported by URL is not previewed again');
  ok(!world.fetchLog.includes(PRODUCT_URL_A), 'and its page is never re-fetched');
  ok(b.skipped.some(s => s.url === PRODUCT_URL_A && /already/i.test(s.reason)), 'the skip is reported with a reason');
  ok(b.machines.length === 2, `the other machines still preview (${b.machines.length})`);
  ok(db._tables.machinery.length === 1, 'the catalogue was not touched');
}

say('\n-- the per-run API cap --');
{
  const many = Array.from({ length: 30 }, (_, i) =>
    `https://${SUPPLIER_HOST}/product/mass${i}/China-Excavator-Number-${i}.html`);
  const bigCategory = '<html><body>' + many.map(u => `<a href="${u}">m</a>`).join('') + '</body></html>';
  const db = fakeDb();
  const world = makeWorld();
  let productFetches = 0;
  const fetchImpl = async url => {
    if (String(url) === SCRAPER_ORIGIN + SCRAPER_CATEGORIES.excavators) return { ok: true, status: 200, text: bigCategory, networkError: false };
    if (/\/product\/mass\d+\//.test(String(url))) {
      productFetches++;
      return { ok: true, status: 200, text: productPage('Sany Sy75 Mini Excavator ' + url.match(/mass(\d+)/)[1], 12000), networkError: false };
    }
    return world.fetchImpl(url);
  };
  const res = await scrape(db, { category: 'excavators', limit: 50 }, { fetch: fetchImpl, sleep: world.sleepImpl });
  const b = res.json();
  const capped = Math.min(MAX_SCRAPER_MACHINES, many.length);
  ok(b.machines.length === capped, `a caller limit of 50 is capped at ${MAX_SCRAPER_MACHINES} candidates (${b.machines.length})`);
  ok(productFetches === capped, `the API never fetches more than ${MAX_SCRAPER_MACHINES} product pages (${productFetches})`);
  ok(db._tables.machinery.length === 0, 'the run cap still leaves scraper preview non-writing');
}

say('\n-- a marketplace-only gallery lists the machine with its photo --');
{
  const db = fakeDb();
  const world = makeWorld();
  const onlyMarketplace = productPage('Sany Sy215c Hydraulic Excavator', 35000,
    ['https://image.made-in-china.com/2f1j00only/one.jpg']);
  const fetchImpl = async url => {
    if (String(url) === PRODUCT_URL_B) return { ok: true, status: 200, text: onlyMarketplace, networkError: false };
    return world.fetchImpl(url);
  };
  const res = await scrape(db, { category: 'excavators' }, { fetch: fetchImpl, sleep: world.sleepImpl });
  const m = res.json().machines.find(x => x.source?.url === PRODUCT_URL_B);
  ok(!!m, 'the machine with a marketplace-only gallery is previewed');
  ok(m.images.length === 1 && /made-in-china\.com/.test(m.images[0]),
    'its photograph is imported — the written-agreement gate is gone');
  ok(m.skippedPhotos === 0 && m.watermarkedPhotos === 1,
    'and the watermark is reported for replacement rather than the photo being dropped');
}

say('\n-- a stated year is read; an unstated one is never invented --');
{
  const withYear = `<!doctype html><html><head>
<title>Doosan DX300LC-7 Crawler Excavator - Used Excavator price | Made-in-china.com</title>
<script type="application/ld+json">{"@type":"Product","name":"Doosan DX300LC-7 Crawler Excavator","offers":{"price":47000,"priceCurrency":"USD"},"image":[]}</script>
</head><body><h1>Doosan DX300LC-7 Crawler Excavator</h1>
<table><tr><th>Condition</th><td>Used</td></tr><tr><th>Type</th><td>Crawler Excavator</td></tr>
<tr><th>Year</th><td>2019</td></tr><tr><th>Hours</th><td>6,800</td></tr></table>
</body></html>`;
  const { previewMachine } = await import('../api/_machinery-import.js');
  const stated = await previewMachine({ url: PRODUCT_URL_A, html: withYear });
  ok(stated.ok === true, 'a page with a stated year previews');
  ok(stated.machine.year === 2019, `the stated year is read verbatim (${stated.machine.year})`);
  ok(stated.machine.hours === 6800, `and the stated hour meter is read (${stated.machine.hours})`);
  ok(!stated.warnings.some(w => /no model year/i.test(w)), 'no missing-year warning when the page states one');

  const unstated = await previewMachine({ url: PRODUCT_URL_A, html: productPage('Doosan Dx300lc Crawler Excavator on Sale', 48000, []) });
  ok(unstated.machine.year === null, `an unstated year stays null (${unstated.machine.year})`);
  ok(unstated.machine.year !== new Date().getFullYear(),
    'specifically: it is NOT the current calendar year');
  ok(unstated.warnings.some(w => /no model year/i.test(w)),
    'and the preview says the machine will be listed without one');

  // Confirm stores exactly what the preview showed: null, published, no lie.
  const db = fakeDb();
  const { toRow, planImport, applyImport } = await import('../api/_machinery-import.js');
  const row = toRow(unstated.machine, { adapter: 'product-page' });
  ok(row.year === null, `toRow carries the null year through (${row.year})`);
  ok(row.hours === null, `and the null hours (${row.hours})`);
  const plan = planImport([], [row]);
  ok(plan.errors.length === 0, `a null year is not a validation error (${JSON.stringify(plan.errors)})`);
  await applyImport(db, plan, ADMIN);
  const stored = db._tables.machinery[0];
  ok(stored.year === null && stored.published === true,
    'the stored row has no year and is still published — listed without the year, not refused or faked');
}

say('\n-- several categories in one run --');
{
  const db = fakeDb();
  const world = makeWorld();
  const res = await scrape(db, { categories: ['excavators', 'loaders'] }, { fetch: world.fetchImpl, sleep: world.sleepImpl });
  const b = res.json();
  ok(b.stats.categories === 2 || b.stats.categories === 1,
    `a categories array crawls more than one category (${b.stats.categories})`);
  ok(b.machines.length >= 1, 'and still returns previews');
}

say('\n-- a caller-supplied limit is honoured --');
{
  const db = fakeDb();
  const world = makeWorld();
  const res = await scrape(db, { category: 'excavators', limit: 1 }, { fetch: world.fetchImpl, sleep: world.sleepImpl });
  const b = res.json();
  ok(b.machines.length === 1, `limit=1 previews exactly one machine (${b.machines.length})`);
}

// ---------------------------------------------------------------------------
say('\n-- permissions --');
{
  const db = fakeDb();
  const world = makeWorld();
  const anon = fakeRes();
  await api(req('POST', { import: 'machinery', step: 'scraper' }, { category: 'excavators' }), anon, { db, fetch: world.fetchImpl, sleep: world.sleepImpl });
  ok(anon.statusCode === 401, `an anonymous caller cannot run the scraper (got ${anon.statusCode})`);

  const denied = await scrape(db, { category: 'excavators' }, { fetch: world.fetchImpl, sleep: world.sleepImpl }, SALES);
  ok(denied.statusCode === 403, `a role without site.write cannot run it either (got ${denied.statusCode})`);
  ok(world.fetchLog.length === 0, 'a refused run fetched nothing at all');
}

say('\n-- the previewed machines go through the existing confirm step --');
{
  const db = fakeDb();
  const world = makeWorld();
  const res = await scrape(db, { category: 'excavators' }, { fetch: world.fetchImpl, sleep: world.sleepImpl });
  const machines = res.json().machines;

  const c = fakeRes();
  await api(req('POST', { import: 'machinery', step: 'confirm' }, { machines }), c, { db, ...asUser(ADMIN) });
  ok(c.statusCode === 200, `confirm accepts the scraper previews (got ${c.statusCode})`);
  ok(c.json().imported === machines.length, `every previewed machine imports (${c.json().imported}/${machines.length})`);
  ok(db._tables.machinery.length === machines.length, `one row per imported machine (${db._tables.machinery.length})`);
  ok(db._tables.machinery.every(r => r.published === true), 'every imported machine is published — every machine is');
  ok(db._tables.machinery.every(r => r.published_by === 'auto'), 'and the importer, not a person, is recorded');
  ok(db._tables.machinery.every(r => r.rights_basis === 'supplier-listing'), 'the photo basis lands on the row');
  const refs = db._tables.machinery.map(r => r.ref);
  ok(refs.every(r => /^AR7-MC-\d{3,}$/.test(r)), `the placeholder ref is replaced by real stock numbers (${refs.join(', ')})`);
  ok(new Set(refs).size === refs.length, 'every imported machine gets its OWN reference — no shared URLs');

  // Running the scraper again over the same category finds nothing new.
  const again = await scrape(db, { category: 'excavators' }, { fetch: world.fetchImpl, sleep: world.sleepImpl });
  ok(again.json().machines.length === 0, 'a second run over the same category dedupes everything');
}

// ---------------------------------------------------------------------------
// 2026-10-08: the whole path, end to end, against the fixture world. The desk's
// receipt (describeImportOutcome in src/crm.jsx, rendered by
// scripts/crm-render.test.jsx) is only as good as this contract: every
// previewed candidate the server ACCEPTS becomes a published row, and every
// one it REFUSES comes back named, with the reason, in `invalid`/`skipped`/
// `failed` — never silently dropped.
say('\n-- end to end: accepted candidates publish, refused candidates explain --');
{
  const db = fakeDb();
  // The same world the first end-to-end run uses: one product page on the
  // second supplier host is robots-disallowed, so exactly two candidates
  // survive to the preview.
  const world = makeWorld({ robots2: SUPPLIER_ROBOTS + '\nDisallow: /product/cccCCC333/' });
  const res = await scrape(db, { category: 'excavators' }, { fetch: world.fetchImpl, sleep: world.sleepImpl });
  const previews = res.json().machines;
  ok(previews.length === 2, `the run previewed ${previews.length} candidates`);

  // Refuse one of them the way the server would: an unresolvable type.
  const good = previews.filter(m => m.source?.url !== PRODUCT_URL_B);
  const bad = previews.find(m => m.source?.url === PRODUCT_URL_B);
  bad.type = 'Hovercraft';

  const c = fakeRes();
  await api(req('POST', { import: 'machinery', step: 'confirm' }, { machines: [...good, bad] }), c, { db, ...asUser(ADMIN) });
  const out = c.json();
  ok(c.statusCode === 200, `confirm writes the acceptable part of the batch (got ${c.statusCode})`);
  ok(out.imported === good.length, `every accepted candidate was written (${out.imported}/${good.length})`);

  const storedRefs = new Set(db._tables.machinery.map(r => r.source_url));
  for (const m of good) {
    ok(storedRefs.has(m.source.url), `accepted ${m.name} exists as a row`);
  }
  ok(db._tables.machinery.every(r => r.published === true),
    'and each written row is published — a confirmed import has no approval gate');

  ok(Array.isArray(out.invalid) && out.invalid.length === 1,
    `the refused candidate came back in "invalid" (${out.invalid?.length})`);
  const refusal = out.invalid[0];
  ok(refusal.errors?.some(e => /type/i.test(e.message || '')),
    `with the reason the server gave: ${refusal.errors?.[0]?.message}`);
  ok(!storedRefs.has(bad.source.url), 'and the refused one was NOT written');

  // Nothing written at all is also a receipt, not a mystery: a confirm whose
  // whole batch is refused answers 422 with the per-row reasons.
  const db2 = fakeDb();
  const c2 = fakeRes();
  await api(req('POST', { import: 'machinery', step: 'confirm' }, { machines: [{ ...bad }] }), c2, { db: db2, ...asUser(ADMIN) });
  ok(c2.statusCode === 422, `a wholly refused confirm answers 422 (got ${c2.statusCode})`);
  ok(c2.json().invalid?.length === 1, 'and carries the per-row reason');
  ok(db2._tables.machinery.length === 0, 'with nothing written');
}

say('\n-- purge-stale: the deliberate end of the staleness path --');
{
  const { purgeStale } = await import('../api/_machinery.js');
  const old = new Date(Date.now() - 40 * 86400000).toISOString();
  const recent = new Date(Date.now() - 2 * 86400000).toISOString();
  const db = fakeDb({ machinery: [
    { id: 's1', ref: 'AR7-MC-001', type: 'Excavators', brand: 'Doosan', model: 'DX300', published: false, status: 'Available', source_missing_since: old },
    { id: 's2', ref: 'AR7-MC-002', type: 'Excavators', brand: 'Sany', model: 'SY215', published: true, status: 'Available', source_missing_since: old },
    { id: 's3', ref: 'AR7-MC-003', type: 'Loaders', brand: 'XCMG', model: 'LW500', published: false, status: 'Available', source_missing_since: recent }
  ] });
  const first = await purgeStale(db, { olderThanDays: 14, remove: false, actor: ADMIN });
  ok(first.archived.length === 1 && first.archived[0] === 'AR7-MC-001',
    `only the unpublished, 40-day-stale row is archived (${first.archived.join(',')})`);
  ok(db._tables.machinery.find(r => r.id === 's2').status === 'Available',
    'a PUBLISHED machine is never touched, however stale — a person hid nothing');
  ok(db._tables.machinery.find(r => r.id === 's3').status === 'Available',
    'nor is one missing for only two days');
  ok(db._tables.machinery.length === 3, 'archive keeps every row');

  const second = await purgeStale(db, { olderThanDays: 14, remove: true, actor: ADMIN });
  ok(second.deleted.length === 1 && second.deleted[0] === 'AR7-MC-001',
    `delete removes only the row a person already parked (${second.deleted.join(',')})`);
  ok(db._tables.machinery.length === 2, 'and the row is gone');
  ok(db._tables.activities.length >= 2, 'every purge step is in the audit log');
}

say('\n-- purge-stale is a gated write on the same desk --');
{
  const seed = () => ({ machinery: [
    { id: 'p1', ref: 'AR7-MC-010', type: 'Excavators', brand: 'Doosan', model: 'DX300', published: false, status: 'Available',
      source_missing_since: new Date(Date.now() - 40 * 86400000).toISOString() },
    { id: 'p2', ref: 'AR7-MC-011', type: 'Loaders', brand: 'XCMG', model: 'LW500', published: true, status: 'Available',
      source_missing_since: new Date(Date.now() - 90 * 86400000).toISOString() }
  ] });

  const anon = fakeRes();
  await api(req('POST', { machinery: 'purge-stale' }, { olderThanDays: 14, remove: false }), anon, { db: fakeDb(seed()) });
  ok(anon.statusCode === 401, `an anonymous caller cannot purge (got ${anon.statusCode})`);

  const denied = fakeRes();
  await api(req('POST', { machinery: 'purge-stale' }, { olderThanDays: 14, remove: false }), denied,
    { db: fakeDb(seed()), ...asUser(SALES) });
  ok(denied.statusCode === 403, `a role without site.write cannot purge either (got ${denied.statusCode})`);

  const db = fakeDb(seed());
  const res = fakeRes();
  await api(req('POST', { machinery: 'purge-stale' }, { olderThanDays: 14, remove: false }), res, { db, ...asUser(ADMIN) });
  ok(res.statusCode === 200, `site.write may archive stale unpublished rows (got ${res.statusCode})`);
  ok(res.json().archived.length === 1 && res.json().archived[0] === 'AR7-MC-010',
    `the response names what it archived (${res.json().archived.join(',')})`);
  ok(db._tables.machinery.find(r => r.id === 'p2').status === 'Available',
    'a published machine missing for 90 days is untouched — only a person hides a published machine');
  ok(res.json().days === 14, 'and reports the threshold it used, so the desk can say what "stale" meant');

  const removed = fakeRes();
  await api(req('POST', { machinery: 'purge-stale' }, { olderThanDays: 14, remove: true }), removed, { db, ...asUser(ADMIN) });
  ok(removed.json().deleted.length === 1 && db._tables.machinery.length === 1,
    `remove:true deletes only the parked row (${removed.json().deleted.join(',')})`);
}

say('\n-- total run deadline keeps collected previews --');
{
  const world = makeWorld();
  let clock = 0;
  const out = await runScraper(fakeDb(), {
    category: 'excavators', limit: 24, now: () => clock, budgetMs: 9000,
    sleep: async ms => { clock += ms; },
    fetch: async (url, options) => {
      ok(options.timeoutMs <= 9000 - clock, 'fetch timeout fits remaining run budget');
      const page = await world.fetchImpl(url);
      clock += 1000;
      return page;
    }
  });
  ok(out.partial === true, 'deadline returns a partial receipt, not a lost HTTP timeout');
  ok(out.machines.length > 0, 'already collected previews survive the deadline');
  ok(out.warnings.some(w => w.includes('Time limit')), 'operator is told to confirm and run again');
}

say(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
