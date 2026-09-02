#!/usr/bin/env node
// Regression tests for the goo-net scraper core (scripts/goonet-core.mjs).
// Run: node scripts/goonet-core.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  manToYen, yenToUsd, kmToNumber, seatsNumber, fullWidthToHalf,
  detectMake, detectModel, detectPrefecture, detectBody, detectFuel,
  extractStockFromUrl, extractCarImages, extendGallery,
  parseListingPage, parseDetailPage, mergeCardAndDetail, qualityScore,
  isDelistedPage, listingPageUrlFor, after, numberAfter, ratingAfter,
  BRAND_MAP, MODEL_MAP,
  countSpreadLinks, looksLikeStub, botGateMarkers, pageDiagnostics, fetchPage, resetFetchState,
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
ok(Boolean(relayCall.headers['X-Timeout']), 'relay is told to give up inside our own abort window (X-Timeout)');
eq(relayCall.headers['X-With-Links-Summary'], 'false', 'relay skips the links summary');
ok(!relayCall.headers['Cookie'], 'goo-net cookies are not leaked to the relay host');
ok(!relayCall.headers['Authorization'], 'no Authorization header without a relay API key');

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

// 9) the relay rate-limits us (HTTP 429, instantly) → one retry, then success.
// This is exactly what Vercel's shared egress IPs see from anonymous r.jina.ai.
resetFetchState();
let jinaShots = 0;
calls = mockFetch(u => {
  if (u === 'https://www.goo-net.com/') return { body: 'home' };
  if (u.startsWith(JINA_RELAY)) return (++jinaShots === 1) ? { status: 429, body: 'rate limit' } : { body: realHtml };
  throw new Error('fetch failed');
});
r = await fetchPage(listUrl, { timeoutMs: 2000 });
ok(r.ok && r.via === 'relay', 'a 429 from the relay is retried and can still succeed');
eq(jinaShots, 2, 'the relay was re-dialled exactly once after the 429');
ok(r.html.includes('年式'), 'the retried relay response is used');
eq(r.diagnostics.relayAttempts.length, 2, 'both relay attempts are recorded for the run report');
eq(r.diagnostics.relayAttempts[0].status, 429, 'the recorded first attempt shows HTTP 429');

// 10) jina cannot read the page → the backup relays are tried.
resetFetchState();
calls = mockFetch(u => {
  if (u === 'https://www.goo-net.com/') return { body: 'home' };
  if (u.startsWith(JINA_RELAY)) return { status: 500, body: '' };
  if (u.startsWith('https://api.allorigins.win/')) return { body: realHtml };
  return { status: 502, body: '' };
});
r = await fetchPage(listUrl, { timeoutMs: 2000, relayTimeoutMs: 9000 });
ok(r.ok && r.via === 'relay', 'a backup relay can rescue the run when jina fails');
eq(r.provider, 'allorigins', 'the winning relay is named on the result');
ok(calls.some(c => c.url.startsWith('https://api.allorigins.win/raw?url=' + encodeURIComponent('https://www.goo-net.com'))),
  'the backup relay received the encoded goo-net url');
const relayOnly = calls.filter(c =>
  c.url.startsWith(JINA_RELAY) || c.url.startsWith('https://api.allorigins.win/') || c.url.startsWith('https://api.codetabs.com/'));
ok(relayOnly.length > 0 && relayOnly.every(c => !c.headers['Cookie']), 'no goo-net cookies are sent to any relay');

// 11) the relay gets its OWN, much larger timeout than the direct fetch.
// goo-net resets datacenter sockets instantly, and r.jina.ai needs seconds to
// re-render a 1–2 MB listing page. The relay used to inherit the direct 5–7 s
// timeout, so every attempt aborted mid-flight and the importer reported
// blocked on every serverless run. Here the relay answers after 2.4 s — longer
// than the direct timeout of 500 ms — and must still be used.
resetFetchState();
const delay = ms => new Promise(res => setTimeout(res, ms));
global.fetch = async (url) => {
  const u = String(url);
  if (u === 'https://www.goo-net.com/') return { ok: true, status: 200, headers: { get: () => null }, text: async () => 'home' };
  if (u.startsWith(JINA_RELAY)) { await delay(2400); return { ok: true, status: 200, headers: { get: () => null }, text: async () => realHtml }; }
  throw new Error('fetch failed');
};
r = await fetchPage(listUrl, { timeoutMs: 500, relayTimeoutMs: 4000 });
ok(r.ok && r.via === 'relay', 'a relay response slower than the direct timeout is still waited for');
ok((r.diagnostics.relayDurationMs || 0) >= 2300, 'the slow relay response really took its time');

// 12) a relay API key is sent as a Bearer token when configured
resetFetchState();
process.env.GOONET_RELAY_KEY = 'test-relay-key-123';
try {
  calls = mockFetch(u => {
    if (u === 'https://www.goo-net.com/') return { body: 'home' };
    if (u.startsWith(JINA_RELAY)) return { body: realHtml };
    return { body: stubHtml };
  });
  r = await fetchPage(listUrl, { timeoutMs: 2000 });
  eq(r.via, 'relay', 'keyed relay still rescues a stubbed page');
  const keyed = calls.find(c => c.url.startsWith(JINA_RELAY));
  eq(keyed.headers['Authorization'], 'Bearer test-relay-key-123', 'the relay key is sent as a Bearer token');
} finally {
  delete process.env.GOONET_RELAY_KEY;
}

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

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
