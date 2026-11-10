// Build-time HTML for editorial routes. Uses the SAME market component and
// metadata as the client; live inventory is deliberately not frozen at build.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { DEST, destinationHref } from '../src/destinations.js';
import { DestinationPage } from '../src/destination-page.jsx';
import { Flag } from '../src/flag.jsx';
import { NEWS, articleSlug } from '../src/news-data.js';
import { applySeo, BASE } from '../src/seo.js';
import { MACHINES, machineHref, machineTypeSlug, MACHINE_TYPES } from '../src/machinery-data.js';

const template = readFileSync('dist/index.html', 'utf8');
const Link = ({to, children, className}) => <a className={className} href={to.startsWith('/') ? to : '/' + to}>{children}</a>;
function emit(path, page, id, content, opts = {}) {
  const dom = new JSDOM(template, {url: BASE + path});
  const doc = dom.window.document;
  applySeo(page, id, null, { ...opts, doc });
  doc.getElementById('root').innerHTML = renderToStaticMarkup(<><nav aria-label="Main navigation"><a href="/">AR7 Traders</a> · <a href="/inventory">Inventory</a> · <a href="/destinations">Destinations</a> · <a href="/news">Buyer guides</a></nav><main>{content}</main></>);
  doc.querySelector('noscript')?.remove();
  const dir = 'dist' + path;
  mkdirSync(dir, {recursive: true});
  writeFileSync(dir + '/index.html', dom.serialize());
  dom.window.close();
}
for (const dest of DEST) {
  emit(destinationHref(dest[0]), 'destinations', null,
    <DestinationPage dest={dest} Link={Link} Related={() => null} Flag={Flag}/>, {destination: dest});
}
for (const article of NEWS) {
  const slug = article.slug || articleSlug(article);
  emit('/news/' + slug, 'news', slug,
    <article className="inner-page shell"><a href="/news">All buyer guides</a><h1>{article.title}</h1><p>{article.ex}</p>{String(article.body || '').split(/\n\n+/).map((p,i) => <p key={i}>{p}</p>)}<a href="/contact">Request a written quotation</a>
    {/* Keep-exploring block (2026-11-07 crawl report): guides had under 8
        internal links, so crawlers hit a dead end instead of the catalogue.
        These are the pages a guide reader actually goes to next. */}
    <nav aria-label="Keep exploring"><h2>Keep exploring</h2><ul>
      <li><a href="/cars/toyota">Used Toyota stock from Japan</a></li>
      <li><a href="/auction">How the Japanese auctions work</a></li>
      <li><a href="/machinery">Heavy machinery sourced from China</a></li>
      <li><a href="/tools">Import duty & CIF calculators</a></li>
      <li><a href="/services">Export services & inspection</a></li>
      <li><a href="/faq">Buyer questions, answered</a></li>
    </ul></nav></article>);
}

// ---------------------------------------------------------------------------
// Head-only prerender for the static public routes (2026-11-10 SEO report:
// 460 live pages failed "Canonical URL" because the SPA shell — which by
// design carries NO canonical, see the 2026-11-18 Search Console note in
// bundle-budget.test.mjs — answered for them). Each route below gets its own
// dist/<route>/index.html whose HEAD is rewritten by the same applySeo() the
// client runs (title, description, OG tags, robots and the per-route
// canonical), while the BODY stays the untouched shell so hydration is
// byte-for-byte what these routes already shipped. The homepage '/' and the
// per-vehicle pages stay shell-served (runtime canonical via applySeo):
// Vercel serves dist/index.html for '/' from the filesystem before rewrites
// run, and the shell must keep no canonical for the ~400 vehicle routes.
// ---------------------------------------------------------------------------
function emitHeadOnly(path, page, opts = {}) {
  const dom = new JSDOM(template, {url: BASE + path});
  applySeo(page, null, null, { ...opts, doc: dom.window.document });
  const dir = 'dist' + path;
  mkdirSync(dir, {recursive: true});
  writeFileSync(dir + '/index.html', dom.serialize());
  dom.window.close();
}

export const STATIC_PAGE_ROUTES = [
  'inventory', 'auction', 'services', 'brands', 'destinations', 'tools',
  'world', 'howbuy', 'news', 'about', 'reviews', 'faq', 'contact',
  'shipping', 'machinery', 'privacy', 'cookies', 'terms'
];
for (const page of STATIC_PAGE_ROUTES) emitHeadOnly('/' + page, page);
for (const type of MACHINE_TYPES) {
  const slug = String(type).toLowerCase();
  emitHeadOnly('/machinery/' + slug, 'machinery', { machineType: slug });
}
for (const machine of MACHINES) {
  emitHeadOnly(machineHref(machine), 'machinery',
    { machine, machineType: machineTypeSlug(machine), machineRef: machine.ref || machine.id });
}

const headOnlyCount = STATIC_PAGE_ROUTES.length + MACHINE_TYPES.length + MACHINES.length;
console.log(`Prerendered ${DEST.length} destination pages, ${NEWS.length} guides and ${headOnlyCount} static heads.`);
