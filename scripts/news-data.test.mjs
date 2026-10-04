import fs from 'node:fs';
import {
  NEWS, NEWS_CATEGORIES, MAX_SLUG_LENGTH,
  articleSlug, articleBySlug, articleSeo, getPublishedNews,
  getNewsCategories, setPublishedNews, subscribePublishedNews
} from '../src/news-data.js';
import { DEST } from '../src/destinations.js';

let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; console.log('  ✓', msg); }
  else { fail++; console.error('  ✗', msg); }
};

console.log('news-data & destinations unit tests');

ok(Array.isArray(NEWS) && NEWS.length === 4, `NEWS contains 4 guides (got ${NEWS?.length})`);
ok(Array.isArray(NEWS_CATEGORIES) && NEWS_CATEGORIES.length === 4, `NEWS_CATEGORIES contains 4 topics (${NEWS_CATEGORIES.join(', ')})`);

for (const a of NEWS) {
  const slug = articleSlug(a);
  ok(slug.length > 0 && slug.length <= MAX_SLUG_LENGTH, `"${a.title}" produces a slug within ${MAX_SLUG_LENGTH} chars (${slug.length})`);
  ok(/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug), `slug "${slug}" is lowercase alphanumeric with single hyphens`);
  ok(a.slug === slug, `article.slug matches articleSlug(article.title) (${slug})`);
  ok(articleBySlug(slug) === a, `articleBySlug("${slug}") resolves the article`);
  ok(articleBySlug(encodeURIComponent(slug)) === a, `articleBySlug handles URL-encoded slug`);
  const seo = articleSeo(a);
  ok(seo && seo.title.includes(a.title) && seo.title.endsWith('| AR7 Traders'), `articleSeo title includes guide title (${seo?.title})`);
  ok(seo && seo.canonicalPath === `/news/${slug}`, `articleSeo canonicalPath is /news/${slug}`);
  ok(seo && seo.ogImage === a.img && fs.existsSync('public' + a.img), `articleSeo ogImage points to an existing asset in public/ (${a.img})`);
}

// Whole-word truncation at 90 chars
{
  const longTitle = 'Importing a Japanese Used Vehicle With Translated Auction Sheets Pre Shipment Inspection and RoRo Sea Freight to Port Qasim';
  const slug = articleSlug(longTitle);
  ok(slug.length <= 90, `long title slug is capped at <= 90 chars (got ${slug.length})`);
  ok(!slug.endsWith('-'), 'truncated slug does not end with a hyphen');
  const originalWords = longTitle.toLowerCase().replace(/[^a-z0-9]+/g, '-').split('-').filter(Boolean);
  const slugWords = slug.split('-');
  ok(slugWords.every((w, i) => w === originalWords[i]), 'truncated slug keeps whole words only (never cuts mid-word)');
}

ok(articleBySlug('') === null && articleBySlug(null) === null && articleBySlug('unknown-guide-slug') === null,
  'articleBySlug returns null for empty or unknown slugs');
ok(articleSeo(null) === null, 'articleSeo returns null for null input');

console.log('published site_articles hydration');
{
  let notified = 0;
  const unsubscribe = subscribePublishedNews(() => notified++);
  const updatedBuiltIn = {title: NEWS[0].title, category: 'MARKET WATCH', date: 'Oct 04, 2026',
    read_min: 6, image: NEWS[0].img, excerpt: 'CRM-edited excerpt', body: 'Updated guide body.', published: true, sort_order: 2};
  const newGuide = {id: 'guide-1', title: 'Importing used excavators in Pakistan', slug: 'stale-editor-slug', category: 'MACHINERY',
    date: 'Oct 03, 2026', read_min: 4, image: '/assets/machinery/hero-yard.webp',
    excerpt: 'A new published machinery guide with a buyer checklist.', body: 'First paragraph and second paragraph.',
    published: true, sort_order: -1};
  const hiddenGuide = {title: 'Unpublished draft', category: 'MACHINERY', published: false, sort_order: -2};
  ok(setPublishedNews([updatedBuiltIn, newGuide, hiddenGuide]), 'published rows from the existing site_articles entity are accepted');
  const live = getPublishedNews();
  ok(notified === 1, 'published-content subscribers are notified after hydration');
  ok(live.length === NEWS.length + 1, 'CRM guide is added, unpublished rows stay hidden and static guides do not duplicate');
  ok(live[0].title === newGuide.title && live[0].slug === articleSlug(newGuide.title),
    'new published guides sort first and derive their canonical slug from the stored title');
  ok(articleBySlug(articleSlug(newGuide.title), live) === live[0] && articleBySlug('stale-editor-slug', live) === null,
    'public route lookup accepts the title-derived URL and rejects a stale stored slug');
  ok(articleSeo(live[0])?.canonicalPath === `/news/${articleSlug(newGuide.title)}`,
    'published guide canonical metadata is derived from the stored title');
  ok(articleBySlug(NEWS[0].slug, live)?.ex === 'CRM-edited excerpt',
    'a site_articles row can update an existing built-in guide by its title-derived slug');
  ok(getNewsCategories().includes('MACHINERY'), 'the public filters include categories used by live guides');
  ok(!live.some(article => article.title === hiddenGuide.title), 'unpublished drafts never enter the public list');
  unsubscribe();
  ok(setPublishedNews(null) === false, 'a malformed article response is ignored safely');
}

// DEST structure (7 fields per row, transit planning figure, no duty % quoted)
ok(Array.isArray(DEST) && DEST.length === 6, `DEST has 6 destination markets (got ${DEST?.length})`);
for (const row of DEST) {
  ok(Array.isArray(row) && row.length === 7, `${row[0]} row has 7 fields ([country, port, transit, models, freight, whatToExpect, onArrival])`);
  ok(typeof row[5] === 'string' && row[5].length >= 60, `${row[0]} has a substantive "what to expect" guide`);
  ok(typeof row[6] === 'string' && row[6].length >= 60, `${row[0]} has a substantive "on arrival" guide`);
  ok(!/\b\d+(\.\d+)?\s*%/.test(row[5] + ' ' + row[6]), `${row[0]} guide quotes no duty percentage`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
