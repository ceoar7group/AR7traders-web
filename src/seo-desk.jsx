// The in-site SEO desk (/seo).
//
// Why it exists: the owner should not have to take anyone's word for it that
// the SEO is done. This page runs the exact same audit engine the CLI agent
// and the Arena agent use (src/seo-audit.js) against the page it is standing
// on, pulls the real /sitemap.xml and /robots.txt the crawlers see, and prints
// the result — plus the commands that fix what it finds.
//
// Since 2026-10-04 it also CREATES content: the guide creator takes a title,
// slug, category, image, description and markdown body, validates them against
// the same slug rules as src/news-data.js, refuses duplicate slugs, outputs
// the article JSON (console + clipboard) for pasting into src/news-data.js,
// and audits the draft at its canonical /news/<slug> path with the same
// engine — so the operator sees the score before the article ships.
//
// It is a staff route: noindex, and never linked from the public nav.

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Copy, ExternalLink, FilePlus2, RefreshCw, Search, Wrench, X, AlertTriangle } from 'lucide-react';
import { auditDocument, summarise } from './seo-audit.js';
import { applySeo, BASE } from './seo.js';
import { NEWS, NEWS_CATEGORIES, articleBySlug, articleSlug, MAX_SLUG_LENGTH } from './news-data.js';

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

// The exact slug shape articleSlug() emits: lowercase alphanumerics joined by
// single hyphens, never starting or ending with a hyphen, max 90 characters.
const SLUG_SHAPE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const fmtDate = d => d.toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
const readMins = body => Math.max(2, Math.round(String(body).split(/\s+/).filter(Boolean).length / 200));

/** Validate the guide form. Returns {errors, warnings, slug} — errors block,
 *  warnings advise (they mirror what the audit would score down). */
export function validateGuide(form) {
  const errors = {};
  const warnings = [];
  const title = String(form.title || '').trim();
  let slug = String(form.slug || '').trim();

  if (!title) errors.title = 'A title is required.';
  else if (title.length > 65) warnings.push(`Title is ${title.length} characters — the audit warns past 65.`);

  if (!slug) slug = articleSlug(title);
  if (!slug) errors.slug = 'A slug is required — it is derived from the title.';
  else if (!SLUG_SHAPE.test(slug)) errors.slug = 'Slugs are lowercase letters, numbers and single hyphens — no spaces, capitals, underscores or trailing hyphen.';
  else if (slug.length > MAX_SLUG_LENGTH) errors.slug = `Slug is ${slug.length} characters — the maximum is ${MAX_SLUG_LENGTH}.`;
  else {
    const dup = articleBySlug(slug);
    if (dup) errors.slug = `"${slug}" is already published as “${dup.title}”. Pick a different slug.`;
  }

  if (!NEWS_CATEGORIES.includes(form.cat)) errors.cat = 'Pick one of the categories the /news page already filters by.';

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

export default function SeoDesk({ navigate }) {
  const [sitemapUrls, setSitemapUrls] = useState([]);
  const [robots, setRobots] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState('');

  // ---- guide creator state --------------------------------------------------
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ title: '', slug: '', cat: NEWS_CATEGORIES[0], img: GUIDE_ASSETS[0], desc: '', body: '' });
  const [slugTouched, setSlugTouched] = useState(false);
  const [createErrors, setCreateErrors] = useState({});
  const [createWarnings, setCreateWarnings] = useState([]);
  const [created, setCreated] = useState(null); // { article, json, slug, url, copied }
  const [draftAudit, setDraftAudit] = useState(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [sm, rb] = await Promise.all([
          fetch('/sitemap.xml', { cache: 'no-store' }).then(r => r.ok ? r.text() : ''),
          fetch('/robots.txt', { cache: 'no-store' }).then(r => r.ok ? r.text() : '')
        ]);
        if (!alive) return;
        setSitemapUrls([...String(sm).matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1].trim()));
        setRobots(rb);
      } catch { /* offline preview: the page still audits what it has */ }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, []);

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
    setForm(f => ({ ...f, title: v, slug: slugTouched ? f.slug : articleSlug(v) }));
    setCreateErrors({});
    setCreated(null);
    setDraftAudit(null);
  };

  // ---- create guide ----------------------------------------------------------
  // Validates, generates the NEWS-shaped article, outputs it (console +
  // clipboard) and audits the draft at /news/<slug> with the same engine.
  // It writes NOTHING to the database — this is a staff tool, and the paste
  // into src/news-data.js (or the database) stays a deliberate human act.
  const createGuide = async e => {
    e.preventDefault();
    const { errors, warnings, slug } = validateGuide(form);
    setCreateErrors(errors);
    setCreateWarnings(warnings);
    if (Object.keys(errors).length) { setCreated(null); setDraftAudit(null); return; }

    const article = buildArticle(form, slug);
    const json = JSON.stringify(article, null, 2);
    // eslint-disable-next-line no-console
    console.log('[seo-desk] new guide — paste this object into RAW_NEWS in src/news-data.js:\n' + json);

    let clip = 'copy-failed';
    try { await navigator.clipboard.writeText(json); clip = 'copied'; }
    catch { /* clipboard blocked — the JSON stays visible and selectable below */ }

    const url = BASE + '/news/' + encodeURIComponent(slug);
    setCreated({ article, json, slug, url, clip });

    // Audit the draft at its canonical path: the real applySeo() runs against
    // a scratch document (never the live page), resolving the article from the
    // draft list, and the shared engine scores exactly what crawlers would see
    // once the article ships. The sitemap fact includes the article's own URL
    // — the score is for the published state, and the sitemap block below is
    // the one line that makes it true.
    try {
      const draftDoc = document.implementation.createHTMLDocument('draft');
      applySeo('news', slug, null, { articleList: [...NEWS, article], doc: draftDoc });
      setDraftAudit(auditDocument(draftDoc, {
        route: 'news/' + slug,
        url,
        expectIndexable: true,
        origin: BASE,
        facts: { sitemapUrls: [...sitemapUrls, url], robotsTxt: robots },
        skipBody: true
      }));
    } catch { setDraftAudit(null); }
  };

  return (
    <section className="inner-page extra-page">
      <div className="page-hero mini extra-head">
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

      <div className="shell page-content">
        {creating && (
          <form className="seo-card seo-create" onSubmit={createGuide}>
            <h3><FilePlus2 size={16}/> Create a buyer guide</h3>
            <p className="seo-muted">
              Fills in the article shape <code>src/news-data.js</code> uses, validates the slug
              against the same rules as <code>articleSlug()</code>, refuses duplicates, copies the
              JSON to your clipboard, and audits the draft at its canonical <code>/news/&lt;slug&gt;</code> path.
              It writes nothing — pasting the JSON into <code>src/news-data.js</code> (or the database)
              stays a deliberate act.
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
                <span>Slug (auto-derived from the title)</span>
                <input
                  type="text" value={form.slug} maxLength={MAX_SLUG_LENGTH + 10}
                  onChange={e => { setSlugTouched(true); setField('slug', e.target.value); }}
                  placeholder="lowercase-words-joined-by-hyphens"
                  aria-label="Guide slug"
                />
                {createErrors.slug && <em className="seo-err">{createErrors.slug}</em>}
              </label>

              <label>
                <span>Category</span>
                <select value={form.cat} onChange={e => setField('cat', e.target.value)} aria-label="Guide category">
                  {NEWS_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
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

            <button className="gold-btn" type="submit">Generate article JSON + audit</button>

            {created && (
              <div className="seo-created">
                <p>
                  <Check size={14} className="seo-ok"/> Article generated for{' '}
                  <code>{created.url.replace(BASE, '')}</code> —{' '}
                  {created.clip === 'copied' ? 'the JSON is on your clipboard' : 'clipboard was blocked; select the JSON below'}.
                  {' '}Paste it into <code>RAW_NEWS</code> in <code>src/news-data.js</code>, add the
                  sitemap block, rebuild, and the guide is live.
                </p>
                <pre className="seo-json">{created.json}</pre>
                <details>
                  <summary>Add this to public/sitemap.xml (inside &lt;urlset&gt;)</summary>
                  <pre className="seo-json">{sitemapBlock(created.slug)}</pre>
                </details>
                <div className="seo-create-actions">
                  <button type="button" className="gold-btn" onClick={() => copy(created.json, 'guide-json')}>
                    {copied === 'guide-json' ? <><Check size={14}/> Copied again</> : <><Copy size={14}/> Copy JSON again</>}
                  </button>
                  <button type="button" className="gold-btn" onClick={() => copy(sitemapBlock(created.slug), 'guide-sitemap')}>
                    {copied === 'guide-sitemap' ? <><Check size={14}/> Sitemap block copied</> : <><Copy size={14}/> Copy sitemap block</>}
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
              <a key={href} href={href} onClick={e => { e.preventDefault(); navigate && navigate(href); }}>
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
