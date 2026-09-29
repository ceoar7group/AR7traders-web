// Whole-site smoke test: every public route is server-rendered through the
// real <App/>, so a typo, an undefined variable or a bad lookup on any page
// fails the suite instead of a visitor's browser. Effects don't run under
// renderToString — this catches render-time crashes and missing markup.
import './browser-stubs.mjs';           // must come first: main.jsx touches document at module scope
import React from 'react';
import { renderToString } from 'react-dom/server';
import { goto } from './browser-stubs.mjs';
import { App } from '../src/main.jsx';
import { CurrencyProvider } from '../src/currency.jsx';
import { cars as CARS, stockLabel } from '../src/main.jsx';

let pass = 0, fail = 0;
// Write straight to the streams: console.error is stubbed below to catch React
// warnings, and a swallowed failure message is worse than a noisy one.
const say = (s) => process.stdout.write(s + '\n');
const bad = (s) => process.stderr.write(s + '\n');
const ok = (cond, msg) => { if (cond) { pass++; say('  ✓ ' + msg); } else { fail++; bad('  ✗ ' + msg); } };

// Capture anything React logs — an invalid prop or a key warning is a bug.
const warnings = [];
const realError = console.error, realWarn = console.warn;
console.error = (...a) => { warnings.push(String(a[0])); };
console.warn = (...a) => { warnings.push(String(a[0])); };

function renderPage(path) {
  goto(path);
  return renderToString(<CurrencyProvider><App /></CurrencyProvider>);
}

// ---- every route renders ----------------------------------------------------
const ROUTES = {
  '/': ['AR7 Traders', 'hero'],
  '/inventory': ['Find your next', 'inv-toolbar'],
  '/inventory?make=Toyota': ['inv-toolbar'],
  '/japan-stock': ['japan-stock-page', 'LIVE GOO-NET DEALER STOCK'],
  '/auction': ['inner-page'],
  '/services': ['inner-page'],
  '/brands': ['inner-page'],
  '/destinations': ['inner-page'],
  '/tools': ['inner-page'],
  '/world': ['world-page'],
  '/howbuy': ['inner-page'],
  '/news': ['inner-page'],
  '/about': ['inner-page'],
  '/reviews': ['inner-page'],
  '/faq': ['inner-page'],
  '/contact': ['inner-page'],
  '/shipping': ['inner-page'],
  '/account': ['AR7'],
  '/studio': ['AR7']
};

// CLAIMS-POLICY §2/§3: no star ratings on the public site until real, consented
// reviews exist. Star glyphs read as a review score wherever they appear — the
// home/world globe used to float ★★★★★ under every country pop-up.
const ADMIN_ROUTES = new Set(['/account', '/studio']);
const starred = [];
for (const [path, markers] of Object.entries(ROUTES)) {
  let html = '';
  try { html = renderPage(path); }
  catch (err) { fail++; bad(`  ✗ ${path} threw: ${err.message}`); continue; }
  pass++; say(`  ✓ ${path} renders (${(html.length / 1024).toFixed(0)} KB of markup)`);
  for (const m of markers) ok(html.includes(m), `${path} contains "${m}"`);
  if (!ADMIN_ROUTES.has(path) && /[★☆]/.test(html)) starred.push(path);
}
ok(starred.length === 0,
  'no star-rating glyphs (★/☆) on any public page (CLAIMS-POLICY §3)' + (starred.length ? ' — found on ' + starred.join(', ') : ''));
for (const path of ['/', '/world']) {
  const html = renderPage(path);
  ok((html.match(/class="whappy"/g) || []).length >= 8,
    `${path}: the globe still renders its country pop-ups (so the star check above is not vacuous)`);
}

// ---- routing edge cases -----------------------------------------------------
{
  // A real stock number from the catalogue — vehicle pages are the SEO surface,
  // so a deep link must render the car, not the list.
  const stock = CARS[0].stock_no;
  const detail = renderPage('/inventory/' + stock);
  ok(detail.includes('detail-grid') && detail.includes('detail-gallery'),
    `a deep vehicle link (/inventory/${stock}) renders the detail view, not the list`);
  ok(!detail.includes('inv-toolbar'), 'the detail view replaces the inventory toolbar');
}
{
  const bad = renderPage('/this-page-does-not-exist');
  ok(bad.length > 1000, 'an unknown path still renders the shell instead of crashing');
}
{
  goto('/inventory?make=Honda');
  const html = renderToString(<CurrencyProvider><App /></CurrencyProvider>);
  ok(html.includes('Brands'), '?make= inventory renders the header with the Brands dropdown');
}

// ---- the header is present and consistent on every page ---------------------
{
  const home = renderPage('/');
  ok(home.includes('nav-drop-panel more-panel'), 'the More dropdown panel is in the markup');
  ok(home.includes('nav-drop-panel brands-panel'), 'the Brands dropdown panel is in the markup');
  ok(home.includes('nav-drop-panel inventory-panel'), 'the Inventory dropdown panel is in the markup');
  ok(home.includes('Calculators'), 'Calculators is reachable from the More menu');
  ok(home.includes('/japan-stock'), 'Japan dealer stock is linked in the Inventory dropdown');
}

// ---- honest public claims ----------------------------------------------------
// The 900+ figure (owner-directed revision 2026-09-29, previously 1,200+) is
// the founder's career total across various suppliers — never a buyer count
// or rating, and unsupported ratings/stats must not return. Wording revised
// 2026-09-29 to "cars sold, dozens of satisfied customers including car
// businesses."; the same day, at the owner's direction, the small-print
// qualifier line was removed and the label promoted: "cars sold" is a bold
// unit beside the figure and the supporting line highlights its key phrases
// (see CLAIMS-POLICY.md §1). The figure counts up on the client; the server
// markup must always carry the finished stat.
const statBlock = (html, variant) =>
  (html.match(new RegExp(`<div class="founder-stat founder-stat--${variant} [\\s\\S]*?</span></span></div>`)) || [''])[0];
function checkFounderStat(html, variant, where) {
  const block = statBlock(html, variant);
  ok((html.match(new RegExp(`founder-stat--${variant}\\b`, 'g')) || []).length === 1 && block,
    `${where}: exactly one founder stat block`);
  ok(block.includes('is-static') && block.includes('<span class="founder-stat-live">900</span>'),
    `${where}: server markup shows the finished figure (900), not the count's starting 0`);
  ok(block.includes('<span class="sr-only">900+</span>') && block.includes('<span class="founder-stat-count" aria-hidden="true">'),
    `${where}: the real "900+" is readable text; the rolling digits are aria-hidden`);
  ok(block.includes('<sup aria-hidden="true">+</sup>'), `${where}: the gold + renders beside the figure`);
  ok(block.includes('<strong class="founder-stat-unit">cars sold</strong>'), `${where}: "cars sold" is the bold unit beside the figure`);
  ok(block.includes('Dozens of <em>satisfied customers</em>, including <em>car businesses</em>.'),
    `${where}: the supporting line carries the owner-approved words with the key phrases highlighted`);
}
{
  const home = renderPage('/');
  checkFounderStat(home, 'hero', 'home hero');
  checkFounderStat(home, 'world', 'world section');
  ok(!home.includes('Experience gained through various suppliers') && !home.includes('claim-note'),
    'the small-print qualifier line is gone from the home page (owner direction 2026-09-29)');
  ok(!home.includes('class="stats"'), 'no shared .stats block carries the founder figure anymore');
  ok(!home.includes('class="trust-row"'), 'the hero no longer uses the small 13px trust-row stat');
  ok(!home.includes('4.9/5') && !home.includes('Trusted by 1,200+ buyers') && !home.includes('Trusted by 900+ buyers'),
    'no unsupported rating or buyer-count in the home hero');
  ok(!home.includes('98%') && !home.includes('On-time delivery'), 'no unsupported on-time delivery stat on the home page');
  ok(home.includes('SAMPLE AUCTION'), 'the hero auction countdown card is visibly labelled SAMPLE');
  ok(home.includes('SAMPLE ROUTE'), 'the hero route card is visibly labelled SAMPLE');
}
{
  const about = renderPage('/about');
  checkFounderStat(about, 'about', 'about page');
  ok(!about.includes('Experience gained through various suppliers') && !about.includes('claim-note'),
    'the small-print qualifier line is gone from the about page (owner direction 2026-09-29)');
  ok(!about.includes('98%') && !about.includes('Countries served'), 'about page drops the unsupported 98% / countries-served stats');
}
{
  const world = renderPage('/world');
  ok(!world.includes('Markets served') && !world.includes('Vessels at sea'), 'world page drops invented market/fleet counts');
}
{
  const reviews = renderPage('/reviews');
  ok(reviews.includes('Verified Buyer Feedback'), 'reviews page leads with the Verified Buyer Feedback trust card');
  ok(reviews.includes('collecting genuine reviews') && reviews.includes('/contact'),
    'the trust card keeps the transparent gathering notice and a contact route');
  ok(reviews.includes('placeholders, not reviewers'),
    'the trust card discloses that the avatar initials are placeholders, not published reviewers');
  ok(reviews.includes('aria-hidden'), 'the placeholder initials cluster is decorative (aria-hidden)');
  ok(!reviews.includes('★★★★★') && !reviews.includes('Demo customer rating'), 'no fabricated star rating on the reviews page');
  for (const name of ['Ahmed H.', 'Mary K.', 'Daniel O.', 'Saeed A.', 'James M.', 'Fatima K.']) {
    ok(!reviews.includes(name), `no fictional testimonial from ${name}`);
  }
  // New: dozens of placeholder avatars (owner-directed) — still SEO-safe, no ratings, disclosed as placeholders
  ok((reviews.match(/reviews-avatar-item/g) || []).length >= 24, 'reviews page shows dozens of placeholder avatars (≥24) with disclosure, SEO-safe');
  ok(reviews.includes('placeholders for layout only') && reviews.includes('not published reviewers'),
    'global avatar grid is disclosed as placeholders, not reviewers, with no aggregateRating');
  ok(!reviews.includes('aggregateRating') && !reviews.includes('\"Review\"'), 'no Review structured data on /reviews until real consented reviews exist');
}

// ---- honest stock labels (no fabricated auction lot numbers) ------------------
// The homepage dashboard used to render 'LOT 51' + database id + '08', which
// is nonsense for CRM rows with uuid ids. Labels must be a real lot number
// when one exists, otherwise the stock reference.
{
  ok(stockLabel({ id: '9b2f1c3e-0000-4abc-9def-1234567890ab' }) === 'Stock 9b2f1c3e-0000-4abc-9def-1234567890ab',
    'a uuid id gets a plain Stock label — never LOT + id + 08');
  ok(stockLabel({ id: 7, stock_no: 'AR7-26007' }) === 'Stock AR7-26007', 'stock number is used when present');
  ok(stockLabel({ id: 7, stock_no: 'AR7-26007', lot_no: '38214' }) === 'Lot 38214', 'a real lot number wins when the record has one');
  ok(stockLabel(null) === '', 'a missing car renders no label');
  const home = renderPage('/');
  ok(!home.includes('LOT 51') && !home.includes('LOT 28149'), 'homepage dashboard shows no fabricated LOT numbers');
  ok(home.includes('Stock AR7-26'), 'homepage dashboard labels cars by stock reference');
  ok(home.includes('dash-demo-chip') && home.includes('DEMO'), 'homepage dashboard is visibly labelled as a demo');
  const auction = renderPage('/auction');
  ok(!auction.includes('LOT 3821'), 'auction preview shows no invented lot numbers');
  ok(auction.includes('Stock AR7-26'), 'auction preview labels cars by stock reference');
  ok(auction.includes('AUCTION LOTS \u00b7 SAMPLE'), 'auction preview panel is visibly labelled SAMPLE');
}

console.error = realError; console.warn = realWarn;
const real = warnings.filter(w => !/not wrapped in act|useLayoutEffect does nothing on the server/.test(w));
ok(real.length === 0, `React logged no warnings${real.length ? ': ' + real.slice(0, 3).join(' | ') : ''}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
