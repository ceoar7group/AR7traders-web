#!/usr/bin/env node
// Language-switch parity guard (npm run test:i18n-switch).
//
//   node scripts/i18n-switch.test.mjs
//
// WHY THIS EXISTS
// ---------------
// The language switcher offers 14 languages. Before the six screens a buyer
// meets first were translated, picking Arabic translated the machinery desk
// and left the hero, the inventory toolbar, the enquiry form, the contact
// block and the footer in English — a page that looked broken rather than
// translated. This suite is the ratchet that stops that drifting back:
//
//   1. every dictionary has exactly the keys English has, and none are empty;
//   2. the trading terms that must never be machine-translated (FOB, CIF,
//      RoRo) survive in Latin script in every language;
//   3. the six translated screens actually call t() rather than hard-coding
//      English, so a translated string is really what renders;
//   4. every t('key') in the source resolves to a real English key — a typo
//      would silently fall back to English and never be noticed.
//
// It prints per-language coverage so a gap is visible rather than silent.
//
// NOTE ON COPY QUALITY: the ps (Pashto), ha (Hausa) and sw (Swahili)
// dictionaries were written by an agent. They are structurally complete but
// need review by a native speaker before being treated as final copy.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name); }
};

// ---- load English (the source of truth) -----------------------------------
// src/i18n.js is not imported directly: it is a browser module and pulling it
// in here would drag React with it. The `en` object is a flat literal, so
// reading the keys and values out of the source is exact and dependency-free.
const i18nSrc = fs.readFileSync(path.join(ROOT, 'src/i18n.js'), 'utf8');
const enBlock = i18nSrc.match(/const en = \{([\s\S]*?)\n\};/);
if (!enBlock) { console.error('✗ could not find the `en` dictionary in src/i18n.js'); process.exit(1); }

const EN = {};
for (const m of enBlock[1].matchAll(/'([a-zA-Z0-9._]+)':\s*("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')/g)) {
  const raw = m[2].slice(1, -1).replace(/\\'/g, "'").replace(/\\"/g, '"').replace(/\\n/g, '\n');
  EN[m[1]] = raw;
}
const EN_KEYS = Object.keys(EN);
console.log(`\n-- English source of truth: ${EN_KEYS.length} keys --`);

const dicts = (await import('../src/i18n-dicts.js')).default;
const LANGS = Object.keys(dicts);

// ---- the language table ---------------------------------------------------
const langTable = [...i18nSrc.matchAll(/\{\s*code:\s*'([a-z]{2})'[\s\S]*?dir:\s*'(ltr|rtl)'\s*\}/g)]
  .map(m => ({ code: m[1], dir: m[2] }));
ok(langTable.length === 14, `LANGUAGES advertises ${langTable.length} languages (English + 13)`);
ok(langTable.every(l => l.code === 'en' || LANGS.includes(l.code)),
  'every advertised language except English has a dictionary');
ok(langTable.filter(l => l.dir === 'rtl').map(l => l.code).sort().join(',') === 'ar,fa,ps,ur',
  'the four RTL languages are ar, fa, ps, ur');

// ---- 1. parity + no empty values -----------------------------------------
console.log('\n-- key parity across the 13 dictionaries --');
let parityBad = 0;
for (const lang of LANGS) {
  const dict = dicts[lang];
  const missing = EN_KEYS.filter(k => !(k in dict));
  const empty = EN_KEYS.filter(k => k in dict && !String(dict[k]).trim());
  const extra = Object.keys(dict).filter(k => !EN_KEYS.includes(k));
  const covered = EN_KEYS.length - missing.length - empty.length;
  const pct = ((covered / EN_KEYS.length) * 100).toFixed(1);
  const clean = !missing.length && !empty.length && !extra.length;
  if (!clean) parityBad++;
  console.log(`  ${clean ? '✓' : '✗'} ${lang}: ${covered}/${EN_KEYS.length} keys (${pct}%)` +
    (missing.length ? ` — missing ${missing.length}: ${missing.slice(0, 4).join(', ')}` : '') +
    (empty.length ? ` — empty ${empty.length}: ${empty.slice(0, 4).join(', ')}` : '') +
    (extra.length ? ` — orphaned ${extra.length}: ${extra.slice(0, 4).join(', ')}` : ''));
}
ok(parityBad === 0, `all ${LANGS.length} dictionaries match English exactly (${EN_KEYS.length} keys, none empty, no orphans)`);

// ---- 2. trading terms stay in Latin script -------------------------------
// FOB, CIF and RoRo are Incoterms / shipping terms. Transliterating them into
// Cyrillic, Arabic or Chinese makes a quotation unrecognisable to the freight
// forwarder who has to honour it, so every language keeps the Latin token.
console.log('\n-- trading terms stay in Latin script --');
const TERMS = ['FOB', 'CIF', 'RoRo'];
let termBad = 0;
for (const term of TERMS) {
  const keysWithTerm = EN_KEYS.filter(k => EN[k].includes(term));
  if (!keysWithTerm.length) { console.log(`  · ${term} does not appear in the English copy — nothing to check`); continue; }
  for (const lang of LANGS) {
    for (const key of keysWithTerm) {
      if (!String(dicts[lang][key]).includes(term)) {
        console.error(`    ${lang}.${key} lost "${term}"`);
        termBad++;
      }
    }
  }
  ok(termBad === 0,
    `${term} survives in all 13 languages (${keysWithTerm.length} key${keysWithTerm.length === 1 ? '' : 's'}: ${keysWithTerm.join(', ')})`);
}

// ---- 3. the six translated screens actually call t() ---------------------
// A dictionary can be complete while the screen still hard-codes English, so
// this pins the call sites rather than the strings.
console.log('\n-- the six buyer-first screens read their copy through t() --');
const mainSrc = fs.readFileSync(path.join(ROOT, 'src/main.jsx'), 'utf8');
const machinerySrc = fs.readFileSync(path.join(ROOT, 'src/machinery.jsx'), 'utf8');
const SCREENS = [
  ['home hero', 'src/main.jsx', mainSrc, 'hero.h1a'],
  ['inventory toolbar', 'src/main.jsx', mainSrc, 'inv.searchPlaceholder'],
  ['enquiry form', 'src/main.jsx', mainSrc, 'enq.h2'],
  ['contact block', 'src/main.jsx', mainSrc, 'contact.getInTouch'],
  ['footer', 'src/main.jsx', mainSrc, 'footer.subscribe'],
  ['machinery "tell us the machine"', 'src/machinery.jsx', machinerySrc, 'machinery.tellUs']
];
for (const [name, file, src, key] of SCREENS) {
  ok(src.includes(`t('${key}')`), `${name} calls t('${key}') (${file})`);
}

// ---- 4. every t('key') in the source resolves ----------------------------
// A typo falls back to English silently at runtime; this makes it a failure.
console.log('\n-- every t() call resolves to a real English key --');
const srcFiles = fs.readdirSync(path.join(ROOT, 'src'))
  .filter(f => /\.(jsx?|js)$/.test(f))
  .map(f => ({ file: 'src/' + f, text: fs.readFileSync(path.join(ROOT, 'src', f), 'utf8') }));
const usedKeys = new Set();
// Keys are always namespaced (`hero.h1a`), which also filters out the
// `t('key')` illustrative mention inside src/i18n.js's own header comment.
for (const { text } of srcFiles) {
  for (const m of text.matchAll(/\bt\(\s*'([a-zA-Z0-9]+(?:\.[a-zA-Z0-9_]+)+)'/g)) usedKeys.add(m[1]);
}
const unknown = [...usedKeys].filter(k => !(k in EN));
ok(unknown.length === 0,
  `all ${usedKeys.size} distinct t() keys in src/ exist in English` +
  (unknown.length ? ` — unknown: ${unknown.join(', ')}` : ''));

// ---- 5. dead weight -------------------------------------------------------
// An English key no screen asks for is dead weight in thirteen dictionaries.
// This is reported rather than failed: at the time the six screens were wired,
// a set of machinery-desk keys already existed in the dictionaries that no
// screen had ever called. Closing that gap is tracked work, and printing the
// list is what stops it growing.
const unused = EN_KEYS.filter(k => !usedKeys.has(k));
console.log(`\n-- keys translated but not yet rendered by any screen --`);
console.log(`  ${EN_KEYS.length - unused.length}/${EN_KEYS.length} English keys are used by a screen`);
if (unused.length) {
  console.log(`  ${unused.length} not yet wired:`);
  for (const k of unused) console.log(`    ${k}`);
}
ok(unused.length <= 31,
  `no MORE than the 31 known machinery/nav keys are left unwired (currently ${unused.length})`);

// ---- 6. RTL: the nine physical leading edges ------------------------------
// The site is built on flex/grid, so setting `dir` flips most of it for free.
// These nine declarations had a physical left/right doing the job of a leading
// edge and did not flip. Each is pinned twice: the override must exist, and the
// physical declaration it overrides must still be there — if someone replaces
// the upstream property with a logical one, the override becomes dead CSS and
// this tells them to delete it rather than leaving both behind.
console.log('\n-- RTL: physical leading edges have an override --');
const rtlCss = fs.readFileSync(path.join(ROOT, 'src/i18n.css'), 'utf8');
const cssSources = ['styles.css', 'expanded.css', 'site-layout.css', 'machinery.css', 'extra-pages.css', 'pages.css']
  .map(f => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')).join('\n');

const RTL_FIXES = [
  ['WhatsApp button position', '.wa-float{', 'right:14px'],
  ['WhatsApp label gap', '.wa-float:hover b{', 'margin-left:10px'],
  ['nav bar asymmetric padding', '.nav{', 'padding:0 14px 0 20px'],
  ['nav dropdown anchor', '.nav-drop-panel{', 'left:50%'],
  ['machine detail table rows', '.mch-detail-specs th,', 'text-align:left'],
  ['"Auction access" nav divider', '.navlinks .auction-link{', 'border-left:1px solid var(--line)'],
  ['FAQ answer indent', '.accordions article>p{', 'padding:0 35px 22px 0'],
  ['services tab active marker', '.service-tabs button.active{', 'padding-left:12px'],
  ['portal sidebar active marker', '.portal-demo aside button.active{', 'border-left:2px solid var(--gold)'],
  ['stat separators', '.demo-strip div{', 'border-right:1px solid #ffffff20'],
  ['nav hover underline origin', '.navlinks a:after,', 'transform-origin:left']
];
let rtlBad = 0;
for (const [name, selector, physical] of RTL_FIXES) {
  // A selector can be declared more than once (base + responsive + theme), so
  // every occurrence is checked rather than only the first match.
  const stillPhysical = cssSources.split(selector).slice(1)
    .some(tail => tail.split('}')[0].includes(physical));
  const hasOverride = rtlCss.includes(`html[dir="rtl"] ${selector.replace(/\{$/, '')}`) ||
    rtlCss.includes(`html[dir="rtl"] ${selector.replace(/\{$/, '').split(',').pop().trim()}`);
  if (!stillPhysical) { console.error(`    ${name}: upstream ${selector} no longer uses ${physical} — delete the override`); rtlBad++; }
  if (!hasOverride) { console.error(`    ${name}: no html[dir="rtl"] override for ${selector}`); rtlBad++; }
}
ok(rtlBad === 0, `all ${RTL_FIXES.length} physical leading edges are overridden for RTL (and none are dead)`);

// ---- coverage report ------------------------------------------------------
console.log('\n-- per-language coverage --');
const identicalAllow = new Set(['footer.newsPlaceholder']);   // an e-mail example, same in every script
for (const lang of LANGS) {
  const dict = dicts[lang];
  const same = EN_KEYS.filter(k => dict[k] === EN[k] && !identicalAllow.has(k) && EN[k].length > 18);
  console.log(`  ${lang}: ${EN_KEYS.length} strings, ${same.length} still identical to English`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
