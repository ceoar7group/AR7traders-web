import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const read = path => readFileSync(new URL(path, import.meta.url), 'utf8');
const html = read('../index.html');
const main = read('../src/main.jsx');
const detailCss = read('../src/detail-responsive.css');
const currencyCss = read('../src/currency-responsive.css');

// The pre-React first paint should be a branded loading state, not the SEO
// fallback article. Keep the semantic fallback available when JS is disabled.
assert.match(html, /id="ar7-boot"[^>]*role="status"/);
assert.match(html, /html\.ar7-js #ar7-static-preview\s*\{\s*display:none;/);
assert.match(html, /id="ar7-static-preview"/);
assert.doesNotMatch(html, /Loading the full website/);
assert.match(html, /__ar7BootFallbackTimer/);
assert.match(main, /clearTimeout\(window\.__ar7BootFallbackTimer\)/);

// The detail gallery owns its decorative globe and sheet badge; the detail
// layout must provide explicit tablet and phone rules rather than overflowing.
assert.match(detailCss, /\.detail-gallery\s*\{\s*position:\s*relative;/);
assert.match(detailCss, /@media\s*\(min-width:\s*651px\)\s*and\s*\(max-width:\s*1000px\)/);
assert.match(detailCss, /@media\s*\(max-width:\s*650px\)/);
assert.match(detailCss, /grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
assert.match(detailCss, /overflow-wrap:\s*anywhere/);

// Compact mobile navigation controls keep currency selection separate from
// the brand globe instead of letting fixed-width actions collide.
assert.match(currencyCss, /\.nav-wrap \.brand-group\s*\{[^}]*min-width:\s*0/s);
assert.match(currencyCss, /\.nav-wrap \.nav-actions\s*\{[^}]*flex:\s*0 0 auto/s);
assert.match(currencyCss, /\.nav-wrap \.nav-actions \.ar7cur-btn\s*\{[^}]*height:\s*34px/s);
assert.match(currencyCss, /\.nav-wrap \.nav-actions \.ar7cur-menu\s*\{[^}]*left:\s*50%/s);
assert.match(currencyCss, /@media\s*\(max-width:\s*420px\)/);

console.log('Responsive layout and first-paint checks passed.');
