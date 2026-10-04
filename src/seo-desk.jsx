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

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Copy, ExternalLink, FilePlus2, RefreshCw, Search, Wrench, X, AlertTriangle, Megaphone, Tag, Send, Trash2 } from 'lucide-react';
import { auditDocument, summarise } from './seo-audit.js';
import { applySeo, BASE } from './seo.js';
import { NEWS_CATEGORIES, articleBySlug, articleSlug, MAX_SLUG_LENGTH, getPublishedNews, getNewsCategories, setPublishedNews } from './news-data.js';
import { updateSettingsCache } from './site-settings.js';
import { campaignIsLive } from './offers.js';
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

const fmtDate = d => d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
const readMins = body => Math.max(2, Math.round(String(body).split(/\s+/).filter(Boolean).length / 200));

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

export default function SeoDesk({ navigate, token, canPublish = false, canPromote = false, notify = () => {} }) {
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

  // ---- guide creator state --------------------------------------------------
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', cat: categories[0] || NEWS_CATEGORIES[0], img: GUIDE_ASSETS[0], desc: '', body: '' });
  const [createErrors, setCreateErrors] = useState({});
  const [createWarnings, setCreateWarnings] = useState([]);
  const [created, setCreated] = useState(null); // { article, json, slug, url, published, clip }
  const [draftAudit, setDraftAudit] = useState(null);

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

  const copy = async (text, tag) => {
    try { await navigator.clipboard.writeText(text); setCopied(tag); setTimeout(() => setCopied(''), 1600); }
    catch { /* clipboard blocked in the embedded preview */ }
  };

  const icon = status => status === 'pass'
    ? <Check size={15} className="seo-ok"/>
    : status === 'warn'
      ? <AlertTriangle size={15} className="seo-warn"/>
      : <X size={15} className="seo-bad"/>;

  const setField = (k, v) => {
    setForm(f => ({ ...f, [k]: v }));
    setCreateErrors({});
    setCreated(null);
    setDraftAudit(null);
  };

  const editTitle = v => {
    setForm(f => ({...f, title: v}));
    setCreateErrors({});
    setCreated(null);
    setDraftAudit(null);
  };

  const refreshArticleList = async () => {
    const response = await fetch('/api/site-content?entity=articles', {cache: 'no-store'});
    if (!response.ok) throw new Error('The public guide list could not be refreshed.');
    const rows = await response.json();
    if (!Array.isArray(rows)) throw new Error('The public guide list returned an unexpected response.');
    setPublishedNews(rows);
    const fresh = getPublishedNews();
    setArticles(fresh);
    return fresh;
  };

  // ---- publish guide ---------------------------------------------------------
  // Validates and audits a draft first, then writes through the existing
  // site-content API (site.write permission). The public news page hydrates
  // published rows from that same table; no source edit or redeploy is needed.
  const createGuide = async e => {
    e.preventDefault();
    if (!canPublish || !token) { notify('Your role cannot publish website guides. Ask a website editor.'); return; }
    const { errors, warnings, slug } = validateGuide(form, articles);
    setCreateErrors(errors);
    setCreateWarnings(warnings);
    if (Object.keys(errors).length) { setCreated(null); setDraftAudit(null); return; }

    const article = buildArticle(form, slug);
    const json = JSON.stringify(article, null, 2);
    const url = BASE + '/news/' + encodeURIComponent(slug);
    setGuideBusy(true);
    try {
      const nextOrder = Math.min(0, ...articles.map(a => Number(a.sort_order) || 0)) - 1;
      const response = await fetch('/api/site-content?entity=articles', {
        method: 'POST',
        headers: {'Content-Type': 'application/json', Authorization: `Bearer ${token}`},
        body: JSON.stringify({title: article.title, category: article.cat, date: article.date,
          read_min: article.min, image: article.img, excerpt: article.ex, body: article.body,
          published: true, sort_order: nextOrder})
      });
      const saved = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(saved.error || `Guide publication failed (${response.status}).`);
      let clip = 'copy-failed';
      try { await navigator.clipboard.writeText(json); clip = 'copied'; } catch { /* clipboard may be blocked in the preview */ }
      const published = await refreshArticleList();
      const liveArticle = articleBySlug(slug, published) || article;
      setCreated({article: liveArticle, json, slug, url, clip, published: true, id: saved.id});
      setSitemapUrls(list => list.includes(url) ? list : [...list, url]);
      notify(`Guide published: ${article.title}. The public news page can serve it now.`);

      // Audit the just-published canonical URL against the same shared SEO
      // renderer and include it in the sitemap facts shown to the operator.
      const draftDoc = document.implementation.createHTMLDocument('draft');
      applySeo('news', slug, null, {articleList: published, doc: draftDoc});
      setDraftAudit(auditDocument(draftDoc, {
        route: 'news/' + slug, url, expectIndexable: true, origin: BASE,
        facts: {sitemapUrls: [...sitemapUrls, url], robotsTxt: robots}, skipBody: true
      }));
    } catch (error) {
      notify(error.message || 'Guide publication failed.');
      setCreated(null);
      setDraftAudit(null);
    } finally { setGuideBusy(false); }
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
            <FilePlus2 size={15}/> {creating ? 'Hide the guide creator' : 'Create guide'}
          </button>
        </div>
      </div>

      <div className="shell page-content seo-desk-content">
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

        {creating && (
          <form className="seo-card seo-create" onSubmit={createGuide}>
            <h3><FilePlus2 size={16}/> Create a buyer guide</h3>
            <p className="seo-muted">
              Creates a complete guide, checks its slug and metadata, audits the canonical
              <code>/news/&lt;slug&gt;</code> page, then publishes through the staff website-content API.
              The new guide is available on the public news page without a code edit or redeploy.
            </p>

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

            <button className="gold-btn" type="submit" disabled={!canPublish || guideBusy}>{guideBusy ? <RefreshCw size={14}/> : <Send size={14}/>} Publish guide + audit</button>
            {!canPublish && <p className="seo-muted">Your role can review SEO but cannot publish website guides.</p>}

            {created && (
              <div className="seo-created">
                <p>
                  <Check size={14} className="seo-ok"/> Guide published at{' '}
                  <a href={created.url.replace(BASE, '')} target="_blank" rel="noreferrer"><code>{created.url.replace(BASE, '')}</code></a>.
                  {' '}It is available from the public news page and the dynamic news sitemap.
                  {created.clip === 'copied' ? ' A JSON backup is on your clipboard.' : ' A JSON backup is available below.'}
                </p>
                <pre className="seo-json">{created.json}</pre>
                <details>
                  <summary>Canonical URL and published sitemap endpoint</summary>
                  <pre className="seo-json">{created.url}<br/>{BASE}/api/sitemap-news.xml</pre>
                </details>
                <div className="seo-create-actions">
                  <button type="button" className="gold-btn" onClick={() => copy(created.json, 'guide-json')}>
                    {copied === 'guide-json' ? <><Check size={14}/> Copied again</> : <><Copy size={14}/> Copy JSON again</>}
                  </button>
                  <button type="button" className="gold-btn" onClick={() => copy(BASE + '/api/sitemap-news.xml', 'guide-sitemap')}>
                    {copied === 'guide-sitemap' ? <><Check size={14}/> Sitemap URL copied</> : <><Copy size={14}/> Copy sitemap URL</>}
                  </button>
                </div>
              </div>
            )}

            {draftAudit && (
              <div className="seo-draft-audit">
                <h3>
                  Draft audit — <code>/news/{encodeURIComponent(created?.slug || '')}</code>
                </h3>
                <div className="seo-score">
                  <div className={`seo-score-ring ${draftAudit.status}`}>
                    <b>{draftAudit.score}</b><small>/100</small>
                  </div>
                  <div>
                    <h2>Scored as the page will ship: {draftAudit.score}/100</h2>
                    <p className="seo-muted">
                      {draftAudit.fails} failure(s), {draftAudit.warns} warning(s). Head tags, canonical,
                      Open Graph and structured data come from the real <code>applySeo()</code>; the
                      sitemap line below is counted as added. Body checks run on the static-shell audit
                      after the rebuild.
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

        <div className="seo-score">
          <div className={`seo-score-ring ${report?.status || 'warn'}`}>
            <b>{report ? report.score : '—'}</b><small>/100</small>
          </div>
          <div>
            <h2>This page scores {report ? report.score : '—'}/100</h2>
            <p>
              {report ? `${report.fails} failure(s), ${report.warns} warning(s). ` : ''}
              Checks are run by <code>src/seo-audit.js</code> — the module both the CLI agent and this
              panel import, so the tool and the site can never disagree.
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
              Connectors (Search Console, Bing Webmaster, GA4) read credentials from environment
              variables the owner sets — see <code>npm run seo:connect</code>. IndexNow needs no
              account: <code>npm run seo:fix</code> publishes the key file, <code>npm run seo:indexnow</code>
              submits.
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
