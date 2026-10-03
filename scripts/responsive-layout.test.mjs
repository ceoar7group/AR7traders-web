import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

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

// 2026-10-03 header rebuild: the bar is ONE line at every width, owned by
// src/site-layout.css (imported last, so nothing earlier can re-shape it). The
// old two-row phone grid is gone and the burger tier drops from 1100px to
// 899px so laptops and tablets keep their real navigation row.
assert.match(main, /import '\.\/site-layout\.css';\s*$/m);
assert.match(layoutCss, /@media \(max-width: 639px\)/);
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
// The lazily loaded account stylesheet must reserve the same fixed-header
// space after it arrives; otherwise its later CSS would cover the form.
assert.match(portalCss, /\.account-form-wrap\{padding:150px/);
assert.match(portalCss, /@media\(max-width:650px\).*\.account-form-wrap\{padding:160px/s);
assert.match(portalCss, /\.my-account\{padding:150px/);

// The currency menu anchors to the whole actions row; the switch itself must be
// static on phones or the panel clips off the left screen edge.
assert.match(currencyCss, /\.nav-wrap \.nav-actions\s*\{[^}]*position:\s*relative/s);
assert.match(currencyCss, /\.nav-wrap \.nav-actions \.ar7cur-menu\s*\{[^}]*right:\s*0/s);
assert.doesNotMatch(currencyCss, /\.nav-wrap \.nav-actions \.ar7cur-menu\s*\{[^}]*left:\s*50%/s);
assert.match(currencyCss, /@media\s*\(max-width:\s*420px\)/);
assert.match(currencyCss, /@media\s*\(max-width:\s*650px\)/);
assert.match(currencyCss, /@media\s*\(min-width:\s*651px\)\s*and\s*\(max-width:\s*720px\)/);
// The bar is fixed, so the pages under it must reserve its real height: 110px
// on a phone. The old 88px value let the bar sit on top of the hero heading.
assert.match(layoutCss, /\.hero \{\s*padding-top: 122px !important;/);
assert.match(layoutCss, /@media \(max-width: 639px\)[\s\S]*\.page-hero\.mini \{\s*padding-top: 122px !important;/);
assert.match(expandedCss, /\.hero\{padding-top:122px!important/);
assert.match(pagesCss, /@media\(max-width:650px\)\{\.page-hero\{padding-top:122px\}/);
assert.match(currencyCss, /@media\s*\(max-width:\s*899px\)/);
assert.match(html, /preload\"\s+as=\"image\"\s+href=\"\/assets\/lux\/rolls-royce-ghost\.webp\"\s+fetchpriority=\"high\"/);
assert.doesNotMatch(html, /preload\"\s+as=\"image\"[^>]+used-japanese-cars-auction-export-toyota/);
assert.match(main, /DeferredBigGlobe/);
assert.match(main, /loading=\{n===0\?'eager':'lazy'\}/);
assert.match(main, /prefers-reduced-motion/);

// Hero visual: below 1000px the photo, the sample cards, the badge and the
// globe stack as grid rows (photo first, nothing overlapping it) instead of
// layering on top of each other in a fixed-height box.
assert.match(layoutCss, /@media \(max-width: 1000px\)[\s\S]*\.hero \.hero-visual \{[\s\S]*?display: grid/);
assert.match(layoutCss, /\.hero \.hero-visual \.car-main \{[^}]*grid-column: 1 \/ -1/s);
assert.match(layoutCss, /\.hero \.hero-visual \.car-main \{[^}]*order: 1/s);
assert.match(layoutCss, /\.hero \.hero-visual \.floating-card \{[^}]*position: relative/s);
assert.match(layoutCss, /\.hero \.hero-visual \.floating-card \{[^}]*animation: none/s);
assert.match(layoutCss, /\.hero \.hero-visual \.floating-badge \{[^}]*order: 4/s);
assert.match(layoutCss, /\.hero \.hero-visual > \.hero-orb \{[^}]*order: 5/s);
// The hero box must be free to grow: the old 940px cap let the badge and the
// globe spill over the marquee below it.
assert.match(layoutCss, /@media \(max-width: 1000px\)[\s\S]*?\.hero \{\s*max-height: none/);
// On phones each sample card takes the full row and the auction icon can no
// longer be squeezed flat by its nowrap copy.
assert.match(layoutCss, /@media \(max-width: 560px\)[\s\S]*?\.hero \.hero-visual \.floating-card \{\s*grid-column: 1 \/ -1/s);
assert.match(layoutCss, /\.auction-card > svg \{[^}]*flex: 0 0 auto/s);
assert.match(layoutCss, /\.hero-visual \.rotating-card-copy \{[^}]*flex-direction: column/s);
assert.match(layoutCss, /\.hero-visual \.card-foot \{[^}]*margin-top: auto/s);
assert.match(layoutCss, /\.nav-wrap \.navlinks\.open \.inventory-panel:before \{\s*content: 'Inventory'/);
assert.match(layoutCss, /\.nav-wrap \.navlinks\.open \.nav-drop-panel > a \{[^}]*justify-content: flex-start/s);

console.log('Responsive layout and first-paint checks passed.');
