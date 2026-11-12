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
// After the 2026-10-04 SEO content pass: the machinery catalogue FAQ (three
// questions per type plus the hub, rendered visibly on /machinery and each
// type page and mirrored in FAQPage JSON-LD) and the guide → machinery
// internal links (RelatedMachines block + footer link on every article) add
// ~4.3 kB raw (≈1.0 kB gzip) of first-load JS. The ratchet moves
// 469 → 476 kB raw and 139 → 141 kB gzip to absorb the deliberate work.
//     FIRST-LOAD JS         473.26 kB  ( 140.00 kB gzip)
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
// the home teaser, the promo bar and the Product structured data. The shared
// stock-discount lookup is in the entry (public cards and PromoBar need it on
// first paint); the CRM catalogue editor stays in its lazy chunk.
// Discounts are per-reference, with no catalogue-wide pricing path. Measured 461.61 kB raw / 136.23 kB gzip.
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
// Ratcheted 139 → 141 kB gzip / 469 → 476 kB raw on 2026-10-04 for the SEO
// content pass (machinery FAQ markup + guide → machinery internal links);
// see the table entry above. Measured 473.26 kB raw / 140.00 kB gzip.
// Ratcheted 476 → 477 kB raw on 2026-10-05 for the two keyboard-focusable
// hero sourcing-desk links.
// Ratcheted 141 → 142 kB gzip / 477 → 479 kB raw on 2026-10-07 for the header
// single-owner pass: the bar measures itself instead of every section carrying
// a hard-coded offset, and it now owns its own lifecycle (pinned at the top of
// a hero page, gone before the hero's first line of copy can slide under it,
// back on scroll-up). That is ~0.6 kB of first-load JS; the CSS it deleted
// stays inside the unchanged CSS budget. Measured 477.61 kB raw / 140.99 kB gzip.
// Ratcheted 142 → 143 kB gzip / 479 → 482 kB raw on 2026-10-08 for the six
// market landing pages (/destinations/<market>). The page markup itself is a
// route-level React.lazy chunk (destination-page-*.js, asserted below not to be
// preloaded), and the hub's duplicated inline guide was deleted in the same
// change — one owner for that copy, and no duplicate paragraphs for a crawler
// to choose between. What remains in first load is the market copy src/seo.js
// has to read synchronously to build each URL's title, description, breadcrumb
// and FAQPage markup: document packs, authorities and the five FAQ templates.
// Measured 481.36 kB raw / 142.07 kB gzip.
// 2026-10-09: two missing market copy sets and two substantive buyer guides
// share the existing synchronous SEO/news data. No new first-load library.
// Ratcheted 488 → 498 kB raw on 2026-11-06: the curated showroom grew from 12
// to 18 real cars (six bundled spec records with 12-photo gallery URL lists
// each, ~8 kB of data, no new library). Measured 495.90 kB raw; gzip stays
// inside the unchanged 145 kB budget.
// Ratcheted 498 → 503 kB raw on 2026-11-07: inventory pagination (numbered
// Pager + per-page selector) and the hero motion showcase with brand-count
// chips replaced the lazy globe on /inventory — plain React in main.jsx,
// ~2 kB minified, no new library. Measured 500.10 kB raw; gzip stays inside
// the unchanged 145 kB budget.
// Ratcheted 503 → 504 kB raw / 145 → 146 kB gzip on 2026-11-07: the global
// search trigger in the header, the Ctrl+K listener and the cookie notice —
// plain React in main.jsx/site-header.jsx, ~1 kB minified. The search overlay
// and the legal pages themselves are lazy chunks (global-search.jsx,
// legal.jsx) and cost first-load nothing. Measured 502.95 kB raw /
// 145.12 kB gzip.
// Ratcheted 504 → 506 kB raw on 2026-11-08 (gzip unchanged at 146): the
// restructured inventory brand-pulse strip (label + chips row) and the
// stock-alert capture bar under the inventory grid — plain React in
// main.jsx, ~1 kB minified. The Topic Scout, upgrade report and Upgrade
// Advisor all live in the lazy CRM chunk and cost first-load nothing.
// Measured 504.81 kB raw / 145.60 kB gzip.
// Ratcheted 506 → 509 kB raw / 146 → 147 kB gzip on 2026-11-07: the brand
// cards gained an IO-gated stock slideshow, the inventory showcase gained
// drag/arrows, and the hero slides gained srcset (owner's UI round).
// Ratcheted 509 → 513 kB raw / 147 → 148 kB gzip on 2026-11-07 (later the
// same day): saved searches & stock alerts — the shared criteria matcher
// (src/saved-search.js) and the inventory's SaveSearchBar.
// Ratcheted 513 → 531 kB raw / 148 → 153 kB gzip on 2026-11-08: the market
// expansion tripled the destination guides (8 → 27 markets of real route
// copy + 19 vector flags) and every stock card gained WhatsApp/offer
// actions. This is deliberate first-load content, not dependency creep.
// Ratcheted 153 → 154 kB gzip on 2026-11-08 (3): account-synced favourites
// (pull/merge/push effects in the app shell). Actual: 153.33 kB gzip.
// 2026-11-09: 154 → 155 kB gzip — split day/night + blue&gold theme controls,
// burger-sheet close row, and the TEMP hero-layout preview switcher (A/B/C).
// Tighten back when the unused hero variants + switcher are deleted.
// 2026-11-13: 155 → 160 kB gzip — three i18n rounds of English source copy in
// src/i18n.js (nav/world, home sections + car cards, inner-page heroes + FAQ,
// How-to-Buy flow + Services + Tools calculators; 464 keys now). The 13
// translated dictionaries stay lazy-loaded — this is the EN source only.
// Actual: 159.66 kB gzip.
// 2026-11-14: 160 → 163 kB gzip — fourth i18n round: 97 EN source keys for
// the related-stock strips, brands/news page internals and the buyer-account
// screens (login/signup/reset). English is the fallback dictionary so it must
// ride first load; the 13 translations stay in the lazy i18n-dicts chunk.
// Measured after the change: 161.30 kB gzip / 556.33 kB raw.
// 2026-11-18: 163 → 164 kB gzip — public track-your-shipment box on
// /shipping (courier-style lookup against /api/my-account?track=NO with the
// milestone strip and the free VesselFinder live-position link). It sits on
// an inner page of the main bundle, so it rides first load.
// Measured: 163.47 kB gzip.
// 2026-11-18 (3): 165 → 166 kB gzip — hero search console v2 (make-aware
// Model select) + runtime stock-CDN preconnect + landed-price cards earlier
// the same day. Measured 165.22 kB.
// 2026-11-18 (2): 164 → 165 kB gzip — fifth i18n round: 46 ma.* EN source
// keys for the signed-in My Account view (orders, payments, Where-is-my-car
// shipment tracking). English is the fallback dictionary so it rides first
// load; the 13 translations stay in the lazy i18n-dicts chunk.
// Measured: 164.13 kB gzip.
// 2026-11-18 (4): 166 → 167 kB gzip — sixth i18n round: 55 ma.*/enq.ref* EN
// source keys (refer-a-friend card, saved cars/searches, profile + password
// panels, enquiry referral field). English is the fallback dictionary so it
// rides first load; the 13 translations stay in the lazy i18n-dicts chunk.
// Measured: 166.21 kB gzip.
// 2026-11-19: 167 → 170 kB gzip — src/jp-display.js: display-side English
// translation of goo-net Japanese fields (colour token dictionary, the
// 47-prefecture map, transmission patterns, model word map). It must ride the
// first-load bundle because enrichCar runs on every hydrated car before the
// first paint of a card. Measured 169.35 kB gzip.
const BUDGET_GZIP = 170 * 1024;
// 2026-11-08 (2): +1 kB raw for the recently-sold home strip (renders only
// when the CRM marks listings Sold) and the last visible "demo" kicker fixes.
// Actual after the change: 531.06 kB raw; gzip stayed inside its budget.
// 2026-11-08 (3): 532 → 533 kB raw for the favourites sync (actual 532.23).
// 2026-11-08 (4): 533 → 534 kB raw — the home hero swaps its flat cross-fade
// card for the inventory-style 3D showroom stage (per-slide links, drag/swipe,
// blur-fill frames) and the inventory stage gains the same drag-guard fixes.
// Actual: 533.56 kB raw; gzip stayed inside its 154 kB budget (153.64).
// 2026-11-08 (5): 534 → 535 kB raw — third public theme (light/dark/blue
// cycle) and the dealer-signage crop rules. Actual: 534.07 kB raw.
// 2026-11-09: 535 → 537 kB raw — same additions as the gzip note above.
// 2026-11-09 (later): 537 → 539 kB raw — six new vector flags (China, India,
// Germany, Russia, France, Turkey) plus the world-map flag layer and the
// China origin chip on the big globe.
// 2026-11-13: 539 → 553 kB raw — same i18n EN-source growth as the gzip note
// above (the per-screen t() wiring + 464 English keys). Actual: 551.63 kB raw.
// 2026-11-14: 553 → 558 kB raw — same fourth-round i18n EN-source growth as
// the gzip note above. Measured 556.33 kB raw.
// 2026-11-14 (quick-quote): 558 → 560 kB raw — 27 qq.* English fallback keys
// plus the DeferredQuickQuote wrapper ride first load; the wizard itself and
// its CSS are a lazy quick-quote chunk. Measured 558.14 kB raw / 161.80 gzip.
// 2026-11-17: 560 → 562 kB raw — round-7 mobile QA: the wizard's destination
// currency selector (4 qq.* keys), interaction-gated Supabase auth restore,
// the prev/next home stock pager and the promo-bar shift-free reservation.
// Measured 560.86 kB raw / gzip well inside 163.
// 2026-11-18: 562 → 564 kB raw — the public track-your-shipment box (same
// change as the gzip note above). Measured 562.69 kB raw.
// 2026-11-18 (4): 568 → 570 kB raw — hero search console v2 + runtime
// stock-CDN preconnect (origin derived from data, never hardcoded).
// 2026-11-18 (3): 566 → 568 kB raw — landed-price cards: the CIF-destination
// picker on the inventory toolbar + the per-card indicative CIF chip
// (estimateFor reuse, localStorage persistence). Measured 566.70 kB.
// 2026-11-18 (2): 564 → 566 kB raw — the 46 ma.* EN source keys for the
// signed-in My Account view (same change as the gzip note above).
// Measured 564.52 kB raw.
// 2026-11-18 (5): 570 → 572 kB raw — the 55 EN source keys of the sixth i18n
// round (same change as the gzip note above). Measured 570.28 kB raw.
// 2026-11-19: 572 → 578 kB raw — src/jp-display.js (same change as the gzip
// note above). Measured 576.31 kB raw.
const BUDGET_RAW = 578 * 1024;
ok(gzip <= BUDGET_GZIP,
  `first-load JS is ${kb(gzip)} gzipped (budget ${kb(BUDGET_GZIP)})`);
ok(raw <= BUDGET_RAW,
  `first-load JS is ${kb(raw)} raw (budget ${kb(BUDGET_RAW)})`);

// ---- SPA shell head hygiene (2026-11-18) ------------------------------------
// Search Console showed 93 pages "not indexed": this shell is served for EVERY
// client-rendered route, so a static canonical pointing at "/" declared every
// vehicle page an alternate of the homepage in Google's first HTML pass.
// applySeo() owns the canonical at runtime; prerendered pages bake theirs.
console.log('\n-- SPA shell head hygiene --');
ok(!/rel="canonical"/.test(html),
  'the SPA shell carries NO static canonical — applySeo sets the per-route one (pinned: do not re-add)');
// The stock-photo CDN preconnect is injected at RUNTIME from the data (see
// the App boot effect in main.jsx) because the public shell never names the
// sourcing site — pinned by the ui-audit index.html checks.
ok(!/goo-net/i.test(html), 'the shell still never names the sourcing site');

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
// Ratcheted 36.5 → 37 kB gzip / 188 → 190 kB raw on 2026-10-04: the SEO desk
// becomes a creator, not just an auditor — the guide-creation form, generated
// JSON panel and draft-audit block (src/expanded.css, ~1.9 kB) — and the
// machinery scraper's batch preview list + category picker in the CRM import
// panel (src/crm.css, ~1.4 kB). Both are deliberate staff-tool surfaces; the
// public first paint is unchanged. Measured 189.29 kB raw / 36.72 kB gzip.
// Ratcheted 37 → 38 kB gzip / 190 → 192 kB raw on 2026-10-05 for the
// fixed header, resized hero callouts and responsive founder-stat corrections.
// Ratcheted 192 → 194 kB raw on 2026-11-07 (gzip unchanged at 38): the
// inventory hero showcase + brand-pulse chips + numbered pager styles
// (src/extra-pages.css, ~2.3 kB) and the CRM per-lead AI-assist modal
// (src/crm.css, ~2.4 kB — a staff-tool surface). Measured 192.50 kB raw.
// Ratcheted 194 → 196 kB raw on 2026-11-07 (gzip unchanged at 38): the
// header search pill and the one-time cookie notice (src/site-layout.css,
// ~2.1 kB). The search overlay and legal-page styles ship in their lazy
// chunks (global-search.css, legal.css) and cost first-load nothing.
// Measured 194.21 kB raw / 37.71 kB gzip.
// Ratcheted 196 → 198 kB raw / 38 → 39 kB gzip on 2026-11-08: the labelled
// brand-pulse strip (glass panel + mobile side-scroll) and the stock-alert
// bar in src/extra-pages.css, ~2 kB. CRM-only styles (scout, advisor) ship
// in the lazy chunks. Measured 196.89 kB raw / 38.13 kB gzip.
// CSS ratcheted 39 → 40 kB gzip / 202 → 204 kB raw on 2026-11-07: the
// save-search panel (extra-pages.css) and the account page's saved-search
// cards (portal.css).
// 2026-11-08: 40 → 41 kB gzip for the burger-menu refresh (clean bar below
// 900px, dimmed backdrop, tablet drawer, 48px rows). Actual: 40.13 kB gzip.
// 2026-11-08 (2): 41 → 42 kB gzip for the landing showroom stage + premium
// stage arrows + the phone-bar overflow fix. The dead cross-fade rules
// (.hero-stack, .car-float-title, .image-shade) were pruned to offset part
// of it. Actual: 41.06 kB gzip.
// 2026-11-11: 43 -> 43.25 kB. Owner request: machinery (China desk) cards
// join the premium metal finish (chips, type badge, FOB tray, view/chat
// buttons) and the maker row grew. Measured 43.07 kB gz after merging the
// new selectors; raw stayed inside 225.
// 2026-11-11 (2): 43.25 → 43.5 kB. Owner UI/UX round: the article-overflow
// guards (minmax track pin + overflow-wrap), the WCAG AA contrast pass
// (--gold-ink switches, status-chip tones, hero kicker) and the
// content-visibility block for below-the-fold home sections. Measured
// 43.26 kB gz / 225.28 kB raw — ~300 bytes of deliberate fixes.
// 2026-11-03 (R41): 43.5 → 44.5 kB. Owner round: per-page hero motion scenes
// (auction/shipping/about/contact + extra-page accents, CSS/SVG only — the
// alternative was a JS animation library, which this budget exists to avoid),
// the footer rebrand (transparent mark, wordmark, visible social buttons),
// the home "shop by" rails and the integrated card-open split button, all in
// src/landing-anim.css. Measured 44.35 kB gz / 228.14 kB raw.
// 2026-11-03 (R42): 44.5 → 45 kB. Owner round: the inventory grid/list view
// toggle + full list-view layout (desktop rows + compact phone rows), the
// vehicle-card refresh and the footer logo halo. The removed card-open
// split-button rules partly offset it. Measured 44.61 kB gz / 229.24 kB raw.
const CSS_BUDGET_GZIP = 45 * 1024;
// Ratcheted 198 → 202 kB raw on 2026-11-07: budget-card slideshow, the gold
// search buttons (header + floating), the language pill and the metric-matched
// Manrope fallback face.
// 204 → 206 kB raw on 2026-11-08: card action buttons + wider home sections.
// 2026-11-08 (2): 206 → 208 kB raw for the responsive polish pass — 44px
// touch targets on card actions/pager, stacked CRM bulk bar, my-account
// breakpoints (which had none) and the iOS focus-zoom fix (16px inputs on
// phones). Actual after the change: 206.09 kB raw; gzip stayed in budget.
// 2026-11-08 (3): 208 → 213 kB raw — the landing showroom stage (hero-stage
// slides, blur-fill frames, premium arrows at two breakpoints) plus the
// phone-bar overflow fix; ~1.3 kB of dead cross-fade hero rules pruned from
// styles.css/landing-v2.css/site-layout.css. Actual: 211.71 kB raw.
// 2026-11-08 (4): 213 → 214 kB raw — the blue & gold theme layer (navy
// variable set + overrides for the hard-coded emerald surfaces) and the
// open-stage mask rules. Actual: 213.22 kB raw; gzip 41.47 in a 42 budget.
// 2026-11-09: 214 → 219 kB raw (gzip 42 → 43) — mobile menu close row, split
// theme buttons, and the TEMP A/B/C hero-layout variant layers in
// landing-v2.css. Two of the three variants are deleted once the owner picks;
// tighten this back then.
// 2026-11 (owner request): 222 → 225 kB raw — premium brushed-metal finish
// for the card spec chips, compare chip, stock badges, price arrow and the
// gold/green CTAs (expanded.css "PREMIUM METAL FINISH" block). Measured
// 223.77 kB raw / 42.93 kB gzip — gzip stays inside the unchanged 43.
// 2026-11-18: 221 → 222 kB raw — landed-price cards: .card-cif chip and
// .cif-dest-pick picker styles. Measured 221.19 kB.
// 2026-11-17: 219 → 221 kB raw — round-7 mobile QA: single-line mobile promo
// row, 44px home pager buttons, hv=c foot-band contrast block and the ≤560
// two-row route chip. Measured 219.98 kB raw / gzip inside 43.
// 2026-11-11 (2): 225 → 225.5 kB raw — same fix set as the gzip note above.
// 2026-11-11 (3): 225.5 → 227 kB raw — the dark-theme contrast pass the owner
// asked for: the home world band flips to a deep-green surface in dark mode
// (plus re-pointed text pins), machinery facet/count dark rules, and the
// brand-gold wordmark tokens. Measured 226.34 kB raw / 43.48 kB gzip — the
// gzip budget is unchanged and still holds.
// 2026-11-03 (R41): 227 → 229.5 kB raw — src/landing-anim.css (same change
// set as the gzip note above). Measured 228.14 kB raw.
const CSS_BUDGET_RAW = 229.5 * 1024;
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
// Only the above-the-fold weights may be preloaded; the rest are fetched when
// something actually uses them. Re-ratcheted 2 → 4 on 2026-11-07 from a field
// PageSpeed trace: the hero <h1> is weight 800 and the nav is 600/700, so the
// browser discovered manrope-600/800 late via CSS and the swap landed 688ms
// in — the longest critical chain on the page.
// Re-ratcheted 4 → 5 on 2026-11-11 from the next field PSI trace: with the
// other four preloaded, manrope-500 (body/medium text) became the new tail —
// the page's longest network dependency chain at 799ms, discovered late via
// CSS. All five weights the first paint uses are now preloaded; there is no
// sixth face to ratchet to.
const fontPreloads = [...html.matchAll(/<link[^>]*rel="preload"[^>]*as="font"[^>]*href="([^"]+)"/g)].map(m => m[1]);
ok(fontPreloads.length === 5,
  `exactly five font faces are preloaded (found ${fontPreloads.length}: ${fontPreloads.join(', ')})`);
ok(fontPreloads.every(f => /\/assets\/fonts\/[\w-]+\.woff2$/.test(f)),
  'every preloaded font is a self-hosted woff2');
ok(fontPreloads.every(f => /(400|500|600|700|800)\.woff2$/.test(f)),
  'the preloaded faces are the above-the-fold weights (400, 500, 600, 700, 800)');
ok(/fonts\/manrope-500\.woff2/.test(html.match(/<head>[\s\S]*?<\/head>/)[0]),
  'the 500 face is preloaded (2026-11-11 PSI: it was the 799ms chain tail)');

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
// 2026-11-12 (R38): the urlset also declares the xhtml namespace — every URL
// now announces its 15 ?lang= alternates + x-default to the crawlers.
ok(staticSitemap.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">'),
  'public/sitemap.xml is a sitemaps.org urlset (with the xhtml alternates namespace)');
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
