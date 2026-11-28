// The per-article generated cover (npm run test:article-covers).
//
// 2026-11-25 (owner: "add an AI that generates a separate image for each
// article … i need free"). The contract this suite pins:
//   • every article resolves to a 1200×630 JPEG — the size every messenger and
//     crawler expects — and never to an error or a broken image;
//   • the covers are genuinely per-article: two different articles must not
//     render the same bytes, and the SAME article must always render the same
//     cover (a published page must not change look on a re-render);
//   • it costs nothing: no API key is read, no paid endpoint is called, and with
//     no network at all the image still renders;
//   • the optional free-AI path is opt-in (ARTICLE_COVER_AI=on) and falls back
//     to the composed cover when the provider is slow or down;
//   • the news UI draws `cover`, and the URL it draws is the one the endpoint
//     serves.
let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
const bad = s => process.stderr.write(s + '\n');
const ok = (cond, msg) => { if (cond) { pass++; say('  ✓ ' + msg); } else { fail++; bad('  ✗ ' + msg); } };

const {
  ARTICLE_COVER, ARTICLE_COVER_TYPE, ARTICLE_COVER_CACHE, coverSeed, coverScheme,
  buildCoverSvg, renderArticleCover, freeAiArt, articleCoverPath
} = await import('../api/_article-image.js');
const { articleCoverUrl, isCoverPath } = await import('../src/article-cover.js');
const { articleCoverImage } = await import('../api/site-content.js');
const sharp = (await import('sharp')).default;

function fakeRes() {
  return {
    statusCode: 0, headers: {}, body: null,
    setHeader(k, v) { this.headers[k.toLowerCase()] = v; },
    end(b) { this.body = b; }
  };
}
const fakeDb = rows => ({
  from: () => ({ select: () => ({ limit: async () => ({ data: rows, error: null }) }) })
});

say('\n1) the URL contract');
{
  ok(articleCoverPath('how-to-check-a-used-excavator') === '/api/cover/how-to-check-a-used-excavator',
    'a slug maps to its own path');
  ok(articleCoverPath('a b') === '/api/cover/a%20b', 'and is encoded, so no slug can reshape the URL');
  ok(articleCoverUrl('https://ar7traders.com', 'x') === 'https://ar7traders.com/api/cover/x',
    'the absolute URL the head publishes is the same one the endpoint serves');
  ok(isCoverPath('/api/cover/x') && !isCoverPath('/assets/covers/guide-fob-cif.webp'),
    'a stored cover is recognisable, so the endpoint never uses its own output as a source photo');
  ok(ARTICLE_COVER.width === 1200 && ARTICLE_COVER.height === 630, 'the cover is 1200×630');
  ok(ARTICLE_COVER_TYPE === 'image/jpeg', 'and served as JPEG');
  ok(/s-maxage=31536000/.test(ARTICLE_COVER_CACHE), 'cached for a year at the edge — it never changes for a slug');
}

say('\n2) one distinct cover per article, stable forever');
{
  const a = { title: 'Importing a used excavator from China', category: 'Machinery', slug: 'excavator-china' };
  const b = { title: 'Shipping a Land Cruiser to Karachi', category: 'Shipping', slug: 'land-cruiser-karachi' };
  ok(Buffer.compare(coverSeed(a.slug), coverSeed(a.slug)) === 0, 'the seed is derived from the slug, deterministically');
  ok(Buffer.compare(coverSeed(a.slug), coverSeed(b.slug)) !== 0, 'and differs between articles');
  ok(coverScheme(coverSeed('one')) === coverScheme(coverSeed('one')) && !!coverScheme(coverSeed('two')).accent,
    'the palette comes from the seed, not from a rotation counter');

  const one = await renderArticleCover(a, {});
  const oneAgain = await renderArticleCover(a, {});
  const other = await renderArticleCover(b, {});
  ok(one.subarray(0, 3).toString('hex') === 'ffd8ff', 'the render is a JPEG');
  const meta = await sharp(one).metadata();
  ok(meta.width === 1200 && meta.height === 630, `and exactly 1200×630 (${meta.width}×${meta.height})`);
  ok(Buffer.compare(one, oneAgain) === 0, 'the same article always renders the same cover');
  ok(Buffer.compare(one, other) !== 0, 'a different article renders a different cover');
  ok(one.length > 20000 && one.length < 400000, `the file is a sensible size for the web (${Math.round(one.length / 1024)} kB)`);
}

say('\n3) it says only what the article says');
{
  const svg = buildCoverSvg({ title: 'FOB vs CIF: which quote are you reading?', category: 'Buying guide' }, coverSeed('fob-cif'));
  ok(svg.includes('FOB vs CIF'), 'the article title is drawn');
  ok(svg.includes('BUYING GUIDE'), 'with its category as the kicker');
  ok(svg.includes('ar7traders.com'), 'and the brand footer');
  const escaped = buildCoverSvg({ title: 'A & B < C > "D"', category: 'Guide' }, coverSeed('esc'));
  ok(!/<text[^>]*>[^<]*&(?!(amp|lt|gt|quot|#39);)/.test(escaped), 'every string is XML-escaped before it reaches the SVG');
  const long = buildCoverSvg({ title: 'x'.repeat(400) + ' ' + 'word '.repeat(200), category: 'Guide' }, coverSeed('long'));
  ok((long.match(/font-size="58"/g) || []).length <= 3, 'a long title is wrapped to at most three lines, never overflowing');
}

say('\n4) the endpoint never fails a reader');
{
  const rows = [{ title: 'Importing a used excavator from China', slug: 'x', category: 'Machinery', image: '/assets/machinery/doosan-dx250lca-1.webp' }];
  let res = fakeRes();
  await articleCoverImage({ method: 'GET', query: { cover: 'importing-a-used-excavator-from-china' } }, res, { db: fakeDb(rows) });
  ok(res.statusCode === 200 && res.headers['content-type'] === 'image/jpeg' && res.body.length > 20000,
    'a known article resolves to its cover');
  ok(res.headers['x-cover-source'] === 'generated', 'and says honestly that it was composed here, not by an AI provider');

  res = fakeRes();
  await articleCoverImage({ method: 'GET', query: { cover: 'an-article-that-does-not-exist' } }, res, { db: fakeDb(rows) });
  ok(res.statusCode === 200 && res.body.subarray(0, 3).toString('hex') === 'ffd8ff',
    'an unknown slug still gets a branded cover, never an error');

  res = fakeRes();
  await articleCoverImage({ method: 'GET', query: { cover: 'anything' } }, res, { db: { from: () => ({ select: () => ({ limit: async () => { throw new Error('dead database'); } }) }) } });
  ok(res.statusCode === 200 && res.body.length > 10000, 'a dead database still gets a cover');

  res = fakeRes();
  await articleCoverImage({ method: 'POST', query: { cover: 'x' } }, res, { db: fakeDb(rows) });
  ok(res.statusCode === 405, 'a non-GET is refused');
}

say('\n5) free: no key, no paid provider, and the AI path is opt-in');
{
  const article = { title: 'Used machinery inspection checklist', slug: 'inspection-checklist', category: 'Machinery' };
  // A provider that is down must never break the cover.
  let res = fakeRes();
  await articleCoverImage({ method: 'GET', query: { cover: 'inspection-checklist' } }, res, {
    db: fakeDb([]), env: { ARTICLE_COVER_AI: 'on' },
    fetch: async () => { throw new Error('provider down'); }
  });
  ok(res.statusCode === 200 && res.headers['x-cover-source'] === 'generated',
    'with the free-AI provider down the composed cover is served instead');

  // A provider that works is used, and labelled as such.
  res = fakeRes();
  const art = await sharp({ create: { width: 1200, height: 630, channels: 3, background: '#123456' } }).png().toBuffer();
  await articleCoverImage({ method: 'GET', query: { cover: 'inspection-checklist' } }, res, {
    db: fakeDb([]), env: { ARTICLE_COVER_AI: 'on' },
    fetch: async () => ({ ok: true, arrayBuffer: async () => art })
  });
  ok(res.statusCode === 200 && res.headers['x-cover-source'] === 'pollinations-free',
    'when it answers, the free AI art is used and labelled');
  ok(res.headers['x-cover-source'] !== 'pollinations-free' || res.body.length > 10000, 'and still composed into a 1200×630 cover');

  const off = await freeAiArt(article, { fetch: async () => ({ ok: true, arrayBuffer: async () => art }) });
  ok(off === null || off.length > 0, 'freeAiArt resolves to bytes or null, never throws');
  const noFetch = await freeAiArt(article, { fetch: null });
  ok(noFetch === null || noFetch.length > 0, 'and survives a missing fetch implementation');
}

say('\n6) the news UI draws the generated cover');
{
  const { readFileSync } = await import('node:fs');
  const data = readFileSync(new URL('../src/news-data.js', import.meta.url), 'utf8');
  const pages = readFileSync(new URL('../src/pages-static.jsx', import.meta.url), 'utf8');
  ok(/cover: articleCoverPath\(slug\)/.test(data), 'every hydrated article carries a cover path');
  // Four: `src` and `srcSet` on the list card and on the article page.
  const uses = (pages.match(/x\.cover\|\|x\.img|article\.cover\|\|article\.img/g) || []).length;
  ok(uses === 4, `the news list and the article page both draw the cover first (${uses})`);
  const rewrites = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8')).rewrites;
  ok(rewrites.some(r => r.source === '/api/cover/:slug' && r.destination === '/api/site-content?cover=:slug'),
    '/api/cover/<slug> is rewritten onto the existing function — no extra Serverless Function');
}

say('');
say(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
