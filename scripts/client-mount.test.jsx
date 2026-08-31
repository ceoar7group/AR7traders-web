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
dom.window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
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
  ['/', 'Anywhere'],
  ['/inventory', 'inv-toolbar'],
  ['/japan-stock', 'LIVE GOO-NET DEALER STOCK'],
  ['/services', 'AR7 SERVICE'],
  ['/japan-stock', 'LIVE GOO-NET DEALER STOCK'],
  ['/brands', 'brands'],
  ['/tools', 'Calculator'],
  ['/auction', 'AUCTION'],
  ['/shipping', 'One clear route'],
  ['/howbuy', 'Tell us the car'],
  ['/news', 'NEWS'],
  ['/reviews', '★★★★★'],
  ['/faq', 'POPULAR QUESTIONS'],
  ['/about', 'ABOUT'],
  ['/contact', 'Contact'],
  ['/destinations', 'DEMO ROUTE CALCULATOR'],
  ['/world', 'world-page'],
  ['/account', 'AR7'],
  ['/studio', 'AR7'],
  ['/japan-stock', 'LIVE GOO-NET DEALER STOCK'],
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
  const clicked = await clickLink('Japan dealer stock');
  ok(clicked, 'the "Japan dealer stock" header link is clickable');
  ok(location.pathname === '/japan-stock' || document.body.textContent.includes('LIVE GOO-NET DEALER STOCK'),
    'clicking it lands on the Japan dealer stock page');
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
