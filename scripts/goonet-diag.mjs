#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import {
  parseListingPage, countSpreadLinks, detectMake, after, numberAfter,
  ratingAfter, manToYen, kmToNumber, extractCarImages, pageDiagnostics
} from './goonet-core.mjs';

const file = process.argv[2] || 'page4.html';
const html = readFileSync(file, 'utf8');
const url = 'https://www.goo-net.com/usedcar/price--100/index-4.html';

console.log('bytes       :', html.length);
console.log('diagnostics :', JSON.stringify(pageDiagnostics(html)));
console.log('car links   :', countSpreadLinks(html));
const p = parseListingPage(html, url);
console.log('parsed cards:', p.cars.length, '· parseStatus:', p.diagnostics?.parseStatus);

const re = /https:\/\/www\.goo-net\.com\/usedcar\/spread\/goo\/\d+\/([A-Za-z0-9]+)\.html/g;
const seen = new Map();
let m;
while ((m = re.exec(html))) if (!seen.has(m[1])) seen.set(m[1], m.index);
const segs = [...seen.entries()].map(([stock, start]) => ({ stock, start })).sort((a, b) => a.start - b.start);

console.log('\n  #  stock                  h3-link  make   price    km     year  ext int imgs');
for (let i = 0; i < Math.min(segs.length, 12); i++) {
  const chunk = html.slice(segs[i].start, i + 1 < segs.length ? segs[i + 1].start : html.length);
  const title = chunk.match(/<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]*spread[^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/);
  const make = detectMake(chunk);
  const price = manToYen(after(chunk, '車両本体価格', v => /万円/.test(v)) || after(chunk, '支払総額', v => /万円/.test(v)));
  console.log([
    String(i + 1).padStart(2), segs[i].stock.slice(0, 21).padEnd(21),
    title ? 'yes' : 'NO ', make || '—', price || '—',
    kmToNumber(after(chunk, '走行距離', v => /km/i.test(v))) || '—',
    numberAfter(chunk, '年式') || '—', ratingAfter(chunk, '外装') || '—',
    ratingAfter(chunk, '内装') || '—', extractCarImages(chunk).length
  ].join('  '));
}
console.log('\nA card is DROPPED when h3-link, make and price are all "—"');
console.log('(parseCard: if (!title && !make && !priceJpy) return null). Fix the matcher that prints "—".');
