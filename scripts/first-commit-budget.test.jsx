// First-commit budget for the home page — the TBT guard.
//
// 2026-11-27: Total Blocking Time was the owner's last orange metric, and its
// cause was one enormous commit: the home page built 2,418 elements before a
// visitor could read the hero. src/progressive.jsx now stages the page, and this
// file is what stops that win from silently rotting — a new section pasted into
// the wrong place, a Stage wrapper deleted during a refactor, or staging quietly
// reverted to a single commit all fail here with numbers rather than a shrug.
//
// The two measurements that matter:
//   staged  — what the browser builds before its first paint (budget below)
//   whole   — what the server render / older-Safari path must still produce, so
//             no content was dropped on the way (it must contain everything)
import './browser-stubs.mjs';
import { readFileSync } from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { goto, flushLazy } from './browser-stubs.mjs';

const say = s => process.stdout.write('  ' + s + '\n');
let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; say('✓ ' + msg); }
  else { fail++; process.stderr.write('  ✗ ' + msg + '\n'); }
};

(async () => {
// A scheduler that exists but never fires: exactly what the browser's FIRST
// commit renders (the idle slices come later, in src/progressive.jsx). It has to
// be in place BEFORE main.jsx is first required, so the import is deferred to
// here rather than hoisted to the top of the bundle.
globalThis.requestIdleCallback = () => 0;
globalThis.cancelIdleCallback = () => {};
const { App } = require('../src/main.jsx');
const { CurrencyProvider } = require('../src/currency.jsx');

const renderHome = async () => {
  goto('/');
  // Prime the lazy route chunks, let them settle, then render for real — the
  // same two-pass trick scripts/pages-render.test.jsx uses.
  renderToStaticMarkup(<CurrencyProvider><App /></CurrencyProvider>);
  await flushLazy();
  return renderToStaticMarkup(<CurrencyProvider><App /></CurrencyProvider>);
};

const count = html => (html.match(/<[a-zA-Z]/g) || []).length;
const has = (html, cls) => new RegExp(`class="${cls}`).test(html);

/* ---------- what the browser builds before the first paint ---------- */
const staged = await renderHome();
const stagedEls = count(staged);
const stagedKb = staged.length / 1024;

// Measured 926 / 59.0 kB when staging landed; the ceiling leaves room for a
// section or two of ordinary growth without letting the old 2,418-element commit
// creep back in.
const ELEMENT_BUDGET = 1050;
const KB_BUDGET = 65;
ok(stagedEls <= ELEMENT_BUDGET, `first commit is ${stagedEls} elements (budget ${ELEMENT_BUDGET})`);
ok(stagedKb <= KB_BUDGET, `first commit is ${stagedKb.toFixed(1)} kB of markup (budget ${KB_BUDGET})`);

/* ---------- and what it must contain, and must NOT ---------- */
ok(has(staged, 'site') && has(staged, 'hero shell'), 'the hero is in the first commit');
ok(has(staged, 'ticker'), 'the auction ticker under the hero is in the first commit');
ok(has(staged, 'motion-showcase'), 'the first section after the hero is in the first commit');
ok(!has(staged, 'inventory shell'), 'the stock grid is staged (it is below the fold)');
ok(!has(staged, 'shop-by'), 'the shop-by rails are staged');
ok(!has(staged, 'mch-teaser'), 'the machinery teaser is staged');
ok(!has(staged, 'brand-budgets'), 'the budget grids are staged');
ok(!has(staged, 'site-footer'), 'the footer is staged');

/* ---------- the whole-page path must still be whole ---------- */
delete globalThis.requestIdleCallback;
delete globalThis.cancelIdleCallback;
const whole = await renderHome();
const wholeEls = count(whole);
for (const [cls, what] of [
  ['inventory shell', 'the stock grid'], ['shop-by', 'the shop-by rails'],
  ['sold-strip', 'the sold strip (when there is sold stock)'], ['mch-teaser', 'the machinery teaser'],
  ['brand-budgets', 'the budget grids'], ['auction-preview', 'the auction preview'],
  ['cta shell', 'the closing call to action'], ['site-footer', 'the footer']
]) {
  if (what.includes('when there is')) continue;   // data-dependent, not a staging question
  ok(has(whole, cls), `no-scheduler render still contains ${what}`);
}
ok(wholeEls >= 2100, `no-scheduler render is still the whole page (${wholeEls} elements)`);
ok(stagedEls / wholeEls <= 0.5,
  `the first commit is ${(100 * stagedEls / wholeEls).toFixed(0)}% of the page, not all of it`);

/* ---------- the queue is what does it (not some other mechanism) ---------- */
const main = readFileSync('src/main.jsx', 'utf8');
ok(/<StageQueue steps=\{5\}>/.test(main), 'the home sections share one queue of five idle slices');
ok((main.match(/<Stage n=\{/g) || []).length >= 9, 'the sections are individually staged');
ok(/ref=\{mountHomeInventory\}/.test(main),
  'the stock grid publishes its node through a callback ref, so its carousel observer attaches when it lands');
ok(/\[page,homeInventoryEl\]/.test(main),
  'the carousel effect depends on that node, not on a one-off look-up at mount');

say(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
})();
