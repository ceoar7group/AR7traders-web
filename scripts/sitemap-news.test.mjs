#!/usr/bin/env node
// Dynamic news sitemap regression suite. Uses an in-memory Supabase-shaped
// client only; there are no network fetches or real credentials.
import {readFileSync} from 'node:fs';
import {buildNewsXml, sitemapNews} from '../api/site-content.js';
import {NEWS, articleSlug} from '../src/news-data.js';

let pass = 0, fail = 0;
const ok = (condition, message) => {
  if (condition) { pass++; console.log('  ✓ ' + message); }
  else { fail++; console.error('  ✗ ' + message); }
};
const locs = xml => [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(match => match[1]);

function memDb(rows, error = null) {
  return {
    from(name) {
      if (name !== 'site_articles') throw new Error(`unexpected table ${name}`);
      const context = {filters: [], max: Infinity};
      const query = {
        select: columns => { context.columns = columns; return query; },
        eq: (key, value) => { context.filters.push(row => row[key] === value); return query; },
        order: (key, options) => { context.order = [key, options]; return query; },
        limit: amount => { context.max = amount; return query; },
        then(resolve) {
          if (error) return resolve({data: null, error: {message: error}});
          const selected = rows.filter(row => context.filters.every(filter => filter(row)))
            .slice(0, context.max);
          return resolve({data: selected, error: null});
        }
      };
      return query;
    }
  };
}

function fakeRes() {
  return {
    statusCode: 0, body: '', headers: {},
    setHeader(key, value) { this.headers[String(key).toLowerCase()] = value; },
    end(value) { this.body = String(value); }
  };
}

console.log('\n-- the static fallback includes built-in buyer guides --');
{
  const xml = buildNewsXml([]);
  const urls = locs(xml);
  ok(xml.includes('<urlset') && xml.includes('xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"'),
    'empty database rows still produce valid XML');
  ok(NEWS.every(article => urls.includes(`https://ar7traders.com/news/${article.slug}`)),
    'every built-in guide remains in the fallback sitemap');
}

console.log('\n-- dynamic rows are published and de-duplicated by title-derived slug --');
{
  const edited = {title: NEWS[0].title, published: true, updated_at: '2026-10-04T10:30:00Z'};
  const fresh = {title: 'Importing used excavators in Pakistan', slug: 'stale-editor-slug', published: true, updated_at: '2026-10-04T11:00:00Z'};
  const hidden = {title: 'Draft guide', published: false, updated_at: '2026-10-04T12:00:00Z'};
  const urls = locs(buildNewsXml([edited, fresh, hidden]));
  const existingUrl = `https://ar7traders.com/news/${NEWS[0].slug}`;
  const freshUrl = `https://ar7traders.com/news/${articleSlug(fresh.title)}`;
  ok(urls.filter(url => url === existingUrl).length === 1, 'editing a built-in article does not duplicate its canonical URL');
  ok(urls.includes(freshUrl) && !urls.some(url => url.endsWith('/draft-guide')) &&
     !urls.includes('https://ar7traders.com/news/stale-editor-slug'),
    'the sitemap uses the stored title, excludes stale slugs and omits unpublished rows');
  const xml = buildNewsXml([edited, fresh]);
  ok(xml.includes('<lastmod>2026-10-04</lastmod>'), 'a real updated_at timestamp becomes a date-only lastmod');
}

console.log('\n-- existing site-content function dispatch --');
{
  const rows = [
    {title: 'Published from CRM', published: true, sort_order: -1, updated_at: '2026-10-04T11:00:00Z'},
    {title: 'Not published', published: false, sort_order: -2}
  ];
  const db = memDb(rows);
  const res = fakeRes();
  await sitemapNews({method: 'GET'}, res, {db});
  const urls = locs(res.body);
  ok(res.statusCode === 200 && res.headers['content-type'] === 'application/xml; charset=utf-8',
    'the existing API function returns a cacheable XML response');
  ok(urls.includes(`https://ar7traders.com/news/${articleSlug(rows[0].title)}`) &&
     !urls.includes(`https://ar7traders.com/news/${articleSlug(rows[1].title)}`),
    'the dynamic endpoint includes only published site_articles records');
  ok(res.headers['cache-control']?.includes('s-maxage='), 'the sitemap is publicly cached for a short interval');
}

console.log('\n-- safe fallback and method guard --');
{
  const realError = console.error;
  console.error = () => {};
  try {
    const fallback = fakeRes();
    await sitemapNews({method: 'GET'}, fallback, {db: memDb([], 'temporary database outage')});
    ok(fallback.statusCode === 200 && NEWS.every(article => locs(fallback.body).includes(`https://ar7traders.com/news/${article.slug}`)),
      'a database outage still serves the valid built-in-guide sitemap');
  } finally { console.error = realError; }

  const method = fakeRes();
  await sitemapNews({method: 'POST'}, method, {db: memDb([])});
  ok(method.statusCode === 405 && method.headers.allow === 'GET', 'the sitemap endpoint is GET-only');
}

console.log('\n-- deployment dispatch stays within the existing function --');
{
  const config = JSON.parse(readFileSync('vercel.json', 'utf8'));
  ok(config.rewrites.some(rule => rule.source === '/api/sitemap-news.xml' &&
    rule.destination === '/api/site-content?sitemap=news'),
    'the public news-sitemap URL rewrites through the existing site-content function');
  ok(readFileSync('api/site-content.js', 'utf8').includes("req.query.sitemap || '') === 'news'"),
    'news sitemap dispatch remains inside api/site-content.js');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
