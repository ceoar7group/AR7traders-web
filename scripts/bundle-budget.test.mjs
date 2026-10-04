#!/usr/bin/env node
// Guard: the first-load JS budget, and the delivery rules that go with it.
//
//   node scripts/bundle-budget.test.mjs
//
// Phase B2 asked for two things to be measured rather than assumed:
//
//   1. how much JavaScript a phone on a 4G connection in Peshawar or Karachi
//      downloads before it can paint the first vehicle card;
//   2. that the delivery headers and font rules that make repeat visits cheap
//      are actually in the config.
//
// This suite builds the public site to a temp directory and measures the
// chunks `index.html` pulls on first paint — the entry chunk plus everything
// it modulepreloads. Route-level React.lazy boundaries are deliberately NOT
// counted: they are fetched when the visitor asks for that route, not before.
//
// Baseline (before B2, `npm run build` on d0ce6fa):
//     index-*.js            253.54 kB  ( 68.10 kB gzip)
//     vendor-react          182.12 kB  ( 57.30 kB gzip)
//     vendor-icons           29.37 kB  ( 10.42 kB gzip)
//     rolldown-runtime        0.58 kB  (  0.36 kB gzip)
//     ----------------------------------------------
//     FIRST-LOAD JS         465.61 kB  (136.18 kB gzip)
//
// After B2 (network.jsx and the customer account area moved behind
// React.lazy, `Flag` split out so the globe could be):
//     FIRST-LOAD JS         422.63 kB  (123.50 kB gzip)   -9.2% / -9.3%
//     FIRST-LOAD CSS        190.67 kB  ( 39.67 kB gzip)
//
// After C1 + B3 (Phase C1 buyer content added; /reviews showcase + 12 buyer
// stories moved behind React.lazy in src/reviews.jsx; route-specific CSS for
// /reviews, /account, and /world split into lazy chunks):
//     index-*.js            203.27 kB  ( 54.49 kB gzip)
//     vendor-react          177.86 kB  ( 55.33 kB gzip)
//     vendor-icons           28.68 kB  ( 10.13 kB gzip)
//     rolldown-runtime        0.58 kB  (  0.36 kB gzip)
//     ----------------------------------------------
//     FIRST-LOAD JS         410.38 kB  (120.30 kB gzip)   -11.9% / -11.7% vs pre-B2
//     FIRST-LOAD CSS        149.80 kB  ( 29.61 kB gzip)   -21.4% / -25.4% vs B2
//
// After the responsive/header QA pass + home make-&-budget explorer (2026-10-03):
// header fixes (bar-anchored burger panel, contained nav globe, anchored
// currency menu) and the new home running-slide dots + budget section add
// ~3.2 kB raw (≈0.4 kB gzip) of first-load CSS. Gzip stays well under budget;
// the raw ratchet moves 165 → 168 kB to absorb the deliberate feature work.
//     FIRST-LOAD CSS        166.94 kB  ( 32.71 kB gzip)
//
// After the 2026-10-03 header/hero rebuild (src/site-layout.css becomes the
// single owner of the bar at every width: one-line phone header, full nav from
// 900px, stacked hero visual below 1000px, solid-sphere header globe). Dead
// per-breakpoint header rules were deleted from styles.css, expanded.css,
// landing-v2.css and currency-responsive.css in the same pass, so the net cost
// of the new file is ~3.4 kB raw / 0.6 kB gzip. Gzip stays inside the unchanged
// budget; the raw ratchet moves 168 → 174 kB to absorb the deliberate work.
//     FIRST-LOAD CSS        170.33 kB  ( 33.32 kB gzip)
//
// The budgets below are set from the improved number with headroom for
// ordinary code growth — they are a ratchet, not a target. When the budget is
// legitimately raised, update the table above in the same change so the next
// reader can see the trend.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUT = 'node_modules/.tmp/budget';

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name); }
}
const kb = n => (n / 1024).toFixed(2) + ' kB';

// ---- build to a temp dir (never dist/, which a deploy may be reading) ------
console.log('\n-- building the public site to a temp dir --');
try {
  execFileSync('npx', ['vite', 'build', '--outDir', OUT], {
    cwd: ROOT, stdio: 'pipe', timeout: 180000
  });
  ok(true, `vite build --outDir ${OUT} succeeded`);
} catch (err) {
  ok(false, `vite build failed: ${String(err.stderr || err.message).slice(0, 300)}`);
  console.error('\n0 passed, 1 failed');
  process.exit(1);
}

const outDir = join(ROOT, OUT);
const html = readFileSync(join(outDir, 'index.html'), 'utf8');

// What the browser actually downloads on first paint: the module entry point
// plus every chunk it modulepreloads.
const entryScripts = [...html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)].map(m => m[1]);
const preloaded = [...html.matchAll(/<link[^>]*rel="modulepreload"[^>]*\shref="([^"]+)"/g)].map(m => m[1]);
const firstLoad = [...new Set([...entryScripts, ...preloaded])];

ok(entryScripts.length === 1, `index.html has exactly one module entry (found ${entryScripts.length})`);
ok(firstLoad.length > 1, `the entry modulepreloads its dependencies (${firstLoad.length} chunks)`);

// ---- measure ---------------------------------------------------------------
console.log('\n-- first-load JS budget --');
let raw = 0, gzip = 0;
const rows = [];
for (const file of firstLoad) {
  const path = join(outDir, file);
  if (!existsSync(path)) { ok(false, `${file} is referenced by index.html but missing`); continue; }
  const bytes = readFileSync(path);
  const gz = gzipSync(bytes).length;
  raw += bytes.length;
  gzip += gz;
  rows.push([file, bytes.length, gz]);
}
for (const [file, b, g] of rows) {
  console.log(`      ${file.replace(/^\/assets\//, '').padEnd(34)} ${kb(b).padStart(10)} raw  ${kb(g).padStart(9)} gzip`);
}
console.log(`      ${'' .padEnd(34)} ${kb(raw).padStart(10)} raw  ${kb(gzip).padStart(9)} gzip`);

// Ratcheted 131 → 134 kB gzip / 442 → 450 kB raw on 2026-10-03: the language
// switcher and the machine photo galleries. Both are small and both are on the
// first page a visitor sees — the switcher sits in the header, and the gallery
// is what makes a machinery listing credible. Measured 131.34 kB gzip /
// 447.29 kB raw. The thirteen non-English dictionaries were deliberately split
// into their own lazy chunk (dist/assets/i18n-dicts-*.js, ~12 kB gzip) that
// only downloads when somebody actually picks a language; do not move them
// back into the entry, and every further raise needs the same dated comment.
// Ratcheted 450 → 451 kB raw (gzip unchanged) on 2026-10-03: the home hero
// rotation now weaves the China machinery slides in with the car slides, so the
// hero states the real scope of the business instead of looking like a car lot.
// Measured 450.29 kB raw / 132.40 kB gzip.
// Ratcheted 451 → 453 kB raw (gzip unchanged) on 2026-10-03: the inventory
// facets — make/model/body/price/year/mileage/fuel/gearbox/steering/sort, each
// option annotated with its count, plus the active-filter summary and the
// match count. A data-driven facet list and the removal of the old KM_MAX
// table kept it to ~1.7 kB. Measured 452.00 kB raw / 133.13 kB gzip.
// Ratcheted 453 → 455 kB raw (gzip unchanged) on 2026-10-03: keyboard
// operability. The photo thumbs, record cards, dismissable notices, compare
// toggle and dealer-stock cards are clickable surfaces that were invisible to
// the keyboard; each one now carries role/tabIndex and an accessible name, and
// the whole-site UI audit (test:ui-audit) fails on any new one that does not.
// Measured 453.63 kB raw / 133.44 kB gzip.
// Ratcheted 134 → 137 kB gzip / 455 → 463 kB raw on 2026-10-03: machine pages
// and price offers. Every machine now has its own URL (/machinery/<type>/<REF>)
// with a real detail page, and a discount applied in the CRM is priced by
// src/offers.js everywhere the site shows a number — the card, the detail page,
// the home teaser, the promo bar and the Product structured data. The offer
// engine is deliberately in the entry (the promo bar needs it on any page); the
// sentence parser that reads "20% off machinery until 30 November" is NOT — it
// lives in src/offers-request.js, inside the CRM's lazy chunk, and that split
// took ~2 kB raw back off this number. Measured 461.61 kB raw / 136.23 kB gzip.
// Ratcheted 463 → 464 kB raw (gzip unchanged) on 2026-10-04: a campaign and a
// price offer can be live at once. The promotion bar used to render the offer
// only when no campaign was running, so the owner — with the China-desk
// campaign live — published a discount and saw nothing at the top of the site.
// The two now share the bar as two rows with independent dismissals, and the
// campaign end date is enforced on the live setting as well as on /promo.json.
// Measured 463.01 kB raw / 136.84 kB gzip. Dead code in currency.jsx, offers.js
// and main.jsx (three unused market-rate helpers, clampPercent, money) was
// deleted in the same pass; it was already tree-shaken, so it bought nothing
// and the raw ratchet carries the change. Gzip, which is what a phone actually
// downloads, stays inside the unchanged 137 kB budget.
// Ratcheted 137 → 139 kB gzip / 464 → 469 kB raw on 2026-10-04: the six screens
// a buyer meets first (home hero, inventory toolbar, enquiry form, contact
// block, footer, machinery "tell us the machine") stop hard-coding English and
// read their copy through t(). The English dictionary is the source of truth
// that every other language falls back to — translate() returns en[key] when a
// key is missing, which is the guarantee that no screen can ever render blank —
// so it cannot move into the lazy i18n chunk the way the thirteen non-English
// dictionaries do. Growing it 43 → 125 keys costs ~3.3 kB of English prose in
// the entry, plus ~60 t() call sites. Measured 466.25 kB raw / 137.92 kB gzip.
// The dictionaries themselves stay lazy (i18n-dicts-*.js, ~29 kB gzip, asserted
// below not to be preloaded); the 1.1 kB of headroom is deliberate so ordinary
// copy edits do not trip this file.
const BUDGET_GZIP = 139 * 1024;
const BUDGET_RAW = 469 * 1024;
ok(gzip <= BUDGET_GZIP,
  `first-load JS is ${kb(gzip)} gzipped (budget ${kb(BUDGET_GZIP)})`);
ok(raw <= BUDGET_RAW,
  `first-load JS is ${kb(raw)} raw (budget ${kb(BUDGET_RAW)})`);

// ---- measure first-load CSS ------------------------------------------------
console.log('\n-- first-load CSS budget --');
const entryCss = [...html.matchAll(/<link[^>]*rel="stylesheet"[^>]*\shref="([^"]+)"/g)].map(m => m[1]);
ok(entryCss.length === 1, `index.html links exactly one render-blocking stylesheet (found ${entryCss.length})`);
let cssRaw = 0, cssGzip = 0;
for (const file of entryCss) {
  const path = join(outDir, file);
  if (!existsSync(path)) { ok(false, `${file} is referenced by index.html but missing`); continue; }
  const bytes = readFileSync(path);
  const gz = gzipSync(bytes).length;
  cssRaw += bytes.length;
  cssGzip += gz;
  console.log(`      ${file.replace(/^\/assets\//, '').padEnd(34)} ${kb(bytes.length).padStart(10)} raw  ${kb(gz).padStart(9)} gzip`);
}
// Ratcheted 34 → 35.5 kB gzip / 174 → 181 kB raw on 2026-10-03: the machinery
// desk is a second product line, and its card + landing teaser styles must be
// in the first load (the teaser sits on the home page). Measured 34.67 kB /
// 179.18 kB. The machinery page's own furniture stays in its lazy chunk.
// Ratcheted 35.5 → 36.5 gzip / 184 → 186 raw on 2026-10-03: the language
// switcher panel and the RTL rules (src/i18n.css) plus the machine gallery
// styles (src/machinery.css).
// Ratcheted 186 → 187 raw on 2026-10-03 (gzip unchanged at 36.5): the promotion
// bar, which is a first-load element by definition — it sits above the header
// on every page. The bar was trimmed first (1.85 → 1.76 kB of source) and a
// dead-CSS scan of landing-v2.css found nothing left to reclaim. Measured
// 186.25 kB raw / 36.14 kB gzip.
const CSS_BUDGET_GZIP = 36.5 * 1024;   // measured 30.55 kB after the B3 CSS split (down from 39.67 kB)
const CSS_BUDGET_RAW = 188 * 1024;   // 2026-10-03: +the inventory facet toolbar (1.5 kB); measured 187.70 kB raw / 36.45 kB gzip. 182.89 kB after the 2026-10-03 SEO landing-link row + SEO desk styles; measured 153.39 kB after the B3 CSS split; 166.94 kB after the 2026-10-03 responsive/header + home budget-section pass; 170.33 kB after the 2026-10-03 header/hero rebuild; 179.18 kB after the 2026-10-03 machinery desk; 186.25 kB after the 2026-10-03 promotion bar
ok(cssGzip <= CSS_BUDGET_GZIP,
  `first-load CSS is ${kb(cssGzip)} gzipped (budget ${kb(CSS_BUDGET_GZIP)})`);
ok(cssRaw <= CSS_BUDGET_RAW,
  `first-load CSS is ${kb(cssRaw)} raw (budget ${kb(CSS_BUDGET_RAW)})`);

// ---- the split is real: lazy routes stay out of first load -----------------
console.log('\n-- the route-level split holds --');
// Every JS chunk the build emitted that is NOT part of first load must be a
// route chunk. If one of them creeps back into modulepreload the budget guard
// above would catch it, but this names the ones we moved out.
const allJs = readdirSync(join(outDir, 'assets')).filter(f => f.endsWith('.js'));
const lazyChunks = allJs
  .map(f => '/assets/' + f)
  .filter(f => !firstLoad.includes(f));
ok(lazyChunks.length >= 4,
  `the build emits ${lazyChunks.length} route JS chunk(s) outside first load: ${lazyChunks.map(f => f.replace(/^\/assets\//, '').split('-')[0]).join(', ')}`);
for (const f of lazyChunks) {
  ok(!preloaded.includes(f) && !entryScripts.includes(f),
    `${f.replace(/^\/assets\//, '')} is not preloaded into first paint`);
}
const allCss = readdirSync(join(outDir, 'assets')).filter(f => f.endsWith('.css'));
const lazyCss = allCss
  .map(f => '/assets/' + f)
  .filter(f => !entryCss.includes(f));
ok(lazyCss.length >= 4,
  `the build emits ${lazyCss.length} route CSS chunk(s) outside first load: ${lazyCss.map(f => f.replace(/^\/assets\//, '').split('-')[0]).join(', ')}`);
for (const f of lazyCss) {
  ok(!entryCss.includes(f),
    `${f.replace(/^\/assets\//, '')} is not linked into first paint`);
}

// ---- delivery headers ------------------------------------------------------
console.log('\n-- delivery headers --');
const vercel = JSON.parse(readFileSync(join(ROOT, 'vercel.json'), 'utf8'));
const headerFor = source => {
  const rule = (vercel.headers || []).find(h => h.source === source);
  return rule ? Object.fromEntries(rule.headers.map(h => [h.key, h.value])) : {};
};
const assets = headerFor('/assets/(.*)');
ok(assets['Cache-Control'] === 'public, max-age=31536000, immutable',
  '/assets/(.*) is cached immutably for a year');
const fonts = headerFor('/assets/fonts/(.*)');
ok(fonts['Cache-Control'] === 'public, max-age=31536000, immutable',
  '/assets/fonts/(.*) is cached immutably for a year');
// HTML must keep revalidating, or a deploy never reaches a returning visitor.
const rootHtml = headerFor('/');
const shellHtml = headerFor('/index.html');
ok(/must-revalidate|max-age=0/.test(rootHtml['Cache-Control'] || ''),
  '/ keeps revalidating (a deploy is picked up at once)');
ok(/must-revalidate|max-age=0/.test(shellHtml['Cache-Control'] || ''),
  '/index.html keeps revalidating');
ok(!('compress' in vercel),
  'vercel.json does not disable Vercel\'s built-in gzip/brotli compression');

// ---- fonts -----------------------------------------------------------------
console.log('\n-- fonts --');
// Only the two above-the-fold weights may be preloaded; the rest are fetched
// when something actually uses them.
const fontPreloads = [...html.matchAll(/<link[^>]*rel="preload"[^>]*as="font"[^>]*href="([^"]+)"/g)].map(m => m[1]);
ok(fontPreloads.length === 2,
  `exactly two font faces are preloaded (found ${fontPreloads.length}: ${fontPreloads.join(', ')})`);
ok(fontPreloads.every(f => /\/assets\/fonts\/[\w-]+\.woff2$/.test(f)),
  'every preloaded font is a self-hosted woff2');
ok(fontPreloads.every(f => /(400|700)\.woff2$/.test(f)),
  'the preloaded faces are the two above-the-fold weights (400 and 700)');
ok(!/fonts\/(500|600|800)\.woff2/.test(html.match(/<head>[\s\S]*?<\/head>/)[0]),
  'the 500/600/800 faces are not preloaded');

// Every @font-face must swap, or the first paint blocks on the font.
const cssFiles = readdirSync(join(outDir, 'assets')).filter(f => f.endsWith('.css'));
let faces = 0, swapped = 0;
for (const f of cssFiles) {
  const css = readFileSync(join(outDir, 'assets', f), 'utf8');
  for (const m of css.matchAll(/@font-face\{[^}]*\}/g)) {
    faces++;
    if (/font-display:\s*swap/.test(m[0])) swapped++;
  }
}
ok(faces > 0 && swapped === faces,
  `every @font-face declares font-display:swap (${swapped}/${faces})`);

// A CSS @import would re-introduce a render-blocking request behind the
// bundled stylesheet's back.
let imports = 0;
for (const f of cssFiles) {
  imports += (readFileSync(join(outDir, 'assets', f), 'utf8').match(/@import/g) || []).length;
}
ok(imports === 0, `no @import in the built CSS (found ${imports})`);

// ---- images ship with a box -------------------------------------------------
console.log('\n-- images carry explicit dimensions --');
// CLS: an <img> without width/height reflows the grid when it decodes. Count
// the ones in the source that name a photo, and confirm they all declare a box.
for (const rel of ['src/main.jsx', 'src/reviews.jsx', 'src/crm.jsx']) {
  const src = readFileSync(join(ROOT, rel), 'utf8');
  const imgs = [...src.matchAll(/<img\b[^>]*?\/>/g)].map(m => m[0]);
  const withBox = imgs.filter(t => /\swidth=/.test(t) && /\sheight=/.test(t));
  ok(withBox.length === imgs.length && imgs.length > 0,
    `${rel}: every <img> declares width and height (${withBox.length}/${imgs.length})`);
}
// The homepage hero image must ask to be fetched early, and the below-the-fold
// photos must not block first paint.
const main = readFileSync(join(ROOT, 'src/main.jsx'), 'utf8');
ok(/fetchPriority="high"/.test(main),
  'the detail-page hero image asks for fetchpriority=high');
ok((main.match(/loading="lazy"/g) || []).length >= 15,
  `below-the-fold photos are lazy (${(main.match(/loading="lazy"/g) || []).length} found)`);
ok((main.match(/decoding="async"/g) || []).length >= 15,
  `photos decode off the main thread (${(main.match(/decoding="async"/g) || []).length} found)`);

// ---- robots.txt and the sitemaps -------------------------------------------
console.log('\n-- robots.txt and sitemap sanity --');
const robots = readFileSync(join(ROOT, 'public/robots.txt'), 'utf8');
const robotsSitemaps = [...robots.matchAll(/^Sitemap:\s*(\S+)/gm)].map(m => m[1]);
ok(robotsSitemaps.includes('https://ar7traders.com/sitemap.xml'),
  'robots.txt points at the static sitemap');
ok(robotsSitemaps.includes('https://ar7traders.com/api/sitemap-vehicles.xml'),
  'robots.txt points at the vehicle sitemap');
// Machinery gets its own sitemap rather than being folded into the car one,
// so the line is REQUIRED here, not merely tolerated — a robots.txt that
// stops advertising it would quietly take every machine page out of the
// crawl while the pages themselves stayed live.
ok(robotsSitemaps.includes('https://ar7traders.com/api/sitemap-machinery.xml'),
  'robots.txt points at the machinery sitemap');
ok(robotsSitemaps.every(u => u.startsWith('https://ar7traders.com/')),
  'every sitemap URL uses the canonical domain, never www.');
for (const blocked of ['/crm', '/account', '/portal', '/studio']) {
  ok(new RegExp(`Disallow:\\s*${blocked}\\s*$`, 'm').test(robots),
    `robots.txt keeps ${blocked} out of the index`);
}
ok(!/Disallow:\s*\/\s*$/m.test(robots), 'robots.txt does not disallow the whole site');

// The static sitemap must be a valid urlset, on the canonical domain, and every
// URL in it must be a route the SPA actually serves — a sitemap listing a dead
// path is worse than no sitemap.
const staticSitemap = readFileSync(join(ROOT, 'public/sitemap.xml'), 'utf8');
ok(staticSitemap.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'),
  'public/sitemap.xml is a sitemaps.org urlset');
const staticLocs = [...staticSitemap.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1]);
ok(staticLocs.length > 0, `the static sitemap lists ${staticLocs.length} URLs`);
ok(staticLocs.every(l => l.startsWith('https://ar7traders.com/')),
  'every static sitemap URL is absolute and on the canonical domain');

// The routes the app really serves, taken from the same render suite that
// walks them all.
const pagesSrc = readFileSync(join(ROOT, 'scripts/pages-render.test.jsx'), 'utf8');
const routesBlock = (pagesSrc.match(/const ROUTES = \{([\s\S]*?)\n\};/) || ['', ''])[1];
const knownRoutes = new Set([...routesBlock.matchAll(/'(\/[a-z0-9/-]*)'/g)].map(m => m[1]));
ok(knownRoutes.size > 10, `the render suite pins ${knownRoutes.size} public routes`);
// A machine page is a real route too: /machinery/<type>/<REF>. The render suite
// pins the shape (/machinery/excavators/AR7-MC-001), so a URL matching that
// shape with a known catalogue reference is served, not dead.
const { MACHINES } = await import('../src/machinery-data.js');
const { machineHref } = await import('../src/machinery-data.js');
const machinePaths = new Set(MACHINES.map(m => machineHref(m)));
const dead = staticLocs.filter(l => {
  const p = new URL(l).pathname;
  return !knownRoutes.has(p) && !machinePaths.has(p);
});
ok(dead.length === 0,
  dead.length === 0 ? 'every URL in the static sitemap is a route the app serves'
    : `dead sitemap URLs: ${dead.join(', ')}`);

// The vehicle sitemap is a function behind a rewrite — check the wiring, and
// that its base URL matches the canonical domain used everywhere else.
const sitemapRewrite = (vercel.rewrites || []).find(r => r.source === '/api/sitemap-vehicles.xml');
ok(!!sitemapRewrite && sitemapRewrite.destination.includes('sitemap=vehicles'),
  '/api/sitemap-vehicles.xml is rewritten onto the site-content function');
ok(robotsSitemaps.includes('https://ar7traders.com/api/sitemap-vehicles.xml'),
  'the rewritten vehicle sitemap is the one robots.txt advertises');
const machineryRewrite = (vercel.rewrites || []).find(r => r.source === '/api/sitemap-machinery.xml');
ok(!!machineryRewrite && machineryRewrite.destination.includes('sitemap=machinery'),
  '/api/sitemap-machinery.xml is rewritten onto the site-content function');
ok(!!machineryRewrite && machineryRewrite.destination.includes('/api/site-content'),
  'the machinery sitemap adds no Serverless Function (it dispatches on site-content)');
ok(robotsSitemaps.includes('https://ar7traders.com/api/sitemap-machinery.xml'),
  'the rewritten machinery sitemap is the one robots.txt advertises');
const apiSrc = readFileSync(join(ROOT, 'api/site-content.js'), 'utf8');
ok(/SITEMAP_BASE\s*=\s*'https:\/\/ar7traders\.com'/.test(apiSrc),
  'the vehicle sitemap emits absolute URLs on the canonical domain');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
