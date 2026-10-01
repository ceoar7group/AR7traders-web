// Whole-site smoke test: every public route is server-rendered through the
// real <App/>, so a typo, an undefined variable or a bad lookup on any page
// fails the suite instead of a visitor's browser. Effects don't run under
// renderToString — this catches render-time crashes and missing markup.
import './browser-stubs.mjs';           // must come first: main.jsx touches document at module scope
import React from 'react';
import { renderToString } from 'react-dom/server';
import { goto, flushLazy } from './browser-stubs.mjs';
import { App, HOWBUY, DEST, NEWS } from '../src/main.jsx';
import { CUSTOMER_REVIEWS } from '../src/reviews.jsx';
import { CurrencyProvider } from '../src/currency.jsx';
import { cars as CARS, stockLabel } from '../src/main.jsx';
import { carRef } from '../src/routing.js';
import { FAQ_ITEMS, FAQ_TOPICS } from '../src/seo.js';
import { articleSlug } from '../src/news-data.js';

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

async function renderPage(path) {
  goto(path);
  // React.lazy only starts loading a boundary once it has been rendered, and
  // renderToString cannot await. So: render once to prime every boundary this
  // route uses, let the promises settle, then render again — the second pass
  // emits the real page markup rather than the Suspense fallback.
  renderToString(<CurrencyProvider><App /></CurrencyProvider>);
  await flushLazy();
  return renderToString(<CurrencyProvider><App /></CurrencyProvider>);
}

// The route-level React.lazy boundaries are resolved once, up front: after
// this every renderToString below sees the real page markup, not a fallback.
(async () => {
await flushLazy();

// ---- every route renders ----------------------------------------------------
const ROUTES = {
  '/': ['AR7 Traders', 'hero'],
  '/inventory': ['Find your next', 'inv-toolbar'],
  '/inventory?make=Toyota': ['inv-toolbar'],
  '/japan-stock': ['japan-stock-page', 'LIVE JAPAN DEALER STOCK'],
  '/auction': ['inner-page'],
  '/services': ['inner-page'],
  '/brands': ['inner-page'],
  '/destinations': ['inner-page'],
  '/tools': ['inner-page'],
  '/world': ['world-page'],
  '/howbuy': ['inner-page'],
  '/news': ['inner-page'],
  '/news/why-land-cruiser-demand-keeps-climbing-in-pakistan': ['news-article', 'Why Land Cruiser demand keeps climbing in Pakistan'],
  '/news/auction-sheet-decoded-what-r-a-and-4-5-really-mean': ['news-article', 'Auction sheet decoded: what R, A and 4.5 really mean'],
  '/news/roro-vs-container-which-shipping-method-fits-your-car': ['news-article', 'RoRo vs container: which shipping method fits your car?'],
  '/news/how-online-bidding-works-with-ar7': ['news-article', 'How online bidding works with AR7'],
  '/about': ['inner-page'],
  '/reviews': ['inner-page'],
  '/faq': ['inner-page'],
  '/contact': ['inner-page'],
  '/shipping': ['inner-page'],
  '/account': ['AR7'],
  '/studio': ['AR7'],
  // /portal is in PAGES and in the vercel.json rewrites, so it is a real
  // public route — it was the only one neither route suite visited.
  '/portal': ['portal-demo', 'CLIENT PORTAL DEMO']
};

for (const [path, markers] of Object.entries(ROUTES)) {
  let html = '';
  try { html = await renderPage(path); }
  catch (err) { fail++; bad(`  ✗ ${path} threw: ${err.message}`); continue; }
  pass++; say(`  ✓ ${path} renders (${(html.length / 1024).toFixed(0)} KB of markup)`);
  for (const m of markers) ok(html.includes(m), `${path} contains "${m}"`);
}

// ---- routing edge cases -----------------------------------------------------
{
  // A real stock number from the catalogue — vehicle pages are the SEO surface,
  // so a deep link must render the car, not the list.
  const stock = CARS[0].stock_no;
  const detail = await renderPage('/inventory/' + stock);
  ok(detail.includes('detail-grid') && detail.includes('detail-gallery'),
    `a deep vehicle link (/inventory/${stock}) renders the detail view, not the list`);
  ok(!detail.includes('inv-toolbar'), 'the detail view replaces the inventory toolbar');
  ok(detail.includes('class="buyer-guide"') && (detail.match(/class="buyer-guide-step"/g) || []).length === 5,
    'vehicle detail page renders BuyerGuide with 5 ordered steps from enquiry to port');
  ok(detail.includes('FOB (Free on Board)') && detail.includes('CIF (Cost, Insurance &amp; Freight)'),
    'BuyerGuide explains FOB vs CIF in plain language');
  ok(detail.includes('customs authority’s decision') && !/\b(48|25|10|5)%/.test(detail.split('class="buyer-guide"')[1] || ''),
    'BuyerGuide states duty is your own customs authority’s decision and quotes no duty rate');
  for (const href of ['/howbuy', '/shipping', '/faq']) {
    ok(detail.includes(`href="${href}"`), `BuyerGuide links to ${href}`);
  }
  ok(!detail.includes('Auction sheet included') && detail.includes('Inspection photos &amp; condition records'),
    'vehicle without auction_sheet evidence uses honest non-auction-sheet condition wording');
  // Temporarily set auction_sheet on CARS[0] to verify the conditional branch
  CARS[0].auction_sheet = true;
  const detailWithSheet = await renderPage('/inventory/' + stock);
  delete CARS[0].auction_sheet;
  ok(detailWithSheet.includes('Auction sheet included') && detailWithSheet.includes('Translated auction inspection sheet'),
    'vehicle with auction_sheet evidence renders the auction-sheet condition wording');
}
{
  // Phase C1 buyer content checks across /faq, /destinations, /howbuy, and /news
  const faqHtml = await renderPage('/faq');
  ok(FAQ_ITEMS.length === 14 && FAQ_TOPICS.length >= 3, `FAQ_ITEMS has 14 answers across ${FAQ_TOPICS.length} topics`);
  ok((faqHtml.match(/class="faq-topic-group"/g) || []).length === FAQ_TOPICS.length,
    `/faq groups questions by all ${FAQ_TOPICS.length} FAQ_TOPICS`);
  ok(!faqHtml.toLowerCase().includes('demo support content'), '/faq removes the "demo support content" label');

  const destHtml = await renderPage('/destinations');
  ok(destHtml.includes('class="destination-guide"') && destHtml.includes('What to expect in Japan') && destHtml.includes('On arrival at'),
    '/destinations renders the selected market guide with "what to expect" and "on arrival" sections');
  ok(destHtml.includes('planning figure') && !/\b(48|25|10|5)%/.test(destHtml),
    '/destinations labels transit as a planning figure and quotes no duty percentage');

  const howbuyHtml = await renderPage('/howbuy');
  ok(Array.isArray(HOWBUY) && HOWBUY.length === 8 && HOWBUY.every(s => s.length === 4 && s[3]),
    'HOWBUY is exported with a 4th element ("what actually happens") per step');
  ok((howbuyHtml.match(/class="hb-what"/g) || []).length === HOWBUY.length,
    '/howbuy renders the 4th element for every step');
  ok(!howbuyHtml.includes('auction sheet-verified condition'),
    '/howbuy step 05 drops universal auction-sheet-verification wording');

  const newsHtml = await renderPage('/news');
  ok(newsHtml.includes('news-filter-bar') && newsHtml.includes('>All guides</button>'),
    '/news renders the topic filter bar with "All guides" reset');
  for (const a of NEWS) {
    const slug = articleSlug(a);
    ok(newsHtml.includes(`href="/news/${slug}"`), `/news index links to /news/${slug} via <a href>`);
  }
  const missingGuide = await renderPage('/news/not-a-real-guide');
  ok(missingGuide.includes('article-missing') && missingGuide.includes('Guide not found'),
    'an unknown /news/<slug> renders the Guide not found state');
}
{
  const bad = await renderPage('/this-page-does-not-exist');
  ok(bad.length > 1000, 'an unknown path still renders the shell instead of crashing');
}
{
  goto('/inventory?make=Honda');
  await flushLazy();
  const html = renderToString(<CurrencyProvider><App /></CurrencyProvider>);
  ok(html.includes('Brands'), '?make= inventory renders the header with the Brands dropdown');
}

// ---- internal links into live stock -----------------------------------------
// The guide, brand, tool and news pages used to end at a "talk to our team"
// modal with no route through to an actual car, so whole sections of the site
// had no link to the inventory detail pages a crawler has to reach. Every one
// of them now carries a "related stock" block whose links point at cars from
// the same `cars` array the /inventory grid renders — so the destination
// always exists, and if there is no stock the block renders nothing.
{
  // carRef is what the detail page and the sitemap both use (stock number when
  // present, otherwise the row id) — stockLabel is a human-facing caption.
  const liveRefs = new Set(CARS.map(c => '/inventory/' + encodeURIComponent(carRef(c))));
  const PAGES = [
    ['/news', 'the news & guides index'],
    ['/brands', 'the browse-by-brand page'],
    ['/faq', 'the help centre'],
    ['/services', 'the services page'],
    ['/destinations', 'the destinations page'],
    ['/howbuy', 'the how-it-works guide'],
    ['/tools', 'the calculators page']
  ];
  for (const [route, label] of PAGES) {
    const html = await renderPage(route);
    const links = [...html.matchAll(/href="(\/inventory\/[^"]+)"/g)].map(m => m[1]);
    ok(links.length > 0, `${label} links into live inventory (${links.length} link(s))`);
    ok(links.some(l => liveRefs.has(l)),
      `${label} links to a car that is actually in the inventory list`);
    ok(links.every(l => !/goo-?net/i.test(l)), `${label} links stay on our own domain paths`);
  }
  // The links must be real <a href> values, not click-only handlers: a crawler
  // (and a visitor who opens one in a new tab) needs the URL.
  const news = await renderPage('/news');
  ok((news.match(/href="\/inventory\/[^"]+"/g) || []).length >= 3,
    'the news index carries several distinct stock links');

  // And the pictures on those links must be described, not just "Honda Vezel"
  // repeated down the page — a screen-reader user has to be able to tell two
  // cards of the same model apart. See src/car-alt.js.
  const alts = [...news.matchAll(/<img[^>]*alt="([^"]*)"/g)].map(m => m[1])
    .filter(a => /\b(19|20)\d{2}\b/.test(a) || a.includes(' in '));
  ok(alts.length >= 3,
    `vehicle photos carry a descriptive alt with the year (${alts.length} found)`);
  ok(alts.every(a => a.length > 10), 'every descriptive alt names more than just the make');
}

// ---- the header is present and consistent on every page ---------------------
{
  const home = await renderPage('/');
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
  const home = await renderPage('/');
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
  const about = await renderPage('/about');
  checkFounderStat(about, 'about', 'about page');
  ok(!about.includes('Experience gained through various suppliers') && !about.includes('claim-note'),
    'the small-print qualifier line is gone from the about page (owner direction 2026-09-29)');
  ok(!about.includes('98%') && !about.includes('Countries served'), 'about page drops the unsupported 98% / countries-served stats');
}
{
  const world = await renderPage('/world');
  ok(!world.includes('Markets served') && !world.includes('Vessels at sea'), 'world page drops invented market/fleet counts');
}
{
  const reviews = await renderPage('/reviews');
  ok(reviews.includes('reviews-slider') && reviews.includes('reviews-slider-track'),
    'reviews page renders the interactive slide-animated review carousel');
  ok((reviews.match(/class="review-slide(\s|")/g) || []).length === CUSTOMER_REVIEWS.length && CUSTOMER_REVIEWS.length >= 10,
    `reviews carousel renders all ${CUSTOMER_REVIEWS.length} buyer story slides in server markup for SEO`);
  ok(reviews.includes('reviews-marquee-track'), 'reviews page renders the continuous shipment & review marquee');
  ok((reviews.match(/review-grid-card/g) || []).length === CUSTOMER_REVIEWS.length,
    'reviews explorer grid renders all customer review cards by default');
  ok(reviews.includes('Car Businesses &amp; Dealers') && CUSTOMER_REVIEWS.some(r => r.isBusiness),
    'reviews include repeat car businesses / dealership buyers alongside private buyers');
  for (const kw of ['USS Tokyo', 'Goo-net', 'QISJ', 'RoRo', 'Port Qasim', 'Southampton', 'Jebel Ali', 'Mombasa', 'Dar es Salaam', 'Auckland']) {
    ok(reviews.includes(kw), `reviews page carries researched SEO keyword "${kw}"`);
  }
  ok(reviews.includes('Verified Buyer Feedback'), 'reviews page includes the Verified Buyer Feedback trust card');
  ok(reviews.includes('collecting genuine reviews') && reviews.includes('/contact'),
    'the trust card keeps the transparent gathering notice and a contact route');
  ok(reviews.includes('placeholders, not reviewers'),
    'the trust card discloses that the avatar initials are placeholders, not published reviewers');
  ok(reviews.includes('aria-hidden'), 'the placeholder initials cluster is decorative (aria-hidden)');
  ok(!reviews.includes('★★★★★') && !reviews.includes('Demo customer rating'), 'no fabricated star rating on the reviews page');
  for (const name of ['Ahmed H.', 'Mary K.', 'Daniel O.', 'Saeed A.', 'James M.', 'Fatima K.']) {
    ok(!reviews.includes(name), `no fictional testimonial from ${name}`);
  }
  // Dozens of placeholder avatars (owner-directed) — still SEO-safe, no ratings, disclosed as placeholders
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
  const home = await renderPage('/');
  ok(!home.includes('LOT 51') && !home.includes('LOT 28149'), 'homepage dashboard shows no fabricated LOT numbers');
  ok(home.includes('Stock AR7-26'), 'homepage dashboard labels cars by stock reference');
  ok(home.includes('dash-demo-chip') && home.includes('DEMO'), 'homepage dashboard is visibly labelled as a demo');
  const auction = await renderPage('/auction');
  ok(!auction.includes('LOT 3821'), 'auction preview shows no invented lot numbers');
  ok(auction.includes('Stock AR7-26'), 'auction preview labels cars by stock reference');
  ok(auction.includes('AUCTION LOTS \u00b7 SAMPLE'), 'auction preview panel is visibly labelled SAMPLE');
}

console.error = realError; console.warn = realWarn;
const real = warnings.filter(w => !/not wrapped in act|useLayoutEffect does nothing on the server/.test(w));
ok(real.length === 0, `React logged no warnings${real.length ? ': ' + real.slice(0, 3).join(' | ') : ''}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
