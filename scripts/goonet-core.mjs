#!/usr/bin/env node
// Goo-net scraper core — one implementation, three callers:
//
//   api/goonet-sync.js        → scheduled importer (Vercel function, called by
//                               GitHub Actions cron + the CRM "Run import now")
//   scripts/goonet-crawl.mjs  → CLI dry-run / manual run from a terminal
//   scripts/goonet-core.test.mjs → regression tests
//
// What it does
//   • Crawls goo-net listing pages (newest first) and collects car cards.
//   • Fetches each candidate's detail page to build the full photo gallery
//     and specification set.
//   • Applies a QUALITY GATE so only cars with good pictures (configurable
//     minimum photo count), a real price, year and mileage get imported —
//     everything else is skipped and logged.
//   • Detects delisted cars (goo-net 404 page or the
//     "このクルマは…まで掲載されていた車輿です" end-of-listing marker).
//
// Deliberately dependency-free (global fetch only) so the same file bundles
// cleanly into a Vercel serverless function and runs in Node 20+.
//
// ---------------------------------------------------------------------------

export const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export const DEFAULT_SEARCH_URL = 'https://www.goo-net.com/usedcar/price-100-300/';

// Wider, always-populated search used as a rescue when the bookmarked search
// URL returns (almost) no cards.
export const FALLBACK_SEARCH_URL = 'https://www.goo-net.com/usedcar/price--100/';

// Free reader relay. goo-net serves datacenter IPs (Vercel, CI) a stub page
// with no car data; the relay fetches the very same URL from a residential-ish
// edge and hands back the real HTML.
export const JINA_RELAY = 'https://r.jina.ai/';

// The keyless free relay tier is rate-limited (401/429), and when it is, a
// Vercel host that sits behind goo-net's datacenter gate reads nothing at
// all — every run reports blocked or skips every car. Both are overridable:
//   JINA_API_KEY     → sent as Authorization: Bearer (free key from jina.ai)
//   GOONET_RELAY_URL → any reader-relay-style proxy prefix you trust instead
export function relayBaseUrl() {
  const v = String(process.env.GOONET_RELAY_URL || '').trim();
  if (!v) return JINA_RELAY;
  return v.endsWith('/') ? v : v + '/';
}
export function relayApiKey() {
  return String(process.env.JINA_API_KEY || process.env.GOONET_RELAY_KEY || '').trim();
}

// A bot-gate interstitial is a few KB; a real goo-net listing OR detail page
// is ~1 MB. Under this size plus gate wording = unmistakably the gate.
export const GATE_PAGE_BYTES = 64_000;

// goo-net writes "万円" (man yen) prices: 34.8万円 = 348,000 yen.
export function manToYen(text) {
  const m = String(text || '').replace(/[,\s]/g, '').match(/(\d+(?:\.\d+)?)\s*万円/);
  if (!m) return null;
  return Math.round(parseFloat(m[1]) * 10000);
}

// Raw-yen prices the parser used to miss when markup drifted away from 万円:
// "￥1,999,000", "¥2,300,000", "1500000円" (half- or full-width digits and
// yen signs). A sane used-car price is at least 100,000 yen, which keeps fee
// lines ("登録料15,000円") from being mistaken for the car's price.
export function rawYen(text) {
  const s = fullWidthToHalf(String(text || '')).replace(/[、，,\s]/g, '');
  let m = s.match(/[¥￥](\d{6,9})/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 100_000 && n <= 300_000_000) return n;
  }
  m = s.match(/(\d{6,9})円/);
  if (m) {
    const n = Number(m[1]);
    if (n >= 100_000 && n <= 300_000_000) return n;
  }
  return null;
}

// One price parser for every shape goo-net prints: 万円 first (its house
// format), raw yen as the drift fallback.
export function priceTextToYen(text) {
  const s = String(text || '');
  if (!s.trim()) return null;
  return manToYen(s) || rawYen(s);
}

export function yenToUsd(yen, rate = 0.0068) {
  const n = Number(yen);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.round(n * rate);
}

export function usdText(usd) {
  const n = Number(usd);
  if (!Number.isFinite(n) || n <= 0) return null;
  return '$' + n.toLocaleString('en-US');
}

// 13.8万km → 138,000 ; 1.3万km → 13,000 ; 45000km → 45,000
export function kmToNumber(text) {
  const s = String(text || '').replace(/[,\s]/g, '');
  const man = s.match(/(\d+(?:\.\d+)?)\s*万\s*km/);
  if (man) return String(Math.round(parseFloat(man[1]) * 10000));
  const plain = s.match(/(\d+(?:\.\d+)?)\s*km/);
  if (plain) return String(Math.round(parseFloat(plain[1])));
  return null;
}

export function fullWidthToHalf(s) {
  return String(s || '').replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));
}

export function seatsNumber(text) {
  const s = fullWidthToHalf(String(text || '')).replace(/[^\d]/g, '');
  const n = Number(s);
  return Number.isFinite(n) && n > 0 && n <= 20 ? n : null;
}

// Japanese brand names used on goo-net → English makes used everywhere else.
export const BRAND_MAP = {
  'トヨタ': 'Toyota', '日産': 'Nissan', 'ホンダ': 'Honda', 'マツダ': 'Mazda',
  'スズキ': 'Suzuki', 'ダイハツ': 'Daihatsu', '三菱': 'Mitsubishi', 'スバル': 'Subaru',
  'レクサス': 'Lexus', 'いすゞ': 'Isuzu', 'メルセデス・ベンツ': 'Mercedes-Benz',
  'ベンツ': 'Mercedes-Benz', 'ＢＭＷ': 'BMW', 'BMW': 'BMW', 'アウディ': 'Audi',
  'フォルクスワーゲン': 'Volkswagen', 'ポルシェ': 'Porsche', 'ランドローバー': 'Land Rover',
  'ジャガー': 'Jaguar', 'ボルボ': 'Volvo', 'プジョー': 'Peugeot', 'シトロエン': 'Citroen',
  'ルノー': 'Renault', 'フィアット': 'Fiat', 'アルファロメオ': 'Alfa Romeo',
  'マセラティ': 'Maserati', 'フェラーリ': 'Ferrari', 'ランボルギーニ': 'Lamborghini',
  'ロールスロイス': 'Rolls-Royce', 'ベントレー': 'Bentley', 'ミニ': 'MINI',
  'ヒュンダイ': 'Hyundai', '起亜': 'Kia', 'ボルボ': 'Volvo', 'アバルト': 'Abarth',
  'プジョー': 'Peugeot', 'スマート': 'Smart', 'ダッジ': 'Dodge', 'シボレー': 'Chevrolet',
  'キャデラック': 'Cadillac', 'ジープ': 'Jeep', 'テスラ': 'Tesla', 'ＢＥＮＴＬＥＹ': 'Bentley'
};

// Common models → English + a body-type hint so imported cars display nicely
// even before a human touches them. Easily extended. Lookup takes the LONGEST
// matching key, so a shorter name can never shadow a longer one.
export const MODEL_MAP = {
  'アテンザ': ['Atenza', 'Sedan'], 'マツダ６': ['Mazda6', 'Sedan'],
  'カローラフィールダー': ['Corolla Fielder', 'Wagon'], 'カローラツーリング': ['Corolla Touring', 'Wagon'],
  'アルファード': ['Alphard', 'MPV'], 'ヴェルファイア': ['Vellfire', 'MPV'],
  'ノア': ['Noah', 'MPV'], 'ヴォクシー': ['Voxy', 'MPV'], 'エスティマ': ['Estima', 'MPV'],
  'ステップワゴン': ['Stepwgn', 'MPV'], 'セレナ': ['Serena', 'MPV'], 'オデッセイ': ['Odyssey', 'MPV'],
  'ランドクルーザープラド': ['Land Cruiser Prado', 'SUV'],
  'ランドクルーザー': ['Land Cruiser', 'SUV'], 'プラド': ['Land Cruiser Prado', 'SUV'],
  'ハリアー': ['Harrier', 'SUV'], 'ヴェゼル': ['Vezel', 'SUV'], 'ＣＸ－５': ['CX-5', 'SUV'],
  'ＣＸ－３０': ['CX-30', 'SUV'], 'ＣＸ－８': ['CX-8', 'SUV'], 'エクストレイル': ['X-Trail', 'SUV'],
  'ＲＡＶ４': ['RAV4', 'SUV'], 'ヤリスクロス': ['Yaris Cross', 'SUV'],
  'ライズ': ['Raize', 'SUV'], 'ロッキー': ['Rocky', 'SUV'], 'ハスラー': ['Hustler', 'Kei'],
  'Ｎ－ＢＯＸ': ['N-BOX', 'Kei'], 'Ｎ－ＯＮＥ': ['N-ONE', 'Kei'], 'スペーシア': ['Spacia', 'Kei'],
  'ワゴンＲ': ['Wagon R', 'Kei'], 'ムーヴ': ['Move', 'Kei'], 'アルト': ['Alto', 'Kei'],
  'プリウス': ['Prius', 'Sedan'], 'カローラ': ['Corolla', 'Sedan'],
  'カローラクロス': ['Corolla Cross', 'SUV'], 'シビック': ['Civic', 'Sedan'],
  'アコード': ['Accord', 'Sedan'], 'カムリ': ['Camry', 'Sedan'], 'マークＸ': ['Mark X', 'Sedan'],
  'クラウン': ['Crown', 'Sedan'], 'ノート': ['Note', 'Hatchback'],
  'フィット': ['Fit', 'Hatchback'], 'アクア': ['Aqua', 'Hatchback'],
  'ヤリス': ['Yaris', 'Hatchback'], 'スイフト': ['Swift', 'Hatchback'],
  'デミオ': ['Demio', 'Hatchback'], 'マーチ': ['March', 'Hatchback'],
  'ロードスター': ['Roadster', 'Coupe'], 'ＧＴ－Ｒ': ['GT-R', 'Coupe'],
  'Ｚ４': ['Z4', 'Coupe'], 'ボクスター': ['Boxster', 'Coupe'],
  '１シリーズ': ['1 Series', 'Hatchback'], '３シリーズ': ['3 Series', 'Sedan'],
  '５シリーズ': ['5 Series', 'Sedan'], 'Ｃクラス': ['C-Class', 'Sedan'],
  'Ｅクラス': ['E-Class', 'Sedan'], 'Ｓクラス': ['S-Class', 'Sedan'],
  'Ａクラス': ['A-Class', 'Hatchback'], 'ＧＬＣ': ['GLC', 'SUV'], 'ＧＬＥ': ['GLE', 'SUV'],
  'Ｘ３': ['X3', 'SUV'], 'Ｘ５': ['X5', 'SUV'], 'Ｑ５': ['Q5', 'SUV'],
  'Ｑ７': ['Q7', 'SUV'], 'レヴォーグ': ['Levorg', 'Wagon'], 'インプレッサ': ['Impreza', 'Sedan'],
  'フォレスター': ['Forester', 'SUV'], 'アウトランダー': ['Outlander', 'SUV'],
  'エクリプスクロス': ['Eclipse Cross', 'SUV'], 'デリカ': ['Delica', 'MPV'],
  'ソリオ': ['Sonio', 'MPV'], 'フリード': ['Freed', 'MPV'], 'シエンタ': ['Sienta', 'MPV'],
  'ジャスティ': ['Justy', 'Kei'], 'タント': ['Tanto', 'Kei'], 'ｅ－Ｋ': ['eK', 'Kei'],
  'デイズ': ['Dayz', 'Kei'], 'ルークス': ['Roox', 'Kei'], 'サクラ': ['Sakura', 'Kei'],
  'リーフ': ['Leaf', 'Hatchback'], 'ＭＧ４': ['MG4', 'Hatchback'],
  'ジムニー': ['Jimny', 'Kei'], 'ＣＸ－３': ['CX-3', 'SUV'],
  'ＸＣ４０': ['XC40', 'SUV'], 'ＸＣ６０': ['XC60', 'SUV'], 'ＸＣ９０': ['XC90', 'SUV'],
  'ゴルフ': ['Golf', 'Hatchback'], 'ポロ': ['Polo', 'Hatchback'],
  'パサート': ['Passat', 'Sedan'], 'ティグアン': ['Tiguan', 'SUV'],
  'Ａ１': ['A1', 'Hatchback'], 'Ａ３': ['A3', 'Hatchback'], 'Ａ４': ['A4', 'Sedan'],
  'Ａ６': ['A6', 'Sedan'], 'ミラ': ['Mira', 'Kei'], 'コペン': ['Copen', 'Coupe']
};

// Model name → the brand that builds it, used as a cross-check against
// page-wide make detection.
//
// goo-net detail pages carry site navigation that names many brands (日産,
// トヨタ, BMW …), so matching the make against the WHOLE page text mislabelled
// imported cars — a Honda N-BOX showed as NISSAN (2026-10). The model name is
// the reliable signal: where the model is in this table, the brand is not a
// guess. Longest key wins, exactly like detectModel, so Ｎ－ＢＯＸ can never be
// shadowed by a shorter key. Unknown models stay absent — nothing is invented.
export const MODEL_BRAND = {
  // Toyota
  'アルファード': 'Toyota', 'ヴェルファイア': 'Toyota', 'ノア': 'Toyota', 'ヴォクシー': 'Toyota',
  'エスティマ': 'Toyota', 'ランドクルーザープラド': 'Toyota', 'ランドクルーザー': 'Toyota',
  'プラド': 'Toyota', 'ハリアー': 'Toyota', 'ＲＡＶ４': 'Toyota', 'ヤリスクロス': 'Toyota',
  'ライズ': 'Toyota', 'シエンタ': 'Toyota', 'カローラフィールダー': 'Toyota',
  'カローラツーリング': 'Toyota', 'カローラクロス': 'Toyota', 'カローラ': 'Toyota',
  'プリウス': 'Toyota', 'カムリ': 'Toyota', 'マークＸ': 'Toyota', 'クラウン': 'Toyota',
  'アクア': 'Toyota', 'ヤリス': 'Toyota',
  // Nissan
  'セレナ': 'Nissan', 'エクストレイル': 'Nissan', 'ノート': 'Nissan', 'デイズ': 'Nissan',
  'ルークス': 'Nissan', 'サクラ': 'Nissan', 'リーフ': 'Nissan', 'マーチ': 'Nissan',
  'スカイライン': 'Nissan', 'ＧＴ－Ｒ': 'Nissan',
  // Honda
  'Ｎ－ＢＯＸ': 'Honda', 'Ｎ－ＯＮＥ': 'Honda', 'フィット': 'Honda', 'フリード': 'Honda',
  'ヴェゼル': 'Honda', 'ステップワゴン': 'Honda', 'シビック': 'Honda', 'アコード': 'Honda',
  'オデッセイ': 'Honda',
  // Mazda
  'アテンザ': 'Mazda', 'マツダ６': 'Mazda', 'ＣＸ－３０': 'Mazda', 'ＣＸ－５': 'Mazda',
  'ＣＸ－８': 'Mazda', 'ＣＸ－３': 'Mazda', 'デミオ': 'Mazda', 'ロードスター': 'Mazda',
  // Suzuki
  'スペーシア': 'Suzuki', 'ワゴンＲ': 'Suzuki', 'スイフト': 'Suzuki', 'ソリオ': 'Suzuki',
  'ハスラー': 'Suzuki', 'ジムニー': 'Suzuki', 'アルト': 'Suzuki',
  // Daihatsu
  'タント': 'Daihatsu', 'ムーヴ': 'Daihatsu', 'ミラ': 'Daihatsu', 'コペン': 'Daihatsu',
  'ロッキー': 'Daihatsu',
  // Subaru
  'レヴォーグ': 'Subaru', 'インプレッサ': 'Subaru', 'フォレスター': 'Subaru', 'ジャスティ': 'Subaru',
  // Mitsubishi
  'アウトランダー': 'Mitsubishi', 'エクリプスクロス': 'Mitsubishi', 'デリカ': 'Mitsubishi',
  // Europe
  '１シリーズ': 'BMW', '３シリーズ': 'BMW', '５シリーズ': 'BMW', 'Ｘ３': 'BMW', 'Ｘ５': 'BMW',
  'Ｚ４': 'BMW', 'Ｃクラス': 'Mercedes-Benz', 'Ｅクラス': 'Mercedes-Benz', 'Ｓクラス': 'Mercedes-Benz',
  'Ａクラス': 'Mercedes-Benz', 'ＧＬＣ': 'Mercedes-Benz', 'ＧＬＥ': 'Mercedes-Benz',
  'Ａ１': 'Audi', 'Ａ３': 'Audi', 'Ａ４': 'Audi', 'Ａ６': 'Audi', 'Ｑ５': 'Audi', 'Ｑ７': 'Audi',
  'ゴルフ': 'Volkswagen', 'ポロ': 'Volkswagen', 'パサート': 'Volkswagen', 'ティグアン': 'Volkswagen',
  'ＸＣ４０': 'Volvo', 'ＸＣ６０': 'Volvo', 'ＸＣ９０': 'Volvo', 'ボクスター': 'Porsche'
};

// The brand a model name belongs to, or null when the model is not in the
// table (never a guess). Longest key wins.
export function makeFromModel(text) {
  const s = String(text || '');
  let best = null;
  for (const [jp, brand] of Object.entries(MODEL_BRAND)) {
    if (s.includes(jp) && (!best || jp.length > best.jp.length)) best = { jp, brand };
  }
  return best ? best.brand : null;
}

export const BODY_MAP = {
  'セダン': 'Sedan', 'ハードトップ': 'Sedan', 'クーペ': 'Coupe',
  'オープン': 'Convertible', 'ワゴン': 'Wagon', 'ミニバン': 'MPV',
  'ワンボックス': 'Van', 'ＳＵＶ': 'SUV', 'クロスカントリー': 'SUV',
  'ピックアップ': 'Pickup', 'ハッチバック': 'Hatchback', '軽': 'Kei',
  'トラック': 'Truck', 'バス': 'Bus', 'ステーションワゴン': 'Wagon'
};

export const FUEL_MAP = {
  'ハイブリッド': 'Hybrid', 'ガソリン': 'Petrol', 'ディーゼル': 'Diesel',
  '電気': 'Electric', 'ＥＶ': 'Electric', 'ＰＨＶ': 'Plug-in Hybrid',
  'プラグインハイブリッド': 'Plug-in Hybrid', 'ＬＰＧ': 'LPG', 'その他': 'Other'
};

// Prefectures used to extract the car's location from goo-net text.
const PREFECTURES = [
  '北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県',
  '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県',
  '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県',
  '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県',
  '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県',
  '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県',
  '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'
];

// English brand names. When goo-net's markup drifts, cards can print "Toyota"
// where the parser expected "トヨタ". The Japanese map is checked first
// (it is exact); the English pass then matches whole words only, so "Kia"
// is never read out of some longer word and "BMW" boilerplate cannot fire on
// random text.
const EN_BRAND_MAP = {
  'Toyota': 'Toyota', 'Nissan': 'Nissan', 'Honda': 'Honda', 'Mazda': 'Mazda',
  'Suzuki': 'Suzuki', 'Daihatsu': 'Daihatsu', 'Mitsubishi': 'Mitsubishi', 'Subaru': 'Subaru',
  'Lexus': 'Lexus', 'Isuzu': 'Isuzu', 'Mercedes-Benz': 'Mercedes-Benz', 'Mercedes': 'Mercedes-Benz',
  'BMW': 'BMW', 'Audi': 'Audi', 'Volkswagen': 'Volkswagen', 'VW': 'Volkswagen',
  'Porsche': 'Porsche', 'Land Rover': 'Land Rover', 'Jaguar': 'Jaguar', 'Volvo': 'Volvo',
  'Peugeot': 'Peugeot', 'Citroen': 'Citroen', 'Renault': 'Renault', 'Fiat': 'Fiat',
  'Alfa Romeo': 'Alfa Romeo', 'Maserati': 'Maserati', 'Ferrari': 'Ferrari',
  'Lamborghini': 'Lamborghini', 'Rolls-Royce': 'Rolls-Royce', 'Bentley': 'Bentley',
  'MINI': 'MINI', 'Hyundai': 'Hyundai', 'Kia': 'Kia', 'Abarth': 'Abarth',
  'Smart': 'Smart', 'Dodge': 'Dodge', 'Chevrolet': 'Chevrolet', 'Cadillac': 'Cadillac',
  'Jeep': 'Jeep', 'Tesla': 'Tesla'
};

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function detectMake(text) {
  const s = String(text || '');
  for (const [jp, en] of Object.entries(BRAND_MAP)) {
    if (s.includes(jp)) return en;
  }
  // English pass: longest brand wins ("Mercedes-Benz" over "Mercedes").
  let best = null;
  for (const [en, canon] of Object.entries(EN_BRAND_MAP)) {
    const re = new RegExp('(?<![A-Za-z])' + escapeRe(en) + '(?![A-Za-z])', 'i');
    if (re.test(s) && (!best || en.length > best.en.length)) best = { en, canon };
  }
  return best ? best.canon : null;
}

export function detectPrefecture(text) {
  const s = String(text || '');
  for (const p of PREFECTURES) if (s.includes(p)) return p;
  return null;
}

export function detectBody(text) {
  const s = String(text || '');
  for (const [jp, en] of Object.entries(BODY_MAP)) if (s.includes(jp)) return en;
  return null;
}

export function detectFuel(text) {
  const s = String(text || '');
  for (const [jp, en] of Object.entries(FUEL_MAP)) if (s.includes(jp)) return en;
  return null;
}

// "ノート ｅ－パワー　Ｘ　６ヶ月…" → "Note e-Power X" via MODEL_MAP, else a
// cleaned leading-token fallback.
// Body-type hint for a model name, from MODEL_MAP's curated second column.
// Longest match wins, mirroring detectModel. Returns null for unknown models —
// an unknown body must stay null so the required-fields gate skips the car
// rather than importing a guess.
export function bodyForModel(text) {
  const s = String(text || '');
  let best = null;
  for (const [jp, [, body]] of Object.entries(MODEL_MAP)) {
    if (s.includes(jp) && (!best || jp.length > best.jp.length)) best = { jp, body };
  }
  return best ? best.body : null;
}

export function detectModel(title, make) {
  const s = String(title || '');
  const flat = s.replace(/\u3000/g, ' ').replace(/[（(].*?[)）]/g, '');
  // Longest key wins. First-match returned "Corolla" for カローラクロス and
  // "Land Cruiser" for ランドクルーザープラド, because the shorter name is a
  // substring of the longer one and sat earlier in the map.
  let best = null;
  for (const [jp, [en]] of Object.entries(MODEL_MAP)) {
    if (flat.includes(jp) && (!best || jp.length > best.jp.length)) best = { jp, en };
  }
  if (best) return best.en;
  // Fallback: keep the first two visible tokens, cleaned of option chatter.
  const tokens = flat.split(/\s+/).filter(Boolean);
  const keep = tokens.slice(0, 2).join(' ').trim().slice(0, 40);
  return keep || (make || 'Car');
}

// Sequential goo-net photo sets end in 01.jpg … NN.jpg. When a page lists
// most of the set we fill any internal gaps so galleries stay contiguous.
export function extendGallery(images, max = 40) {
  const clean = [...new Set((images || []).filter(Boolean))]
    .filter(u => /^https?:\/\//.test(u) && !u.includes('/shop/') && !/\/[PS]\//.test(u));
  if (clean.length < 2) return clean;

  const bySuffix = new Map(); // suffix number → url
  for (const u of clean) {
    const m = u.match(/(\d{2,3})\.(?:jpg|jpeg|png)$/);
    if (m) bySuffix.set(Number(m[1]), u);
  }
  const nums = [...bySuffix.keys()].sort((a, b) => a - b);
  if (!nums.length) return clean;
  const last = nums[nums.length - 1];
  if (last > max) return clean;

  // Only fill gaps when the found set is dense (>= 60% of the range present),
  // so we never invent photos for cars whose gallery genuinely has holes.
  const present = nums.length;
  const span = last - (nums[0] || 1) + 1;
  if (span > 1 && present / span < 0.6) return clean;

  const out = [];
  for (let i = nums[0]; i <= last; i++) {
    const u = bySuffix.get(i);
    if (u) out.push(u);
  }
  return out;
}

// goo-net prints 排気量 as "2200cc"; everywhere else in the site it reads
// "2,200cc". One formatter so the importer and the seed cannot drift.
export function formatEngine(text) {
  const raw = String(text || '').trim();
  if (!raw) return null;
  const n = raw.replace(/cc|ＣＣ/i, '').trim();
  if (!n) return null;
  return n.replace(/(\d)(?=(\d{3})+$)/g, '$1,') + 'cc';
}

export function extractStockFromUrl(url) {
  const m = String(url || '').match(/([A-Za-z0-9]+)\.html/);
  return m ? m[1] : null;
}

export function detailUrlFor(stock) {
  if (!stock) return null;
  return `https://www.goo-net.com/usedcar/spread/goo/15/${stock}.html`;
}

// ---------------------------------------------------------------------------
// Server-side validation for a staff-pasted Goo-net vehicle URL.
//
// Rules are applied to the PARSED URL (protocol, hostname, port, userinfo,
// path), never to a string prefix: "https://www.goo-net.com.attacker.tld/…"
// and "https://user:pass@www.goo-net.com/…" must both fail, and an IP literal
// or an internal name can never pass because the hostname must equal an
// approved Goo-net host exactly. The fetch is then rebuilt from the stock id
// we parsed, so a query string or fragment can never ride along.
// ---------------------------------------------------------------------------
export const GOONET_CAR_HOSTS = ['www.goo-net.com', 'goo-net.com'];

export function parseGoonetCarUrl(input) {
  const raw = String(input == null ? '' : input).trim();
  if (!raw) return { ok: false, reason: 'empty URL' };
  if (raw.length > 500) return { ok: false, reason: 'URL is longer than 500 characters' };
  let u;
  try {
    const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : 'https://' + raw.replace(/^\/+/, '');
    u = new URL(withScheme);
  } catch {
    return { ok: false, reason: 'not a parseable URL' };
  }
  if (u.protocol !== 'https:') return { ok: false, reason: 'only https:// Goo-net URLs are accepted' };
  if (u.username || u.password) return { ok: false, reason: 'URLs carrying credentials are rejected' };
  if (u.port && u.port !== '443') return { ok: false, reason: 'unexpected port ' + u.port };
  const host = u.hostname.toLowerCase().replace(/\.$/, '');
  if (!GOONET_CAR_HOSTS.includes(host)) {
    return { ok: false, reason: 'only Goo-net vehicle pages are accepted (host was ' + (host || 'empty') + ')' };
  }
  const m = u.pathname.match(/^\/usedcar\/spread\/goo\/\d+\/([0-9A-Za-z_-]+)\.html\/?$/);
  if (!m) return { ok: false, reason: 'not a Goo-net vehicle detail page (/usedcar/spread/goo/<n>/<id>.html)' };
  const stock = m[1];
  if (stock.length < 8) return { ok: false, reason: 'stock id "' + stock + '" is too short to be a Goo-net vehicle id' };
  return { ok: true, stock, url: detailUrlFor(stock), input: raw };
}

// A pasted block (one URL per line, or comma/space separated) becomes a
// bounded, de-duplicated, validated batch. Anything rejected is reported with
// its reason; nothing is silently dropped.
export function parseGoonetCarUrls(text, { max = 5 } = {}) {
  const items = String(text == null ? '' : text).split(/[\s,;]+/).map(t => t.trim()).filter(Boolean);
  const urls = [];
  const errors = [];
  const seen = new Set();
  for (const raw of items) {
    const parsed = parseGoonetCarUrl(raw);
    if (!parsed.ok) { errors.push({ input: raw, reason: parsed.reason }); continue; }
    if (seen.has(parsed.stock)) { errors.push({ input: raw, reason: 'duplicate of the same stock id in this batch' }); continue; }
    if (urls.length >= max) { errors.push({ input: raw, reason: 'batch limit is ' + max + ' URLs per request' }); continue; }
    seen.add(parsed.stock);
    urls.push(parsed);
  }
  return { urls, errors, limit: max };
}

// ---------------------------------------------------------------------------
// Response bytes → text (charset-aware decoding)
//
// goo-net serves its listing and detail pages as EUC-JP. The bytes prove it:
// 0xA5 0xC8 0xA5 0xE8 0xA5 0xBF 0xC0 0xBE 0xC5 0xEC 0xB5 0xFE is
// "トヨタ西東京" in EUC-JP, and that same byte run decoded as UTF-8 produces
// "\uFFFD\u0225\u897F\uFFFD..." — exactly the mojibake the CRM parser
// diagnostic showed ("�ȥ西������…").
//
// Response.text() is UTF-8 BY SPECIFICATION: it ignores the charset in
// Content-Type. So every Japanese name, price label and spec label came back
// as replacement characters, and no make / price / year could be read from
// them. The reader below never guesses one encoding for a whole host — the
// encoding is chosen per response from, in order:
//
//   1. a byte-order mark (authoritative),
//   2. the Content-Type charset parameter,
//   3. the document's own <meta charset> / <meta http-equiv=Content-Type>,
//   4. a byte-level sniff (valid UTF-8 wins; otherwise EUC-JP vs Shift_JIS by
//      decode error count),
//   5. UTF-8 with replacement as the never-throw fallback.
//
// A relay that re-encodes its answer to UTF-8 is therefore read as UTF-8, and
// a legacy page straight from goo-net is read as the legacy charset it
// declares. Unsupported or unknown labels fall through to the next signal
// instead of throwing.
// ---------------------------------------------------------------------------

// Labels Node's TextDecoder does not accept but Japanese servers still emit.
// Everything else (x-euc-jp, cseucpkdfmtjapanese, sjis, x-sjis, ms932,
// windows-31j, shift-jis, iso-2022-jp, …) is already an encoding-standard
// label that TextDecoder resolves itself.
const CHARSET_LABEL_FIXES = new Map([
  ['cp932', 'shift_jis'],
  ['windows932', 'shift_jis'],
  ['windows-932', 'shift_jis'],
  ['sjis', 'shift_jis'],
  ['eucjp', 'euc-jp'],
  ['euc_jp', 'euc-jp'],
  ['x-euc', 'euc-jp'],
  ['utf8', 'utf-8'],
  ['utf-8n', 'utf-8']
]);

// ASCII-only peek at the first `max` BYTES (byte-exact, charset-independent):
// used to read <meta charset> out of a document we have not decoded yet.
function asciiPeek(bytes, max) {
  const end = Math.min(bytes.length, max);
  let out = '';
  for (let i = 0; i < end; i++) out += String.fromCharCode(bytes[i]);
  return out;
}

export function normalizeCharsetLabel(label) {
  const raw = String(label || '').trim().replace(/^["']|["']$/g, '').toLowerCase();
  if (!raw) return null;
  return CHARSET_LABEL_FIXES.get(raw) || raw;
}

// A label the current Node runtime can actually decode with, or null.
export function supportedCharset(label) {
  const norm = normalizeCharsetLabel(label);
  if (!norm) return null;
  try { new TextDecoder(norm); return norm; } catch { return null; }
}

// The BOM, when present, outranks every declaration in the document.
export function bomCharset(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xEF && bytes[1] === 0xBB && bytes[2] === 0xBF) return 'utf-8';
  if (bytes.length >= 2 && bytes[0] === 0xFF && bytes[1] === 0xFE) return 'utf-16le';
  if (bytes.length >= 2 && bytes[0] === 0xFE && bytes[1] === 0xFF) return 'utf-16be';
  return null;
}

export function charsetFromContentType(contentType) {
  const m = String(contentType || '').match(/charset\s*=\s*("?)([^;"'\s]+)\1/i);
  return m ? m[2] : null;
}

const META_SCAN_BYTES = 4096;

export function charsetFromMeta(bytes) {
  if (!bytes || !bytes.length) return null;
  const head = asciiPeek(bytes, META_SCAN_BYTES);
  const declared = head.match(/<meta[^>]+charset\s*=\s*["']?\s*([A-Za-z0-9_:.+-]+)/i);
  if (declared) return declared[1];
  const equiv = head.match(/<meta[^>]*http-equiv\s*=\s*["']?content-type["']?[^>]*content\s*=\s*["'][^"']*charset\s*=\s*([A-Za-z0-9_:.+-]+)/i);
  return equiv ? equiv[1] : null;
}

export function isUtf8Bytes(bytes) {
  try { new TextDecoder('utf-8', { fatal: true }).decode(bytes); return true; }
  catch { return false; }
}

function replacementCount(bytes, charset) {
  const text = new TextDecoder(charset, { fatal: false }).decode(bytes);
  let n = 0;
  for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 0xFFFD) n++;
  return n;
}

// Byte-level fallback for a response that declares nothing. Valid UTF-8 is
// read as UTF-8 (the modern default and what every relay returns); otherwise
// the two Japanese encodings goo-net has used are scored by how much of the
// body they can actually decode, with the Shift_JIS lead-byte range
// (0x80–0x9F, which EUC-JP never uses outside the 0x8E/0x8F prefixes) as the
// tie-break.
export function sniffCharset(bytes) {
  if (!bytes || !bytes.length) return 'utf-8';
  if (isUtf8Bytes(bytes)) return 'utf-8';
  let sjisRange = 0;
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i];
    if (b >= 0x81 && b <= 0x9F) sjisRange++;
  }
  let eucErrors = 0, sjisErrors = 0;
  try { eucErrors = replacementCount(bytes, 'euc-jp'); } catch { eucErrors = Infinity; }
  try { sjisErrors = replacementCount(bytes, 'shift_jis'); } catch { sjisErrors = Infinity; }
  if (eucErrors !== sjisErrors) return eucErrors < sjisErrors ? 'euc-jp' : 'shift_jis';
  return sjisRange > 0 ? 'shift_jis' : 'euc-jp';
}

// Bytes in → text out, with the charset that was used and where it came from.
// `maxBytes` caps the BYTES decoded (a byte cap, not a character cap — the old
// code compared decoded character count against maxBytes, so a multi-byte page
// could decode far more bytes than the cap allowed).
export function decodeHtmlBytes(bytes, { contentType = '', maxBytes = 0 } = {}) {
  const raw = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  const truncated = maxBytes > 0 && raw.length > maxBytes;
  const body = truncated ? raw.subarray(0, maxBytes) : raw;

  const decode = (charset, charsetSource) => {
    const text = new TextDecoder(charset, { fatal: false }).decode(body);
    let replacements = 0;
    for (let i = 0; i < text.length; i++) if (text.charCodeAt(i) === 0xFFFD) replacements++;
    return {
      text, charset, charsetSource, replacements,
      byteLength: raw.length, encodedByteLength: body.length, truncated
    };
  };

  const bom = bomCharset(body);
  if (bom) {
    const supported = supportedCharset(bom);
    if (supported) return decode(supported, 'bom');
  }
  for (const [label, source] of [[charsetFromContentType(contentType), 'content-type'], [charsetFromMeta(body), 'meta']]) {
    const supported = supportedCharset(label);
    if (supported) return decode(supported, source);
  }
  const sniffed = supportedCharset(sniffCharset(body)) || 'utf-8';
  return decode(sniffed, isUtf8Bytes(body) ? 'sniff-utf8' : 'sniff');
}

// ---------------------------------------------------------------------------
// Fetch helpers (global fetch + timeout + a browser-like UA). goo-net serves
// different markup to bots, so a UA string matters a lot here.
// ---------------------------------------------------------------------------
const GOONET_HOST = 'www.goo-net.com';
const GOONET_HOME = 'https://www.goo-net.com/';
const DEFAULT_COOKIE = 'goo_session=active; cookie_consent=1';

// Words the bot gate itself prints. These are the only markers treated as
// evidence of blocking.
const BOT_GATE_MARKERS = ['ページが見つかりません', 'アクセスが集中', 'セキュリティ',
  '一時的に', 'メンテナンス', 'お探しのページ', 'reCAPTCHA', 'captcha'];

// Extra words that suggest "this is not a listing page" — but only on a page
// that has no car links to read. They are boilerplate on ordinary goo-net
// pages (cookie-consent links, JS bundles), so they are reported for
// diagnostics and NEVER allowed to overrule a page full of real car links.
// In production a 1.1 MB listing page with 50 car links matched "cookie" +
// "Cookie", was called a stub, and the run was mis-reported as bot-blocked.
const THIN_PAGE_MARKERS = ['cookie', 'Cookie', 'utilized', 'verify'];

const STUB_MARKERS = [...BOT_GATE_MARKERS, ...THIN_PAGE_MARKERS];

// Cookie jar shared across a single run (warm-up happens at most once).
let cookieJar = '';
let warmedUp = false;

// Test helper: forget the jar so each test starts from a clean slate.
export function resetFetchState() {
  cookieJar = '';
  warmedUp = false;
}

function isGoonetUrl(url) {
  try { return new URL(String(url)).hostname === GOONET_HOST; }
  catch { return false; }
}

function collectCookies(res) {
  try {
    const raw = (res.headers && (
      (typeof res.headers.getSetCookie === 'function' && res.headers.getSetCookie().join(', ')) ||
      (typeof res.headers.get === 'function' && res.headers.get('set-cookie')) || ''
    )) || '';
    const pairs = String(raw).split(/,(?=[^;]+?=)/)
      .map(c => c.split(';')[0].trim()).filter(Boolean);
    if (pairs.length) {
      const jar = new Map();
      for (const c of (cookieJar ? cookieJar.split('; ') : [])) {
        const i = c.indexOf('=');
        if (i > 0) jar.set(c.slice(0, i), c.slice(i + 1));
      }
      for (const c of pairs) {
        const i = c.indexOf('=');
        if (i > 0) jar.set(c.slice(0, i), c.slice(i + 1));
      }
      cookieJar = [...jar.entries()].map(([k, v]) => k + '=' + v).join('; ');
    }
  } catch { /* header shape differs in tests — ignore */ }
}

function browserHeaders(url, cookie) {
  const headers = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
    'Accept-Encoding': 'gzip, deflate, br',
    'Cache-Control': 'no-cache',
    'Pragma': 'no-cache',
    'Sec-Ch-Ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
    'Sec-Ch-Ua-Mobile': '?0',
    'Sec-Ch-Ua-Platform': '"Windows"',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'same-origin',
    'Upgrade-Insecure-Requests': '1'
  };
  // Cookies and the goo-net Referer must never leak to another host.
  if (isGoonetUrl(url)) {
    headers['Cookie'] = cookie || DEFAULT_COOKIE;
    headers['Referer'] = GOONET_HOME;
  }
  return headers;
}

// ---------------------------------------------------------------------------
// Card discovery: where does a goo-net car link actually live?
//
// The live failure was reported as "50 car links, 0 cards". Those 50 links
// were counted by a regex that scans the WHOLE document — including the
// application/ld+json ItemList in <head>. So "50 car links" never proved that
// fifty DOM anchors matched; the parser's anchor regex demands a
// double-quoted, absolute http(s) www.goo-net.com URL, and goo-net has served
// relative, protocol-relative and single-quoted hrefs at different times (and
// puts the same URLs in structured data and inline JS).
//
// This scanner finds a spread link in ANY of those shapes and reports where
// it found it: inside a real <a> tag, inside <script>/<style>, or bare in
// text. DOM anchors drive card segmentation; structured data is an additional,
// deterministic source of stock ids for a page whose anchors cannot be used —
// and every candidate still goes through the same detail fetch and the same
// quality gate as a DOM card.
// ---------------------------------------------------------------------------

// `\/` (a backslash-escaped slash, as it appears inside JSON/JS strings) is
// accepted everywhere a slash is. Written as a regex LITERAL so the escaping
// belongs to the regex engine and not to the JavaScript string parser: `\\?`
// is an optional literal backslash, `\/` is a slash, `\d` is a digit.
const SPREAD_URL_RE =
  /(?:(?:https?:)?(?:\\?\/){2}(?:www\.)?goo-net\.com)?(?:\\?\/)+usedcar(?:\\?\/)+spread(?:\\?\/)+goo(?:\\?\/)+\d+(?:\\?\/)+([0-9A-Za-z_-]+)\.html/g;

// Canonical, absolute, https URL for a spread link found by the scanner —
// whatever shape the page printed it in.
export function normalizeCarUrl(raw, stock) {
  const s = String(raw || '').replace(/\\\//g, '/').trim();
  if (s) {
    try {
      const u = new URL(s.startsWith('//') ? 'https:' + s : s, 'https://www.goo-net.com/');
      if (/^\/usedcar\/spread\/goo\/\d+\//.test(u.pathname)) {
        const id = (u.pathname.match(/([0-9A-Za-z_-]+)\.html$/) || [])[1] || stock;
        return detailUrlFor(id || stock);
      }
    } catch { /* fall through to the stock id */ }
  }
  return detailUrlFor(stock);
}

// Ranges covered by <script>/<style> — a URL in there is data, not a card.
function scriptRanges(html) {
  const ranges = [];
  const re = /<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi;
  let m;
  while ((m = re.exec(html))) ranges.push([m.index, m.index + m[0].length]);
  return ranges;
}

// First occurrence of `needle` that is NOT inside <script>/<style> — used to
// find the markup around a stock id whose card links were structured-data
// only, so price/year/mileage can still be read from the rendered spec block.
export function firstIndexOutsideScripts(html, needle, ranges = null, from = 0) {
  const s = String(html || '');
  const spans = ranges || scriptRanges(s);
  const n = String(needle || '');
  if (!n) return -1;
  let i = from;
  while (true) {
    const at = s.indexOf(n, i);
    if (at < 0) return -1;
    if (!inRanges(spans, at)) return at;
    i = at + 1;
  }
}

function inRanges(ranges, index) {
  for (const [a, b] of ranges) {
    if (index >= a && index < b) return true;
    if (a > index) break;
  }
  return false;
}

// The end of a tag, skipping over quoted attribute values (a `>` inside
// title="a > b" must not end the tag).
function tagEnd(html, from, cap = 4000) {
  let quote = null;
  const stop = Math.min(html.length, from + cap);
  for (let i = from; i < stop; i++) {
    const c = html[i];
    if (quote) { if (c === quote) quote = null; }
    else if (c === '"' || c === "'") quote = c;
    else if (c === '>') return i + 1;
  }
  return -1;
}

// href in any quoting style: double, single or unquoted.
function attrHref(attrs) {
  const m = attrs.match(/\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'`=<>]+))/i);
  if (!m) return null;
  return m[1] ?? m[2] ?? m[3] ?? null;
}

function anchorCandidate(inner) {
  const text = stripTags(inner).replace(/\s+/g, ' ').trim();
  if (text.length >= 4) return text;
  const alt = (inner.match(/<img[^>]*\balt\s*=\s*(?:"([^"]*)"|'([^']*)')/i) || []);
  const altText = String(alt[1] || alt[2] || '').replace(/\s+/g, ' ').trim();
  return altText.length >= 4 ? altText : null;
}

// Every place a spread link appears, classified.
export function scanCarLinks(html) {
  const s = String(html || '');
  const ranges = { text: s, ranges: scriptRanges(s) };
  const all = new Set();
  const occurrences = [];
  let m;
  SPREAD_URL_RE.lastIndex = 0;
  while ((m = SPREAD_URL_RE.exec(s))) {
    const stock = m[1] || m[2];
    if (!stock) continue;
    all.add(stock);
    occurrences.push({
      stock,
      raw: m[0],
      index: m.index,
      inScript: inRanges(ranges.ranges, m.index),
      url: normalizeCarUrl(m[0], stock)
    });
  }

  // Real markup anchors: <a …> tags (never inside <script>/<style>) whose href
  // resolves to a spread URL, in any quoting style or host-relative shape.
  const dom = [];
  const anchorRe = /<a\b/gi;
  let a;
  while ((a = anchorRe.exec(s))) {
    if (inRanges(ranges.ranges, a.index)) continue;
    const end = tagEnd(s, a.index);
    if (end < 0) continue;
    const attrs = s.slice(a.index + 2, end - 1);
    const href = attrHref(attrs);
    if (!href) continue;
    const link = normalizeCarUrl(href, null);
    const stock = link ? (link.match(/\/([0-9A-Za-z_-]+)\.html$/) || [])[1] : null;
    if (!stock) continue;
    const closeAt = s.toLowerCase().indexOf('</a>', end);
    const innerEnd = closeAt < 0 ? Math.min(s.length, end + 2000) : closeAt;
    const tagStart = s.slice(Math.max(0, a.index - 60), a.index);
    dom.push({
      stock,
      url: link,
      rawHref: href,
      pos: a.index,
      tagEnd: end,
      innerEnd,
      candidate: anchorCandidate(s.slice(end, innerEnd)),
      isH3: /<h3[^>]*>\s*$/i.test(tagStart) || /<h3[^>]*>[^<]*$/i.test(tagStart)
    });
  }

  return { all, occurrences, dom, scriptRanges: ranges.ranges };
}

// Structured data: application/ld+json ItemList entries (and any embedded
// spread URL in a JSON blob). Deterministic, but only a SOURCE OF CANDIDATES —
// the fields it carries are never trusted as a complete car.
export function parseJsonLdCarItems(html) {
  const s = String(html || '');
  const out = [];
  const seen = new Set();
  const push = (url, name, image, position) => {
    const stock = (String(url || '').match(/\/([0-9A-Za-z_-]+)\.html/) || [])[1];
    if (!stock || seen.has(stock)) return;
    seen.add(stock);
    out.push({
      stock,
      url: normalizeCarUrl(url, stock),
      title: name ? stripTags(String(name)).replace(/\s+/g, ' ').trim() || null : null,
      image: image || null,
      position: Number.isFinite(position) ? position : null
    });
  };

  const blocks = [];
  const scriptRe = /<script\b[^>]*type\s*=\s*(?:"application\/ld\+json"|'application\/ld\+json'|application\/ld\+json)[^>]*>([\s\S]*?)<\/script\s*>/gi;
  let m;
  while ((m = scriptRe.exec(s))) blocks.push(m[1]);

  const walk = node => {
    if (!node || typeof node !== 'object') return;
    if (Array.isArray(node)) { node.forEach(walk); return; }
    const image = typeof node.image === 'string' ? node.image
      : (node.image && typeof node.image === 'object'
        ? (Array.isArray(node.image) ? node.image[0]?.contentUrl : node.image.contentUrl) : null);
    const rawImage = typeof image === 'string' ? image : null;
    if (typeof node.url === 'string' && /\/usedcar\/spread\/goo\//.test(node.url)) {
      push(node.url, node.name || node.headline, rawImage, node.position);
    }
    for (const key of ['itemListElement', 'item', 'mainEntity', 'hasPart', 'offers', 'about']) {
      if (node[key]) walk(node[key]);
    }
  };

  for (const block of blocks) {
    let data = null;
    try { data = JSON.parse(block); }
    catch {
      // goo-net has wrapped JSON-LD in HTML entities before; a tolerant retry
      // beats dropping the whole block.
      try { data = JSON.parse(block.replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))); }
      catch { data = null; }
    }
    if (data) walk(data);
  }

  // Last resort for a page whose card grid is rendered from a JS data blob:
  // spread URLs inside any <script> still enumerate real cars, and every one of
  // them is a CANDIDATE only — the detail fetch and the quality gate decide.
  // Tagged so the report can say where the candidates came from.
  if (!out.length) {
    for (const [start, end] of scriptRanges(s)) {
      const chunk = s.slice(start, end);
      let mm;
      const urlRe = new RegExp(SPREAD_URL_RE.source, 'g');
      while ((mm = urlRe.exec(chunk))) push(mm[0], null, null, null);
    }
    for (const item of out) item.via = 'script';
  } else {
    for (const item of out) item.via = 'json-ld';
  }
  return out;
}

// Distinct cars a page links to ANYWHERE (markup, structured data, scripts).
// This is the "50 car links" number the importer reports — kept because it is
// the honest measure of "the page is real", never as proof the parser read it.
export function countSpreadLinks(html) {
  return scanCarLinks(html).all.size;
}

// Distinct cars linked from a REAL markup anchor (any host/quote shape). This
// is the number that says whether card segmentation has anything to work with;
// when it is 0 while countSpreadLinks is 50, the links are structured-data
// only.
export function countDomCarLinks(html) {
  return new Set(scanCarLinks(html).dom.map(a => a.stock)).size;
}

// True when the HTML we got back is not a real listing page.
//
// The car-link count is the only hard signal: a page that links 2+ distinct
// cars can be read, whatever fine print it also contains. Gate wording is used
// for diagnostics (and by the caller to name the blocker), never to overrule
// results that are plainly there.
export function looksLikeStub(html) {
  return countSpreadLinks(html) < 2;
}

// Which bot-gate phrases this HTML contains, if any. Empty for a real page.
export function botGateMarkers(html) {
  const s = String(html || '');
  return BOT_GATE_MARKERS.filter(marker => s.includes(marker));
}

// `meta` is a rawFetch result (or anything with byte/charset fields). Passing
// it through keeps "how many bytes the server sent" and "how many characters
// we decoded" as two separate, honest numbers next to the charset that was
// used — the three things the mojibake incident needed and did not have.
export function pageDiagnostics(html, meta = null) {
  const s = String(html || '');
  const links = scanCarLinks(s);
  const structured = parseJsonLdCarItems(s);
  return {
    contentLength: s.length,
    spreadLinks: countSpreadLinks(s),
    domCarLinks: new Set(links.dom.map(a => a.stock)).size,
    scriptCarLinks: new Set(links.occurrences.filter(o => o.inScript).map(o => o.stock)).size,
    jsonLdCars: structured.length,
    markers: STUB_MARKERS.filter(marker => s.includes(marker)),
    gateMarkers: botGateMarkers(s),
    stub: looksLikeStub(s),
    ...(meta ? {
      bytes: meta.byteLength ?? null,
      chars: meta.charLength ?? s.length,
      charset: meta.charset ?? null,
      charsetSource: meta.charsetSource ?? null,
      contentType: meta.contentType || '',
      replacements: meta.replacements ?? 0
    } : {})
  };
}

function headerValue(res, name) {
  try {
    if (!res.headers || typeof res.headers.get !== 'function') return '';
    return String(res.headers.get(name) || '');
  } catch { return ''; }
}

// Bytes straight off the wire — never a decoded string. Keeping the byte count
// and the decoded character count separate is what lets the report tell "the
// page really is 1.18 MB" apart from "we decoded 1.18 M replacement chars".
async function readResponseBody(res, maxBytes) {
  const contentType = headerValue(res, 'content-type');
  if (typeof res.arrayBuffer === 'function') {
    const buf = await res.arrayBuffer();
    const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    return { ...decodeHtmlBytes(bytes, { contentType, maxBytes }), contentType };
  }
  // A Response-shaped stub with no byte access (older test doubles, exotic
  // runtimes). Still usable, but the weaker path is named in diagnostics so a
  // production regression cannot hide behind it.
  const text = await res.text();
  const truncated = maxBytes > 0 && text.length > maxBytes;
  return {
    text: truncated ? text.slice(0, maxBytes) : text,
    charset: null, charsetSource: 'text-fallback', replacements: 0, contentType,
    byteLength: text.length, encodedByteLength: Math.min(text.length, maxBytes), truncated
  };
}

// A response that followed a redirect off goo-net (or off the relay host) is
// not the page we asked for, and goo-net cookies must never ride along to
// wherever it pointed. The body is dropped and the hop is reported instead of
// being parsed as if it were stock data.
function redirectEscaped(url, res) {
  const finalUrl = res && typeof res.url === 'string' ? res.url : '';
  if (!finalUrl) return null;
  try {
    const from = new URL(url);
    const to = new URL(finalUrl);
    const allowed = new Set([from.hostname, GOONET_HOST, 'goo-net.com']);
    if (from.hostname.includes('jina.ai')) allowed.add(to.hostname);
    return allowed.has(to.hostname) ? null : to.hostname;
  } catch { return null; }
}

async function rawFetch(url, { timeoutMs, maxBytes, headers }) {
  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal, redirect: 'follow' });
    const escaped = redirectEscaped(url, res);
    if (escaped) {
      if (isGoonetUrl(url)) collectCookies(res);
      return {
        ok: false, status: res.status, html: '', truncated: false,
        byteLength: 0, charLength: 0, charset: null, charsetSource: null,
        replacements: 0, unsafeRedirectTo: escaped,
        durationMs: Date.now() - start, headersUsed: Object.keys(headers),
        error: 'redirected off goo-net to ' + escaped + ' — body discarded'
      };
    }
    const body = await readResponseBody(res, maxBytes);
    if (isGoonetUrl(url)) collectCookies(res);
    return {
      ok: res.ok,
      status: res.status,
      html: body.text,
      truncated: body.truncated,
      byteLength: body.byteLength,
      charLength: body.text.length,
      charset: body.charset,
      charsetSource: body.charsetSource,
      replacements: body.replacements,
      contentType: body.contentType || '',
      durationMs: Date.now() - start,
      headersUsed: Object.keys(headers)
    };
  } catch (e) {
    return {
      ok: false, status: 0, html: '', truncated: false,
      byteLength: 0, charLength: 0, charset: null, charsetSource: null,
      replacements: 0,
      durationMs: Date.now() - start, error: e.message,
      headersUsed: Object.keys(headers)
    };
  } finally {
    clearTimeout(timer);
  }
}

// Warm up once: hit the homepage like a browser would so we pick up the
// session cookies goo-net expects on the following search request.
async function warmUp(timeoutMs) {
  if (warmedUp) return;
  warmedUp = true;
  await rawFetch(GOONET_HOME, {
    timeoutMs: Math.min(timeoutMs, 4000),
    maxBytes: 400_000,
    headers: browserHeaders(GOONET_HOME, cookieJar || DEFAULT_COOKIE)
  });
}

// Fetch `url` through the free reader relay. Used whenever this host cannot
// read goo-net itself — either because goo-net answered with its bot-gate stub
// or because the connection failed at the network level.
async function relayFetch(url, { timeoutMs, maxBytes }) {
  const relayHeaders = {
    'User-Agent': UA,
    'Accept': 'text/html,application/xhtml+xml,*/*;q=0.8',
    'Accept-Language': 'ja,en-US;q=0.9,en;q=0.8',
    'X-Return-Format': 'html',
    'X-No-Cache': 'true',
    'X-With-Links-Summary': 'false'
  };
  // An API key lifts the relay off the rate-limited keyless tier. It is only
  // ever sent to the relay host itself (rawFetch headers are caller-built).
  const key = relayApiKey();
  if (key) relayHeaders['Authorization'] = 'Bearer ' + key;
  const relayed = await rawFetch(relayBaseUrl() + url, { timeoutMs, maxBytes, headers: relayHeaders });
  return { relayed, relayPage: pageDiagnostics(relayed.html, relayed) };
}

// The byte/encoding facts for the response a caller actually parsed. Kept as
// one object so diagnostics can report bytes, characters, charset and how that
// charset was chosen without re-deriving anything from the decoded string.
function fetchMeta(from) {
  return {
    byteLength: from.byteLength ?? null,
    charLength: from.charLength ?? (from.html || '').length,
    charset: from.charset || null,
    charsetSource: from.charsetSource || null,
    contentType: from.contentType || '',
    replacements: from.replacements || 0,
    truncated: !!from.truncated
  };
}

export async function fetchPage(url, { timeoutMs = 8000, maxBytes = 4_000_000, cookie = null, allowRelay = true, purpose = 'listing' } = {}) {
  if (isGoonetUrl(url)) await warmUp(timeoutMs);
  const cookieToSend = cookie || cookieJar || DEFAULT_COOKIE;
  const headers = browserHeaders(url, cookieToSend);
  const direct = await rawFetch(url, { timeoutMs, maxBytes, headers });

  const diagnostics = {
    url,
    status: direct.status,
    ok: direct.ok,
    durationMs: direct.durationMs,
    contentLength: (direct.html || '').length,
    // Bytes received vs characters decoded — never conflate the two again.
    bytes: direct.byteLength ?? (direct.html || '').length,
    chars: direct.charLength ?? (direct.html || '').length,
    charset: direct.charset || null,
    charsetSource: direct.charsetSource || null,
    contentType: direct.contentType || '',
    replacements: direct.replacements || 0,
    headersUsed: direct.headersUsed,
    cookieSent: isGoonetUrl(url),
    warmedUp,
    via: 'direct',
    fallbackUsed: false,
    ...(direct.unsafeRedirectTo ? { unsafeRedirectTo: direct.unsafeRedirectTo } : {}),
    ...(direct.error ? { error: direct.error } : {})
  };

  if (direct.error) {
    // A connection that never completed (DNS failure, TLS reset, connection
    // refused — what a bot-filtered datacenter IP usually gets) is the SAME
    // "this host cannot read goo-net" situation as a stub page, so it earns the
    // same relay attempt. This used to return immediately, so an importer whose
    // direct socket was refused never even tried the relay and imported nothing.
    const networkDiag = { ...diagnostics, fallbackUsed: true, directDiagnostics: pageDiagnostics('') };
    if (allowRelay && isGoonetUrl(url)) {
      const { relayed, relayPage } = await relayFetch(url, { timeoutMs, maxBytes });
      if (relayed.ok && !looksLikeStub(relayed.html)) {
        const relayMeta = fetchMeta(relayed);
        return {
          ok: true,
          status: relayed.status,
          html: relayed.html,
          truncated: relayed.truncated,
          via: 'relay',
          meta: relayMeta,
          directDiagnostics: networkDiag.directDiagnostics,
          diagnostics: {
            ...networkDiag,
            via: 'relay',
            relayUrl: JINA_RELAY + url,
            contentLength: (relayed.html || '').length,
            bytes: relayMeta.byteLength,
            chars: relayMeta.charLength,
            charset: relayMeta.charset,
            charsetSource: relayMeta.charsetSource,
            relayDurationMs: relayed.durationMs,
            relayDiagnostics: relayPage
          }
        };
      }
      networkDiag.relayAttempted = true;
      networkDiag.relayDiagnostics = relayPage;
    }
    return { ok: false, status: 0, html: '', error: direct.error, via: 'direct', meta: fetchMeta(direct), diagnostics: networkDiag };
  }

  const directPage = pageDiagnostics(direct.html, direct);
  // The stub heuristic counts /spread/ links, which is only meaningful for a
  // LISTING page — a detail page legitimately has few or zero of them. Relaying
  // a detail fetch on that heuristic let whatever larger page the relay
  // returned (even a listing page) replace perfectly good detail HTML.
  //
  // A detail page behind the bot gate is a different, narrower case: the
  // direct answer is a SMALL body carrying the gate's own wording. That can
  // never be real detail HTML (a real one is ~1 MB and prints no gate
  // phrases), so relaying it cannot replace anything good. Without this, a
  // gated host reads the listing fine through the relay yet loses every car:
  // each detail fetch hands back a 200 gate stub, fuel/body never parse, and
  // the import loop skips the car for "missing fields".
  const gateStubbedDetail = purpose === 'detail' && direct.status !== 404
    && (direct.html || '').length < GATE_PAGE_BYTES
    && directPage.gateMarkers.length > 0;

  const shouldRelay = allowRelay && isGoonetUrl(url) && direct.status !== 404
    && ((purpose !== 'detail' && looksLikeStub(direct.html)) || gateStubbedDetail);

  if (shouldRelay) {
    const { relayed, relayPage } = await relayFetch(url, { timeoutMs, maxBytes });
    // Only trust the relay when it genuinely saw more than we did: more cars
    // for a listing page; for a gate-stubbed detail page, a bigger body with
    // no gate wording (mergeCardAndDetail still refuses anything that does
    // not parse as a real detail page before using it).
    const relayIsBetter = gateStubbedDetail
      ? relayPage.contentLength > directPage.contentLength && relayPage.gateMarkers.length === 0
      : relayPage.spreadLinks > directPage.spreadLinks;
    if (relayed.ok && relayIsBetter) {
      const relayMeta = fetchMeta(relayed);
      return {
        ok: true,
        status: relayed.status,
        html: relayed.html,
        truncated: relayed.truncated,
        via: 'relay',
        meta: relayMeta,
        directDiagnostics: directPage,
        diagnostics: {
          ...diagnostics,
          via: 'relay',
          relayUrl: JINA_RELAY + url,
          fallbackUsed: true,
          contentLength: (relayed.html || '').length,
          bytes: relayMeta.byteLength,
          chars: relayMeta.charLength,
          charset: relayMeta.charset,
          charsetSource: relayMeta.charsetSource,
          relayDurationMs: relayed.durationMs,
          directDiagnostics: directPage,
          relayDiagnostics: relayPage
        }
      };
    }
    diagnostics.relayAttempted = true;
    diagnostics.relayDiagnostics = relayPage;
  }

  return {
    ok: direct.ok,
    status: direct.status,
    html: direct.html,
    truncated: direct.truncated,
    via: 'direct',
    meta: fetchMeta(direct),
    directDiagnostics: directPage,
    diagnostics: { ...diagnostics, directDiagnostics: directPage }
  };
}

// A delisted goo-net page is either an HTTP 404 or the live "this vehicle was
// listed until …" notice. Anything ambiguous (network failure, timeout) is
// treated as NOT delisted — we never unpublish on a network hiccup.
export function isDelistedPage({ ok, status = 0, html = '', text = '' } = {}) {
  const body = (html || text || '').toString();
  if (status === 404) return true;
  if (status >= 500 || status === 0) return false;
  if (body.includes('ページが見つかりません')) return true;
  if (body.includes('まで掲載されていた車両です') || body.includes('まで掲載されていた車輿です')) return true;
  return false;
}

// ---------------------------------------------------------------------------
// Listing page parsing
// ---------------------------------------------------------------------------

// All unique car photos on a goo-net page (J/Q folder images only — shop
// logos live in /shop/, /P/ and /S/ folders and are excluded).
export function extractCarImages(html) {
  const out = [];
  const re = /https:\/\/picture1\.goo-net\.com\/[^"')\s]+?\.(?:jpg|jpeg|png)/g;
  let m;
  while ((m = re.exec(html))) {
    const u = m[0];
    if (u.includes('/shop/') || /\/[PS]\//.test(u)) continue;
    out.push(u);
  }
  return extendGallery([...new Set(out)]);
}

const PIC_RE = /https:\/\/picture1\.goo-net\.com\/[^"')\s]+?\.(?:jpg|jpeg|png)/g;

export function parseListingPage(html, baseUrl = DEFAULT_SEARCH_URL) {
  const s = String(html || '');
  if (!s.trim()) {
    return {
      cars: [],
      pagination: { total: 1 },
      diagnostics: { parseStatus: 'empty_html', fallbackTemplate: true }
    };
  }

  // 1) Every spread anchor a real markup scan can find — any host shape
  // (absolute / protocol-relative / root-relative), any quote style, with or
  // without a #photo fragment. A missing DOM anchor is no longer fatal: the
  // structured-data candidates below still cover the page.
  const scanned = scanCarLinks(s);
  const anchors = scanned.dom;

  // 2) Per stock: the TITLE anchor. Ranked so the real card's title wins: an
  // <h3> anchor first, then an anchor whose following 2500 chars carry the
  // spec block (年式/万円/走行距離), then candidate length. A bare thumbnail
  // (no readable candidate, no spec block after it — a hidden mobile grid or
  // preload strip linking the same stocks) can never win.
  //
  // This is the fix for the 2026-09 live regression: the page links every
  // stock in extra regions, so "first spread link per stock" no longer marks
  // the card start — segments collapsed into bare thumbnail blocks and 49 of
  // 50 cards parsed as nothing.
  const SPEC_AHEAD = 2500;
  for (const a of anchors) {
    const ahead = s.slice(a.tagEnd, a.tagEnd + SPEC_AHEAD);
    const hasSpec = /(万円|年式|走行距離)/.test(ahead);
    a.rank = (a.isH3 ? 8 : 0) + (hasSpec ? 4 : 0) + (a.candidate ? 2 : 0)
      + Math.min(2, Math.floor((a.candidate ? a.candidate.length : 0) / 50));
  }
  const bestByStock = new Map();
  for (const a of anchors) {
    const cur = bestByStock.get(a.stock);
    if (!cur || a.rank > cur.rank) bestByStock.set(a.stock, a);
  }
  const marks = [...bestByStock.values()].sort((a, b) => a.pos - b.pos);

  // 3) Cut segments title-anchor → title-anchor and parse each region.
  const cars = [];
  const covered = new Set();
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    const prevPos = i > 0 ? marks[i - 1].pos : 0;
    const nextPos = i + 1 < marks.length ? marks[i + 1].pos : s.length;
    const card = parseCardRegion(s, prevPos, mark, nextPos, baseUrl);
    if (card) { cars.push(card); covered.add(card.goonet_id); }
  }

  // 4) Structured data (application/ld+json ItemList) — a deterministic
  // candidate list for stocks the markup scan produced no card for. These are
  // CANDIDATES ONLY: they carry a stock id, a canonical detail URL and often a
  // title/photo, and nothing else is invented. Price, year, mileage, fuel and
  // the full gallery still come from the real detail page, and the same
  // quality gate and required-field checks decide whether a car is imported.
  const structured = parseJsonLdCarItems(s);
  const fromStructured = [];
  for (const item of structured) {
    if (covered.has(item.stock)) continue;
    const card = cardFromStructured(item, s, baseUrl, scanned.scriptRanges);
    if (card) { fromStructured.push(card); covered.add(card.goonet_id); }
  }

  const all = [...cars, ...fromStructured];
  const cardSource = fromStructured.length
    ? (cars.length ? 'dom+structured' : 'structured')
    : (cars.length ? 'dom' : 'none');
  return {
    cars: all,
    pagination: parsePagination(s),
    diagnostics: {
      parseStatus: all.length ? 'success' : 'no_cards_matched',
      cardCount: all.length,
      domCards: cars.length,
      structuredCandidates: structured.length,
      structuredCards: fromStructured.length,
      domCarLinks: new Set(anchors.map(a => a.stock)).size,
      cardSource,
      fallbackTemplate: all.length === 0
    }
  };
}

// Build a card from a structured-data candidate. Nothing is invented: the
// stock id, canonical URL, title and cover photo come from the ItemList entry,
// and any price/year/mileage comes from the page's own markup around that
// stock id (when the server rendered a spec block the anchor scan could not
// use). Everything else is filled in from the detail page — and if the detail
// page cannot supply it, the quality gate rejects the car.
function cardFromStructured(item, html, baseUrl, scriptRanges) {
  const stock = item && item.stock;
  if (!stock) return null;
  const at = firstIndexOutsideScripts(html, stock, scriptRanges);
  const window = at >= 0 ? html.slice(Math.max(0, at - 2500), Math.min(html.length, at + 4500)) : '';
  const title = item.title || null;
  const make = makeFromModel(title || '') || detectMake(String(title || '') + ' ' + window) || detectMake(window) || null;
  const priceJpy = manToYen(after(window, '車両本体価格', v => /万円/.test(v)) || after(window, '支払総額', v => /万円/.test(v)))
    || priceTextToYen(after(window, '車両本体価格') || after(window, '支払総額') || after(window, '価格'))
    || null;
  const year = numberAfter(window, '年式');
  const km = kmToNumber(after(window, '走行距離', v => /km/i.test(v)));
  const images = extractCarImages(window);
  const cover = item.image && /^https:\/\/picture1\.goo-net\.com\//.test(item.image) && !item.image.includes('/shop/')
    ? item.image : null;
  if (cover && !images.includes(cover)) images.unshift(cover);
  const gallery = extendGallery([...new Set(images)]);
  const ext = ratingAfter(window, '外装');
  const int = ratingAfter(window, '内装');
  const repair = after(window, '修復歴');
  const url = item.url || detailUrlFor(stock);
  const model = make ? detectModel(title || window.slice(0, 200) || make, make) : null;
  return {
    goonet_id: stock,
    stock_no: stock,
    make: make || 'Unknown',
    model,
    title,
    url,
    year,
    km,
    price_jpy: priceJpy,
    price_usd: yenToUsd(priceJpy),
    price: usdText(yenToUsd(priceJpy)),
    image: gallery[0] || cover || null,
    images: gallery,
    photo_count: gallery.length,
    tr: null,
    eng: formatEngine(after(window, '排気量')),
    ext_rating: ext,
    int_rating: int,
    repair_history: repair && repair.includes('あり') ? 'Yes' : (repair ? 'No' : null),
    location: detectPrefecture(window) || null,
    grade: ext && int ? String(Math.round(((ext + int) / 2) * 2) / 2) : null,
    from_structured_data: true,
    base_url: baseUrl
  };
}

export function parsePagination(html) {
  const pages = new Set();
  const re = /index-(\d+)\.html/g;
  let m;
  while ((m = re.exec(html))) pages.add(Number(m[1]));
  const max = pages.size ? Math.max(...pages) : 1;
  return { total: max };
}

function parseCardRegion(s, prevPos, mark, nextPos, baseUrl) {
  // ABOVE the title anchor: the thumbnail block (photos) and the make line.
  // Tail-bounded so the previous card's spec/shop block (and any filter
  // sidebar) cannot donate its text.
  const above = s.slice(Math.max(0, prevPos), mark.pos);
  const aboveTail = above.slice(-2500);
  // BELOW: this card's spec block (価格/年式/走行距離/…), loan and shop block —
  // everything up to the next card's title anchor. The next card's make line
  // and thumbnails sit just before it, so they are never used for make or
  // photos (those come from aboveTail) but they cannot donate spec fields:
  // the next card's own spec block starts past its title anchor.
  const chunk = s.slice(mark.pos, nextPos);
  // Photo region: the thumbnail block above the title. When the title anchor
  // is not the <h3> (markup drift), the #3/#4 thumbnails can sit just below
  // it — a short lower window catches those without reaching the NEXT card's
  // thumbnail block (on a live page that is 2 KB+ away). Shop logos are
  // filtered out by extractCarImages itself.
  const belowWin = mark.isH3 ? 0 : 800;
  const anchorEnd = mark.tagEnd ?? mark.aEnd ?? mark.pos;
  const imgRegion = aboveTail + (belowWin ? s.slice(anchorEnd, Math.min(s.length, anchorEnd + belowWin)) : '');

  // Title: the classic <h3><a …spread…> shape first, else the chosen anchor's
  // candidate (its text, or the thumbnail's img alt).
  const titleRe = /<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]*spread[^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/;
  const tm = chunk.match(titleRe);
  const title = tm ? stripTags(tm[2]).replace(/\s+/g, ' ').trim() : (mark.candidate || null);
  let url = tm ? new URL(tm[1], baseUrl).href : null;
  if (!url && mark.url) {
    try { url = new URL(mark.url, baseUrl).href; } catch { url = null; }
  }
  if (!url) url = detailUrlFor(mark.stock);

  const make = detectMake(aboveTail) || detectMake(chunk);
  const year = numberAfter(chunk, '年式');
  const km = kmToNumber(after(chunk, '走行距離', v => /km/i.test(v)));
  const priceJpy = manToYen(after(chunk, '車両本体価格', v => /万円/.test(v)) || after(chunk, '支払総額', v => /万円/.test(v)))
    || priceTextToYen(after(chunk, '車両本体価格') || after(chunk, '支払総額') || after(chunk, '価格'));
  const eng = formatEngine(after(chunk, '排気量'));
  const tr = transmissionAfter(chunk);
  const repair = after(chunk, '修復歴');
  const ext = ratingAfter(chunk, '外装');
  const int = ratingAfter(chunk, '内装');
  const location = detectPrefecture(chunk);
  const images = extractCarImages(imgRegion);

  if (!title && !make && !priceJpy) return null;
  const model = make ? detectModel(title || make, make) : null;

  return {
    goonet_id: mark.stock,
    stock_no: mark.stock,
    make: make || 'Unknown',
    model,
    title,
    url,
    year,
    km,
    price_jpy: priceJpy,
    price_usd: yenToUsd(priceJpy),
    price: usdText(yenToUsd(priceJpy)),
    image: images[0] || null,
    images,
    photo_count: images.length,
    tr,
    eng,
    ext_rating: ext,
    int_rating: int,
    repair_history: repair && repair.includes('あり') ? 'Yes' : (repair ? 'No' : null),
    location,
    grade: ext && int ? String(Math.round(((ext + int) / 2) * 2) / 2) : null
  };
}

// ---------------------------------------------------------------------------
// Detail page parsing — full specs + complete photo gallery.
// ---------------------------------------------------------------------------
export function parseDetailPage(html, url) {
  const s = String(html || '');
  const text = stripTags(s).replace(/\s+/g, ' ');
  const stock = extractStockFromUrl(url) || detectMake(s) ? extractStockFromUrl(url) : null;

  const title = (s.match(/<h1[^>]*>([\s\S]*?)<\/h1>/) || [])[1];
  const titleText = title ? stripTags(title).replace(/\s+/g, ' ').trim() : '';
  // The <h1> names THIS car. goo-net navigation names other brands, so matching
  // the make against the whole page text mislabelled imports (a Honda N-BOX
  // showed as NISSAN, 2026-10). Order: <h1>, then image alt, then the page; and
  // when the model name has a known brand, that cross-check wins.
  const altText = (s.match(/<img[^>]+alt="([^"]*)"/i) || [])[1] || '';
  const modelBrand = makeFromModel(titleText) || makeFromModel(title || '');
  let make = detectMake(titleText) || modelBrand || detectMake(altText) || detectMake(text) || null;
  if (modelBrand && make !== modelBrand) make = modelBrand;
  const location = detectPrefecture(text);
  const year = numberAfter(text, '年式(初度登録)') || numberAfter(text, '年式');
  const km = kmToNumber(after(text, '走行距離', v => /km/i.test(v)));
  const fuel = detectFuel(after(text, '燃料'));
  const body = detectBody(after(text, 'ボディタイプ')) || bodyForModel(title || '');
  const steeringRaw = after(text, 'ハンドル');
  const st = steeringRaw ? (steeringRaw.includes('左') ? 'LHD' : 'RHD') : null;
  const drvRaw = after(text, '駆動方式');
  const drv = drvRaw ? drvRaw.trim().slice(0, 8) : null;
  const eng = formatEngine(after(text, '排気量'));
  const seats = seatsNumber(after(text, '乗車定員'));
  const tr = transmissionAfter(text);
  const col = colourAfter(text);
  const repairRaw = after(text, '修復歴');
  const repair = repairRaw ? (repairRaw.includes('あり') ? 'Yes' : 'No') : null;
  const ext = ratingAfter(text, '外装');
  const int = ratingAfter(text, '内装');
  const priceJpy = manToYen(after(text, '車両本体価格', v => /万円/.test(v)) || after(text, '支払総額', v => /万円/.test(v)));
  const images = extractCarImages(s);

  const model = make ? detectModel(title || '', make) : null;

  return {
    goonet_id: stock,
    make,
    model,
    title: title ? stripTags(title).replace(/\s+/g, ' ').trim() : null,
    url,
    year,
    km,
    fuel,
    body,
    st,
    drv,
    eng,
    seats,
    tr,
    col,
    repair_history: repair,
    location,
    ext_rating: ext,
    int_rating: int,
    price_jpy: priceJpy || null,
    price_usd: yenToUsd(priceJpy),
    price: usdText(yenToUsd(priceJpy)),
    image: images[0] || null,
    images,
    photo_count: images.length
  };
}

// Merge card data with richer detail data (detail wins where present).
// The detail must actually have parsed as a detail page (a make AND an <h1>
// title) — a relay or rescue that handed back some other page must not
// contaminate the card with unrelated data.
export function mergeCardAndDetail(card, detail) {
  if (!detail || !detail.make || !detail.title) return card;
  const out = { ...card, ...detail };
  // A detail page that could not name the car must not erase the card's make.
  if (!out.make || out.make === 'Unknown') out.make = card.make || out.make;
  if (!out.price_jpy && card.price_jpy) out.price_jpy = card.price_jpy;
  if (!out.price_usd) out.price_usd = yenToUsd(out.price_jpy);
  if (!out.price) out.price = usdText(out.price_usd);
  if (!out.image && card.image) out.image = card.image;
  if ((out.images || []).length < (card.images || []).length) out.images = card.images;
  out.photo_count = (out.images || []).length;
  out.grade = (out.ext_rating && out.int_rating)
    ? String(Math.round(((out.ext_rating + out.int_rating) / 2) * 2) / 2)
    : (out.grade || null);
  return out;
}

// ---------------------------------------------------------------------------
// Quality gate — the rule the user asked for: only import cars with good
// quality pictures (plus a real price/year/mileage so listings are complete).
// ---------------------------------------------------------------------------
export function qualityScore(car, { minPhotos = 5, minYear = 2000 } = {}) {
  const reasons = [];
  let score = 0;

  const photos = (car.images || []).filter(Boolean);
  if (photos.length >= minPhotos) {
    score += 25 + Math.min(10, photos.length - minPhotos);
  } else {
    reasons.push(`photos ${photos.length}/${minPhotos}`);
  }

  if (car.image && /^https?:\/\//.test(car.image)) score += 5;
  else reasons.push('no cover photo');

  if (car.price_jpy && car.price_jpy > 0) score += 10;
  else reasons.push('no price');

  if (car.year && car.year >= minYear) score += 10;
  else reasons.push('no/old year');

  if (car.km) score += 5;
  else reasons.push('no mileage');

  if (car.make && car.make !== 'Unknown') score += 5;
  else reasons.push('unknown make');

  if (car.model) score += 5;
  else reasons.push('unknown model');

  if (car.ext_rating && car.ext_rating >= 3 && car.int_rating && car.int_rating >= 3) score += 10;
  else if (!car.ext_rating) reasons.push('no condition rating');

  if (car.repair_history === 'No') score += 5;
  else if (car.repair_history === 'Yes') score -= 10;

  const pass = reasons.length === 0 || (reasons.length === 1 && reasons[0].startsWith('no condition rating'));
  // A car without a condition rating can still pass if photos are excellent.
  const hardFail = reasons.some(r =>
    r.startsWith('photos ') || r.startsWith('no price') || r.startsWith('unknown make') || r.startsWith('unknown model'));

  return { pass: pass && !hardFail, score, reasons, photo_count: photos.length };
}

// ---------------------------------------------------------------------------
// Small text helpers
// ---------------------------------------------------------------------------
export function stripTags(s) {
  return String(s || '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/\u3000/g, ' ');
}

// Text that follows a label in the same sentence, cleaned of markup and cut
// at the next known field label (so values never bleed into the next spec).
// A label can appear inside a car's title too ("走行距離無制限保証付"), so an
// optional validator keeps scanning until a candidate actually parses.
const AFTER_LABELS = ['年式', '走行距離', '車検', '修復歴', '整備', '保証', '排気量',
  'ミッション', '支払総額', '車両本体', 'ハンドル', '乗車定員', '駆動方式', '燃料',
  'ドア', '車体色', 'その他', '更新', '現在', '無料電話', 'お気に入り', '在庫の確認',
  '外装', '内装', '住所', '掲載', '車台番号', '全長', '車両重量', '駆動形式',
  '使用燃料', '燃費', '最高出力', 'ドア数', '車両状態評価書', '禁煙車', 'ワンオーナー'];
export function after(text, label, validate = null) {
  const hay = String(text || '');
  let from = 0;
  while (true) {
    const i = hay.indexOf(label, from);
    if (i < 0) return null;
    let rest = hay.slice(i + label.length);
    let cut = rest.length;
    for (const l of AFTER_LABELS) {
      const idx = rest.indexOf(l);
      if (idx > 0 && idx < cut) cut = idx;
    }
    const val = stripTags(rest.slice(0, cut)).replace(/\s+/g, ' ').trim();
    if (!validate || (val && validate(val))) return val || null;
    from = i + label.length;
  }
}

export function numberAfter(text, label) {
  // goo-net writes the year several ways on real pages: "年式2018年" on a detail
  // page, "年式2017(平29)" on some cards, and — on today's listing cards —
  // a bare "年式2019後". The old check demanded a trailing 年/( so the bare form
  // parsed as null, and a car with no year is dropped by the quality gate.
  const v = after(text, label, val => /(19|20)\d{2}\s*[年(（]/.test(val) || /^\s*(19|20)\d{2}\b/.test(val));
  if (!v) return null;
  const m = v.match(/((?:19|20)\d{2})/);
  if (m) return Number(m[1]);
  const n = v.match(/(\d+)/);
  return n ? Number(n[1]) : null;
}

export function ratingAfter(text, label) {
  const i = String(text || '').indexOf(label);
  if (i < 0) return null;
  const rest = String(text).slice(i + label.length).slice(0, 30);
  const m = rest.match(/(\d)(?:点)?/);
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------------------------------
// Spec values must LOOK like the field they claim to be.
//
// goo-net prints an equipment list with no label of its own right after the
// spec block (…ミッションATパワーステアリングＨ…). after() only cuts at the next
// KNOWN label, so the Transmission row was rendered as パワーステアリングＨ
// (the first equipment word). Each field therefore has a validator, and when
// the value next to the label does not validate, a BOUNDED region after the
// label is searched for a token that does. Nothing is invented: the token must
// match the field's own shape, otherwise the value stays null.
// ---------------------------------------------------------------------------

// AT / MT / CVT / DCT / EAT / EMT, optionally with a gear count ("6MT",
// "６ＭＴ", "4速AT") in half- or full-width. The lookarounds stop a latin word
// that merely contains the letters (SEAT → AT) from matching, while Japanese
// text glued to the value (ATパワーステアリング) still does.
export const TR_RE = /(?<![A-Za-z0-9])(?:[0-9０-９]{1,2}\s*速?\s*)?(?:AT|MT|CVT|DCT|AMT|EAT|EMT|ＡＴ|ＭＴ|ＣＶＴ|ＤＣＴ|ＡＭＴ)(?![A-Za-z])/i;
const TR_WHOLE_RE = /^(?:[0-9]{1,2}速?)?(?:AT|MT|CVT|DCT|AMT|EAT|EMT)$/;

// Full-width latin (ＭＴ, ＡＴ) → ASCII, on top of fullWidthToHalf's digits.
const fullWidthAscii = s => String(s || '')
  .replace(/[０-９]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
  .replace(/[\uFF01-\uFF5E]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0));

export function isTransmissionValue(value) {
  const s = fullWidthAscii(String(value || '')).replace(/\s+/g, '').toUpperCase();
  return TR_WHOLE_RE.test(s);
}

// Colour words goo-net actually prints, plus the Japanese basics. A colour
// value must contain one of these and must not be an equipment word.
const COLOUR_WORD_RE = /(ブラック|ホワイト|シルバー|グレー|レッド|ブルー|グリーン|イエロー|オレンジ|ブラウン|ベージュ|ゴールド|パープル|ネイビー|ワイン|カーキ|ピンク|アイボリー|シャンパン|ガンメタ|メタリック|マイカ|パール|トーン|ソリッド|黒|白|赤|青|緑|銀|灰|茶|橙|紫|黄|紺)/;
const FEATURE_WORD_RE = /(パワーステアリング|エアコン|エアバッグ|ＡＢＳ|ABS|ナビ|アルミ|キーレス|カメラ|クルーズコントロール|LED|ヘッドライト|シート|ドア|ミッション|駆動方式|燃料|年式|走行距離|修復歴|保証|整備|禁煙|ワンオーナー|乗車定員|排気量|車検|タイヤ|ホイール|サンルーフ|オプション|純正)/;

function cleanColour(raw) {
  let v = stripTags(String(raw || '')).replace(/\s+/g, ' ').trim();
  if (!v) return null;
  const cut = v.search(FEATURE_WORD_RE);
  if (cut > 0) v = v.slice(0, cut).trim();
  if (!v || v.length > 40) return null;
  if (FEATURE_WORD_RE.test(v)) return null;
  return COLOUR_WORD_RE.test(v) ? v : null;
}

export function isColourValue(value) {
  const v = stripTags(String(value || '')).replace(/\s+/g, ' ').trim();
  return !!v && cleanColour(v) === v;
}

// First token matching `match` inside a bounded region after each occurrence of
// `label`. The bound keeps the search inside the car's own spec block instead of
// wandering into the next card on a listing page.
function boundedAfter(text, label, match, { window = 140 } = {}) {
  const hay = String(text || '');
  let from = 0;
  while (true) {
    const i = hay.indexOf(label, from);
    if (i < 0) return null;
    const region = stripTags(hay.slice(i + label.length, i + label.length + window));
    const m = region.match(match);
    if (m) return m[0];
    from = i + label.length;
  }
}

export function transmissionAfter(text, label = 'ミッション', opts = {}) {
  const direct = after(text, label, v => isTransmissionValue(v));
  if (direct) return fullWidthAscii(direct).replace(/\s+/g, '').toUpperCase();
  const hit = boundedAfter(text, label, TR_RE, opts);
  return hit ? fullWidthAscii(hit).replace(/\s+/g, '').toUpperCase() : null;
}

export function colourAfter(text, label = '車体色', opts = {}) {
  const direct = after(text, label, v => isColourValue(v));
  if (direct) return cleanColour(direct);
  const hay = String(text || '');
  let from = 0;
  while (true) {
    const i = hay.indexOf(label, from);
    if (i < 0) return null;
    const region = stripTags(hay.slice(i + label.length, i + label.length + (opts.window ?? 140)));
    const m = region.match(COLOUR_WORD_RE);
    if (m) {
      const c = cleanColour(region.slice(m.index));
      if (c) return c;
    }
    from = i + label.length;
  }
}


export function listingPageUrlFor(baseUrl, page) {
  const clean = String(baseUrl || DEFAULT_SEARCH_URL).replace(/index-\d+\.html$/, '');
  if (page <= 1) return clean;
  return clean.replace(/\/$/, '') + '/index-' + page + '.html';
}

// ---------------------------------------------------------------------------
// Self-healing: AI fallback + parser evidence
// ---------------------------------------------------------------------------

// True when an LLM key is configured. The AI fallback is NEVER called
// without one — a keyless importer behaves exactly as before.
export function llmConfigured() {
  return Boolean(String(process.env.GEMINI_API_KEY || '').trim() || String(process.env.OPENAI_API_KEY || '').trim());
}

// One LLM call for both providers: Gemini first (the key the owner has),
// OpenAI as the documented alternative. Global fetch + hard timeout, no
// dependencies — bundles into the Vercel function like the rest of the core.
export async function askLlm({ system, messages, json = false, maxTokens = 2048, timeoutMs = 20000 } = {}) {
  const geminiKey = String(process.env.GEMINI_API_KEY || '').trim();
  const openaiKey = String(process.env.OPENAI_API_KEY || '').trim();
  if (!geminiKey && !openaiKey) throw new Error('no LLM key configured');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  const start = Date.now();
  try {
    if (geminiKey) {
      const model = String(process.env.GEMINI_MODEL || 'gemini-3.8-flash');
      const body = {
        contents: (messages || []).map(m => ({
          role: m.role === 'assistant' ? 'model' : 'user',
          parts: [{ text: String(m.content || '') }]
        })),
        generationConfig: { temperature: 0.3, maxOutputTokens: maxTokens, ...(json ? { responseMimeType: 'application/json' } : {}) }
      };
      if (system) body.systemInstruction = { parts: [{ text: system }] };
      const res = await fetch('https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': geminiKey },
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error('gemini HTTP ' + res.status + ' for model ' + model + (data?.error?.message ? ' — ' + data.error.message : ''));
      const text = (data?.candidates?.[0]?.content?.parts || []).map(p => p.text || '').join('').trim();
      if (!text) throw new Error('gemini returned no text');
      return { text, via: 'gemini', model, durationMs: Date.now() - start };
    }
    const model = String(process.env.OPENAI_MODEL || 'gpt-4o-mini');
    const msgs = [];
    if (system) msgs.push({ role: 'system', content: system });
    for (const m of messages || []) msgs.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: String(m.content || '') });
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + openaiKey },
      body: JSON.stringify({ model, messages: msgs, temperature: 0.3, max_tokens: maxTokens, ...(json ? { response_format: { type: 'json_object' } } : {}) }),
      signal: ctrl.signal
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error('openai HTTP ' + res.status + ' for model ' + model + (data?.error?.message ? ' — ' + data.error.message : ''));
    const text = String(data?.choices?.[0]?.message?.content || '').trim();
    if (!text) throw new Error('openai returned no text');
    return { text, via: 'openai', model, durationMs: Date.now() - start };
  } catch (e) {
    throw new Error((e.name === 'AbortError' || /abort/i.test(e.message || '')) ? 'LLM timed out after ' + timeoutMs + 'ms' : (e.message || 'LLM call failed'));
  } finally {
    clearTimeout(timer);
  }
}

// The first top-level JSON array in a model reply. Models wrap JSON in code
// fences or prose despite instructions; a tolerant read beats a dropped page.
export function parseJsonArray(text) {
  let s = String(text || '').trim();
  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) s = fence[1].trim();
  const first = s.indexOf('[');
  const last = s.lastIndexOf(']');
  if (first < 0 || last <= first) return null;
  try { return JSON.parse(s.slice(first, last + 1)); } catch { return null; }
}

// A 2 KB slice of the markup goo-net served — the evidence a parser fix is
// made against (stored in site_settings.goonet_parsemiss_sample on blocked or
// parse-miss runs, copied out of the CRM with "Copy parser diagnostic").
// The newline the LLM payload builder joins its windows with (kept as a
// named constant so the prompt text carries no escape sequences).
const NL = String.fromCharCode(10);

export const EVIDENCE_SAMPLE_BYTES = 2048;

// Anything credential-shaped is stripped before markup leaves the server.
// Diagnostics are admin-only, but a captured page can carry a session token or
// a relay key in an inline script, and "admin-only" is not a reason to put a
// secret in a support ticket.
export function scrubSecrets(text) {
  return String(text || '')
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]{12,}/gi, 'Bearer [redacted]')
    .replace(/\b(?:sk|rk|pk|ghp|gho)-[A-Za-z0-9_-]{12,}\b/g, '[redacted-key]')
    .replace(/([?&](?:key|api_key|apikey|access_token|token|jina_api_key)=)[^&\s"']+/gi, '$1[redacted]');
}

// The sample is centred on the first CAR ANCHOR, not on the first spread URL
// in the document: a live listing page carries an application/ld+json ItemList
// in <head> whose URLs come first, and the old sample showed that JSON-LD
// instead of a card — reading it suggested the page had no DOM cards at all.
// A page whose anchors cannot be scanned falls back to a structured-data
// sample, and only a page with neither falls back to the head.
export function markupSample(html, maxBytes = EVIDENCE_SAMPLE_BYTES) {
  const s = String(html || '');
  const links = scanCarLinks(s);
  const dom = links.dom.slice().sort((a, b) => (b.candidate ? 1 : 0) - (a.candidate ? 1 : 0) || a.pos - b.pos);
  const anchor = dom[0];
  const at = anchor ? anchor.pos : (links.occurrences[0] ? links.occurrences[0].index : -1);
  if (at < 0) return s.length <= maxBytes ? s : s.slice(0, maxBytes);
  const start = Math.max(0, at - 512);
  return s.slice(start, start + maxBytes);
}

// When the page has no usable DOM card the sample is the structured data it
// DOES have (the ItemList block verbatim), so the next parser fix starts from
// the real thing rather than from header boilerplate.
export function structuredDataSample(html, maxBytes = EVIDENCE_SAMPLE_BYTES) {
  const s = String(html || '');
  const block = s.match(/<script\b[^>]*type\s*=\s*["']?application\/ld\+json["']?[^>]*>[\s\S]*?<\/script\s*>/i);
  const raw = block ? block[0] : parseJsonLdCarItems(s).slice(0, 3).map(i => JSON.stringify(i)).join('\n');
  return raw.length <= maxBytes ? raw : raw.slice(0, maxBytes);
}

// The complete, bounded parser diagnostic the CRM stores and copies. It says
// which URL's markup this is, how the page was read (direct / relay / rescue),
// how many bytes arrived versus how many characters were decoded and under
// which charset, whether a real DOM card was found, and — when it was not —
// that plainly, with whatever structured data the page did carry.
export function buildParserDiagnostic({
  html, page = null, source = null, via = 'direct', run = 'parseMiss', meta = null, maxBytes = EVIDENCE_SAMPLE_BYTES
} = {}) {
  const s = String(html || '');
  const links = scanCarLinks(s);
  const structured = parseJsonLdCarItems(s);
  const domCard = links.dom.find(a => a.candidate) || links.dom[0] || null;
  const sampleKind = domCard && domCard.candidate ? 'dom-card'
    : (structured.length ? 'structured-data' : (domCard ? 'dom-link' : 'head'));
  const rawSample = sampleKind === 'structured-data' ? structuredDataSample(s, maxBytes) : markupSample(s, maxBytes);
  return {
    saved_at: new Date().toISOString(),
    page: page || source || null,
    source: source || page || null,
    via: via || 'direct',
    run,
    bytes: meta && meta.byteLength != null ? meta.byteLength : null,
    chars: s.length,
    charset: (meta && meta.charset) || null,
    charset_source: (meta && meta.charsetSource) || null,
    content_type: (meta && meta.contentType) || '',
    replacements: (meta && meta.replacements) || 0,
    dom_card_found: !!(domCard && domCard.candidate),
    dom_car_links: new Set(links.dom.map(a => a.stock)).size,
    structured_cars: structured.length,
    structure_source: structured.length ? (structured[0].via || 'json-ld') : null,
    spread_links: countSpreadLinks(s),
    sample_kind: sampleKind,
    sample: scrubSecrets(rawSample)
  };
}

const FUEL_VALUES = new Set(Object.values(FUEL_MAP));
const BODY_VALUES = new Set(Object.values(BODY_MAP));

function canonFrom(values, v) {
  const s = String(v || '').trim();
  return values.has(s) ? s : null;
}

function intInRange(v, lo, hi) {
  const n = Number(v);
  return Number.isInteger(n) && n >= lo && n <= hi ? n : null;
}

// LLM card → the same shape parseCard produces. Every field is re-validated
// against the parsers the regex path uses, and image URLs must literally
// occur in the source markup — a URL the page does not carry is dropped, so
// the quality gate is never fed invented photos.
export function normalizeLlmCard(item, stock, src, baseUrl) {
  if (!item || typeof item !== 'object') return null;
  const title = stripTags(item.title || '').replace(/\s+/g, ' ').trim() || null;
  let url = null;
  try {
    if (typeof item.url === 'string' && /\/spread\//.test(item.url) && /^https?:\/\//.test(item.url)) {
      url = new URL(item.url, baseUrl).href;
    }
  } catch { /* malformed URL → rebuild from the stock id */ }
  if (!url) url = detailUrlFor(stock);

  const make = detectMake(String(item.make || '') + ' ' + String(title || '')) || null;
  const model = make
    ? (detectModel(String(item.model || '') || title || '', make) || (item.model ? String(item.model).slice(0, 60) : null))
    : null;
  const year = intInRange(item.year, 1900, 2100);
  const km = kmToNumber(item.km) || (typeof item.km === 'string' && /^\d{3,7}$/.test(item.km.replace(/[\s,]/g, '')) ? item.km.replace(/[\s,]/g, '') : null);
  const priceJpy = priceTextToYen(item.price);
  const images = [];
  for (const u of Array.isArray(item.images) ? item.images : []) {
    if (typeof u !== 'string' || !/^https:\/\/picture1\.goo-net\.com\//.test(u)) continue;
    if (u.includes('/shop/') || /\/[PS]\//.test(u)) continue;
    if (!src.includes(u)) continue;
    if (!images.includes(u)) images.push(u);
  }
  if (!title && !make && !priceJpy) return null;
  return {
    goonet_id: stock,
    stock_no: stock,
    make: make || 'Unknown',
    model,
    title,
    url,
    year,
    km,
    price_jpy: priceJpy,
    price_usd: yenToUsd(priceJpy),
    price: usdText(yenToUsd(priceJpy)),
    image: images[0] || null,
    images: extendGallery(images),
    photo_count: images.length,
    tr: item.tr ? String(item.tr).trim().slice(0, 12) : null,
    eng: item.eng ? formatEngine(item.eng) : null,
    fuel: detectFuel(item.fuel) || canonFrom(FUEL_VALUES, item.fuel),
    body: detectBody(item.body) || canonFrom(BODY_VALUES, item.body),
    location: detectPrefecture(item.location) || (item.location ? String(item.location).trim().slice(0, 60) : null),
    via_llm: true
  };
}

// The payload the AI fallback actually sends. The old version sent the first
// 120,000 characters of the page — on a ~1.2 MB listing that is the <head>,
// the JSON-LD ItemList and the search form, and it stops before the first real
// card, so the model was asked to extract cards from markup that contains
// none. This builds bounded, card-relevant windows instead:
//
//   • a small page head (charset/title context),
//   • the parsed ItemList entries as compact JSON (stock id, canonical URL,
//     title, cover photo) — real structured data, never invented fields,
//   • the markup around the first DOM car anchors, merged so overlapping
//     windows are not sent twice,
//
// capped at maxChars. Everything the model returns is still validated against
// the FULL source page (image URLs must literally occur in it).
export function buildLlmCardWindows(html, { maxChars = 120_000, maxWindows = 14, before = 1200, after = 2600 } = {}) {
  const s = String(html || '');
  if (!s) return '';
  const links = scanCarLinks(s);
  const parts = [];
  parts.push('<!-- PAGE HEAD -->' + NL + s.slice(0, Math.min(1500, s.length)));

  const structured = parseJsonLdCarItems(s);
  if (structured.length) {
    const lines = structured.slice(0, 80).map(i => JSON.stringify({
      stock: i.stock, url: i.url, title: i.title, image: i.image, position: i.position
    }));
    parts.push('<!-- structured-data ItemList entries (parsed from the page; a field that is not listed here is not in the page — do not invent it) -->' + NL
      + lines.join(NL));
  }

  // One window per distinct stock, strongest anchor per stock first, in
  // document order, merged when they overlap.
  const windows = [];
  const seen = new Set();
  for (const a of links.dom) {
    if (seen.has(a.stock)) continue;
    seen.add(a.stock);
    windows.push([Math.max(0, a.pos - before), Math.min(s.length, a.innerEnd + after)]);
    if (windows.length >= maxWindows) break;
  }
  windows.sort((x, y) => x[0] - y[0]);
  const merged = [];
  for (const w of windows) {
    const last = merged[merged.length - 1];
    if (last && w[0] <= last[1]) last[1] = Math.max(last[1], w[1]);
    else merged.push([...w]);
  }
  for (const [a, b] of merged) parts.push('<!-- CARD MARKUP -->' + NL + s.slice(a, b));

  let out = parts.join(NL + NL);
  if (out.length > maxChars) out = out.slice(0, maxChars) + NL + '<!-- [payload truncated for extraction] -->';
  return out;
}

// Ask the LLM to extract car cards from a listing page the regex parser
// could not read. Returns { cards, via, model, error? } — on any failure
// (no key, HTTP error, unparseable reply, zero valid cards) the caller keeps
// the honest parseMiss/blocked report. The reply is validated: cards without
// a stock id are dropped, and the whole array is capped.
export async function extractCardsWithLlm(html, { baseUrl = DEFAULT_SEARCH_URL, timeoutMs = 25000, maxChars = 120_000 } = {}) {
  if (!llmConfigured()) return { cards: [], via: null, model: null, skipped: 'no-llm-key' };
  const src = String(html || '');
  const payload = buildLlmCardWindows(src, { maxChars });
  const system = 'You are a data-extraction engine for a Japanese used-car listing page (goo-net). '
    + 'Extract the car cards from the raw HTML you are given and reply with ONLY a JSON array — no markdown fences, no commentary. '
    + 'Each element is an object with exactly these keys: '
    + 'stock (string, the id from /usedcar/spread/goo/N/<stock>.html links), '
    + 'make (string), model (string or null), title (string), '
    + 'url (string, the card\u2019s spread URL), year (integer or null), '
    + 'km (string such as "47000" or "4.7万km", or null), '
    + 'price (string exactly as printed, e.g. "199.9万円" or "￥1,999,000", or null), '
    + 'fuel (string or null), body (string or null), location (Japanese prefecture or null), '
    + 'images (array of picture1.goo-net.com URLs that appear in the HTML for this card, in order). '
    + 'Only include a car whose spread link is present in the HTML. Never invent a value — use null for anything the HTML does not state. '
    + 'Only use image URLs that literally appear in the HTML.';
  let via = null, model = null;
  try {
    const r = await askLlm({
      system,
      messages: [{ role: 'user', content: 'Extract the car cards from these bounded excerpts of a goo-net listing page (page head, structured-data entries, then card markup):\n\n' + payload }],
      json: true, maxTokens: 8000, timeoutMs
    });
    via = r.via; model = r.model;
    const arr = parseJsonArray(r.text);
    if (!Array.isArray(arr)) return { cards: [], via, model, error: 'LLM reply was not a JSON array' };
    const cards = [];
    const seen = new Set();
    for (const item of arr) {
      if (!item || typeof item !== 'object') continue;
      const stock = String(item.stock || extractStockFromUrl(item.url) || '').trim();
      if (!stock || seen.has(stock)) continue;
      seen.add(stock);
      const card = normalizeLlmCard(item, stock, src, baseUrl);
      if (card) cards.push(card);
      if (cards.length >= 50) break;
    }
    return cards.length ? { cards, via, model } : { cards, via, model, error: 'no valid cards extracted' };
  } catch (e) {
    return { cards: [], via, model, error: e.message || 'LLM call failed' };
  }
}
