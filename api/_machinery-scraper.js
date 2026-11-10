// The machinery scraper — a shared module (api/_*.js), so it costs no
// Serverless Function against the Vercel Hobby cap of 12. It is dispatched
// from api/site-content.js on POST ?import=machinery&step=scraper, next to
// the paste-a-link preview/confirm steps.
//
// WHAT IT DOES
// ------------
// Crawls Made-in-China.com category pages (excavators, loaders, trucks,
// cranes — one page per machine type, or every page in a single run),
// extracts the product links it lists, and runs each link through the SAME
// previewMachine() pipeline as the paste-a-link box. It returns previews only
// — { ok: true, machines: [...] } — and the operator's confirm click is what
// writes anything, exactly as before.
//
// THE RULES IT RUNS ON
// --------------------
//   • robots.txt first, always. Every host's robots.txt is fetched before
//     its first page, parsed, and obeyed. If a host's robots.txt cannot be
//     read (network error or a 5xx), that host is treated as fully
//     DISALLOWED — a scraper that guesses at rules it could not read is how
//     sites get their IPs banned. A 4xx means "unrestricted" per RFC 9309.
//   • Rate limited: at most 24 machines per run and a 1-second pause between
//     every fetch. Marketplace pages change daily; a polite crawler is the
//     one that keeps working.
//   • The honest user agent from the paste-a-link importer. Pretending to be
//     a browser is the behaviour that gets suppliers' pages closed to us.
//   • Photo policy (2026-10-07): imports and lists exactly like the car
//     scraper. Every photograph the supplier page publishes is imported with
//     the 'supplier-listing' basis recorded on it, and a marketplace-hosted
//     (usually watermarked) copy is COUNTED for review instead of dropped —
//     dropping them is what made a scraper run look like it had failed.
//   • Dedupe against the existing catalogue: a link already stored as
//     source_url is never fetched again, and a preview that matches an
//     existing machine (URL or brand+model+year) is skipped, not duplicated.

import { previewMachine, toRow, findExisting } from './_machinery-import.js';
import { machinerySettings, readMachineryRows } from './_machinery.js';
import { relayBaseUrl, relayApiKey, relayRequestHeaders, RELAY_TIMEOUT_MS } from '../scripts/goonet-core.mjs';

/** The honest identity the importer already uses elsewhere. */
export const SCRAPER_UA = 'AR7Traders-Import/1.0 (+https://ar7traders.com)';

export const SCRAPER_ORIGIN = 'https://www.made-in-china.com';

/**
 * One category page per machine type. URLs verified live 2026-10-04 —
 * each is a "Manufacturers & Suppliers" listing whose product links point
 * at supplier-hosted product pages on *.en.made-in-china.com.
 */
export const SCRAPER_CATEGORIES = {
  excavators: '/manufacturers/used-excavator.html',
  loaders: '/manufacturers/used-wheel-loader.html',
  trucks: '/manufacturers/used-dump-truck.html',
  cranes: '/manufacturers/used-truck-crane.html'
};

/**
 * The rate limits. 2026-10-07: the per-run ceiling went from six to 24 so the
 * scraper fills the desk the way the car importer does; the politeness rules
 * are unchanged (robots.txt first, one second between every fetch, honest user
 * agent). `limit` may lower it, never raise it.
 */
export const MAX_SCRAPER_MACHINES = 24;
export const SCRAPER_DELAY_MS = 1000;

/** Per-fetch timeout. A hung supplier page must not hang the function. */
export const SCRAPER_FETCH_TIMEOUT_MS = 10000;

/** Sentinel: a host whose robots.txt could not be read is fully disallowed. */
export const ROBOTS_BLOCKED = Symbol('robots-blocked');

// ---------------------------------------------------------------------------
// robots.txt — fetched first, obeyed always
// ---------------------------------------------------------------------------

/**
 * Parse a robots.txt body into the rules that apply to OUR user agent.
 *
 * Group selection follows RFC 9309: a group applies when its user-agent
 * token (lowercased, up to the first "/") is a substring of our product
 * token; if no specific group matches, every `User-agent: *` group applies.
 * All matching groups are merged. Wildcards (`*`) and the `$` anchor in
 * path patterns are supported — Made-in-China's own robots.txt uses both
 * (e.g. `Disallow: /*html?*`).
 */
export function parseRobotsTxt(text, ua = SCRAPER_UA) {
  const ourToken = String(ua).split('/')[0].toLowerCase();
  const groups = [];
  let current = null;

  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const key = line.slice(0, idx).trim().toLowerCase();
    const value = line.slice(idx + 1).trim();
    if (key === 'user-agent') {
      // Consecutive user-agent lines belong to one group.
      if (!current || current.rules.length) { current = { agents: [], rules: [] }; groups.push(current); }
      current.agents.push(value.toLowerCase());
    } else if ((key === 'disallow' || key === 'allow') && current) {
      current.rules.push({ allow: key === 'allow', pattern: value });
    }
  }

  const specific = groups.filter(g =>
    g.agents.some(a => a && a !== '*' && ourToken.includes(a.split('/')[0])));
  const matched = specific.length ? specific : groups.filter(g => g.agents.includes('*'));

  return matched.flatMap(g => g.rules);
}

/** Compile one robots path pattern into a prefix-matching RegExp. */
function compileRule(pattern) {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body
    .replace(/[.+?^{}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  return new RegExp('^' + escaped + (anchored ? '$' : ''));
}

/**
 * Decide whether a path (with any query string) is allowed under a rule set.
 * The most specific rule wins (longest pattern); on a tie Allow wins, per
 * RFC 9309. No matching rule means allowed. An empty rule set — a 4xx
 * robots.txt — means unrestricted.
 */
export function robotsAllowed(rules, pathWithQuery) {
  if (rules === ROBOTS_BLOCKED) return false;
  const path = String(pathWithQuery || '/');
  let best = null;
  for (const rule of rules || []) {
    if (!rule.pattern) continue; // "Disallow:" with an empty value allows all
    if (!compileRule(rule.pattern).test(path)) continue;
    if (!best || rule.pattern.length > best.pattern.length ||
        (rule.pattern.length === best.pattern.length && rule.allow)) best = rule;
  }
  return best ? best.allow : true;
}

// ---------------------------------------------------------------------------
// Link extraction
// ---------------------------------------------------------------------------

/**
 * Product links from a Made-in-China category page. Two shapes exist:
 *   • /product/<hash>/<Title>.html      — the current supplier-hosted pages;
 *   • /co_<company>/product_<…>.html    — the older locale-subdomain pages.
 * Product-LIST and catalogue pages (/product-list-1.html, /Product-Catalogs/)
 * are deliberately not products. Query strings are dropped because
 * made-in-china.com's robots.txt disallows `*html?*`. Only *.made-in-china.com
 * hosts are kept — anything else is a marketplace redirect we do not follow.
 */
export function extractProductLinks(html, baseUrl) {
  const out = [];
  for (const m of String(html || '').matchAll(/<a\b[^>]*\bhref=["']([^"']+)["']/gi)) {
    const href = m[1].trim();
    if (!href || href.startsWith('#') || /^(?:javascript|mailto|data):/i.test(href)) continue;
    let abs;
    try { abs = new URL(href, baseUrl); } catch { continue; }
    if (!/(^|\.)made-in-china\.com$/i.test(abs.hostname)) continue;
    const p = abs.pathname;
    const isProduct =
      /\/product\/[^/]+\/[^/]+\.html?$/i.test(p) ||
      /(^|\/)product_[^/]+\.html?$/i.test(p);
    if (!isProduct) continue;
    const url = abs.origin + p;
    if (!out.includes(url)) out.push(url);
  }
  return out;
}

const normUrl = u => String(u || '').trim().toLowerCase().replace(/[?#].*$/, '');

// ---------------------------------------------------------------------------
// The run
// ---------------------------------------------------------------------------

/** Bounded, polite retry for transient transport/server failures only, plus
 * ONE relay rescue for IP-reputation walls. Direct attempts never retry
 * 401/403/429 or captcha/bot gates. But 2026-11-04 the marketplace started
 * answering a flat 403 to every request from Vercel's egress IPs — the same
 * datacenter-IP wall goo-net raised against the car importer, on pages it
 * serves to any real visitor. The cure is also the same: when the direct
 * fetch comes back blocked (401/403/429) or dead and a relay key is
 * configured, the page is fetched once through the reader relay the car
 * importer already uses (keyed, rotating proxy pool, plain-HTTP engine).
 * robots.txt is still honoured BEFORE any page is fetched, the pacing between
 * fetches is unchanged, and the honest user agent is what the relay is shown.
 * The caller's deadline caps every timeout, so no rescue can push a preview
 * past the serverless budget. */
export async function fetchWithRetry(url, options = {}) {
  const direct = await directFetchWithRetry(url, options);
  if (direct.ok) return direct;
  const blocked = direct.status === 401 || direct.status === 403 || direct.status === 429;
  if (!blocked && !direct.networkError) return direct; // 404s etc. are honest answers, not walls
  const key = relayApiKey();
  if (!key) return { ...direct, relaySkipped: 'no relay key configured' };
  const { deadline = Infinity, now = Date.now, fetchImpl = globalThis.fetch } = options;
  const remaining = deadline - now();
  if (remaining <= 0) return direct;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), Math.max(1, Math.min(RELAY_TIMEOUT_MS, remaining)));
  try {
    const res = await fetchImpl(relayBaseUrl() + url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: relayRequestHeaders({ userAgent: SCRAPER_UA }),
    });
    if (!res.ok) return { ...direct, relayError: `the relay answered ${res.status}` };
    return { ok: true, status: res.status, text: await res.text(), networkError: false, attempts: direct.attempts + 1, via: 'relay', directStatus: direct.status };
  } catch (error) {
    return { ...direct, relayError: `the relay failed (${error.message})` };
  } finally {
    clearTimeout(timer);
  }
}

async function directFetchWithRetry(url, {
  timeoutMs = SCRAPER_FETCH_TIMEOUT_MS,
  retries = 2,
  backoffMs = 500,
  deadline = Infinity,
  now = Date.now,
  sleep = ms => new Promise(r => setTimeout(r, ms)),
  fetchImpl = globalThis.fetch,
} = {}) {
  const maxAttempts = Math.max(1, Math.min(3, Number(retries) + 1 || 1));
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const remaining = deadline - now();
    if (remaining <= 0) return { ok: false, status: 0, text: '', networkError: true, error: 'Run time budget exhausted', attempts: attempt };
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), Math.max(1, Math.min(timeoutMs, remaining)));
    let transient = false;
    try {
      const res = await fetchImpl(url, {
        signal: ctrl.signal,
        redirect: 'follow',
        headers: { 'user-agent': SCRAPER_UA, accept: 'text/html,application/xhtml+xml' },
      });
      transient = res.status >= 500 && res.status <= 599;
      if (res.ok || !transient || attempt === maxAttempts - 1) {
        return { ok: res.ok, status: res.status, text: res.ok ? await res.text() : '', networkError: false, attempts: attempt + 1 };
      }
    } catch (error) {
      if (attempt === maxAttempts - 1) {
        return { ok: false, status: 0, text: '', networkError: true, error: error.message, attempts: attempt + 1 };
      }
    } finally {
      clearTimeout(timer);
    }
    const wait = Math.min(backoffMs * (2 ** attempt), Math.max(0, deadline - now()));
    if (wait <= 0) return { ok: false, status: 0, text: '', networkError: true, error: 'Run time budget exhausted', attempts: attempt + 1 };
    await sleep(wait);
  }
  return { ok: false, status: 0, text: '', networkError: true, error: 'Retry budget exhausted', attempts: maxAttempts };
}

async function defaultFetch(url, options = {}) {
  return fetchWithRetry(url, options);
}

/** One honest sentence about why a page could not be read, including what the
 *  relay rescue did (or why it never ran). */
export function describeFetchFailure(page) {
  let base = page.networkError ? `network error${page.error ? ': ' + page.error : ''}` : 'the site answered ' + page.status;
  if (page.relayError) base += ` — ${page.relayError}`;
  else if (page.relaySkipped) base += ` — ${page.relaySkipped}`;
  return base;
}

/** Which category pages this run crawls. A known name → that one page; an
 *  unknown or missing name → all four, one per machine type. */
export function categoriesFor(category) {
  const key = String(category || '').trim().toLowerCase();
  if (SCRAPER_CATEGORIES[key]) return [{ key, path: SCRAPER_CATEGORIES[key] }];
  return Object.entries(SCRAPER_CATEGORIES).map(([k, path]) => ({ key: k, path }));
}

/**
 * Crawl and preview. Reads only; the database is read for dedupe and never
 * written. Returns { ok, machines, previews, skipped, warnings, stats } —
 * `machines` is the array the CRM shows for one-click import (each entry is
 * exactly what previewMachine() produced, so confirm writes what was shown).
 *
 * `fetchImpl` and `sleepImpl` are test hooks; production uses the network
 * and the real 1-second pause.
 */
export async function runScraper(db, {
  category = null,
  categories = null,
  limit = null,
  batch = null,
  fetch: fetchImpl = null,
  sleep: sleepImpl = null,
  markup = 0.25,
  now = Date.now,
  budgetMs = 45000
} = {}) {
  const deadline = now() + Math.min(45000, Math.max(0, budgetMs));
  let timedOut = false;
  const exhausted = () => (timedOut ||= now() >= deadline);
  const doFetch = fetchImpl || defaultFetch;
  const sleep = sleepImpl || (ms => new Promise(r => setTimeout(r, ms)));
  const delayMs = SCRAPER_DELAY_MS;

  const warnings = [];
  const skipped = [];
  const machines = [];
  const previews = [];
  const previewRows = []; // prior previews in this run, for brand/model/year dedupe
  const stats = { categories: 0, linksFound: 0, fetched: 0, deduped: 0, robotsBlocked: 0, capped: 0 };

  // How many machines this run may pull. Precedence: the caller's limit, then
  // the `machinery_scraper_batch` setting, then the pinned constant. The
  // setting can only lower the ceiling, never raise it.
  let wanted = Number(limit) > 0 ? Math.floor(Number(limit)) : null;
  if (wanted === null && batch !== null && Number(batch) > 0) wanted = Math.floor(Number(batch));
  if (wanted === null) {
    try {
      const settings = await machinerySettings(db);
      const configured = Number(settings.machinery_scraper_batch);
      if (configured > 0) wanted = Math.floor(configured);
    } catch { /* an unreadable settings table must not stop a crawl */ }
  }
  const maxMachines = Math.max(1, Math.min(MAX_SCRAPER_MACHINES, wanted || MAX_SCRAPER_MACHINES));
  // One category, several, or 'all' — the desk can ask for the whole set in a
  // single run instead of four separate ones.
  const requested = categories == null ? category : categories;
  const cats = (Array.isArray(requested) && !requested.some(name => String(name || '').toLowerCase() === 'all'))
    ? requested.flatMap(name => categoriesFor(name))
    : categoriesFor(Array.isArray(requested) ? null : requested);
  const seenCats = new Set();
  const catList = cats.filter(c => !seenCats.has(c.key) && seenCats.add(c.key) !== false);
  stats.categories = catList.length;

  // ---- dedupe seed: what the catalogue already holds -----------------------
  const existing = await readMachineryRows(db);
  const hiddenExisting = existing.filter(r => r.published !== true && r.source_url)
    .map(r => ({ id: r.id, ref: r.ref, name: [r.brand, r.model].filter(Boolean).join(' '),
      status: r.status, hold_reason: r.hold_reason || null }));
  const seenUrls = new Set(existing.map(r => normUrl(r?.source_url)).filter(Boolean));

  // ---- paced fetch: one delay BEFORE every fetch after the first -----------
  let fetchCount = 0;
  async function pacedFetch(url) {
    if (exhausted() || deadline - now() <= delayMs) {
      timedOut = true;
      return { ok: false, status: 0, networkError: true, text: '', error: 'Run time budget exhausted' };
    }
    if (fetchCount > 0) await sleep(delayMs);
    fetchCount++;
    return doFetch(url, { timeoutMs: Math.max(1, Math.min(SCRAPER_FETCH_TIMEOUT_MS, deadline - now())), deadline, now });
  }

  // ---- robots.txt per host, cached, fail-closed -----------------------------
  const robotsCache = new Map();
  async function rulesFor(host) {
    if (robotsCache.has(host)) return robotsCache.get(host);
    const res = await pacedFetch(`https://${host}/robots.txt`);
    let rules;
    if (res.networkError || res.status >= 500) {
      rules = ROBOTS_BLOCKED; // fail closed: an unreadable rulebook means stop
    } else if (!res.ok) {
      rules = []; // a 4xx robots.txt means "unrestricted" (RFC 9309)
    } else {
      rules = parseRobotsTxt(res.text, SCRAPER_UA);
    }
    robotsCache.set(host, rules);
    return rules;
  }

  async function pathAllowed(url) {
    let u;
    try { u = new URL(url); } catch { return false; }
    const rules = await rulesFor(u.host);
    if (rules === ROBOTS_BLOCKED) return false;
    return robotsAllowed(rules, u.pathname + u.search);
  }

  // ---- 1. collect product links from the category pages ---------------------
  const links = [];
  for (const cat of catList) {
    if (exhausted() || links.length >= maxMachines) break;
    const catUrl = SCRAPER_ORIGIN + cat.path;
    if (!(await pathAllowed(catUrl))) {
      stats.robotsBlocked++;
      warnings.push(`Category "${cat.key}" skipped — robots.txt disallows ${cat.path} (or could not be read).`);
      continue;
    }
    const page = await pacedFetch(catUrl);
    if (!page.ok) {
      warnings.push(`Category "${cat.key}" could not be read (${describeFetchFailure(page)}).`);
      continue;
    }
    const found = extractProductLinks(page.text, catUrl);
    for (const link of found) {
      if (links.includes(link)) continue;
      if (seenUrls.has(normUrl(link))) {
        stats.deduped++;
        skipped.push({ url: link, reason: 'already in the catalogue (source link)', ref: existing.find(r => normUrl(r.source_url) === normUrl(link))?.ref });
        continue;
      }
      links.push(link);
      if (links.length >= maxMachines) break;
    }
  }
  stats.linksFound = links.length;

  // ---- 2. preview each link through the existing pipeline -------------------
  for (const link of links) {
    if (exhausted()) break;
    if (machines.length >= maxMachines) { stats.capped++; continue; }

    if (!(await pathAllowed(link))) {
      stats.robotsBlocked++;
      skipped.push({ url: link, reason: 'robots.txt disallows this page' });
      continue;
    }

    const page = await pacedFetch(link);
    if (!page.ok) {
      warnings.push(`Could not read ${link} (${describeFetchFailure(page)}).`);
      continue;
    }
    stats.fetched++;

    // The exact pipeline the paste-a-link box uses: same extraction, same
    // markup, same owner photo policy (watermarked copies are filtered by
    // toMachine(); the rights basis defaults to 'dropship-authorized').
    const preview = await previewMachine({ url: link, html: page.text, markup });
    if (!preview.ok) {
      warnings.push(`${link}: ${preview.error}`);
      continue;
    }

    const row = toRow(preview.machine, {
      rights: preview.machine.source?.rights || null,
      adapter: preview.machine.source?.adapter || 'product-page'
    });
    const match = findExisting([...existing, ...previewRows], row);
    if (match || seenUrls.has(normUrl(link))) {
      stats.deduped++;
      skipped.push({ url: link, reason: `already in the catalogue (${match?.ref || 'same machine'})` });
      continue;
    }
    seenUrls.add(normUrl(link));
    previewRows.push(row);

    machines.push(preview.machine);
    previews.push({
      machine: preview.machine,
      warnings: preview.warnings,
      review: preview.review,
      source: preview.source
    });
  }

  if (timedOut) warnings.push('Time limit reached. Review and confirm the collected previews, then run again; confirmed source links will be skipped.');
  return {
    ok: true,
    partial: timedOut,
    existingHidden: hiddenExisting,
    machines,
    previews,
    skipped,
    warnings,
    stats: { ...stats, previews: machines.length, delays: Math.max(0, fetchCount - 1) },
    note: 'Previews only — nothing was written. Confirm to import, one machine at a time or in a batch.'
  };
}

export default runScraper;
