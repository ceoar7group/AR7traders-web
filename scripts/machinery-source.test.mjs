#!/usr/bin/env node
// Machinery source adapter tests (npm run test:machinery-source).
//
// Pins the 2026-10 scraper improvements against the owner's reference page —
// the Made-in-China Cat 320D listing
//   fr.made-in-china.com/co_zhongxingmachinery/product_Large-Tracked-Second-Hand-
//   Excavator-…-Cat-320d-20ton-…-Usada-Excavadora-for-Sale_ysnyorrhgy.html
// reproduced in scripts/fixtures/made-in-china-cat320d.html with its own
// values (French-locale tiered price "25 000,00 $US", the product-details
// table, the image.made-in-china.com gallery and the dl/dt/dd "Info de Base"
// spec block). Direct network fetches are not possible from the test runner,
// so the fixture stands in for the live page byte-for-byte where it matters.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
const bad = s => process.stderr.write(s + '\n');
const ok = (cond, msg) => { if (cond) { pass++; say('  ✓ ' + msg); } else { fail++; bad('  ✗ ' + msg); } };
const eq = (a, b, msg) => ok(a === b, a === b ? msg : `${msg} (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`);

const {
  extractProduct, classify, toMachine, reviewPhotos, parseAmount,
  looksWatermarked, WATERMARK_CDNS, RIGHTS, rightsAreUsable
} = await import('../src/machinery-source.js');

// ---- parseAmount: the price formats marketplaces actually print -------------
say('\n-- price amount parsing --');
eq(parseAmount('25,000.00'), 25000, 'en format: 25,000.00');
eq(parseAmount('25 000,00'), 25000, 'fr format with space thousands: 25 000,00');
eq(parseAmount('25\u00a0000,00'), 25000, 'fr format with a no-break space');
eq(parseAmount('1.234,56'), 1234.56, 'dot thousands + decimal comma: 1.234,56');
eq(parseAmount('25000'), 25000, 'bare number');
eq(parseAmount('50,000'), 50000, 'en thousands comma stays a thousands comma');
eq(parseAmount(''), null, 'nothing in, nothing out');

// ---- watermark detection ----------------------------------------------------
say('\n-- watermark detection --');
ok(looksWatermarked('https://sc04.alicdn.com/kf/abc/used-excavator.jpg'), 'Alibaba sc04.alicdn.com is always flagged');
ok(looksWatermarked('https://image.made-in-china.com/202f0j00abc/excavator.webp'), 'the Made-in-China product image CDN is flagged');
ok(WATERMARK_CDNS.includes('sc04.alicdn.com') && WATERMARK_CDNS.includes('image.made-in-china.com'),
  'the known watermark CDN list is documented and exported');
ok(looksWatermarked('https://supplier.example/img/cat320-watermark.jpg'), 'a "watermark" stem in the URL is flagged');
ok(looksWatermarked('https://supplier.example/img/wm_cat320.jpg'), 'a wm_ prefix is flagged');
ok(looksWatermarked('https://supplier.example/img/cat320_wm.jpg'), 'a _wm. stem is flagged');
ok(looksWatermarked('https://supplier.example/img/cat320-logo_overlay.jpg'), 'a logo_overlay stem is flagged');
ok(!looksWatermarked('https://supplier.example/img/cat320-clean.jpg'), 'a clean URL is not flagged');
ok(!looksWatermarked('/assets/machinery/doosan-dx300lc-1.webp'), 'our own asset paths are not flagged');
ok(!looksWatermarked(''), 'an empty src is not flagged');

// ---- the owner's Made-in-China page ----------------------------------------
say('\n-- extractProduct on the Made-in-China Cat 320D page --');
const MIC_URL = 'https://fr.made-in-china.com/co_zhongxingmachinery/product_Large-Tracked-Second-Hand-Excavator-Japanese-Made-Industrial-Machinery-Digger-Cat-320d-20ton-Cat320-305-306-307-308-312-315-320d-Usada-Excavadora-for-Sale_ysnyorrhgy.html';
const html = readFileSync(path.join(root, 'scripts/fixtures/made-in-china-cat320d.html'), 'utf8');
const product = extractProduct(html, MIC_URL);

ok(/Cat 320d/i.test(product.title), `the French product title was read (${product.title.slice(0, 60)}…)`);
eq(product.priceOriginal, 25000, 'the French-formatted price "25 000,00 $US" reads as 25000');
eq(product.currency, 'USD', 'the currency is USD');
eq(product.priceUSD, 25000, 'the USD price is usable for the markup');

ok(product.images.length >= 6, `the gallery was found (${product.images.length} photos)`);
ok(product.images.every(u => !/transparent\.png/i.test(u)), 'no lazy-load placeholder pixel sneaks into the gallery');
ok(product.images.some(u => /image\.made-in-china\.com/.test(u)), 'the gallery images are the marketplace-hosted ones');

const spec = Object.fromEntries(product.specs);
ok(spec['Capacité du godet'] === '1,0 ~ 1.5m³', `dl/dt/dd specs are extracted ("Capacité du godet" = "${spec['Capacité du godet']}")`);
ok(spec['Garantie'] === '1 an', 'the tr/td product-details table is still read');
ok(spec['Type'] === 'Pelle sur Chenilles', 'the machine type row survived the dl scan');
ok(Object.keys(spec).length >= 10, `a full spec sheet came off the page (${Object.keys(spec).length} rows)`);

eq(product.year, 2024, 'the year comes from the "année" spec row, not the ISO9001: 2000 noise');

const { brand, type } = classify(product.title, product.specs);
eq(brand, 'Caterpillar', 'the brand is classified from the spec sheet ("caterpillar" in the product name row)');
eq(type, 'Excavators', 'the type is classified from the title');

// ---- 2026-10-04: watermark filtering happens at import time ------------------
// Owner policy: watermarked images are filtered out during toMachine(). The
// reviewPhotos check is for non-watermark quality issues on the surviving photos.
say('\n-- watermarked marketplace photos are filtered at import --');
const machine = toMachine(product, { markup: 0.25, rights: 'supplier-permission', adapter: 'product-page' });
// The fixture's images are all on image.made-in-china.com (a watermark CDN),
// so they are filtered out. The machine still imports with its facts.
ok(machine.images.length === 0, 'watermarked marketplace photos are filtered out at import');
ok(machine.skippedPhotos > 0, 'the skipped count records how many were filtered');
ok(machine.source.rights === 'supplier-permission', 'the rights basis is still recorded even when photos were skipped');
// reviewPhotos checks the quality of existing photos, not whether photos exist.
// With zero surviving photos, reviewPhotos passes (nothing to review).
// The machine is still importable — photosPending is set separately.
const review = reviewPhotos(machine);
ok(machine.photosPending === true, 'photosPending is set when no photos survived the watermark filter');
ok(review.pass === true, 'reviewPhotos passes with zero images (nothing to flag)');

const hosted = { name: 'Doosan DX300LC-9C Crawler Excavator', year: 2023,
  images: ['/assets/machinery/doosan-dx300lc-1.webp', '/assets/machinery/doosan-dx300lc-2.webp'] };
const cleanReview = reviewPhotos(hosted);
ok(cleanReview.pass && cleanReview.flags.length === 0, 'a self-hosted recent gallery with two photos passes');

// 2026-10-04: owner policy — default basis is dropship-authorized, so even
// with rights:null the images still get through (subject to watermark filter).
const factsOnly = toMachine(product, { markup: 0.25, rights: null, adapter: 'product-page' });
ok(factsOnly.source.rights === 'dropship-authorized', 'with no explicit basis the default is dropship-authorized');
// The fixture images are all watermarked (image.made-in-china.com), so they
// are filtered regardless of the rights basis.
eq(factsOnly.images.length, 0, 'the fixture images are all watermarked so none survive the filter');
eq(factsOnly.photosPending, true, 'and the machine waits for photos instead');
ok(factsOnly.supplierPrice === 25000, 'the facts still import — the price survives a facts-only import');
ok(rightsAreUsable('dropship-authorized') && RIGHTS.includes('dropship-authorized'),
  'dropship-authorized remains a recorded rights basis for supplier-authorized image use');

// ---- a dl-only page (no tables at all) --------------------------------------
say('\n-- dl-only spec pages --');
const dlOnly = extractProduct('<html><head><title>Used Sany SY215C Excavator 2021</title></head><body>'
  + '<dl><dt>Model</dt><dd>SY215C</dd><dt>Year</dt><dd>2021</dd><dt>Operating weight</dt><dd>21,900 kg</dd></dl>'
  + '</body></html>');
eq(dlOnly.specs.length, 3, 'a page whose specs live only in a dl yields all of them');
eq(dlOnly.year, 2021, 'and the labelled year is read');

say(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
