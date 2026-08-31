// Minimal browser globals for SSR-style tests. Import this module FIRST —
// src/main.jsx touches `document` at module scope, so the stubs have to be in
// place before that import runs.
export const store = new Map();

const memStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k),
  clear: () => store.clear()
};

export const loc = {
  pathname: '/', hash: '', search: '', href: 'https://ar7traders.com/',
  origin: 'https://ar7traders.com', assign() {}, replace() {}, reload() {}
};

globalThis.localStorage = { ...memStorage };
globalThis.sessionStorage = { ...memStorage };
globalThis.location = loc;
globalThis.history = { replaceState() {}, pushState() {}, length: 1 };
globalThis.window = globalThis;
globalThis.document = {
  documentElement: { dataset: {}, style: { setProperty() {} }, classList: { add() {}, remove() {}, toggle() {} } },
  body: { classList: { add() {}, remove() {}, toggle() {} }, style: {} },
  head: { appendChild() {}, querySelector: () => null },
  getElementById: () => null,
  querySelector: () => null,
  querySelectorAll: () => [],
  addEventListener() {}, removeEventListener() {},
  createElement: () => ({ setAttribute() {}, appendChild() {}, style: {}, classList: { add() {}, remove() {} } }),
  title: ''
};
globalThis.navigator = { userAgent: 'node', language: 'en-US', onLine: true };
globalThis.addEventListener = () => {};
globalThis.removeEventListener = () => {};
globalThis.scrollTo = () => {};
globalThis.requestAnimationFrame = fn => { fn(0); return 0; };
globalThis.cancelAnimationFrame = () => {};
globalThis.matchMedia = () => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} };
globalThis.fetch = () => Promise.resolve({ ok: false, status: 404, json: async () => ({}), text: async () => '' });

/** Point the stubbed location at a path before rendering. */
export function goto(path) {
  const [pathname, rest = ''] = path.split('?');
  loc.pathname = pathname || '/';
  loc.search = rest ? '?' + rest : '';
  loc.hash = '';
  loc.href = 'https://ar7traders.com' + (pathname || '/') + loc.search;
}
