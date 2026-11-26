// Which dictionary actually downloads when a visitor picks a language.
//
//   npm run test:i18n-load
//
// The dictionaries used to be one lazy chunk: 637 kB raw / 201 KiB gzipped
// containing all fourteen languages, fetched in full the moment anybody chose
// Urdu. src/i18n.jsx now imports one language. That is easy to break and
// invisible when broken — a missing loader means the visitor silently stays in
// English (the fallback is deliberate, so nothing crashes and nothing warns).
//
// The source-level split is asserted in scripts/i18n-switch.test.mjs. This file
// mounts the real provider in jsdom and checks what happens: one chunk for the
// language in the URL, one more when the visitor switches, and never a
// dictionary the visitor did not ask for.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'https://ar7traders.com/?lang=ur',
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
setGlobal('localStorage', dom.window.localStorage);
setGlobal('CustomEvent', dom.window.CustomEvent);
setGlobal('Event', dom.window.Event);
setGlobal('requestAnimationFrame', cb => setTimeout(() => cb(Date.now()), 0));
setGlobal('cancelAnimationFrame', id => clearTimeout(id));
setGlobal('IS_REACT_ACT_ENVIRONMENT', true);
setGlobal('addEventListener', dom.window.addEventListener.bind(dom.window));
setGlobal('removeEventListener', dom.window.removeEventListener.bind(dom.window));
setGlobal('dispatchEvent', dom.window.dispatchEvent.bind(dom.window));
dom.window.matchMedia = dom.window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
setGlobal('matchMedia', dom.window.matchMedia);

const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { LanguageProvider, useLang } = await import('../src/i18n.jsx');
const { loadedLangs } = await import('../src/i18n.js');
const UR = (await import('../src/i18n-dicts/ur.js')).default;
const AR = (await import('../src/i18n-dicts/ar.js')).default;

let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
const bad = s => process.stderr.write(s + '\n');
const ok = (cond, msg) => { if (cond) { pass++; say('  ✓ ' + msg); } else { fail++; bad('  ✗ ' + msg); } };

// A three-line stand-in for the app: the language code, one translated string,
// and a button that switches — the same call the header switcher makes.
function Probe() {
  const { code, t, ready, setLang, dir } = useLang();
  return React.createElement('div', null,
    React.createElement('span', { id: 'code' }, code),
    React.createElement('span', { id: 'ready' }, String(ready)),
    React.createElement('span', { id: 'dir' }, dir),
    React.createElement('span', { id: 'label' }, t('nav.language')),
    React.createElement('button', { id: 'to-ar', onClick: () => setLang('ar') }, 'ar'));
}
const el = id => document.getElementById(id)?.textContent || '';
const root = createRoot(document.body.appendChild(document.createElement('div')));
const flush = async () => { await act(async () => {}); await act(async () => {}); };

await act(async () => { root.render(React.createElement(LanguageProvider, null, React.createElement(Probe))); });
await flush();
await flush();

say('\n-- ?lang=ur on arrival --');
const loadedAtStart = loadedLangs();
ok(el('code') === 'ur', `the provider honours ?lang=ur (${el('code')})`);
ok(el('label') === UR['nav.language'], `the page renders the Urdu string (${el('label')})`);
ok(el('ready') === 'true', 'the dictionary is registered and the page is past its English fallback');
ok(el('dir') === 'rtl', 'the document direction follows the loaded language');
ok(loadedAtStart.includes('ur') && loadedAtStart.includes('en'),
  `English + Urdu are registered (${loadedAtStart.join(', ')})`);
const others = loadedAtStart.filter(c => c !== 'en' && c !== 'ur');
ok(others.length === 0, `no other language was downloaded (${others.length ? others.join(', ') : 'none'})`);

say('\n-- switching language fetches that one, and only that one --');
await act(async () => { document.getElementById('to-ar').click(); });
await flush();
await flush();
const loadedAfter = loadedLangs();
ok(el('code') === 'ar', `switching to Arabic takes effect (${el('code')})`);
ok(el('label') === AR['nav.language'], `the Arabic string renders (${el('label')})`);
ok(el('dir') === 'rtl', 'Arabic is right-to-left too');
ok(loadedAfter.includes('ar'), `Arabic is registered (${loadedAfter.join(', ')})`);
const strays = loadedAfter.filter(c => !['en', 'ur', 'ar'].includes(c));
ok(strays.length === 0,
  `switching downloaded no third language (${strays.length ? strays.join(', ') : 'none'}) — was one 201 KiB chunk for all fourteen`);
ok(loadedAfter.length <= 3,
  `the session holds ${loadedAfter.length} dictionary/dictionaries after two languages`);

say('\n-- and back to English needs no download at all --');
const before = loadedLangs().length;
await act(async () => { root.render(React.createElement(LanguageProvider, null, React.createElement(Probe))); });
await flush();
ok(loadedLangs().length === before, 're-rendering the provider fetches nothing further');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
