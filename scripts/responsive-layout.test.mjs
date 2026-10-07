import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../index.html');
const main = read('../src/main.jsx');
const detailCss = read('../src/detail-responsive.css');
const currencyCss = read('../src/currency-responsive.css');
const portalCss = read('../src/portal.css');
const pagesCss = read('../src/pages.css');
const stylesCss = read('../src/styles.css');
const expandedCss = read('../src/expanded.css');
const crmCss = read('../src/crm.css');
const layoutCss = read('../src/site-layout.css');
const landingCss = read('../src/landing-v2.css');
const i18nCss = read('../src/i18n.css');
// Every stylesheet that used to clear the header by hand. Since the rebuild
// there is ONE owner (src/site-layout.css §8) and no file may re-introduce a
// hard-coded top offset.
const headerOffsetFiles = [layoutCss, stylesCss, expandedCss, landingCss, detailCss, pagesCss, portalCss, i18nCss].join('\n');

// 2026-10-03 header rebuild, consolidated 2026-10-07: the bar is ONE line at
// every width, owned by src/site-layout.css, which now also owns the space the
// bar occupies (`--head-h`, measured by src/site-header.jsx). The old per-file
// offsets and the fixes.css override layer are gone — a later import (i18n.css)
// may follow it, but nothing may re-declare a hard-coded header height.
assert.match(main, /import '\.\/site-layout\.css';/);
assert.doesNotMatch(main, /import '\.\/fixes\.css';/);
assert.ok(!existsSync(new URL('../src/fixes.css', import.meta.url)),
  'the fixes.css override layer was removed, not merely un-imported');
assert.doesNotMatch(headerOffsetFiles, /padding-top:\s*(?:110|122|140|142|150|152|158|160)px/);
assert.match(layoutCss, /@media \(max-width: 639px\)/);
// The action row is single-line at every width: the bar's own row is `nowrap`,
// and each icon control is square so the row shares one centre line.
assert.match(layoutCss, /\.nav-wrap \.nav \{[^}]*flex-wrap:\s*nowrap;/);
assert.match(layoutCss, /\.nav-wrap \.nav-actions \.ar7cur-btn \{[^}]*height: 32px;/);
assert.doesNotMatch(currencyCss, /grid-template-rows:\s*auto auto/);
// Below 640px the link row is the panel only: no second bar row, no wrapping.
assert.match(layoutCss, /\.nav-wrap \.navlinks \{\s*display: none;/);
assert.match(layoutCss, /\.nav-wrap \.navlinks\.open \{\s*display: flex;/);
assert.match(stylesCss, /@media\(max-width:899px\)\{\.nav\{position:relative\}/);
assert.match(stylesCss, /\.navlinks\{position:absolute;top:calc\(100% \+ 10px\);left:0;right:0/);
// Between 640px and 899px the bar keeps its quick links and only the
// `.nav-tier-full` items (Auction access / More) move into the panel — the
// flattening of the dropdowns must therefore be scoped to the open panel.
assert.match(expandedCss, /@media\(max-width:899px\)\{\s*\.navlinks\.open \.nav-drop\{width:100%\}/);
assert.match(layoutCss, /\.navlinks:not\(\.open\) \.nav-tier-full \{\s*display: none;/);
assert.match(layoutCss, /@media \(min-width: 840px\) and \(max-width: 899px\)/);
// One line on a phone means the widest label keeps its natural width and the
// controls shrink instead — no ellipsis, no hidden brand.
assert.match(layoutCss, /\.nav-wrap \.brand span \{[^}]*min-width: max-content/s);
assert.match(layoutCss, /\.nav-wrap \.brand span \{[^}]*text-overflow: clip/s);
assert.doesNotMatch(expandedCss, /brand span\{max-width:112px/);
// The header globe is a solid planet button that paints its own sphere, with
// the rotating face filling it edge to edge — the pale ring around a smaller
// globe is what looked like a white part.
assert.match(layoutCss, /\.nav-wrap \.brand-group \.nav-orb \{[^}]*overflow: hidden/s);
assert.match(layoutCss, /\.nav-wrap \.brand-group \.nav-orb \{[^}]*radial-gradient/s);
assert.match(layoutCss, /\.nav-wrap \.brand-group \.nav-orb \.iglobe \{[^}]*width: 100%;[^}]*height: 100%/s);
assert.match(layoutCss, /\.nav-wrap \.brand-group \.nav-orb \.iglobe-sphere \{[^}]*background: none/s);
// The globe spins in every direction: the map strip overhangs the face and is
// translated on both axes, and the script clamps the latitude so the strip can
// never run out and expose an empty edge.
assert.match(main, /--lat/);
assert.match(main, /maxLat/);
assert.match(layoutCss, /\.nav-panel-actions/);
assert.match(currencyCss, /\.nav-wrap \.nav-actions \.ar7cur-switch\s*\{[^}]*position:\s*static/s);
// CRM: the shell's content track can shrink and the row actions stay pinned to
// the right of the scrollable table so buttons never sit out of frame.
assert.match(crmCss, /grid-template-columns:\s*260px minmax\(0,\s*1fr\)/);
assert.match(crmCss, /\.crm-table-wrap th\.th-actions,\s*\.crm-table-wrap td\.crm-row-actions\{position:sticky;right:0/s);
// Home page: running inventory slide + make/budget explorer exist.
assert.match(main, /home-carousel-dots/);
assert.match(main, /brand-budgets shell section/);
assert.match(main, /homeHover/);

// The pre-React first paint should be a branded loading state, not the SEO
// fallback article. Keep the semantic fallback available when JS is disabled.
assert.match(html, /id="ar7-boot"[^>]*role="status"/);
assert.match(html, /html\.ar7-js #ar7-static-preview\s*\{\s*display:none;/);
assert.match(html, /id="ar7-static-preview"/);
assert.doesNotMatch(html, /Loading the full website/);
assert.match(html, /__ar7BootFallbackTimer/);
assert.doesNotMatch(html, /classList\.remove\(['\"]ar7-js['\"]\)/);
assert.match(html, /data-failed/);
assert.match(html, /class=\"boot-retry\"/);
assert.match(main, /clearTimeout\(window\.__ar7BootFallbackTimer\)/);

// The detail gallery owns its decorative globe and sheet badge; the detail
// layout must provide explicit tablet and phone rules rather than overflowing.
assert.match(detailCss, /\.detail-gallery\s*\{\s*position:\s*relative;/);
assert.match(detailCss, /@media\s*\(min-width:\s*651px\)\s*and\s*\(max-width:\s*1000px\)/);
assert.match(detailCss, /@media\s*\(max-width:\s*650px\)/);
assert.match(detailCss, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
assert.match(detailCss, /overflow-wrap:\s*anywhere/);
// The lazily loaded account stylesheet must once again not re-clear the header
// by hand: the shell reserves it once (`.site > main`), so the account panels
// only add their own lead-in.
assert.match(portalCss, /\.account-page\{min-height:calc\(100vh - var\(--head-h,0px\)\)/);
assert.match(portalCss, /\.account-overlay\{position:absolute;z-index:2;inset:0;padding:clamp\(/);
assert.match(portalCss, /\.account-form-wrap\{padding:clamp\(/);
assert.match(portalCss, /@media\(max-width:650px\).*\.account-form-wrap\{padding:clamp\(20px,4vh,38px\) 20px 45px\}/s);
assert.match(portalCss, /\.my-account\{padding:var\(--hero-lead\)/);

// The currency menu anchors to the whole actions row; the switch itself must be
// static on phones or the panel clips off the left screen edge.
assert.match(currencyCss, /\.nav-wrap \.nav-actions\s*\{[^}]*position:\s*relative/s);
assert.match(currencyCss, /\.nav-wrap \.nav-actions \.ar7cur-menu\s*\{[^}]*right:\s*0/s);
assert.doesNotMatch(currencyCss, /\.nav-wrap \.nav-actions \.ar7cur-menu\s*\{[^}]*left:\s*50%/s);
assert.match(currencyCss, /@media\s*\(max-width:\s*420px\)/);
assert.match(currencyCss, /@media\s*\(max-width:\s*650px\)/);
assert.match(currencyCss, /@media\s*\(min-width:\s*651px\)\s*and\s*\(max-width:\s*720px\)/);
// The bar is fixed, so the page reserves its real height exactly once — from
// the measured `--head-h` — and every hero adds only its own lead-in.
assert.match(layoutCss, /--head-h: calc\(var\(--promo-h, 0px\) \+ var\(--head-pad\) \+ var\(--ribbon-h\) \+ var\(--head-gap\) \+ var\(--nav-h\) \+ var\(--head-pad\)\)/);
assert.match(layoutCss, /\.site > main \{\s*padding-top: var\(--head-h\);/);
assert.match(layoutCss, /\.hero \{\s*min-height: 0;[\s\S]*?max-height: none;\s*padding-top: var\(--hero-lead\);/);
assert.match(pagesCss, /@media\(max-width:650px\)\{\.page-hero\{padding-top:var\(--hero-lead\)\}/);
assert.match(layoutCss, /scroll-padding-top: calc\(var\(--head-h\) \+ 14px\)/);
assert.match(currencyCss, /@media\s*\(max-width:\s*899px\)/);
assert.match(html, /preload\"\s+as=\"image\"\s+href=\"\/assets\/lux\/rolls-royce-ghost\.webp\"\s+fetchpriority=\"high\"/);
assert.doesNotMatch(html, /preload\"\s+as=\"image\"[^>]+used-japanese-cars-auction-export-toyota/);
assert.match(main, /DeferredBigGlobe/);
assert.match(main, /loading=\{n===0\?'eager':'lazy'\}/);
assert.match(main, /prefers-reduced-motion/);

// 2026-10-07 hero rebuild: the photograph IS the card. `.hero-visual` is a
// two-row grid — row 1 the photo, row 2 ONE in-flow `.hero-facts` row — so no
// card, badge or sparkle can sit on top of the vehicle at any width. The old
// `.floating-card` / `.floating-badge` / `.hero-vignette` / `.spark` rules are
// deleted everywhere, not merely overridden (one owner per rule).
assert.match(stylesCss, /\.hero-visual\{position:relative;display:grid;grid-template-rows:minmax\(0,1fr\) auto;/);
assert.match(stylesCss, /\.car-main\{grid-row:1;grid-column:1\/-1;/);
assert.match(stylesCss, /\.hero-facts\{grid-row:2;grid-column:1\/-1;display:grid;/);
assert.match(main, /className="hero-facts"/);
assert.match(main, /className="route-strip"/);
assert.match(main, /className="auction-chip"/);
// Nothing that used to overlay the photograph may survive in markup or CSS.
for (const dead of ['floating-card', 'floating-badge', 'hero-vignette']) {
  assert.doesNotMatch(main, new RegExp('className="' + dead), `the hero no longer renders .${dead}`);
  assert.doesNotMatch(layoutCss, new RegExp('\\.' + dead + '\\s*[,{]'), `no .${dead} rule survives in site-layout.css`);
  assert.doesNotMatch(landingCss, new RegExp('\\.' + dead + '\\s*[,{.]'), `no .${dead} rule survives in landing-v2.css`);
  assert.doesNotMatch(stylesCss, new RegExp('\\.' + dead + '\\s*[,{]'), `no .${dead} rule survives in styles.css`);
}
assert.doesNotMatch(main, /className="spark /, 'the six gold sparkles are gone from the hero');
assert.doesNotMatch(landingCss, /\.spark\{|\.spark\.s1/, 'the sparkle rules are deleted, not just unused');
assert.doesNotMatch(main, /--mx|--my|onMouseMove=\{onMove\}/, 'the mouse parallax that moved the floating cards is gone');
// The hero box must be free to grow: the old 940px cap let the badge and the
// globe spill over the marquee below it.
assert.match(layoutCss, /@media \(max-width: 1000px\)[\s\S]*?\.hero \{\s*max-height: none/);
// Below 1000px the two facts cards stack: side by side on a phone each was
// ~170px wide, which truncated the lane and squeezed the countdown.
assert.match(layoutCss, /@media \(max-width: 1000px\)[\s\S]*?\.hero \.hero-facts \{\s*grid-template-columns: minmax\(0, 1fr\);/s);
assert.match(layoutCss, /\.hero-facts \.rotating-card-copy \{[^}]*flex-direction: column/s);
assert.match(layoutCss, /\.hero-facts \.route-foot \{[^}]*justify-content: space-between/s);
assert.match(layoutCss, /\.nav-wrap \.navlinks\.open \.inventory-panel:before \{\s*content: 'Inventory'/);
assert.match(layoutCss, /\.nav-wrap \.navlinks\.open \.nav-drop-panel > a \{[^}]*justify-content: flex-start/s);

// W1/W2: the facets stay as a single full-width wrapping flex toolbar at every
// viewport, and the mobile hero retains both its owner-approved proof point
// and the scroll cue that the old <=1000px rule hid.
assert.match(main, /className="inv-toolbar inv-toolbar-facets"/);
assert.match(detailCss, /\.inv-toolbar-facets\{display:flex!important/);
assert.match(detailCss, /\.inv-toolbar-facets>\.inv-facets\{display:flex;flex-wrap:wrap/);
assert.match(detailCss, /\.inv-toolbar-facets>\.inv-search\{[^}]*width:100%/);
assert.match(main, /<FounderStat variant="hero" delay=\{900\}\/>/);
assert.match(detailCss, /\.hero \.scroll-cue\{display:flex!important/);
assert.match(detailCss, /\.hero-copy \.founder-stat--hero\{display:flex;visibility:visible;opacity:1/);
// The mobile hero no longer needs a hard-coded bottom pad to clear the cue: the
// cue sits in the hero's own flow (§9) and the hero grows to hold it.
assert.doesNotMatch(detailCss, /\.hero\{padding-bottom:94px/);
assert.match(layoutCss, /\.hero \.scroll-cue \{[^}]*position: static;/s);
assert.match(layoutCss, /\.hero \.scroll-cue \{[^}]*grid-column: 1 \/ -1;/s);

// The vehicle detail photos keep their gallery and zoom affordances but no
// longer inherit the decorative globe used by the header/world network.
assert.doesNotMatch(main, /detail-orb/);
assert.doesNotMatch(detailCss, /detail-orb/);
assert.doesNotMatch(landingCss, /detail-orb/);
assert.match(main, /detail-gallery-toolbar/);
assert.match(main, /gallery-expand/);

// Hero viewport contracts for the requested widths. 1920/1366/1024 use the
// collage; 768/390 flow through the stacked visual. These source/CSS contracts
// complement the client-mount control checks and are deliberately pinned to
// the exact breakpoint where the columns change.
const targetHeroWidths = [1920, 1366, 1024, 768, 390];
for (const width of targetHeroWidths) {
  const expectedMode = width <= 1000 ? 'stacked' : 'collage';
  const stackedRule = /@media \(max-width: 1000px\)[\s\S]*?\.hero \.hero-visual \{[\s\S]*?grid-template-rows: auto auto/.test(layoutCss);
  const collageRule = /\.hero-visual\{position:relative;display:grid;grid-template-rows:minmax\(0,1fr\) auto;gap:clamp\(12px,2\.2vh,20px\);height:clamp\(430px,min\(68vh,52vw\),640px\)\}/.test(stylesCss);
  const actualMode = width <= 1000 ? (stackedRule ? 'stacked' : 'missing') : (collageRule ? 'collage' : 'missing');
  assert.equal(actualMode, expectedMode, `${width}px hero uses its declared ${expectedMode} geometry`);
  // Both desks stay one click away at every width, as real anchors: the CTA row
  // is `/inventory` + `/machinery`, so Ctrl/Cmd-click and middle-click work and
  // the links are crawlable out of the hero.
  assert.match(main, /<PageLink className="primary" to="inventory" navigate=\{navigate\}>/,
    `${width}px hero primary CTA is an anchor to /inventory, not a JS button`);
  assert.match(main, /<PageLink className="ghost-btn" to="machinery" navigate=\{navigate\}>/,
    `${width}px hero keeps the machinery desk one click away`);
  assert.match(layoutCss, /\.hero \.hero-cta a:focus-visible/,
    `${width}px hero CTA anchors keep a visible focus ring`);
}
// The arrows share grid row 1 with the photograph, so they centre on the PHOTO
// by construction. Three per-breakpoint `top:` offsets used to guess at it;
// with the facts row added underneath, `top:50%` of `.hero-visual` would have
// landed them below the car. There is now no magic number to drift.
assert.match(layoutCss, /\.hero-carousel-controls \{[^}]*grid-row: 1;[^}]*grid-column: 1 \/ -1;[^}]*align-items: center;/s,
  'carousel arrows are grid-placed on the photo row and centred on it');
assert.doesNotMatch(layoutCss, /\.hero-carousel-controls \{[^}]*top:\s*clamp\(/s,
  'no per-breakpoint top offset is left to guess where the photo is');
assert.match(layoutCss, /\.hero-carousel-controls button \{[^}]*width: 42px[^}]*height: 42px/s);
assert.match(layoutCss, /\.hero-carousel-controls button \{width:40px;height:40px\}/);
assert.match(main, /!query\.matches&&!document\.hidden&&!el\.matches\(':hover,:focus-within'\)/,
  'the rotating hero pauses for reduced motion, hover, hidden pages, and keyboard focus');
assert.match(main, /prefers-reduced-motion: reduce/);
// Reduced motion: ONE owner (src/site-layout.css §10) stops every moving part
// of the facts row — the lane line drawing in, the ship sailing on it, the
// auction chip's live dot and the card swap. The lane line still shows the
// route's real progress; it just does not animate to it.
const heroMotion = layoutCss.slice(layoutCss.indexOf('ONE owner for hero motion preferences'));
for (const stopped of ['.hero-facts .rotating-card-copy', '.hero-facts .card-live',
                       '.route-strip .progress span', '.route-strip .route-ship']) {
  assert.ok(heroMotion.includes(stopped),
    `prefers-reduced-motion stops ${stopped}`);
}
assert.match(layoutCss, /\.route-strip \.progress span \{width:var\(--route-progress\)!important/,
  'under reduced motion the lane line still shows the real progress, without animating');
assert.ok(landingCss.includes('@media (prefers-reduced-motion: reduce)') && landingCss.includes('.ticker>div'));
assert.match(main, /className="hero-facts"/);
assert.match(main, /Shipping lane · \{routeIdx\+1\}\/\{heroRoutes\.length\}/);
assert.match(main, /Next auction · \{auction\.city\}/);
assert.match(main, /Starts in \{formatCountdown\(remaining\)\}/);
assert.match(main, /className="ticker"/);
// The facts row is honest about being an illustration, exactly as the two
// floating cards were: both cards still carry the visible "demo" tag.
const demoTags = (main.match(/card-demo/g) || []).length;
assert.ok(demoTags === 2,
  `both facts cards keep the visible "demo" tag — the lane strip and the auction chip are illustrations, not live data (found ${demoTags})`);

console.log('Responsive layout, hero viewport contracts and first-paint checks passed.');
