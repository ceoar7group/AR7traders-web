// English display of goo-net Japanese fields (npm run test:jp-display).
//
// The importer stores goo-net rows verbatim, so colours (パールホワイト),
// prefectures (愛知県), transmissions (6速MT) and the occasional undetected
// model name were rendering in Japanese on the ENGLISH site — cards, the
// detail spec table, compare, and image alt text. src/jp-display.js
// translates what it can account for completely and leaves the rest alone.
// These pins are drawn from the actual values in production site_listings.
let pass = 0, fail = 0;
const ok = (cond, msg) => {
  if (cond) { pass++; process.stdout.write('  ✓ ' + msg + '\n'); }
  else { fail++; process.stderr.write('  ✗ ' + msg + '\n'); }
};
const eq = (got, want, msg) => ok(got === want, `${msg} → "${got}"` + (got === want ? '' : ` (wanted "${want}")`));

const { englishColor, englishLocation, englishTransmission, englishModel, englishCarFields, hasJapanese } =
  await import('../src/jp-display.js');

console.log('\nsrc/jp-display.js — goo-net fields render in English');

console.log('\n-- colours (maker paint names are katakana loanwords) --');
eq(englishColor('パールホワイト'), 'Pearl White', 'パールホワイト');
eq(englishColor('ホワイトパールクリスタルシャイン'), 'White Pearl Crystal Shine', 'Toyota 070 keeps its own English name');
eq(englishColor('アティチュードブラックマイカ'), 'Attitude Black Mica', 'アティチュードブラックマイカ');
eq(englishColor('ダークグレー・メタリック'), 'Dark Gray Metallic', 'the ・ separator becomes a space');
eq(englishColor('ソウルレッドプレミアムメタリック'), 'Soul Red Premium Metallic', 'Mazda Soul Red');
eq(englishColor('シルバーＭ'), 'Silver M', 'full-width Ｍ qualifier survives as ASCII');
eq(englishColor('ブラック（Ｐ）'), 'Black (P)', 'full-width parens normalise');
eq(englishColor('デニムブルーメタリック ガンメタリック２トーン'), 'Denim Blue Metallic Gun Metallic 2-tone', '2トーン reads as 2-tone');
ok(englishColor('ブラック 販売店情報 無料 電話お問い合わせ 携帯可 【ご注意】以下の内容をご確認の上ご利用下さい。 ・') === 'Black',
  'scraped dealer boilerplate after the colour is cut, not translated');
// The honesty rule: a colour the vocabulary cannot fully account for comes
// back unchanged (a wrong guess is worse than Japanese).
eq(englishColor('ゾンビグリーン'), 'ゾンビグリーン', 'an unknown katakana word keeps the original');
eq(englishColor('Pearl White'), 'Pearl White', 'already-English colours pass through');

console.log('\n-- locations (all 47 prefectures mapped) --');
eq(englishLocation('愛知県'), 'Aichi', '愛知県');
eq(englishLocation('大阪府'), 'Osaka', '大阪府');
eq(englishLocation('北海道'), 'Hokkaido', '北海道');
eq(englishLocation('東京都'), 'Tokyo', '東京都');
eq(englishLocation('Yokohama'), 'Yokohama', 'English city names pass through');
{
  const { PREFECTURES } = await import('../src/jp-display.js');
  ok(Object.keys(PREFECTURES).length === 47, 'the prefecture map is complete (47) — new dealers cannot regress');
}

console.log('\n-- transmissions --');
eq(englishTransmission('6速MT'), '6-speed MT', '6速MT');
eq(englishTransmission('インパネAT 過給器 －'), 'AT', 'インパネAT with a leaked spec tail');
eq(englishTransmission('AT'), 'AT', 'plain AT unchanged');
eq(englishTransmission('パワー ステアリング H'), '', 'a leaked non-transmission field becomes empty (cards hide it)');
eq(englishTransmission('、ハイブリッド、ステアリ'), '', 'a truncated feature list is not shown as a transmission');

console.log('\n-- models the goo-net detector missed --');
eq(englishModel('トヨタ ハイエースバン', 'Toyota'), 'Hiace Van', 'トヨタ ハイエースバン (make already Toyota)');
eq(englishModel('レクサス ＬＳ', 'Lexus'), 'LS', 'レクサス ＬＳ — full-width letters');
eq(englishModel('日産 スカイライン', 'Nissan'), 'Skyline', '日産 スカイライン');
eq(englishModel('日産 ＮＶ１００クリッパーバン', 'Nissan'), 'NV100 Clipper Van', '日産 ＮＶ１００クリッパーバン');
eq(englishModel('Corolla Cross', 'Toyota'), 'Corolla Cross', 'English models pass through');
eq(englishModel('トヨタ 謎モデル', 'Toyota'), 'トヨタ 謎モデル', 'an unknown model keeps the original — nothing is invented');

console.log('\n-- englishCarFields wires it all into one row --');
{
  const car = { make: 'Toyota', model: 'トヨタ ハイエースバン', col: 'パールホワイト', location: '愛知県', tr: '6速MT', km: '42,000' };
  englishCarFields(car);
  ok(car.model === 'Hiace Van' && car.col === 'Pearl White' && car.location === 'Aichi' && car.tr === '6-speed MT',
    `one pass translates every display field (${car.model} / ${car.col} / ${car.location} / ${car.tr})`);
  ok(!hasJapanese(JSON.stringify(car)), 'the translated row carries no Japanese at all');
  const eng = { make: 'Toyota', model: 'Aqua', col: 'Blue', location: 'Nagoya', tr: 'AT' };
  const before = JSON.stringify(eng);
  englishCarFields(eng);
  ok(JSON.stringify(eng) === before, 'an already-English row is untouched');
}

// The wiring pin: enrichCar in main.jsx must pass every hydrated car through
// the translator, or new imports regress silently.
import fs from 'node:fs';
{
  const main = fs.readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  ok(main.includes('englishCarFields'), 'main.jsx enrichCar routes cars through englishCarFields');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
