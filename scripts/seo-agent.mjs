#!/usr/bin/env node
// AR7 Traders SEO agent.
//
//   npm run seo             audit every route + the static shell, write seo-report.md
//   npm run seo:fix         apply the safe, deterministic fixes it can prove
//   npm run seo:brief       a prioritised work brief (for a human or an AI agent)
//   npm run seo:connect     connector status: Search Console, Bing, GA4, IndexNow
//   npm run seo:indexnow    submit changed URLs to Bing/Yandex via IndexNow
//
// What it is: a real, deterministic agent. It reads the same files the site
// ships (dist/index.html, public/sitemap.xml, public/robots.txt), drives the
// same SEO module the browser uses (src/seo.js) inside jsdom, and audits the
// result with the same engine the in-site SEO desk uses (src/seo-audit.js).
// So a fix in one place shows up in the other — no second source of truth.
//
// What it is NOT: it cannot invent API credentials. The Search Console, Bing
// Webmaster, GA4 and IndexNow connectors need the owner's keys (see
// `npm run seo:connect`); without them the agent still audits offline and
// reports honestly, and IndexNow starts working the moment a key exists.

import { JSDOM } from 'jsdom';
import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import crypto from 'node:crypto';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(path.join(root, p), 'utf8');
const exists = p => existsSync(path.join(root, p));

const dom = new JSDOM('<!doctype html><html><head><title>old</title></head><body></body></html>', {
  url: 'https://ar7traders.com/'
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;
globalThis.location = dom.window.location;
globalThis.URLSearchParams = dom.window.URLSearchParams;

const { auditDocument, summarise } = await import('../src/seo-audit.js');
const { applySeo, PAGE_SEO, MACHINERY_SEO, BASE } = await import('../src/seo.js');
const { NEWS, articleSlug } = await import('../src/news-data.js');
const { MACHINES } = await import('../src/machinery-data.js');
const { DEST, destinationFacts } = await import('../src/destinations.js');

const args = process.argv.slice(2);
const cmd = (args.find(a => !a.startsWith('-')) || 'audit').toLowerCase();
const flag = name => args.includes('--' + name);
const opt = name => {
  const i = args.indexOf('--' + name);
  return i >= 0 ? args[i + 1] : null;
};

const reportPath = 'seo-report.md';
const jsonPath = 'seo-report.json';

// ---------------------------------------------------------------------------
// Facts the audit reasons about: what is actually on disk right now.
// ---------------------------------------------------------------------------
const sitemapUrls = () => {
  try {
    return [...read('public/sitemap.xml').matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());
  } catch { return []; }
};
const robotsTxt = () => {
  try { return read('public/robots.txt'); } catch { return ''; }
};

const STAFF_PAGES = new Set(['crm', 'account', 'portal', 'studio', 'seo']);

// Pages that are not written to win a search query, so the keyword-coverage
// check would only produce noise: staff routes and utility pages.
const NO_KEYWORD_PAGES = new Set([...STAFF_PAGES, 'tools', 'world']);

const STATIC_ROUTES = () => {
  const pages = Object.keys(PAGE_SEO).filter(p => p !== 'inventory');
  const routes = pages.map(p => ({
    page: p,
    url: BASE + (p === 'home' ? '/' : '/' + p),
    label: p,
    indexable: !STAFF_PAGES.has(p)
  }));
  routes.push({ page: 'inventory', url: BASE + '/inventory', label: 'inventory' });
  // Brand landing page: the shape every make and model page uses.
  routes.push({ page: 'inventory', url: BASE + '/cars/toyota', label: 'cars/toyota', seo: { make: 'Toyota', vehicleCount: 120 } });
  routes.push({ page: 'inventory', url: BASE + '/cars/toyota/land-cruiser', label: 'cars/toyota/land-cruiser', seo: { make: 'Toyota', model: 'land cruiser', vehicleCount: 18 } });
  for (const type of Object.keys(MACHINERY_SEO)) {
    routes.push({ page: 'machinery', url: BASE + '/machinery/' + type, label: 'machinery/' + type, seo: { machineType: type } });
  }
  // One route per market page (2026-10-08): /destinations/kenya and the rest.
  // Each is audited like any other indexable URL, and an unknown market slug is
  // audited too — it must stay out of the index rather than duplicate the hub.
  for (const dest of DEST) {
    const f = destinationFacts(dest);
    routes.push({ page: 'destinations', url: BASE + f.href, label: 'destinations/' + f.slug,
      seo: { destination: dest, destSlug: f.slug } });
  }
  routes.push({ page: 'destinations', url: BASE + '/destinations/atlantis', label: 'destinations/unknown-market',
    seo: { destSlug: 'atlantis' }, indexable: false });
  routes.push({ page: 'news', url: BASE + '/news/' + articleSlug(NEWS[0]), label: 'news/' + articleSlug(NEWS[0]), seo: {}, carId: articleSlug(NEWS[0]) });
  return routes;
};

/** Apply the real SEO module to a blank document for one route, then audit it. */
function auditRoute(route, facts) {
  // Fresh head each time: the module mutates the document it is given.
  const fresh = new JSDOM('<!doctype html><html><head><title>old</title></head><body></body></html>', {
    url: route.url
  });
  const prev = { document: globalThis.document, window: globalThis.window, location: globalThis.location };
  globalThis.document = fresh.window.document;
  globalThis.window = fresh.window;
  globalThis.location = fresh.window.location;
  try {
    applySeo(route.page, route.carId || null, null, {
      make: route.seo?.make ?? null,
      model: route.seo?.model ?? null,
      machineType: route.seo?.machineType ?? null,
      vehicleCount: route.seo?.vehicleCount ?? null,
      destination: route.seo?.destination ?? null,
      destSlug: route.seo?.destSlug ?? null
    });
    return auditDocument(globalThis.document, {
      route: route.label,
      url: route.url,
      expectIndexable: route.indexable !== false,
      origin: BASE,
      facts,
      skipBody: true
    });
  } finally {
    globalThis.document = prev.document;
    globalThis.window = prev.window;
    globalThis.location = prev.location;
  }
}

/** Audit the shipped static shell — this is what a no-JS crawler reads. */
function auditStaticShell(facts) {
  if (!exists('dist/index.html')) return null;
  const shell = new JSDOM(read('dist/index.html'), { url: BASE + '/' });
  return auditDocument(shell.window.document, {
    route: 'home',
    label: 'static shell (dist/index.html)',
    url: BASE + '/',
    expectIndexable: true,
    origin: BASE,
    facts: { ...facts, keywordTargets: ['japanese', 'export', 'machinery'] }
  });
}

// ---------------------------------------------------------------------------
// audit
// ---------------------------------------------------------------------------
// Keyword targets come from the researched plan (npm run seo:keywords →
// keywords-plan.json) when that file exists: for each route, the head words of
// the queries the plan routed there and already found in the page copy.
// A head term the plan records as *uncovered* stays in the plan's gap list — it
// is work to do, not a warning to repeat on every audit run. Without the plan
// file the audit falls back to the built-in pair.
const plannedTargets = () => {
  try {
    const plan = JSON.parse(read('keywords-plan.json'));
    const byRoute = new Map();
    for (const [route, rows] of Object.entries(plan.routes || {})) {
      const counts = new Map();
      for (const row of rows) {
        if (row.covered !== true) continue;
        for (const word of String(row.keyword).toLowerCase().split(/\s+/)) {
          if (word.length > 2 && !TARGET_STOPWORDS.has(word)) counts.set(word, (counts.get(word) || 0) + 1);
        }
      }
      byRoute.set(route, [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 2).map(x => x[0]));
    }
    return { byRoute, generatedAt: plan.generatedAt || null };
  } catch { return null; }
};

const TARGET_STOPWORDS = new Set(['import', 'export', 'for', 'sale', 'to', 'from', 'car', 'cars',
  'the', 'and', 'of', 'in', 'on', 'best', 'used', 'how', 'much', 'buy', 'shipping', 'price', 'cost']);

function runAudit() {
  // Keyword targets apply to the pages that are supposed to rank — a staff
  // console or a calculator is not written to win a search query.
  const plan = plannedTargets();
  const targetsFor = (label) => {
    const planned = plan && plan.byRoute.get('/' + label);
    return planned && planned.length ? planned : ['japan', 'export'];
  };
  const facts = {
    sitemapUrls: sitemapUrls(),
    robotsTxt: robotsTxt(),
    keywordTargets: ['japan', 'export']
  };
  if (plan) console.log(`      keyword plan: ${plan.generatedAt || 'present'} (keywords-plan.json)`);
  const reports = STATIC_ROUTES().map(r => NO_KEYWORD_PAGES.has(r.page)
    ? auditRoute(r, { ...facts, keywordTargets: [] })
    : auditRoute(r, { ...facts, keywordTargets: targetsFor(r.label) }));
  const shell = auditStaticShell(facts);
  if (shell) reports.push(shell);

  const summary = summarise(reports);
  const lines = [];
  lines.push('# AR7 Traders SEO report');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}  ·  score **${summary.score}/100**  ·  ${summary.fails} failure(s), ${summary.warns} warning(s)`);
  lines.push('');
  lines.push('Audited by `scripts/seo-agent.mjs` using the same engine as the in-site SEO desk');
  lines.push('(`src/seo-audit.js`). Head checks run per route through the real `src/seo.js`;');
  lines.push('body checks (H1, images, internal links) run against the built static shell, which is');
  lines.push('what a crawler that does not execute JavaScript actually reads.');
  lines.push('');
  for (const r of reports) {
    lines.push(`## ${r.route} — ${r.score}/100`);
    lines.push('');
    lines.push(`URL: ${r.url || '(n/a)'}`);
    lines.push('');
    for (const c of r.checks) {
      const icon = c.status === 'pass' ? '✅' : c.status === 'warn' ? '⚠️' : '❌';
      lines.push(`- ${icon} **${c.label}** — ${c.detail}`);
      if (c.fix && c.status !== 'pass') lines.push(`  - Fix: ${c.fix}`);
    }
    lines.push('');
  }
  lines.push('---');
  lines.push('');
  lines.push('## Crawl targets');
  lines.push('');
  lines.push(`- Static sitemap: ${facts.sitemapUrls.length} URLs`);
  lines.push('- Vehicle + landing pages: served live from `/api/sitemap-vehicles.xml` (make/model pages are derived from real stock)');
  lines.push(`- robots.txt declares a sitemap: ${/^sitemap:/im.test(facts.robotsTxt) ? 'yes' : 'NO — fix this first'}`);
  lines.push('');
  lines.push('## Inventory surfaces');
  lines.push('');
  lines.push(`- Machinery types published: ${Object.keys(MACHINERY_SEO).join(', ')}`);
  lines.push(`- Machinery entries in the catalogue: ${MACHINES.length}`);
  lines.push('');

  writeFileSync(path.join(root, reportPath), lines.join('\n'));
  writeFileSync(path.join(root, jsonPath), JSON.stringify(summary, null, 2));

  console.log(`SEO audit: ${summary.score}/100 · ${summary.fails} failure(s) · ${summary.warns} warning(s)`);
  for (const r of reports) {
    const worst = r.checks.filter(c => c.status === 'fail');
    const state = worst.length ? 'FAIL' : r.checks.some(c => c.status === 'warn') ? 'warn' : 'ok';
    console.log(`  ${String(r.score).padStart(3)}/100  ${state.padEnd(4)}  ${r.route}`);
    for (const f of worst.slice(0, 3)) console.log(`         ❌ ${f.label}: ${f.detail}`);
  }
  console.log(`\nWrote ${reportPath} and ${jsonPath}.`);
  return summary.fails;
}

// ---------------------------------------------------------------------------
// fix — only changes it can prove are correct
// ---------------------------------------------------------------------------
async function runFix() {
  const changes = [];
  const today = new Date().toISOString().slice(0, 10);

  // 1. robots.txt must declare both sitemaps.
  let robots = robotsTxt();
  const wanted = ['Sitemap: https://ar7traders.com/sitemap.xml', 'Sitemap: https://ar7traders.com/api/sitemap-vehicles.xml'];
  const missing = wanted.filter(w => !robots.includes(w));
  if (missing.length) {
    robots = robots.replace(/\s*$/, '\n') + missing.join('\n') + '\n';
    writeFileSync(path.join(root, 'public/robots.txt'), robots);
    changes.push('public/robots.txt: added ' + missing.length + ' sitemap declaration(s)');
  }

  // 2. every machinery type page must be in the static sitemap.
  let sitemap = read('public/sitemap.xml');
  for (const type of Object.keys(MACHINERY_SEO)) {
    const loc = `${BASE}/machinery/${type}`;
    if (sitemap.includes(`<loc>${loc}</loc>`)) continue;
    const block = `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.7</priority>\n  </url>\n`;
    sitemap = sitemap.replace('</urlset>', block + '</urlset>');
    changes.push(`public/sitemap.xml: added ${loc}`);
  }
  // 3. every machine's own page — the catalogue is static, so its URLs are
  // known here, and a unit nobody can find is a unit nobody quotes.
  const { MACHINES, machineHref } = await import('../src/machinery-data.js');
  for (const machine of MACHINES) {
    const loc = BASE + machineHref(machine);
    if (sitemap.includes(`<loc>${loc}</loc>`)) continue;
    const block = `  <url>\n    <loc>${loc}</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.6</priority>\n  </url>\n`;
    sitemap = sitemap.replace('</urlset>', block + '</urlset>');
    changes.push(`public/sitemap.xml: added ${machine.ref}`);
  }
  // 4. the machinery hub itself.
  if (!sitemap.includes(`<loc>${BASE}/machinery</loc>`)) {
    sitemap = sitemap.replace('</urlset>', `  <url>\n    <loc>${BASE}/machinery</loc>\n    <lastmod>${today}</lastmod>\n    <changefreq>weekly</changefreq>\n    <priority>0.8</priority>\n  </url>\n</urlset>`);
    changes.push('public/sitemap.xml: added /machinery');
  }
  writeFileSync(path.join(root, 'public/sitemap.xml'), sitemap);

  // 5. IndexNow key file — the one connector that needs no account.
  const key = indexNowKey(true);
  if (key && !exists(`public/${key}.txt`)) {
    writeFileSync(path.join(root, `public/${key}.txt`), key + '\n');
    changes.push(`public/${key}.txt: created the IndexNow key file`);
  }

  // 5. static shell must link the landing pages (crawlers that never run JS
  //    still need a path into the catalogue).
  const shell = read('index.html');
  const linksToAdd = Object.keys(MACHINERY_SEO).filter(t => !shell.includes(`href="/machinery/${t}"`));
  if (linksToAdd.length) console.log('Note: index.html does not yet link ' + linksToAdd.join(', ') + ' — add them by hand so the copy stays human.');

  if (!changes.length) console.log('Nothing to fix — crawl configuration is already correct.');
  else for (const c of changes) console.log('fixed: ' + c);
  console.log('\nRun `npm run test:seo` afterwards: the sitemap URL count is pinned there.');
  return 0;
}

// ---------------------------------------------------------------------------
// IndexNow — the connector that works without an account
// ---------------------------------------------------------------------------
function indexNowKey(create = false) {
  const fromEnv = process.env.AR7_INDEXNOW_KEY;
  if (fromEnv) return fromEnv.trim();
  const file = path.join(root, 'seo.config.json');
  if (exists('seo.config.json')) {
    try {
      const cfg = JSON.parse(readFileSync(file, 'utf8'));
      if (cfg.indexNowKey) return cfg.indexNowKey;
    } catch { /* fall through and regenerate */ }
  }
  if (!create) return null;
  const key = crypto.randomBytes(16).toString('hex');
  writeFileSync(file, JSON.stringify({ indexNowKey: key, createdAt: new Date().toISOString() }, null, 2) + '\n');
  return key;
}

async function runIndexNow() {
  const key = indexNowKey(true);
  const host = opt('host') || 'ar7traders.com';
  const urls = flag('all') ? sitemapUrls() : (opt('urls') ? opt('urls').split(',') : [
    `${BASE}/`, `${BASE}/inventory`, `${BASE}/machinery`,
    ...Object.keys(MACHINERY_SEO).map(t => `${BASE}/machinery/${t}`)
  ]);
  const payload = { host, key, keyLocation: `https://${host}/${key}.txt`, urlList: urls };
  console.log(`IndexNow: submitting ${urls.length} URL(s) for ${host}`);
  if (flag('dry')) { console.log(JSON.stringify(payload, null, 2)); return 0; }
  try {
    const res = await fetch('https://api.indexnow.org/indexnow', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify(payload)
    });
    console.log(res.ok
      ? `IndexNow accepted the submission (HTTP ${res.status}).`
      : `IndexNow refused it (HTTP ${res.status}). The key file must be live at ${payload.keyLocation} first.`);
    return res.ok ? 0 : 1;
  } catch (e) {
    console.log('IndexNow unreachable from this environment: ' + e.message);
    console.log('The payload above is correct — run this command where the network is open.');
    return 1;
  }
}

// ---------------------------------------------------------------------------
// connect — the honest connector status
// ---------------------------------------------------------------------------
const CONNECTORS = [
  {
    id: 'gsc',
    name: 'Google Search Console',
    what: 'Search queries, impressions, clicks, coverage errors, sitemap submissions.',
    env: ['GOOGLE_SERVICE_ACCOUNT_JSON', 'GSC_SITE_URL'],
    how: 'Create a service account in Google Cloud, enable the Search Console API, add the service-account email as a user of the ar7traders.com property, then set both variables. The agent then reads real query data and ranks its own work by impressions.',
    agent: 'scripts/seo-agent.mjs (read-only reporting)'
  },
  {
    id: 'bing',
    name: 'Bing Webmaster Tools',
    what: 'Bing/Yahoo index coverage, keyword research, URL submission API.',
    env: ['BING_WEBMASTER_API_KEY'],
    how: 'Bing Webmaster Tools → Settings → API access → generate key. Set BING_WEBMASTER_API_KEY.',
    agent: 'scripts/seo-agent.mjs'
  },
  {
    id: 'ga4',
    name: 'Google Analytics 4',
    what: 'Traffic, landing pages, conversions from organic search.',
    env: ['GA4_PROPERTY_ID', 'GOOGLE_SERVICE_ACCOUNT_JSON'],
    how: 'Reuse the service account from Search Console, grant it Viewer on the GA4 property, set GA4_PROPERTY_ID.',
    agent: 'scripts/seo-agent.mjs'
  },
  {
    id: 'indexnow',
    name: 'IndexNow (Bing + Yandex, no account)',
    what: 'Pushes changed URLs for immediate re-crawl.',
    env: ['AR7_INDEXNOW_KEY'],
    how: 'Already active: `npm run seo:fix` creates the key file in public/, and `npm run seo:indexnow` submits. Verify the key file is live at https://ar7traders.com/<key>.txt after deploy.',
    agent: 'scripts/seo-agent.mjs seo:indexnow'
  },
  {
    id: 'onsite',
    name: 'In-site SEO desk',
    what: 'The same audit engine, run against the live page in the browser, for anyone on the team.',
    env: [],
    how: 'Open /seo on the site (staff area; noindex). No setup needed.',
    agent: 'src/seo-desk.jsx'
  }
];

function runConnect() {
  console.log('SEO connectors\n');
  for (const c of CONNECTORS) {
    const set = c.env.filter(v => process.env[v]);
    const state = c.env.length === 0 ? 'built in' : set.length === c.env.length ? 'CONNECTED' : set.length ? 'partial' : 'not connected';
    console.log(`• ${c.name} — ${state}`);
    console.log(`    gives: ${c.what}`);
    if (c.env.length) console.log(`    env:   ${c.env.map(v => v + (process.env[v] ? ' ✓' : '')).join(', ')}`);
    if (state !== 'CONNECTED') console.log(`    set up: ${c.how}`);
    console.log(`    runs in: ${c.agent}`);
    console.log('');
  }
  console.log('Nothing above stores secrets in the repo: the agent only reads environment variables.');
  return 0;
}

// ---------------------------------------------------------------------------
// brief — the prioritised work list
// ---------------------------------------------------------------------------
function runBrief() {
  const facts = { sitemapUrls: sitemapUrls(), robotsTxt: robotsTxt() };
  const reports = STATIC_ROUTES().map(r => auditRoute(r, NO_KEYWORD_PAGES.has(r.page) ? { ...facts, keywordTargets: [] } : facts));
  const shell = auditStaticShell(facts);
  if (shell) reports.push(shell);
  const problems = [];
  for (const r of reports) for (const c of r.checks) if (c.status !== 'pass') problems.push({ route: r.route, ...c });
  const order = { fail: 0, warn: 1 };
  problems.sort((a, b) => order[a.status] - order[b.status]);

  console.log('SEO work brief — highest impact first\n');
  if (!problems.length) {
    const marketPages = sitemapUrls().filter(u => /\/destinations\/[a-z0-9-]+\/?$/.test(u));
    console.log(`Audit is clean across ${reports.length} route(s)` +
      (marketPages.length ? `, including ${marketPages.length} market landing pages` : '') +
      '. Keep publishing guides and keep the market pages fresh.');
  }
  problems.slice(0, 25).forEach((p, i) => {
    console.log(`${i + 1}. [${p.status.toUpperCase()}] ${p.route} → ${p.label}`);
    console.log(`   ${p.detail}`);
    if (p.fix) console.log(`   → ${p.fix}`);
  });
  console.log('\nAlso worth doing by hand (the agent cannot judge these):');
  console.log('  • replace illustrative machinery photos with supplier photos you have rights to');
  // 2026-10-08: the market pages exist now, so this bullet is a coverage check
  // rather than standing advice — it names only markets that still lack a page.
  {
    const inSitemap = sitemapUrls().join('\n');
    const missing = DEST.filter(d => !inSitemap.includes('/destinations/' + destinationFacts(d).slug));
    if (missing.length) {
      console.log(`  • add a destination landing page per market you actually ship to — still missing: ${missing.map(d => d[0]).join(', ')}`);
    } else {
      console.log(`  • keep the ${DEST.length} market pages current (transit windows, models, document packs) — every market in DEST has one`);
    }
  }
  console.log('  • publish buying guides targeting real queries ("how to import a car to Kenya")');
  console.log('  • earn links: supplier pages, port agents, freight partners, chambers of commerce');
  return 0;
}

// ---------------------------------------------------------------------------
// live — audit what the deployed site actually serves
// ---------------------------------------------------------------------------
async function runLive() {
  const base = opt('base') || process.env.AR7_SITE_URL || 'https://ar7traders.com';
  const targets = [`${base}/`, `${base}/inventory`, `${base}/machinery`, `${base}/machinery/excavators`, `${base}/cars/toyota`, `${base}/sitemap.xml`, `${base}/robots.txt`, `${base}/llms.txt`];
  console.log(`Auditing the live site at ${base}\n`);
  for (const url of targets) {
    try {
      const res = await fetch(url, { redirect: 'follow' });
      const body = await res.text();
      const type = res.headers.get('content-type') || '';
      let note = '';
      if (/xml/.test(type)) note = `${(body.match(/<loc>/g) || []).length} URLs`;
      else if (/json|text\/plain/.test(type)) note = `${body.length} bytes`;
      else {
        const doc = new JSDOM(body, { url }).window.document;
        const title = (doc.title || '').slice(0, 70);
        const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '';
        const noindex = /noindex/i.test(doc.querySelector('meta[name="robots"]')?.getAttribute('content') || '');
        note = `${res.status} · title="${title}"${canonical ? ' · canonical=' + canonical : ''}${noindex ? ' · NOINDEX' : ''}`;
      }
      console.log(`  ${String(res.status).padEnd(4)} ${url}\n       ${note}`);
    } catch (e) {
      console.log(`  ERR  ${url}\n       ${e.message}`);
    }
  }
  console.log('\nNote: this environment may have no outbound network; a failure here is not a site failure.');
  return 0;
}

// ---------------------------------------------------------------------------
const dispatch = {
  audit: runAudit,
  fix: runFix,
  brief: runBrief,
  connect: runConnect,
  indexnow: runIndexNow,
  live: runLive
};

if (!dispatch[cmd]) {
  console.log('AR7 SEO agent\n\nCommands:\n  audit (default)  full audit → seo-report.md\n  fix              apply safe crawl fixes\n  brief            prioritised work list\n  connect          connector status and setup\n  indexnow         submit URLs to Bing/Yandex\n  live             audit the deployed site\n\nFlags: --json, --dry, --all, --urls a,b --base https://…');
  process.exit(1);
}

const code = await dispatch[cmd]();
process.exit(typeof code === 'number' ? code : 0);
