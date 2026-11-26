// When the decorative globe's 101 KiB chunk is allowed to download.
//
//   npm run test:globe-defer
//
// The orb in the header mounts inside the viewport on every page, so the 320 px
// intersection observer fires immediately and the engine + Natural Earth
// geometry (101 KiB gzipped) loads on idle for a 56 px ornament. On a data
// saver or a 2G/3G connection that is a bad trade, so those visitors get the
// styled shell until they touch the orb. Everything else is unchanged — this
// file pins both halves of that sentence, because "wait for a gesture" is the
// kind of change that silently turns into "never loads" (or "loads anyway").
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'https://ar7traders.com/',
  pretendToBeVisual: true,
});
const g = globalThis;
const setGlobal = (k, v) => {
  try { g[k] = v; } catch { Object.defineProperty(g, k, { value: v, writable: true, configurable: true }); }
};
setGlobal('window', dom.window);
setGlobal('document', dom.window.document);
setGlobal('navigator', dom.window.navigator);
setGlobal('location', dom.window.location);
setGlobal('history', dom.window.history);
setGlobal('Event', dom.window.Event);
setGlobal('CustomEvent', dom.window.CustomEvent);
setGlobal('PointerEvent', dom.window.MouseEvent);
setGlobal('IS_REACT_ACT_ENVIRONMENT', true);
setGlobal('addEventListener', dom.window.addEventListener.bind(dom.window));
setGlobal('removeEventListener', dom.window.removeEventListener.bind(dom.window));
setGlobal('dispatchEvent', dom.window.dispatchEvent.bind(dom.window));
dom.window.matchMedia = dom.window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
setGlobal('matchMedia', dom.window.matchMedia);

// requestIdleCallback is where the chunk import happens, so counting calls is a
// dependency-free proxy for "the download was scheduled".
let idleCalls = 0;
setGlobal('requestIdleCallback', () => { idleCalls += 1; return idleCalls; });
setGlobal('cancelIdleCallback', () => {});

// IntersectionObserver that records its callback so a test can say "now it is
// on screen".
let ioCallbacks = [];
setGlobal('IntersectionObserver', class {
  constructor(cb) { this.cb = cb; this.targets = []; ioCallbacks.push(cb); }
  observe(el) { this.targets.push(el); }
  unobserve() {}
  disconnect() { this.targets = []; }
  takeRecords() { return []; }
});
const showInViewport = () => { for (const cb of ioCallbacks) cb([{ isIntersecting: true }]); };

const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { InteractiveGlobe } = await import('../src/main.jsx');

let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
const bad = s => process.stderr.write(s + '\n');
const ok = (cond, msg) => { if (cond) { pass++; say('  ✓ ' + msg); } else { fail++; bad('  ✗ ' + msg); } };

const connection = value => {
  try { Object.defineProperty(dom.window.navigator, 'connection', { value, configurable: true, writable: true }); }
  catch { dom.window.navigator.connection = value; }
};
const setGlobals = (k, v) => setGlobal(k, v);

/** Mount one globe with a fresh root; returns the orb element and a cleanup. */
async function mount(props) {
  idleCalls = 0;
  ioCallbacks = [];
  const host = document.body.appendChild(document.createElement('div'));
  const root = createRoot(host);
  await act(async () => { root.render(React.createElement(InteractiveGlobe, props)); });
  const orb = host.querySelector('.iglobe');
  return { host, orb, root, unmount: async () => { await act(async () => { root.unmount(); }); host.remove(); } };
}

say('\n-- the classification itself --');
{
  const { connectionHints, shouldDeferDecorative } = await import('../src/net-hints.js');
  const read = nav => connectionHints(nav);
  ok(shouldDeferDecorative(read(undefined)) === false, 'no navigator at all is never treated as slow');
  ok(shouldDeferDecorative(read({})) === false, 'a browser without navigator.connection is never treated as slow');
  ok(shouldDeferDecorative(read({ connection: { effectiveType: '4g' } })) === false, '4g is not deferred');
  for (const t of ['3g', '2g', 'slow-2g']) {
    ok(shouldDeferDecorative(read({ connection: { effectiveType: t } })) === true, `${t} is deferred`);
  }
  ok(shouldDeferDecorative(read({ connection: { effectiveType: '4g', saveData: true } })) === true,
    'a data saver is deferred even on 4g');
  ok(shouldDeferDecorative(read({ mozConnection: { effectiveType: '3g' } })) === true,
    'the prefixed Firefox hint is honoured');
  ok(shouldDeferDecorative(read({ connection: { effectiveType: '4g', saveData: false } })) === false,
    'an explicit saveData=false is not a hint to defer');
}

say('\n-- a data saver or 2G/3G connection: an ornament waits for a gesture --');
for (const [label, conn] of [
  ['saveData on a 4g phone', { effectiveType: '4g', saveData: true }],
  ['3g', { effectiveType: '3g' }],
  ['2g', { effectiveType: '2g' }],
  ['slow-2g', { effectiveType: 'slow-2g' }],
]) {
  connection(conn);
  const { orb, unmount } = await mount({ lite: true });
  await act(async () => { showInViewport(); });
  ok(idleCalls === 0, `${label}: being on screen does not schedule the chunk`);
  await act(async () => { orb.dispatchEvent(new dom.window.Event('pointerdown')); });
  ok(idleCalls === 1, `${label}: touching the orb schedules it exactly once`);
  await act(async () => { orb.dispatchEvent(new dom.window.Event('pointerenter')); });
  ok(idleCalls === 1, `${label}: a second gesture does not schedule it again`);
  await unmount();
}

say('\n-- a fast or unknown connection keeps the old behaviour --');
for (const [label, conn] of [
  ['4g', { effectiveType: '4g' }],
  ['no navigator.connection (Safari)', null],
]) {
  if (conn) connection(conn); else setGlobals('navigator', { language: 'en' });
  const { unmount } = await mount({ lite: true });
  await act(async () => { showInViewport(); });
  ok(idleCalls === 1, `${label}: the orb still loads itself once it is on screen`);
  await unmount();
  setGlobals('navigator', dom.window.navigator);
}

say('\n-- the showcase globe is content, not an ornament: it still loads on approach --');
connection({ effectiveType: '3g' });
{
  const { unmount } = await mount({});
  await act(async () => { showInViewport(); });
  ok(idleCalls === 1, 'the full globe loads when it comes within 320 px, even on 3g');
  await unmount();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
