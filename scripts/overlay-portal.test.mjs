#!/usr/bin/env node
// Guard: a full-screen overlay must be portalled to <body>.
//
// THE TRAP THIS EXISTS FOR
// ------------------------
// `.inner-page` and `.section` carry `content-visibility:auto`
// (src/expanded.css), which implies `contain: layout style paint`. A contained
// element is the containing block for its `position:fixed` descendants, so a
// modal or lightbox rendered inside a page section is NOT positioned against
// the viewport: it is clipped and offset inside that section instead of
// covering the screen. It looks like a broken photo viewer, not like a CSS
// containment problem, which is why it needs a test rather than a memory.
//
// The rule: render it with `createPortal(...)` into `document.body`.
// `src/main.jsx` (the vehicle gallery) does; `src/machinery.jsx` did not, so
// the machinery photo viewer was trapped inside its own page section.
//
// Run: npm run test:overlay-portal
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');
const srcDir = path.join(root, 'src');

let failed = 0;
const ok = (cond, msg) => {
  if (!cond) { failed++; process.stderr.write('FAIL: ' + msg + '\n'); }
  else console.log('ok  :', msg);
};

// ---- 1. every full-screen fixed overlay class the stylesheet defines --------
const cssFiles = readdirSync(srcDir).filter(f => f.endsWith('.css'));
const overlayClasses = new Set();
for (const file of cssFiles) {
  const css = readFileSync(path.join(srcDir, file), 'utf8');
  for (const m of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const body = m[2];
    if (!/position:\s*fixed/.test(body) || !/inset:\s*0/.test(body)) continue;
    for (const cls of m[1].matchAll(/\.([A-Za-z][\w-]*)/g)) overlayClasses.add(cls[1]);
  }
}
ok(overlayClasses.size > 0, `${overlayClasses.size} full-screen fixed overlay class(es) found in src/*.css`);

// Overlays that are deliberately NOT portalled because they are not rendered
// inside a `.inner-page`/`.section` container. Each needs its reason here: a
// new entry is a decision, not a fix.
const OUTSIDE_THE_TRAPPED_CONTAINER = new Map([
  ['modal-backdrop', 'rendered by <App> beside <InnerPage>, not inside a page section (src/main.jsx)'],
  ['grain', 'decorative fixed layer on .site, never inside a page section'],
  ['mch-modal-backdrop', 'declared but unused — the machinery quote flow uses the site-wide modal']
]);

// ---- 2. the components that render inside that container -------------------
const trapped = readdirSync(srcDir)
  .filter(f => f.endsWith('.jsx'))
  .filter(f => /className="inner-page/.test(readFileSync(path.join(srcDir, f), 'utf8')));
ok(trapped.length > 0, `page components rendered inside a content-visibility container: ${trapped.join(', ')}`);

// ---- 3. every overlay those components render must be portalled -------------
const checked = [];
for (const file of trapped) {
  const source = readFileSync(path.join(srcDir, file), 'utf8');
  for (const cls of overlayClasses) {
    const re = new RegExp("className=(?:\"|\\{)[^\"]*\\b" + cls + "(?=[\\s\"'}])", 'g');
    for (const match of source.matchAll(re)) {
      if (OUTSIDE_THE_TRAPPED_CONTAINER.has(cls)) continue;
      // The portal call is in the same JSX expression, just before the element.
      const before = source.slice(Math.max(0, match.index - 400), match.index);
      checked.push({ file, cls, portalled: before.includes('createPortal(') });
    }
  }
}
for (const c of checked) {
  ok(c.portalled, `${c.file}: .${c.cls} is portalled to <body> (content-visibility would trap it inside .inner-page)`);
}
ok(checked.length > 0,
  `${checked.length} overlay render site(s) inside the trapped container were checked — a new overlay cannot skip this rule`);

// ---- 4. and the two real overlays on the machinery page are portalled -------
const machinery = readFileSync(path.join(srcDir, 'machinery.jsx'), 'utf8');
ok(/createPortal\(/.test(machinery), 'the machinery page portals its overlay instead of trapping it');
ok(readFileSync(path.join(srcDir, 'machinery.css'), 'utf8').includes('inset-inline-end:18px'),
  'the lightbox close button is placed with a logical property, so it flips for Arabic, Urdu and Pashto');

if (failed) { process.stderr.write(`\n${failed} check(s) failed.\n`); process.exit(1); }
console.log('\nEvery full-screen overlay inside a content-visibility container is portalled to <body>.');
