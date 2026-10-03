// Client-mount test: the site is rendered with the real react-dom client
// inside jsdom and then actually navigated. Server rendering cannot catch the
// class of bug this exists for — hook-order violations and state that breaks
// when a component re-renders with different props — because SSR only ever
// renders once.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'https://ar7traders.com/',
  pretendToBeVisual: true
});

// Install the jsdom globals before main.jsx is imported: it reads `document`
// at module scope. Some of these (navigator) are getter-only on Node 22.
const g = globalThis;
const setGlobal = (k, v) => {
  try { g[k] = v; }
  catch { Object.defineProperty(g, k, { value: v, writable: true, configurable: true }); }
};
setGlobal('window', dom.window);
setGlobal('document', dom.window.document);
setGlobal('navigator', dom.window.navigator);
setGlobal('location', dom.window.location);
setGlobal('history', dom.window.history);
setGlobal('HTMLElement', dom.window.HTMLElement);
setGlobal('Element', dom.window.Element);
setGlobal('Node', dom.window.Node);
setGlobal('Event', dom.window.Event);
setGlobal('MouseEvent', dom.window.MouseEvent);
setGlobal('CustomEvent', dom.window.CustomEvent);
setGlobal('KeyboardEvent', dom.window.KeyboardEvent);
setGlobal('PopStateEvent', dom.window.PopStateEvent);
setGlobal('getComputedStyle', dom.window.getComputedStyle);
setGlobal('requestAnimationFrame', cb => setTimeout(() => cb(Date.now()), 0));
setGlobal('cancelAnimationFrame', id => clearTimeout(id));
setGlobal('IS_REACT_ACT_ENVIRONMENT', true);

// jsdom does not implement these; the site calls them on navigation.
dom.window.scrollTo = () => {};
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
dom.window.matchMedia = dom.window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
// Records what each observer watches (never fires on its own), so a test can
// scroll one specific element "into view" by calling its callback.
const ioInstances = [];
dom.window.IntersectionObserver = class {
  constructor(cb) { this.cb = cb; this.targets = []; ioInstances.push(this); }
  observe(el) { this.targets.push(el); }
  unobserve() {}
  disconnect() { this.targets = []; }
  takeRecords() { return []; }
};
dom.window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
setGlobal('scrollTo', dom.window.scrollTo);
setGlobal('matchMedia', dom.window.matchMedia);
setGlobal('IntersectionObserver', dom.window.IntersectionObserver);
setGlobal('ResizeObserver', dom.window.ResizeObserver);

// main.jsx calls the bare `addEventListener` global (fine in a browser, where
// it is window's); jsdom only puts it on the window object.
setGlobal('addEventListener', dom.window.addEventListener.bind(dom.window));
setGlobal('removeEventListener', dom.window.removeEventListener.bind(dom.window));
setGlobal('dispatchEvent', dom.window.dispatchEvent.bind(dom.window));

// jsdom ships a real localStorage/sessionStorage for the url we gave it.
setGlobal('localStorage', dom.window.localStorage);
setGlobal('sessionStorage', dom.window.sessionStorage);
setGlobal('fetch', () => Promise.resolve({ ok: false, status: 404, json: async () => ({}), text: async () => '' }));

const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { App } = await import('../src/main.jsx');
const { CurrencyProvider } = await import('../src/currency.jsx');

let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
const bad = s => process.stderr.write(s + '\n');
const ok = (cond, msg) => { if (cond) { pass++; say('  ✓ ' + msg); } else { fail++; bad('  ✗ ' + msg); } };

// Anything React or the app logs as an error is a failure: "rendered fewer
// hooks than expected" surfaces exactly this way.
const errors = [];
const realError = console.error;
console.error = (...a) => { errors.push(a.map(String).join(' ')); };
const crash = () => document.body.textContent.includes('The page failed to load');
// Only ever assert on our own root's markup.
const html = () => document.body.innerHTML;

function newContainer() {
  const el = document.createElement('div');
  document.body.appendChild(el);
  return el;
}

async function boot() {
  const root = createRoot(newContainer());
  await act(async () => { root.render(React.createElement(CurrencyProvider, null, React.createElement(App))); });
  return root;
}

const goto = async (path) => {
  await act(async () => {
    dom.window.history.pushState({}, '', path);
    dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate', { state: {} }));
  });
};

const clickLink = async (selectorText) => {
  const links = [...document.querySelectorAll('a')];
  const el = links.find(a => (a.textContent || '').trim() === selectorText);
  if (!el) return false;
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); });
  return true;
};

const root = await boot();
let unmounted = false;
ok(!crash(), 'the site mounts without the boot error boundary');
ok(document.querySelector('.site'), 'the site shell renders');

// ---- navigate every route, back and forth ----------------------------------
// path -> text that must be on screen once we get there. Without this, a
// navigation that silently fails would pass the "keeps the app alive" check.
const ROUTES = [
  ['/', 'Cars from Japan'],
  ['/inventory', 'inv-toolbar'],
  ['/japan-stock', 'LIVE JAPAN DEALER STOCK'],
  ['/services', 'AR7 SERVICE'],
  ['/machinery', 'Machines sourced from China'],
  ['/japan-stock', 'LIVE JAPAN DEALER STOCK'],
  ['/brands', 'brands'],
  ['/tools', 'Calculator'],
  ['/auction', 'AUCTION'],
  ['/shipping', 'One clear route'],
  ['/howbuy', 'Tell us the car'],
  ['/news', 'NEWS'],
  ['/reviews', 'Verified Buyer Feedback'],
  ['/faq', 'POPULAR QUESTIONS'],
  ['/about', 'ABOUT'],
  ['/contact', 'Contact'],
  ['/destinations', 'DEMO ROUTE CALCULATOR'],
  ['/world', 'world-page'],
  ['/account', 'AR7'],
  ['/studio', 'AR7'],
  ['/portal', 'portal-demo'],
  ['/japan-stock', 'LIVE JAPAN DEALER STOCK'],
  ['/crm', 'crm-'],
  ['/inventory', 'inv-toolbar'],
  ['/services', 'AR7 SERVICE']
];
for (const [path, marker] of ROUTES) {
  await goto(path);
  const markup = document.body.innerHTML;
  ok(!crash(), `navigating to ${path} keeps the app alive`);
  ok(markup.includes(marker), `${path} actually shows its own content ("${marker}")`);
}
ok(errors.filter(e => /hook|Hooks|reusable|rendered fewer/i.test(e)).length === 0,
  `no hook-order violations while navigating${errors.some(e => /hook/i.test(e)) ? ' — ' + errors.find(e => /hook/i.test(e)) : ''}`);

// ---- the header actually drives navigation ---------------------------------
{
  await goto('/');
  // Japan dealer stock is now in the Inventory dropdown
  const invBtn = [...document.querySelectorAll('button')].find(b => (b.textContent || '').trim().startsWith('Inventory'));
  ok(!!invBtn, 'the Inventory dropdown button exists');
  if (invBtn) {
    await act(async () => { invBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    ok(invBtn.getAttribute('aria-expanded') === 'true', 'clicking Inventory sets aria-expanded');
    const jpLink = [...document.querySelectorAll('.inventory-panel a')].find(a => (a.textContent || '').trim() === 'Japan dealer stock');
    ok(!!jpLink, 'Japan dealer stock is in the Inventory dropdown');
    if (jpLink) {
      await act(async () => { jpLink.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
      ok(location.pathname === '/japan-stock' || document.body.textContent.includes('LIVE JAPAN DEALER STOCK'),
        'clicking Japan dealer stock lands on the Japan dealer stock page');
    }
    await act(async () => { document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    ok(invBtn.getAttribute('aria-expanded') === 'false', 'Escape closes the Inventory panel');
  }
  ok(!crash(), 'the app survives the click-driven navigation');
}

// ---- the dropdowns open and close ------------------------------------------
{
  await goto('/');
  const btn = [...document.querySelectorAll('button')].find(b => (b.textContent || '').trim().startsWith('Brands'));
  ok(!!btn, 'the Brands dropdown button exists');
  if (btn) {
    await act(async () => { btn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    ok(btn.getAttribute('aria-expanded') === 'true', 'clicking Brands sets aria-expanded');
    ok(!!document.querySelector('.brands-panel a'), 'the Brands panel lists brand links');
    await act(async () => { document.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    ok(btn.getAttribute('aria-expanded') === 'false', 'Escape closes the Brands panel');
  }
  const moreBtn = [...document.querySelectorAll('.nav-more > button')][0];
  ok(!!moreBtn, 'the More dropdown button exists');
  if (moreBtn) {
    await act(async () => { moreBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    ok(moreBtn.getAttribute('aria-expanded') === 'true' && document.querySelector('.nav-more')?.classList.contains('open'),
      'clicking More opens the More dropdown');
    const destLink = document.querySelector('.more-panel a[href="/destinations"]');
    if (destLink) {
      destLink.focus();
      await act(async () => { destLink.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); });
      ok(moreBtn.getAttribute('aria-expanded') === 'false' && !document.querySelector('.nav-more')?.classList.contains('open'),
        'clicking a dropdown link closes the dropdown on the next page');
      ok(!document.querySelector('.nav-more')?.contains(document.activeElement),
        'clicking a dropdown link blurs focus inside the dropdown so it never stays stuck open');
    }
  }
}

// ---- back navigation from a car details page returns to inventory ----------
{
  const { cars } = await import('../src/main.jsx');
  const stock = cars[0].stock_no;
  // Simulate a tab that was reloaded earlier in its lifetime.
  const origPerf = dom.window.performance.getEntriesByType;
  dom.window.performance.getEntriesByType = type => (type === 'navigation' ? [{ type: 'reload' }] : []);
  try {
    await goto('/inventory/' + encodeURIComponent(stock));
    ok(!!document.querySelector('.detail-page'), 'opening a vehicle renders .detail-page');
    const backBtn = document.querySelector('.detail-page .back-btn');
    ok(!!backBtn, 'vehicle detail page renders the Back to inventory control');
    if (backBtn) {
      await act(async () => { backBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); });
      ok(!document.querySelector('.detail-page') && dom.window.location.pathname === '/inventory',
        'clicking Back to inventory leaves the detail page and returns to /inventory even after a tab reload');
    }
    // Also verify browser Back (popstate) from a vehicle detail page.
    await goto('/inventory/' + encodeURIComponent(stock));
    ok(!!document.querySelector('.detail-page'), 're-opening a vehicle renders .detail-page');
    await goto('/inventory');
    ok(!document.querySelector('.detail-page') && dom.window.sessionStorage.getItem('ar7-open-vehicle') === null,
      'browser Back (popstate) to /inventory closes the vehicle detail page and clears ar7-open-vehicle');
  } finally {
    dom.window.performance.getEntriesByType = origPerf;
  }
}

// ---- the 900+ founder stat counts up once it scrolls into view -------------
// Server markup carries the finished figure (pages suite). On the client the
// stat arms at 0 before first paint, waits for its IntersectionObserver, then
// counts to the final figure and lands in is-done (which pops the gold "+").
{
  await goto('/about');
  const stat = document.querySelector('.founder-stat--about');
  const live = () => stat?.querySelector('.founder-stat-live')?.textContent;
  ok(!!stat && stat.classList.contains('is-armed') && live() === '0',
    `the founder stat waits at 0 until it is scrolled into view (${stat?.className} / ${live()})`);
  ok(stat?.querySelector('.sr-only')?.textContent === '900+', 'screen readers get the real 900+ while the digits are at 0');
  const io = ioInstances.find(o => o.targets.includes(stat));
  ok(!!io, 'the founder stat is watched by an IntersectionObserver');
  if (io) {
    // COUNT_MS (2000) + the 120ms start delay, with margin
    await act(async () => { io.cb([{ isIntersecting: true, target: stat }]); await new Promise(r => setTimeout(r, 2600)); });
    ok(stat.classList.contains('is-done') && live() === '900',
      `scrolled into view, it counts up and lands on 900 (${stat.className} / ${live()})`);
    ok(!!stat.querySelector('.founder-stat-glint'), 'the landing glint overlay renders once the count is done');
  }
  ok(!crash(), 'the app survives the founder-stat count-up');
}

// ---- the /reviews carousel slides and market filters work ------------------
{
  await goto('/reviews');
  const slider = document.querySelector('.reviews-slider');
  const nextBtn = document.querySelector('.slider-ctrl-btn.next');
  const prevBtn = document.querySelector('.slider-ctrl-btn.prev');
  const playBtn = document.querySelector('.slider-ctrl-btn.play-toggle');
  ok(!!slider && !!nextBtn && !!prevBtn && !!playBtn, 'reviews slider and its controls mount on /reviews');
  const activeSlideIdx = () => document.querySelector('.review-slide.is-active')?.getAttribute('data-slide-index');
  ok(activeSlideIdx() === '0', 'reviews slider starts on slide 0');
  await act(async () => { nextBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  ok(activeSlideIdx() === '1' && document.querySelector('.review-slide.is-active')?.classList.contains('dir-next'),
    'clicking Next advances the review slider to slide 1 with dir-next animation class');
  await act(async () => { prevBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  ok(activeSlideIdx() === '0' && document.querySelector('.review-slide.is-active')?.classList.contains('dir-prev'),
    'clicking Prev returns the review slider to slide 0 with dir-prev animation class');
  await act(async () => { playBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
  ok(playBtn.getAttribute('aria-pressed') === 'true' && playBtn.classList.contains('is-paused'),
    'clicking the play/pause toggle pauses auto-slide');
  const bizFilter = [...document.querySelectorAll('.reviews-filter-btn')].find(b => (b.textContent || '').includes('Car Businesses'));
  ok(!!bizFilter, 'Car Businesses filter tab exists on /reviews');
  if (bizFilter) {
    await act(async () => { bizFilter.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true })); });
    const cards = [...document.querySelectorAll('.review-grid-card')];
    ok(cards.length > 0 && cards.every(c => c.classList.contains('is-business-card')),
      'filtering by Car Businesses shows only dealership/trade buyer reviews');
  }
}

// ---- the vehicle page's action stack, driven through the real <App/> --------
// Chat Now must open the existing ChatWidget through its ref (no DOM queries, no
// second chat system); WhatsApp must name the car on screen; and Save, Copy link
// and Enquire now must keep working beside them.
{
  const { cars } = await import('../src/main.jsx');
  const { carRef } = await import('../src/routing.js');
  const written = [];
  Object.defineProperty(dom.window.navigator, 'clipboard', { value: { writeText: async t => { written.push(t); } }, configurable: true });
  const pathFor = c => '/inventory/' + encodeURIComponent(carRef(c));
  const stockRef = c => c.stock_no || ('AR7-' + (26000 + c.id));      // the reference the page itself prints
  const label = el => (el.textContent || '').replace(/\s+/g, ' ').trim();
  const control = text => [...document.querySelectorAll('.detail-actions button, .detail-actions a')].find(el => label(el) === text);
  const click = async el => { await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); }); };
  const panel = () => document.querySelector('.aw-panel');
  const chatInput = () => panel()?.querySelector('input');
  const waLink = () => control('WhatsApp');
  const waText = () => { try { return new URL(waLink()?.getAttribute('href') || '').searchParams.get('text') || ''; } catch { return ''; } };

  await goto(pathFor(cars[0]));
  ok(['Enquire now', 'WhatsApp', 'Chat Now', 'Save', 'Copy link'].every(t => !!control(t)),
    'the vehicle page shows Enquire now, WhatsApp, Chat Now, Save and Copy link');

  // WhatsApp: a new-tab link whose message follows the car on screen (no stale state between vehicles)
  ok(waLink()?.tagName === 'A' && waLink().getAttribute('href').startsWith('https://wa.me/') && waLink().getAttribute('target') === '_blank'
      && /\bnoopener\b/.test(waLink().getAttribute('rel')) && /\bnoreferrer\b/.test(waLink().getAttribute('rel')),
    'WhatsApp is a link to wa.me that opens a new tab with rel="noopener noreferrer"');
  ok(waText().includes(`${cars[0].make} ${cars[0].model}`) && waText().includes(stockRef(cars[0])),
    `its prefilled message names the vehicle on screen and its stock reference (${stockRef(cars[0])})`);
  await goto(pathFor(cars[1]));
  ok(waText().includes(`${cars[1].make} ${cars[1].model}`) && waText().includes(stockRef(cars[1])) && !waText().includes(stockRef(cars[0])),
    `opening another vehicle re-points WhatsApp at it (${stockRef(cars[1])})`);
  await goto(pathFor(cars[0]));

  // Chat Now: opens the real assistant through its ref
  ok(!panel(), 'the chat assistant starts closed');
  const chat = control('Chat Now');
  ok(chat?.tagName === 'BUTTON' && chat.getAttribute('type') === 'button' && !chat.hasAttribute('href'),
    'Chat Now is a real <button type="button">');
  chat.focus();                                   // a mouse click would do this in a browser
  await click(chat);
  ok(!!panel() && panel().getAttribute('role') === 'dialog' && panel().getAttribute('aria-label') === 'AR7 Traders assistant',
    'Chat Now opens the existing ChatWidget panel (role=dialog)');
  ok(!!chatInput() && document.activeElement === chatInput(), 'opening the chat moves focus to its message box');
  ok(document.querySelector('.aw-float')?.getAttribute('aria-expanded') === 'true', 'the floating chat toggle reflects that it is open');
  chat.focus();                                   // pressing the button moves focus onto it, away from the message box
  ok(document.activeElement === chat, 'focus is on the Chat Now button before it is pressed a second time');
  await click(chat);
  ok(document.querySelectorAll('.aw-panel').length === 1 && document.activeElement === chatInput(),
    'pressing Chat Now again keeps a single panel open and refocuses its message box');
  let leaked = false;
  const spy = () => { leaked = true; };
  document.addEventListener('keydown', spy);
  await act(async () => { chatInput().dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
  document.removeEventListener('keydown', spy);
  ok(!panel(), 'Escape closes the chat');
  ok(document.activeElement === chat, 'and hands focus back to the Chat Now button that opened it');
  ok(!leaked, 'Escape inside the chat does not also close whatever sits beneath it');
  await click(document.querySelector('.aw-float'));
  ok(!!panel(), 'the floating chat toggle still opens the same panel');
  await click(document.querySelector('.aw-float'));
  ok(!panel(), 'and still closes it');

  // Save / Copy link / Enquire now keep working
  await click(control('Save'));
  ok(!!control('Saved') && control('Saved').classList.contains('fav-on') && control('Saved').querySelector('svg')?.getAttribute('fill') === 'currentColor',
    'Save still saves the vehicle (Saved, filled heart)');
  await click(control('Saved'));
  ok(!!control('Save') && !control('Saved'), 'and un-saves it again');
  await click(control('Copy link'));
  ok(written.length === 1 && written[0].startsWith(location.origin + '/inventory/') && written[0].includes(encodeURIComponent(carRef(cars[0]))),
    'Copy link still copies this vehicle\'s URL');
  ok(!!control('Link copied') && control('Link copied').classList.contains('is-done'), 'and confirms with "Link copied"');
  await act(async () => { await new Promise(r => setTimeout(r, 1900)); });
  ok(!!control('Copy link') && !control('Link copied'), 'the confirmation resets after a moment');
  await click(control('Enquire now'));
  ok(!!document.querySelector('.modal-backdrop .modal'), 'Enquire now still opens the access modal');
  await click(document.querySelector('.modal .modal-x'));
  ok(!document.querySelector('.modal-backdrop'), 'and the modal closes again');
  ok(!crash(), 'the app survives the whole vehicle-actions walkthrough');
}

// ---- a vehicle deep link survives a reload ---------------------------------
{
  const { cars } = await import('../src/main.jsx');
  const stock = cars[0].stock_no;
  await goto('/inventory/' + encodeURIComponent(stock));
  const body = document.body.textContent;
  ok(!crash(), `the deep link /inventory/${stock} renders`);
  ok(body.includes(cars[0].model), `the deep link shows the car (${cars[0].model}), not just the list`);
  // Reload: unmount, then a fresh root must restore the same car from the URL.
  await act(async () => { root.unmount(); });
  const root2 = createRoot(newContainer());
  await act(async () => { root2.render(React.createElement(CurrencyProvider, null, React.createElement(App))); });
  ok(document.body.textContent.includes(cars[0].model), 'the same deep link still resolves after a remount');
  await act(async () => { root2.unmount(); });
  unmounted = true;
}

console.error = realError;
const real = errors.filter(e => !/not wrapped in act|Not implemented|jsdom/i.test(e));
ok(real.length === 0, `nothing was logged as an error${real.length ? ': ' + real.slice(0, 3).join(' || ').slice(0, 400) : ''}`);

if (!unmounted) await act(async () => { root.unmount(); });
say(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
