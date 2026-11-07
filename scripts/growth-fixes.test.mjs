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
import { generateEditorialDraft } from '../api/_seo-content.js';
import { GEMINI_DEFAULT_MODEL, GEMINI_FALLBACK_MODELS } from '../api/_gemini.js';
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
