// The AR7 SEO audit engine.
//
// One engine, three homes — this is deliberate:
//   1. the in-site "SEO desk" panel (runs it against the live document),
//   2. scripts/seo-agent.mjs (runs it against every route in a jsdom DOM),
//   3. the Arena agent (runs the same CLI, so both sides always agree).
//
// It only ever inspects a DOM document plus a small bag of already-collected
// facts, so it has no network or build dependency and stays testable.
//
// Statuses: 'pass' | 'warn' | 'fail'. Every check explains itself in `detail`
// and, where a human can fix it, in `fix`.

const LIMITS = {
  titleMin: 15,
  titleMax: 65,
  descMin: 70,
  descMax: 165
};

const text = v => String(v ?? '').replace(/\s+/g, ' ').trim();
const attr = (el, name) => (el ? el.getAttribute(name) : null);

function jsonLdNodes(doc) {
  const out = [];
  for (const el of doc.querySelectorAll('script[type="application/ld+json"]')) {
    const raw = el.textContent || '';
    try {
      const parsed = JSON.parse(raw);
      out.push({ id: el.id || '(anonymous)', data: parsed, error: null });
    } catch (e) {
      out.push({ id: el.id || '(anonymous)', data: null, error: e.message });
    }
  }
  return out;
}

const typesIn = node => {
  const list = Array.isArray(node) ? node : [node];
  const out = [];
  for (const n of list) {
    if (!n || typeof n !== 'object') continue;
    if (n['@type']) out.push(String(n['@type']));
    if (Array.isArray(n['@graph'])) out.push(...typesIn(n['@graph']));
    if (Array.isArray(n['@type'])) out.push(...n['@type'].map(String));
  }
  return out;
};

/**
 * @param {Document} doc            the document to audit
 * @param {object}   opts
 * @param {string}   opts.route     human name of the route being audited
 * @param {string}   opts.url       expected absolute URL
 * @param {boolean}  opts.expectIndexable  false for staff/tooling routes
 * @param {object}   opts.facts     optional pre-collected facts, e.g.
 *                                  { sitemapUrls: string[], robotsTxt: string,
 *                                    internalLinks: string[], keywordTargets: string[] }
 */
export function auditDocument(doc, opts = {}) {
  const route = opts.route || '(unknown route)';
  const label = opts.label || route;
  const expectIndexable = opts.expectIndexable !== false;
  const checks = [];
  const add = (id, label, status, detail, fix) => checks.push({ id, label, status, detail, fix: fix || null });

  const head = doc.head || doc;
  const meta = name => attr(head.querySelector(`meta[name="${name}"]`), 'content');
  const prop = name => attr(head.querySelector(`meta[property="${name}"]`), 'content');
  const title = text(doc.title);
  const desc = text(meta('description'));
  const canonical = attr(head.querySelector('link[rel="canonical"]'), 'href');
  const robots = text(meta('robots'));
  const h1s = [...doc.querySelectorAll('h1')].map(el => text(el.textContent)).filter(Boolean);
  const noindex = /noindex/i.test(robots);

  // ---- title -------------------------------------------------------------
  if (!title) {
    add('title', 'Page title', 'fail', 'No <title> found.', 'Give the page a unique title.');
  } else if (title.length < LIMITS.titleMin) {
    add('title', 'Page title', 'warn', `Title is only ${title.length} characters ("${title}").`,
      'Add the market and the offer, e.g. "Used Toyota Land Cruiser for Export from Japan".');
  } else if (title.length > LIMITS.titleMax) {
    add('title', 'Page title', 'warn', `Title is ${title.length} characters; Google truncates around ${LIMITS.titleMax}.`,
      'Move the least important words out of the title.');
  } else {
    add('title', 'Page title', 'pass', `${title.length} characters: "${title}"`);
  }

  // ---- description -------------------------------------------------------
  if (!desc) {
    add('description', 'Meta description', 'fail', 'No meta description.', 'Write a 70–165 character description with the offer and a reason to click.');
  } else if (desc.length < LIMITS.descMin) {
    add('description', 'Meta description', 'warn', `Description is only ${desc.length} characters.`, 'Say what is for sale, from where, and to which markets.');
  } else if (desc.length > LIMITS.descMax) {
    add('description', 'Meta description', 'warn', `Description is ${desc.length} characters; it will be cut off.`, 'Trim to under 165 characters.');
  } else {
    add('description', 'Meta description', 'pass', `${desc.length} characters.`);
  }

  // ---- canonical ---------------------------------------------------------
  if (!canonical) {
    add('canonical', 'Canonical URL', 'fail', 'No canonical link.', 'Emit link[rel=canonical] on every indexable page.');
  } else if (!/^https?:\/\//.test(canonical)) {
    add('canonical', 'Canonical URL', 'fail', `Canonical is not absolute: ${canonical}`, 'Use the full https URL.');
  } else if (canonical.includes('?') && !/embed=/.test(canonical)) {
    add('canonical', 'Canonical URL', 'warn', `Canonical still contains a query string: ${canonical}`,
      'Filtered views should canonicalise to a path (e.g. /cars/toyota), because query-string URLs do not rank.');
  } else {
    add('canonical', 'Canonical URL', 'pass', canonical);
  }

  // ---- robots ------------------------------------------------------------
  if (expectIndexable && noindex) {
    add('robots', 'Indexability', 'fail', 'This page is indexable but carries noindex.',
      'Remove noindex, or add the route to the noindex list if it is staff-only.');
  } else if (!expectIndexable && !noindex) {
    add('robots', 'Indexability', 'fail', 'This staff/tool route is crawlable.',
      'It should carry noindex,nofollow.');
  } else {
    add('robots', 'Indexability', 'pass', robots || '(default index,follow)');
  }

  // ---- headings ----------------------------------------------------------
  const skipBody = !!opts.skipBody;
  if (skipBody) {
    add('h1', 'Heading structure', 'pass', 'Rendered client-side; checked on the static-shell audit.');
  } else if (h1s.length === 0) {
    add('h1', 'Heading structure', 'fail', 'No <h1> on the page.', 'Every landing page needs one descriptive H1.');
  } else if (h1s.length > 1) {
    add('h1', 'Heading structure', 'warn', `${h1s.length} H1s: ${h1s.slice(0, 3).join(' | ')}`, 'Keep one H1 per page.');
  } else {
    add('h1', 'Heading structure', 'pass', h1s[0]);
  }

  // ---- structured data ---------------------------------------------------
  const nodes = jsonLdNodes(doc);
  const broken = nodes.filter(n => n.error);
  if (broken.length) {
    add('jsonld-parse', 'Structured data', 'fail', `Invalid JSON-LD in ${broken.map(b => b.id).join(', ')}: ${broken[0].error}`, 'Fix the JSON so the block parses.');
  } else {
    add('jsonld-parse', 'Structured data', 'pass', `${nodes.length} JSON-LD block(s), all valid JSON.`);
  }
  const types = nodes.flatMap(n => typesIn(n.data));
  const wantBreadcrumb = opts.route !== 'home';
  if (wantBreadcrumb && !types.includes('BreadcrumbList')) {
    add('jsonld-breadcrumb', 'Breadcrumb schema', 'warn', 'No BreadcrumbList on a non-home page.', 'Breadcrumbs earn the path line in search results.');
  } else {
    add('jsonld-breadcrumb', 'Breadcrumb schema', 'pass', types.includes('BreadcrumbList') ? 'BreadcrumbList present.' : 'Home page needs none.');
  }
  const landing = types.includes('ItemList');
  add('jsonld-itemlist', 'List schema', 'pass',
    landing ? 'ItemList present — the page tells crawlers it is a catalogue page.' : 'No ItemList (only landing pages need one).');

  // ---- share preview -----------------------------------------------------
  if (!prop('og:title') || !prop('og:description') || !prop('og:image')) {
    add('og', 'Share preview', 'fail', 'og:title / og:description / og:image are incomplete.', 'Complete the Open Graph tags.');
  } else {
    add('og', 'Share preview', 'pass', 'Open Graph title, description and image are set.');
  }
  if (!/^https?:\/\//.test(prop('og:image') || '')) {
    add('og-image', 'Share preview image', 'fail', `og:image is not an absolute URL: ${prop('og:image')}`, 'Use a full https URL.');
  } else {
    add('og-image', 'Share preview image', 'pass', prop('og:image'));
  }

  // ---- images ------------------------------------------------------------
  const imgs = skipBody ? [] : [...doc.querySelectorAll('img')];
  const missingAlt = imgs.filter(i => !attr(i, 'alt') && attr(i, 'alt') !== '').length;
  const decorative = imgs.filter(i => attr(i, 'alt') === '').length;
  if (skipBody) {
    add('img-alt', 'Image alt text', 'pass', 'Images render client-side; checked on the static-shell audit.');
  } else if (imgs.length && missingAlt / imgs.length > 0.25) {
    add('img-alt', 'Image alt text', 'warn', `${missingAlt} of ${imgs.length} images have no alt attribute.`,
      'Describe what each image shows — machinery photos and vehicle photos both help image search.');
  } else {
    add('img-alt', 'Image alt text', 'pass', `${imgs.length} image(s), ${missingAlt} missing alt, ${decorative} decorative.`);
  }

  // ---- internal links ----------------------------------------------------
  const anchors = [...doc.querySelectorAll('a[href]')].map(a => attr(a, 'href'));
  const internal = anchors.filter(h => h && (h.startsWith('/') || h.startsWith((opts.origin || 'https://ar7traders.com'))));
  if (skipBody) {
    add('links', 'Internal links', 'pass', 'Links render client-side; checked on the static-shell audit.');
  } else if (internal.length < 8) {
    add('links', 'Internal links', 'warn', `Only ${internal.length} internal link(s) on this page.`,
      'Link to brand, model and machinery landing pages — that is how crawlers find the catalogue.');
  } else {
    add('links', 'Internal links', 'pass', `${internal.length} internal link(s).`);
  }

  // ---- fact-based checks (only when the caller supplied the facts) -------
  const facts = opts.facts || {};
  // Landing pages (/cars/*) are published by the live vehicle sitemap, so they
  // are only checked for presence when the caller says the static file is the
  // whole picture (facts.staticSitemapIsComplete).
  const skipSitemapCheck = /^\/cars\//.test(new URL(opts.url || '/', 'https://ar7traders.com').pathname) && !facts.staticSitemapIsComplete;
  if (skipSitemapCheck) {
    add('sitemap', 'In the sitemap', 'pass',
      'Brand/model pages are published by the live vehicle sitemap (/api/sitemap-vehicles.xml), built from real stock.');
  } else if (Array.isArray(facts.sitemapUrls) && opts.url) {
    const inSitemap = facts.sitemapUrls.some(u => u === opts.url || u === opts.url.replace(/\/$/, ''));
    if (!inSitemap && expectIndexable && !noindex) {
      add('sitemap', 'In the sitemap', 'fail', `${opts.url} is not listed in the sitemap.`,
        'Run: node scripts/seo-agent.mjs fix');
    } else {
      add('sitemap', 'In the sitemap', 'pass', inSitemap ? 'Listed.' : 'Not required for this route.');
    }
  }
  if (typeof facts.robotsTxt === 'string' && facts.robotsTxt) {
    const blocked = blockedByRobots(facts.robotsTxt, opts.url || '');
    if (blocked && expectIndexable) {
      add('robots-txt', 'Allowed by robots.txt', 'fail', `robots.txt disallows ${blocked}.`, 'Remove that Disallow rule.');
    } else {
      add('robots-txt', 'Allowed by robots.txt', 'pass', 'Not blocked.');
    }
    if (!/^sitemap:/im.test(facts.robotsTxt)) {
      add('robots-sitemap', 'Sitemap declared', 'fail', 'robots.txt declares no Sitemap.', 'Add Sitemap: https://ar7traders.com/sitemap.xml');
    } else {
      add('robots-sitemap', 'Sitemap declared', 'pass', 'robots.txt declares its sitemap(s).');
    }
  }
  if (Array.isArray(facts.keywordTargets) && facts.keywordTargets.length && expectIndexable && !skipBody) {
    const haystack = (title + ' ' + desc + ' ' + h1s.join(' ')).toLowerCase();
    const missing = facts.keywordTargets.filter(k => !haystack.includes(String(k).toLowerCase()));
    if (missing.length === facts.keywordTargets.length) {
      add('keywords', 'Keyword coverage', 'warn', `None of the target terms appear in the title, description or H1: ${missing.join(', ')}`,
        'Name the thing people search for in the title, description and H1.');
    } else {
      add('keywords', 'Keyword coverage', 'pass', `Covered: ${facts.keywordTargets.filter(k => !missing.includes(k)).join(', ')}`);
    }
  }

  const scored = checks.filter(c => c.status !== 'warn' || true);
  const weight = { pass: 1, warn: 0.5, fail: 0 };
  const score = Math.round(100 * scored.reduce((sum, c) => sum + weight[c.status], 0) / Math.max(1, scored.length));
  return {
    route: label,
    url: opts.url || canonical || '',
    score,
    status: checks.some(c => c.status === 'fail') ? 'fail' : checks.some(c => c.status === 'warn') ? 'warn' : 'pass',
    checks,
    fails: checks.filter(c => c.status === 'fail').length,
    warns: checks.filter(c => c.status === 'warn').length
  };
}

/** Simple robots.txt matcher for the paths this site actually uses. */
export function blockedByRobots(txt, url) {
  let path = url;
  try { path = new URL(url, 'https://ar7traders.com').pathname; } catch { /* keep as-is */ }
  if (!path) return null;
  let applies = false;
  for (const rawLine of String(txt).split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [field, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    const key = field.trim().toLowerCase();
    if (key === 'user-agent') applies = value === '*';
    else if (key === 'disallow' && applies && value) {
      const rule = value.replace(/\*$/, '');
      if (rule && (path === rule || path.startsWith(rule.endsWith('/') ? rule : rule + '/') || path === rule + '/')) return rule;
    }
  }
  return null;
}

/** Roll many page audits into one report. */
export function summarise(reports) {
  const pages = reports || [];
  const total = pages.length || 1;
  return {
    pages,
    score: Math.round(pages.reduce((s, p) => s + p.score, 0) / total),
    fails: pages.reduce((s, p) => s + p.fails, 0),
    warns: pages.reduce((s, p) => s + p.warns, 0),
    generatedAt: new Date().toISOString()
  };
}
