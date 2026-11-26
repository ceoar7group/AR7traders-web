#!/usr/bin/env node
// AI Growth desk screenshots — the CRM's new management area.
//
// Same headless recipe as scripts/crm-actions-evidence.mjs (LD_LIBRARY_PATH
// /tmp/chromelibs, @sparticuz/chromium's executable), but this one drives the
// desk itself: it signs into the CRM demo, opens AI Growth, and records the
// overview, each workspace and the 390px card layout.
//
//   LD_LIBRARY_PATH=/tmp/chromelibs node scripts/ai-growth-shots.mjs \
//     --base http://127.0.0.1:5199 --out pr-visuals/2026-10-12
import { mkdirSync, writeFileSync } from 'node:fs';
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

mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: await chromium.executablePath(),
  headless: true,
  args: [...chromium.args, '--no-sandbox', '--disable-dev-shm-usage']
});

const report = { base: BASE, capturedAt: new Date().toISOString(), viewports: [] };

const normalise = s => (s || '').replace(/\s+/g, ' ').trim();

for (const viewport of VIEWPORTS) {
  const page = await browser.newPage();
  await page.setViewport(viewport);
  await page.goto(BASE + '/crm', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.waitForSelector('.crm-side nav button', { timeout: 30000 });

  // The AI Growth entry has to be in the sidebar for the desk to be findable.
  const navLabels = await page.$$eval('.crm-side nav button', nodes => nodes.map(n => (n.textContent || '').replace(/\s+/g, ' ').trim()));
  const entry = navLabels.find(l => /AI Growth/i.test(l));
  report.viewports.push({ viewport, navLabels, aiGrowthNavEntry: entry || null });
  if (!entry) { await page.close(); continue; }

  await page.evaluate(label => {
    const button = [...document.querySelectorAll('.crm-side nav button')]
      .find(b => (b.textContent || '').replace(/\s+/g, ' ').trim().startsWith(label));
    button?.click();
  }, entry);
  await page.waitForSelector('.crm-ai-growth', { timeout: 15000 });
  await new Promise(r => setTimeout(r, 700));

  const tag = `${viewport.width}x${viewport.height}`;
  await page.screenshot({ path: `${OUT}/ai-growth-overview-${tag}.jpg`, type: 'jpeg', quality: 82, fullPage: false });

  // Each workspace, so a reviewer can see the review surfaces without clicking.
  const workspaces = ['Lead workspace', 'SEO workspace', 'Social workspace'];
  for (const label of workspaces) {
    const clicked = await page.evaluate(text => {
      const tab = [...document.querySelectorAll('.ai-tabs button')].find(b => (b.textContent || '').trim() === text);
      if (!tab) return false;
      tab.click();
      return true;
    }, label);
    if (!clicked) continue;
    await new Promise(r => setTimeout(r, 400));
    const slug = label.split(' ')[0].toLowerCase();
    await page.screenshot({ path: `${OUT}/ai-growth-${slug}-${tag}.jpg`, type: 'jpeg', quality: 82, fullPage: false });
  }

  // Every CRM theme, measured. The desk adds a lot of translucent overlays; a
  // token that reads fine on Emerald can be invisible on Porcelain Light, so
  // contrast is MEASURED (WCAG ratio, blended backgrounds) rather than eyeballed.
  const THEME_STYLES = process.argv.includes('--themes');
  if (THEME_STYLES) {
    // Back to Overview: the KPI tiles and agent cards only exist there, and the
    // workspace pass above leaves the last workspace open.
    await page.evaluate(() => {
      const tab = [...document.querySelectorAll('.ai-tabs button')].find(b => (b.textContent || '').trim() === 'Overview');
      tab?.click();
    });
    await new Promise(r => setTimeout(r, 400));
    const contrastFor = async () => await page.evaluate(async () => {
      // Read ANY computed colour Chrome can produce. A regex over `rgb()` is not
      // enough here: color-mix() computes to `color(srgb …)`, and a colour the
      // reader cannot parse would silently be reported as passing.
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
        if (a === 0) return null;                    // unparseable or fully transparent
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
        const declared = getComputedStyle(el).color;
        const fg = parse(declared);
        const bg = effectiveBg(el);
        if (!fg) return { label, selector, unreadable: declared, text: (el.textContent || '').trim().slice(0, 30) };
        const size = parseFloat(getComputedStyle(el).fontSize) || 12;
        const bold = (parseInt(getComputedStyle(el).fontWeight, 10) || 400) >= 700;
        // WCAG AA: 4.5 for body text, 3.0 for large (≥18.66px bold or ≥24px).
        const required = (size >= 24 || (bold && size >= 18.66)) ? 3 : 4.5;
        return { label, selector, ratio: ratio(fg, bg), required, size, text: (el.textContent || '').trim().slice(0, 30) };
      };
      return [
        measure('.ai-banner b', 'banner status'),
        measure('.ai-banner span', 'banner detail'),
        measure('.ai-kpis article b', 'KPI number'),
        measure('.ai-kpis article span', 'KPI label'),
        measure('.ai-agent header b', 'agent name'),
        measure('.ai-agent dt', 'agent config key'),
        measure('.ai-agent dd', 'agent config value'),
        measure('.ai-drafts .crm-status', 'draft chip'),
        measure('.ai-draft-head b', 'draft title'),
        measure('.ai-draft-head small', 'draft meta'),
        measure('.ai-draft-actions button', 'review button'),
        measure('.ai-draft-actions .save', 'approve button'),
        measure('.ai-tabs button', 'workspace tab'),
        measure('.ai-panel .crm-hint', 'panel explanation'),
        measure('.ai-table-wrap td small', 'job row meta'),
        measure('.ai-kpis article span', 'KPI caption')
      ];
    });
    for (const set of ['emerald', 'dark', 'light']) {
      await page.evaluate(theme => {
        const label = theme === 'emerald' ? 'Emerald' : theme === 'dark' ? 'Midnight' : 'Light';
        const pick = [...document.querySelectorAll('.crm-theme-switcher button')]
          .find(b => (b.textContent || '').replace(/\s+/g, ' ').trim().endsWith(label));
        if (pick) pick.click();
        else document.documentElement.setAttribute('data-crm-theme', theme);
      }, set);
      await page.waitForFunction(expected => {
        const toHex = value => {
          const m = String(value).match(/rgba?\(([^)]+)\)/);
          if (!m) return null;
          return m[1].split(',').slice(0, 3).map(Number).join(',');
        };
        return toHex(getComputedStyle(document.querySelector('.crm-shell')).backgroundColor) === expected
          || document.querySelector('.crm-shell')?.getAttribute('data-crm-theme') === 'light';
      }, null, { timeout: 3000 }).catch(() => {});
      await new Promise(r => setTimeout(r, 500));
      await page.screenshot({ path: `${OUT}/ai-growth-overview-${tag}-${set}.jpg`, type: 'jpeg', quality: 82, fullPage: false });
      const reading = await contrastFor();
      report.viewports[report.viewports.length - 1].contrast = {
        ...(report.viewports[report.viewports.length - 1].contrast || {}), [set]: reading
      };
    }
    // Back to the default for the measurement pass below.
    await page.evaluate(() => document.documentElement.setAttribute('data-crm-theme', 'emerald'));
    await new Promise(r => setTimeout(r, 300));
  }

  // Measure the standing claims: the banner mode, the chips, and whether the
  // review buttons are reachable without horizontal scrolling on a phone.
  const measured = await page.evaluate(() => {
    const text = sel => document.querySelector(sel)?.textContent?.replace(/\s+/g, ' ').trim() || null;
    const rect = sel => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) };
    };
    const doc = document.documentElement;
    const actions = [...document.querySelectorAll('.ai-draft-actions button')];
    return {
      banner: text('.ai-banner b'),
      bannerText: text('.ai-banner span'),
      tabs: [...document.querySelectorAll('.ai-tabs button')].map(b => b.textContent.trim()),
      draftCount: document.querySelectorAll('.ai-drafts > li').length,
      actionButtons: actions.map(b => ({ label: b.textContent.trim(), w: Math.round(b.getBoundingClientRect().width), h: Math.round(b.getBoundingClientRect().height), visible: b.getBoundingClientRect().width > 0 })),
      // A label that does not fit its button paints outside the border — that is
      // how the 32px icon-square rule clipped "Emergency stop" and "Cancel".
      // Every button on the desk is checked, not just the ones that looked wrong.
      clippedButtons: [...document.querySelectorAll('.crm-ai-growth button')]
        .map(b => ({
          label: b.textContent.replace(/\s+/g, ' ').trim().slice(0, 28),
          overflow: b.scrollWidth - b.clientWidth,
          w: Math.round(b.getBoundingClientRect().width),
          h: Math.round(b.getBoundingClientRect().height)
        }))
        .filter(b => b.overflow > 1),
      // Tap targets: the desk is used from a phone as well as a desk.
      smallTargets: [...document.querySelectorAll('.crm-ai-growth button, .crm-ai-growth select')]
        .map(b => ({ label: b.textContent.replace(/\s+/g, ' ').trim().slice(0, 24), h: Math.round(b.getBoundingClientRect().height), w: Math.round(b.getBoundingClientRect().width) }))
        .filter(b => b.w > 0 && b.h > 0 && b.h < 30),
      overflowRight: Math.max(0, doc.scrollWidth - doc.clientWidth),
      pageHeadHeight: rect('.crm-page-head')?.h ?? null,
      heading: text('.crm-page-head p')?.slice(0, 60) || null,
      statusChips: [...document.querySelectorAll('.ai-drafts .crm-status')].map(e => e.textContent.trim())
    };
  });
  report.viewports[report.viewports.length - 1].measured = measured;

  await page.close();
}

await browser.close();
writeFileSync(`${OUT}/ai-growth-shots.json`, JSON.stringify(report, null, 2));
console.log(JSON.stringify(report.viewports.map(v => ({ viewport: `${v.viewport.width}x${v.viewport.height}`, entry: v.aiGrowthNavEntry, measured: v.measured })), null, 2));
