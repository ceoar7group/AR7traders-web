// Hero measurement harness — the numbers behind pr-visuals/<date>/README.md.
//
// NOT part of `npm test`: it needs a real Chromium and a built site, so it is
// run by hand against `npm run preview`.
//
//   npm i --no-save puppeteer-core @sparticuz/chromium
//   npm run build && npm run preview        # http://127.0.0.1:4173
//   node scripts/hero-measure.mjs [--out pr-visuals/2026-10-07] [--shots]
//
// Method, deliberately fixed so the numbers are comparable across passes:
//   • deviceScaleFactor 1 — a 2x capture would report CSS px correctly but
//     makes the screenshots 4x the bytes for no extra information;
//   • one fresh page per viewport, storage cleared, so nothing carries over;
//   • `document.fonts.ready` + two animation frames BEFORE any rect is read,
//     because Manrope reflows the facts row when it lands;
//   • prefers-reduced-motion: reduce for the captures, so a timed grab cannot
//     photograph the first frames of a card swap;
//   • rectangles are read FIRST and the full-page screenshot LAST — a
//     full-page capture resizes the viewport, so measuring after it reports
//     the wrong numbers.
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import puppeteer from 'puppeteer-core';

const EXEC = process.env.CHROME_PATH || '/tmp/vchrome/chrome';
const BASE = process.env.BASE_URL || 'http://127.0.0.1:4173';
const args = process.argv.slice(2);
const outDir = args.includes('--out') ? args[args.indexOf('--out') + 1] : 'pr-visuals/2026-10-07';
const shots = args.includes('--shots');

const VIEWPORTS = [
  { name: '1440x900', width: 1440, height: 900 },
  { name: '1280x800', width: 1280, height: 800 },
  { name: '1024x768', width: 1024, height: 768 },
  { name: '768x1024', width: 768, height: 1024 },
  { name: '390x844', width: 390, height: 844 },
  { name: '360x740', width: 360, height: 740 }
];

// Injected into the page: the browser-side helper is named `rect` so the
// evaluate() bodies below can call it directly.
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
    const car = q('.hero-visual .car-main');
    const facts = q('.hero-visual .hero-facts');
    const hero = q('section.hero');
    const ticker = q('section.ticker');
    const visual = q('.hero-visual');
    const carBox = rect(car), factsBox = rect(facts);

    // Anything painted ON the photograph: an element inside .hero-visual that
    // is not the car card, not inside it, and overlaps its box. The prev/next
    // arrows are allowed (they are controls on the photo, by design) and are
    // reported separately.
    const overlays = carBox ? qa('.hero-visual *').filter(el => {
      if (el === car || car.contains(el) || el.contains(car)) return false;
      if (el.closest('.hero-carousel-controls')) return false;
      if (el.closest('.hero-facts')) return false;
      const b = el.getBoundingClientRect();
      if (!b.width || !b.height) return false;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden' || +cs.opacity === 0) return false;
      return b.left < carBox.right - 1 && b.right > carBox.left + 1 &&
             b.top < carBox.bottom - 1 && b.bottom > carBox.top + 1;
    }).map(el => el.className || el.tagName) : [];

    const arrows = rect(q('.hero-carousel-controls'));
    const lane = rect(q('.hero-facts .route-strip'));
    const chip = rect(q('.hero-facts .auction-chip'));

    return {
      innerWidth: window.innerWidth,
      scrollWidth: document.documentElement.scrollWidth,
      bodyScrollWidth: document.body.scrollWidth,
      car: carBox, facts: factsBox, heroVisual: rect(visual),
      hero: rect(hero), ticker: rect(ticker),
      routeStrip: lane, auctionChip: chip, arrows,
      overlayCount: overlays.length,
      overlays,
      vignettes: qa('.hero-vignette').length,
      floatingCards: qa('.floating-card').length,
      floatingBadges: qa('.floating-badge').length,
      sparks: qa('.spark').length,
      factsCards: qa('.hero-facts > *').length,
      demoTags: qa('.hero-facts .card-demo').length,
      rotationDots: qa('.hero-facts .card-rotation-dots').length,
      ctaAnchors: qa('.hero-cta a').map(a => a.getAttribute('href')),
      ctaButtons: qa('.hero-cta button').length,
      heroPhotoSrc: q('.hero-visual .hero-stack img.active')?.getAttribute('src') || null,
      factsText: (facts?.innerText || '').replace(/\\s+/g, ' ').trim().slice(0, 220),
      checks: {
        noHorizontalOverflow: document.documentElement.scrollWidth === window.innerWidth,
        heroBottomIsTickerTop: !!(hero && ticker) && Math.abs(hero.getBoundingClientRect().bottom - ticker.getBoundingClientRect().top) < 1.5,
        factsBelowCar: !!(carBox && factsBox) && factsBox.top >= carBox.bottom - 0.5,
        noOverlays: overlays.length === 0,
        noVignettes: qa('.hero-vignette').length === 0,
        noFloatingCards: qa('.floating-card').length === 0 && qa('.floating-badge').length === 0,
        noSparks: qa('.spark').length === 0,
        arrowsOnPhoto: !!(arrows && carBox) && arrows.top >= carBox.top - 1 && arrows.bottom <= carBox.bottom + 1,
        bothCtasAreAnchors: qa('.hero-cta a').length === 2 && qa('.hero-cta button').length === 0,
        bothDemoTags: qa('.hero-facts .card-demo').length === 2
      }
    };
  })()`);
}

/** Same page, dark theme applied the way the site applies it, plus motion. */
async function themeChecks(page) {
  const dark = await page.evaluate(`(() => {
    ${rect}
    // The site's own switch: localStorage['ar7-theme'] -> <html data-theme>.
    document.documentElement.dataset.theme = 'dark';
    const chip = document.querySelector('.hero-facts .auction-chip');
    const strip = document.querySelector('.hero-facts .route-strip');
    const cs = el => { const c = getComputedStyle(el);
      return { bg: c.backgroundColor, color: c.color, border: c.borderTopColor }; };
    return { chip: cs(chip), strip: cs(strip), body: cs(document.body) };
  })()`);
  await page.evaluate(() => document.documentElement.removeAttribute('data-theme'));

  const motion = await page.evaluate(`(() => {
    const anims = (document.querySelector('.hero-facts')?.getAnimations({subtree:true}) || [])
      .map(a => ({ name: a.animationName || a.transitionProperty || '(anon)',
                   state: a.playState }));
    const lane = document.querySelector('.route-strip .progress span');
    const ship = document.querySelector('.route-strip .route-ship');
    const live = document.querySelector('.hero-facts .card-live');
    const cs = el => el ? getComputedStyle(el) : null;
    return {
      laneAnimation: cs(lane)?.animationName, shipAnimation: cs(ship)?.animationName,
      liveAnimation: cs(live)?.animationName,
      laneWidthVar: cs(lane)?.getPropertyValue('--route-progress')?.trim(),
      laneWidth: cs(lane)?.width,
      runningAnimations: anims.filter(a => a.state === 'running').map(a => a.name)
    };
  })()`);
  return { dark, motion };
}

const browser = await puppeteer.launch({
  executablePath: EXEC,
  headless: 'new',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage',
         '--font-render-hinting=none', '--force-color-profile=srgb']
});

const results = [];
for (const vp of VIEWPORTS) {
  const page = await browser.newPage();
  await page.setViewport({ width: vp.width, height: vp.height, deviceScaleFactor: 1 });
  await page.emulateMediaFeatures([
    { name: 'prefers-reduced-motion', value: 'reduce' },
    { name: 'prefers-color-scheme', value: 'light' }
  ]);
  await page.goto(BASE + '/', { waitUntil: 'networkidle2', timeout: 60000 });
  await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  try { await page.evaluateHandle('document.fonts.ready'); } catch {}
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  await new Promise(r => setTimeout(r, 700));

  const light = await measure(page);
  const themes = await themeChecks(page);

  // Reduced motion, measured for real on a fresh page.
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  try { await page.evaluateHandle('document.fonts.ready'); } catch {}
  await new Promise(r => setTimeout(r, 400));
  const reduced = await page.evaluate(`(() => {
    const lane = document.querySelector('.route-strip .progress span');
    const ship = document.querySelector('.route-strip .route-ship');
    const live = document.querySelector('.hero-facts .card-live');
    const cs = el => el ? getComputedStyle(el) : null;
    const running = (document.querySelector('.hero-facts')?.getAnimations({subtree:true}) || [])
      .filter(a => a.playState === 'running').map(a => a.animationName || a.transitionProperty);
    return { laneAnimation: cs(lane)?.animationName, shipAnimation: cs(ship)?.animationName,
             liveAnimation: cs(live)?.animationName, laneWidth: cs(lane)?.width,
             runningFactAnimations: running };
  })()`);

  // Dark theme on a fresh page: seed localStorage the way the toggle does, so
  // the app itself paints dark rather than us poking the attribute after mount.
  await page.evaluate(() => localStorage.setItem('ar7-theme', 'dark'));
  await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
  try { await page.evaluateHandle('document.fonts.ready'); } catch {}
  await new Promise(r => setTimeout(r, 400));
  const darkShot = await measure(page);
  const darkColors = await page.evaluate(`(() => {
    const cs = el => { const c = getComputedStyle(el);
      return { bg: c.backgroundColor, color: c.color, border: c.borderTopColor }; };
    const q = s => document.querySelector(s);
    return { theme: document.documentElement.getAttribute('data-theme'),
             strip: cs(q('.hero-facts .route-strip')), chip: cs(q('.hero-facts .auction-chip')),
             kicker: cs(q('.hero-facts .card-kicker')), title: cs(q('.hero-facts .card-title')),
             eta: cs(q('.hero-facts .lane-eta')), body: cs(document.body) };
  })()`);

  const entry = { viewport: vp.name, width: vp.width, height: vp.height, light, themes, reduced, darkShot, darkColors };
  results.push(entry);

  if (shots) {
    mkdirSync(outDir, { recursive: true });
    // Viewport shot FIRST (rectangles are already read above). Storage is
    // cleared again here: the dark pass below seeds localStorage['ar7-theme'],
    // and without this the next viewport's "light" capture would come up dark.
    await page.emulateMediaFeatures([
      { name: 'prefers-reduced-motion', value: 'reduce' },
      { name: 'prefers-color-scheme', value: 'light' }
    ]);
    await page.evaluate(() => { try { localStorage.clear(); sessionStorage.clear(); } catch {} });
    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
    try { await page.evaluateHandle('document.fonts.ready'); } catch {}
    await new Promise(r => setTimeout(r, 500));
    const heroClip = await page.evaluate(`(() => {
      const h = document.querySelector('section.hero'); const b = h.getBoundingClientRect();
      return { x: 0, y: Math.max(0, b.top - 4), width: window.innerWidth,
               height: Math.min(window.innerHeight, b.height + 8) };
    })()`);
    await page.screenshot({ path: join(outDir, `hero-${vp.name}.jpg`), clip: heroClip, quality: 86, type: 'jpeg' });
    const factsClip = await page.evaluate(`(() => {
      const f = document.querySelector('.hero-visual'); const b = f.getBoundingClientRect();
      return { x: Math.max(0, Math.floor(b.left - 6)), y: Math.max(0, Math.floor(b.top - 6)),
               width: Math.ceil(b.width + 12), height: Math.ceil(b.height + 12) };
    })()`);
    await page.screenshot({ path: join(outDir, `hero-visual-${vp.name}.jpg`), clip: factsClip, quality: 88, type: 'jpeg' });
    await page.screenshot({ path: join(outDir, `fullpage-${vp.name}.jpg`), fullPage: true, quality: 80, type: 'jpeg' });
    // Dark theme capture, last: seeded through localStorage so the app paints it.
    await page.evaluate(() => localStorage.setItem('ar7-theme', 'dark'));
    await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
    try { await page.evaluateHandle('document.fonts.ready'); } catch {}
    await new Promise(r => setTimeout(r, 600));
    const darkClip = await page.evaluate(`(() => {
      const h = document.querySelector('section.hero'); const b = h.getBoundingClientRect();
      return { x: 0, y: Math.max(0, b.top - 4), width: window.innerWidth,
               height: Math.min(window.innerHeight, b.height + 8) };
    })()`);
    await page.screenshot({ path: join(outDir, `hero-dark-${vp.name}.jpg`), clip: darkClip, quality: 86, type: 'jpeg' });
  }
  await page.close();
  process.stdout.write(`measured ${vp.name}\n`);
}

await browser.close();
mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, 'hero-measurements.json'), JSON.stringify(results, null, 2));

// ---- the contract, asserted so a regression fails loudly -------------------
let bad = 0;
for (const r of results) {
  const c = r.light.checks;
  for (const [k, v] of Object.entries(c)) {
    if (!v) { bad++; console.log(`FAIL ${r.viewport} ${k}`); }
  }
  if (r.darkColors.theme !== 'dark') { bad++; console.log(`FAIL ${r.viewport} dark theme did not apply (got ${r.darkColors.theme})`); }
  if (r.reduced.runningFactAnimations.length) {
    bad++; console.log(`FAIL ${r.viewport} reduced-motion still animating: ${r.reduced.runningFactAnimations.join(', ')}`);
  }
}
console.log(`\n${results.length} viewports measured, ${bad} contract failures`);
console.log('viewport    car (w×h)      facts h   strip×chip      overflow  hero=ticker  facts>=car  overlays');
for (const r of results) {
  const l = r.light;
  console.log(
    `${r.viewport.padEnd(11)} ${(l.car?.width + '×' + l.car?.height).padEnd(14)} ` +
    `${String(l.facts?.height).padEnd(9)} ${(Math.round(l.routeStrip?.width) + '×' + Math.round(l.auctionChip?.width)).padEnd(15)} ` +
    `${String(l.checks.noHorizontalOverflow).padEnd(11)} ${String(l.checks.heroBottomIsTickerTop).padEnd(12)} ` +
    `${String(l.checks.factsBelowCar).padEnd(11)} ${l.overlayCount}`);
}
process.exit(bad ? 1 : 0);
