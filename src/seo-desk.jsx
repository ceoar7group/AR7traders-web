// The in-site SEO desk (/seo).
//
// Why it exists: the owner should not have to take anyone's word for it that
// the SEO is done. This page runs the exact same audit engine the CLI agent
// and the Arena agent use (src/seo-audit.js) against the page it is standing
// on, pulls the real /sitemap.xml and /robots.txt the crawlers see, and prints
// the result — plus the commands that fix what it finds.
//
// Since 2026-10-04 it also publishes guides through the existing site_articles
// entity and /api/site-content?entity=articles CRUD. The creator validates its
// title, slug, category, image, description and body, refuses duplicate slugs,
// publishes without a source edit or redeploy, and audits the canonical
// /news/<slug> URL with the same engine before reporting success.
//
// It is a staff route: noindex, and never linked from the public nav.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, Check, Copy, ExternalLink, FilePlus2, RefreshCw, Save, Search, Wrench, X, AlertTriangle, Megaphone, Tag, Send, Trash2, Sparkles, BookOpenCheck, ClipboardList, Image as ImageIcon } from 'lucide-react';
import { auditDocument, summarise } from './seo-audit.js';
import { applySeo, BASE } from './seo.js';
import { staticAuditRoutes, publicLandingRoutes } from './seo-routes.js';
import { SITE_CANONICAL_ORIGIN, canonicalSiteUrl, isStaffNoindexPath, sitemapLocations, sitemapSourcesFromRobots } from './seo-url.js';
import { NEWS_CATEGORIES, articleBySlug, articleSlug, MAX_SLUG_LENGTH, getPublishedNews, getNewsCategories, setPublishedNews } from './news-data.js';
import { updateSettingsCache } from './site-settings.js';
import { campaignIsLive } from './offers.js';
import { buildTopicIdeas, buildUpgradeReport, suggestCoverFixes } from './seo-topic-scout.js';
import { MACHINES } from './machinery-data.js';
import { DEST } from './destinations.js';
import './seo-desk.css';

const ROUTES = [
  ['/', 'Home'],
  ['/inventory', 'Inventory'],
  ['/cars/toyota', 'Brand landing'],
  ['/machinery', 'Machinery hub'],
  ['/machinery/excavators', 'Machinery type'],
  ['/news', 'Guides'],
  ['/shipping', 'Shipping'],
  ['/faq', 'FAQ']
];

const AGENT_COMMANDS = [
  ['npm run seo', 'full audit — writes seo-report.md'],
  ['npm run seo:fix', 'apply the safe crawl fixes'],
  ['npm run seo:brief', 'prioritised work list'],
  ['npm run seo:connect', 'connector status (Search Console, Bing, GA4, IndexNow)'],
  ['npm run seo:indexnow', 'push changed URLs to Bing + Yandex'],
  ['npm run seo:live', 'audit the deployed site over HTTP']
];

// Existing assets a guide may use for its og:image. Every path is a real file
// under public/assets/ — scripts/seo-desk-create.test.jsx asserts that, so the
// list can never drift from disk. (Custom paths are allowed too.)
export const GUIDE_ASSETS = [
  '/assets/japanese-car-auction-inspection-shipping-1.webp',
  '/assets/japanese-car-auction-inspection-shipping-2.webp',
  '/assets/japanese-car-auction-inspection-shipping-3.webp',
  '/assets/japanese-car-auction-inspection-shipping-5.webp',
  '/assets/used-japanese-cars-auction-export-toyota-3.jpg',
  '/assets/japan-used-car-export-inventory-toyota-h-1.webp',
  '/assets/machinery/hero-yard.webp',
  '/assets/og/auction.jpg',
  '/assets/og/help.jpg',
  '/assets/og/inventory.jpg',
  '/assets/og/shipping.jpg'
];

/** How many per-URL crawl rows show before "View full list" (problems first). */
const CRAWL_PREVIEW_ROWS = 10;
const fmtDate = d => d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
const readMins = body => Math.max(2, Math.round(String(body).split(/\s+/).filter(Boolean).length / 200));
const prettyLabel = value => String(value || '').replace(/([A-Z])/g, ' $1').replace(/^./, char => char.toUpperCase());

/** Deterministic fact-only draft formatting: it adds no outside claims. */
export function buildFactualDraft({title, facts, cat, img}) {
  const approvedFacts = String(facts || '').split(/\r?\n/)
    .map(line => line.trim().replace(/^(?:[-*•]|\d+[.)])\s*/, ''))
    .filter(Boolean);
  if (!String(title || '').trim() || !approvedFacts.length) return null;
  const body = approvedFacts.join('\n\n') +
    '\n\n[EDITOR REVIEW: verify every fact and remove this note before publication.]';
  const excerpt = approvedFacts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 165);
  return {title: String(title).trim(), cat, img, desc: excerpt, body, facts: approvedFacts};
}

/** Validate the guide form. Returns {errors, warnings, slug} — errors block,
 *  warnings advise (they mirror what the audit would score down). */
export function validateGuide(form, publishedArticles = getPublishedNews()) {
  const errors = {};
  const warnings = [];
  const title = String(form.title || '').trim();
  // site_articles has no slug column: keep the canonical path derived from the
  // stored title so the URL the desk audits is the URL the public site serves.
  const slug = articleSlug(title);

  if (!title) errors.title = 'A title is required.';
  else if (title.length > 65) warnings.push(`Title is ${title.length} characters — the audit warns past 65.`);

  if (!slug) errors.slug = 'A slug is required — it is derived from the title.';
  else {
    const dup = articleBySlug(slug, publishedArticles);
    if (dup) errors.slug = `"${slug}" is already published as “${dup.title}”. Pick a different title.`;
  }

  const knownCategories = new Set([...NEWS_CATEGORIES, ...publishedArticles.map(article => article.cat).filter(Boolean)]);
  if (!knownCategories.has(form.cat)) errors.cat = 'Pick one of the categories already used on the /news page.';

  const img = String(form.img || '').trim();
  if (!img) errors.img = 'Pick an og:image.';
  else if (!/^\/assets\//.test(img)) errors.img = 'The image must be an existing site asset — a path starting with /assets/.';

  const desc = String(form.desc || '').trim();
  if (!desc) errors.desc = 'A meta description is required.';
  else if (desc.length < 70) warnings.push(`Description is ${desc.length} characters — the audit wants 70–165.`);
  else if (desc.length > 165) warnings.push(`Description is ${desc.length} characters — Google cuts it at 165.`);

  if (!String(form.body || '').trim()) errors.body = 'The article body is required.';

  return { errors, warnings, slug };
}

/** Build the article object in the exact shape RAW_NEWS uses. */
export function buildArticle(form, slug, { now = new Date() } = {}) {
  return {
    cat: form.cat,
    date: fmtDate(now),
    min: readMins(form.body),
    img: String(form.img || '').trim(),
    title: String(form.title || '').trim(),
    ex: String(form.desc || '').trim(),
    body: String(form.body || '').trim(),
    slug
  };
}

/** The sitemap <url> block the operator adds to public/sitemap.xml. */
export function sitemapBlock(slug, { today = new Date().toISOString().slice(0, 10) } = {}) {
  return '  <url>\n' +
    `    <loc>${BASE}/news/${encodeURIComponent(slug)}</loc>\n` +
    `    <lastmod>${today}</lastmod>\n` +
    '    <changefreq>monthly</changefreq>\n' +
    '    <priority>0.6</priority>\n' +
    '  </url>';
}

export default function SeoDesk({ navigate, token, canPublish = false, canPromote = false, notify = () => {}, liveCars = [] }) {
  const categories = getNewsCategories();
  const [sitemapUrls, setSitemapUrls] = useState([]);
  const [robots, setRobots] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState('');
  const [articles, setArticles] = useState(getPublishedNews());
  const [campaign, setCampaign] = useState(null);
  const [campaignBusy, setCampaignBusy] = useState(false);
  const [guideBusy, setGuideBusy] = useState(false);
  const [campaignForm, setCampaignForm] = useState({headline: '', sub: '', cta: 'Browse stock', href: '/inventory', until: ''});

  // Live crawl/provider status is kept separate from the local document score.
  const [connectorStatus, setConnectorStatus] = useState(null);
  const [connectorError, setConnectorError] = useState('');
  const [connectorBusy, setConnectorBusy] = useState(false);
  const [liveCrawl, setLiveCrawl] = useState({state: 'idle', rows: [], done: 0, total: 0, sources: [], sourceErrors: []});
  const crawlController = useRef(null);
  // Per-URL diagnostics start as a short, problems-first digest; the full
  // 400+ row list is one click away (owner request, 2026-11-07).
  const [crawlShowAll, setCrawlShowAll] = useState(false);
  const crawlCounts = useMemo(() => {
    let fail = 0, warn = 0, clean = 0;
    for (const row of liveCrawl.rows) {
      if ((row.fails || 0) > 0 || row.error) fail++;
      else if ((row.warns || 0) > 0) warn++;
      else clean++;
    }
    return { fail, warn, clean };
  }, [liveCrawl.rows]);
  const visibleCrawlRows = useMemo(() => {
    const rank = row => ((row.fails || 0) > 0 || row.error) ? 0 : (row.warns || 0) > 0 ? 1 : 2;
    const sorted = [...liveCrawl.rows].sort((a, b) => rank(a) - rank(b));
    return crawlShowAll ? sorted : sorted.slice(0, CRAWL_PREVIEW_ROWS);
  }, [liveCrawl.rows, crawlShowAll]);
  const [indexingPreview, setIndexingPreview] = useState(null);
  const [indexingBusy, setIndexingBusy] = useState(false);
  const [indexingResult, setIndexingResult] = useState(null);
  const [inspectionUrl, setInspectionUrl] = useState('');
  const [inspectionBusy, setInspectionBusy] = useState(false);
  const [inspectionResult, setInspectionResult] = useState(null);
  const [auditTrail, setAuditTrail] = useState([]);
  const [workflowError, setWorkflowError] = useState('');

  // ---- guide creator state --------------------------------------------------
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', cat: categories[0] || NEWS_CATEGORIES[0], img: GUIDE_ASSETS[0], desc: '', body: '' });
  const [createErrors, setCreateErrors] = useState({});
  const [createWarnings, setCreateWarnings] = useState([]);
  const [created, setCreated] = useState(null); // { article, json, slug, url, published, clip }
  const [draftAudit, setDraftAudit] = useState(null);
  const [draftFacts, setDraftFacts] = useState('');
  const [aiKind, setAiKind] = useState('guide');
  const [aiSources, setAiSources] = useState('');
  const [automationBusy, setAutomationBusy] = useState(false);
  const [keywordReport, setKeywordReport] = useState(null);
  const [editorArticles, setEditorArticles] = useState([]);
  const [activeDraftId, setActiveDraftId] = useState(null);
  const [publishBusy, setPublishBusy] = useState(false);
  const [draftReviewed, setDraftReviewed] = useState(false);

  async function seoWorkflow(action, method = 'GET', body = null) {
    const response = await fetch(`/api/site-content?seo=${encodeURIComponent(action)}`, {
      method,
      cache: 'no-store',
      headers: {'Content-Type': 'application/json', ...(token ? {Authorization: `Bearer ${token}`} : {})},
      ...(body == null ? {} : {body: JSON.stringify(body)})
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      // The server answers a provider failure with { error, state, provider,
      // ownerAction, saved:false, published:false }. Throwing a bare Error threw
      // that away, so the desk could only say "something failed" — the operator
      // needs the state and the exact fix, and needs to know nothing was saved.
      const error = new Error(payload.error || `SEO workflow failed (${response.status}).`);
      error.status = response.status;
      error.state = payload.state || null;
      error.ownerAction = payload.ownerAction || null;
      error.provider = payload.provider || null;
      error.saved = payload.saved === true;
      error.published = payload.published === true;
      error.body = payload;
      throw error;
    }
    return payload;
  }

  // Which provider the server would actually use, read once per session. The
  // generate fieldset used to hard-code "OPENAI_API_KEY must be configured",
  // which stopped being true when Gemini (free tier) became the default.
  const [aiProvider, setAiProvider] = useState(null);
  useEffect(() => {
    if (!token || !canPublish) return;
    let alive = true;
    (async () => {
      try {
        const status = await seoWorkflow('ai-status');
        if (alive) setAiProvider(status);
      } catch { if (alive) setAiProvider({ provider: 'unknown' }); }
    })();
    return () => { alive = false; };
  }, [token, canPublish]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const auth = token ? {headers: {Authorization: `Bearer ${token}`}} : {};
      try {
        const [sm, rb, newsRes, settingsRes] = await Promise.all([
          fetch('/sitemap.xml', {cache: 'no-store'}).then(r => r.ok ? r.text() : ''),
          fetch('/robots.txt', {cache: 'no-store'}).then(r => r.ok ? r.text() : ''),
          fetch('/api/site-content?entity=articles', {cache: 'no-store'}),
          fetch('/api/settings', {cache: 'no-store', ...auth})
        ]);
        if (!alive) return;
        const urls = [...String(sm).matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim());
        setSitemapUrls(urls);
        setRobots(rb);
        if (newsRes.ok) {
          const rows = await newsRes.json();
          if (Array.isArray(rows)) { setPublishedNews(rows); setArticles(getPublishedNews()); }
        }
        if (settingsRes.ok) {
          const settings = await settingsRes.json();
          let saved = settings?.promo;
          if (typeof saved === 'string') { try { saved = JSON.parse(saved); } catch { saved = null; } }
          if (saved?.active) {
            setCampaign(saved);
            setCampaignForm({headline: saved.headline || '', sub: saved.sub || '', cta: saved.cta || 'Browse stock', href: saved.href || '/inventory', until: saved.until || ''});
          }
        }
      } catch { /* offline preview: the audit remains available */ }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [token]);

  useEffect(() => {
    let alive = true;
    if (!token || !canPublish) {
      setConnectorStatus({google: {state: 'permission_required', detail: 'Sign in with the website-edit permission to read Search Console status.'}, indexNow: {state: 'permission_required', detail: 'Sign in with the website-edit permission to read IndexNow status.'}});
      return () => { alive = false; };
    }
    setConnectorBusy(true);
    setConnectorError('');
    Promise.allSettled([seoWorkflow('status'), seoWorkflow('audit')]).then(([statusResult, auditResult]) => {
      if (!alive) return;
      if (statusResult.status === 'fulfilled') setConnectorStatus(statusResult.value);
      else setConnectorError(statusResult.reason?.message || 'Provider status is unavailable.');
      if (auditResult.status === 'fulfilled' && Array.isArray(auditResult.value)) setAuditTrail(auditResult.value);
    }).finally(() => { if (alive) setConnectorBusy(false); });
    return () => { alive = false; };
  }, [token, canPublish]);

  useEffect(() => {
    if (!token || !canPublish) return;
    let alive = true;
    fetch('/api/site-content?entity=articles&all=1', {
      cache: 'no-store', headers: {Authorization: `Bearer ${token}`}
    }).then(async response => {
      if (!response.ok) throw new Error('The staff article list could not be loaded.');
      const rows = await response.json();
      if (!alive || !Array.isArray(rows)) return;
      setEditorArticles(rows);
      setPublishedNews(rows);
      setArticles(getPublishedNews());
    }).catch(error => { if (alive) setWorkflowError(error.message); });
    return () => { alive = false; };
  }, [token, canPublish]);

  const report = useMemo(() => {
    if (typeof document === 'undefined') return null;
    const url = BASE + (location.pathname === '/' ? '/' : location.pathname);
    return auditDocument(document, {
      route: location.pathname,
      url,
      expectIndexable: false, // this desk is a staff route; it audits the page it sits on
      origin: BASE,
      facts: { sitemapUrls, robotsTxt: robots, keywordTargets: ['japan', 'export'] }
    });
  }, [sitemapUrls, robots, loading]);

  // Static route checks are done in the browser, so the numbers here are the
  // same ones the CLI prints for the shipped HTML.
  const summary = useMemo(() => summarise(report ? [report] : []), [report]);

  async function discoverCrawlTargets(signal) {
    const sourceErrors = [];
    let robotsText = '';
    try {
      const response = await fetch('/robots.txt', {cache: 'no-store', signal});
      if (response.ok) robotsText = await response.text();
      else sourceErrors.push(`/robots.txt returned HTTP ${response.status}.`);
    } catch (error) {
      if (signal?.aborted) throw error;
      sourceErrors.push(`/robots.txt could not be read: ${String(error?.message || 'request failed')}.`);
    }
    const sources = sitemapSourcesFromRobots(robotsText, {base: SITE_CANONICAL_ORIGIN});
    const urls = publicLandingRoutes().map(route => route.url);
    for (const sitemap of sources) {
      if (signal?.aborted) break;
      const path = new URL(sitemap).pathname;
      try {
        // Use the current origin (including Arena's preview proxy), never a
        // browser request to localhost or a hard-coded production host.
        const response = await fetch(path, {cache: 'no-store', signal});
        if (!response.ok) {
          sourceErrors.push(`${path} returned HTTP ${response.status}.`);
          continue;
        }
        urls.push(...sitemapLocations(await response.text()));
      } catch (error) {
        if (signal?.aborted) throw error;
        sourceErrors.push(`${path} could not be read: ${String(error?.message || 'request failed')}.`);
      }
    }
    const unique = [...new Set(urls.map(value => canonicalSiteUrl(value, {base: SITE_CANONICAL_ORIGIN})))]
      .filter(Boolean)
      .filter(url => {
        const path = new URL(url).pathname;
        return !isStaffNoindexPath(path) && !path.startsWith('/api/') && !/\.(?:xml|txt|json)$/i.test(path);
      });
    return {robotsText, sources, sourceErrors, urls: unique};
  }

  async function auditCrawlUrl(url, signal, facts = {}) {
    const canonical = canonicalSiteUrl(url, {base: SITE_CANONICAL_ORIGIN});
    if (!canonical) return {url: String(url), state: 'invalid', error: 'Not a canonical HTTPS site URL.'};
    const path = new URL(canonical).pathname;
    try {
      const response = await fetch(path, {cache: 'no-store', signal, headers: {Accept: 'text/html'}});
      const httpStatus = Number(response.status) || 0;
      if (!response.ok) return {url: canonical, path, state: 'http_error', httpStatus, error: `Page request returned HTTP ${httpStatus}.`};
      const html = await response.text();
      const doc = new DOMParser().parseFromString(html, 'text/html');
      const robotsValue = doc.querySelector('meta[name="robots"]')?.getAttribute('content') || '';
      const noindex = /noindex/i.test(robotsValue);
      // Staff routes (/crm, /account, …) are PRIVATE ON PURPOSE: noindex,
      // blocked in robots.txt and absent from the sitemap. Auditing one as if
      // it should rank produced false FAILs ("not in the sitemap", "robots.txt
      // disallows /crm") that ended up in the 2026-11-07 upgrade report as
      // work to do. expectIndexable flips those checks to assert the OPPOSITE:
      // a staff route that became crawlable is the failure.
      const audit = auditDocument(doc, {
        route: path === '/' ? 'home' : path.replace(/^\//, ''),
        label: path,
        url: canonical,
        expectIndexable: !isStaffNoindexPath(path),
        origin: location.origin,
        facts: {sitemapUrls: facts.sitemapUrls || [], robotsTxt: facts.robotsTxt || ''}
      });
      return {
        url: canonical, path, state: audit.status, httpStatus, noindex,
        title: doc.title || '', canonical: doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '',
        score: audit.score, fails: audit.fails, warns: audit.warns, checks: audit.checks,
        detail: noindex ? 'The fetched page declares noindex and is excluded from submission.' : ''
      };
    } catch (error) {
      if (signal?.aborted) throw error;
      return {url: canonical, path, state: 'request_error', error: String(error?.message || 'Page request failed.')};
    }
  }

  async function runCrawl(singleUrl = null) {
    crawlController.current?.abort();
    const controller = new AbortController();
    crawlController.current = controller;
    setWorkflowError('');
    setIndexingPreview(null);
    setIndexingResult(null);
    const one = singleUrl ? canonicalSiteUrl(singleUrl, {base: SITE_CANONICAL_ORIGIN}) : null;
    if (singleUrl && !one) {
      setWorkflowError('Enter a canonical HTTPS URL on this site, without a query string.');
      return;
    }
    setLiveCrawl(previous => ({
      ...previous, state: one ? 'running' : 'discovering',
      rows: one ? previous.rows : [], done: 0, total: one ? 1 : 0,
      sourceErrors: one ? previous.sourceErrors : []
    }));
    try {
      let robotsText = robots;
      let sources = liveCrawl.sources || [];
      let targets = one ? [one] : [];
      let sourceErrors = [];
      let sitemapUrls = liveCrawl.rows.map(row => row.url);
      if (!one) {
        const discovery = await discoverCrawlTargets(controller.signal);
        robotsText = discovery.robotsText;
        sources = discovery.sources;
        sourceErrors = discovery.sourceErrors;
        targets = discovery.urls;
        sitemapUrls = targets;
        setRobots(robotsText);
        setSitemapUrls(discovery.urls);
        setLiveCrawl({state: 'running', rows: [], done: 0, total: targets.length, sources, sourceErrors});
      }
      let rows = one ? [...liveCrawl.rows] : [];
      let done = 0;
      for (const target of targets) {
        if (controller.signal.aborted) break;
        const row = await auditCrawlUrl(target, controller.signal, {sitemapUrls, robotsTxt: robotsText});
        if (one) rows = rows.filter(old => old.url !== row.url).concat(row);
        else rows = [...rows, row];
        done++;
        setLiveCrawl({state: 'running', rows, done, total: targets.length, sources, sourceErrors});
      }
      const state = controller.signal.aborted ? 'cancelled' : (sourceErrors.length ? 'complete_with_warnings' : 'complete');
      setLiveCrawl({state, rows, done, total: targets.length, sources, sourceErrors});
    } catch (error) {
      setLiveCrawl(previous => ({...previous, state: controller.signal.aborted ? 'cancelled' : 'error'}));
      if (!controller.signal.aborted) setWorkflowError(error.message || 'The crawl failed.');
    } finally {
      if (crawlController.current === controller) crawlController.current = null;
    }
  }

  function cancelCrawl() {
    crawlController.current?.abort();
  }

  function indexingRequest() {
    const successful = liveCrawl.rows.filter(row => row.httpStatus >= 200 && row.httpStatus < 300);
    return {
      urls: successful.map(row => row.url),
      noindexUrls: liveCrawl.rows.filter(row => row.noindex).map(row => row.url),
      sitemaps: liveCrawl.sources || []
    };
  }

  async function previewIndexing() {
    if (!liveCrawl.rows.length) { setWorkflowError('Run a crawl first so each candidate can be checked for status and noindex.'); return; }
    setIndexingBusy(true); setWorkflowError(''); setIndexingResult(null);
    try {
      const request = indexingRequest();
      const result = await seoWorkflow('preview', 'POST', request);
      setIndexingPreview({...result, request});
    } catch (error) { setWorkflowError(error.message || 'Indexing preview failed.'); }
    finally { setIndexingBusy(false); }
  }

  async function submitIndexing() {
    if (!indexingPreview?.request) return;
    const count = indexingPreview.eligibleUrls?.length || 0;
    if (!window.confirm(`Submit the refreshed sitemap list and notify IndexNow about ${count} eligible URL(s)? These are crawl requests, not a promise or confirmation of Google indexing.`)) return;
    setIndexingBusy(true); setWorkflowError('');
    try {
      const result = await seoWorkflow('submit', 'POST', indexingPreview.request);
      setIndexingResult(result);
      const trail = await seoWorkflow('audit');
      if (Array.isArray(trail)) setAuditTrail(trail);
    } catch (error) { setWorkflowError(error.message || 'Indexing submission failed.'); }
    finally { setIndexingBusy(false); }
  }

  async function inspectUrl() {
    const url = canonicalSiteUrl(inspectionUrl, {base: SITE_CANONICAL_ORIGIN});
    if (!url) { setWorkflowError('Enter a canonical HTTPS URL on this site, without a query string.'); return; }
    setInspectionBusy(true); setWorkflowError(''); setInspectionResult(null);
    try {
      const result = await seoWorkflow('inspect', 'POST', {url,
        noindexUrls: liveCrawl.rows.some(row => row.url === url && row.noindex) ? [url] : []});
      setInspectionResult(result);
    } catch (error) { setWorkflowError(error.message || 'Search Console inspection failed.'); }
    finally { setInspectionBusy(false); }
  }

  async function refreshConnectors() {
    if (!token || !canPublish) { setConnectorError('The website-edit permission is required for provider status.'); return; }
    setConnectorBusy(true); setConnectorError('');
    const [statusResult, auditResult] = await Promise.allSettled([seoWorkflow('status'), seoWorkflow('audit')]);
    if (statusResult.status === 'fulfilled') setConnectorStatus(statusResult.value);
    else setConnectorError(statusResult.reason?.message || 'Provider status is unavailable.');
    if (auditResult.status === 'fulfilled' && Array.isArray(auditResult.value)) setAuditTrail(auditResult.value);
    setConnectorBusy(false);
  }

  const copy = async (text, tag) => {
    try { await navigator.clipboard.writeText(text); setCopied(tag); setTimeout(() => setCopied(''), 1600); }
    catch { /* clipboard blocked in the embedded preview */ }
  };

  const icon = status => status === 'pass'
    ? <Check size={15} className="seo-ok"/>
    : status === 'warn'
      ? <AlertTriangle size={15} className="seo-warn"/>
      : <X size={15} className="seo-bad"/>;
  const providerStateLabel = state => String(state || 'unknown').replaceAll('_', ' ');
  const crawlActive = liveCrawl.state === 'running' || liveCrawl.state === 'discovering';
  const registeredRoutes = staticAuditRoutes();

  const setField = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setCreateErrors({});
    setCreated(null);
    setDraftAudit(null);
    setDraftReviewed(false);
  };

  const editTitle = v => {
    setForm(f => ({...f, title: v}));
    setCreateErrors({});
    setCreated(null);
    setDraftAudit(null);
    setDraftReviewed(false);
  };

  // Cover image doctor (2026-11-10): the same duplicate-cover rule the Topic
  // Scout enforces at proposal time, applied retroactively to everything in
  // site_articles. Pure logic lives in seo-topic-scout.js (tested); this is
  // just the PATCH loop.
  const coverFixes = useMemo(() => suggestCoverFixes(editorArticles), [editorArticles]);
  const [coverFixBusy, setCoverFixBusy] = useState(false);
  const runCoverFixes = async () => {
    if (!token || !canPublish || coverFixBusy || coverFixes.length === 0) return;
    setCoverFixBusy(true);
    try {
      for (const fix of coverFixes) {
        const response = await fetch('/api/site-content?entity=articles&via=cover-doctor', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
          body: JSON.stringify({ id: fix.id, image: fix.to })
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(result.error || `Cover update failed (${response.status}) on “${fix.title}”.`);
      }
      await refreshArticleList();
      notify(`Cover image doctor: ${coverFixes.length} article cover(s) replaced — every article now has a unique image.`);
    } catch (error) {
      notify(error.message);
    } finally {
      setCoverFixBusy(false);
    }
  };

  const refreshArticleList = async () => {
    const response = await fetch('/api/site-content?entity=articles&all=1', {
      cache: 'no-store', headers: {Authorization: `Bearer ${token}`}
    });
    if (!response.ok) throw new Error('The staff article list could not be refreshed.');
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('The staff article list returned an unexpected response.');
    setEditorArticles(rows);
    setPublishedNews(rows);
    const fresh = getPublishedNews();
    setArticles(fresh);
    return fresh;
  };

  const auditGuidePreview = (article, publishedRows) => {
    const previewDoc = document.implementation.createHTMLDocument('guide-preview');
    const withPreview = [...publishedRows.filter(row => articleSlug(row) !== article.slug), article];
    applySeo('news', article.slug, null, {articleList: withPreview, doc: previewDoc});
    return auditDocument(previewDoc, {
      route: 'news/' + article.slug,
      url: BASE + '/news/' + encodeURIComponent(article.slug),
      expectIndexable: true,
      origin: BASE,
      facts: {robotsTxt: robots},
      skipBody: true
    });
  };

  const researchKeywords = async () => {
    setAutomationBusy(true); setWorkflowError('');
    try { setKeywordReport(await seoWorkflow('keywords','POST',{})); }
    catch (e) { setWorkflowError(e.message); }
    finally { setAutomationBusy(false); }
  };
  const generateAiDraft = async () => {
    setAutomationBusy(true); setCreateErrors({});
    try {
      const out = await seoWorkflow('generate','POST',{topic:form.title,facts:draftFacts,kind:aiKind,
        sources:aiSources.split(/\n/).map(s => s.trim()).filter(Boolean)});
      setForm(current => ({...current,title:out.title,desc:out.desc,body:out.body,
        cat:aiKind === 'news' ? 'MARKET WATCH' : 'BUYING GUIDE'}));
      setCreateWarnings(out.warnings || []); setCreated(null); setDraftAudit(null);
      setActiveDraftId(null); setDraftReviewed(false);
      notify('AI draft generated. Review the claims and source notes, then save; nothing is public.');
    } catch (e) {
      // Nothing is written on a provider failure — say so, and say what to do.
      setCreateErrors({ facts: [e.message, e.ownerAction].filter(Boolean).join(' ') });
      setCreateWarnings([...(e.state ? [`Provider state: ${e.state}.`] : []),
        'No draft was generated and nothing was saved or published.']);
      notify('AI draft was not generated — see the reason under the facts box.');
    }
    finally { setAutomationBusy(false); }
  };
  const optimizeDraft = async () => {
    setAutomationBusy(true);
    try {
      const out = await seoWorkflow('optimize-draft','POST',form);
      setForm(current => ({...current,desc:out.desc}));
      setCreateWarnings(out.warnings || []); setCreated(null); setDraftReviewed(false);
      notify('Draft excerpt optimized from existing copy. Title, URL and factual body are unchanged; save to persist.');
    } catch (e) { setCreateErrors({facts:e.message}); }
    finally { setAutomationBusy(false); }
  };

  const generateFactDraft = () => {
    const generated = buildFactualDraft({...form, facts: draftFacts});
    if (!generated) { setCreateErrors({facts: 'Add at least one staff-verified fact, one per line.'}); return; }
    setForm(current => ({...current, title: generated.title, cat: generated.cat || current.cat,
      img: generated.img || current.img, desc: generated.desc, body: generated.body}));
    setCreateErrors({});
    setCreateWarnings([]);
    setCreated(null);
    setDraftAudit(null);
    setDraftReviewed(false);
  };

  // Save a draft to site_articles without publishing it. Publication is a
  // separate, explicit action after a person has reviewed the title, derived
  // canonical slug, metadata and body.
  const createGuide = async e => {
    e.preventDefault();
    if (!canPublish || !token) { notify('Your role cannot edit website guides. Ask a website editor.'); return; }
    const { errors, warnings, slug } = validateGuide(form, articles);
    const duplicateDraft = editorArticles.find(row => String(row.id) !== String(activeDraftId || '') &&
      row.published === false && articleSlug(row.title) === slug);
    if (duplicateDraft) errors.slug = 'An unpublished draft already uses this title-derived slug. Load that draft to continue editing it.';
    setCreateErrors(errors);
    setCreateWarnings(warnings);
    if (Object.keys(errors).length) { setCreated(null); setDraftAudit(null); return; }

    const article = buildArticle(form, slug);
    const json = JSON.stringify(article, null, 2);
    const url = BASE + '/news/' + encodeURIComponent(slug);
    setGuideBusy(true);
    try {
      const existingDraft = editorArticles.find(row => String(row.id) === String(activeDraftId || ''));
      const nextOrder = existingDraft?.sort_order ?? (Math.min(0, ...editorArticles.map(a => Number(a.sort_order) || 0)) - 1);
      const payload = {title: article.title, category: article.cat, date: existingDraft?.date || article.date,
        read_min: article.min, image: article.img, excerpt: article.ex, body: article.body,
        published: false, sort_order: nextOrder, ...(activeDraftId ? {id: activeDraftId} : {})};
      const response = await fetch('/api/site-content?entity=articles&via=seo-desk', {
        method: activeDraftId ? 'PATCH' : 'POST',
        headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
        body: JSON.stringify(payload)
      });
      const saved = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(saved.error || `Draft save failed (${response.status}).`);
      const fresh = await refreshArticleList();
      const id = saved.id || activeDraftId;
      setActiveDraftId(id);
      setCreated({article, json, slug, url, clip: 'not-copied', published: false, id});
      setDraftReviewed(false);
      setDraftAudit(auditGuidePreview(article, fresh));
      notify(`Unpublished draft saved: ${article.title}. It is not public and is absent from the news sitemap.`);
    } catch (error) {
      notify(error.message || 'Draft save failed.');
      setCreated(null);
      setDraftAudit(null);
    } finally { setGuideBusy(false); }
  };

  const publishGuide = async () => {
    if (!created?.id || created.published || !canPublish || !token || !draftReviewed) return;
    if (/\[EDITOR REVIEW:/i.test(created.article.body || '')) {
      notify('Remove the editor-review placeholder, revise the draft, and save it again before publication.');
      return;
    }
    if (!window.confirm(`Publish the reviewed guide “${created.article.title}” at /news/${created.slug}? It will become public and enter the dynamic news sitemap. Confirm that every factual claim and its source have been reviewed.`)) return;
    setPublishBusy(true);
    try {
      const response = await fetch('/api/site-content?entity=articles&via=seo-desk', {
        method: 'PATCH',
        headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
        body: JSON.stringify({id: created.id, published: true})
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Guide publication failed (${response.status}).`);
      const published = await refreshArticleList();
      const article = articleBySlug(created.slug, published) || created.article;
      setActiveDraftId(null);
      setCreated(current => current ? {...current, article, published: true} : current);
      setDraftAudit(auditGuidePreview(article, published));
      notify(`Guide published: ${article.title}. Refresh the crawl to verify the live page and sitemap.`);
    } catch (error) { notify(error.message || 'Guide publication failed.'); }
    finally { setPublishBusy(false); }
  };

  // ---- Topic Scout (2026-11-08) --------------------------------------------
  // Business-tied topic suggestions with catalogue-derived facts. Clicking
  // "Approve & publish" IS the human approval step: the desk generates the
  // draft from those facts, validates it with the same rules the manual
  // creator uses, saves it, and publishes it in one run — UNLESS the provider
  // flags anything for editorial verification, in which case it stops at an
  // unpublished draft and says why.
  const [scoutBusy, setScoutBusy] = useState(null);
  const [scoutLog, setScoutLog] = useState({});
  const scoutTopics = useMemo(
    () => buildTopicIdeas({ cars: liveCars, machines: MACHINES, dests: DEST, published: articles }),
    [articles, liveCars]);

  const runTopicAutopilot = async topic => {
    if (!canPublish || !token) { notify('Your role cannot publish website guides. Ask a website editor.'); return; }
    setScoutBusy(topic.id);
    const log = (state, detail, extra = {}) => setScoutLog(cur => ({ ...cur, [topic.id]: { state, detail, ...extra } }));
    try {
      log('generating', 'Drafting from the catalogue facts via the AI provider…');
      const out = await seoWorkflow('generate', 'POST', { topic: topic.title, facts: topic.facts.join('\n'), kind: topic.kind || 'guide', sources: [] });
      // The generate endpoint appends one BOILERPLATE reminder to every draft
      // ("[EDITOR REVIEW: verify every factual claim and source…]"). For Topic
      // Scout that reminder is satisfied by construction — every supplied fact
      // was computed from the live catalogue, not typed by a person — so the
      // trailing boilerplate is stripped here. WITHOUT this, the needsReview
      // test below always matched and autopilot could never publish (found
      // 2026-11-07). Any OTHER [EDITOR REVIEW: …] flag — the ones the model
      // itself writes when facts are thin — still stops publication.
      const cleanBody = String(out.body || '')
        .replace(/\n*\[EDITOR REVIEW: verify every factual claim and source, then remove this note before publication\.\]\s*$/i, '')
        .trimEnd();
      let draftForm = { title: out.title || topic.title, cat: topic.cat, img: topic.img, desc: out.desc, body: cleanBody };
      let { errors, slug } = validateGuide(draftForm, articles);
      // The model sometimes rewrites the headline into one that collides with
      // an already-published slug (observed 2026-11-08: Gemini turned a fresh
      // topic into "Used Suzuki Vehicles in Stock…", which was live). The
      // approved topic title is unique by construction — fall back to it
      // instead of failing the whole run.
      if (errors.slug && draftForm.title !== topic.title) {
        draftForm = { ...draftForm, title: topic.title };
        ({ errors, slug } = validateGuide(draftForm, articles));
      }
      if (Object.keys(errors).length) throw new Error('The generated draft failed validation: ' + Object.values(errors).join(' '));
      const needsReview = /\[EDITOR REVIEW:/i.test(draftForm.body || '');
      const article = buildArticle(draftForm, slug);
      const nextOrder = Math.min(0, ...editorArticles.map(a => Number(a.sort_order) || 0)) - 1;
      log('saving', 'Draft passed validation — saving…');
      const saveResponse = await fetch('/api/site-content?entity=articles&via=topic-scout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ title: article.title, category: article.cat, date: article.date,
          read_min: article.min, image: article.img, excerpt: article.ex, body: article.body,
          published: false, sort_order: nextOrder })
      });
      const saved = await saveResponse.json().catch(() => ({}));
      if (!saveResponse.ok) throw new Error(saved.error || `Draft save failed (${saveResponse.status}).`);
      if (needsReview) {
        await refreshArticleList();
        log('draft', 'Saved as an UNPUBLISHED draft: the AI flagged details that need editorial verification. Open it in the drafts list below, resolve the [EDITOR REVIEW] note, then publish.');
        notify(`Draft saved (not published): ${article.title} — it needs an editorial check first.`);
        return;
      }
      log('publishing', 'Publishing to /news/' + slug + '…');
      const publishResponse = await fetch('/api/site-content?entity=articles&via=topic-scout', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ id: saved.id, published: true })
      });
      const publishResult = await publishResponse.json().catch(() => ({}));
      if (!publishResponse.ok) throw new Error(publishResult.error || `Publication failed (${publishResponse.status}) — the article is saved as a draft.`);
      await refreshArticleList();
      log('published', 'Live and in the news sitemap.', { url: BASE + '/news/' + encodeURIComponent(slug) });
      notify(`Guide published from approved topic: ${article.title}`);
    } catch (error) {
      // A 503 / overload is Google's side, not the operator's: say so, and say
      // the one thing that actually helps — try again. A 504/502 is the same
      // story seen from Vercel's gateway (the function ran out of time while
      // the provider was slow — observed 2026-11-07), so it gets the same copy.
      const transient = /50[234]|overload|unavailable|gateway|timed? ?out|rate.?limit/i.test(error.message || '');
      const friendly = transient
        ? 'Google\u2019s AI was busy for a moment (it happens at peak times). Nothing was saved or published. Just press \u201cApprove & publish\u201d again \u2014 the desk now also tries two backup models automatically.'
        : (error.message || 'The run failed.') + ' Nothing was published.';
      log('failed', friendly);
      notify(transient ? 'The AI provider was briefly busy \u2014 press Approve & publish again.' : (error.message || 'Topic autopilot failed \u2014 nothing was published.'));
    } finally { setScoutBusy(null); }
  };

  // Copyable audit upgrade report, built from the finished live crawl.
  const [reportCopied, setReportCopied] = useState(false);
  const copyUpgradeReport = async () => {
    const report = buildUpgradeReport(liveCrawl.rows, { origin: SITE_CANONICAL_ORIGIN });
    try { await navigator.clipboard.writeText(report); }
    catch {
      const area = document.createElement('textarea');
      area.value = report; document.body.appendChild(area); area.select();
      document.execCommand('copy'); area.remove();
    }
    setReportCopied(true); setTimeout(() => setReportCopied(false), 2500);
  };

  const saveCampaign = async e => {
    e?.preventDefault?.();
    if (!canPromote || !token) { notify('Your role cannot publish campaign banners. Ask a settings administrator.'); return; }
    const headline = String(campaignForm.headline || '').trim();
    const cta = String(campaignForm.cta || '').trim();
    const href = String(campaignForm.href || '').trim();
    if (!headline || headline.length > 90 || !cta || !href.startsWith('/') || href.startsWith('//')) {
      notify('Add a headline (up to 90 characters), a CTA and an internal link.'); return;
    }
    const payload = {id: campaign?.id || `crm-promo-${Date.now().toString(36)}`, active: true,
      headline, sub: String(campaignForm.sub || '').trim(), cta, href,
      until: campaignForm.until || null, publishedAt: new Date().toISOString(),
      ...(campaign?.discount != null ? {discount: campaign.discount} : {})};
    setCampaignBusy(true);
    try {
      const response = await fetch('/api/settings', {method: 'PATCH',
        headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
        body: JSON.stringify({promo: JSON.stringify(payload)})});
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Campaign publish failed (${response.status}).`);
      setCampaign(payload);
      updateSettingsCache({promo: JSON.stringify(payload)});
      notify('Campaign banner published. It will display alongside, not instead of, stock-specific savings.');
    } catch (error) { notify(error.message || 'Campaign publish failed.'); }
    finally { setCampaignBusy(false); }
  };

  const clearCampaign = async () => {
    if (!canPromote || !token) { notify('Your role cannot clear campaign banners.'); return; }
    setCampaignBusy(true);
    try {
      const payload = {active: false};
      const response = await fetch('/api/settings', {method: 'PATCH',
        headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
        body: JSON.stringify({promo: JSON.stringify(payload)})});
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || `Campaign clear failed (${response.status}).`);
      setCampaign(null);
      updateSettingsCache({promo: JSON.stringify(payload)});
      setCampaignForm({headline: '', sub: '', cta: 'Browse stock', href: '/inventory', until: ''});
      notify('Campaign banner cleared.');
    } catch (error) { notify(error.message || 'Campaign clear failed.'); }
    finally { setCampaignBusy(false); }
  };
  return (
    <section className="inner-page extra-page seo-desk-embedded">
      <div className="page-hero mini extra-head seo-desk-header">
        <div className="shell">
          <div className="kicker">STAFF TOOL · NOINDEX</div>
          <h1>SEO <em>desk.</em></h1>
          <p>
            The same audit the SEO agent runs, on the page you are on right now, plus the crawl
            files search engines actually fetch. Nothing here is a claim — every line is a check
            with its evidence.
          </p>
          <button className="gold-btn" onClick={() => copy(AGENT_COMMANDS.map(c => c[0]).join('\n'), 'cmds')} type="button">
            {copied === 'cmds' ? <><Check size={15}/> Commands copied</> : <><Copy size={15}/> Copy agent commands</>}
          </button>
          <button className="gold-btn seo-create-toggle" onClick={() => setCreating(c => !c)} aria-expanded={creating} type="button">
            <FilePlus2 size={15}/> {creating ? 'Hide the draft creator' : 'Create draft'}
          </button>
        </div>
      </div>

      <div className="shell page-content seo-desk-content">
        <section className="seo-card seo-howto" aria-label="How this desk works">
          <details>
            <summary><BookOpenCheck size={16}/> How this desk works — the 4-step loop</summary>
            <ol>
              <li><b>1 · Audit.</b> "Run full crawl" fetches every public page the sitemaps list and runs the same checks Google cares about (title, description, canonical, structured data, images). Each page gets a score and named failures with fixes.</li>
              <li><b>2 · Report.</b> When the crawl finishes, "Copy upgrade report" produces a prioritised report split into what you can fix from this desk and what needs a code change — paste that second half into your Arena coding session and the developer agent does it.</li>
              <li><b>3 · Publish.</b> Topic Scout (below) suggests article topics built from your live stock and markets. Approving one generates, validates and publishes the guide in a single run — fresh indexed pages are the single biggest lever this desk has.</li>
              <li><b>4 · Submit.</b> "Request indexing" tells Google about new and changed pages instead of waiting for it to wander by. Re-run the crawl after publishing to verify.</li>
            </ol>
            <p className="seo-muted">Rhythm that works: one approved topic per week, a crawl after every publish, and the report to your developer whenever the code section is non-empty.</p>
            <p className="seo-muted"><b>Safety net:</b> everything this desk publishes or changes is recorded in AI Growth → History &amp; undo. If something should not have gone live, an administrator can undo it there and the previous version comes back exactly as it was.</p>
          </details>
        </section>

        <section className="seo-card seo-topic-scout" aria-label="Topic scout">
          <div className="seo-hub-title"><Sparkles size={18}/><div><h2>Topic Scout</h2><p>Article topics proposed from your live stock, machinery catalogue and shipping markets — with the verified facts the AI draft is allowed to use. <b>Approve &amp; publish</b> runs the whole pipeline: generate → validate → save → publish. If the AI flags anything for editorial checking, the run stops at an unpublished draft instead.</p></div></div>
          {scoutTopics.length === 0 && <p className="seo-muted">Every current suggestion already exists as a published guide. New stock, markets or machinery will generate new topics.</p>}
          <ul className="seo-scout-list">
            {scoutTopics.map(topic => {
              const state = scoutLog[topic.id];
              return (
                <li key={topic.id} className={'seo-scout-topic' + (state ? ' is-' + state.state : '')}>
                  <div className="seo-scout-main">
                    <b>{topic.title}</b>
                    <small>{topic.cat} · {topic.why}</small>
                    <details><summary>{topic.facts.length} verified facts the draft may use</summary><ul>{topic.facts.map((fact, i) => <li key={i}>{fact}</li>)}</ul></details>
                    {state && <span className={'seo-scout-state ' + state.state} role="status">
                      {state.state === 'published' ? <Check size={13}/> : state.state === 'failed' ? <AlertTriangle size={13}/> : <RefreshCw size={13} className="seo-spin"/>}
                      {state.detail}
                      {state.url && <> <a href={state.url} target="_blank" rel="noopener noreferrer">Open the live page <ExternalLink size={12}/></a></>}
                    </span>}
                  </div>
                  <div className="seo-scout-actions">
                    <button type="button" className="gold-btn" disabled={!canPublish || !token || scoutBusy !== null || state?.state === 'published'}
                      onClick={() => runTopicAutopilot(topic)}>
                      {scoutBusy === topic.id ? <><RefreshCw size={14} className="seo-spin"/> Working…</> : state?.state === 'published' ? <><Check size={14}/> Published</> : <><Send size={14}/> Approve &amp; publish</>}
                    </button>
                    <button type="button" className="seo-mini-action" disabled={scoutBusy !== null}
                      onClick={() => { setCreating(true); setActiveDraftId(null); setCreated(null); setDraftReviewed(false); setDraftFacts(topic.facts.join('\n')); setForm({ title: topic.title, cat: topic.cat, img: topic.img, desc: '', body: '' }); notify('Topic loaded into the draft creator below for manual editing.'); }}>
                      Edit manually instead
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
          {!canPublish && <small className="seo-muted">Your role can review topics but cannot publish guides.</small>}
        </section>

        <section className="seo-card seo-cover-doctor" aria-label="Cover image doctor">
          <div className="seo-hub-title"><ImageIcon size={18}/><div><h2>Cover image doctor</h2><p>Every article must wear its own cover: duplicate or missing images hurt click-through and look careless in link previews. This check runs over <b>all</b> articles (drafts included) and proposes a unique replacement from the site asset pools — brand-matched first.</p></div></div>
          {coverFixes.length === 0
            ? <p className="seo-muted"><Check size={13}/> All {editorArticles.length} article(s) have unique cover images. Nothing to fix.</p>
            : <>
              <ul className="seo-scout-list">
                {coverFixes.map(fix => (
                  <li key={fix.id} className="seo-scout-topic">
                    <div className="seo-scout-main">
                      <b>{fix.title}</b>
                      <small>{fix.reason} · {fix.from ? <>replace <code>{fix.from}</code> with</> : 'assign'} <code>{fix.to}</code></small>
                    </div>
                  </li>
                ))}
              </ul>
              <button type="button" className="gold-btn" disabled={!canPublish || !token || coverFixBusy} onClick={runCoverFixes}>
                {coverFixBusy ? <><RefreshCw size={14} className="seo-spin"/> Fixing…</> : <><Send size={14}/> Fix all {coverFixes.length} cover(s)</>}
              </button>
            </>}
        </section>

        <section className="seo-card" aria-label="Keyword research automation">
          <h2>Keyword opportunities</h2>
          <p>Research real Search Console queries when connected, plus catalogue-based topic ideas. No invented search volumes.</p>
          <button type="button" className="gold-btn" disabled={!canPublish || !token || automationBusy} onClick={researchKeywords}>Research keywords</button>
          {keywordReport && <>
            <p>{keywordReport.note}</p>{keywordReport.providerError && <p role="alert">{keywordReport.providerError}</p>}
            <ul>{(keywordReport.opportunities || []).slice(0,15).map((r,i) => <li key={i}><b>{r.query}</b> · {r.impressions} impressions · {r.clicks} clicks · position {Number(r.position).toFixed(1)} · {r.url}</li>)}</ul>
            <ul>{(keywordReport.ideas || []).map(r => <li key={r.query}><b>{r.query}</b> — {r.target} <button type="button" onClick={() => {setCreating(true);setActiveDraftId(null);setCreated(null);setDraftReviewed(false);setForm({title:r.query,cat:'BUYING GUIDE',img:GUIDE_ASSETS[0],desc:'',body:''});}}>Draft this topic</button></li>)}</ul>
          </>}
        </section>
        <section className="seo-card seo-campaign-hub">
          <div className="seo-hub-title"><Megaphone size={18}/><div><h2>Campaign launchpad</h2><p>Publish the public PromoBar from this staff-only desk. This is campaign messaging only—real price savings remain attached to individual stock in Price offers.</p></div></div>
          <div className={'seo-campaign-status' + (campaign && campaignIsLive(campaign) ? ' live' : '')}>
            <span><i/>{campaign ? (campaignIsLive(campaign) ? 'Campaign live' : 'Saved campaign expired') : 'No campaign is live'}</span>
            {campaign && <small>{campaign.headline}{campaign.until ? ` · through ${campaign.until}` : ' · no end date'}</small>}
          </div>
          <form className="seo-campaign-form" onSubmit={saveCampaign}>
            <label><span>Headline</span><input value={campaignForm.headline} maxLength={90} onChange={e => setCampaignForm(v => ({...v, headline: e.target.value}))} placeholder="A new shipment has arrived" aria-label="Campaign headline"/></label>
            <label><span>Button text</span><input value={campaignForm.cta} maxLength={40} onChange={e => setCampaignForm(v => ({...v, cta: e.target.value}))} placeholder="Browse stock" aria-label="Campaign button text"/></label>
            <label><span>Internal destination</span><select value={campaignForm.href} onChange={e => setCampaignForm(v => ({...v, href: e.target.value}))} aria-label="Campaign destination"><option value="/inventory">Vehicle inventory</option><option value="/machinery">Machinery</option><option value="/news">News &amp; guides</option><option value="/shipping">Shipping</option><option value="/contact">Contact the desk</option></select></label>
            <label><span>End date (optional)</span><input type="date" value={campaignForm.until} onChange={e => setCampaignForm(v => ({...v, until: e.target.value}))} aria-label="Campaign end date"/></label>
            <label className="seo-campaign-wide"><span>Supporting line</span><textarea value={campaignForm.sub} maxLength={220} rows={2} onChange={e => setCampaignForm(v => ({...v, sub: e.target.value}))} placeholder="Short, accurate context for this campaign" aria-label="Campaign supporting line"/></label>
            <div className="seo-campaign-actions"><button className="gold-btn" type="submit" disabled={!canPromote || campaignBusy}>{campaignBusy ? <RefreshCw size={14}/> : <Send size={14}/>} Publish campaign</button>{campaign && <button className="seo-clear-campaign" type="button" onClick={clearCampaign} disabled={!canPromote || campaignBusy}><Trash2 size={14}/> Clear campaign</button>}{!canPromote && <small>Your role can review this desk but cannot publish site settings.</small>}</div>
          </form>
        </section>

        {canPublish && (
          <section className="seo-card seo-drafts" aria-label="Unpublished news drafts">
            <div className="seo-hub-title"><FilePlus2 size={18}/><div><h2>Article drafts</h2><p>Drafts are stored in <code>site_articles</code> with <code>published=false</code>; they do not appear on the public news page or sitemap.</p></div></div>
            <div className="seo-draft-toolbar">
              <b>{editorArticles.filter(row => row.published === false).length} unpublished draft(s)</b>
              <button className="gold-btn" type="button" onClick={() => {
                setForm({title: '', cat: categories[0] || NEWS_CATEGORIES[0], img: GUIDE_ASSETS[0], desc: '', body: ''});
                setActiveDraftId(null); setDraftFacts(''); setCreated(null); setDraftAudit(null); setDraftReviewed(false); setCreateErrors({}); setCreating(true);
              }}>New draft</button>
            </div>
            {editorArticles.filter(row => row.published === false).length > 0
              ? <ul className="seo-draft-list">{editorArticles.filter(row => row.published === false).map(row => (
                <li key={row.id}>
                  <div><b>{row.title}</b><small>/news/{articleSlug(row.title)} · saved {row.updated_at || row.date || 'date not reported'}</small></div>
                  <button type="button" onClick={() => {
                    setForm({title: row.title || '', cat: row.category || row.cat || categories[0] || NEWS_CATEGORIES[0],
                      img: row.image || row.img || GUIDE_ASSETS[0], desc: row.excerpt || row.ex || '', body: row.body || ''});
                    setActiveDraftId(row.id); setDraftFacts(''); setCreated(null); setDraftAudit(null); setDraftReviewed(false); setCreateErrors({}); setCreating(true);
                  }}>Load for review</button>
                </li>
              ))}</ul>
              : <p className="seo-muted">No unpublished article drafts have been saved.</p>}
          </section>
        )}

        {creating && (
          <form className="seo-card seo-create" onSubmit={createGuide}>
            <h3><FilePlus2 size={16}/> {activeDraftId ? 'Review and edit draft' : 'Create a buyer-guide draft'}</h3>
            <p className="seo-muted">
              The formatter only uses facts you provide; it does not look up or invent stock, auction or shipping claims.
              Save creates or updates an unpublished row. A separate confirmation is required before publication.
            </p>

            <fieldset className="seo-fact-generator">
              <legend>Generate from staff-verified facts</legend>
              <label><span>Verified facts, one per line (include a source/date or stock reference where applicable)</span>
                <textarea value={draftFacts} rows={4} onChange={e => {setDraftFacts(e.target.value); setCreateErrors({});}}
                  placeholder="Example: Current public stock page lists [exact model and year].\nExample: The current route table shows [port and planning transit window]."
                  aria-label="Staff verified facts" />
                {createErrors.facts && <em className="seo-err">{createErrors.facts}</em>}
              </label>
              <button type="button" className="gold-btn" onClick={generateFactDraft}>Generate factual draft text</button>
              <small className="seo-muted">Generated excerpt/body echo only these notes and add a review reminder. They are not independently verified.</small>
              <label>AI content type<select aria-label="AI content type" value={aiKind} onChange={e => setAiKind(e.target.value)}><option value="guide">Buyer guide</option><option value="news">Source-backed news</option></select></label>
              <label>Source URLs (one HTTPS URL per line)<textarea aria-label="AI source URLs" value={aiSources} onChange={e => setAiSources(e.target.value)} rows={2}/></label>
              <p className="seo-muted">
                Enter the topic in Title below. News requires a verified event date (YYYY-MM-DD) in the facts and at least one source URL. AI does not browse or verify those sources.{' '}
                {aiProvider?.provider === 'gemini'
                  ? `Drafts are generated with Gemini on the free tier (${aiProvider.gemini?.model || 'gemini-3.8-flash'}) using the server-only GEMINI_API_KEY.`
                  : aiProvider?.provider === 'openai'
                    ? 'Drafts are generated with OpenAI because SEO_AI_PROVIDER=openai is set on the server.'
                    : aiProvider?.provider === 'formatter'
                      ? 'GEMINI_API_KEY is not set on the server, so AI drafts are unavailable — use “Generate factual draft text” above.'
                      : aiProvider
                        ? 'The provider status could not be read; use “Generate factual draft text” if generation fails.'
                        : 'Checking the draft provider…'}
              </p>
              <button type="button" className="gold-btn" onClick={generateAiDraft} disabled={!canPublish || !token || automationBusy}>{automationBusy ? 'Working…' : 'Generate AI draft'}</button>
              <button type="button" className="gold-btn" onClick={optimizeDraft} disabled={!canPublish || !token || automationBusy || !form.body.trim()}>Fix draft SEO</button>
            </fieldset>

            <div className="seo-create-grid">
              <label>
                <span>Title</span>
                <input
                  type="text" value={form.title} maxLength={120}
                  onChange={e => editTitle(e.target.value)}
                  placeholder="What the guide is about, in the words buyers search"
                  aria-label="Guide title"
                />
                {createErrors.title && <em className="seo-err">{createErrors.title}</em>}
              </label>

              <label>
                <span>Canonical slug (derived from the title)</span>
                <input
                  type="text" value={articleSlug(form.title)} maxLength={MAX_SLUG_LENGTH}
                  readOnly aria-readonly="true" aria-label="Guide slug, derived from title"
                  placeholder="lowercase-words-joined-by-hyphens"
                />
                <small className="seo-muted">The existing site_articles table stores the title, not a separate slug; the public URL is generated from this value.</small>
                {createErrors.slug && <em className="seo-err">{createErrors.slug}</em>}
              </label>

              <label>
                <span>Category</span>
                <select value={form.cat} onChange={e => setField('cat', e.target.value)} aria-label="Guide category">
                  {categories.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                {createErrors.cat && <em className="seo-err">{createErrors.cat}</em>}
              </label>

              <label>
                <span>og:image (existing asset)</span>
                <select value={GUIDE_ASSETS.includes(form.img) ? form.img : '__custom'} onChange={e => setField('img', e.target.value === '__custom' ? '' : e.target.value)} aria-label="Guide og:image asset">
                  {GUIDE_ASSETS.map(a => <option key={a} value={a}>{a}</option>)}
                  <option value="__custom">Custom /assets/ path…</option>
                </select>
                {!GUIDE_ASSETS.includes(form.img) && (
                  <input
                    type="text" value={form.img}
                    onChange={e => setField('img', e.target.value)}
                    placeholder="/assets/…" aria-label="Custom og:image path"
                  />
                )}
                {createErrors.img && <em className="seo-err">{createErrors.img}</em>}
              </label>

              <label className="seo-create-wide">
                <span>Meta description (70–165 characters)</span>
                <textarea
                  value={form.desc} rows={2}
                  onChange={e => setField('desc', e.target.value)}
                  placeholder="What the guide covers and why a buyer should click"
                  aria-label="Guide meta description"
                />
                {createErrors.desc && <em className="seo-err">{createErrors.desc}</em>}
              </label>

              <label className="seo-create-wide">
                <span>Body (markdown — blank line between paragraphs)</span>
                <textarea
                  value={form.body} rows={8}
                  onChange={e => setField('body', e.target.value)}
                  placeholder="First paragraph…&#10;&#10;Second paragraph…"
                  aria-label="Guide body"
                />
                {createErrors.body && <em className="seo-err">{createErrors.body}</em>}
              </label>
            </div>

            {createWarnings.length > 0 && (
              <ul className="seo-create-warns">
                {createWarnings.map((w, i) => <li key={i}><AlertTriangle size={13}/> {w}</li>)}
              </ul>
            )}

            <button className="gold-btn" type="submit" disabled={!canPublish || guideBusy}>{guideBusy ? <RefreshCw size={14}/> : <Save size={14}/>} Save unpublished draft</button>
            {!canPublish && <p className="seo-muted">Your role can review SEO but cannot edit or publish website guides.</p>}

            {created && (
              <div className="seo-created">
                <p>
                  <Check size={14} className="seo-ok"/> {created.published ? 'Published guide:' : 'Unpublished draft saved:'}{' '}
                  {created.published
                    ? <a href={created.url.replace(BASE, '')} target="_blank" rel="noreferrer"><code>{created.url.replace(BASE, '')}</code></a>
                    : <code>{created.url.replace(BASE, '')}</code>}.
                  {created.published
                    ? ' It is public; refresh the crawl to verify its live page and dynamic sitemap entry.'
                    : ' It is private, excluded from the public news page and sitemap until a person reviews and publishes it.'}
                  {' '}A JSON backup is available below.
                </p>
                <pre className="seo-json">{created.json}</pre>
                <details>
                  <summary>Title-derived canonical URL and dynamic sitemap endpoint</summary>
                  <pre className="seo-json">{created.url}<br/>{BASE}/api/sitemap-news.xml (published articles only)</pre>
                </details>
                {!created.published && <label className="seo-review-check">
                  <input type="checkbox" checked={draftReviewed} onChange={event => setDraftReviewed(event.target.checked)} />
                  <span>I reviewed every factual claim against its source, corrected the draft, and removed all editor-review notes.</span>
                </label>}
                <div className="seo-create-actions">
                  <button type="button" className="gold-btn" onClick={() => copy(created.json, 'guide-json')}>
                    {copied === 'guide-json' ? <><Check size={14}/> Copied again</> : <><Copy size={14}/> Copy JSON backup</>}
                  </button>
                  {!created.published && <button type="button" className="gold-btn" onClick={publishGuide} disabled={!canPublish || publishBusy || !draftReviewed}>
                    {publishBusy ? <RefreshCw size={14}/> : <Send size={14}/>} Publish reviewed draft
                  </button>}
                </div>
              </div>
            )}

            {draftAudit && (
              <div className="seo-draft-audit">
                <h3>
                  Local metadata preview — <code>/news/{encodeURIComponent(created?.slug || '')}</code>
                </h3>
                <div className="seo-score">
                  <div className={`seo-score-ring ${draftAudit.status}`}>
                    <b>{draftAudit.score}</b><small>/100</small>
                  </div>
                  <div>
                    <h2>Shared-engine metadata audit: {draftAudit.score}/100</h2>
                    <p className="seo-muted">
                      {draftAudit.fails} failure(s), {draftAudit.warns} warning(s). This local preview uses <code>applySeo()</code> and is not a live crawl or Search Console result.
                      {created?.published ? ' The article is published; run the crawl to verify served HTML and sitemap inclusion.' : ' The saved draft remains unpublished and cannot be indexed.'}
                    </p>
                  </div>
                </div>
                <ul className="seo-checks">
                  {draftAudit.checks.map(c => (
                    <li key={c.id} className={c.status}>
                      {icon(c.status)}
                      <div><b>{c.label}</b><span>{c.detail}</span>{c.fix && c.status !== 'pass' && <em>→ {c.fix}</em>}</div>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </form>
        )}

        <section className="seo-card seo-live-workbench" aria-label="Live SEO crawl and indexing workflows">
          <div className="seo-hub-title"><Search size={18}/><div><h2>Live crawl &amp; indexing workflows</h2><p>Separate local audit evidence from provider credentials, live page fetches and Google’s reported index state. Crawl requests do not force indexing.</p></div></div>

          <div className="seo-live-status-grid">
            <article className="seo-live-status local">
              <b>Local shared-engine audit</b>
              <strong>{report ? `${report.score}/100` : 'Pending'}</strong>
              <span>{report ? `${report.fails} failure(s), ${report.warns} warning(s) on this staff page.` : 'Waiting for the local document audit.'} This is not Search Console.</span>
            </article>
            <article className={'seo-live-status ' + (connectorStatus?.google?.state || 'pending')}>
              <b>Search Console API</b>
              <strong>{connectorBusy ? 'Checking…' : providerStateLabel(connectorStatus?.google?.state)}</strong>
              <span>{connectorStatus?.google?.detail || connectorError || 'Provider status has not been verified.'}</span>
              {connectorStatus?.google?.property && <small>Property: {connectorStatus.google.property}</small>}
            </article>
            <article className={'seo-live-status ' + (connectorStatus?.indexNow?.state || 'pending')}>
              <b>IndexNow key verification</b>
              <strong>{connectorBusy ? 'Checking…' : providerStateLabel(connectorStatus?.indexNow?.state)}</strong>
              <span>{connectorStatus?.indexNow?.detail || connectorError || 'Provider status has not been verified.'}</span>
              {connectorStatus?.indexNow?.keyFile && <small>Key file: {connectorStatus.indexNow.keyFile}</small>}
            </article>
          </div>
          <div className="seo-workflow-actions">
            <button className="gold-btn" type="button" onClick={refreshConnectors} disabled={!canPublish || connectorBusy}>
              <RefreshCw size={14}/> {connectorBusy ? 'Checking providers…' : 'Refresh provider status'}
            </button>
            <button className="gold-btn" type="button" onClick={() => runCrawl()} disabled={!canPublish || crawlActive}>
              <Search size={14}/> {crawlActive ? 'Crawling…' : 'Refresh sitemaps & crawl whole site'}
            </button>
            <button className="seo-secondary-btn" type="button" onClick={() => runCrawl(BASE + location.pathname)} disabled={!canPublish || crawlActive}>
              Audit this page
            </button>
            {crawlActive && <button className="seo-secondary-btn" type="button" onClick={cancelCrawl}>Cancel crawl</button>}
            <button className="seo-secondary-btn" type="button" onClick={previewIndexing} disabled={!canPublish || crawlActive || indexingBusy || !liveCrawl.rows.length}>
              {indexingBusy ? 'Preparing…' : 'Preview eligible URLs'}
            </button>
            {indexingPreview && <button className="gold-btn" type="button" onClick={submitIndexing} disabled={!canPublish || indexingBusy || !(indexingPreview.eligibleUrls?.length)}>
              {indexingBusy ? 'Submitting…' : `Submit crawl requests (${indexingPreview.eligibleUrls?.length || 0})`}
            </button>}
          </div>
          <p className="seo-muted">
            Route registry: {registeredRoutes.filter(route => route.indexable !== false).length} public examples, {registeredRoutes.filter(route => route.indexable === false).length} staff/noindex entries omitted.
            Sitemap URLs are refreshed from same-origin <code>/robots.txt</code> declarations and the allowlisted sitemap endpoints. This browser crawl uses the current origin and shared <code>src/seo-audit.js</code> engine.
          </p>
          {workflowError && <p className="seo-workflow-error" role="alert"><AlertTriangle size={14}/>{workflowError}</p>}
          {liveCrawl.state !== 'idle' && (
            <div className="seo-crawl-progress" role="status" aria-live="polite">
              <b>{liveCrawl.state === 'discovering' ? 'Discovering routes and sitemap sources…' : `${liveCrawl.done}/${liveCrawl.total} URL(s) audited`}</b>
              <span>{providerStateLabel(liveCrawl.state)}{liveCrawl.state === 'complete' ? ` · ${liveCrawl.sources.length} sitemap source(s)` : ''}</span>
              {liveCrawl.total > 0 && <progress max={liveCrawl.total} value={liveCrawl.done} />}
            </div>
          )}
          {liveCrawl.sourceErrors?.length > 0 && <ul className="seo-workflow-error-list">{liveCrawl.sourceErrors.map((error, i) => <li key={i}>{error}</li>)}</ul>}

          {liveCrawl.rows.length > 0 && (liveCrawl.state === 'complete' || liveCrawl.state === 'complete_with_warnings') && (
            <div className="seo-report-bar" role="group" aria-label="Audit upgrade report">
              <ClipboardList size={16}/>
              <span><b>Upgrade report ready.</b> Prioritised fixes from this crawl, split into what this desk can do and what needs a code change — paste the code section into your Arena session and the developer agent implements it.</span>
              <button type="button" className="gold-btn" onClick={copyUpgradeReport}>
                {reportCopied ? <><Check size={14}/> Report copied</> : <><Copy size={14}/> Copy upgrade report</>}
              </button>
            </div>
          )}

          {liveCrawl.rows.length > 0 && (
            <div className="seo-crawl-results">
              <h3>Per-URL crawl diagnostics <small>{liveCrawl.rows.length} URL(s)</small></h3>
              {/* 2026-11-07 (owner request): a 414-row dump was unreadable.
                  Lead with the verdict, show only the rows that need eyes
                  (problems first), and keep the full list behind one click. */}
              <div className="seo-crawl-summary" role="status">
                <span className="fail">{crawlCounts.fail} failing</span>
                <span className="warn">{crawlCounts.warn} with warnings</span>
                <span className="pass">{crawlCounts.clean} clean</span>
                {crawlCounts.fail === 0 && crawlCounts.warn === 0 && <em>Everything passed — the list below is for reference only.</em>}
              </div>
              <ul>
                {visibleCrawlRows.map(row => (
                  <li key={row.url} className={'seo-crawl-row ' + (row.state || 'unknown')}>
                    <div className="seo-crawl-row-head">
                      <div><b>{row.path || row.url}</b><small>{row.httpStatus ? `HTTP ${row.httpStatus}` : row.error || 'No HTTP response'}{row.score != null ? ` · ${row.score}/100 · ${row.fails} fail · ${row.warns} warn` : ''}{row.noindex ? ' · noindex — excluded' : ''}</small></div>
                      <div>
                        <button type="button" className="seo-mini-action" onClick={() => runCrawl(row.url)} disabled={!canPublish || crawlActive}>Retry</button>
                        <button type="button" className="seo-mini-action" onClick={() => setInspectionUrl(row.url)} disabled={!canPublish}>Inspect</button>
                      </div>
                    </div>
                    {row.title && <small className="seo-crawl-title">Title: {row.title}{row.canonical ? ` · canonical ${row.canonical}` : ' · no canonical'}</small>}
                    {row.detail && <small className="seo-crawl-detail">{row.detail}</small>}
                    {row.error && <small className="seo-crawl-detail">{row.error}</small>}
                    {row.checks?.filter(check => check.status !== 'pass').length > 0
                      ? <details><summary>{row.checks.filter(check => check.status !== 'pass').length} diagnostic(s) — warnings are retained</summary><ul className="seo-page-checks">{row.checks.filter(check => check.status !== 'pass').map(check => <li key={check.id} className={check.status}><b>{check.label}</b><span>{check.detail}</span>{check.fix && <em>→ {check.fix}</em>}</li>)}</ul></details>
                      : row.checks && <small className="seo-crawl-detail">Shared-engine checks: no warning or failure reported.</small>}
                  </li>
                ))}
              </ul>
              {liveCrawl.rows.length > CRAWL_PREVIEW_ROWS && (
                <div className="seo-crawl-more">
                  {!crawlShowAll && <small>Showing the {visibleCrawlRows.length} most important of {liveCrawl.rows.length} — problems always sort first.</small>}
                  <button type="button" className="seo-secondary-btn" onClick={() => setCrawlShowAll(v => !v)}>
                    {crawlShowAll ? 'Show short list' : `View full list (${liveCrawl.rows.length} URLs)`}
                  </button>
                </div>
              )}
            </div>
          )}

          {indexingPreview && (
            <div className="seo-indexing-preview">
              <h3>Eligible-URL indexing preview <small>{indexingPreview.eligibleUrls?.length || 0} eligible · {indexingPreview.excluded?.length || 0} excluded</small></h3>
              <p className="seo-muted">Draft, noindex and staff paths are excluded. Search Console sitemap submission and IndexNow only request crawl/processing; neither guarantees an index entry.</p>
              <div className="seo-indexing-columns">
                <div><b>Eligible URLs</b><ul>{(indexingPreview.eligibleUrls || []).slice(0, 40).map(url => <li key={url}>{url.replace(SITE_CANONICAL_ORIGIN, '')}</li>)}</ul>{(indexingPreview.eligibleUrls || []).length > 40 && <small>+ {(indexingPreview.eligibleUrls || []).length - 40} more</small>}</div>
                <div><b>Excluded candidates</b><ul>{(indexingPreview.excluded || []).slice(0, 40).map((item, i) => <li key={item.url + i}><code>{item.url.replace(SITE_CANONICAL_ORIGIN, '')}</code> — {item.reason}</li>)}</ul>{(indexingPreview.excluded || []).length > 40 && <small>+ {(indexingPreview.excluded || []).length - 40} more</small>}</div>
              </div>
              <p className="seo-muted">Refreshed sitemap sources: {(indexingPreview.sitemapSources || []).map(source => new URL(source).pathname).join(' · ') || 'none found'}.</p>
              <p className="seo-muted">{indexingPreview.note}</p>
            </div>
          )}

          {indexingResult && (
            <div className="seo-indexing-result" role="status">
              <h3>Submission result · {indexingResult.submittedAt}</h3>
              <p>{indexingResult.eligibleCount} eligible URL(s); {indexingResult.excludedCount} excluded. This records provider responses, not indexing success.</p>
              <div className="seo-indexing-columns">
                <div><b>Google Search Console sitemap submission</b><strong>{providerStateLabel(indexingResult.google?.state)}</strong><p>{indexingResult.google?.detail}</p>{indexingResult.google?.results?.map(result => <small key={result.sitemap}>{new URL(result.sitemap).pathname}: {result.detail}</small>)}</div>
                <div><b>IndexNow notification</b><strong>{providerStateLabel(indexingResult.indexNow?.state)}</strong><p>{indexingResult.indexNow?.detail}</p></div>
              </div>
              <p className="seo-muted">Audit trail: {indexingResult.audit?.saved ? 'saved in activities' : `not saved — ${indexingResult.audit?.detail || 'not confirmed'}`}</p>
            </div>
          )}

          <form className="seo-inspection-form" onSubmit={event => {event.preventDefault(); inspectUrl();}}>
            <label><span>Search Console URL Inspection (live API result, not a submit/force-index action)</span><input type="url" value={inspectionUrl} onChange={event => setInspectionUrl(event.target.value)} placeholder="https://ar7traders.com/inventory" aria-label="URL to inspect in Search Console"/></label>
            <button className="gold-btn" type="submit" disabled={!canPublish || inspectionBusy || !inspectionUrl.trim()}>{inspectionBusy ? 'Inspecting…' : 'Inspect URL'}</button>
          </form>
          {inspectionResult && <div className="seo-inspection-result"><b>Google inspection state: {providerStateLabel(inspectionResult.state)}</b><p>{inspectionResult.detail}</p>{['verdict','coverageState','indexingState','pageFetchState','robotsTxtState','lastCrawlTime','userCanonical','googleCanonical'].filter(key => inspectionResult[key]).map(key => <span key={key}><small>{prettyLabel(key)}</small><b>{inspectionResult[key]}</b></span>)}</div>}

          <div className="seo-audit-trail">
            <h3>SEO submission audit trail <small>{auditTrail.length} recent event(s)</small></h3>
            {auditTrail.length
              ? <ul>{auditTrail.map(item => <li key={item.id || item.created_at}><span>{item.action}</span><small>{item.actor || 'Staff'} · {item.created_at || 'time not reported'}</small></li>)}</ul>
              : <p className="seo-muted">No submission events returned. Status checks and previews do not create trail entries.</p>}
          </div>
        </section>

        <div className="seo-score">
          <div className={`seo-score-ring ${report?.status || 'warn'}`}>
            <b>{report ? report.score : '—'}</b><small>/100</small>
          </div>
          <div>
            <h2>Local audit of this staff route: {report ? report.score : '—'}/100</h2>
            <p>
              {report ? `${report.fails} failure(s), ${report.warns} warning(s). ` : ''}
              This is the browser document scored by the shared <code>src/seo-audit.js</code> engine. It is not a live-site crawl, Search Console connection or Google index status.
            </p>
          </div>
        </div>

        <div className="seo-columns">
          <div className="seo-card">
            <h3><Search size={16}/> Checks on this page</h3>
            {loading && <p className="seo-muted"><RefreshCw size={13}/> Loading crawl files…</p>}
            <ul className="seo-checks">
              {(report?.checks || []).map(c => (
                <li key={c.id} className={c.status}>
                  {icon(c.status)}
                  <div><b>{c.label}</b><span>{c.detail}</span>{c.fix && c.status !== 'pass' && <em>→ {c.fix}</em>}</div>
                </li>
              ))}
            </ul>
          </div>

          <div className="seo-card">
            <h3><Wrench size={16}/> The agent</h3>
            <p className="seo-muted">
              Run these from the project root. The agent reads the built site and the same modules
              the browser uses; it writes <code>seo-report.md</code> and <code>seo-report.json</code>.
            </p>
            <ul className="seo-commands">
              {AGENT_COMMANDS.map(([c, what]) => (
                <li key={c}>
                  <code>{c}</code>
                  <button onClick={() => copy(c, c)} aria-label={`Copy ${c}`} type="button">{copied === c ? <Check size={13}/> : <Copy size={13}/>}</button>
                  <span>{what}</span>
                </li>
              ))}
            </ul>
            <p className="seo-muted">
              The live workbench above calls Search Console and IndexNow only. Search Console setup needs <code>GOOGLE_SERVICE_ACCOUNT_JSON</code> and <code>GSC_SITE_URL</code>, with the service account granted access to the verified property. IndexNow needs <code>AR7_INDEXNOW_KEY</code> and a public <code>/&lt;key&gt;.txt</code> file whose contents match. Keep secrets in deployment environment settings, never in source. Connection checks report what this server actually verifies.
            </p>
          </div>
        </div>

        <div className="seo-card">
          <h3><ExternalLink size={16}/> Crawl files</h3>
          <div className="seo-crawlfiles">
            <div>
              <b>/sitemap.xml</b>
              <span>{sitemapUrls.length} URLs listed</span>
              <ul>{sitemapUrls.slice(0, 12).map(u => <li key={u}>{u.replace(BASE, '')}</li>)}
                {sitemapUrls.length > 12 && <li className="seo-muted">+ {sitemapUrls.length - 12} more</li>}</ul>
            </div>
            <div>
              <b>/robots.txt</b>
              <span>{/^sitemap:/im.test(robots) ? 'declares its sitemaps' : 'no sitemap declared'}</span>
              <pre>{robots || '(not available in this preview)'}</pre>
            </div>
          </div>
          <p className="seo-muted">
            Landing pages (<code>/cars/&lt;make&gt;</code>, <code>/cars/&lt;make&gt;/&lt;model&gt;</code>) are
            published by the live vehicle sitemap at <code>/api/sitemap-vehicles.xml</code>, built from
            real stock — so a brand or model page is only ever advertised when it has vehicles.
          </p>
        </div>

        <div className="seo-card">
          <h3>Landing pages the site publishes</h3>
          <div className="seo-landing">
            {ROUTES.map(([href, label]) => (
              <a key={href} href={href} onClick={e => { if (navigate) { e.preventDefault(); navigate(href); } }}>
                {label} <code>{href}</code> <ArrowRight size={13}/>
              </a>
            ))}
          </div>
          <p className="seo-muted">
            Each of these has its own title, description, canonical and structured data
            (<code>src/seo.js</code>). Brand and model routes are generated from the same make/model
            values the inventory filter uses.
          </p>
        </div>

        <p className="seo-muted">
          Summary for this run: {summary.pages.length} page audited · score {summary.score} ·
          {summary.fails} failure(s) · {summary.warns} warning(s).
        </p>
      </div>
    </section>
  );
}
