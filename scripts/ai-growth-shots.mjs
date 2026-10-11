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
