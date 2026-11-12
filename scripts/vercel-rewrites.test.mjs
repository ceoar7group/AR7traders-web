#!/usr/bin/env node
// Keep Vercel's SPA rewrite aligned with the routes the client router serves.
// A route that works after an in-app click can still 404 on refresh unless its
// pathname is rewritten to index.html at the edge.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { PAGES, parseRoute } from '../src/routing.js';

const config = JSON.parse(readFileSync(new URL('../vercel.json', import.meta.url), 'utf8'));
const spaRewrite = (config.rewrites || []).find(rule => rule.destination === '/index.html');
assert.ok(spaRewrite, 'vercel.json must rewrite app routes to /index.html');

// The current Vercel source uses the path-regex subset supported by both
// Vercel and JavaScript RegExp. Exercise it against every client page so a new
// entry in PAGES cannot silently become a refresh-time 404.
const matches = new RegExp(`^${spaRewrite.source}$`);
const requiredPaths = [...PAGES].map(page => `/${page}`);
requiredPaths.push(
  '/cars/toyota',
  '/cars/toyota/land-cruiser',
  '/machinery/excavators',
  '/machinery/excavators/AR7-MC-001'
);

for (const pathname of requiredPaths) {
  assert.ok(matches.test(pathname), `${pathname} must match the Vercel SPA rewrite`);
}

assert.deepEqual(
  (({ page, make }) => ({ page, make }))(parseRoute({ pathname: '/cars/toyota' })),
  { page: 'inventory', make: 'Toyota' },
  '/cars/toyota must resolve to the Toyota inventory landing page'
);
assert.deepEqual(
  (({ page, machineType, machineRef }) => ({ page, machineType, machineRef }))(
    parseRoute({ pathname: '/machinery/excavators/AR7-MC-001' })
  ),
  { page: 'machinery', machineType: 'excavators', machineRef: 'AR7-MC-001' },
  'a machinery detail URL must keep its type and reference'
);
assert.equal(parseRoute({ pathname: '/seo' }).page, 'seo', '/seo must resolve to the SEO desk');

// ---- /japan-stock is retired (merged into /inventory) ----------------------
// The SPA rewrite must NOT serve it (otherwise the server would answer 200 on
// a retired URL) and a permanent redirect must carry old links to /inventory.
assert.ok(!matches.test('/japan-stock'), '/japan-stock must no longer be served by the SPA rewrite');
const redirects = config.redirects || [];
const jp = redirects.find(r => r.source === '/japan-stock');
assert.ok(jp, 'vercel.json must carry a /japan-stock redirect');
assert.equal(jp.destination, '/inventory', 'the /japan-stock redirect must point at /inventory');
assert.equal(jp.permanent, true, 'the /japan-stock redirect must be permanent (308)');
assert.equal(parseRoute({ pathname: '/japan-stock' }).page, 'inventory',
  'client-side /japan-stock must resolve to the merged inventory page');

// ---- OG car cards: crawler-only head rewrite --------------------------------
// Social link crawlers (WhatsApp, Facebook, X, …) do not run JavaScript, so
// /inventory/<ref> rewrites to the site-content head endpoint FOR THOSE
// USER-AGENTS ONLY. Humans keep the static SPA shell.
// 2026-11-12 revision: Googlebot was originally left OUT of the list on the
// theory that it renders applySeo itself — but Search Console showed vehicle
// pages stuck in "Crawled, currently not indexed": the bare shell has no
// canonical/title by design and the render queue defers hydration for weeks.
// Search engines now get their OWN rewrite (below the social one) to
// ?head=<ref>&render=full — a content-parity page (h1, specs, photo,
// Product JSON-LD, NO meta refresh), which is sanctioned dynamic rendering,
// not cloaking. The social card is unchanged.
const rewrites = config.rewrites || [];
const headRewrite = rewrites.find(r => String(r.destination || '').includes('head='));
assert.ok(headRewrite, 'vercel.json must carry the crawler head rewrite for vehicle pages');
assert.equal(headRewrite.source, '/inventory/:ref', 'the head rewrite serves vehicle detail URLs');
assert.equal(headRewrite.destination, '/api/site-content?head=:ref',
  'the head rewrite dispatches on site-content (no new Serverless Function)');
const ua = (headRewrite.has || []).find(h => h.type === 'header' && h.key === 'user-agent');
assert.ok(ua, 'the head rewrite is gated on the user-agent header');
for (const bot of ['facebookexternalhit', 'whatsapp', 'twitterbot', 'linkedinbot', 'telegrambot']) {
  assert.ok(ua.value.toLowerCase().includes(bot), `the crawler list names ${bot}`);
}
assert.ok(!ua.value.toLowerCase().includes('googlebot'),
  'Googlebot must NOT get the social card (it gets the full-render rule instead)');
assert.ok(ua.value.startsWith('(?i)'), 'the user-agent match is case-insensitive');
assert.ok(
  rewrites.indexOf(headRewrite) < rewrites.indexOf(spaRewrite),
  'the crawler head rewrite must come before the SPA catch-all, or it never fires');

// Search engines get the full-render variant (2026-11-12, see note above).
const searchRewrite = rewrites.find(r => String(r.destination || '').includes('render=full'));
assert.ok(searchRewrite, 'vercel.json must carry the search-bot full-render rewrite');
assert.equal(searchRewrite.source, '/inventory/:ref', 'it serves vehicle detail URLs');
assert.equal(searchRewrite.destination, '/api/site-content?head=:ref&render=full',
  'it dispatches on site-content with render=full (no new Serverless Function)');
const searchUa = (searchRewrite.has || []).find(h => h.type === 'header' && h.key === 'user-agent');
assert.ok(searchUa && searchUa.value.startsWith('(?i)'), 'gated on user-agent, case-insensitive');
for (const bot of ['googlebot', 'bingbot', 'duckduckbot', 'applebot', 'yandex']) {
  assert.ok(searchUa.value.toLowerCase().includes(bot), `the search-crawler list names ${bot}`);
}
assert.ok(!searchUa.value.toLowerCase().includes('facebookexternalhit'),
  'social crawlers stay on the lean OG card, not the full render');
assert.ok(
  rewrites.indexOf(searchRewrite) < rewrites.indexOf(spaRewrite),
  'the search-bot rewrite must come before the SPA catch-all, or it never fires');

// Free web calls (2026-11-13): the site-wide Permissions-Policy denies the
// microphone everywhere — correct for a car showroom, fatal for /call, where
// it blocked getUserMedia even after the user granted browser permission.
// The /call block must come AFTER the global one (on Vercel the last matching
// header of the same key wins) and must hand the microphone back to self
// while keeping camera/geolocation/payment denied.
{
  const headers = config.headers || [];
  const global = headers.find(h => h.source === '/(.*)');
  const globalPp = (global?.headers || []).find(x => x.key === 'Permissions-Policy');
  assert.ok(globalPp && globalPp.value.includes('microphone=()'),
    'the site-wide policy still denies the microphone by default');
  const callBlock = headers.find(h => String(h.source).startsWith('/call'));
  assert.ok(callBlock, 'vercel.json must carry a /call header block');
  const callPp = (callBlock.headers || []).find(x => x.key === 'Permissions-Policy');
  assert.ok(callPp && callPp.value.includes('microphone=(self)'),
    '/call allows the microphone for the page itself');
  assert.ok(callPp.value.includes('camera=()') && callPp.value.includes('geolocation=()'),
    '/call keeps camera and geolocation denied — this is a voice call');
  assert.ok(headers.indexOf(callBlock) > headers.indexOf(global),
    'the /call block must come after the global block so its Permissions-Policy wins');
}

console.log(`Vercel SPA rewrite covers ${requiredPaths.length} client and deep-link paths.`);
