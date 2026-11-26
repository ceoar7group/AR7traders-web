// Page evidence harness — screenshots + measured facts for any set of routes.
//
// NOT part of `npm test`: it needs a real Chromium and a built site, so it is
// run by hand against `npm run preview`.
//
//   npm i --no-save puppeteer-core
//   npm run build && npm run preview        # http://127.0.0.1:4173
//   node scripts/page-shots.mjs --out pr-visuals/2026-10-08 \
//        --paths /destinations/kenya,/destinations \
//        --viewports 1440x900,390x844 [--shots]
//
// Method, the same as scripts/hero-measure.mjs so the numbers are comparable:
//   • deviceScaleFactor 1, one fresh page per capture, storage cleared;
//   • `document.fonts.ready` + two animation frames before anything is read;
//   • prefers-reduced-motion: reduce, so a timed grab cannot photograph the
//     first frames of an animation;
//   • rectangles and head tags are read FIRST and the full-page screenshot is
//     taken LAST — a full-page capture resizes the viewport, so measuring after
//     it reports the wrong numbers.
//
// What it records is what the acceptance criteria ask to be proven by
// measurement rather than by eye: the rendered <title>, the meta description
// and its length, the canonical, the robots directive, how many H1s the page
// has and what the first one says, which JSON-LD blocks exist, how many FAQ
// questions are on the page, and whether anything overflows horizontally.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const EXEC = process.env.CHROME_PATH || '/tmp/vchrome/chrome';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const args = process.argv.slice(2);
const opt = (name, fallback) => (args.includes('--' + name) ? args[args.indexOf('--' + name) + 1] : fallback);
const outDir = opt('out', 'pr-visuals/2026-10-08');
const paths = String(opt('paths', '/destinations/kenya,/destinations')).split(',').filter(Boolean);
const shots = args.includes('--shots');
const viewports = String(opt('viewports', '1440x900,768x1024,390x844')).split(',').filter(Boolean)
  .map(v => { const [w, h] = v.split('x').map(Number); return { name: v, width: w, height: h }; });

const rect = `
  const rect = el => { if (!el) return null; const b = el.getBoundingClientRect();
    return { top: +b.top.toFixed(1), left: +b.left.toFixed(1),
             width: +b.width.toFixed(1), height: +b.height.toFixed(1),
             bottom: +b.bottom.toFixed(1), right: +b.right.toFixed(1) }; };
`;

async function measure(page) {
  return page.evaluate(`(() => {
    ${rect}
    const q = s => document.querySelector(s);
    const qa = s => [...document.querySelectorAll(s)];
    const attr = (sel, a) => (q(sel) ? q(sel).getAttribute(a) : null);
    const jsonld = qa('script[type="application/ld+json"]').map(el => {
      let type = null, questions = 0, crumbs = 0;
      try {
        const data = JSON.parse(el.textContent || '{}');
        type = data['@type'] || null;
        questions = Array.isArray(data.mainEntity) ? data.mainEntity.length : 0;
        crumbs = Array.isArray(data.itemListElement) ? data.itemListElement.length : 0;
      } catch (e) { type = 'UNPARSEABLE'; }
      return { id: el.id || null, type, questions, crumbs };
    });
    const h1s = qa('h1').map(el => el.textContent.replace(/\\s+/g, ' ').trim());
    return {
      title: document.title,
      description: attr('meta[name="description"]', 'content'),
      descriptionLength: (attr('meta[name="description"]', 'content') || '').length,
      canonical: attr('link[rel="canonical"]', 'href'),
      robots: attr('meta[name="robots"]', 'content'),
      ogTitle: attr('meta[property="og:title"]', 'content'),
      h1Count: h1s.length,
      h1: h1s[0] || null,
      jsonld,
      faqQuestionsOnPage: qa('.destination-faq-list details, .mch-faq-list details').length,
      docItems: qa('.destination-docs li').length,
      factTiles: qa('.destination-facts > div').length,
      marketLinks: qa('.destination-market-links a, .destination-grid a').length,
      stockLinks: qa('a[href="/inventory"], a[href^="/inventory/"]').length,
      scrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      boxes: {
        hero: rect(q('.destination-hero')),
        facts: rect(q('.destination-facts')),
        docs: rect(q('.destination-docs')),
        faq: rect(q('.destination-faq')),
        picker: rect(q('.destination-picker')),
        grid: rect(q('.destination-grid'))
      }
    };
  })()`);
}

mkdirSync(outDir, { recursive: true });
const browser = await puppeteer.launch({
  executablePath: EXEC,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
         '--font-render-hinting=none', '--force-color-profile=srgb']
});

const results = [];
for (const path of paths) {
  for (const vp of viewports) {
    const page = await browser.newPage();
    await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'reduce' },
      { name: 'prefers-color-scheme', value: 'light' }
    ]);
    await page.goto(BASE + path, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
    try { await page.evaluateHandle('document.fonts.ready'); } catch {}
    await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
    await new Promise(r => setTimeout(r, 500));

    const facts = await measure(page);
    const name = path.replace(/^\//, '').replace(/\//g, '-') || 'home';
    const file = join(outDir, `${name}-${vp.name}.jpg`);
    if (shots) {
      await page.screenshot({ path: file, type: 'jpeg', quality: 82 });
      // Full page LAST: it resizes the viewport, so nothing is measured after.
      await page.screenshot({ path: join(outDir, `${name}-${vp.name}-full.jpg`), type: 'jpeg', quality: 78, fullPage: true });
    }
    results.push({ path, viewport: vp.name, file: shots ? file : null, ...facts });
    process.stdout.write(`  ${path} @ ${vp.name}: h1="${facts.h1}" title=${facts.title.length}ch desc=${facts.descriptionLength}ch canonical=${facts.canonical}\n`);
    await page.close();
  }
}

await browser.close();
writeFileSync(join(outDir, 'page-measurements.json'), JSON.stringify({
  generatedAt: new Date().toISOString(),
  base: BASE,
  note: 'Measured with scripts/page-shots.mjs against `npm run preview` (dist/). Reduced motion on, deviceScaleFactor 1, rectangles read before any full-page capture.',
  results
}, null, 2));
process.stdout.write(`\nWrote ${join(outDir, 'page-measurements.json')} (${results.length} captures)\n`);
