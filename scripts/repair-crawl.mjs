// Deterministic, idempotent crawl-file repair. Runs before every production
// build; never touches content, credentials, lastmod dates or publication state.
import {readFileSync, writeFileSync} from 'node:fs';
import {DEST, destinationHref} from '../src/destinations.js';
import {NEWS} from '../src/news-data.js';
import {SITE_SITEMAP_PATHS} from '../src/seo-url.js';
const origin='https://ar7traders.com';
const routes=[...DEST.map(d=>destinationHref(d[0])),...NEWS.map(a=>'/news/'+a.slug)];
let xml=readFileSync('public/sitemap.xml','utf8');
if (!xml.includes('</urlset>')) throw new Error('Cannot repair malformed sitemap: missing urlset');
for (const route of routes) if (!xml.includes(`<loc>${origin}${route}</loc>`))
  xml=xml.replace('</urlset>',`  <url><loc>${origin}${route}</loc></url>\n</urlset>`);
writeFileSync('public/sitemap.xml',xml);
let robots=readFileSync('public/robots.txt','utf8');
for (const path of SITE_SITEMAP_PATHS) {
  const line=`Sitemap: ${origin}${path}`;
  if(!robots.split(/\r?\n/).some(l=>l.trim()===line)) robots=robots.trimEnd()+'\n'+line+'\n';
}
writeFileSync('public/robots.txt',robots);
const config=JSON.parse(readFileSync('vercel.json','utf8'));
for (const source of routes) {
  const destination=source+'/index.html';
  const rule=config.rewrites.find(r=>r.source===source);
  if(rule && rule.destination!==destination) throw new Error(`Conflicting rewrite for ${source}; manual review required`);
  if(!rule) config.rewrites.unshift({source,destination});
}
writeFileSync('vercel.json',JSON.stringify(config,null,2)+'\n');
console.log(`Safe crawl repair checked ${routes.length} editorial routes and ${SITE_SITEMAP_PATHS.length} sitemap declarations.`);
