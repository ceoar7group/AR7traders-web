#!/usr/bin/env node
// Regression tests for the goo-net scraper core (scripts/goonet-core.mjs).
// Run: node scripts/goonet-core.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  manToYen, yenToUsd, kmToNumber, seatsNumber, fullWidthToHalf,
  detectMake, detectModel, detectPrefecture, detectBody, detectFuel, bodyForModel,
  extractStockFromUrl, extractCarImages, extendGallery,
  parseListingPage, parseDetailPage, mergeCardAndDetail, qualityScore,
  isDelistedPage, listingPageUrlFor, after, numberAfter, ratingAfter,
  BRAND_MAP, MODEL_MAP,
  countSpreadLinks, looksLikeStub, botGateMarkers, pageDiagnostics, fetchPage, resetFetchState,
  relayBaseUrl, relayApiKey,
  llmConfigured, extractCardsWithLlm, markupSample, EVIDENCE_SAMPLE_BYTES,
  rawYen, priceTextToYen,
  FALLBACK_SEARCH_URL, JINA_RELAY, UA
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

// ---- Live capture: goo-net listing page as served on 2026-08-31 -------------
// scripts/fixtures/goonet-listing-live.html is a trimmed copy of a real
// /usedcar/price-100-300/index-2.html. It carries the shapes the synthetic
// fixture above does not: a bare "年式2019後", a "車検車検整備付" label, an
// in-card shop block, and a shop logo under /shop/.../S/.
const liveHtml = readFileSync(fileURLToPath(new URL('./fixtures/goonet-listing-live.html', import.meta.url)), 'utf8');
const live = parseListingPage(liveHtml, 'https://www.goo-net.com/usedcar/price-100-300/index-2.html');
eq(live.cars.length, 3, 'live listing page parses all 3 cards');
const live1 = live.cars[0];
eq(live1.make, 'Mazda', 'live card 1 make');
eq(live1.model, 'Atenza', 'live card 1 model (アテンザ → Atenza)');
eq(live1.year, 2019, 'live card 1 year parses from the bare "年式2019後"');
eq(live1.km, '47000', 'live card 1 mileage');
eq(live1.price_jpy, 1999000, 'live card 1 uses 車両本体価格, not 支払総額');
eq(live1.eng, '2,200cc', 'live card 1 engine');
eq(live1.location, '愛知県', 'live card 1 prefecture comes from the shop address');
eq(live1.repair_history, 'No', 'live card 1 repair history');
ok(!live1.images.some(u => u.includes('/shop/') || /\/[PS]\//.test(u)), 'live card 1 excludes the shop logo');
eq(live1.photo_count, 4, 'live card 1 counts its 4 real photos');
const live2 = live.cars[1];
eq(live2.year, 2017, 'live card 2 year');
eq(live2.model, 'Corolla Fielder', 'live card 2 model (カローラフィールダー → Corolla Fielder)');
eq(live2.km, '94000', 'live card 2 mileage parsed past "車検車検整備付"');
eq(live.cars[2].year, 2022, 'live card 3 year');
eq(live.cars[2].model, 'N-BOX', 'live card 3 model');
ok(live.cars.every(c => qualityScore(c, { minPhotos: 4 }).reasons.every(r => !r.startsWith('no/old year'))),
  'no live card is rejected for a missing year');
eq(detectModel('カローラクロス Ｚ', 'Toyota'), 'Corolla Cross', 'longest model name wins over its prefix');
eq(detectModel('ランドクルーザープラド ＴＸ', 'Toyota'), 'Land Cruiser Prado', 'プラド is not shadowed by ランドクルーザー');

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
eq(d.body, 'Hatchback', 'detail body derived from the model map (real goo-net pages print no ボディタイプ row)');
eq(d.st, 'RHD', 'detail steering 右');
eq(d.drv, '2WD', 'detail drivetrain');
eq(d.eng, '1,200cc', 'detail engine');
eq(d.seats, 5, 'detail seats');
eq(d.tr, 'AT', 'detail transmission');
eq(d.col, 'ブリリアントホワイトパール', 'detail colour');
eq(d.repair_history, 'No', 'detail repair history なし');
ok(d.photo_count >= 5, 'detail photo count from gallery');

// ---- Body derivation from the model map -------------------------------------
eq(bodyForModel('プリウス'), 'Sedan', 'bodyForModel: Prius is a Sedan');
eq(bodyForModel('ランドクルーザープラド'), 'SUV', 'bodyForModel: longest match wins (Prado, not Land Cruiser)');
eq(bodyForModel('Ｎ－ＢＯＸ'), 'Kei', 'bodyForModel: N-BOX is a Kei');
eq(bodyForModel('全然知らない車'), null, 'bodyForModel: unknown model stays null so the gate skips the car');
eq(bodyForModel(''), null, 'bodyForModel: empty input is null');

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
// Formats seen on live goo-net cards (captured 2026-08-31). A bare "2019後"
// used to parse as null, and a car with no year never passes the quality gate.
eq(numberAfter('年式2019後 走行距離4.7万km', '年式'), 2019, 'numberAfter() bare "年式2019後" from a live listing card');
eq(numberAfter('年式2017(平29) 走行距離9.4万km', '年式'), 2017, 'numberAfter() era-suffixed year');
eq(numberAfter('年式(初度登録)2022年11月', '年式(初度登録)'), 2022, 'numberAfter() detail-page first-registration year');
eq(numberAfter('年式 指定なし 走行距離', '年式'), null, 'numberAfter() ignores the search-form year selector');
eq(numberAfter('年式20199 走行距離', '年式'), null, 'numberAfter() does not clip a 5-digit number into a year');
eq(ratingAfter('外装 4 内装 4', '外装'), 4, 'ratingAfter() exterior');
eq(ratingAfter('外装 **4**内装 **4**', '内装'), 4, 'ratingAfter() interior in bold-markdown text');
ok(Object.keys(BRAND_MAP).length > 30, 'brand map is populated');
ok(Object.keys(MODEL_MAP).length > 40, 'model map is populated');

// ---- Bot gate: stub detection ----------------------------------------------
const spread = n => `<a href="https://www.goo-net.com/usedcar/spread/goo/15/70010021803026041800${n}.html">car</a>`;
const stubHtml = `<html><body>${spread(1)}</body></html>`;
const realHtml = `<html><body>${spread(1)}${spread(2)}${spread(3)}<p>年式2018年</p></body></html>`;

eq(countSpreadLinks(stubHtml), 1, 'countSpreadLinks counts the single stub link');
eq(countSpreadLinks(realHtml), 3, 'countSpreadLinks counts unique cards');
eq(countSpreadLinks(`${spread(1)}${spread(1)}`), 1, 'countSpreadLinks de-duplicates repeated links');
eq(countSpreadLinks(''), 0, 'countSpreadLinks on empty html');
ok(looksLikeStub(stubHtml), 'looksLikeStub: 1 card link is a stub');
ok(looksLikeStub(''), 'looksLikeStub: empty page is a stub');
ok(!looksLikeStub(realHtml), 'looksLikeStub: real listing page is not a stub');
// Marker wording is diagnostics only — it must never overrule a page that
// plainly contains results. Regression guard for the live false positive: a
// 1.1 MB goo-net page with 50 car links matched "cookie"/"Cookie", was called
// a stub, wasted a relay round-trip, and was reported as blocked:true.
ok(!looksLikeStub(realHtml + 'アクセスが集中しています'), 'looksLikeStub: gate wording cannot overrule real car links');
ok(!looksLikeStub(realHtml + 'Please enable cookie support'), 'looksLikeStub: cookie boilerplate cannot overrule real car links');
ok(!looksLikeStub(realHtml + 'utilized please verify reCAPTCHA captcha'),
  'looksLikeStub: no generic English marker can overrule real car links');
ok(!looksLikeStub(`<html><body>${Array.from({ length: 50 }, (_, i) => spread(i)).join('')} Cookie conditions</body></html>`),
  'looksLikeStub: the 50-link page from the live incident is not a stub');

// With nothing to read, the page is thin regardless of wording, and the gate's
// own words are reported so the caller can name the cause.
ok(looksLikeStub(stubHtml + 'Cookie conditions'), 'looksLikeStub: a 1-link page is thin whatever it says');
eq(botGateMarkers(realHtml).length, 0, 'botGateMarkers: a clean page carries no gate wording');
eq(botGateMarkers(stubHtml + 'アクセスが集中しています').length, 1, 'botGateMarkers: reports the gate wording it saw');
ok(botGateMarkers(stubHtml + 'Cookie conditions').length === 0,
  'botGateMarkers: cookie boilerplate is not gate evidence');

const diag = pageDiagnostics(stubHtml);
eq(diag.spreadLinks, 1, 'pageDiagnostics reports spread link count');
ok(diag.stub === true, 'pageDiagnostics flags a stub');
ok(diag.contentLength > 0, 'pageDiagnostics reports content length');
eq(pageDiagnostics(realHtml).markers, [], 'pageDiagnostics: no markers on a clean page');

eq(FALLBACK_SEARCH_URL, 'https://www.goo-net.com/usedcar/price--100/', 'fallback search url');
eq(JINA_RELAY, 'https://r.jina.ai/', 'jina relay base');

// ---- fetchPage: cookies, headers, relay fallback ---------------------------
const realFetch = global.fetch;
function mockFetch(handler) {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    calls.push({ url: String(url), headers: opts.headers || {} });
    const r = handler(String(url), opts) || {};
    return {
      ok: (r.status || 200) < 400,
      status: r.status || 200,
      headers: { get: k => (k.toLowerCase() === 'set-cookie' ? (r.setCookie || null) : null) },
      text: async () => r.body || ''
    };
  };
  return calls;
}

const listUrl = 'https://www.goo-net.com/usedcar/price--100/';

// 1) direct fetch already good → no relay
resetFetchState();
let calls = mockFetch(u => (u === 'https://www.goo-net.com/' ? { body: 'home', setCookie: 'sid=abc; Path=/' } : { body: realHtml }));
let r = await fetchPage(listUrl, { timeoutMs: 2000 });
ok(r.ok && r.via === 'direct', 'fetchPage keeps the direct response when it is real');
ok(calls[0].url === 'https://www.goo-net.com/', 'fetchPage warms up against the goo-net homepage first');
ok(calls[1].headers['User-Agent'] === UA, 'fetchPage sends a browser User-Agent');
ok(calls[1].headers['Referer'] === 'https://www.goo-net.com/', 'fetchPage sends the goo-net Referer');
ok(String(calls[1].headers['Cookie']).includes('sid=abc'), 'fetchPage replays cookies captured at warm-up');
ok(Boolean(calls[1].headers['Accept-Language']), 'fetchPage sends Accept-Language');
ok(!calls.some(c => c.url.startsWith(JINA_RELAY)), 'no relay call when the direct page is fine');

// warm-up happens once per run
const before = calls.length;
await fetchPage(listUrl, { timeoutMs: 2000 });
ok(calls.filter(c => c.url === 'https://www.goo-net.com/').length === 1, 'warm-up runs only once per process');
ok(calls.length > before, 'second fetchPage still fetched the page');

// 2) stub → relay with more cards wins
resetFetchState();
calls = mockFetch(u => {
  if (u === 'https://www.goo-net.com/') return { body: 'home' };
  if (u.startsWith(JINA_RELAY)) return { body: realHtml };
  return { body: stubHtml };
});
r = await fetchPage(listUrl, { timeoutMs: 2000 });
eq(r.via, 'relay', 'stub response is retried through the relay');
ok(r.html.includes('年式'), 'relayed html replaces the stub');
ok(r.directDiagnostics.stub === true, 'relay result reports the direct diagnostics');
const relayCall = calls.find(c => c.url.startsWith(JINA_RELAY));
eq(relayCall.url, JINA_RELAY + listUrl, 'relay fetches the same url');
eq(relayCall.headers['X-Return-Format'], 'html', 'relay asks for html');
eq(relayCall.headers['X-No-Cache'], 'true', 'relay bypasses cache');
eq(relayCall.headers['X-With-Links-Summary'], 'false', 'relay skips the links summary');
ok(!relayCall.headers['Cookie'], 'goo-net cookies are not leaked to the relay host');

// 3) relay no better → keep the direct response
resetFetchState();
calls = mockFetch(u => (u === 'https://www.goo-net.com/' ? { body: 'home' } : { body: stubHtml }));
r = await fetchPage(listUrl, { timeoutMs: 2000 });
eq(r.via, 'direct', 'relay result is ignored when it has no more cars');
ok(calls.some(c => c.url.startsWith(JINA_RELAY)), 'relay was still attempted');

// 4) 404 pages are never relayed (delist detection must stay honest)
resetFetchState();
calls = mockFetch(u => (u === 'https://www.goo-net.com/' ? { body: 'home' } : { status: 404, body: 'ページが見つかりません' }));
r = await fetchPage('https://www.goo-net.com/usedcar/spread/goo/15/988026062900208975002.html', { timeoutMs: 2000 });
eq(r.status, 404, 'fetchPage reports 404');
ok(!calls.some(c => c.url.startsWith(JINA_RELAY)), '404 is not sent to the relay');
ok(isDelistedPage(r), '404 result still detected as delisted');

// 5) non-goo-net hosts get no cookies / referer
resetFetchState();
calls = mockFetch(() => ({ body: 'ok' }));
await fetchPage('https://example.com/page', { timeoutMs: 2000 });
ok(calls.length === 1 && calls[0].url === 'https://example.com/page', 'no warm-up for other hosts');
ok(!calls[0].headers['Cookie'] && !calls[0].headers['Referer'], 'cookies/referer scoped to goo-net only');

// 6) the connection itself fails (reset / refused — what a bot-filtered
//    datacenter IP gets). This must still try the relay: bailing out here is
//    exactly how the importer came to import nothing on Vercel.
resetFetchState();
calls = mockFetch(u => {
  if (u === 'https://www.goo-net.com/') return { body: 'home' };
  if (u.startsWith(JINA_RELAY)) return { body: realHtml };
  throw Object.assign(new Error('fetch failed'), { cause: { code: 'ECONNRESET' } });
});
r = await fetchPage(listUrl, { timeoutMs: 2000 });
ok(r.ok && r.via === 'relay', 'a refused connection is retried through the relay');
ok(calls.some(c => c.url === JINA_RELAY + listUrl), 'the relay was asked for the same listing url');
ok(r.html.includes('年式'), 'the relayed page replaces the failed direct response');
eq(r.diagnostics.relayAttempted, undefined, 'a successful relay is not reported as merely attempted');
eq(r.diagnostics.error, 'fetch failed', 'the report still names the direct failure');

// 7) connection fails AND the relay cannot help → honest failure, relay recorded
resetFetchState();
calls = mockFetch(u => {
  if (u === 'https://www.goo-net.com/') return { body: 'home' };
  if (u.startsWith(JINA_RELAY)) return { status: 500, body: '' };
  throw new Error('fetch failed');
});
r = await fetchPage(listUrl, { timeoutMs: 2000 });
ok(!r.ok && r.status === 0, 'an unreachable goo-net still reports a failed fetch');
ok(r.diagnostics.relayAttempted === true, 'the report records that the relay was tried');
ok(calls.some(c => c.url.startsWith(JINA_RELAY)), 'the relay really was called before giving up');

// 8) allowRelay: false (delist checks) must not dial the relay on a dead socket
resetFetchState();
calls = mockFetch(u => {
  if (u === 'https://www.goo-net.com/') return { body: 'home' };
  throw new Error('fetch failed');
});
r = await fetchPage('https://www.goo-net.com/usedcar/spread/goo/15/988026062900208975002.html', { timeoutMs: 2000, allowRelay: false });
ok(!r.ok && !calls.some(c => c.url.startsWith(JINA_RELAY)), 'allowRelay:false never touches the relay');
ok(!isDelistedPage(r), 'a dead socket is never mistaken for a delisted car');

// 9) relay overrides: env-configured base URL and API key
eq(relayBaseUrl(), JINA_RELAY, 'relay base defaults to the free jina relay');
eq(relayApiKey(), '', 'no relay key by default');
process.env.GOONET_RELAY_URL = 'https://relay.example.com/reader';
eq(relayBaseUrl(), 'https://relay.example.com/reader/', 'GOONET_RELAY_URL override gains a trailing slash');
delete process.env.GOONET_RELAY_URL;
eq(relayBaseUrl(), JINA_RELAY, 'relay base falls back once the override is unset');
process.env.GOONET_RELAY_KEY = 'alt_key';
eq(relayApiKey(), 'alt_key', 'GOONET_RELAY_KEY is picked up too');
delete process.env.GOONET_RELAY_KEY;

// 10) the relay call carries the API key when one is configured
resetFetchState();
process.env.JINA_API_KEY = 'jina_secret_123';
calls = mockFetch(u => {
  if (u === 'https://www.goo-net.com/') return { body: 'home' };
  if (u.startsWith(JINA_RELAY)) return { body: realHtml };
  return { body: stubHtml };
});
r = await fetchPage(listUrl, { timeoutMs: 2000 });
const keyedRelay = calls.find(c => c.url.startsWith(JINA_RELAY));
eq(keyedRelay.headers['Authorization'], 'Bearer jina_secret_123', 'the relay call carries the configured API key');
eq(r.via, 'relay', 'a keyed relay still replaces a stub listing');
delete process.env.JINA_API_KEY;

// 11) a gate-stubbed DETAIL page is relayed — a small body carrying gate
// wording can never be real detail HTML — while a healthy detail page is
// still never relayed (fix #6 holds)
resetFetchState();
const gateStub = '<html><body>セキュリティチェックを行っています。しばらくお待ちください。</body></html>';
const gatedDetailUrl = 'https://www.goo-net.com/usedcar/spread/goo/15/988026062900208975002.html';
calls = mockFetch(u => {
  if (u === 'https://www.goo-net.com/') return { body: 'home' };
  if (u.startsWith(JINA_RELAY)) return { body: detailHtml };
  return { body: gateStub };
});
r = await fetchPage(gatedDetailUrl, { timeoutMs: 2000, purpose: 'detail' });
eq(r.via, 'relay', 'a gate-stubbed detail page is retried through the relay');
ok(r.html.includes('<h1>'), 'the relayed detail page replaces the gate stub');

resetFetchState();
calls = mockFetch(u => (u === 'https://www.goo-net.com/' ? { body: 'home' } : { body: detailHtml }));
r = await fetchPage(gatedDetailUrl, { timeoutMs: 2000, purpose: 'detail' });
eq(r.via, 'direct', 'a healthy detail page is never relayed');
ok(!calls.some(c => c.url.startsWith(JINA_RELAY)), 'no relay round-trip for a readable detail page');

resetFetchState();
calls = mockFetch(u => {
  if (u === 'https://www.goo-net.com/') return { body: 'home' };
  if (u.startsWith(JINA_RELAY)) return { body: gateStub + '<p>bigger, but still the gate — セキュリティ</p>' };
  return { body: gateStub };
});
r = await fetchPage(gatedDetailUrl, { timeoutMs: 2000, purpose: 'detail' });
eq(r.via, 'direct', 'a relayed gate page is not trusted over the direct answer');

global.fetch = realFetch;
resetFetchState();

// ---- Relaxed quality gate --------------------------------------------------
const okCar = {
  images: Array.from({ length: 5 }, (_, i) => `https://picture1.goo-net.com/a/Q/p0${i}.jpg`),
  image: 'https://picture1.goo-net.com/a/Q/p00.jpg',
  price_jpy: 500000, year: 2003, km: '90000', make: 'Toyota', model: 'Corolla',
  ext_rating: 4, int_rating: 4, repair_history: 'No'
};
ok(qualityScore(okCar).pass, 'default gate passes a normal 5-photo car');
eq(qualityScore(okCar).photo_count, 5, 'default gate counts 5 photos');
ok(!qualityScore({ ...okCar, images: okCar.images.slice(0, 4) }).pass, 'fewer than 5 photos still fails');
ok(qualityScore({ ...okCar, year: 2000 }).pass, 'model year 2000 is allowed by default');
ok(qualityScore({ ...okCar, year: 1999 }).reasons.includes('no/old year'), 'pre-2000 year is flagged');
ok(qualityScore({ ...okCar, year: 1999 }, { minYear: 1990 }).pass, 'minYear is configurable');
ok(!qualityScore(okCar, { minPhotos: 8 }).pass, 'minPhotos is still configurable upwards');

// ---- Self-healing: markup-drift fallbacks --------------------------------
// Raw-yen prices and English make names are the drift shapes the strict
// parser used to miss; without the fallbacks the page below parsed as 0 cards.
eq(rawYen('￥1,999,000'), 1999000, 'rawYen reads ￥1,999,000');
eq(rawYen('1500000円'), 1500000, 'rawYen reads 1500000円');
eq(rawYen('登録料15,000円'), null, 'rawYen ignores fee-sized amounts (100,000 yen floor)');
eq(priceTextToYen('￥2,300,000'), 2300000, 'priceTextToYen falls back to raw yen');
eq(detectMake('Toyota Corolla Hybrid'), 'Toyota', 'detectMake reads the English make "Toyota"');
eq(detectMake('a hyundai tucson here'), 'Hyundai', 'detectMake reads English makes case-insensitively');
eq(detectMake('mazed'), null, 'detectMake English pass needs a whole word (no substring hits)');

const driftedHtml = `<html><body>
<div class="searchResult">
  <a href="https://www.goo-net.com/usedcar/spread/goo/15/DRIFT0001.html"><img src="https://picture1.goo-net.com/d/Q/d01_01.jpg"></a>
  <p>Toyota</p>
  <div class="carName"><a href="https://www.goo-net.com/usedcar/spread/goo/15/DRIFT0001.html">Prius S package</a></div>
  <p>車両本体価格(税込)</p><p>￥1,999,000</p><p>年式2020年</p><p>走行距離3.2万km</p><p>修復歴なし</p>
</div>
<div class="searchResult">
  <a href="https://www.goo-net.com/usedcar/spread/goo/15/DRIFT0002.html"><img alt="Note e-Power X nav" src="https://picture1.goo-net.com/d/Q/d02_01.jpg"></a>
  <p>Nissan</p><p>車両本体価格</p><p>1500000円</p><p>年式2018年</p><p>走行距離13.8万km</p>
</div>
</body></html>`;
const drifted = parseListingPage(driftedHtml, 'https://www.goo-net.com/usedcar/price--100/');
eq(drifted.cars.length, 2, 'a drift page with no <h3> titles still parses both cards');
eq(drifted.cars[0].title, 'Prius S package', 'loose title: the spread anchor text is used');
eq(drifted.cars[0].price_jpy, 1999000, 'drift price: ￥1,999,000 becomes price_jpy');
eq(drifted.cars[1].title, 'Note e-Power X nav', 'loose title: the thumbnail img alt is used');
eq(drifted.cars[1].price_jpy, 1500000, 'drift price: 1500000円 becomes price_jpy');

// ---- Self-healing: AI fallback (LLM card extraction) ----------------------
const llmPageHtml = '<html><body><a href="/policy/cookie">Cookie</a> Cookie conditions '
  + Array.from({ length: 50 }, (_, i) => `<a href="https://www.goo-net.com/usedcar/spread/goo/15/LIVE80${i}.html"></a>`).join('')
  + '<script>var gallery={"LLM8001":["https://picture1.goo-net.com/a/Q/L8001_01.jpg","https://picture1.goo-net.com/a/Q/L8001_02.jpg","https://picture1.goo-net.com/a/Q/L8001_03.jpg"],"LLM8002":["https://picture1.goo-net.com/a/Q/L8002_01.jpg","https://picture1.goo-net.com/a/Q/L8002_02.jpg","https://picture1.goo-net.com/a/Q/L8002_03.jpg"]}</script></body></html>';
// (the 50 bare links parse as 0 cards — the parseMiss incident shape)
eq(parseListingPage(llmPageHtml, 'https://www.goo-net.com/usedcar/price--100/').cars.length, 0,
  'the 50-bare-link incident page is a parse miss for the regex parser');

let llmFetchCalls = 0;
global.fetch = async () => { llmFetchCalls++; return { ok: true, status: 200, json: async () => ({}) }; };
let llmRes = await extractCardsWithLlm(llmPageHtml);
ok(llmConfigured() === false && (process.env.GEMINI_API_KEY = 'test-gemini', llmConfigured()) === true,
  'llmConfigured() is false with no key and true once a Gemini key is set');
ok(llmRes.cards.length === 0 && llmRes.skipped === 'no-llm-key' && llmFetchCalls === 0,
  'extractCardsWithLlm without a key never calls fetch');

const llmReply = JSON.stringify([
  { stock: 'LLM8001', make: 'Toyota', model: 'Prius', title: 'Prius S 2021',
    url: 'https://www.goo-net.com/usedcar/spread/goo/15/LLM8001.html', year: 2021,
    km: '4.2万km', price: '285万円', fuel: 'Hybrid', body: 'Sedan', location: '愛知県',
    images: ['https://picture1.goo-net.com/a/Q/L8001_01.jpg', 'https://picture1.goo-net.com/a/Q/L8001_02.jpg',
             'https://picture1.goo-net.com/a/Q/L8001_03.jpg', 'https://picture1.goo-net.com/a/Q/HALLUCINATED.jpg'] },
  { stock: 'LLM8002', make: 'Nissan', model: 'Note', title: 'Note X 2018',
    url: 'https://www.goo-net.com/usedcar/spread/goo/15/LLM8002.html', year: 2018,
    km: '90000', price: '￥1,500,000', images: ['https://picture1.goo-net.com/a/Q/L8002_01.jpg'] }
]);
global.fetch = async (u) => {
  llmFetchCalls++;
  if (String(u).includes('generativelanguage')) {
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '```json\n' + llmReply + '\n```' }] } }] }) };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};
llmRes = await extractCardsWithLlm(llmPageHtml, { baseUrl: 'https://www.goo-net.com/usedcar/price--100/' });
ok(llmRes.via === 'gemini' && llmRes.cards.length === 2, 'with a key the LLM reply (code-fenced JSON) is parsed into cards');
ok(llmRes.cards[0] && !llmRes.cards[0].images.some(x => x.includes('HALLUCINATED')) && llmRes.cards[0].images.length === 3,
  'LLM image URLs that do not occur in the source markup are dropped');
eq(llmRes.cards[0].price_jpy, 2850000, 'LLM price text is normalised through the yen parsers');
global.fetch = async (u) => {
  if (String(u).includes('generativelanguage')) {
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: 'Sorry, I cannot extract anything.' }] } }] }) };
  }
  return { ok: false, status: 404, json: async () => ({}) };
};
llmRes = await extractCardsWithLlm(llmPageHtml);
ok(llmRes.cards.length === 0 && /JSON array/.test(llmRes.error || ''), 'a non-JSON LLM reply yields zero cards and an error, not a crash');
delete process.env.GEMINI_API_KEY;
global.fetch = realFetch;

// ---- Self-healing: evidence sample ----------------------------------------
eq(markupSample('x'.repeat(5000)).length, 2048, 'markupSample trims to the 2 KB evidence size');
eq(markupSample('<html><body>tiny</body></html>').length, 30, 'markupSample leaves a short page untouched');

// ---- Live 2026-09-30 listing: title-anchor segmentation --------------------
// The live page links every stock in extra regions (hidden/preload grids), so
// "first spread link per stock" no longer marks the card start — 49 of 50
// cards parsed as nothing. Cards are now anchored on their <h3> title
// (readable candidate + spec block after it); make/photos are read from the
// region ABOVE the title, spec fields from BELOW it.
const liveSep30 = readFileSync(new URL('./fixtures/goonet-listing-2026-09-30.html', import.meta.url), 'utf8');
const livePage = parseListingPage(liveSep30, 'https://www.goo-net.com/usedcar/price-100-300/');
eq(livePage.cars.length, 3, 'the live 2026-09-30 page parses all 3 cards');
const lc1 = livePage.cars[0];
ok(lc1 && lc1.make === 'Toyota' && lc1.model === 'Prius', 'live card 1: make line above the <h3> + title gives the model');
eq(lc1 && lc1.price_jpy, 990000, 'live card 1: 車両本体価格 99万円 below the <h3>');
eq(lc1 && lc1.year, 2016, 'live card 1: 年式2016年');
eq(lc1 && lc1.km, '96000', 'live card 1: 走行距離9.6万km');
eq(lc1 && lc1.photo_count, 4, 'live card 1: 4 real photos, the /shop/…/S/ logo excluded');
ok(lc1 && lc1.location === '愛知県' && lc1.repair_history === 'No', 'live card 1: 住所 prefecture + 修復歴なし');
const lc2 = livePage.cars[1];
ok(lc2 && lc2.price_jpy === 1649000 && lc2.photo_count === 3, 'live card 2: 164.9万円, 3 photos (the #movie anchor is a video, not a photo)');
const lc3 = livePage.cars[2];
ok(lc3 && lc3.price_jpy === 2679000 && lc3.eng === '2,500cc' && lc3.location === null, 'live card 3: 267.9万円, 2500cc (comma-formatted), no 住所 line → null location');

// ---- Duplicate link regions (hidden mobile grid) ----------------------------
// Every stock is linked FIRST in a bare thumbnail strip, then again inside the
// full card. Old first-link segmentation cut the strip and parsed 0 of 2; the
// title anchor (readable candidate + spec block ahead) must win.
const dupGridHtml = '<html><body>'
  + '<div id="mobileStrip" style="display:none">'
  + '<a href="https://www.goo-net.com/usedcar/spread/goo/15/DUP0001.html"><img src="https://picture1.goo-net.com/d/Q/dup01_00.jpg"></a>'
  + '<a href="https://www.goo-net.com/usedcar/spread/goo/15/DUP0002.html"><img src="https://picture1.goo-net.com/d/Q/dup02_00.jpg"></a>'
  + '</div>'
  + '<div class="searchResult"><a href="https://www.goo-net.com/usedcar/spread/goo/15/DUP0001.html"><img alt="Toyota Prius S 2021" src="https://picture1.goo-net.com/d/Q/dup01_00.jpg">New</a>'
  + '<a href="https://www.goo-net.com/usedcar/spread/goo/15/DUP0001.html#2"><img src="https://picture1.goo-net.com/d/Q/dup01_01.jpg"></a>'
  + '<a href="https://www.goo-net.com/usedcar/spread/goo/15/DUP0001.html#3"><img src="https://picture1.goo-net.com/d/Q/dup01_02.jpg"></a>'
  + '<p>Toyota</p><h3><a href="https://www.goo-net.com/usedcar/spread/goo/15/DUP0001.html">Prius S 2021 package</a></h3>'
  + '<p>車両本体価格(税込)</p><p>285万円</p><p>年式2021年</p><p>走行距離4.2万km</p><p>修復歴なし</p></div>'
  + '<div class="searchResult"><a href="https://www.goo-net.com/usedcar/spread/goo/15/DUP0002.html"><img alt="Nissan Note e-Power X" src="https://picture1.goo-net.com/d/Q/dup02_00.jpg">New</a>'
  + '<a href="https://www.goo-net.com/usedcar/spread/goo/15/DUP0002.html#2"><img src="https://picture1.goo-net.com/d/Q/dup02_01.jpg"></a>'
  + '<a href="https://www.goo-net.com/usedcar/spread/goo/15/DUP0002.html#3"><img src="https://picture1.goo-net.com/d/Q/dup02_02.jpg"></a>'
  + '<p>Nissan</p><h3><a href="https://www.goo-net.com/usedcar/spread/goo/15/DUP0002.html">Note e-Power X 2019</a></h3>'
  + '<p>車両本体価格(税込)</p><p>￥1,500,000</p><p>年式2019年</p><p>走行距離6.1万km</p><p>修復歴なし</p></div>'
  + '</body></html>';
const dupPage = parseListingPage(dupGridHtml, 'https://www.goo-net.com/usedcar/price-100-300/');
ok(dupPage.cars.length === 2 && dupPage.cars.every(c => c.price_jpy && c.make !== 'Unknown'),
  'a bare thumbnail strip linking the same stocks first cannot collapse the cards');
eq(dupPage.cars[0] && dupPage.cars[0].make, 'Toyota', 'duplicate grid: the make is read from the real card region, not the strip');

// ---- AI fallback: current Gemini model ---------------------------------------
process.env.GEMINI_API_KEY = 'test-gemini';
let modelUrl = null;
global.fetch = async (u) => { modelUrl = String(u); return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: '[]' }] } }] }) }; };
await extractCardsWithLlm(llmPageHtml);
ok(modelUrl && modelUrl.includes('gemini-3.8-flash'), 'the AI fallback calls gemini-3.8-flash by default (2.5-flash 404s for new keys)');
delete process.env.GEMINI_API_KEY;
global.fetch = realFetch;

// ---- Evidence sample: centred on the first car link ---------------------------
const samplePage = '<!-- HEAD-MARKER -->' + 'z'.repeat(6000) + '<body>' + 'y'.repeat(3000)
  + '<a href="https://www.goo-net.com/usedcar/spread/goo/15/SAMP0001.html"><img src="https://picture1.goo-net.com/s/Q/s01_00.jpg">New</a>'
  + '<p>トヨタ</p><h3><a href="https://www.goo-net.com/usedcar/spread/goo/15/SAMP0001.html">Prius A 2016</a></h3>'
  + '<p>車両本体価格(税込)</p><p>99万円</p><p>年式2016年</p><p>走行距離9.6万km</p></body></html>';
const sample = markupSample(samplePage);
ok(sample.includes('年式') && sample.includes('SAMP0001') && !sample.includes('HEAD-MARKER'),
  'the 2 KB evidence sample centres on the first car link, not the page head');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
