// The in-site SEO desk (/seo).
//
// Why it exists: the owner should not have to take anyone's word for it that
// the SEO is done. This page runs the exact same audit engine the CLI agent
// and the Arena agent use (src/seo-audit.js) against the page it is standing
// on, pulls the real /sitemap.xml and /robots.txt the crawlers see, and prints
// the result — plus the commands that fix what it finds.
//
// It is a staff route: noindex, and never linked from the public nav.

import { useEffect, useMemo, useState } from 'react';
import { ArrowRight, Check, Copy, ExternalLink, RefreshCw, Search, Wrench, X, AlertTriangle } from 'lucide-react';
import { auditDocument, summarise } from './seo-audit.js';
import { BASE } from './seo.js';

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

export default function SeoDesk({ navigate }) {
  const [sitemapUrls, setSitemapUrls] = useState([]);
  const [robots, setRobots] = useState('');
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState('');

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
        </div>
      </div>

      <div className="shell page-content">
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
