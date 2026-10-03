// Whole-site UI audit: renders every public route through the real <App/> and
// then inspects the markup the way a browser and a screen reader would.
//
// The page smoke test (pages-render.test.jsx) answers "does it render". This
// suite answers the next question: is what rendered actually usable — by a
// keyboard, by a screen reader, on a slow connection, on a small phone. It
// runs on every route, so a new page cannot quietly ship an unlabelled control,
// an image that jumps the layout, or a click handler no keyboard can reach.
//
//   npm run test:ui-audit              fails on any finding
//   npm run test:ui-audit -- --report  prints the findings, always exits 0
import './browser-stubs.mjs';
import React from 'react';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { renderToString } from 'react-dom/server';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { goto, flushLazy } from './browser-stubs.mjs';
import { App } from '../src/main.jsx';
import { CurrencyProvider } from '../src/currency.jsx';

// Bundled to CJS by the npm script, where import.meta.url is undefined.
const root = (() => {
  try { return path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..'); }
  catch { return process.cwd(); }
})();
const REPORT_ONLY = process.argv.includes('--report');

let violations = 0;
const findings = new Map();
const note = (check, route, detail) => {
  if (!findings.has(check)) findings.set(check, []);
  findings.get(check).push({ route, detail });
  violations++;
};

const ROUTES = [
  '/', '/inventory', '/inventory?make=Toyota', '/japan-stock', '/auction',
  '/services', '/brands', '/destinations', '/tools', '/world', '/howbuy',
  '/news', '/news/why-land-cruiser-demand-keeps-climbing-in-pakistan',
  '/about', '/reviews', '/faq', '/contact', '/shipping', '/machinery',
  '/machinery/excavators', '/machinery/loaders', '/machinery/trucks',
  '/machinery/cranes', '/cars/toyota', '/cars/toyota/land-cruiser',
  // One machine's own page, and a reference that no longer exists — the second
  // is a real page too (it says the machine is gone and offers the desk).
  '/machinery/excavators/AR7-MC-001', '/machinery/excavators/AR7-MC-999',
  '/account', '/portal', '/studio', '/seo'
];

async function renderPage(route) {
  goto(route);
  renderToString(<CurrencyProvider><App /></CurrencyProvider>);
  await flushLazy();
  return renderToString(<CurrencyProvider><App /></CurrencyProvider>);
}

// ---- tiny HTML helpers ------------------------------------------------------
const attrsOf = (raw) => {
  const out = {};
  const re = /([a-zA-Z-:]+)(?:\s*=\s*("[^"]*"|'[^']*'|[^\s"'>]+))?/g;
  let m;
  while ((m = re.exec(raw))) out[m[1].toLowerCase()] = m[2] == null ? '' : m[2].replace(/^["']|["']$/g, '');
  return out;
};
const elements = (html, tag) => {
  const out = [];
  const re = new RegExp('<' + tag + '\\b((?:"[^"]*"|\'[^\']*\'|[^>"\'])*?)(/?)>', 'gi');
  let m;
  while ((m = re.exec(html))) out.push({ raw: m[0], at: m.index, attrs: attrsOf(m[1]) });
  return out;
};
// Links and buttons need their children: the accessible name usually lives there.
const containers = (html, tag) => {
  const out = [];
  const re = new RegExp('<' + tag + '\\b((?:"[^"]*"|\'[^\']*\'|[^>"\'])*?)>([\\s\\S]*?)</' + tag + '>', 'gi');
  let m;
  while ((m = re.exec(html))) out.push({ at: m.index, attrs: attrsOf(m[1]), inner: m[2], raw: m[0] });
  return out;
};
const textOf = (html) => html
  .replace(/<script[\s\S]*?<\/script>/gi, ' ')
  .replace(/<style[\s\S]*?<\/style>/gi, ' ')
  .replace(/<svg[\s\S]*?<\/svg>/gi, ' ')
  .replace(/<[^>]*>/g, ' ')
  .replace(/&[a-z#0-9]+;/gi, ' ')
  .replace(/\s+/g, ' ')
  .trim();

(async () => {
  await flushLazy();

  for (const route of ROUTES) {
    let html = '';
    try { html = await renderPage(route); }
    catch (err) { note('route renders', route, err.message); continue; }
    if (!html) { note('route renders', route, 'empty output'); continue; }

    // ── links ────────────────────────────────────────────────────────────────
    for (const { raw, attrs, inner } of containers(html, 'a')) {
      if (attrs.href == null) note('link has href', route, raw.slice(0, 90));
      else if (attrs.href === '#' || attrs.href === '') note('link has a real href', route, raw.slice(0, 90));
      const named = textOf(inner).length > 0 || attrs['aria-label'] || attrs.title ||
        /<img[^>]+alt="[^"]+"/.test(inner) || /aria-label=/.test(inner);
      if (!named) note('link has an accessible name', route, raw.slice(0, 110));
      if (attrs.target === '_blank' && !/noopener/.test(attrs.rel || '')) note('target=_blank carries rel=noopener', route, attrs.href);
    }

    // ── buttons ──────────────────────────────────────────────────────────────
    for (const { raw, attrs, inner } of containers(html, 'button')) {
      const name = textOf(inner).length || attrs['aria-label'] || attrs.title || /<img[^>]+alt="[^"]+"/.test(inner);
      if (!name) note('button has an accessible name', route, raw.slice(0, 110));
      const inForm = /<form\b/.test(html.slice(0, 0)) || false;
      if (attrs.type == null) note('button declares its type', route, raw.slice(0, 80));
    }

    // ── images ───────────────────────────────────────────────────────────────
    for (const { attrs } of elements(html, 'img')) {
      const src = (attrs.src || '').slice(0, 80);
      if (attrs.alt == null) note('img has alt', route, src);
      if (attrs.width == null || attrs.height == null) note('img has width+height (no layout shift)', route, src);
      if (attrs.decoding !== 'async') note('img decodes async', route, src);
      if (attrs.loading == null) note('img declares loading', route, src);
      if (attrs.loading !== 'lazy' && !attrs.fetchpriority && !/hero|car-main/i.test(src)) note('below-fold img is lazy', route, src);
    }

    // ── form controls ────────────────────────────────────────────────────────
    // A control is labelled if it carries its own name, is tied to a <label for>,
    // or is wrapped in a <label> (implicit labelling — what most of this site uses).
    const wrappedInLabel = (at) => {
      const back = html.slice(0, at);
      const open = back.lastIndexOf('<label');
      if (open < 0) return false;
      return back.indexOf('</label>', open) < 0;
    };
    for (const { at, attrs } of elements(html, 'input')) {
      if (attrs.type === 'hidden') continue;
      const named = attrs['aria-label'] || attrs['aria-labelledby'] || attrs.title ||
        (attrs.id && new RegExp(`for="${attrs.id}"`).test(html)) || attrs.placeholder || wrappedInLabel(at);
      if (!named) note('input is labelled', route, attrs.name || attrs.type || 'input');
    }
    for (const { at, attrs } of elements(html, 'select')) {
      const named = attrs['aria-label'] || attrs['aria-labelledby'] || attrs.title ||
        (attrs.id && new RegExp(`for="${attrs.id}"`).test(html)) || wrappedInLabel(at);
      if (!named) note('select is labelled', route, attrs.name || 'select');
    }
    for (const { at, attrs } of elements(html, 'textarea')) {
      const named = attrs['aria-label'] || attrs['aria-labelledby'] || attrs.title ||
        (attrs.id && new RegExp(`for="${attrs.id}"`).test(html)) || attrs.placeholder || wrappedInLabel(at);
      if (!named) note('textarea is labelled', route, attrs.name || 'textarea');
    }

    // ── document structure ───────────────────────────────────────────────────
    const seenIds = new Map();
    for (const m of html.matchAll(/\sid="([^"]+)"/g)) seenIds.set(m[1], (seenIds.get(m[1]) || 0) + 1);
    for (const [id, count] of seenIds) if (count > 1) note('ids are unique', route, `${id} ×${count}`);

    const h1 = elements(html, 'h1').length;
    if (h1 !== 1) note('exactly one h1', route, `${h1} found`);

    const levels = [...html.matchAll(/<h([1-6])\b/g)].map(m => Number(m[1]));
    for (let i = 1; i < levels.length; i++) {
      if (levels[i] - levels[i - 1] > 1) { note('heading levels are not skipped', route, `h${levels[i - 1]} → h${levels[i]}`); break; }
    }

    const mains = elements(html, 'main').length;
    if (mains !== 1) note('one main landmark', route, `${mains} found`);

    for (const { attrs } of elements(html, 'a')) {
      if (attrs.tabindex && Number(attrs.tabindex) > 0) note('no positive tabindex', route, attrs.href || '');
    }

    for (const m of html.matchAll(/aria-hidden="true"((?:"[^"]*"|\s|[^>"])*)>/g)) {
      if (/<button|<a\s|<input|<select|<textarea/.test(m[1])) note('aria-hidden hides no focusable element', route, m[1].slice(0, 70));
    }

    // Only the *direct* child matters: a <ul> whose first child is not an <li>
    // is a grid pretending to be a list, which screen readers announce wrongly.
    for (const m of html.matchAll(/<(ul|ol)\b[^>]*>([\s\S]*?)<\/\1>/gi)) {
      const first = m[2].match(/<([a-z][a-z0-9-]*)\b/i);
      if (!first) continue;
      if (!['li', 'script', 'template'].includes(first[1].toLowerCase())) {
        note('list children are <li>', route, `<${m[1]}> starts with <${first[1]}>`);
      }
    }

    // decorative svg must be hidden from assistive technology
    const svgRe = /<svg\b((?:"[^"]*"|'[^']*'|[^>"'])*?)(\/?)>/gi;
    let sm;
    while ((sm = svgRe.exec(html))) {
      const attrs = attrsOf(sm[1]);
      if (attrs['aria-hidden'] === 'true' || attrs['aria-label'] || attrs.role === 'img') continue;
      const chunk = html.slice(sm.index, Math.min(html.length, sm.index + 500));
      if (/<title>/.test(chunk)) continue;
      note('decorative svg is aria-hidden', route, sm[0].slice(0, 70));
    }
  }

  // ---- source: click handlers must sit on real controls ---------------------
  const srcFiles = [];
  (function walk(d) {
    for (const name of readdirSync(d)) {
      const p = path.join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.jsx?$/.test(name)) srcFiles.push(p);
    }
  })(path.join(root, 'src'));

  const interactiveTags = new Set(['div', 'span', 'li', 'ul', 'section', 'article', 'header', 'footer', 'aside', 'p', 'td', 'tr', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'nav', 'label']);
  for (const file of srcFiles) {
    const rel = path.relative(root, file);
    const lines = readFileSync(file, 'utf8').split('\n');
    lines.forEach((line, i) => {
      const m = line.match(/<([a-z][a-z0-9]*)\b[^>]*\sonClick=/i);
      if (!m || !interactiveTags.has(m[1].toLowerCase())) return;
      const around = lines.slice(i, Math.min(lines.length, i + 8)).join(' ');
      // Backdrops that only dismiss a modal, and wrappers that only stop a click
      // bubbling, are redundant mouse affordances: the dialog they cover is
      // closed by its own button and by Escape, so they need no tab stop.
      if (/onClick=\{\s*e\s*=>\s*e\.stopPropagation\(\)\s*\}/.test(line)) return;
      if (/aria-hidden="true"|role="presentation"/.test(around)) return;
      // A full-screen backdrop that closes a dialog is a redundant mouse path:
      // the dialog inside it has its own close button, and Escape works too.
      if (/className="[^"]*(backdrop|modal-bg|lightbox|shade)[^"]*"/.test(line) &&
          /onClick=\{[^}]*(onClose|close|Close|false)/.test(line)) return;
      const hasRole = /role=["'](button|link|tab|menuitem|option|checkbox|switch)["']/.test(around);
      const hasTab = /tabIndex=/.test(around);
      const hasKey = /onKeyDown=|onKeyUp=|onKeyPress=|KEY_ACTIVATE/.test(around);
      if (hasRole && hasTab && hasKey) return;
      const missing = [!hasRole && 'role', !hasTab && 'tabIndex', !hasKey && 'key handler'].filter(Boolean).join(', ');
      note('click target is keyboard-operable', rel, `line ${i + 1}: <${m[1]} onClick> missing ${missing}`);
    });
  }

  // ---- css: motion, focus and weight ---------------------------------------
  // Every stylesheet lands in one bundle, so one global guard in styles.css is
  // what actually protects a visitor — checked once, not per file.
  const globalMotionGuard = /prefers-reduced-motion/.test(readFileSync(path.join(root, 'src/styles.css'), 'utf8'));
  if (!globalMotionGuard) {
    note('motion is guarded globally', 'src/styles.css', 'no prefers-reduced-motion rule while the bundle animates');
  }
  for (const name of readdirSync(path.join(root, 'src')).filter(f => f.endsWith('.css'))) {
    const css = readFileSync(path.join(root, 'src', name), 'utf8');
    const anims = (css.match(/animation:/g) || []).length;
    if (anims && !/prefers-reduced-motion/.test(css) && !globalMotionGuard) {
      note('animated css respects reduced motion', `src/${name}`, `${anims} animation declarations without a reduced-motion rule`);
    }
    const transAll = (css.match(/transition:\s*all\b/g) || []).length;
    if (transAll > 2) note('avoid transition:all', `src/${name}`, `${transAll} occurrences`);
  }

  // ---- report --------------------------------------------------------------
  let checks = 0;
  for (const [check, list] of [...findings].sort((a, b) => b[1].length - a[1].length)) {
    const unique = [...new Set(list.map(x => x.route + '  ::  ' + x.detail))];
    process.stdout.write(`\n${check} — ${list.length} hit(s) on ${new Set(list.map(x => x.route)).size}/${ROUTES.length} routes\n`);
    for (const d of unique.slice(0, 6)) process.stdout.write(`   · ${d}\n`);
    if (unique.length > 6) process.stdout.write(`   … ${unique.length - 6} more\n`);
    checks++;
  }
  process.stdout.write(`\n${violations} finding(s) across ${checks} checks · ${ROUTES.length} routes audited\n`);
  if (REPORT_ONLY) process.exit(0);
  if (violations) {
    process.stderr.write(`\nFAIL: ${violations} UI audit finding(s) — re-run with --report for the grouped list\n`);
    process.exit(1);
  }
  process.stdout.write('UI audit clean.\n');
})();

function attrsAt(html, raw) { const i = html.indexOf(raw); return i < 0 ? 0 : i; }
