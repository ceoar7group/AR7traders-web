import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { DEST, destinationHref } from '../src/destinations.js';
import { NEWS, articleSlug } from '../src/news-data.js';
import { editorialPlan } from '../src/editorial-plan.js';
import { syncFailure } from './check-sync-report.mjs';
assert.equal(syncFailure({ inserted: 0, alreadyKnown: 12 }), null);
assert.ok(syncFailure({ blocked: true, inserted: 0 }));
assert.ok(syncFailure({ parseMiss: true, inserted: 0 }));
assert.equal(syncFailure({ parseMiss: true, inserted: 2 }), null);
assert.ok(syncFailure({ job: 'machinery', failed: [{}] }));
assert.ok(syncFailure({}));
assert.equal(editorialPlan(new Date('2026-10-09'), 100).length, 4);
assert.equal(editorialPlan(new Date('2026-10-09'), 1).length, 2);
assert.ok(editorialPlan(new Date('2026-10-09')).every(x=>x.status==='review-required' && x.due.startsWith('2026-10-')));
const config = JSON.parse(readFileSync('vercel.json'));
const paths = [...DEST.map(d=>destinationHref(d[0])), ...NEWS.map(a=>'/news/'+(a.slug||articleSlug(a)))];
for (const path of paths) {
  const rule = config.rewrites.find(r=>r.source===path);
  assert.equal(rule?.destination, path+'/index.html');
  assert.ok(config.rewrites.indexOf(rule) < config.rewrites.findIndex(r=>r.destination==='/index.html'));
  const dom = new JSDOM(readFileSync('dist'+path+'/index.html', 'utf8'));
  const d=dom.window.document;
  assert.equal(d.querySelectorAll('h1').length, 1, path);
  assert.equal(d.querySelectorAll('link[rel="canonical"]').length, 1);
  assert.equal(d.querySelector('link[rel="canonical"]').href, 'https://ar7traders.com'+path);
  assert.ok(d.querySelector('main').textContent.length > 400);
  assert.ok(d.querySelector('script[type="module"][src^="/assets/"]'));
  assert.ok(!d.querySelector('meta[name="robots"]').content.includes('noindex'));
  if(path.startsWith('/destinations/')) assert.equal(JSON.parse(d.getElementById('destination-faq-jsonld').textContent).mainEntity.length, 5);
  dom.window.close();
}
// ---------------------------------------------------------------------------
// 2026-11-10 (SEO report: 460/493 live pages failed "Canonical URL"): every
// static public route now ships a prerendered HEAD — same applySeo() output
// the client produces, body left as the untouched shell so hydration is
// byte-for-byte what these routes always served. Pins: the rewrite exists and
// sits BEFORE the SPA catch-all, the baked canonical is the route itself, the
// page stays indexable, and the shell boot element is still in the body.
// The homepage '/' and per-vehicle routes intentionally stay shell-served
// (runtime canonical): Vercel serves /index.html from the filesystem before
// rewrites, and the shell must keep NO canonical for client-rendered routes.
// ---------------------------------------------------------------------------
import { MACHINES, machineHref, MACHINE_TYPES } from '../src/machinery-data.js';
const staticHeadRoutes = [
  '/inventory', '/auction', '/services', '/brands', '/destinations', '/tools',
  '/world', '/howbuy', '/news', '/about', '/reviews', '/faq', '/contact',
  '/shipping', '/machinery', '/privacy', '/cookies', '/terms',
  ...MACHINE_TYPES.map(t => '/machinery/' + t.toLowerCase()),
  ...MACHINES.map(machineHref)
];
const catchAllIndex = config.rewrites.findIndex(r => r.destination === '/index.html');
for (const path of staticHeadRoutes) {
  const rule = config.rewrites.find(r => r.source === path);
  assert.equal(rule?.destination, path + '/index.html', `${path} needs a rewrite to its prerendered file`);
  assert.ok(config.rewrites.indexOf(rule) < catchAllIndex, `${path} rewrite must sit before the SPA catch-all`);
  const dom = new JSDOM(readFileSync('dist' + path + '/index.html', 'utf8'));
  const d = dom.window.document;
  assert.equal(d.querySelectorAll('link[rel="canonical"]').length, 1, path);
  assert.equal(d.querySelector('link[rel="canonical"]').href, 'https://ar7traders.com' + path, path);
  assert.ok(!d.querySelector('meta[name="robots"]').content.includes('noindex'), path);
  assert.ok(d.title.length > 10 && d.querySelector('meta[name="description"]').content.length > 40, path);
  assert.ok(d.getElementById('ar7-boot'), path + ' keeps the untouched shell body (head-only prerender)');
  dom.window.close();
}

// ---------------------------------------------------------------------------
// 2026-11-12 (R38, owner backlog "sitemap xhtml:link alternates"): the static
// sitemap now announces every page's 15 language variants + x-default, so
// Google discovers the ?lang= URLs from the sitemap instead of having to
// crawl and render each page first. Pins: the xhtml namespace is declared,
// every <url> carries exactly 16 alternates, en and x-default point at the
// clean URL, and the variant URLs use the ?lang= parameter R36 shipped.
// ---------------------------------------------------------------------------
{
  const sm = readFileSync('public/sitemap.xml', 'utf8');
  assert.ok(sm.includes('xmlns:xhtml="http://www.w3.org/1999/xhtml"'),
    'the urlset declares the xhtml namespace for the alternate links');
  const urlBlocks = sm.split('<url>').slice(1);
  assert.ok(urlBlocks.length >= 60, `the sitemap still lists the full site (${urlBlocks.length} URLs)`);
  for (const block of urlBlocks) {
    const loc = block.match(/<loc>([^<]+)<\/loc>/)[1];
    const alts = [...block.matchAll(/<xhtml:link rel="alternate" hreflang="([^"]+)" href="([^"]+)"\/>/g)];
    assert.equal(alts.length, 16, `${loc} carries 15 language alternates + x-default`);
    const byLang = Object.fromEntries(alts.map(a => [a[1], a[2]]));
    assert.equal(byLang.en, loc, `${loc}: the en alternate is the clean URL`);
    assert.equal(byLang['x-default'], loc, `${loc}: x-default is the clean URL`);
    assert.ok(byLang.ur.includes('lang=ur') && byLang.sw.includes('lang=sw'),
      `${loc}: variants use the ?lang= parameter`);
  }
}

console.log(`Indexing follow-up: ${paths.length + staticHeadRoutes.length} HTML routes, sitemap alternates, sync health and editorial cadence pass.`);
