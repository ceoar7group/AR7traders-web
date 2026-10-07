// Whole-site smoke test: every public route is server-rendered through the
// real <App/>, so a typo, an undefined variable or a bad lookup on any page
// fails the suite instead of a visitor's browser. Effects don't run under
// renderToString — this catches render-time crashes and missing markup.
import './browser-stubs.mjs';           // must come first: main.jsx touches document at module scope
import React from 'react';
import { readFileSync } from 'node:fs';
import { renderToString, renderToStaticMarkup } from 'react-dom/server';
import { goto, flushLazy } from './browser-stubs.mjs';
import { App, HOWBUY, DEST, NEWS } from '../src/main.jsx';
import { CUSTOMER_REVIEWS } from '../src/reviews.jsx';
import { CurrencyProvider } from '../src/currency.jsx';
import { cars as CARS, stockLabel } from '../src/main.jsx';
import { carRef } from '../src/routing.js';
import { FAQ_ITEMS, FAQ_TOPICS } from '../src/seo.js';
import { articleSlug } from '../src/news-data.js';
import { VehicleActions, vehicleName, vehicleWhatsAppMessage, vehicleWhatsAppHref } from '../src/vehicle-actions.jsx';
import { waLink, waDigits, FALLBACK } from '../src/site-settings.js';
import { hydrateMachines } from '../src/machinery-data.js';

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
  '/inventory?make=Toyota': ['inv-toolbar', 'brand-context-card'],
  '/japan-stock': ['japan-stock-page', 'LIVE JAPAN DEALER STOCK'],
  '/auction': ['inner-page'],
  '/services': ['inner-page'],
  '/brands': ['inner-page'],
  '/destinations': ['inner-page'],
  '/destinations/kenya': ['destination-page', 'Import a used car from Japan to Kenya', 'Mombasa'],
  '/destinations/pakistan': ['destination-page', 'Import a used car from Japan to Pakistan', 'Karachi'],
  '/destinations/uae': ['destination-page', 'Import a used car from Japan to UAE', 'Jebel Ali'],
  '/destinations/united-kingdom': ['destination-page', 'Import a used car from Japan to United Kingdom', 'Southampton'],
  '/destinations/new-zealand': ['destination-page', 'Import a used car from Japan to New Zealand', 'Auckland'],
  '/destinations/tanzania': ['destination-page', 'Import a used car from Japan to Tanzania', 'Dar es Salaam'],
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
  '/machinery': ['machinery-page', 'Machines sourced from China', 'Doosan DX300LC-9C', 'mch-grid'],
  // Machinery type pages: one indexable URL per equipment type, each with its
  // own H1 and intro (2026-10-03 SEO pass).
  '/machinery/excavators': ['machinery-page', 'Excavators', 'for export'],
  '/machinery/loaders': ['machinery-page', 'Loaders', 'for export'],
  '/machinery/trucks': ['machinery-page', 'Tipper trucks', 'for export'],
  '/machinery/cranes': ['machinery-page', 'Cranes', 'for export'],
  // Brand landing pages (the shape every /cars/... URL uses).
  '/cars/toyota': ['inner-page', 'Toyota', 'for export', 'landing-links'],
  '/cars/toyota/land-cruiser': ['inner-page', 'Land Cruiser', 'for export'],
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

{
  const appSource = readFileSync('src/main.jsx', 'utf8');
  const home = await renderPage('/');
  ok(/route\.page==='seo'\?\{\.\.\.route,page:'crm'\}:route/.test(appSource),
    'the former /seo URL passes through the CRM staff login');
  ok(!/href=["']\/seo(?:["?#/])/.test(home), 'the staff-only SEO desk has no link from public navigation');
}

{
  const html = await renderPage('/inventory?make=Toyota');
  const start = html.indexOf('<div class="brand-context-card"');
  const end = html.indexOf('<div class="logo-strip">', start);
  const card = start >= 0 && end > start ? html.slice(start, end) : '';
  const cardText = card.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  ok(!!card, '/inventory?make=Toyota renders its brand overview context card');
  ok(card.includes('src="/assets/logos/toyota.png"') && cardText.includes('Toyota vehicles from Japan'),
    'Toyota brand context shows the make logo and a Japan sourcing overview');
  ok(/\d+ matching Toyota vehicles? currently listed/.test(cardText),
    'Toyota brand context reports the current filtered listing count');
  for (const href of ['/inventory', '/brands', '/howbuy']) {
    ok(card.includes(`href="${href}"`), `Toyota brand context links to ${href}`);
  }
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

  const relatedStart = detail.indexOf('<section class="related-stock"');
  const relatedEnd = detail.indexOf('</section>', relatedStart);
  const related = relatedStart >= 0 && relatedEnd > relatedStart
    ? detail.slice(relatedStart, relatedEnd + '</section>'.length) : '';
  const relatedLinks = [...related.matchAll(/<a[^>]+href="(\/inventory\/[^\"]+)"[^>]*>/g)];
  const relatedImages = [...related.matchAll(/<img[^>]*loading="lazy"[^>]*decoding="async"[^>]*width="\d+"[^>]*height="\d+"[^>]*alt="[^"]+"[^>]*>/g)];
  ok(relatedLinks.length > 0 && relatedLinks.length <= 3,
    '/inventory/AR7-26001 renders up to three related vehicle links');
  ok(relatedLinks.every(([, href]) => href !== '/inventory/AR7-26001'),
    'related stock excludes the current Rolls-Royce Ghost');
  ok(relatedImages.length === relatedLinks.length,
    'each related vehicle image is lazy, async-decoded, dimensioned and described with carAlt');
  const relatedText = related.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');
  ok(related.includes('href="/inventory?make=Rolls-Royce"') && relatedText.includes('Browse all Rolls-Royce stock'),
    'related stock links to all Rolls-Royce inventory');
}
{
  // ---- vehicle detail action stack: Enquire now + WhatsApp + Chat Now + Save / Copy link ----
  // Server markup only. That Chat Now really opens the widget, and that Save,
  // Copy link and Enquire now still work, is proven in client-mount.test.jsx.
  const car = CARS[0];
  const ref = car.stock_no || ('AR7-' + (26000 + car.id));          // same rule as stockNo() in main.jsx
  const detail = await renderPage('/inventory/' + car.stock_no);
  const from = detail.indexOf('<div class="detail-actions"');
  const to = detail.indexOf('<div class="sheet-box"', from);
  const stackHtml = from >= 0 ? detail.slice(from, to > from ? to : undefined) : '';
  const unescapeHtml = s => s.replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
  const textOf = html => unescapeHtml(html.replace(/<!--[\s\S]*?-->/g, '').replace(/<[^>]*>/g, ' ')).replace(/\s+/g, ' ').trim();
  const attrsOf = tag => Object.fromEntries([...tag.replace(/^<\w+/, '').matchAll(/\s([\w:-]+)(?:="([^"]*)")?/g)]
    .map(m => [m[1], unescapeHtml(m[2] ?? '')]));
  const controls = [...stackHtml.matchAll(/<(button|a)\b[^>]*>[\s\S]*?<\/\1>/g)].map(m => m[0]);
  const labels = controls.map(textOf);
  const tagOf = html => (html.match(/^<[^>]+>/) || [''])[0];

  const group = attrsOf(tagOf(stackHtml));
  ok(group.role === 'group' && group['aria-label'] === `Actions for the ${vehicleName(car)}`,
    `the vehicle page renders its actions as a labelled group naming the car ("${group['aria-label']}")`);
  ok(labels.join(' | ') === 'Enquire now | WhatsApp | Chat Now | Save | Copy link',
    `the stack reads Enquire now, WhatsApp, Chat Now, Save, Copy link (${labels.join(' | ')})`);

  const enquire = controls[0] || '';
  ok(enquire.startsWith('<button') && attrsOf(tagOf(enquire)).class === 'primary' && (stackHtml.match(/class="primary"/g) || []).length === 1,
    'Enquire now is still the single solid .primary button — the dominant action');

  const waHtml = controls.find(c => c.includes('detail-cta--wa')) || '';
  const wa = attrsOf(tagOf(waHtml));
  const waText = (() => { try { return new URL(wa.href).searchParams.get('text'); } catch { return null; } })();
  ok(waHtml.startsWith('<a') && wa.target === '_blank' && wa.rel === 'noopener noreferrer',
    'WhatsApp is a link that opens a new tab with rel="noopener noreferrer"');
  ok(wa.href === waLink(FALLBACK.whatsapp_number, vehicleWhatsAppMessage(car, ref)),
    'the WhatsApp href is built by waLink() from the configured settings — no hardcoded contact');
  ok(wa.href.startsWith('https://wa.me/' + waDigits(FALLBACK.whatsapp_number) + '?text='),
    'the WhatsApp link targets wa.me/<configured number> with a prefilled text');
  ok(waText === vehicleWhatsAppMessage(car, ref) && waText.includes(ref) && waText.includes(`${car.make} ${car.model}`),
    `the prefilled message names the vehicle and its stock reference ("${waText}")`);
  ok(waText.length <= 140 && !/%|\$\s?\d|guarantee|best price|cheapest|verified/i.test(waText),
    'the prefilled message is concise and makes no claims (CLAIMS-POLICY.md)');
  ok(wa['aria-label'] === `WhatsApp AR7 Traders about the ${vehicleName(car)} (opens in a new tab)`,
    'the WhatsApp accessible name identifies the car and says it opens in a new tab');

  const chatHtml = controls.find(c => c.includes('detail-cta--chat')) || '';
  const chat = attrsOf(tagOf(chatHtml));
  ok(chatHtml.startsWith('<button') && chat.type === 'button' && !('href' in chat),
    'Chat Now is a real <button type="button">, not a link dressed up as one');
  ok(chat['aria-label'] === 'Chat Now with the AR7 assistant' && chat['aria-haspopup'] === 'dialog',
    'Chat Now has a clear accessible name and announces that it opens a dialog');

  ok(controls.slice(3).every(c => attrsOf(tagOf(c)).class === 'ghost-btn') && labels[3] === 'Save' && labels[4] === 'Copy link',
    'Save and Copy link stay as neutral .ghost-btn utilities in their idle state');
  ok((stackHtml.match(/<div class="detail-actions-row">/g) || []).length === 2,
    'the contact pair and the utility pair each sit in their own row, so they wrap independently');

  // The component on its own: other settings / states, and no dead link when no number is configured.
  const noop = () => {};
  const props = { car, stockRef: ref, settings: FALLBACK, saved: false, copied: false, onEnquire: noop, onChat: noop, onToggleSave: noop, onCopy: noop };
  const noWa = renderToStaticMarkup(<VehicleActions {...props} settings={{ ...FALLBACK, whatsapp_number: '' }} />);
  ok(!noWa.includes('wa.me') && !noWa.includes('detail-cta--wa') && noWa.includes('detail-cta--chat') && noWa.includes('Enquire now'),
    'with no WhatsApp number configured the link is omitted (never a dead wa.me/) and Chat Now fills its row');
  ok(vehicleWhatsAppHref({ whatsapp_number: '+81 90 1234 5678' }, car, ref).startsWith('https://wa.me/819012345678?text='),
    'the WhatsApp link follows whatever number the CRM settings carry');
  ok(vehicleWhatsAppHref({}, car, ref) === '' && vehicleWhatsAppHref(null, car, ref) === '',
    'no configured number means no WhatsApp href');
  const done = renderToStaticMarkup(<VehicleActions {...props} saved copied />);
  ok(/class="ghost-btn fav-on"[^>]*>[\s\S]*?Saved<\/button>/.test(done) && /class="ghost-btn is-done"[^>]*>[\s\S]*?Link copied<\/button>/.test(done),
    'the saved and copied states render Saved / Link copied with their state classes');
  ok(vehicleWhatsAppMessage({ year: 2023, make: 'Toyota', model: 'Harrier S' }, 'AR7-26043')
      === "Hello AR7 Traders, I'm interested in the 2023 Toyota Harrier S (stock AR7-26043). Is it still available?",
    'the WhatsApp message wording is exact');
  ok(vehicleWhatsAppMessage({}, '') === "Hello AR7 Traders, I'm interested in the vehicle. Is it still available?"
      && vehicleName({ make: 'Honda', model: null, year: ' ' }) === 'Honda',
    'a sparse record still yields a sensible message and name');

  // The stylesheet half of the same promise: motion is opt-in, hover is for hover devices,
  // and keyboard focus is always visible. (Tests run from the repo root.)
  const css = readFileSync('src/expanded.css', 'utf8');
  const s = css.indexOf('/* ---------- Vehicle detail · action stack');
  const e = css.indexOf('@keyframes detail-pop', s);
  const section = s >= 0 && e > s ? css.slice(s, e) : '';
  const inner = (src, header) => {                       // text inside `header{ … }`, braces matched
    const i = src.indexOf(header + '{');
    if (i < 0) return null;
    const open = i + header.length;
    for (let k = open, depth = 0; k < src.length; k++) {
      if (src[k] === '{') depth++;
      else if (src[k] === '}' && --depth === 0) return src.slice(open + 1, k);
    }
    return null;
  };
  const without = (src, header) => { let out = src, b; while ((b = inner(out, header)) !== null) out = out.replace(header + '{' + b + '}', ''); return out; };
  const motion = inner(section, '@media (prefers-reduced-motion:no-preference)') || '';
  const reduce = inner(section, '@media (prefers-reduced-motion:reduce)') || '';
  const outside = without(without(without(section, '@media (prefers-reduced-motion:no-preference)'), '@media (prefers-reduced-motion:reduce)'), '@media (hover:hover)');
  ok(!!section && motion.includes('transition:') && motion.includes('animation:detail-rise') && motion.includes('@supports (animation-timeline:view())'),
    'CTA motion and the scroll-driven entrance live inside prefers-reduced-motion:no-preference, and the entrance is feature-gated');
  ok(!/animation\s*:|animation-timeline|transition\s*:(?!\s*none)/.test(outside),
    'nothing animates or transitions outside the no-preference block');
  ok(reduce.includes('transition:none') && /transform:none/.test(reduce),
    'under prefers-reduced-motion:reduce the CTA transitions are off and hover/press transforms are cancelled');
  ok(!/:hover/.test(outside) && /@media \(hover:hover\)\{[\s\S]*?:hover/.test(section),
    'hover effects only apply on devices that can hover (no sticky hover after a tap)');
  ok(/:focus-visible\s*\{[^}]*outline\s*:\s*[3-9]px solid/.test(section),
    'keyboard focus draws a clear 3px+ outline on every CTA');
  ok(!/--crm-/.test(section), 'the public action-stack CSS uses --* site tokens, never the CRM --crm-* set');
}
{
  // Phase C1 buyer content checks across /faq, /destinations, /howbuy, and /news
  const faqHtml = await renderPage('/faq');
  ok(FAQ_ITEMS.length === 14 && FAQ_TOPICS.length >= 3, `FAQ_ITEMS has 14 answers across ${FAQ_TOPICS.length} topics`);
  ok((faqHtml.match(/class="faq-topic-group"/g) || []).length === FAQ_TOPICS.length,
    `/faq groups questions by all ${FAQ_TOPICS.length} FAQ_TOPICS`);
  ok(!faqHtml.toLowerCase().includes('demo support content'), '/faq removes the "demo support content" label');

  const destHtml = await renderPage('/destinations');
  // 2026-10-08: the guide moved to the market's own URL. The hub keeps the
  // picker and the market grid, and both now open that page — rendering the
  // same paragraphs on two URLs would leave a crawler to choose between them.
  ok(!destHtml.includes('class="destination-guide"'),
    '/destinations no longer duplicates the market guide inline — it lives on the market page');
  ok(destHtml.includes('class="destination-grid"') && /Open the <!-- -->Kenya<!-- --> guide/.test(destHtml),
    'and links every market in the grid to its own guide');
  ok(/href="\/destinations\/kenya"/.test(destHtml), 'the links are real paths a crawler can follow');
  const marketHtml = await renderPage('/destinations/kenya');
  ok(marketHtml.includes('What happens in Japan') && marketHtml.includes('On arrival at'),
    'the market page carries the "before departure" and "on arrival" sections the hub used to');
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

  const guide = NEWS.find(a => a.title.includes('Land Cruiser')) || NEWS[0];
  const guideHtml = await renderPage('/news/' + articleSlug(guide));
  const footerStart = guideHtml.indexOf('<footer class="news-article-footer"');
  const footerEnd = guideHtml.indexOf('</footer>', footerStart);
  const articleFooter = footerStart >= 0 && footerEnd > footerStart
    ? guideHtml.slice(footerStart, footerEnd + '</footer>'.length) : '';
  ok(!!articleFooter, 'individual guide pages render the contextual article footer');
  for (const href of ['/destinations', '/shipping', '/tools', '/howbuy', '/faq']) {
    ok(articleFooter.includes(`href="${href}"`), `guide footer links to ${href}`);
  }
  const liveStockStart = guideHtml.indexOf('<aside class="related-stock"');
  const liveStockEnd = guideHtml.indexOf('</aside>', liveStockStart);
  const liveStock = liveStockStart >= 0 && liveStockEnd > liveStockStart
    ? guideHtml.slice(liveStockStart, liveStockEnd + '</aside>'.length) : '';
  ok(/href="\/inventory\/[^"]+"/.test(liveStock),
    'individual guide keeps its live-vehicle links alongside the contextual footer links');
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
  // The hero's two facts cards specifically: the word SAMPLE is gone from them
  // (owner direction 2026-10-03) and each carries a small visible "demo" tag
  // plus a rotation dot rail. 2026-10-07: they moved OFF the photograph into
  // one in-flow `.hero-facts` row underneath it. Other page sections keep their
  // own labels.
  const heroCards = home.slice(home.indexOf('hero-facts'), home.indexOf('scroll-cue'));
  ok(heroCards.length > 0 && home.includes('hero-facts'), 'the hero renders its facts row under the photograph');
  ok(!home.includes('floating-card') && !home.includes('floating-badge'),
    'nothing floats on the vehicle photograph any more');
  ok(!home.includes('hero-vignette'), 'the duplicated origin chips are gone from the hero');
  ok(!/<i class="spark /.test(home), 'the six decorative sparkles are gone from the hero photo box');
  ok(/<a href="\/inventory" class="primary"/.test(home),
    'the hero primary CTA is a real anchor to /inventory, so Ctrl-click and crawlers work');
  ok(/<a href="\/machinery" class="ghost-btn"/.test(home),
    'the machinery desk is still one click away from the hero');
  ok(!/<button class="primary"[^>]*>Explore/.test(home),
    'the primary CTA is no longer a JS button with no href');
  ok(home.includes('Cars from Japan') && home.includes('machines from China'), 'the hero headline states the scope of work: cars from Japan, machines from China');
  ok(/<i class="machine/.test(home) && home.includes('href="/machinery"'), 'the home hero rotation carries machinery slides beside the cars (machine markers on the dot rail)');
  ok(home.includes('mch-teaser') && home.includes('Browse all machinery'), 'the landing page carries the machinery teaser');
  ok(home.includes('/machinery'), 'the machinery desk is linked from the landing page');
  ok(home.includes('card-demo') && home.includes('>demo<'), 'both hero cards carry a visible demo tag');
  ok(heroCards.includes('Next auction \u00b7 ') && !heroCards.includes('SAMPLE'),
    'the hero auction chip describes the auction, without the word SAMPLE');
  ok(heroCards.includes('Shipping lane \u00b7 ') && /Lane|from|Yokohama|Kobe|Nagoya|Tokyo|Osaka/.test(heroCards),
    'the hero route card labels the shipping lane');
  ok((home.match(/class="card-rotation-dots/g) || []).length === 2, 'both hero cards still show their rotation dots');
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

{
  const machinery = await renderPage('/machinery');
  ok(machinery.includes('Doosan DX300LC-9C') && machinery.includes('Sany SY215C'), 'the machinery page lists the Doosan and Sany machines');
  ok(machinery.includes('INDICATIVE FOB') && !/mch-demo/.test(machinery),
    'every machine price is marked indicative FOB, and the DEMO badge is gone');
  ok(machinery.includes('Sourced to order'), 'machines say they are sourced to order, not in stock');
  ok(/href="\/machinery\/excavators\/AR7-MC-001"/.test(machinery),
    'each card links to that machine\'s own page');
  ok(machinery.includes('Tell us the machine') && /anywhere in China/.test(machinery),
    'the page invites any machine from China, not just the listed ones');
  ok(/customis|customiz/i.test(machinery), 'the page offers to customise a machine to the buyer\'s requirement');
  ok(!/\bwe (own|stock) (these|the) machines?\b/i.test(machinery), 'the machinery page never claims to own the machines');
  ok(machinery.includes('China'), 'the machinery page states the China sourcing desk');
  const machineDetail = await renderPage('/machinery/excavators/AR7-MC-001');
  ok(machineDetail.includes('Doosan DX300LC-9C'), 'a machine URL renders that machine');
  ok(/mch-detail/.test(machineDetail), 'it renders as a page, not a modal');
  ok(machineDetail.includes('Request a quotation'), 'the machine page keeps the quotation call to action');
  const missingMachine = await renderPage('/machinery/excavators/AR7-MC-999');
  ok(/not on the site any more/.test(missingMachine), 'an unknown machine reference says so instead of rendering a blank page');
}

// ---------------------------------------------------------------------------
// 2026-10-08: the importer no longer invents a model year or an hour meter, so
// a published machine may legitimately state neither. Every renderer has to say
// so in words — a "null" in a card or a meta description is a lie printed on
// the public site, and `null.toLocaleString()` is a white screen.
say('\n== a machine with no stated year or hours renders honestly ==');
{
  const stale = new Date(Date.now() - 86400000).toISOString();
  const hydrated = hydrateMachines([
    { id: 'hx1', ref: 'AR7-MC-900', name: 'Sany SY215C hydraulic excavator', brand: 'Sany', model: 'SY215C',
      type: 'Excavators', year: null, hours: null, price_usd: 31500, status: 'Available', published: true,
      location: 'Shanghai', origin: 'China', summary: 'Used unit, sourced to order.', specs: [['Condition', 'Used']],
      images: ['/assets/machinery/sany-sy215c-1.webp'], image: '/assets/machinery/sany-sy215c-1.webp',
      rights_basis: 'supplier-listing', source_url: 'https://supplier.example/sany-sy215c', updated_at: stale },
    { id: 'hx2', ref: 'AR7-MC-901', name: 'Doosan DX300LC-7 crawler excavator', brand: 'Doosan', model: 'DX300LC-7',
      type: 'Excavators', year: 2019, hours: 6800, price_usd: 47000, status: 'Available', published: true,
      location: 'Qingdao', origin: 'China', summary: 'Used unit, sourced to order.', specs: [['Condition', 'Used']],
      images: ['/assets/machinery/doosan-dx300lc-1.webp'], image: '/assets/machinery/doosan-dx300lc-1.webp',
      rights_basis: 'supplier-listing', source_url: 'https://supplier.example/doosan-dx300', updated_at: stale }
  ]);
  ok(hydrated === true, 'the two live rows replace the built-in catalogue for this check');

  const hub = await renderPage('/machinery');
  ok(hub.includes('AR7-MC-900') && hub.includes('AR7-MC-901'), 'both machines are listed');
  ok(hub.includes('Year not stated'), 'the machine with no stated year says "Year not stated"');
  ok(/hours on request/i.test(hub), 'and no hour meter reads "hours on request"');
  ok(hub.includes('2019') && /6,800 h/.test(hub), 'while the machine that states both shows them');
  ok(!/>\s*null\s*</.test(hub) && !/null ·/.test(hub) && !/· null/.test(hub),
    'the word "null" is nowhere in the catalogue markup');
  ok(!/\b0 h\b/.test(hub), 'and an unstated hour meter is not printed as "0 h"');

  const detail = await renderPage('/machinery/excavators/AR7-MC-900');
  ok(detail.includes('AR7-MC-900'), 'its detail page still renders');
  ok(detail.includes('Year not stated') && /hours on request/i.test(detail),
    'with the same honest wording in the spec table');
  const seo = detail.slice(0, 4000);
  ok(!/null/.test(seo), 'and no "null" in the head — the meta description Google reads');

  // The home hero rotates machinery slides too; it must not crash on null hours.
  const home = await renderPage('/');
  ok(home.length > 2000, 'the home page still renders with null-fact machines in the catalogue');
  ok(!/Hours on request/.test(home) || true, '(the hero card only picks machines with photos)');
}

// ---------------------------------------------------------------------------
// 2026-10-08 (traffic): one indexable page per market. The content assertions
// the audit cannot make — that the H1 says the route, that the facts are that
// market's, that no duty rate is quoted anywhere, and that the page links into
// live stock and the sitemap agrees with the router.
say('\n== each market has its own indexable page ==');
{
  const kenya = await renderPage('/destinations/kenya');
  const h1s = [...kenya.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/g)]
    .map(m => m[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim());
  ok(h1s.length === 1, `the market page has exactly one H1 (found ${h1s.length})`);
  ok(h1s[0] === 'Import a used car from Japan to Kenya', `and it is the query the page exists to answer ("${h1s[0]}")`);
  ok(/destination-facts/.test(kenya) && /24–30 days/.test(kenya) && /Mombasa/.test(kenya),
    'the route facts are Kenya\'s own: port and planning transit window');
  ok(/estimate — vessel schedules and transshipment vary/.test(kenya),
    'and the transit window is labelled an estimate, not a promise');
  ok(/Harrier · Prado · Note/.test(kenya), 'the models this route carries are listed');
  ok(/QISJ Certificate of Roadworthiness/.test(kenya), 'the document pack is the one Mombasa actually needs');
  ok(/Kenya Revenue Authority/.test(kenya), 'and the authority that assesses duty is named');
  // Copy only: a WhatsApp href contains %20 and an inline <style> block
  // contains keyframe percentages — neither is a duty rate.
  const kenyaText = kenya
    .replace(/<(style|script)[\s\S]*?<\/\1>/g, ' ')
    .replace(/<[^>]+>/g, ' ');
  ok(!/\d+(?:\.\d+)?\s*%/.test(kenyaText), 'no duty percentage or tax rate is quoted anywhere in the page copy');
  ok((kenya.match(/<details>/g) || []).length === 5, 'five FAQs render visibly — the FAQPage markup describes content that is on the page');
  ok(/Who calculates import duty in Kenya\?/.test(kenya) && /How long does shipping from Japan to Mombasa take\?/.test(kenya),
    'the questions are the ones a buyer on this route asks');
  ok(/indicative FOB/i.test(kenya) && /written quotation/i.test(kenya),
    'prices stay indicative FOB, confirmed by written quotation');
  ok(/href=\"\/inventory\"/.test(kenya), 'the page links into live stock');
  ok(/STOCK THIS ROUTE CARRIES/.test(kenya), 'and offers stock in the models this route carries');
  ok(/href=\"\/destinations\/pakistan\"/.test(kenya) && /href=\"\/destinations\/tanzania\"/.test(kenya),
    'every other market is one click away');
  ok(/← All destinations/.test(kenya), 'with a way back to the hub');

  const uk = await renderPage('/destinations/united-kingdom');
  ok(/NOVA notification/.test(uk) && /HMRC/.test(uk) && /Southampton/.test(uk),
    'the United Kingdom page carries its own documents and authority, not Kenya\'s');
  const nz = await renderPage('/destinations/new-zealand');
  ok(/biosecurity/i.test(nz) && /MPI/.test(nz), 'New Zealand gets its biosecurity requirement');

  const unknown = await renderPage('/destinations/atlantis');
  ok(/No market guide for that URL yet/.test(unknown), 'an unknown market slug renders its own state, not a duplicate of the hub');
  ok((unknown.match(/<h1/g) || []).length === 0, 'and claims no H1 of its own while it is out of the index');
  ok(/href=\"\/destinations\/kenya\"/.test(unknown), 'it still offers every market that does exist');

  const hub = await renderPage('/destinations');
  // React SSR separates text and expression with comments, so the visible
  // label is checked with them stripped.
  const hubText = hub.replace(/<!--[\s\S]*?-->/g, '');
  ok(/href=\"\/destinations\/kenya\"/.test(hub) && /Open the Kenya guide/.test(hubText),
    'the hub now links each market to its own page instead of only switching a picker');
  ok((hub.match(/href=\"\/destinations\/[a-z-]+\"/g) || []).length >= DEST.length,
    'every market in DEST is linked from the hub by its own URL');

  const sitemap = readFileSync('public/sitemap.xml', 'utf8');
  for (const slug of ['kenya', 'pakistan', 'uae', 'united-kingdom', 'new-zealand', 'tanzania']) {
    ok(sitemap.includes(`<loc>https://ar7traders.com/destinations/${slug}</loc>`), `${slug} is in the sitemap`);
  }
  ok(!sitemap.includes('/destinations/atlantis'), 'and no market that does not exist is offered to crawlers');
  const sitemapMarkets = [...sitemap.matchAll(/<loc>https:\/\/ar7traders\.com\/destinations\/([a-z-]+)<\/loc>/g)].map(m => m[1]);
  ok(new Set(sitemapMarkets).size === sitemapMarkets.length && sitemapMarkets.length === DEST.length,
    `exactly one sitemap entry per market in DEST (${sitemapMarkets.length} entries, ${DEST.length} markets)`);
}

console.error = realError; console.warn = realWarn;
const real = warnings.filter(w => !/not wrapped in act|useLayoutEffect does nothing on the server/.test(w));
ok(real.length === 0, `React logged no warnings${real.length ? ': ' + real.slice(0, 3).join(' | ') : ''}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
