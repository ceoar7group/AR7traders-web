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

// goo-net writes "万円" (man yen) prices: 34.8万円 = 348,000 yen.
export function manToYen(text) {
  const m = String(text || '').replace(/[,\s]/g, '').match(/(\d+(?:\.\d+)?)\s*万円/);
  if (!m) return null;
  return Math.round(parseFloat(m[1]) * 10000);
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

// Full-width digits AND letters → ASCII (goo-net writes grades and model codes
// as "ＸＤ　Ｌパッケージ"). Full-width hyphen/space are normalised too so
// "ＣＸ－５" becomes "CX-5" in fallback headings.
export function fullWidthToHalf(s) {
  return String(s || '')
    .replace(/[０-９Ａ-Ｚａ-ｚ]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/－/g, '-').replace(/\u3000/g, ' ');
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
  'ソリオ': ['Solio', 'MPV'], 'フリード': ['Freed', 'MPV'], 'シエンタ': ['Sienta', 'MPV'],
  'ジャスティ': ['Justy', 'Kei'], 'タント': ['Tanto', 'Kei'], 'ｅ－Ｋ': ['eK', 'Kei'],
  'デイズ': ['Dayz', 'Kei'], 'ルークス': ['Roox', 'Kei'], 'サクラ': ['Sakura', 'Kei'],
  'リーフ': ['Leaf', 'Hatchback'], 'ＭＧ４': ['MG4', 'Hatchback'],
  'ジムニー': ['Jimny', 'Kei'], 'ＣＸ－３': ['CX-3', 'SUV'],
  'ＸＣ４０': ['XC40', 'SUV'], 'ＸＣ６０': ['XC60', 'SUV'], 'ＸＣ９０': ['XC90', 'SUV'],
  'ゴルフ': ['Golf', 'Hatchback'], 'ポロ': ['Polo', 'Hatchback'],
  'パサート': ['Passat', 'Sedan'], 'ティグアン': ['Tiguan', 'SUV'],
  'Ａ１': ['A1', 'Hatchback'], 'Ａ３': ['A3', 'Hatchback'], 'Ａ４': ['A4', 'Sedan'],
  'Ａ６': ['A6', 'Sedan'], 'ミラ': ['Mira', 'Kei'], 'コペン': ['Copen', 'Coupe'],
  // High-volume export models that used to fall through to the raw-token
  // fallback (and so were imported under a Japanese heading).
  'ハイエースバン': ['Hiace Van', 'Van'], 'ハイエースワゴン': ['Hiace Wagon', 'Van'],
  'ハイエース': ['Hiace', 'Van'], 'レジアスエース': ['Regius Ace', 'Van'],
  'ハイラックス': ['Hilux', 'Pickup'], 'ヴィッツ': ['Vitz', 'Hatchback'],
  'パッソ': ['Passo', 'Hatchback'], 'ルーミー': ['Roomy', 'Kei'], 'タンク': ['Tank', 'Kei'],
  'ポルテ': ['Porte', 'Hatchback'], 'スペイド': ['Spade', 'Hatchback'],
  'ウィッシュ': ['Wish', 'MPV'], 'アイシス': ['Isis', 'MPV'], 'エスクァイア': ['Esquire', 'MPV'],
  'ブレイド': ['Blade', 'Hatchback'], 'オーリス': ['Auris', 'Hatchback'], 'ＣＨ－Ｒ': ['C-HR', 'SUV'],
  'Ｃ－ＨＲ': ['C-HR', 'SUV'], 'ＳＡＩ': ['SAI', 'Sedan'], 'プレミオ': ['Premio', 'Sedan'],
  'アリオン': ['Allion', 'Sedan'], 'カローラアクシオ': ['Corolla Axio', 'Sedan'],
  'カローラスポーツ': ['Corolla Sport', 'Hatchback'], 'カローラルミオン': ['Corolla Rumion', 'Wagon'],
  'ランドクルーザー７０': ['Land Cruiser 70', 'SUV'], 'ＦＪクルーザー': ['FJ Cruiser', 'SUV'],
  'ＬＸ': ['LX', 'SUV'], 'ＲＸ': ['RX', 'SUV'], 'ＮＸ': ['NX', 'SUV'], 'ＵＸ': ['UX', 'SUV'],
  'ＩＳ': ['IS', 'Sedan'], 'ＥＳ': ['ES', 'Sedan'], 'ＬＳ': ['LS', 'Sedan'], 'ＣＴ': ['CT', 'Hatchback'],
  'ＧＳ': ['GS', 'Sedan'], 'ＲＣ': ['RC', 'Coupe'],
  'キャラバン': ['Caravan', 'Van'], 'ＮＶ３５０キャラバン': ['NV350 Caravan', 'Van'],
  'ＮＶ２００バネット': ['NV200 Vanette', 'Van'], 'エルグランド': ['Elgrand', 'MPV'],
  'ジューク': ['Juke', 'SUV'], 'キックス': ['Kicks', 'SUV'], 'キューブ': ['Cube', 'Hatchback'],
  'ティアナ': ['Teana', 'Sedan'], 'スカイライン': ['Skyline', 'Sedan'], 'フーガ': ['Fuga', 'Sedan'],
  'シルフィ': ['Sylphy', 'Sedan'], 'ラティオ': ['Latio', 'Sedan'], 'ウイングロード': ['Wingroad', 'Wagon'],
  'ＡＤ': ['AD Van', 'Van'], 'フェアレディＺ': ['Fairlady Z', 'Coupe'], 'モコ': ['Moco', 'Kei'],
  'ステップワゴンスパーダ': ['Stepwgn Spada', 'MPV'], 'インサイト': ['Insight', 'Sedan'],
  'グレイス': ['Grace', 'Sedan'], 'シャトル': ['Shuttle', 'Wagon'], 'ジェイド': ['Jade', 'MPV'],
  'ＣＲ－Ｖ': ['CR-V', 'SUV'], 'ＺＲ－Ｖ': ['ZR-V', 'SUV'], 'ＷＲ－Ｖ': ['WR-V', 'SUV'],
  'Ｎ－ＷＧＮ': ['N-WGN', 'Kei'], 'Ｎ－ＶＡＮ': ['N-VAN', 'Kei'], 'ライフ': ['Life', 'Kei'],
  'ゼスト': ['Zest', 'Kei'], 'バモス': ['Vamos', 'Kei'], 'アクティ': ['Acty', 'Kei'],
  'ＣＸ－６０': ['CX-60', 'SUV'], 'ＣＸ－８０': ['CX-80', 'SUV'], 'マツダ２': ['Mazda2', 'Hatchback'],
  'マツダ３': ['Mazda3', 'Hatchback'], 'アクセラ': ['Axela', 'Hatchback'], 'プレマシー': ['Premacy', 'MPV'],
  'ビアンテ': ['Biante', 'MPV'], 'ＭＰＶ': ['MPV', 'MPV'], 'ボンゴ': ['Bongo', 'Van'],
  'キャロル': ['Carol', 'Kei'], 'フレア': ['Flair', 'Kei'],
  'エブリイ': ['Every', 'Kei'], 'エブリイワゴン': ['Every Wagon', 'Kei'], 'キャリイ': ['Carry', 'Truck'],
  'ラパン': ['Lapin', 'Kei'], 'アルトラパン': ['Alto Lapin', 'Kei'], 'ワゴンＲスティングレー': ['Wagon R Stingray', 'Kei'],
  'スイフトスポーツ': ['Swift Sport', 'Hatchback'], 'クロスビー': ['Xbee', 'SUV'], 'イグニス': ['Ignis', 'Hatchback'],
  'エスクード': ['Escudo', 'SUV'], 'ジムニーシエラ': ['Jimny Sierra', 'SUV'], 'ランディ': ['Landy', 'MPV'],
  'タントカスタム': ['Tanto Custom', 'Kei'], 'ムーヴキャンバス': ['Move Canbus', 'Kei'],
  'ムーヴコンテ': ['Move Conte', 'Kei'], 'ウェイク': ['Wake', 'Kei'], 'キャスト': ['Cast', 'Kei'],
  'トール': ['Thor', 'Kei'], 'ブーン': ['Boon', 'Hatchback'], 'ハイゼットカーゴ': ['Hijet Cargo', 'Kei'],
  'ハイゼットトラック': ['Hijet Truck', 'Truck'], 'ハイゼット': ['Hijet', 'Kei'], 'アトレー': ['Atrai', 'Kei'],
  'タフト': ['Taft', 'Kei'], 'ミライース': ['Mira e:S', 'Kei'], 'ミラココア': ['Mira Cocoa', 'Kei'],
  'ミラトコット': ['Mira Tocot', 'Kei'], 'テリオスキッド': ['Terios Kid', 'Kei'],
  'パジェロ': ['Pajero', 'SUV'], 'パジェロミニ': ['Pajero Mini', 'Kei'], 'デリカＤ：５': ['Delica D:5', 'MPV'],
  'デリカＤ：２': ['Delica D:2', 'MPV'], 'ＲＶＲ': ['RVR', 'SUV'], 'ミラージュ': ['Mirage', 'Hatchback'],
  'ｅＫワゴン': ['eK Wagon', 'Kei'], 'ｅＫクロス': ['eK X', 'Kei'], 'ｅＫスペース': ['eK Space', 'Kei'],
  'レガシィ': ['Legacy', 'Wagon'], 'レガシィアウトバック': ['Legacy Outback', 'Wagon'],
  'ＷＲＸ': ['WRX', 'Sedan'], 'ＢＲＺ': ['BRZ', 'Coupe'], 'ＸＶ': ['XV', 'SUV'], 'クロストレック': ['Crosstrek', 'SUV'],
  'ステラ': ['Stella', 'Kei'], 'プレオ': ['Pleo', 'Kei'], 'サンバー': ['Sambar', 'Kei'],
  'エルフ': ['Elf', 'Truck'], 'キャンター': ['Canter', 'Truck'], 'デュトロ': ['Dutro', 'Truck'],
  'ダイナ': ['Dyna', 'Truck'], 'トヨエース': ['Toyoace', 'Truck'], 'アトラス': ['Atlas', 'Truck'],
  'ミニキャブ': ['Minicab', 'Kei'], 'タウンエース': ['Townace', 'Van'], 'ライトエース': ['Liteace', 'Van'],
  'ヴァンガード': ['Vanguard', 'SUV'], 'クルーガー': ['Kluger', 'SUV'], 'ＩＱ': ['iQ', 'Hatchback'],
  'ピクシス': ['Pixis', 'Kei'], 'マークＩＩ': ['Mark II', 'Sedan'], 'チェイサー': ['Chaser', 'Sedan'],
  'スープラ': ['Supra', 'Coupe'], '８６': ['86', 'Coupe'], 'ＧＲ８６': ['GR86', 'Coupe'],
  'ＧＲヤリス': ['GR Yaris', 'Hatchback'], 'ＧＲカローラ': ['GR Corolla', 'Hatchback'],
  'ミライ': ['Mirai', 'Sedan'], 'ｂＺ４Ｘ': ['bZ4X', 'SUV'], 'センチュリー': ['Century', 'Sedan'],
  'クラウンクロスオーバー': ['Crown Crossover', 'SUV'], 'クラウンスポーツ': ['Crown Sport', 'SUV'],
  'ヴェルファイアハイブリッド': ['Vellfire Hybrid', 'MPV'], 'アルファードハイブリッド': ['Alphard Hybrid', 'MPV'],
  'ノアハイブリッド': ['Noah Hybrid', 'MPV'], 'ヴォクシーハイブリッド': ['Voxy Hybrid', 'MPV'],
  'ハリアーハイブリッド': ['Harrier Hybrid', 'SUV'], 'プリウスα': ['Prius Alpha', 'Wagon'],
  'プリウスＰＨＶ': ['Prius PHV', 'Sedan'], 'アクアクロスオーバー': ['Aqua Crossover', 'Hatchback'],
  'エスティマハイブリッド': ['Estima Hybrid', 'MPV'], 'カムリハイブリッド': ['Camry Hybrid', 'Sedan'],
  'クラウンハイブリッド': ['Crown Hybrid', 'Sedan'], 'ヴェゼルハイブリッド': ['Vezel Hybrid', 'SUV'],
  'フィットハイブリッド': ['Fit Hybrid', 'Hatchback'], 'フリードハイブリッド': ['Freed Hybrid', 'MPV'],
  'エクストレイルハイブリッド': ['X-Trail Hybrid', 'SUV'], 'セレナｅ－パワー': ['Serena e-Power', 'MPV'],
  'ノートｅ－パワー': ['Note e-Power', 'Hatchback'], 'ノートオーラ': ['Note Aura', 'Hatchback'],
  'アウトランダーＰＨＥＶ': ['Outlander PHEV', 'SUV'],
  'Ｇクラス': ['G-Class', 'SUV'], 'ＧＬＡ': ['GLA', 'SUV'], 'ＧＬＢ': ['GLB', 'SUV'], 'ＧＬＳ': ['GLS', 'SUV'],
  'ＣＬＡ': ['CLA', 'Sedan'], 'ＣＬＳ': ['CLS', 'Sedan'], 'Ｂクラス': ['B-Class', 'Hatchback'],
  'Ｖクラス': ['V-Class', 'MPV'], 'ＥＱＡ': ['EQA', 'SUV'], 'ＥＱＢ': ['EQB', 'SUV'], 'ＥＱＣ': ['EQC', 'SUV'],
  '２シリーズ': ['2 Series', 'Coupe'], '４シリーズ': ['4 Series', 'Coupe'], '７シリーズ': ['7 Series', 'Sedan'],
  '８シリーズ': ['8 Series', 'Coupe'], 'Ｘ１': ['X1', 'SUV'], 'Ｘ２': ['X2', 'SUV'], 'Ｘ４': ['X4', 'SUV'],
  'Ｘ６': ['X6', 'SUV'], 'Ｘ７': ['X7', 'SUV'], 'ｉ３': ['i3', 'Hatchback'], 'ｉＸ': ['iX', 'SUV'],
  'Ａ５': ['A5', 'Coupe'], 'Ａ７': ['A7', 'Sedan'], 'Ａ８': ['A8', 'Sedan'], 'Ｑ２': ['Q2', 'SUV'],
  'Ｑ３': ['Q3', 'SUV'], 'Ｑ８': ['Q8', 'SUV'], 'ＴＴ': ['TT', 'Coupe'], 'ｅ－ｔｒｏｎ': ['e-tron', 'SUV'],
  'カイエン': ['Cayenne', 'SUV'], 'マカン': ['Macan', 'SUV'], 'パナメーラ': ['Panamera', 'Sedan'],
  '９１１': ['911', 'Coupe'], 'ケイマン': ['Cayman', 'Coupe'], 'タイカン': ['Taycan', 'Sedan'],
  'レンジローバー': ['Range Rover', 'SUV'], 'レンジローバーイヴォーク': ['Range Rover Evoque', 'SUV'],
  'レンジローバースポーツ': ['Range Rover Sport', 'SUV'], 'レンジローバーヴェラール': ['Range Rover Velar', 'SUV'],
  'ディスカバリー': ['Discovery', 'SUV'], 'ディスカバリースポーツ': ['Discovery Sport', 'SUV'],
  'ディフェンダー': ['Defender', 'SUV'], 'Ｖ４０': ['V40', 'Hatchback'],
  'Ｖ６０': ['V60', 'Wagon'], 'Ｖ９０': ['V90', 'Wagon'], 'アルテオン': ['Arteon', 'Sedan'],
  'Ｔ－クロス': ['T-Cross', 'SUV'], 'Ｔ－ロック': ['T-Roc', 'SUV'], 'トゥアレグ': ['Touareg', 'SUV'],
  'シャラン': ['Sharan', 'MPV'], 'ゴルフヴァリアント': ['Golf Variant', 'Wagon'],
  'ゴルフトゥーラン': ['Golf Touran', 'MPV'], 'アップ！': ['up!', 'Hatchback'], 'ビートル': ['Beetle', 'Hatchback'],
  'ミニクロスオーバー': ['MINI Crossover', 'SUV'], 'ミニクラブマン': ['MINI Clubman', 'Wagon'],
  'ミニコンバーチブル': ['MINI Convertible', 'Convertible'], 'ラングラー': ['Wrangler', 'SUV'],
  'グランドチェロキー': ['Grand Cherokee', 'SUV'], 'チェロキー': ['Cherokee', 'SUV'],
  'コンパス': ['Compass', 'SUV'], 'レネゲード': ['Renegade', 'SUV'], 'モデル３': ['Model 3', 'Sedan'],
  'モデルＹ': ['Model Y', 'SUV'], 'モデルＳ': ['Model S', 'Sedan'], 'モデルＸ': ['Model X', 'SUV'],
  '５００': ['500', 'Hatchback'], 'パンダ': ['Panda', 'Hatchback'], 'ジュリア': ['Giulia', 'Sedan'],
  'ステルヴィオ': ['Stelvio', 'SUV'], '２０８': ['208', 'Hatchback'], '３００８': ['3008', 'SUV'],
  '５００８': ['5008', 'SUV'], 'カングー': ['Kangoo', 'Van'], 'キャプチャー': ['Captur', 'SUV'],
  'ルーテシア': ['Lutecia', 'Hatchback'], 'ギブリ': ['Ghibli', 'Sedan'], 'レヴァンテ': ['Levante', 'SUV'],
  'ベンテイガ': ['Bentayga', 'SUV'], 'コンチネンタルＧＴ': ['Continental GT', 'Coupe'],
  'カリナン': ['Cullinan', 'SUV'], 'ゴースト': ['Ghost', 'Sedan'], 'ウルス': ['Urus', 'SUV'],
  'ウラカン': ['Huracan', 'Coupe'], 'エスカレード': ['Escalade', 'SUV'], 'カマロ': ['Camaro', 'Coupe'],
  'コルベット': ['Corvette', 'Coupe'], 'マスタング': ['Mustang', 'Coupe'], 'エクスプローラー': ['Explorer', 'SUV']
};

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

// The brand that appears EARLIEST in the text wins — not the brand that sits
// earliest in BRAND_MAP. Scanning in map order returned "Toyota" for a Honda
// whose page mentioned トヨタ anywhere at all (a shop called "トヨタ車専門店",
// the brand menu in the nav), which is exactly how cars were imported under
// the wrong heading. Ties (same index) go to the longer name, so
// メルセデス・ベンツ beats ベンツ.
export function detectMake(text) {
  const s = String(text || '');
  let best = null;
  for (const [jp, en] of Object.entries(BRAND_MAP)) {
    const i = s.indexOf(jp);
    if (i < 0) continue;
    if (!best || i < best.i || (i === best.i && jp.length > best.jp.length)) best = { i, jp, en };
  }
  return best ? best.en : null;
}

// Earliest prefecture in the text wins (same reasoning as detectMake: the
// first match in LIST order picked 北海道 from a prefecture footer menu).
export function detectPrefecture(text) {
  const s = String(text || '');
  let best = null;
  for (const p of PREFECTURES) {
    const i = s.indexOf(p);
    if (i >= 0 && (!best || i < best.i)) best = { i, p };
  }
  return best ? best.p : null;
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
  // Fallback: keep the first two visible tokens, cleaned of option chatter and
  // of the make itself (goo-net titles never repeat the make, but the caller
  // may pass one in when the card title did not parse). Never answer with the
  // make name or a placeholder — an unknown model is `null`, and the quality
  // gate turns that into a skip instead of a listing headed "Toyota Toyota".
  const makeWords = new Set([String(make || '').toLowerCase(), ...Object.keys(BRAND_MAP)]);
  const tokens = flat.split(/\s+/).filter(Boolean)
    .filter(t => !makeWords.has(t.toLowerCase()) && !makeWords.has(t));
  const keep = fullWidthToHalf(tokens.slice(0, 2).join(' ')).trim().slice(0, 40);
  return keep || null;
}

// Body type implied by the model name (the second MODEL_MAP column), used when
// a page does not print ボディタイプ. Longest key wins, like detectModel.
export function modelBodyHint(title) {
  const flat = String(title || '').replace(/\u3000/g, ' ');
  let best = null;
  for (const [jp, [, body]] of Object.entries(MODEL_MAP)) {
    if (body && flat.includes(jp) && (!best || jp.length > best.jp.length)) best = { jp, body };
  }
  return best ? best.body : null;
}

// Fuel type when the title itself says so ("ハイブリッドＧ", "ディーゼルターボ",
// "ＰＨＥＶ"). Only unambiguous words — never the 2-letter ＥＶ, which appears
// inside other katakana-latin strings.
export function fuelFromTitle(title) {
  const s = String(title || '');
  if (/プラグインハイブリッド|ＰＨＥＶ|PHEV|ＰＨＶ|PHV/.test(s)) return 'Plug-in Hybrid';
  if (/ハイブリッド|ｅ－ＰＯＷＥＲ|ｅ－パワー|e-POWER|ｅ：ＨＥＶ|e:HEV/i.test(s)) return 'Hybrid';
  if (/ディーゼル|クリーンディーゼル/.test(s)) return 'Diesel';
  if (/電気自動車|ＥＶ専用|バッテリーＥＶ/.test(s)) return 'Electric';
  return null;
}

// A heading that is not a real model: empty, a placeholder the old importer
// wrote ("Car", "Vehicle", "Used Car"), just the make, or a string with no
// letters/digits at all. Used by the quality gate and by the cleanup script.
const GENERIC_MODELS = new Set(['car', 'vehicle', 'used car', 'usedcar', 'used vehicle',
  'auto', 'automobile', 'unknown', 'n/a', 'na', 'none', 'null', 'undefined', '-', '—', '–', 'other']);
export function isGenericModel(model, make = null) {
  const m = String(model || '').trim().toLowerCase();
  if (!m) return true;
  if (GENERIC_MODELS.has(m)) return true;
  if (!/[a-z0-9\u3040-\u30ff\u4e00-\u9fff]/i.test(m)) return true;
  const mk = String(make || '').trim().toLowerCase();
  if (mk && (m === mk || m === mk + ' ' + mk)) return true;
  return false;
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

// How many distinct car cards a page links to. A real listing page has many;
// the bot-gate stub has 0 or 1.
export function countSpreadLinks(html) {
  const re = /https:\/\/www\.goo-net\.com\/usedcar\/spread\/goo\/\d+\/([A-Za-z0-9]+)\.html/g;
  const seen = new Set();
  let m;
  while ((m = re.exec(String(html || '')))) seen.add(m[1]);
  return seen.size;
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

export function pageDiagnostics(html) {
  const s = String(html || '');
  return {
    contentLength: s.length,
    spreadLinks: countSpreadLinks(s),
    markers: STUB_MARKERS.filter(marker => s.includes(marker)),
    gateMarkers: botGateMarkers(s),
    stub: looksLikeStub(s)
  };
}

async function rawFetch(url, { timeoutMs, maxBytes, headers }) {
  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal, redirect: 'follow' });
    const text = await res.text();
    if (isGoonetUrl(url)) collectCookies(res);
    const truncated = text.length > maxBytes;
    return {
      ok: res.ok,
      status: res.status,
      html: truncated ? text.slice(0, maxBytes) : text,
      truncated,
      durationMs: Date.now() - start,
      headersUsed: Object.keys(headers)
    };
  } catch (e) {
    return {
      ok: false, status: 0, html: '', truncated: false,
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
  const relayed = await rawFetch(JINA_RELAY + url, { timeoutMs, maxBytes, headers: relayHeaders });
  return { relayed, relayPage: pageDiagnostics(relayed.html) };
}

export async function fetchPage(url, { timeoutMs = 8000, maxBytes = 4_000_000, cookie = null, allowRelay = true } = {}) {
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
    headersUsed: direct.headersUsed,
    cookieSent: isGoonetUrl(url),
    warmedUp,
    via: 'direct',
    fallbackUsed: false,
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
        return {
          ok: true,
          status: relayed.status,
          html: relayed.html,
          truncated: relayed.truncated,
          via: 'relay',
          directDiagnostics: networkDiag.directDiagnostics,
          diagnostics: {
            ...networkDiag,
            via: 'relay',
            relayUrl: JINA_RELAY + url,
            contentLength: (relayed.html || '').length,
            relayDurationMs: relayed.durationMs,
            relayDiagnostics: relayPage
          }
        };
      }
      networkDiag.relayAttempted = true;
      networkDiag.relayDiagnostics = relayPage;
    }
    return { ok: false, status: 0, html: '', error: direct.error, via: 'direct', diagnostics: networkDiag };
  }

  const directPage = pageDiagnostics(direct.html);
  const shouldRelay = allowRelay && isGoonetUrl(url) && direct.status !== 404 && looksLikeStub(direct.html);

  if (shouldRelay) {
    const { relayed, relayPage } = await relayFetch(url, { timeoutMs, maxBytes });
    // Only trust the relay when it genuinely saw more cars than we did.
    if (relayed.ok && relayPage.spreadLinks > directPage.spreadLinks) {
      return {
        ok: true,
        status: relayed.status,
        html: relayed.html,
        truncated: relayed.truncated,
        via: 'relay',
        directDiagnostics: directPage,
        diagnostics: {
          ...diagnostics,
          via: 'relay',
          relayUrl: JINA_RELAY + url,
          fallbackUsed: true,
          contentLength: (relayed.html || '').length,
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
//
// goo-net ships the gallery two ways: plain <img src> tags for the first few
// thumbnails, and the FULL set inside a JSON blob for the slider, where every
// slash is escaped ("https:\/\/picture1.goo-net.com\/…"). The old regex only
// matched the plain form, so a car with a 30-photo gallery was imported with
// the 1–4 thumbnails the page happened to render as <img> — that is where the
// "old cars with only 1 picture" came from. Unescape first, then scan.
//
// When `stock` (the 21-digit goo-net id) is given, only photos that belong to
// THAT car are kept: a detail page also shows the dealer's other stock, and
// those photos used to be counted towards this car's gallery.
const PIC_RE = /https:\/\/picture1\.goo-net\.com\/[^"'()<>\s\\]+?\.(?:jpg|jpeg|png)/gi;
export function extractCarImages(html, stock = null) {
  const s = String(html || '').replace(/\\\//g, '/').replace(/\\u002[Ff]/g, '/').replace(/&amp;/g, '&');
  const out = [];
  let m;
  PIC_RE.lastIndex = 0;
  while ((m = PIC_RE.exec(s))) {
    const u = m[0].split('?')[0];
    if (u.includes('/shop/') || /\/[PS]\//.test(u)) continue;
    out.push(u);
  }
  let unique = [...new Set(out)];
  if (stock) {
    const own = unique.filter(u => photoBelongsTo(u, stock));
    // Only trust the ownership filter when it recognises the id scheme; an
    // unfamiliar URL layout must not wipe a genuine gallery.
    if (own.length || ownershipKnown(stock)) unique = own;
  }
  return extendGallery(unique);
}

// goo-net photo file names encode the car: the cover ("J"/"Q" folder) is
//   <21-digit stock id>00.jpg
// and the gallery shots are
//   <7-digit shop id>A<8-digit date><letter><3-digit seq><2-digit index>.jpg
// The 21-digit stock id is <3-digit prefix><7 digits><8 digits><3-digit seq>;
// depending on the feed the 7-digit shop id sits at [3..10) (700… ids) or at
// [11..18) (988…/965… ids), and the seq is always the last 3 digits. Both
// layouts are recognised. Anything else on the page (other cars, banners)
// fails every pattern.
function ownershipKnown(stock) {
  return /^\d{21}$/.test(String(stock || ''));
}
export function photoBelongsTo(url, stock) {
  const id = String(stock || '');
  const file = String(url || '').split('/').pop() || '';
  if (!ownershipKnown(id)) return true; // unknown id scheme → cannot judge, keep
  if (file.startsWith(id)) return true;
  const seq = id.slice(18, 21);
  for (const shop of [id.slice(11, 18), id.slice(3, 10)]) {
    if (new RegExp('^' + shop + '[A-Z]\\d{8}[A-Z]' + seq + '\\d{2}\\.(?:jpe?g|png)$', 'i').test(file)) return true;
  }
  return false;
}

export function parseListingPage(html, baseUrl = DEFAULT_SEARCH_URL) {
  const s = String(html || '');
  if (!s.trim()) {
    return {
      cars: [],
      pagination: { total: 1 },
      diagnostics: { parseStatus: 'empty_html', fallbackTemplate: true }
    };
  }
  const cars = [];
  // Each car card is anchored by its spread link. Split on those links so
  // fields never bleed between neighbouring cards: card i owns the HTML
  // from its first spread link up to the next card's first spread link.
  const linkRe = /https:\/\/www\.goo-net\.com\/usedcar\/spread\/goo\/\d+\/([A-Za-z0-9]+)\.html/g;
  const seen = new Map(); // stock → first link position (thumbnail anchors repeat the card link)
  let m;
  while ((m = linkRe.exec(s))) {
    if (!seen.has(m[1])) seen.set(m[1], m.index);
  }
  const segments = [...seen.entries()].map(([stock, start]) => ({ stock, start }))
    .sort((a, b) => a.start - b.start);

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i];
    const end = i + 1 < segments.length ? segments[i + 1].start : s.length;
    const cardHtml = s.slice(seg.start, end);
    const card = parseCard(cardHtml, seg.stock, baseUrl);
    if (card) cars.push(card);
  }
  return {
    cars,
    pagination: parsePagination(s),
    diagnostics: { parseStatus: cars.length ? 'success' : 'no_cards_matched', cardCount: cars.length, fallbackTemplate: cars.length === 0 }
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

function parseCard(chunk, stock, baseUrl) {
  const titleRe = /<h3[^>]*>[\s\S]*?<a[^>]*href="([^"]*spread[^"]*)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/;
  const tm = chunk.match(titleRe);
  const title = tm ? stripTags(tm[2]).replace(/\s+/g, ' ').trim() : null;
  const url = tm ? new URL(tm[1], baseUrl).href : null;

  const make = detectMake(chunk);
  const year = numberAfter(chunk, '年式');
  const km = kmToNumber(after(chunk, '走行距離', v => /km/i.test(v)));
  const priceJpy = manToYen(after(chunk, '車両本体価格', v => /万円/.test(v)) || after(chunk, '支払総額', v => /万円/.test(v)));
  const eng = formatEngine(after(chunk, '排気量'));
  const trRaw = after(chunk, 'ミッション');
  const tr = trRaw ? trRaw.trim().slice(0, 12) : null;
  const repair = after(chunk, '修復歴');
  const ext = ratingAfter(chunk, '外装');
  const int = ratingAfter(chunk, '内装');
  const location = detectPrefecture(after(chunk, '住所') || '') || detectPrefecture(chunk);
  const images = extractCarImages(chunk, stock);

  if (!title && !make && !priceJpy) return null;

  const model = make ? detectModel(title || '', make) : null;

  return {
    goonet_id: stock,
    stock_no: stock,
    make: make || 'Unknown',
    model,
    title,
    url,
    year,
    km,
    // goo-net prints neither fuel nor body type on the card; the detail page
    // has them, and the title often does too (ハイブリッド, ディーゼル, a model
    // whose body type is known). Petrol is NOT assumed — a missing fuel is a
    // missing field, and the gate says so.
    fuel: fuelFromTitle(title),
    body: modelBodyHint(title),
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
  const stock = extractStockFromUrl(url);

  // The car's own heading. goo-net prints "<make> <model> <grade>（<prefecture>）の中古車販売情報"
  // in the <h1> and repeats it in <title>/og:title. The make, model and
  // prefecture are read from THIS text only — the rest of the page is full of
  // other brands (nav menu, "other cars from this dealer") and other
  // prefectures (footer), which is how cars were imported under the wrong make.
  const h1 = (s.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i) || [])[1];
  const ogTitle = (s.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) || [])[1]
    || (s.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:title["']/i) || [])[1];
  const docTitle = (s.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1];
  const heading = [h1, ogTitle, docTitle].map(t => t ? stripTags(t).replace(/\s+/g, ' ').trim() : '').find(Boolean) || '';
  const title = heading || null;
  const make = detectMake(heading) || null;
  const location = detectPrefecture(heading) || detectPrefecture(after(text, '住所') || '') || detectPrefecture(text);
  const year = numberAfter(text, '年式(初度登録)') || numberAfter(text, '年式');
  const km = kmToNumber(after(text, '走行距離', v => /km/i.test(v)));
  const fuel = detectFuel(after(text, '燃料')) || fuelFromTitle(heading);
  const body = detectBody(after(text, 'ボディタイプ')) || modelBodyHint(heading);
  const steeringRaw = after(text, 'ハンドル');
  const st = steeringRaw ? (steeringRaw.includes('左') ? 'LHD' : 'RHD') : null;
  const drvRaw = after(text, '駆動方式');
  const drv = drvRaw ? drvRaw.trim().slice(0, 8) : null;
  const eng = formatEngine(after(text, '排気量'));
  const seats = seatsNumber(after(text, '乗車定員'));
  const trRaw = after(text, 'ミッション');
  const tr = trRaw ? trRaw.trim().slice(0, 12) : null;
  const col = after(text, '車体色') || null;
  const repairRaw = after(text, '修復歴');
  const repair = repairRaw ? (repairRaw.includes('あり') ? 'Yes' : 'No') : null;
  const ext = ratingAfter(text, '外装');
  const int = ratingAfter(text, '内装');
  const priceJpy = manToYen(after(text, '車両本体価格', v => /万円/.test(v)) || after(text, '支払総額', v => /万円/.test(v)));
  // Only this car's photos (see photoBelongsTo) — the page also shows the
  // dealer's other stock.
  const images = extractCarImages(s, stock);

  // Model from the heading with the make and the "（prefecture）の中古車販売情報"
  // suffix removed, so a heading like "ホンダ Ｎ－ＢＯＸ Ｇ（愛知県）の中古車販売情報"
  // yields "N-BOX" and never the make or the boilerplate.
  const headingModelText = heading
    .replace(/[（(][^）)]*[）)]\s*の?中古車(?:販売)?情報.*$/, '')
    .replace(/の中古車(?:販売)?情報.*$/, '')
    .replace(/\s*[|｜].*$/, '');
  const model = make ? detectModel(headingModelText, make) : null;

  // goo-net's own "this car was listed until …" notice: the car is gone even
  // though the page still answers 200. The importer must never import it.
  const delisted = isDelistedPage({ ok: true, status: 200, html: s });

  return {
    goonet_id: stock,
    make,
    model,
    delisted,
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
//
// Consistency is checked rather than assumed: the listing card and the detail
// page describe the same stock number, so when they disagree on the make the
// pair is flagged (`make_mismatch`) and the quality gate rejects the car — a
// listing headed with the wrong brand is worse than no listing.
export function mergeCardAndDetail(card, detail) {
  if (!detail) return card;
  const cardMake = card && card.make && card.make !== 'Unknown' ? card.make : null;
  if (!detail.make) {
    // The detail page did not name the car (stub, gated or reshaped page):
    // keep the card, but still pick up its gallery/spec fields if any parsed.
    const out = { ...card };
    for (const k of ['fuel', 'body', 'st', 'drv', 'seats', 'col', 'delisted']) {
      if (detail[k] !== undefined && detail[k] !== null && out[k] == null) out[k] = detail[k];
    }
    out.images = mergeGalleries(card.images, detail.images, card.goonet_id);
    out.image = out.image || out.images[0] || null;
    out.photo_count = out.images.length;
    return out;
  }
  // Drop null/undefined detail fields so they cannot erase card values.
  const detailClean = Object.fromEntries(Object.entries(detail).filter(([, v]) => v !== null && v !== undefined));
  const out = { ...card, ...detailClean };
  out.make_mismatch = !!(cardMake && detail.make && cardMake !== detail.make);
  // The card title is the dealer's own heading for the car; prefer a model
  // read from it when the detail heading could not be mapped.
  if (isGenericModel(out.model, out.make) && card.model && !isGenericModel(card.model, out.make)) out.model = card.model;
  if (!out.price_jpy && card.price_jpy) out.price_jpy = card.price_jpy;
  if (!out.price_usd) out.price_usd = yenToUsd(out.price_jpy);
  if (!out.price) out.price = usdText(out.price_usd);
  out.images = mergeGalleries(card.images, detail.images, card.goonet_id || detail.goonet_id);
  out.image = out.images[0] || out.image || card.image || null;
  out.photo_count = out.images.length;
  out.grade = (out.ext_rating && out.int_rating)
    ? String(Math.round(((out.ext_rating + out.int_rating) / 2) * 2) / 2)
    : (out.grade || null);
  return out;
}

// Union of the card thumbnails and the detail gallery (detail first — it is
// the complete, ordered set), keeping only photos that belong to the car.
function mergeGalleries(cardImages, detailImages, stock) {
  const all = [...(detailImages || []), ...(cardImages || [])].filter(Boolean);
  const own = stock ? all.filter(u => photoBelongsTo(u, stock)) : all;
  return extendGallery([...new Set(own)]);
}

// ---------------------------------------------------------------------------
// Quality gate — the rule the user asked for: only import cars with good
// quality pictures (plus a real price/year/mileage so listings are complete).
//
// Defaults: 8+ photos (DEFAULT_MIN_PHOTOS), model year 2000+, and every one of
// REQUIRED_FIELDS present and meaningful. A car fails (pass:false) for ANY of:
//   • fewer than minPhotos photos, or no cover photo
//   • no price, or an implausibly low one (< MIN_PRICE_JPY — a typo/placeholder)
//   • no year / older than minYear / in the future
//   • a missing required field (make, model, year, price_jpy, km, fuel, body)
//   • an "Unknown" make, or a generic/placeholder model ("Car", "Used Car", …)
//   • the listing card and the detail page naming DIFFERENT makes
//   • the detail page carrying goo-net's "listed until …" delisted notice
// Everything else (condition rating, repair history) only moves the score.
// ---------------------------------------------------------------------------
export const DEFAULT_MIN_PHOTOS = 8;
export const DEFAULT_MIN_YEAR = 2000;
// 車両本体価格 below 5万円 is never a real dealer asking price for an export car.
export const MIN_PRICE_JPY = 50_000;
export const REQUIRED_FIELDS = ['make', 'model', 'year', 'price_jpy', 'km', 'fuel', 'body'];

function present(v) {
  if (v === null || v === undefined) return false;
  const s = String(v).trim();
  return s !== '' && s !== 'Unknown' && s !== 'null' && s !== 'undefined' && s !== '0';
}

export function qualityScore(car, { minPhotos = DEFAULT_MIN_PHOTOS, minYear = DEFAULT_MIN_YEAR, minPriceJpy = MIN_PRICE_JPY } = {}) {
  const reasons = [];
  const hard = [];
  let score = 0;
  car = car || {};

  const photos = (car.images || []).filter(u => u && /^https?:\/\//.test(String(u)));
  if (photos.length >= minPhotos) {
    score += 25 + Math.min(10, photos.length - minPhotos);
  } else {
    hard.push(`photos ${photos.length}/${minPhotos}`);
  }

  if (car.image && /^https?:\/\//.test(car.image)) score += 5;
  else hard.push('no cover photo');

  const price = Number(car.price_jpy);
  if (Number.isFinite(price) && price > 0) {
    if (price < minPriceJpy) hard.push(`suspicious price ¥${price.toLocaleString('en-US')}`);
    else score += 10;
  } else hard.push('no price');

  const year = Number(car.year);
  const thisYear = new Date().getFullYear() + 1;
  if (Number.isInteger(year) && year >= minYear && year <= thisYear) score += 10;
  else hard.push(year && year < minYear ? `old year ${year}` : 'no/old year');

  if (present(car.km)) score += 5;
  else hard.push('no mileage');

  if (present(car.make)) score += 5;
  else hard.push('unknown make');

  if (present(car.model) && !isGenericModel(car.model, car.make)) score += 5;
  else hard.push(present(car.model) ? `generic model "${car.model}"` : 'unknown model');

  for (const f of ['fuel', 'body']) {
    if (!present(car[f])) hard.push(`no ${f}`);
  }

  if (car.make_mismatch) hard.push('make mismatch between card and detail page');
  if (car.delisted) hard.push('delisted on goo-net');

  if (car.ext_rating && car.ext_rating >= 3 && car.int_rating && car.int_rating >= 3) score += 10;
  else if (!car.ext_rating) reasons.push('no condition rating');

  if (car.repair_history === 'No') score += 5;
  else if (car.repair_history === 'Yes') score -= 10;

  const missing = REQUIRED_FIELDS.filter(f => !present(car[f]));
  return {
    pass: hard.length === 0,
    score: Math.max(0, score),
    reasons: [...hard, ...reasons],
    hardReasons: hard,
    missingFields: missing,
    photo_count: photos.length
  };
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

// The グー鑑定 condition rating: a single digit 1–5 right after "外装"/"内装"
// (allowing a few separator characters such as spaces, "：" or markdown "**").
// It used to accept ANY digit within 30 characters, so "外装パーツ多数 2020年式"
// scored a 2 and a fictitious grade went on the listing. A digit that is part
// of a longer number is never a rating.
export function ratingAfter(text, label) {
  const hay = fullWidthToHalf(String(text || ''));
  let from = 0;
  while (true) {
    const i = hay.indexOf(label, from);
    if (i < 0) return null;
    // Cards carry the digit inside markup ("外装 <span>4</span>"); look through
    // the tags but stay within a short window so nothing further away counts.
    const rest = stripTags(hay.slice(i + label.length, i + label.length + 60)).replace(/\s+/g, ' ').slice(0, 12);
    const m = rest.match(/^[\s:：*＊評価点\-–—]{0,4}([1-5])(?!\d)(?!\.\d)/);
    if (m) return Number(m[1]);
    from = i + label.length;
  }
}

export function listingPageUrlFor(baseUrl, page) {
  const clean = String(baseUrl || DEFAULT_SEARCH_URL).replace(/index-\d+\.html$/, '');
  if (page <= 1) return clean;
  return clean.replace(/\/$/, '') + '/index-' + page + '.html';
}
