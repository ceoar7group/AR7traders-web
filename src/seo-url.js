// URL safety rules shared by the in-site SEO desk and its server-side submitter.
// The site has several sitemap endpoints, but only these canonical sitemap
// URLs are eligible to be sent to search providers.
export const SITE_CANONICAL_ORIGIN = 'https://ar7traders.com';
export const SITE_SITEMAP_PATHS = Object.freeze([
  '/sitemap.xml',
  '/api/sitemap-vehicles.xml',
  '/api/sitemap-machinery.xml',
  '/api/sitemap-news.xml'
]);
export const STAFF_NOINDEX_PATHS = Object.freeze([
  '/crm', '/account', '/portal', '/studio', '/seo'
]);

const decodePath = value => {
  try { return decodeURIComponent(value); } catch { return value; }
};

export function isStaffNoindexPath(pathname) {
  const path = decodePath(String(pathname || '/')).replace(/\/+$/, '') || '/';
  return STAFF_NOINDEX_PATHS.some(root => path === root || path.startsWith(root + '/'));
}

/** Only canonical, same-origin, query-free public URLs may be submitted. */
export function isIndexEligibleUrl(value, {base = SITE_CANONICAL_ORIGIN} = {}) {
  let url;
  let baseUrl;
  try {
    baseUrl = new URL(base);
    url = new URL(String(value), baseUrl);
  } catch { return false; }
  return url.protocol === 'https:' && url.origin === baseUrl.origin &&
    !url.search && !url.hash && !isStaffNoindexPath(url.pathname);
}

export function canonicalSiteUrl(value, {base = SITE_CANONICAL_ORIGIN} = {}) {
  let url;
  let baseUrl;
  try {
    baseUrl = new URL(base);
    url = new URL(String(value), baseUrl);
  } catch { return null; }
  if (url.protocol !== 'https:' || url.origin !== baseUrl.origin || url.search || url.hash) return null;
  // A trailing slash is meaningful only at the origin root.
  if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
  return url.href;
}

export function sitemapSourcesFromRobots(robotsTxt, {base = SITE_CANONICAL_ORIGIN} = {}) {
  const byPath = new Map(SITE_SITEMAP_PATHS.map(path => [path, new URL(path, base).href]));
  const found = [];
  for (const raw of String(robotsTxt || '').split(/\r?\n/)) {
    const match = raw.match(/^\s*sitemap\s*:\s*(\S+)/i);
    if (!match) continue;
    const canonical = canonicalSiteUrl(match[1], {base});
    if (!canonical) continue;
    let path;
    try { path = new URL(canonical).pathname; } catch { continue; }
    const allowed = byPath.get(path);
    if (allowed && !found.includes(allowed)) found.push(allowed);
  }
  // Keep the static public sitemap as a source even if a malformed robots.txt
  // forgot to declare it; the desk reports that declaration separately.
  const staticMap = byPath.get('/sitemap.xml');
  if (staticMap && !found.includes(staticMap)) found.unshift(staticMap);
  return found;
}

function decodeXml(value) {
  return String(value || '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export function sitemapLocations(xml) {
  const urls = [];
  for (const match of String(xml || '').matchAll(/<loc\b[^>]*>([\s\S]*?)<\/loc\s*>/gi)) {
    const loc = decodeXml(match[1].trim());
    if (loc && !urls.includes(loc)) urls.push(loc);
  }
  return urls;
}

/**
 * Filter URLs from real sitemap responses. Draft paths are supplied as slugs
 * from authenticated site_articles rows; unknown news paths are not guessed to
 * be public. This helper has no network or database side effects.
 */
export function filterIndexingCandidates(values, {
  base = SITE_CANONICAL_ORIGIN,
  draftSlugs = [],
  publishedNewsSlugs = null,
  noindexUrls = []
} = {}) {
  const drafts = new Set((draftSlugs || []).map(String));
  const published = publishedNewsSlugs == null ? null : new Set(publishedNewsSlugs.map(String));
  const noindex = new Map();
  for (const value of noindexUrls || []) {
    const url = canonicalSiteUrl(value, {base});
    if (url) noindex.set(url, 'The fetched page declares noindex.');
  }
  const eligibleUrls = [];
  const excluded = [];
  const seen = new Set();

  for (const original of Array.isArray(values) ? values : []) {
    const url = canonicalSiteUrl(original, {base});
    if (!url) {
      excluded.push({url: String(original || ''), reason: 'Not a canonical HTTPS URL on this site, or it contains a query/hash.'});
      continue;
    }
    if (seen.has(url)) continue;
    seen.add(url);
    const parsed = new URL(url);
    if (isStaffNoindexPath(parsed.pathname)) {
      excluded.push({url, reason: 'Staff or noindex route.'});
      continue;
    }
    if (noindex.has(url)) {
      excluded.push({url, reason: noindex.get(url)});
      continue;
    }
    const newsMatch = parsed.pathname.match(/^\/news\/([^/]+)\/?$/i);
    if (newsMatch) {
      let slug = newsMatch[1];
      try { slug = decodeURIComponent(slug); } catch { /* retain encoded text */ }
      if (drafts.has(slug)) {
        excluded.push({url, reason: 'Unpublished article draft.'});
        continue;
      }
      if (published && !published.has(slug)) {
        excluded.push({url, reason: 'No published article matches this news URL.'});
        continue;
      }
    }
    eligibleUrls.push(url);
  }
  return {eligibleUrls, excluded};
}
