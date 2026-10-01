#!/usr/bin/env node
// Guard: the public site never names or links to the dealer-stock source.
//
//   node scripts/public-source.test.mjs
//
// The owner's rule (2026-10): no goo-net.com string in customer-facing markup,
// meta, JSON-LD or llms.txt, and no link back to the original listing from the
// public app. Service-level marketing copy on the services/trade pages is
// deliberate SEO and stays; the Japan dealer stock page, the shell HTML,
// llms.txt and the meta titles must not carry the source name.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name); }
}
const read = p => readFileSync(fileURLToPath(new URL('../' + p, import.meta.url)), 'utf8');
// The source's brand name — not the internal endpoint id (/api/goonet-stock).
const SOURCE_NAME = /goo-?net(?![-_a-z])/i;

const main = read('src/main.jsx');
const html = read('index.html');
const llms = read('public/llms.txt');
const robots = read('public/robots.txt');
const seo = read('src/seo.js');
const sitemap = read('public/sitemap.xml');

console.log('\n-- no source links in the public app --');
ok(!/goonet_url/.test(main), 'src/main.jsx never reads goonet_url (the deleted Goo-net card/lightbox links stay deleted)');
ok(!/goo-net\.com/i.test(main.replace(/https:\/\/picture1\.goo-net\.com\/[^'"\s]*/g, '')),
  'no goo-net.com URL in src/main.jsx outside stored photo data');
ok(!/goo-net\.com/i.test(html), 'index.html links no goo-net.com URL');
ok(!/goo-net\.com/i.test(seo), 'src/seo.js names no goo-net.com URL');

console.log('\n-- the source is not named in customer-facing copy or meta --');
const japanStock = main.slice(main.indexOf('function JapanStockPage'), main.indexOf('function InnerPage'));
ok(japanStock.length > 0, 'the JapanStockPage source block was found');
ok(!SOURCE_NAME.test(japanStock), 'the Japan dealer stock page copy never names the source');
ok(!/Goo-?\s?net/i.test(html), 'index.html copy never names the source');
ok(!/Goo-?\s?net/i.test(llms), 'public/llms.txt never names the source');
ok(!/Goo-?\s?net/i.test(robots), 'public/robots.txt never names the source');
ok(!/Goo-?\s?net/i.test(sitemap), 'the sitemap never names the source');
ok(!/Goo-?\s?net/i.test(seo), 'meta titles/descriptions never name the source');
ok(/LIVE JAPAN DEALER STOCK/.test(japanStock), 'the Japan dealer stock kicker reads as Japan stock, not as the source');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
