// Render smoke test: CurrencyProvider + switcher + rate manager + badge
// render to static markup without crashing (SSR-style; effects don't run).
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  CurrencyProvider, CurrencySwitcher, CrmCurrencyPicker, RateManager,
  CurrencyAmount, CurrencyBadge, useCurrency, DEFAULT_RATES
} from '../src/currency.jsx';

// Minimal localStorage stub (the provider reads/writes it eagerly).
const store = new Map();
globalThis.localStorage = {
  getItem: k => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: k => store.delete(k)
};
globalThis.fetch = () => Promise.resolve({ ok: false, json: async () => ({}) });

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error('FAIL:', msg); } else console.log('ok  :', msg); };

function Probe() {
  const { fmt, fmtIn, toUsd, convert, display, rates } = useCurrency();
  ok(display === 'USD', `default display is USD (${display})`);
  ok(fmt(58900) === '$58,900', `fmt() in base (${fmt(58900)})`);
  ok(convert(100, 'JPY') === 100 * DEFAULT_RATES.JPY, 'convert via ctx');
  ok(Math.abs(toUsd(15500, 'JPY') - 100) < 1e-9, 'toUsd via ctx');
  ok(fmtIn(2400000, 'JPY') === '¥2,400,000', 'fmtIn no-conversion');
  ok(rates && rates.JPY === DEFAULT_RATES.JPY, 'rates present in ctx');
  return null;
}

const html1 = renderToString(
  <CurrencyProvider>
    <Probe />
    <CurrencySwitcher />
    <CrmCurrencyPicker />
    <RateManager token="x" canEdit={true} notify={() => {}} />
    <CurrencyAmount />
    <CurrencyBadge record={{ currency: 'JPY', amount_original: 2400000, fx_rate: 155 }} />
  </CurrencyProvider>
);
ok(html1.includes('ar7cur-switch'), 'switcher markup rendered');
ok(html1.includes('ar7cur-crm-pill'), 'crm picker rendered');
ok(html1.includes('Exchange rate manager'), 'rate manager rendered');
ok(html1.includes('ar7cur-amount'), 'currency amount field rendered');
ok(html1.includes('¥2,400,000'), 'original-currency badge rendered');
ok(html1.includes('1 USD ='), 'rate rows show 1 USD =');

// A record in USD should render NO badge
const html2 = renderToString(
  <CurrencyProvider>
    <CurrencyBadge record={{ currency: 'USD', amount: 100 }} />
  </CurrencyProvider>
);
ok(!html2.includes('ar7cur-badge'), 'no badge for base-currency records');

// Missing provider → graceful fallback context
const html3 = renderToString(<CurrencyBadge record={{ currency: 'JPY', amount_original: 2400000, fx_rate: 155 }} />);
ok(html3.includes('¥2,400,000'), 'badge works without provider (fallback rates)');

console.log(failed ? `\n${failed} FAILURE(S)` : '\nALL PASS');
process.exit(failed ? 1 : 0);
