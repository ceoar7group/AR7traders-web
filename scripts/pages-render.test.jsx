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
import { cars as CARS } from '../src/main.jsx';

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

for (const [path, markers] of Object.entries(ROUTES)) {
  let html = '';
  try { html = renderPage(path); }
  catch (err) { fail++; bad(`  ✗ ${path} threw: ${err.message}`); continue; }
  pass++; say(`  ✓ ${path} renders (${(html.length / 1024).toFixed(0)} KB of markup)`);
  for (const m of markers) ok(html.includes(m), `${path} contains "${m}"`);
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
  ok(home.includes('Calculators'), 'Calculators is reachable from the More menu');
  ok(home.includes('/japan-stock'), 'Japan dealer stock is linked in the header');
}

console.error = realError; console.warn = realWarn;
const real = warnings.filter(w => !/not wrapped in act|useLayoutEffect does nothing on the server/.test(w));
ok(real.length === 0, `React logged no warnings${real.length ? ': ' + real.slice(0, 3).join(' | ') : ''}`);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
