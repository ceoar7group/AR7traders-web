// ---------------------------------------------------------------------------
// Industry News Scout — fresh vehicle-industry headlines for the Growth studio.
// ---------------------------------------------------------------------------
// A SHARED MODULE (api/_*.js): dispatched from api/site-content.js via
// handleSeoWorkflow on ?seo=news-scan, so it adds NO Vercel Serverless
// Function (scripts/function-count.test.mjs cap of 12 is untouched).
//
// WHAT IT DOES (2026-11-11 owner request: "let it suggest and publish latest
// car or vehicle industry related news"):
//   • fetches a small, fixed set of Google News RSS searches about the
//     used-vehicle export trade (auctions, shipping, EV market, Japan export);
//   • parses the XML with no dependencies, keeps items from the last 14 days,
//     de-duplicates near-identical headlines, and drops anything naming a
//     direct competitor or a supplier we never name publicly;
//   • returns VERIFIED, DATED, SOURCED items. The AI draft step may only use
//     these facts — exactly the contract generateEditorialDraft enforces for
//     kind:'news' (it refuses news without an HTTPS source and a YYYY-MM-DD).
//
// Nothing here publishes. The Growth studio shows the items as proposals and
// a human presses "Approve & publish" per item, same as Topic Scout.

const text = value => String(value ?? '').trim();

/** The fixed query set. Keep it small: every feed is one outbound request. */
export const NEWS_FEEDS = [
  { id: 'japan-export', query: 'Japan used car export market when:14d' },
  { id: 'auction', query: 'Japan car auction prices used vehicles when:14d' },
  { id: 'shipping', query: 'car carrier RoRo vehicle shipping freight when:14d' },
  { id: 'industry', query: 'used car market electric vehicles africa asia import when:14d' }
];

/** Sources and names that must never appear in our published material. */
const BANNED_SOURCE = /goo-?net|be ?forward|sbt ?japan|autorec|car ?from ?japan|japanesecartrade/i;

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', '#39': "'" };
const decodeEntities = value => String(value).replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (m, code) => {
  if (code[0] === '#') {
    const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
    return Number.isFinite(n) ? String.fromCodePoint(n) : m;
  }
  return ENTITIES[code.toLowerCase()] ?? m;
});
// Google News double-encodes: the <description> is HTML-encoded HTML. Decode
// entities, strip the revealed tags, then decode once more for text like
// "&amp;amp;" inside that inner HTML.
const decode = value => decodeEntities(decodeEntities(
  text(value).replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
).replace(/<[^>]+>/g, ' '))
  .replace(/\s+/g, ' ')
  .trim();

const tagOf = (block, tag) => {
  const m = block.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, 'i'));
  return m ? m[1] : '';
};

/** Parse RSS 2.0 items out of a feed body. Pure; tested without a network. */
export function parseRssItems(xml) {
  const items = [];
  for (const m of String(xml || '').matchAll(/<item>([\s\S]*?)<\/item>/gi)) {
    const block = m[1];
    const headline = decode(tagOf(block, 'title'));
    const link = decode(tagOf(block, 'link'));
    const sourceName = decode(tagOf(block, 'source'));
    const snippet = decode(tagOf(block, 'description')).slice(0, 400);
    const when = new Date(decode(tagOf(block, 'pubDate')));
    if (!headline || !link) continue;
    let url;
    try { url = new URL(link); } catch { continue; }
    if (url.protocol !== 'https:') continue;
    items.push({
      headline: headline.replace(/\s+-\s+[^-]+$/, '').trim() || headline, // strip " - Publisher" tail
      link: url.href,
      source: sourceName || url.hostname.replace(/^www\./, ''),
      date: Number.isFinite(when.getTime()) ? when.toISOString().slice(0, 10) : null,
      snippet
    });
  }
  return items;
}

/** Keep fresh, sourced, non-competitor items; dedupe near-identical heads. */
export function filterNewsItems(items, { now = Date.now(), maxAgeDays = 14, limit = 8 } = {}) {
  const cutoff = now - maxAgeDays * 86400000;
  const seen = new Set();
  const out = [];
  const sorted = [...(items || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  for (const item of sorted) {
    if (!item?.headline || !item?.link || !item?.date) continue;
    if (new Date(item.date + 'T00:00:00Z').getTime() < cutoff) continue;
    if (BANNED_SOURCE.test(`${item.headline} ${item.source} ${item.link} ${item.snippet || ''}`)) continue;
    const key = item.headline.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().slice(0, 60);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

/** Fetch + parse + filter all feeds. Per-feed failures are reported, never
 *  thrown — one dead feed must not hide the others' headlines. */
export async function scanIndustryNews({ fetch: fetchImpl = globalThis.fetch, now = Date.now(), timeoutMs = 8000 } = {}) {
  const feeds = [];
  const collected = [];
  await Promise.all(NEWS_FEEDS.map(async feed => {
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(feed.query)}&hl=en-US&gl=US&ceid=US:en`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(url, {
        redirect: 'follow', signal: controller.signal,
        headers: { Accept: 'application/rss+xml, application/xml, text/xml' }
      });
      if (!response.ok) { feeds.push({ id: feed.id, ok: false, detail: `HTTP ${response.status}` }); return; }
      const body = await response.text();
      const items = parseRssItems(body);
      collected.push(...items);
      feeds.push({ id: feed.id, ok: true, items: items.length });
    } catch (e) {
      feeds.push({ id: feed.id, ok: false, detail: String(e?.message || 'network error').slice(0, 120) });
    } finally {
      clearTimeout(timer);
    }
  }));
  const items = filterNewsItems(collected, { now });
  return {
    checkedAt: new Date(now).toISOString(),
    feeds,
    items,
    note: items.length
      ? 'Headlines are verified RSS facts (source, date, link). Approve & publish drafts a short news brief from EXACTLY these facts — the AI may not add anything.'
      : 'No fresh industry headlines right now (or the news service was unreachable from the server). Try again later.'
  };
}
