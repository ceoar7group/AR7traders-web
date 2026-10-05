#!/usr/bin/env node
// Staff-only SEO provider and indexing workflows. Every network call is mocked;
// this test must never contact Search Console, IndexNow or the live site.
import assert from 'node:assert/strict';
import {generateKeyPairSync} from 'node:crypto';
import siteContent from '../api/site-content.js';
import {NEWS, articleSlug} from '../src/news-data.js';
import {SITE_CANONICAL_ORIGIN, filterIndexingCandidates, isStaffNoindexPath, sitemapSourcesFromRobots} from '../src/seo-url.js';

const clone = value => structuredClone(value);
function fakeDb(seed = {}) {
  const tables = {site_articles: [], activities: [], ...seed};
  let seq = 0;
  return {
    tables,
    from(table) {
      const q = {_method: 'select', _payload: null, _filters: [], _limit: null};
      q.select = () => q;
      q.single = () => q;
      q.maybeSingle = () => q;
      q.eq = (key, value) => { q._filters.push([key, value]); return q; };
      q.order = () => q;
      q.limit = value => { q._limit = value; return q; };
      q.insert = payload => { q._method = 'insert'; q._payload = payload; return q; };
      q.update = payload => { q._method = 'update'; q._payload = payload; return q; };
      q.delete = () => { q._method = 'delete'; return q; };
      q.then = (resolve, reject) => {
        try {
          const rows = tables[table] || (tables[table] = []);
          const matches = rows.filter(row => q._filters.every(([key, value]) => String(row[key]) === String(value)));
          if (q._method === 'insert') {
            const payloads = Array.isArray(q._payload) ? q._payload : [q._payload];
            const added = payloads.map(row => ({id: `fake-${++seq}`, created_at: '2026-10-05T00:00:00.000Z', ...clone(row)}));
            rows.push(...added);
            return resolve({data: Array.isArray(q._payload) ? added : added[0], error: null});
          }
          if (q._method === 'update') {
            for (const row of matches) Object.assign(row, clone(q._payload));
            return resolve({data: matches[0] ? clone(matches[0]) : null, error: null});
          }
          if (q._method === 'delete') {
            for (const row of matches) rows.splice(rows.indexOf(row), 1);
            return resolve({data: null, error: null});
          }
          const result = q._limit == null ? matches : matches.slice(0, q._limit);
          return resolve({data: result.map(clone), error: null});
        } catch (error) { return reject(error); }
      };
      return q;
    }
  };
}
function response(status, payload = {}, body = '') {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => clone(payload),
    text: async () => body
  };
}
function fakeRes() {
  return {
    statusCode: 0, body: null, headers: {},
    status(code) { this.statusCode = code; return this; },
    setHeader(key, value) { this.headers[String(key).toLowerCase()] = value; return this; },
    end(value) { this.body = value; return this; },
    json() { return typeof this.body === 'string' ? JSON.parse(this.body) : this.body; }
  };
}
const OWNER = {id: 'seo-owner', role: 'admin', email: 'owner@ar7.test', full_name: 'SEO Owner'};
const staff = {
  getUser: async () => ({user: {id: OWNER.id, email: OWNER.email}, profile: OWNER, db: null}),
  permsFor: async role => ({'site.write': role === 'admin' || role === 'manager'})
};
const req = (method, seo, body = {}) => ({method, query: {seo}, body, headers: {}});
const run = async (method, action, body, injected = {}) => {
  const res = fakeRes();
  await siteContent(req(method, action, body), res, {...staff, ...injected});
  return res;
};

console.log('\n-- site_articles draft, publish and sitemap contract --');
{
  const db = fakeDb();
  const articleRequest = (method, query, body = {}) => ({method, query, body, headers: {}});
  const draft = {
    title: 'Staff verified exporter guide', category: 'BUYER GUIDES', date: 'Oct 05, 2026',
    read_min: 2, image: '/assets/og/help.jpg', excerpt: 'A reviewed guide for buyers using the current stock information.',
    body: 'Only staff-verified details belong in this article.', published: false, sort_order: -1
  };
  const createdRes = fakeRes();
  await siteContent(articleRequest('POST', {entity: 'articles'}, draft), createdRes, {...staff, db});
  assert.equal(createdRes.statusCode, 200);
  const created = createdRes.json();
  assert.equal(created.published, false, 'the site_articles POST accepts an unpublished draft');
  assert.equal(Object.hasOwn(created, 'slug'), false, 'the existing schema keeps canonical slugs title-derived');
  const slug = articleSlug(created);

  const publicBefore = fakeRes();
  await siteContent(articleRequest('GET', {entity: 'articles'}), publicBefore, {db});
  assert.equal(publicBefore.json().some(row => row.id === created.id), false, 'anonymous public reads never return drafts');
  const draftSitemap = fakeRes();
  await siteContent(articleRequest('GET', {sitemap: 'news'}), draftSitemap, {db});
  assert.equal(String(draftSitemap.body).includes(`/news/${slug}`), false, 'the dynamic news sitemap excludes a saved draft');

  const staffList = fakeRes();
  await siteContent(articleRequest('GET', {entity: 'articles', all: '1'}), staffList, {...staff, db});
  assert.equal(staffList.statusCode, 200);
  assert.equal(staffList.json().some(row => row.id === created.id && row.published === false), true,
    'the authenticated all=1 staff read returns the draft');
  const anonList = fakeRes();
  await siteContent(articleRequest('GET', {entity: 'articles', all: '1'}), anonList, {db});
  assert.equal(anonList.statusCode, 401, 'the all=1 article list requires authentication');
  const deniedList = fakeRes();
  await siteContent(articleRequest('GET', {entity: 'articles', all: '1'}), deniedList, {
    db, getUser: async () => ({user: {id: 'sales'}, profile: {id: 'sales', role: 'sales'}}),
    permsFor: async () => ({'site.write': false})
  });
  assert.equal(deniedList.statusCode, 403, 'the all=1 article list enforces site.write');

  const editedRes = fakeRes();
  await siteContent(articleRequest('PATCH', {entity: 'articles'}, {
    id: created.id, excerpt: 'Updated verified copy with a source note.', published: false
  }), editedRes, {...staff, db});
  assert.equal(editedRes.statusCode, 200);
  assert.equal(editedRes.json().published, false, 'editing draft metadata does not publish the draft');
  assert.equal(editedRes.json().excerpt, 'Updated verified copy with a source note.');

  const publishRes = fakeRes();
  await siteContent(articleRequest('PATCH', {entity: 'articles'}, {id: created.id, published: true}), publishRes, {...staff, db});
  assert.equal(publishRes.statusCode, 200);
  assert.equal(publishRes.json().published, true, 'publication is an explicit authenticated PATCH');
  const publicAfter = fakeRes();
  await siteContent(articleRequest('GET', {entity: 'articles'}), publicAfter, {db});
  assert.equal(publicAfter.json().some(row => row.id === created.id), true, 'the published guide enters public article reads');
  const publishedSitemap = fakeRes();
  await siteContent(articleRequest('GET', {sitemap: 'news'}), publishedSitemap, {db});
  assert.equal(String(publishedSitemap.body).includes(`/news/${slug}`), true, 'the published guide enters the dynamic news sitemap');
}

console.log('\n-- SEO URL safety --');
for (const path of ['/crm', '/crm/staff', '/account', '/account/orders', '/portal', '/studio', '/seo']) {
  assert.equal(isStaffNoindexPath(path), true, `${path} must remain excluded`);
}
assert.equal(isStaffNoindexPath('/crmpage'), false, 'similar public slugs must not be blocked by prefix alone');
const discovered = sitemapSourcesFromRobots(`Sitemap: https://ar7traders.com/sitemap.xml\nSitemap: https://ar7traders.com/api/sitemap-news.xml\nSitemap: https://evil.example/sitemap.xml`);
assert.deepEqual(discovered, [
  'https://ar7traders.com/sitemap.xml',
  'https://ar7traders.com/api/sitemap-news.xml'
], 'only declared canonical sitemap endpoints are retained');
const draftSlug = articleSlug({title: 'Private indexing workflow draft'});
const knownSlug = articleSlug(NEWS[0]);
const urlSet = [
  `${SITE_CANONICAL_ORIGIN}/`,
  `${SITE_CANONICAL_ORIGIN}/news/${knownSlug}`,
  `${SITE_CANONICAL_ORIGIN}/news/${draftSlug}`,
  `${SITE_CANONICAL_ORIGIN}/news/not-a-published-article`,
  `${SITE_CANONICAL_ORIGIN}/crm`, `${SITE_CANONICAL_ORIGIN}/crm/seo`,
  `${SITE_CANONICAL_ORIGIN}/account`, `${SITE_CANONICAL_ORIGIN}/portal`,
  `${SITE_CANONICAL_ORIGIN}/studio`, `${SITE_CANONICAL_ORIGIN}/seo`,
  `${SITE_CANONICAL_ORIGIN}/contact?campaign=1`, 'https://elsewhere.example/page',
  `${SITE_CANONICAL_ORIGIN}/not-indexable`
];
const filtered = filterIndexingCandidates(urlSet, {
  draftSlugs: [draftSlug], publishedNewsSlugs: [...NEWS.map(articleSlug), 'published-staff-article'],
  noindexUrls: [`${SITE_CANONICAL_ORIGIN}/not-indexable`]
});
assert.deepEqual(filtered.eligibleUrls, [
  `${SITE_CANONICAL_ORIGIN}/`, `${SITE_CANONICAL_ORIGIN}/news/${knownSlug}`
], 'only canonical published/indexable URLs remain eligible');
assert(filtered.excluded.some(row => row.url.endsWith(`/news/${draftSlug}`) && /draft/i.test(row.reason)), 'unpublished drafts are excluded with a reason');
assert(filtered.excluded.some(row => row.url.endsWith('/news/not-a-published-article')), 'unknown news paths are not assumed public');
assert(filtered.excluded.filter(row => /staff/i.test(row.reason)).length >= 6, 'staff, portal and CRM paths receive explicit exclusions');
assert(filtered.excluded.some(row => /noindex/i.test(row.reason)), 'crawled noindex pages receive an explicit exclusion');

console.log('-- disconnected status is factual and makes no provider request --');
{
  const db = fakeDb();
  let fetchCount = 0;
  const res = await run('GET', 'status', {}, {db, env: {}, fetch: async () => { fetchCount++; throw new Error('must not fetch without credentials'); }});
  assert.equal(res.statusCode, 200);
  assert.equal(res.json().google.state, 'not_configured');
  assert.equal(res.json().indexNow.state, 'not_configured');
  assert.equal(res.json().localAudit.available, true);
  assert.match(res.json().localAudit.note, /not Search Console/i);
  assert.equal(fetchCount, 0, 'missing credentials cause no network attempt');
}

console.log('-- authenticated preview filters drafts, noindex, staff and untrusted sitemaps --');
{
  const db = fakeDb({site_articles: [
    {title: 'Private indexing workflow draft', published: false},
    {title: 'Published staff article', published: true}
  ]});
  let fetchCount = 0;
  const res = await run('POST', 'preview', {
    urls: [...urlSet, `${SITE_CANONICAL_ORIGIN}/news/${articleSlug({title: 'Published staff article'})}`],
    noindexUrls: [`${SITE_CANONICAL_ORIGIN}/not-indexable`],
    sitemaps: [`${SITE_CANONICAL_ORIGIN}/sitemap.xml`, 'https://evil.example/sitemap.xml', `${SITE_CANONICAL_ORIGIN}/api/sitemap-news.xml`]
  }, {db, env: {}, fetch: async () => { fetchCount++; throw new Error('unconfigured preview must not fetch providers'); }});
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.json().eligibleUrls, [
    `${SITE_CANONICAL_ORIGIN}/`, `${SITE_CANONICAL_ORIGIN}/news/${knownSlug}`,
    `${SITE_CANONICAL_ORIGIN}/news/${articleSlug({title: 'Published staff article'})}`
  ]);
  assert.equal(res.json().sitemapSources.length, 2, 'arbitrary sitemap URLs are not submitted');
  assert.equal(res.json().providers.google.state, 'not_configured');
  assert.match(res.json().note, /neither guarantees indexing/i);
  assert.equal(fetchCount, 0);
}

console.log('-- workflow API is permission checked --');
{
  const res = fakeRes();
  await siteContent(req('GET', 'status'), res, {db: fakeDb()});
  assert.equal(res.statusCode, 401, 'anonymous callers cannot read SEO provider status');
}

console.log('-- Search Console, IndexNow, sitemap submit and URL inspection use mocked providers --');
{
  const {privateKey} = generateKeyPairSync('rsa', {modulusLength: 2048});
  const key = 'ar7-indexnow-test-key-2026';
  const env = {
    GOOGLE_SERVICE_ACCOUNT_JSON: JSON.stringify({client_email: 'ar7-test@example.iam.gserviceaccount.com', private_key: privateKey.export({type: 'pkcs8', format: 'pem'})}),
    GSC_SITE_URL: 'sc-domain:ar7traders.com',
    AR7_INDEXNOW_KEY: key
  };
  const db = fakeDb({site_articles: [
    {title: 'Private indexing workflow draft', published: false},
    {title: 'Published staff article', published: true}
  ]});
  const calls = [];
  const fetch = async (input, options = {}) => {
    const url = String(input); calls.push({url, options});
    if (url === 'https://oauth2.googleapis.com/token') {
      const fields = new URLSearchParams(options.body);
      assert.equal(fields.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
      assert.ok(fields.get('assertion').split('.').length === 3, 'OAuth uses a signed service-account assertion');
      return response(200, {access_token: 'mock-access-token'});
    }
    if (url === 'https://searchconsole.googleapis.com/webmasters/v3/sites') {
      assert.equal(options.headers.Authorization, 'Bearer mock-access-token');
      return response(200, {siteEntry: [{siteUrl: 'sc-domain:ar7traders.com', permissionLevel: 'siteOwner'}]});
    }
    if (url === `${SITE_CANONICAL_ORIGIN}/${key}.txt`) return response(200, {}, key);
    if (url === 'https://api.indexnow.org/indexnow') {
      const payload = JSON.parse(options.body);
      assert.equal(payload.host, 'ar7traders.com');
      assert.equal(payload.key, key);
      assert.equal(payload.keyLocation, `${SITE_CANONICAL_ORIGIN}/${key}.txt`);
      assert.deepEqual(payload.urlList, [
        `${SITE_CANONICAL_ORIGIN}/`, `${SITE_CANONICAL_ORIGIN}/news/${knownSlug}`,
        `${SITE_CANONICAL_ORIGIN}/news/${articleSlug({title: 'Published staff article'})}`
      ], 'IndexNow receives only eligible, published URLs');
      return response(202);
    }
    if (url.startsWith('https://searchconsole.googleapis.com/webmasters/v3/sites/') && url.includes('/sitemaps/')) {
      assert.equal(options.method, 'PUT', 'Google receives the official sitemap submission method');
      return response(200);
    }
    if (url === 'https://searchconsole.googleapis.com/v1/urlInspection/index:inspect') {
      assert.equal(options.method, 'POST');
      assert.equal(JSON.parse(options.body).inspectionUrl, `${SITE_CANONICAL_ORIGIN}/news/${knownSlug}`);
      return response(200, {inspectionResult: {indexStatusResult: {
        verdict: 'PASS', coverageState: 'Submitted and indexed', indexingState: 'INDEXING_ALLOWED',
        pageFetchState: 'SUCCESSFUL', robotsTxtState: 'ALLOWED', lastCrawlTime: '2026-10-04T10:00:00Z',
        googleCanonical: `${SITE_CANONICAL_ORIGIN}/news/${knownSlug}`,
        userCanonical: `${SITE_CANONICAL_ORIGIN}/news/${knownSlug}`
      }}});
    }
    throw new Error(`Unexpected network request in test: ${url}`);
  };
  const fixedNow = Date.parse('2026-10-05T12:00:00Z');
  const status = await run('GET', 'status', {}, {db, env, fetch, now: fixedNow});
  assert.equal(status.statusCode, 200);
  assert.equal(status.json().google.state, 'connected');
  assert.equal(status.json().indexNow.state, 'connected');

  const body = {
    urls: [...urlSet, `${SITE_CANONICAL_ORIGIN}/news/${articleSlug({title: 'Published staff article'})}`],
    noindexUrls: [`${SITE_CANONICAL_ORIGIN}/not-indexable`],
    sitemaps: [`${SITE_CANONICAL_ORIGIN}/sitemap.xml`, `${SITE_CANONICAL_ORIGIN}/api/sitemap-news.xml`, 'https://evil.example/sitemap.xml']
  };
  const submit = await run('POST', 'submit', body, {db, env, fetch, now: fixedNow});
  assert.equal(submit.statusCode, 200);
  const result = submit.json();
  assert.equal(result.eligibleCount, 3);
  assert.equal(result.excludedCount >= 10, true);
  assert.equal(result.sitemapCount, 2);
  assert.equal(result.google.state, 'accepted');
  assert.equal(result.google.submitted, 2);
  assert.equal(result.google.results.length, 2);
  assert.equal(result.indexNow.state, 'validation_pending', 'HTTP 202 is not mislabeled as final indexing');
  assert.equal(result.indexNow.submitted, 3);
  assert.equal(result.audit.saved, true);
  assert.match(result.google.detail, /does not force indexing/i);
  assert(db.tables.activities.some(row => row.entity_type === 'seo_indexing'), 'submission result is written to the audit trail');

  const inspect = await run('POST', 'inspect', {url: `${SITE_CANONICAL_ORIGIN}/news/${knownSlug}`}, {db, env, fetch, now: fixedNow});
  assert.equal(inspect.statusCode, 200);
  assert.equal(inspect.json().state, 'inspected');
  assert.equal(inspect.json().verdict, 'PASS');
  assert.match(inspect.json().detail, /last known state/i);
  const forbidden = await run('POST', 'inspect', {url: `${SITE_CANONICAL_ORIGIN}/seo`}, {db, env, fetch, now: fixedNow});
  assert.equal(forbidden.statusCode, 400, 'staff routes cannot be inspected through the staff workflow');

  const audit = await run('GET', 'audit', {}, {db, env, fetch, now: fixedNow});
  assert.equal(audit.statusCode, 200);
  assert.equal(audit.json().length, 1);
  assert.match(audit.json()[0].action, /3 eligible URL/);
  assert(calls.some(call => call.url === 'https://api.indexnow.org/indexnow'));
  assert(calls.some(call => call.url.includes('/sitemaps/')));
  assert(calls.some(call => call.url.endsWith('/urlInspection/index:inspect')));
  assert(calls.every(call => !/localhost|127\.0\.0\.1/.test(call.url)), 'provider mocks use no browser-localhost URLs');
}

console.log('SEO workflow API regression checks passed.');
