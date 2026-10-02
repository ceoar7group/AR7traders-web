import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../index.html');
const main = read('../src/main.jsx');
const detailCss = read('../src/detail-responsive.css');
const currencyCss = read('../src/currency-responsive.css');
const portalCss = read('../src/portal.css');
const stylesCss = read('../src/styles.css');
const expandedCss = read('../src/expanded.css');
const crmCss = read('../src/crm.css');

// 2026-10-03 header QA: the burger panel must hang off the bar itself (which
// becomes the positioning parent) so it can neither slide under the two-row
// phone header nor bleed to the viewport edges.
assert.match(stylesCss, /@media\(max-width:1100px\)\{\.nav\{position:relative\}/);
assert.match(expandedCss, /@media\(max-width:1100px\)\{\s*\.nav-drop\{width:100%\}/);
assert.match(stylesCss, /\.navlinks\{position:absolute;top:calc\(100% \+ 10px\);left:0;right:0/);
// The header globe is clipped to its circular button — it previously overflowed
// onto the currency switch and below the bar.
assert.match(expandedCss, /\.brand-group \.nav-orb\{[^}]*overflow:hidden/);
assert.match(expandedCss, /\.brand-group \.nav-orb \.iglobe\{width:100%;margin-top:0\}/);
// The currency menu anchors to the whole actions row; the switch itself must be
// static on phones or the panel clips off the left screen edge.
assert.match(currencyCss, /\.nav-wrap \.nav-actions\s*\{[^}]*position:\s*relative/s);
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

// Compact mobile navigation controls keep currency selection separate from
// the brand globe instead of letting fixed-width actions collide.
assert.match(currencyCss, /\.nav-wrap \.brand-group\s*\{[^}]*min-width:\s*0/s);
assert.match(currencyCss, /\.nav-wrap \.nav-actions\s*\{[^}]*flex:\s*0 0 auto/s);
assert.match(currencyCss, /\.nav-wrap \.nav-actions \.ar7cur-btn\s*\{[^}]*height:\s*34px/s);
assert.match(currencyCss, /\.nav-wrap \.nav-actions \.ar7cur-menu\s*\{[^}]*right:\s*0/s);
assert.doesNotMatch(currencyCss, /\.nav-wrap \.nav-actions \.ar7cur-menu\s*\{[^}]*left:\s*50%/s);
assert.match(currencyCss, /\.nav-wrap \.brand span\s*\{[^}]*overflow:\s*visible/s);
assert.match(currencyCss, /\.nav-wrap \.brand span\s*\{[^}]*text-overflow:\s*clip/s);
assert.match(currencyCss, /@media\s*\(max-width:\s*420px\)/);
assert.match(currencyCss, /@media\s*\(max-width:\s*500px\)/);
assert.match(currencyCss, /grid-template-rows:\s*auto auto/);
assert.match(currencyCss, /@media\s*\(min-width:\s*651px\)\s*and\s*\(max-width:\s*720px\)/);
assert.match(currencyCss, /@media\s*\(max-width:\s*1180px\)/);
assert.match(html, /preload\"\s+as=\"image\"\s+href=\"\/assets\/lux\/rolls-royce-ghost\.webp\"\s+fetchpriority=\"high\"/);
assert.doesNotMatch(html, /preload\"\s+as=\"image\"[^>]+used-japanese-cars-auction-export-toyota/);
assert.match(main, /DeferredBigGlobe/);
assert.match(main, /loading=\{n===0\?'eager':'lazy'\}/);
assert.match(main, /prefers-reduced-motion/);

console.log('Responsive layout and first-paint checks passed.');
