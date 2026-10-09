// Build-time HTML for editorial routes. Uses the SAME market component and
// metadata as the client; live inventory is deliberately not frozen at build.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { DEST, destinationHref } from '../src/destinations.js';
import { DestinationPage } from '../src/destination-page.jsx';
import { NEWS, articleSlug } from '../src/news-data.js';
import { applySeo, BASE } from '../src/seo.js';

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
    <DestinationPage dest={dest} Link={Link} Related={() => null} Flag={{}}/>, {destination: dest});
}
for (const article of NEWS) {
  const slug = article.slug || articleSlug(article);
  emit('/news/' + slug, 'news', slug,
    <article className="inner-page shell"><a href="/news">All buyer guides</a><h1>{article.title}</h1><p>{article.ex}</p>{String(article.body || '').split(/\n\n+/).map((p,i) => <p key={i}>{p}</p>)}<a href="/contact">Request a written quotation</a></article>);
}
console.log(`Prerendered ${DEST.length} destination pages and ${NEWS.length} guides.`);
