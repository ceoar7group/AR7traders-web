// Tests for the SEO audit engine (src/seo-audit.js) and the SEO agent
// (scripts/seo-agent.mjs). Run: npm run test:seo-audit
//
// The engine is shared by three consumers — the in-site SEO desk, this CLI and
// the Arena agent — so it gets pinned here: a check that silently stops
// firing would make every consumer lie at once.
import { JSDOM } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');
const { auditDocument, blockedByRobots, summarise } = await import('../src/seo-audit.js');

let failed = 0;
const ok = (cond, msg) => {
  if (!cond) { failed++; process.stderr.write('FAIL: ' + msg + '\n'); }
  else console.log('ok  :', msg);
};

const GOOD = `<!doctype html><html><head>
<title>Used Toyota Land Cruiser for Export from Japan | AR7 Traders</title>
<meta name="description" content="Buy a used Toyota Land Cruiser sourced at Japanese auctions with a translated auction sheet, export price in USD and shipping quoted to your port.">
<link rel="canonical" href="https://ar7traders.com/cars/toyota/land-cruiser">
<meta name="robots" content="index,follow">
<meta property="og:title" content="t"><meta property="og:description" content="d">
<meta property="og:image" content="https://ar7traders.com/assets/og.png">
<meta property="og:image:alt" content="a">
<script id="breadcrumb-jsonld" type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[]}</script>
</head><body>
<h1>Toyota Land Cruiser for export</h1>
<img src="/a.webp" alt="Toyota Land Cruiser in a Japanese auction yard">
${Array.from({ length: 9 }, (_, i) => `<a href="/cars/toyota/model-${i}">model ${i}</a>`).join('\n')}
</body></html>`;

const dom = (html, url = 'https://ar7traders.com/cars/toyota/land-cruiser') => new JSDOM(html, { url }).window.document;

// ---- a clean page passes ----------------------------------------------------
{
  const r = auditDocument(dom(GOOD), {
    route: 'cars/toyota/land-cruiser',
    url: 'https://ar7traders.com/cars/toyota/land-cruiser',
    facts: { sitemapUrls: ['https://ar7traders.com/cars/toyota/land-cruiser'], robotsTxt: 'User-agent: *\nAllow: /\nSitemap: https://ar7traders.com/sitemap.xml' }
  });
  ok(r.status === 'pass', 'a well-built landing page passes every check');
  ok(r.score === 100, `the clean page scores 100 (scored ${r.score})`);
  ok(r.checks.length >= 10, `the engine runs a real set of checks (${r.checks.length})`);
}

// ---- each failure mode fires ------------------------------------------------
{
  const r = auditDocument(dom('<!doctype html><html><head><title>x</title></head><body><img src="/a.webp"><img src="/b.webp"><img src="/c.webp"></body></html>'), {
    route: 'broken',
    url: 'https://ar7traders.com/cars/toyota'
  });
  const failedIds = r.checks.filter(c => c.status === 'fail').map(c => c.id);
  ok(failedIds.includes('description'), 'a missing meta description fails');
  ok(failedIds.includes('canonical'), 'a missing canonical fails');
  ok(failedIds.includes('og'), 'missing Open Graph tags fail');
  ok(failedIds.includes('h1'), 'a missing H1 fails');
  ok(r.checks.find(c => c.id === 'title')?.status === 'warn', 'a too-short title only warns');
  ok(r.checks.find(c => c.id === 'img-alt')?.status === 'warn', 'images without alt text warn');
}
{
  const r = auditDocument(dom(`<!doctype html><html><head><title>Staff CRM</title>
    <meta name="description" content="Internal operations console for AR7 Traders staff.">
    <meta name="robots" content="index,follow">
    <link rel="canonical" href="https://ar7traders.com/crm"></head><body><h1>CRM</h1></body></html>`), {
    route: 'crm', url: 'https://ar7traders.com/crm', expectIndexable: false,
    facts: { robotsTxt: 'User-agent: *\nDisallow: /crm\nSitemap: https://ar7traders.com/sitemap.xml', sitemapUrls: [] }
  });
  ok(r.checks.find(c => c.id === 'robots')?.status === 'fail', 'a crawlable staff route fails the indexability check');
  ok(r.checks.find(c => c.id === 'sitemap')?.status !== 'fail', 'a noindex staff route is not asked to be in the sitemap');
}

// ---- head-only audits do not pretend a client-rendered page has no H1 ------
{
  const r = auditDocument(dom('<!doctype html><html><head><title>Rendered by React only</title></head><body></body></html>'), {
    route: 'head-only', url: 'https://ar7traders.com/machinery', skipBody: true
  });
  ok(r.checks.find(c => c.id === 'h1')?.status === 'pass', 'skipBody marks body checks as handled elsewhere');
}

// ---- landing pages are checked against the live vehicle sitemap, not the static file
{
  const r = auditDocument(dom(GOOD), {
    route: 'cars/toyota',
    url: 'https://ar7traders.com/cars/toyota',
    facts: { sitemapUrls: ['https://ar7traders.com/'], robotsTxt: '' }
  });
  ok(r.checks.find(c => c.id === 'sitemap')?.status === 'pass',
    'a /cars/ page is not failed for being absent from the static sitemap');
}

// ---- structured data parsing is real ---------------------------------------
{
  const r = auditDocument(dom('<!doctype html><html><head><title>Bad JSON-LD page title here</title>' +
    '<script id="x" type="application/ld+json">{ nope }</script></head><body><h1>t</h1></body></html>'), { route: 'x' });
  ok(r.checks.find(c => c.id === 'jsonld-parse')?.status === 'fail', 'invalid JSON-LD fails');
}
{
  const r = auditDocument(dom(GOOD), { route: 'home', url: 'https://ar7traders.com/' });
  ok(r.checks.find(c => c.id === 'jsonld-itemlist')?.status === 'pass', 'the ItemList check reports presence/absence without failing a page that needs none');
}

// ---- robots.txt matching ----------------------------------------------------
{
  const txt = 'User-agent: *\nAllow: /\nDisallow: /crm\nDisallow: /account\nSitemap: https://ar7traders.com/sitemap.xml';
  ok(blockedByRobots(txt, 'https://ar7traders.com/crm') === '/crm', 'robots blocks /crm');
  ok(blockedByRobots(txt, 'https://ar7traders.com/crm/settings') === '/crm', 'robots blocks a staff sub-path');
  ok(blockedByRobots(txt, 'https://ar7traders.com/cars/toyota') === null, 'robots does not block the catalogue');
  ok(blockedByRobots('User-agent: Googlebot\nDisallow: /cars\nUser-agent: *\nAllow: /', 'https://ar7traders.com/cars/toyota') === null,
    'a rule for another user-agent does not apply');
}

// ---- the summary rolls up ---------------------------------------------------
{
  const s = summarise([{ score: 100, fails: 0, warns: 0 }, { score: 50, fails: 2, warns: 1 }]);
  ok(s.score === 75 && s.fails === 2 && s.warns === 1, 'summarise averages scores and totals problems');
}

// ---- the shipped site passes its own audit ---------------------------------
// The agent must be runnable exactly as documented, or the promise on the SEO
// desk is empty. It writes seo-report.md/json at the repo root.
{
  const out = execFileSync('node', ['scripts/seo-agent.mjs', 'audit'], { cwd: root, encoding: 'utf8' });
  ok(/SEO audit: \d+\/100/.test(out), 'npm run seo produces a score line');
  ok(!/\bFAIL\b/.test(out.split('\n').filter(l => l.includes('static shell'))[0] || ''),
    'the shipped static shell has no failures');
  const md = readFileSync(path.join(root, 'seo-report.md'), 'utf8');
  ok(md.includes('# AR7 Traders SEO report'), 'the audit writes seo-report.md');
  ok(md.includes('/cars/toyota') && md.includes('/machinery/excavators'),
    'the report covers the landing pages, not just the legacy routes');
  ok(existsSync(path.join(root, 'seo-report.json')), 'the audit writes machine-readable seo-report.json');
  const json = JSON.parse(readFileSync(path.join(root, 'seo-report.json'), 'utf8'));
  ok(typeof json.score === 'number' && Array.isArray(json.pages), 'seo-report.json carries the summary and pages');
}

// ---- connect is honest about missing credentials ---------------------------
{
  const out = execFileSync('node', ['scripts/seo-agent.mjs', 'connect'], { cwd: root, encoding: 'utf8' });
  ok(/Google Search Console/.test(out) && /not connected|partial|CONNECTED/.test(out),
    'the connect command reports connector status');
  ok(/GOOGLE_SERVICE_ACCOUNT_JSON/.test(out), 'the connect command names the exact environment variables');
  ok(!/password|secret key:/i.test(out), 'the connector report never prints secrets');
}

// ---- brief orders the work --------------------------------------------------
{
  const out = execFileSync('node', ['scripts/seo-agent.mjs', 'brief'], { cwd: root, encoding: 'utf8' });
  ok(/SEO work brief/.test(out), 'npm run seo:brief prints a work brief');
  ok(/replace illustrative machinery photos/.test(out), 'the brief carries the human-only items too');
}

// ---- the in-site desk is wired to the same engine --------------------------
{
  const desk = readFileSync(path.join(root, 'src/seo-desk.jsx'), 'utf8');
  ok(desk.includes("from './seo-audit.js'"), 'the SEO desk imports the shared audit engine');
  ok(desk.includes('npm run seo:indexnow'), 'the desk documents the IndexNow connector');
  const seo = readFileSync(path.join(root, 'src/seo.js'), 'utf8');
  ok(/noindex[\s\S]{0,200}'seo'/.test(seo), 'the /seo route is noindex');
}

console.log(failed ? `\n${failed} FAILURES` : '\nALL PASS');
process.exit(failed ? 1 : 0);
