#!/usr/bin/env node
// Growth fixes, 2026-11-07 — pins for the three things the owner reported:
//
//  1. "Approve & publish" died with "Gemini returned HTTP 503". The editorial
//     generator now walks a model chain (primary → GEMINI_FALLBACK_MODELS)
//     for transient states, and never wastes fallbacks on a bad key.
//  2. Topic Scout could NEVER publish in one run: the generate endpoint
//     appends an [EDITOR REVIEW:] boilerplate to every draft, and the scout's
//     needsReview regex always matched it. The scout strips exactly that
//     boilerplate (facts are catalogue-derived); the contract pinned here is
//     that the endpoint's note stays byte-identical to what the scout strips.
//  3. The crawl report items that were measurement bugs or template gaps:
//     /crm audited as if it should rank, the >165-char shell description,
//     the missing static BreadcrumbList, long guide <title>s, and guides
//     with too few internal links.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generateEditorialDraft, generateWithGemini } from '../api/_seo-content.js';
import { GEMINI_DEFAULT_MODEL, GEMINI_FALLBACK_MODELS, pickGeminiModel } from '../api/_gemini.js';
import { parseRssItems, filterNewsItems, scanIndustryNews, NEWS_FEEDS } from '../api/_news-scout.js';
import { articleSeo, NEWS } from '../src/news-data.js';
import { PAGE_SEO } from '../src/seo.js';
import { auditDocument } from '../src/seo-audit.js';
import { isStaffNoindexPath } from '../src/seo-url.js';
import { JSDOM } from 'jsdom';

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } };
const say = msg => console.log(msg);

const FACTS = 'AR7 Traders lists 83 used Toyota vehicles from Japanese dealer stock today. Every vehicle ships from Japan with export documents. '.repeat(2);
const DRAFT = { title: 'Buying a used Toyota from Japan', excerpt: 'What is in stock right now and how the export process works, step by step.', body: 'Verified paragraph. '.repeat(30).trim() };
const good = () => ({ ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(DRAFT) }] }, finishReason: 'STOP' }] }) });
const notFound = () => ({ ok: false, status: 404, json: async () => ({ error: { status: 'NOT_FOUND', message: 'model not found' } }) });
const forbidden = () => ({ ok: false, status: 403, json: async () => ({ error: { status: 'PERMISSION_DENIED', message: 'key lacks access' } }) });

say('\n1) Gemini model fallback — the 503/overload path has a plan B');
{
  const calls = [];
  const fetchStub = async url => {
    calls.push(String(url));
    // Primary model "unavailable" → the chain must move on, same prompt.
    return String(url).includes(GEMINI_DEFAULT_MODEL) ? notFound() : good();
  };
  const out = await generateEditorialDraft({ topic: 'Buying a used Toyota from Japan', facts: FACTS, kind: 'guide', sources: [] },
    { env: { GEMINI_API_KEY: 'k' }, fetch: fetchStub });
  ok(out.title === DRAFT.title, 'a draft still comes back when the primary model is down');
  ok(out.model === GEMINI_FALLBACK_MODELS[0], `the first fallback model produced it (${out.model})`);
  ok(calls.length === 2 && calls[0].includes(GEMINI_DEFAULT_MODEL), 'primary tried first, exactly one fallback call after');

  // A rejected KEY fails identically on every model — fallbacks must NOT burn.
  const keyCalls = [];
  const keyStub = async url => { keyCalls.push(String(url)); return forbidden(); };
  const err = await generateEditorialDraft({ topic: 'Buying a used Toyota from Japan', facts: FACTS, kind: 'guide', sources: [] },
    { env: { GEMINI_API_KEY: 'bad' }, fetch: keyStub }).then(() => null, e => e);
  ok(err && err.state === 'invalid-key', 'an invalid key surfaces as invalid-key, not provider-unavailable');
  ok(keyCalls.length === 1, 'no fallback models are tried on a key rejection');

  const allDown = await generateEditorialDraft({ topic: 'Buying a used Toyota from Japan', facts: FACTS, kind: 'guide', sources: [] },
    { env: { GEMINI_API_KEY: 'k' }, fetch: async () => notFound() }).then(() => null, e => e);
  ok(allDown && new RegExp(`Tried ${1 + GEMINI_FALLBACK_MODELS.length} model\\(s\\)`).test(allDown.message),
    'when every model fails, the error names the whole chain that was tried');
}

say('\n1a) Model discovery — when the whole static chain 404s, ListModels is the plan C');
{
  // 2026-11-11 owner report: "check whats wrong its not publishing" — every
  // id in the static chain 404'd for a real key (Google limits some model
  // families per project). The generator must then ask ListModels what the
  // key CAN call and draft with that, instead of failing on a guessed id.
  const LIST = { models: [
    { name: 'models/gemini-3.9-flash', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-3.9-flash-tts', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/embedding-001', supportedGenerationMethods: ['embedContent'] }
  ] };
  const calls = [];
  const discoveryStub = async url => {
    calls.push(String(url));
    if (String(url).includes('/models?')) return { ok: true, status: 200, json: async () => LIST };
    return String(url).includes('gemini-3.9-flash') ? good() : notFound();
  };
  const out = await generateEditorialDraft({ topic: 'Buying a used Toyota from Japan', facts: FACTS, kind: 'guide', sources: [] },
    { env: { GEMINI_API_KEY: 'k' }, fetch: discoveryStub });
  ok(out.title === DRAFT.title, 'a draft is produced from the DISCOVERED model after the whole chain 404s');
  ok(out.model === 'gemini-3.9-flash', `the discovered model is the one that drafted (${out.model}) — never the TTS or embedding entry`);

  // When discovery itself finds a list, the final error (if the discovered
  // model also fails) must NAME the usable models for the operator.
  const stillDown = async url => String(url).includes('/models?')
    ? { ok: true, status: 200, json: async () => LIST }
    : notFound();
  const named = await generateEditorialDraft({ topic: 'Buying a used Toyota from Japan', facts: FACTS, kind: 'guide', sources: [] },
    { env: { GEMINI_API_KEY: 'k' }, fetch: stillDown }).then(() => null, e => e);
  ok(named && /Models this key CAN use: .*gemini-3\.9-flash/.test(named.message),
    'when even discovery cannot draft, the error lists the models the key can actually call');

  // pickGeminiModel preferences: stable full flash > lite > preview; text only.
  ok(pickGeminiModel([
    { id: 'gemini-3-flash-preview', methods: ['generateContent'] },
    { id: 'gemini-3.5-flash-lite', methods: ['generateContent'] },
    { id: 'gemini-3.6-flash', methods: ['generateContent'] },
    { id: 'gemini-3.8-flash-tts', methods: ['generateContent'] }
  ]) === 'gemini-3.6-flash', 'pickGeminiModel prefers the newest stable full Flash and never a TTS model');
  ok(pickGeminiModel([{ id: 'gemma-4-31b-it', methods: ['generateContent'] },
    { id: 'gemini-2.5-flash-lite', methods: ['generateContent'] }]) === 'gemini-2.5-flash-lite',
    'gemini is preferred over gemma when both can generate text');
  ok(pickGeminiModel([{ id: 'embedding-001', methods: ['embedContent'] }]) === null,
    'no usable text model → null, never a wrong-modality pick');
}

say('\n1d) Industry News Scout — verified, dated, sourced, competitor-free');
{
  const RSS = `<?xml version="1.0"?><rss><channel>
    <item><title>Japan used car exports hit record high - Nikkei Asia</title><link>https://example.com/a</link><pubDate>${new Date(Date.now() - 2 * 86400000).toUTCString()}</pubDate><source url="https://nikkei.com">Nikkei Asia</source><description>&lt;a href="x"&gt;Exports rose &amp;amp; shipping rates held steady.&lt;/a&gt;</description></item>
    <item><title>Goo-net dealer stock update</title><link>https://example.com/b</link><pubDate>${new Date(Date.now() - 86400000).toUTCString()}</pubDate><source>Goo-net</source><description>competitor</description></item>
    <item><title>Japan used car exports hit record high - Reuters</title><link>https://example.com/c</link><pubDate>${new Date(Date.now() - 3 * 86400000).toUTCString()}</pubDate><source>Reuters</source><description>duplicate headline</description></item>
    <item><title>Old story about RoRo</title><link>https://example.com/d</link><pubDate>${new Date(Date.now() - 40 * 86400000).toUTCString()}</pubDate><source>Reuters</source><description>stale</description></item>
    <item><title>Insecure link story</title><link>http://example.com/e</link><pubDate>${new Date().toUTCString()}</pubDate><source>X</source></item>
  </channel></rss>`;
  const parsed = parseRssItems(RSS);
  ok(parsed.length === 4, `https-only parse (${parsed.length} of 5 items — the http:// link is refused)`);
  ok(parsed[0].headline === 'Japan used car exports hit record high', 'the " - Publisher" tail is stripped from the headline');
  ok(parsed[0].snippet === 'Exports rose & shipping rates held steady.', `double-encoded HTML is fully decoded out of the snippet (got: ${parsed[0].snippet})`);
  ok(/^\d{4}-\d{2}-\d{2}$/.test(parsed[0].date), 'every item carries the YYYY-MM-DD date the news pipeline requires');

  const kept = filterNewsItems(parsed);
  ok(kept.length === 1, `filtering keeps ${kept.length} item: the competitor source, the duplicate headline and the stale story are all dropped`);
  ok(kept[0].source === 'Nikkei Asia', 'the newest instance of a duplicated headline wins');

  // scanIndustryNews: one dead feed must not hide the others.
  const scan = await scanIndustryNews({ fetch: async url =>
    String(url).includes(encodeURIComponent(NEWS_FEEDS[0].query))
      ? { ok: true, status: 200, text: async () => RSS }
      : { ok: false, status: 503, text: async () => '' } });
  ok(scan.items.length === 1 && scan.feeds.filter(f => f.ok).length === 1,
    'a dead feed is reported per-feed while the live feed still returns items');
  ok(scan.feeds.length === NEWS_FEEDS.length, 'every configured feed reports a status');
}

say('\n1b) The chain fits inside the serverless time limit — no more bare 504s');
{
  // 2026-11-07: Approve & publish returned "SEO workflow failed (504)" —
  // Vercel killed api/site-content.js at maxDuration 60s while the chain was
  // still retrying an overloaded model (worst case was ~5 minutes). Pins:
  // ONE attempt per model (the next model IS the retry), and a hard budget
  // that stops starting new models when time is nearly gone.
  const overloaded = () => ({ ok: false, status: 503, json: async () => ({ error: { status: 'UNAVAILABLE', message: 'The model is overloaded.' } }) });

  const calls = [];
  const err = await generateEditorialDraft({ topic: 'Buying a used Toyota from Japan', facts: FACTS, kind: 'guide', sources: [] },
    { env: { GEMINI_API_KEY: 'k' }, fetch: async url => { calls.push(String(url)); return overloaded(); } }).then(() => null, e => e);
  ok(calls.length === 1 + GEMINI_FALLBACK_MODELS.length,
    `a 503 gets ONE attempt per model (${calls.length} calls for ${1 + GEMINI_FALLBACK_MODELS.length} models) — no same-model retry storm`);
  ok(err && err.state === 'provider-unavailable', 'the final error still reports the provider outage honestly');

  // Simulated clock: every model "takes" 30s. The budget (40s) must stop the
  // chain instead of letting it run past the function's 60s execution limit.
  let clock = 0;
  const slowErr = await generateWithGemini({
    system: 's', user: 'u', env: { GEMINI_API_KEY: 'k' }, now: () => clock,
    fetchImpl: async () => { clock += 30000; return overloaded(); }
  }).then(() => null, e => e);
  ok(slowErr && /Tried 2 model\(s\)/.test(slowErr.message),
    'when models are slow, the budget stops the chain early (2 tried, not 3) — the function answers before Vercel kills it');
}

say('\n1c) Thinking-token truncation no longer kills a Topic Scout run');
{
  // 2026-11-10: "Gemini stopped because the output limit was reached" killed
  // every Approve & publish. Root cause: Gemini 3.x THINKING tokens count
  // against maxOutputTokens, and editorial drafts ran on the shared 2,400
  // default; worse, 'truncated' was not a fallback state so no other model
  // was even tried. Pins: drafts request a thinking-sized budget, and a
  // truncated primary falls through to the next model in the chain.
  const bodies = [];
  let call = 0;
  const out = await generateWithGemini({
    system: 's', user: 'u', env: { GEMINI_API_KEY: 'k' },
    fetchImpl: async (url, opts) => {
      bodies.push(JSON.parse(opts.body)); call++;
      if (call === 1) return { ok: true, status: 200, json: async () => ({ candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: '{"half":' }] } }] }) };
      return good();
    }
  });
  ok(bodies[0].generationConfig.maxOutputTokens === 16384,
    `editorial drafts request a thinking-sized output budget (got ${bodies[0].generationConfig.maxOutputTokens})`);
  ok(call === 2 && out.fallbackUsed,
    'a truncated model falls through to the next model instead of failing the whole run');
}

say('\n2) The scout-strippable boilerplate stays a stable contract');
{
  const out = await generateEditorialDraft({ topic: 'Buying a used Toyota from Japan', facts: FACTS, kind: 'guide', sources: [] },
    { env: { GEMINI_API_KEY: 'k' }, fetch: async () => good() });
  const BOILERPLATE = /\n*\[EDITOR REVIEW: verify every factual claim and source, then remove this note before publication\.\]\s*$/i;
  ok(BOILERPLATE.test(out.body), 'generate still appends the exact boilerplate the scout strips');
  const stripped = out.body.replace(BOILERPLATE, '').trimEnd();
  ok(!/\[EDITOR REVIEW:/i.test(stripped), 'stripping the boilerplate leaves a publishable body when the model added no flags of its own');
  ok(stripped.length >= 200, 'the stripped body is still a real article');
  // The desk's autopilot must contain that exact strip (source-level pin).
  const desk = readFileSync('src/seo-desk.jsx', 'utf8');
  ok(desk.includes('verify every factual claim and source, then remove this note before publication'),
    'seo-desk.jsx strips the same sentence generate appends');
}

say('\n3) Staff routes audit as intentionally private, not as failures');
{
  ok(isStaffNoindexPath('/crm') === true, '/crm is a staff route');
  const html = '<html><head><title>Staff CRM — AR7</title><meta name="robots" content="noindex,nofollow"/><meta name="description" content="Internal CRM for AR7 staff — leads, stock, shipments and the growth desks, sign-in required."/><link rel="canonical" href="https://ar7traders.com/crm"/><meta property="og:title" content="x"/><meta property="og:description" content="x"/><meta property="og:image" content="/assets/og/auction.jpg"/></head><body><h1>CRM</h1></body></html>';
  const doc = new JSDOM(html).window.document;
  const audit = auditDocument(doc, {
    route: 'crm', label: '/crm', url: 'https://ar7traders.com/crm',
    expectIndexable: !isStaffNoindexPath('/crm'),
    facts: { sitemapUrls: ['https://ar7traders.com/'], robotsTxt: 'User-agent: *\nDisallow: /crm\nSitemap: https://ar7traders.com/sitemap.xml' }
  });
  const by = id => audit.checks.find(c => c.id === id);
  ok(by('sitemap')?.status === 'pass', 'absent from the sitemap is CORRECT for /crm, not a FAIL');
  ok(by('robots-txt')?.status === 'pass', 'robots.txt blocking /crm is CORRECT, not a FAIL');
  ok(by('robots')?.status === 'pass', 'noindex on a staff route passes');
}

say('\n4) The shell page the crawler sees — description length and breadcrumbs');
{
  const html = readFileSync('index.html', 'utf8');
  const desc = html.match(/<meta name="description" content="([^"]*)"/)?.[1] || '';
  ok(desc.length >= 70 && desc.length <= 165, `index.html description is ${desc.length} chars (70–165)`);
  const crumb = html.match(/<script type="application\/ld\+json" id="breadcrumb-jsonld">([\s\S]*?)<\/script>/)?.[1];
  ok(!!crumb, 'index.html ships a static breadcrumb-jsonld node');
  const parsed = crumb ? JSON.parse(crumb) : null;
  ok(parsed?.['@type'] === 'BreadcrumbList' && parsed.itemListElement?.[0]?.name === 'Home',
    'the static node is a valid minimal BreadcrumbList (client replaces it per page — same id applySeo targets)');
  ok(PAGE_SEO.home[1].length <= 165, `PAGE_SEO.home description is ${PAGE_SEO.home[1].length} chars (≤165)`);
}

say('\n5) Guide titles fit Google, guide pages link onwards');
{
  for (const article of NEWS) {
    const seo = articleSeo(article);
    ok(seo.title.length <= 60, `"${seo.title}" is ${seo.title.length} chars (≤60)`);
  }
  // Slug never changes: it derives from article.title, which is untouched.
  const roro = NEWS.find(a => /RoRo vs container/i.test(a.title));
  ok(articleSeo(roro).canonicalPath.includes('roro-vs-container'), 'dropping the brand suffix did not move the URL');
  const prerender = readFileSync('scripts/prerender-guides.jsx', 'utf8');
  const links = (prerender.match(/href="\//g) || []).length;
  ok(links >= 10, `the prerendered guide template carries ${links} internal links (≥10, crawl wanted ≥8 rendered)`);
  ok(/Keep exploring/.test(prerender), 'the keep-exploring block exists for crawlers to follow');
}

say(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
