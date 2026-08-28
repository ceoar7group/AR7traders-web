#!/usr/bin/env node
// Regression tests for the goo-net scraper core (scripts/goonet-core.mjs).
// Run: node scripts/goonet-core.test.mjs
import {
  manToYen, yenToUsd, kmToNumber, seatsNumber, fullWidthToHalf,
  detectMake, detectModel, detectPrefecture, detectBody, detectFuel,
  extractStockFromUrl, extractCarImages, extendGallery,
  parseListingPage, parseDetailPage, mergeCardAndDetail, qualityScore,
  isDelistedPage, listingPageUrlFor, after, numberAfter, ratingAfter,
  BRAND_MAP, MODEL_MAP
} from './goonet-core.mjs';

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name); }
}
function eq(a, b, name) {
  const same = JSON.stringify(a) === JSON.stringify(b);
  if (same) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error(`  ✗ ${name}\n      expected ${JSON.stringify(b)}\n      received ${JSON.stringify(a)}`); }
}

// ---- Price / mileage / number helpers -------------------------------------
eq(manToYen('34.8万円'), 348000, 'manToYen 34.8万円');
eq(manToYen('311万円'), 3110000, 'manToYen 311万円');
eq(manToYen('6,200円'), null, 'manToYen rejects plain yen amounts');
eq(yenToUsd(348000), 2366, 'yenToUsd at default 0.0068');
eq(kmToNumber('13.8万km'), '138000', 'kmToNumber 13.8万km');
eq(kmToNumber('1.3万km'), '13000', 'kmToNumber 1.3万km');
eq(kmToNumber('45,000km'), '45000', 'kmToNumber plain km');
eq(seatsNumber('５名'), 5, 'seatsNumber full-width');
eq(fullWidthToHalf('５名'), '5名', 'fullWidthToHalf');

// ---- Brand / model detection ----------------------------------------------
eq(detectMake('日産'), 'Nissan', 'detectMake Nissan');
eq(detectMake('トヨタ'), 'Toyota', 'detectMake Toyota');
eq(detectMake('マツダ'), 'Mazda', 'detectMake Mazda');
eq(detectMake('BMW'), 'BMW', 'detectMake BMW latin');
ok(!detectMake('スーパーカー'), 'detectMake unknown → null');
eq(detectModel('ノート ｅ－パワー　Ｘ　６ヶ月走行距離無制限保証付', 'Nissan'), 'Note', 'detectModel Note');
eq(detectModel('アルファード ２．５Ｓ　Ｃパッケージ　６…', 'Toyota'), 'Alphard', 'detectModel Alphard');
eq(detectModel('ＣＸ－３ ＸＤ　ツーリング　６速マニュアル', 'Mazda'), 'CX-3', 'detectModel CX-3');
eq(detectPrefecture('住所：岐阜県可児市土田２５４５－２９３'), '岐阜県', 'detectPrefecture Gifu');
eq(detectBody('ミニバン・ワンボックス'), 'MPV', 'detectBody MPV');
eq(detectFuel('ハイブリッド'), 'Hybrid', 'detectFuel Hybrid');

// ---- Gallery helpers -------------------------------------------------------
eq(extendGallery(['https://picture1.goo-net.com/020/0208975/Q/0208975A20260628D00201.jpg',
  'https://picture1.goo-net.com/020/0208975/Q/0208975A20260628D00203.jpg']).length, 2,
  'extendGallery leaves sparse sets alone');
eq(extendGallery(['https://picture1.goo-net.com/020/0208975/Q/0208975A20260628D00201.jpg',
  'https://picture1.goo-net.com/020/0208975/Q/0208975A20260628D00202.jpg',
  'https://picture1.goo-net.com/020/0208975/Q/0208975A20260628D00203.jpg',
  'https://picture1.goo-net.com/020/0208975/Q/0208975A20260628D00204.jpg']).length, 4,
  'extendGallery keeps dense sets');
eq(extractStockFromUrl('https://www.goo-net.com/usedcar/spread/goo/15/988026062900208975002.html'),
  '988026062900208975002', 'extractStockFromUrl');
eq(listingPageUrlFor('https://www.goo-net.com/usedcar/price-100-300/', 1),
  'https://www.goo-net.com/usedcar/price-100-300/', 'page 1 → base URL');
eq(listingPageUrlFor('https://www.goo-net.com/usedcar/price-100-300/', 2),
  'https://www.goo-net.com/usedcar/price-100-300/index-2.html', 'page 2 → index-2');

// ---- Listing page parse ----------------------------------------------------
const listingHtml = `
<html><body>
<div class="searchResult">
  <a href="https://www.goo-net.com/usedcar/spread/goo/15/988026062900208975002.html"><img src="https://picture1.goo-net.com/9880260629/00208975/J/98802606290020897500200.jpg"></a>
  <a href="https://www.goo-net.com/usedcar/spread/goo/15/988026062900208975002.html#2"><img src="https://picture1.goo-net.com/020/0208975/Q/0208975A20260628D00201.jpg"></a>
  <a href="https://www.goo-net.com/usedcar/spread/goo/15/988026062900208975002.html#3"><img src="https://picture1.goo-net.com/020/0208975/Q/0208975A20260628D00202.jpg"></a>
  <p>日産</p>
  <h3><a href="https://www.goo-net.com/usedcar/spread/goo/15/988026062900208975002.html">ノート ｅ－パワー　Ｘ　６ヶ月走行距離無制限保証付　メモリーナビ</a></h3>
  <p>支払総額(税込)(リ済込)</p><p>43.1万円</p>
  <p>車両本体価格(税込)</p><p>34.8万円</p>
  <p>年式2018年</p><p>走行距離13.8万km</p><p>車検2028年4月</p><p>修復歴なし</p>
  <p>排気量1200cc</p><p>ミッションAT</p>
  <p>外装 <span>4</span></p><p>内装 <span>4</span></p>
  <p>住所：岐阜県可児市</p>
</div>
<div class="searchResult">
  <a href="https://www.goo-net.com/usedcar/spread/goo/15/988026081900208975001.html"><img src="https://picture1.goo-net.com/9880260819/00208975/J/98802608190020897500100.jpg"></a>
  <a href="https://www.goo-net.com/usedcar/spread/goo/15/988026081900208975001.html#2"><img src="https://picture1.goo-net.com/020/0208975/Q/0208975A20260628D00101.jpg"></a>
  <a href="https://www.goo-net.com/usedcar/spread/goo/15/988026081900208975001.html#3"><img src="https://picture1.goo-net.com/020/0208975/Q/0208975A20260628D00102.jpg"></a>
  <p>ホンダ</p>
  <h3><a href="https://www.goo-net.com/usedcar/spread/goo/15/988026081900208975001.html">Ｎ－ＢＯＸ Ｇ　ＳＳパッケージ</a></h3>
  <p>車両本体価格(税込)</p><p>44.8万円</p>
  <p>年式2014年</p><p>走行距離7.1万km</p><p>排気量660cc</p><p>ミッションCVT</p>
</div>
</body></html>`;
const page = parseListingPage(listingHtml, 'https://www.goo-net.com/usedcar/price-100-300/');
eq(page.cars.length, 2, 'listing page parses 2 cards');
const c1 = page.cars[0];
eq(c1.make, 'Nissan', 'card 1 make');
eq(c1.model, 'Note', 'card 1 model');
eq(c1.year, 2018, 'card 1 year');
eq(c1.km, '138000', 'card 1 km');
eq(c1.price_jpy, 348000, 'card 1 price_jpy (本体価格 wins)');
eq(c1.tr, 'AT', 'card 1 transmission');
eq(c1.eng, '1,200cc', 'card 1 engine formatted');
eq(c1.location, '岐阜県', 'card 1 location');
eq(c1.ext_rating, 4, 'card 1 exterior rating');
eq(c1.int_rating, 4, 'card 1 interior rating');
ok(c1.photo_count >= 3, 'card 1 has thumbnails');
ok(c1.url.includes('988026062900208975002.html'), 'card 1 url');

// ---- Detail page parse -----------------------------------------------------
const detailHtml = `
<html><head><title>日産 ノート</title></head><body>
<h1>日産 ノート ｅ－パワー　Ｘ　６ヶ月走行距離無制限保証付　メモリーナビ（岐阜県）の中古車販売情報</h1>
<img src="https://picture1.goo-net.com/9880260629/00208975/J/98802606290020897500200.jpg">
<img src="https://picture1.goo-net.com/020/0208975/Q/0208975A20260628D00201.jpg">
<img src="https://picture1.goo-net.com/020/0208975/Q/0208975A20260628D00202.jpg">
<img src="https://picture1.goo-net.com/020/0208975/Q/0208975A20260628D00203.jpg">
<img src="https://picture1.goo-net.com/020/0208975/Q/0208975A20260628D00204.jpg">
<img src="https://picture1.goo-net.com/020/0208975/Q/0208975A20260628D00205.jpg">
<table>
<tr><th>走行距離</th><td>13.8万km</td><th>修復歴</th><td>なし</td></tr>
<tr><th>登録済未使用車</th><td>－</td><th>禁煙車</th><td>○</td></tr>
</table>
<table>
<tr><th>年式(初度登録)</th><td>2018(平成30)年</td><th>ハンドル</th><td>右</td></tr>
<tr><th>排気量</th><td>1200cc</td><th>乗車定員</th><td>５名</td></tr>
<tr><th>駆動方式</th><td>2WD</td><th>燃料</th><td>ハイブリッド</td></tr>
<tr><th>ドア</th><td>5D</td><th>ミッション</th><td>AT</td></tr>
<tr><th>車体色</th><td>ブリリアントホワイトパール</td><th>車台番号下３桁</th><td>276</td></tr>
</table>
</body></html>`;
const d = parseDetailPage(detailHtml, 'https://www.goo-net.com/usedcar/spread/goo/15/988026062900208975002.html');
eq(d.make, 'Nissan', 'detail make');
eq(d.year, 2018, 'detail year');
eq(d.km, '138000', 'detail km');
eq(d.fuel, 'Hybrid', 'detail fuel');
eq(d.st, 'RHD', 'detail steering 右');
eq(d.drv, '2WD', 'detail drivetrain');
eq(d.eng, '1,200cc', 'detail engine');
eq(d.seats, 5, 'detail seats');
eq(d.tr, 'AT', 'detail transmission');
eq(d.col, 'ブリリアントホワイトパール', 'detail colour');
eq(d.repair_history, 'No', 'detail repair history なし');
ok(d.photo_count >= 5, 'detail photo count from gallery');

// ---- Merge + quality gate --------------------------------------------------
const merged = mergeCardAndDetail(c1, d);
eq(merged.fuel, 'Hybrid', 'merge takes detail fuel');
eq(merged.price_jpy, 348000, 'merge keeps card price when detail lacks one');
const q = qualityScore(merged, { minPhotos: 5 });
ok(q.pass, 'quality gate passes with 5+ photos and complete data');
ok(q.score >= 60, 'quality score is high for a clean car');
eq(q.photo_count, merged.photo_count, 'quality gate reports photo count');

// ---- Delist detection ------------------------------------------------------
ok(isDelistedPage({ status: 404 }), 'delist: HTTP 404');
ok(isDelistedPage({ status: 200, html: 'ページが見つかりません。　Not,found.' }), 'delist: not-found page text');
ok(isDelistedPage({ status: 200, html: 'このクルマは2026/08/29まで掲載されていた車両です' }), 'delist: end-of-listing notice');
ok(!isDelistedPage({ status: 200, html: '<h1>日産 ノート</h1>' }), 'not delisted: live page');
ok(!isDelistedPage({ status: 0, html: '' }), 'not delisted: network failure (never unpublish on a hiccup)');

// ---- Small helpers ---------------------------------------------------------
eq(after('年式2018年 走行距離13.8万km', '年式'), '2018年', 'after() year');
eq(numberAfter('年式2018年', '年式'), 2018, 'numberAfter() year');
eq(ratingAfter('外装 4 内装 4', '外装'), 4, 'ratingAfter() exterior');
eq(ratingAfter('外装 **4**内装 **4**', '内装'), 4, 'ratingAfter() interior in bold-markdown text');
ok(Object.keys(BRAND_MAP).length > 30, 'brand map is populated');
ok(Object.keys(MODEL_MAP).length > 40, 'model map is populated');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
