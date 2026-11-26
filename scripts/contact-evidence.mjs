#!/usr/bin/env node
// Chromium evidence for the direct contact form (desktop + mobile).
// Runs against the local dev mock only — never production. It records no
// customer phone/email/name in the JSON report; screenshots are taken before
// any fixture data is entered and after the form resets on success.
//
//   npm run dev -- --port 5173
//   npm i --no-save puppeteer-core @sparticuz/chromium
//   node scripts/contact-evidence.mjs
import { mkdirSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { extractChromiumLibraries } from './chromium-libs.mjs';

const BASE = process.env.EVIDENCE_BASE || 'http://127.0.0.1:5173';
const outDir = resolve('pr-visuals/2026-11-03');
const viewports = [
  { name: 'desktop-1440x900', width: 1440, height: 900 },
  { name: 'mobile-390x844', width: 390, height: 844 },
];

const { default: puppeteer } = await import('puppeteer-core');
let executablePath = process.env.CHROME_PATH;
if (!executablePath) {
  const chromium = await import('@sparticuz/chromium');
  executablePath = await chromium.default.executablePath();
  const libs = extractChromiumLibraries();
  process.env.LD_LIBRARY_PATH = [process.env.LD_LIBRARY_PATH, libs].filter(Boolean).join(':');
}
const browser = await puppeteer.launch({
  executablePath,
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  env: { ...process.env },
});
mkdirSync(outDir, { recursive: true });
const report = { base: BASE, generatedAt: new Date().toISOString(), viewports: {} };
let failures = 0;
const check = (vp, name, ok, detail = '') => {
  report.viewports[vp.name].checks.push({ name, ok: !!ok, detail });
  if (!ok) failures++;
};

try {
  for (const vp of viewports) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([{ name: 'prefers-reduced-motion', value: 'reduce' }]);
    const consoleErrors = [];
    const pageErrors = [];
    const leadPosts = [];
    page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 200)); });
    page.on('pageerror', e => pageErrors.push(String(e.message || e).slice(0, 200)));
    page.on('response', r => { if (r.url().includes('/api/leads') && r.request().method() === 'POST') leadPosts.push(r.status()); });
    report.viewports[vp.name] = { checks: [], consoleErrors, pageErrors, leadPosts };

    await page.goto(BASE + '/contact', { waitUntil: 'networkidle2', timeout: 45000 });
    await page.waitForSelector('.enquiry-form', { timeout: 20000 });
    const initial = await page.evaluate(() => {
      const form = document.querySelector('.enquiry-form');
      const phone = form?.querySelector('[name="phone"]');
      const label = phone ? form.querySelector(`label[for="${phone.id}"]`) : null;
      return {
        forms: document.querySelectorAll('.enquiry-form').length,
        dialogs: document.querySelectorAll('.modal-backdrop').length,
        phoneRequired: !!phone?.required,
        phoneType: phone?.type,
        phoneAutocomplete: phone?.autocomplete,
        phoneLabel: label?.textContent || '',
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      };
    });
    check(vp, 'one direct contact form, no auction dialog', initial.forms === 1 && initial.dialogs === 0, JSON.stringify(initial));
    check(vp, 'phone required with tel semantics', initial.phoneRequired && initial.phoneType === 'tel' && initial.phoneAutocomplete === 'tel');
    check(vp, 'phone label is clear and required', /contact phone number/i.test(initial.phoneLabel) && /required/i.test(initial.phoneLabel));
    check(vp, 'no horizontal overflow', initial.scrollWidth <= initial.innerWidth + 1, `${initial.scrollWidth}/${initial.innerWidth}`);
    await page.screenshot({ path: join(outDir, `contact-empty-${vp.name}.jpg`), type: 'jpeg', quality: 78 });

    // Empty submit must fail accessibly and never show success.
    await page.click('.enquiry-submit');
    await new Promise(r => setTimeout(r, 250));
    const invalid = await page.evaluate(() => ({
      invalid: document.querySelector('[name="phone"]')?.getAttribute('aria-invalid'),
      success: !!document.querySelector('.enquiry-success'),
      alert: !!document.querySelector('.enquiry-alert'),
    }));
    check(vp, 'empty submit blocks with accessible phone error', invalid.invalid === 'true' && !invalid.success && invalid.alert, JSON.stringify(invalid));

    // Controlled fixture submission against the dev mock. Values are not logged.
    await page.type('[name="name"]', 'Fixture Buyer');
    await page.type('[name="email"]', 'fixture@example.test');
    await page.type('[name="phone"]', '+92 300 1234567');
    await page.type('[name="message"]', 'Please quote a Toyota Aqua to Karachi.');
    await page.click('.enquiry-submit');
    await page.waitForSelector('.enquiry-success', { timeout: 15000 });
    const success = await page.evaluate(() => ({
      success: !!document.querySelector('.enquiry-success'),
      phoneValue: document.querySelector('[name="phone"]')?.value || '',
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
    }));
    check(vp, 'success only after the dev API persists the lead', success.success && leadPosts.includes(201), JSON.stringify(leadPosts));
    check(vp, 'success resets the form (no personal data left on screen)', success.phoneValue === '');
    check(vp, 'success state has no horizontal overflow', success.scrollWidth <= success.innerWidth + 1);
    await page.screenshot({ path: join(outDir, `contact-success-${vp.name}.jpg`), type: 'jpeg', quality: 78 });

    if (vp.width < 500) {
      const mobile = await page.evaluate(() => {
        const input = document.querySelector('.enquiry-success button') || document.querySelector('.enquiry-form input');
        const cs = getComputedStyle(input);
        return { fontSize: parseFloat(cs.fontSize), height: input.getBoundingClientRect().height };
      });
      check(vp, 'mobile controls avoid iOS zoom and meet touch height', mobile.fontSize >= 16 && mobile.height >= 44, JSON.stringify(mobile));
    }

    // Auction access remains a separate, explicit dialog.
    await page.goto(BASE + '/auction', { waitUntil: 'networkidle2', timeout: 45000 });
    const opened = await page.evaluate(() => {
      const btn = [...document.querySelectorAll('button')].find(b => /request free access|get started/i.test(b.textContent || ''));
      if (btn) { btn.click(); return true; }
      return false;
    });
    check(vp, 'auction CTA exists', opened);
    if (opened) {
      await page.waitForSelector('.enquiry-modal', { timeout: 10000 });
      const dialog = await page.evaluate(() => ({
        text: document.querySelector('.enquiry-modal')?.textContent || '',
        phoneRequired: !!document.querySelector('.enquiry-modal [name="phone"]')?.required,
        contactForms: document.querySelectorAll('.enquiry-form').length,
      }));
      check(vp, 'auction dialog is distinct and phone-required', /auction access/i.test(dialog.text) && dialog.phoneRequired && dialog.contactForms === 1);
      await page.screenshot({ path: join(outDir, `auction-dialog-${vp.name}.jpg`), type: 'jpeg', quality: 78 });
      await page.keyboard.press('Escape');
      await new Promise(r => setTimeout(r, 250));
      const closed = await page.evaluate(() => !document.querySelector('.enquiry-modal'));
      check(vp, 'Escape closes the auction dialog', closed);
    }

    // Vite HMR WebSockets cannot traverse the evidence proxy; they are dev
    // transport noise, not product page errors. Record them separately.
    const devNoise = /WebSocket|\[vite\]|ERR_CONNECTION_REFUSED|ERR_CONNECTION_CLOSED/i;
    const productPageErrors = pageErrors.filter(m => !devNoise.test(m));
    const productConsoleErrors = consoleErrors.filter(m => !devNoise.test(m));
    check(vp, 'no product page errors', productPageErrors.length === 0, productPageErrors.join(' | '));
    report.viewports[vp.name].consoleErrorCount = consoleErrors.length;
    report.viewports[vp.name].productConsoleErrorCount = productConsoleErrors.length;
    report.viewports[vp.name].devTransportNoiseCount = consoleErrors.length - productConsoleErrors.length;
    await page.close();
  }
} finally {
  await browser.close();
}
report.failures = failures;
writeFileSync(join(outDir, 'contact-evidence.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ failures, viewports: Object.keys(report.viewports), outDir }, null, 2));
process.exit(failures ? 1 : 0);
