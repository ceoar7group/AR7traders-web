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
  // An API key lifts the relay off the rate-limited keyless tier. It is only
  // ever sent to the relay host itself (rawFetch headers are caller-built).
  const key = relayApiKey();
  if (key) relayHeaders['Authorization'] = 'Bearer ' + key;
  const relayed = await rawFetch(relayBaseUrl() + url, { timeoutMs, maxBytes, headers: relayHeaders });
  return { relayed, relayPage: pageDiagnostics(relayed.html) };
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

  // 1) Every spread anchor, with its readable candidate (anchor text, or the
  // img alt when the caption is a badge like "New"/"UP").
  const anchors = [];
  const anchorRe = /<a\b[^>]*href="(https?:\/\/www\.goo-net\.com\/usedcar\/spread\/goo\/\d+\/([A-Za-z0-9]+)\.html)(?:#[^"]*)?"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = anchorRe.exec(s))) {
    const inner = m[3];
    const text = stripTags(inner).replace(/\s+/g, ' ').trim();
    const alt = (inner.match(/<img[^>]*alt="([^"]+)"/) || [])[1];
    const candidate = (text.length >= 4 ? text : null)
      || (alt ? stripTags(alt).replace(/\s+/g, ' ').trim() : null);
    const tagStart = s.slice(Math.max(0, m.index - 300), m.index);
    anchors.push({
      stock: m[2],
      url: m[1],
      pos: m.index, // the regex starts at the <a> tag
      aEnd: m.index + m[1].length,
      candidate: candidate && candidate.length >= 4 ? candidate : null,
      isH3: /<h3[^>]*>\s*$/.test(tagStart)
    });
  }

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
    const ahead = s.slice(a.aEnd, a.aEnd + SPEC_AHEAD);
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
  for (let i = 0; i < marks.length; i++) {
    const mark = marks[i];
    const prevPos = i > 0 ? marks[i - 1].pos : 0;
    const nextPos = i + 1 < marks.length ? marks[i + 1].pos : s.length;
    const card = parseCardRegion(s, prevPos, mark, nextPos, baseUrl);
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
  const imgRegion = aboveTail + (belowWin ? s.slice(mark.aEnd, Math.min(s.length, mark.aEnd + belowWin)) : '');

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
  const trRaw = after(chunk, 'ミッション');
  const tr = trRaw ? trRaw.trim().slice(0, 12) : null;
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
  const make = detectMake(text) || (title ? detectMake(title) : null);
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
  const trRaw = after(text, 'ミッション');
  const tr = trRaw ? trRaw.trim().slice(0, 12) : null;
  const col = after(text, '車体色') || null;
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
      if (!res.ok) throw new Error('gemini HTTP ' + res.status + (data?.error?.message ? ' — ' + data.error.message : ''));
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
    if (!res.ok) throw new Error('openai HTTP ' + res.status + (data?.error?.message ? ' — ' + data.error.message : ''));
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
export const EVIDENCE_SAMPLE_BYTES = 2048;
// The sample is centred on the FIRST CAR LINK, not the top of the page: a
// live listing page is ~1 MB and its first 2 KB are header boilerplate, so a
// head slice would show a parser fix nothing. A page without car links falls
// back to the head (that is the bot-gate case, where the head IS the story).
export function markupSample(html, maxBytes = EVIDENCE_SAMPLE_BYTES) {
  const s = String(html || '');
  const m = s.match(/https:\/\/www\.goo-net\.com\/usedcar\/spread\/goo\/\d+\//);
  if (!m || m.index === undefined) return s.length <= maxBytes ? s : s.slice(0, maxBytes);
  const start = Math.max(0, m.index - 512);
  return s.slice(start, start + maxBytes);
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

// Ask the LLM to extract car cards from a listing page the regex parser
// could not read. Returns { cards, via, model, error? } — on any failure
// (no key, HTTP error, unparseable reply, zero valid cards) the caller keeps
// the honest parseMiss/blocked report. The reply is validated: cards without
// a stock id are dropped, and the whole array is capped.
export async function extractCardsWithLlm(html, { baseUrl = DEFAULT_SEARCH_URL, timeoutMs = 25000, maxChars = 120_000 } = {}) {
  if (!llmConfigured()) return { cards: [], via: null, model: null, skipped: 'no-llm-key' };
  const src = String(html || '');
  const slice = src.length > maxChars ? src.slice(0, maxChars) + '\n<!-- [page truncated for extraction] -->' : src;
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
      messages: [{ role: 'user', content: 'Extract the car cards from this listing page HTML:\n\n' + slice }],
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
