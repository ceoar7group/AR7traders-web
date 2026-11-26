#!/usr/bin/env node
// Machinery storage alert — screenshots and MEASURED contrast, three themes.
//
// WHY THIS EXISTS
// The alert is the screen that tells the owner "the machinery table was never
// created — run supabase/MIGRATION-2026-10-machinery.sql". It is the sentence
// that was missing for weeks while the nightly importer 500'd and the desk
// showed an empty (or bundled-catalogue) list. Two things about it can only be
// verified against a browser:
//
//   • it must be RENDERED from the shipped components and the shipped
//     stylesheet — the tokens differ per theme, and a danger colour that reads
//     on Emerald can be invisible on Porcelain Light;
//   • its diagnostic button must not be clipped and its text must clear WCAG AA.
//
// The harness page is written for the run, driven through the running Vite
// preview (same recipe as scripts/ai-growth-shots.mjs: LD_LIBRARY_PATH
// /tmp/chromelibs, @sparticuz/chromium), and REMOVED afterwards — it is a
// measurement rig, not a page of the site.
//
//   LD_LIBRARY_PATH=/tmp/chromelibs node scripts/machinery-alert-shots.mjs \
//     --base http://127.0.0.1:5199 --out pr-visuals/2026-10-12 \
//     --viewports 1440x900,390x844
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer-core';
import chromium from '@sparticuz/chromium';

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const at = args.indexOf('--' + name);
  return at >= 0 ? args[at + 1] : fallback;
};
const BASE = arg('base', 'http://127.0.0.1:5199');
const OUT = arg('out', 'pr-visuals/2026-10-12');
const VIEWPORTS = arg('viewports', '1440x900,390x844').split(',').map(v => {
  const [width, height] = v.split('x').map(Number);
  return { width, height };
});
const THEMES = ['emerald', 'dark', 'light'];
const THEME_LABEL = { emerald: 'Emerald', dark: 'Midnight', light: 'Light' };

mkdirSync(OUT, { recursive: true });
const HARNESS = fileURLToPath(new URL('../.crm-alert-harness.html', import.meta.url));

// The harness imports the REAL modules from the dev server (/src/crm.jsx), so
// the alert is built by the same components and the same stylesheet the CRM
// ships. The issue object comes from the exported mapper, fed the exact body
// production returns for a missing table.
const page = (theme) => `<!doctype html>
<html lang="en" data-crm-theme="${theme}">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Machinery storage alert — ${theme}</title></head>
<body style="margin:0">
<div class="crm-shell" id="shell" style="display:block">
  <main class="crm-main" id="mount" style="max-width:1180px;margin:0 auto;padding:24px"></main>
</div>
<script type="module">
import './src/crm.css';
import React from 'react';
import { createRoot } from 'react-dom/client';
import { MachineryStorageAlert, MachineryDoctorReport, MachineryImportPanel, describeLoadFailure } from './src/crm.jsx';

// Exactly what the API answers when the migration has not been run (verified
// against ar7traders.com on 2026-10-12: "Could not find the table
// 'public.machinery' in the schema cache").
const body = {
  error: "Could not find the table 'public.machinery' in the schema cache",
  stage: 'machinery-storage',
  state: 'missing-table',
  storage: {
    state: 'missing-table', table: 'machinery',
    migration: 'supabase/MIGRATION-2026-10-machinery.sql',
    ownerAction: "Run supabase/MIGRATION-2026-10-machinery.sql in the Supabase SQL editor, then run: select pg_notify('pgrst','reload schema');"
  }
};
const issue = describeLoadFailure('machinery', Object.assign(new Error(body.error), { body }));

const checks = [
  { name: 'Machinery storage readable', ok: false, detail: "public.machinery: Could not find the table 'public.machinery' in the schema cache",
    fix: "Run supabase/MIGRATION-2026-10-machinery.sql in the Supabase SQL editor, then run: select pg_notify('pgrst','reload schema');" },
  { name: 'Public catalogue source', ok: false, detail: 'The public catalogue is showing the built-in fallback, so imported machines cannot appear on the website.',
    fix: 'Apply the migration above, then reload the schema cache.' },
  { name: 'Hidden eligible imports', ok: false, detail: 'Cannot be checked while the storage is missing.', fix: null }
];

createRoot(document.getElementById('mount')).render(
  React.createElement(React.Fragment, null,
    React.createElement(MachineryStorageAlert, { issue, busy: false, onDiagnose: () => {} }),
    React.createElement(MachineryDoctorReport, { report: {
      ok: false, storage: body.storage, checks, ownerAction: body.storage.ownerAction
    }, onDismiss: () => {} }),
    // The import panel carries the same gate: its stored-machine buttons are
    // disabled, its supplier previews are not, and it says so where they are.
    React.createElement(MachineryImportPanel, {
      token: 'harness-token', canWrite: true, canSetDefault: true,
      notify: () => {}, onImported: () => {}, storageBlocked: true,
      machines: [{ id: 'd1', ref: 'AR7-MC-001', brand: 'Sany', model: 'SY215C', type: 'Excavators', published: true, status: 'Available' }]
    })
  )
);
document.title = 'ready';
</script>
</body>
</html>`;

let pass = 0, fail = 0;
const results = [];
const check = (cond, name, detail) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name + (detail ? ' — ' + detail : '')); }
};

const report = { base: BASE, harness: '.crm-alert-harness.html', capturedAt: new Date().toISOString(), viewports: [] };
let browser;
try {
  browser = await puppeteer.launch({
    executablePath: await chromium.executablePath(),
    headless: true,
    args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage']
  });

  for (const viewport of VIEWPORTS) {
    writeFileSync(HARNESS, page('emerald'));
    const tab = await browser.newPage();
    await tab.setViewport(viewport);
    const tag = `${viewport.width}x${viewport.height}`;
    const entry = { viewport, themes: {} };

    for (const theme of THEMES) {
      await tab.goto(`${BASE}/.crm-alert-harness.html?theme=${theme}`, { waitUntil: 'networkidle2', timeout: 60000 });
      // The theme is set per navigation by the harness page itself; the CSS reads
      // html[data-crm-theme="…"] .crm-shell, so both must agree.
      await tab.evaluate(t => document.documentElement.setAttribute('data-crm-theme', t), theme);
      await tab.waitForSelector('.crm-storage-alert', { timeout: 20000 });
      await new Promise(r => setTimeout(r, 400));

      const measured = await tab.evaluate(async () => {
        // Read ANY computed colour Chrome can produce. A regex over `rgb()` is
        // not enough: color-mix() computes to `color(srgb …)`, and a colour the
        // reader cannot parse must fail loudly, never count as passing.
        const cvs = document.createElement('canvas');
        cvs.width = cvs.height = 1;
        const ctx = cvs.getContext('2d', { willReadFrequently: true });
        const parse = value => {
          if (!value || value === 'transparent') return null;
          ctx.clearRect(0, 0, 1, 1);
          ctx.fillStyle = 'rgba(0, 0, 0, 0)';
          ctx.fillStyle = String(value);
          ctx.fillRect(0, 0, 1, 1);
          const [r, g, b, a] = ctx.getImageData(0, 0, 1, 1).data;
          if (a === 0) return null;
          return { r, g, b, a: a / 255 };
        };
        const blend = (top, bottom) => ({
          r: top.r * top.a + bottom.r * (1 - top.a),
          g: top.g * top.a + bottom.g * (1 - top.a),
          b: top.b * top.a + bottom.b * (1 - top.a), a: 1
        });
        const effectiveBg = el => {
          let layer = null;
          for (let node = el; node; node = node.parentElement) {
            const bg = parse(getComputedStyle(node).backgroundColor);
            if (!bg || bg.a === 0) continue;
            layer = layer ? blend(layer, bg) : bg;
            if (bg.a === 1) break;
          }
          return layer || { r: 255, g: 255, b: 255, a: 1 };
        };
        const luminance = c => {
          const f = v => { const n = v / 255; return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4); };
          return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
        };
        const ratio = (a, b) => {
          const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
          return Math.round(((hi + 0.05) / (lo + 0.05)) * 100) / 100;
        };
        const measure = (selector, label) => {
          const el = document.querySelector(selector);
          if (!el) return { label, selector, missing: true };
          const style = getComputedStyle(el);
          const declared = style.color;
          const fg = parse(declared);
          if (!fg) return { label, selector, unreadable: declared, text: (el.textContent || '').trim().slice(0, 40) };
          const size = parseFloat(style.fontSize) || 12;
          const bold = (parseInt(style.fontWeight, 10) || 400) >= 700;
          const required = (size >= 24 || (bold && size >= 18.66)) ? 3 : 4.5;
          return { label, selector, ratio: ratio(fg, effectiveBg(el)), required, size, bold, text: (el.textContent || '').trim().slice(0, 60) };
        };

        const alert = document.querySelector('.crm-storage-alert');
        const rect = alert.getBoundingClientRect();
        // A label that does not fit its box is clipped — the failure mode that
        // shipped twice on this desk (icon-only buttons swallowing "Emergency
        // stop" and the draft "Cancel").
        const disabledButtons = [...document.querySelectorAll('.crm-import-panel button:disabled')]
          .map(b => ({ text: (b.textContent || '').trim().slice(0, 40), opacity: parseFloat(getComputedStyle(b).opacity) }));
        const enabledPanelButtons = [...document.querySelectorAll('.crm-import-panel button:not(:disabled)')]
          .map(b => (b.textContent || '').trim().slice(0, 40));
        const clipped = [...document.querySelectorAll('.crm-storage-alert button, .crm-storage-report button, .crm-import-panel button')]
          .filter(b => b.scrollWidth > b.clientWidth + 1 || b.scrollHeight > b.clientHeight + 1)
          .map(b => ({ text: (b.textContent || '').trim().slice(0, 30), box: [b.clientWidth, b.clientHeight], content: [b.scrollWidth, b.scrollHeight] }));
        const small = [...document.querySelectorAll('.crm-storage-alert button, .crm-storage-report button, .crm-import-panel button')]
          .filter(b => { const r = b.getBoundingClientRect(); return r.width < 24 || r.height < 24; })
          .map(b => { const r = b.getBoundingClientRect(); return { text: (b.textContent || '').trim().slice(0, 30), size: [Math.round(r.width), Math.round(r.height)] }; });

        return {
          themeAttr: document.documentElement.getAttribute('data-crm-theme'),
          shellBg: getComputedStyle(document.querySelector('.crm-shell')).backgroundColor,
          alert: { visible: rect.height > 0, width: Math.round(rect.width), height: Math.round(rect.height) },
          overflowX: Math.max(0, document.documentElement.scrollWidth - window.innerWidth),
          clippedButtons: clipped,
          smallTargets: small,
          disabledButtons,
          enabledPanelButtons,
          blockedNotice: document.querySelector('.crm-import-blocked') ? {
            visible: document.querySelector('.crm-import-blocked').getBoundingClientRect().height > 0,
            text: (document.querySelector('.crm-import-blocked').textContent || '').replace(/\s+/g, ' ').trim()
          } : null,
          readings: [
            measure('.crm-storage-alert b', 'alert headline'),
            measure('.crm-storage-alert p', 'alert explanation'),
            measure('.crm-storage-alert .crm-storage-fix', 'the fix line'),
            measure('.crm-storage-alert code', 'state / table'),
            measure('.crm-storage-alert > button', 'diagnostic button'),
            measure('.crm-storage-report-head b', 'report headline'),
            measure('.crm-storage-report li b', 'check verdict'),
            measure('.crm-storage-report li span', 'check detail'),
            measure('.crm-storage-report .crm-storage-fix', 'check fix'),
            measure('.crm-import-blocked', 'panel notice'),
            measure('.crm-import-blocked svg', 'panel notice icon')
          ]
        };
      });

      entry.themes[theme] = measured;
      await tab.screenshot({ path: `${OUT}/machinery-storage-alert-${tag}-${theme}.jpg`, type: 'jpeg', quality: 82, fullPage: true });
    }

    report.viewports.push(entry);

    console.log(`\n== ${tag} ==`);
    for (const theme of THEMES) {
      const t = entry.themes[theme];
      check(t.themeAttr === theme, `${theme}: the theme attribute reached the page`);
      check(t.alert.visible && t.alert.width > 200, `${theme}: the alert renders (${t.alert.width}×${t.alert.height})`);
      check(t.clippedButtons.length === 0, `${theme}: no button label is clipped`,
        t.clippedButtons.map(b => `${b.text} ${b.box} / ${b.content}`).join(', '));
      check(t.smallTargets.length === 0, `${theme}: no button is a sub-24px target`,
        t.smallTargets.map(b => `${b.text} ${b.size}`).join(', '));
      check(t.overflowX <= 1, `${theme}: nothing overflows the viewport sideways (${t.overflowX}px)`);
      const missing = t.readings.filter(r => r.missing).map(r => r.selector);
      check(missing.length === 0, `${theme}: every measured element exists`, missing.join(', '));
      const unreadable = t.readings.filter(r => r.unreadable);
      check(unreadable.length === 0, `${theme}: every colour was readable`,
        unreadable.map(r => `${r.selector}=${r.unreadable}`).join(', '));
      check(t.blockedNotice?.visible === true, `${theme}: the import panel says why its buttons are dead`,
        t.blockedNotice ? '' : 'no .crm-import-blocked');
      // How many are rendered depends on what has been expanded; what must hold
      // is that NONE of the disabled ones still looks pressable.
      const lookEnabled = (t.disabledButtons || []).filter(b => b.opacity >= 1);
      check((t.disabledButtons || []).length >= 1 && lookEnabled.length === 0,
        `${theme}: all ${(t.disabledButtons || []).length} disabled panel button(s) LOOK disabled`,
        lookEnabled.length ? lookEnabled.map(b => `${b.text} opacity=${b.opacity}`).join(', ') : 'none disabled at all');
      check((t.enabledPanelButtons || []).some(x => /run scraper/i.test(x)),
        `${theme}: the supplier scraper preview is still offered`,
        (t.enabledPanelButtons || []).join(' | '));
      const failing = t.readings.filter(r => r.ratio !== undefined && r.ratio < r.required);
      check(failing.length === 0, `${theme}: all ${t.readings.filter(r => r.ratio !== undefined).length} text elements clear WCAG AA`,
        failing.map(r => `${r.label} ${r.ratio}:1 < ${r.required}:1`).join(', '));
      for (const r of t.readings) {
        if (r.ratio !== undefined) console.log(`      ${r.ratio >= r.required ? 'AA ' : '!! '} ${String(r.ratio).padStart(5)}:1 (needs ${r.required}) ${r.label} — ${r.size}px${r.bold ? ' bold' : ''}`);
      }
    }
    await tab.close();
  }
} finally {
  rmSync(HARNESS, { force: true });
  if (browser) await browser.close();
}

writeFileSync(`${OUT}/machinery-alert-shots.json`, JSON.stringify(report, null, 2) + '\n');
console.log(`\n${pass} passed, ${fail} failed — ${OUT}/machinery-alert-shots.json`);
process.exit(fail ? 1 : 0);
