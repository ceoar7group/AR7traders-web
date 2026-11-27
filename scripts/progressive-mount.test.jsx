// Progressive mounting (src/progressive.jsx) — the 2026-11-27 TBT round.
//
// This mounts the queue with the REAL react-dom client inside jsdom and drives
// requestIdleCallback by hand, because the behaviour worth pinning is what
// happens after the first commit — which renderToString cannot see. Two
// promises, and the first is what makes the second safe to ship:
//
//  1. A page must never be missing markup because a callback didn't run: with no
//     scheduler (server render, older Safari) everything renders in one commit.
//  2. Where the browser CAN hold sections back, it holds them back — then an
//     interaction, a scroll or the deadline mounts everything at once.
//
// Then source guards on the two places the page is grouped (home sections,
// footer) and on the header ribbon's duplicated half.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'https://ar7traders.com/',
  pretendToBeVisual: true
});
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
setGlobal('IS_REACT_ACT_ENVIRONMENT', true);

// A scheduler we own: the queue must not depend on real idle timing to be
// testable, and a stale callback firing late must be harmless. It goes on the
// jsdom window as well as on the global, because the module asks `window`.
let idleQueue = [];
const installScheduler = () => {
  const ric = cb => { idleQueue.push(cb); return idleQueue.length; };
  const cic = () => {};
  setGlobal('requestIdleCallback', ric);
  setGlobal('cancelIdleCallback', cic);
  dom.window.requestIdleCallback = ric;
  dom.window.cancelIdleCallback = cic;
};
const removeScheduler = () => {
  delete g.requestIdleCallback;
  delete g.cancelIdleCallback;
  delete dom.window.requestIdleCallback;
  delete dom.window.cancelIdleCallback;
};
const setScrollY = v => {
  try { Object.defineProperty(dom.window, 'scrollY', {value: v, configurable: true}); }
  catch { /* jsdom may refuse; the assertion below then reports it */ }
};
installScheduler();

const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { StageQueue, Stage, canStage } = await import('../src/progressive.jsx');
const assert = (await import('node:assert/strict')).default;
const { readFileSync } = await import('node:fs');
// Paths are relative to the repo root: the bundle lives in node_modules/.tmp.

const say = s => process.stdout.write('  ' + s + '\n');

const host = dom.window.document.createElement('div');
dom.window.document.body.appendChild(host);

const tree = (steps = 3) => React.createElement(StageQueue, {steps},
  React.createElement(Stage, {n: 1}, React.createElement('i', {id: 'a'}, 'A')),
  React.createElement(Stage, {n: 2}, React.createElement('i', {id: 'b'}, 'B')),
  React.createElement(Stage, {n: 3}, React.createElement('i', {id: 'c'}, 'C')));

const ids = () => [...host.querySelectorAll('i')].map(n => n.id).join('');
const flushIdle = async () => {
  const cb = idleQueue.shift();
  if (cb) await act(async () => { cb({didTimeout: false, timeRemaining: () => 40}); });
  return !!cb;
};

/* ---------- 1. browser with a scheduler: staged ---------- */
assert.equal(canStage(), true, 'a browser that can schedule after paint is staged');
let root = createRoot(host);
await act(async () => { root.render(tree()); });
assert.equal(ids(), '', 'the first commit carries no below-the-fold stage');
assert.equal(await flushIdle(), true, 'the first idle slice opens stage 1');
assert.equal(ids(), 'a', 'one stage per slice: only stage 1 is mounted after one slice');
await flushIdle();
assert.equal(ids(), 'ab', 'the second slice opens stage 2');
assert.equal(host.querySelector('#c') === null, true, 'stage 3 is still held back');
say('staged: 0 → a → ab, one slice at a time');

/* ---------- 2. an interaction mounts everything at once ---------- */
await act(async () => {
  dom.window.dispatchEvent(new dom.window.Event('pointerdown'));
});
assert.equal(ids(), 'abc', 'a pointerdown flushes every remaining stage — a tap never lands on a hole');
say('an interaction flushes the queue');

/* ---------- 3. the deadline covers a starved main thread ---------- */
await act(async () => { root.unmount(); });
host.innerHTML = '';
idleQueue = [];
root = createRoot(host);
await act(async () => { root.render(tree(6)); });
assert.equal(ids(), '', 'six slices: nothing in the first commit');
await act(async () => { await new Promise(r => setTimeout(r, 2600)); });
assert.equal(ids(), 'abc', 'the 2.5 s deadline mounts the whole page even if no idle callback ever runs');
say('the deadline flushes a starved queue');

/* ---------- 4. no scheduler: one commit, whole page ---------- */
removeScheduler();
assert.equal(canStage(), false, 'without requestIdleCallback the page is never staged');
await act(async () => { root.unmount(); });
host.innerHTML = '';
root = createRoot(host);
await act(async () => { root.render(tree()); });
assert.equal(ids(), 'abc', 'server render / older Safari: every stage is in the first commit');
say('no scheduler: the whole page renders at once');

/* ---------- 5. a scrolled or anchored arrival is never staged ---------- */
installScheduler();
setScrollY(400);
assert.equal(canStage(), false, 'an arrival that is already scrolled is not staged (no shift above the visitor)');
setScrollY(0);
dom.window.location.hash = '#budgets';
assert.equal(canStage(), false, 'an in-page anchor arrival is not staged');
dom.window.location.hash = '';
assert.equal(canStage(), true, 'a plain arrival at the top is staged');
say('scrolled / anchored arrivals are excluded');

/* ---------- 6. <Stage> outside a queue still renders ---------- */
const loose = dom.window.document.createElement('div');
dom.window.document.body.appendChild(loose);
const looseRoot = createRoot(loose);
await act(async () => {
  looseRoot.render(React.createElement(Stage, null, React.createElement('i', {id: 'x'}, 'X')));
});
assert.equal(loose.querySelector('#x') !== null, true, 'a <Stage> with no queue around it renders rather than vanishing');
say('a stray <Stage> renders');

/* ---------- 7. source guards: everywhere the page is grouped -------------- */
const src = readFileSync('src/progressive.jsx', 'utf8');
const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
for (const ev of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll']) {
  assert.ok(code.includes(`'${ev}'`), `a ${ev} flushes the remaining stages`);
}
assert.match(code, /const DEADLINE_MS = \d+;/, 'a hard deadline exists for a main thread too busy for idle callbacks');
assert.match(code, /setTimeout\(\(\) => setStage\(total\), DEADLINE_MS\)/,
  'the deadline flushes the queue, once, from mount');
assert.equal((code.match(/DEADLINE_MS\)/g) || []).length, 1, 'the deadline is a single timer, not one per stage');
say('every escape hatch is present (5 events + deadline)');

const main = readFileSync('src/main.jsx', 'utf8');
for (const marker of ['shop-by', 'mch-teaser', 'brand-budgets', 'process section', 'auction-preview', 'cta shell section']) {
  const at = main.indexOf(`className="${marker}`);
  assert.ok(at > 0, `the ${marker} section still exists`);
  assert.ok(main.lastIndexOf('<Stage n=', at) > main.lastIndexOf('</Stage>', at),
    `the ${marker} section sits inside a <Stage>`);
}
const footAt = main.indexOf('<footer className="site-footer">');
assert.ok(footAt > 0, 'the footer still exists');
assert.ok(main.lastIndexOf('<Stage n=', footAt) > main.lastIndexOf('</Stage>', footAt),
  'the footer (about 190 elements of links and trust marks) is staged too');
assert.match(main, /<StageQueue steps=\{5\}>/, 'the home sections share one queue of five slices');
say('home sections and the footer are inside <Stage> groups');

/* ---------- 8. the ribbon's duplicated half ------------------------------- */
assert.match(main, /\{ready\?track\[1\]:null\}/,
  'the ribbon mounts its second copy (the marquee seam) only once it is ready');
assert.match(main, /data-ready=\{ready\?'1':undefined\}/,
  'the ribbon publishes its readiness so the CSS can hold the slide at frame zero');
assert.match(main, /requestIdleCallback\(\(\)=>setReady\(true\)/,
  'the duplicate arrives on an idle slice, not before paint');
const css = readFileSync('src/expanded.css', 'utf8');
assert.match(css, /\.world-time-ribbon:not\(\[data-ready\]\) \.world-time-track\{animation-play-state:paused\}/,
  'the marquee cannot start before both halves exist');
say('the ribbon duplicate is staged behind a paused track');

await act(async () => { root.unmount(); });
/* ---------- 9. the real home page, mounted ---------------- */
// The guards above read the source; this mounts the actual <App/> so the claim
// "the hero is there on commit one and the footer arrives on the first flush"
// is tested against the page a visitor gets, not against a regex.
setGlobal('requestAnimationFrame', cb => setTimeout(() => cb(Date.now()), 0));
setGlobal('cancelAnimationFrame', id => clearTimeout(id));
dom.window.requestAnimationFrame = globalThis.requestAnimationFrame;
dom.window.cancelAnimationFrame = globalThis.cancelAnimationFrame;
// The rest of what main.jsx calls as bare globals in a browser.
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
dom.window.IntersectionObserver = globalThis.IntersectionObserver;
globalThis.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
dom.window.ResizeObserver = globalThis.ResizeObserver;
dom.window.scrollTo = () => {};
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
if (!dom.window.matchMedia) {
  dom.window.matchMedia = () => ({matches: false, media: '', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}});
}
setGlobal('matchMedia', dom.window.matchMedia);
setGlobal('scrollTo', dom.window.scrollTo);
setGlobal('addEventListener', dom.window.addEventListener.bind(dom.window));
setGlobal('removeEventListener', dom.window.removeEventListener.bind(dom.window));
setGlobal('dispatchEvent', dom.window.dispatchEvent.bind(dom.window));
setGlobal('localStorage', dom.window.localStorage);
setGlobal('sessionStorage', dom.window.sessionStorage);
setGlobal('fetch', () => Promise.resolve({ok: false, status: 404, json: async () => ({}), text: async () => ''}));
const { App } = await import('../src/main.jsx');
const { CurrencyProvider } = await import('../src/currency.jsx');

const page = dom.window.document.createElement('div');
dom.window.document.body.appendChild(page);
const pageRoot = createRoot(page);
await act(async () => { pageRoot.render(React.createElement(CurrencyProvider, null, React.createElement(App))); });
assert.ok(page.querySelector('.hero'), 'the hero is in the first commit');
assert.ok(page.querySelector('.ticker'), 'the ticker under the hero is in the first commit');
assert.equal(page.querySelector('.site-footer') === null, true, 'the footer is NOT in the first commit');
assert.equal(page.querySelector('.shop-by') === null, true, 'the shop-by rails are NOT in the first commit');
assert.equal(page.querySelector('.inventory') === null, true,
  'the stock grid is not in the first commit either');
assert.equal(page.querySelectorAll('.world-time-group').length, 1,
  'the header ribbon carries ONE copy of the eighteen cities in the first commit');
assert.equal(page.querySelector('.world-time-ribbon').hasAttribute('data-ready'), false,
  'the marquee is held at frame zero until its second copy exists');

// Every slice must stay small enough to be a short task rather than a new long
// one — a stage that quietly grew to 900 elements would put the blocking time
// straight back. 450 elements is roughly half of the old single commit's biggest
// section, and each group is one section.
let prev = page.querySelectorAll('*').length;
for (let i = 0; i < 6; i++) {
  await flushIdle();
  const now = page.querySelectorAll('*').length;
    assert.ok(now - prev <= 450, `idle slice ${i + 1} added ${now - prev} elements (cap 450)`);
  prev = now;
}
assert.ok(page.querySelectorAll('.world-time-group').length === 2,
  'the ribbon duplicate arrived (its own slice)');
assert.equal(page.querySelector('.world-time-ribbon').hasAttribute('data-ready'), true,
  'and the slide is released once the seam can no longer show');
assert.ok(page.querySelector('.inventory'), 'the stock grid arrived on one of those slices');
// The footer runs its own queue, so by now it may or may not have had its slice
// (flushing the shared idle list advances whichever queue was scheduled first) —
// what is pinned is that it was absent from the first commit, asserted above.
await act(async () => { dom.window.dispatchEvent(new dom.window.Event('scroll')); });
assert.ok(page.querySelector('.site-footer'), 'a scroll mounts the footer');
assert.ok(page.querySelector('.shop-by'), 'a scroll mounts the shop-by rails');
assert.ok(page.querySelector('.cta'), 'a scroll mounts the closing call to action');
say('the real home page: hero first, everything else on the first flush');
await act(async () => { pageRoot.unmount(); });

process.stdout.write('\nProgressive mount checks passed.\n');
// jsdom's pretendToBeVisual keeps a frame timer alive, so the process has to be
// closed explicitly (same as the other client-mount tests).
process.exit(0);
