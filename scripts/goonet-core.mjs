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
// even before a human touches them. Easily extended.
export const MODEL_MAP = {
  'アルファード': ['Alphard', 'MPV'], 'ヴェルファイア': ['Vellfire', 'MPV'],
  'ノア': ['Noah', 'MPV'], 'ヴォクシー': ['Voxy', 'MPV'], 'エスティマ': ['Estima', 'MPV'],
  'ステップワゴン': ['Stepwgn', 'MPV'], 'セレナ': ['Serena', 'MPV'], 'オデッセイ': ['Odyssey', 'MPV'],
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

export function detectMake(text) {
  const s = String(text || '');
  for (const [jp, en] of Object.entries(BRAND_MAP)) {
    if (s.includes(jp)) return en;
  }
  return null;
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
export function detectModel(title, make) {
  const s = String(title || '');
  const flat = s.replace(/\u3000/g, ' ').replace(/[（(].*?[)）]/g, '');
  for (const [jp, [en]] of Object.entries(MODEL_MAP)) {
    if (flat.includes(jp)) return en;
  }
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
export async function fetchPage(url, { timeoutMs = 8000, maxBytes = 4_000_000, cookie = 'goo_session=active; cookie_consent=1' } = {}) {
  const start = Date.now();
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
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
    'Cookie': cookie
  };
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal, redirect: 'follow' });
    const text = await res.text();
    const durationMs = Date.now() - start;
    const diagnostics = {
      url,
      status: res.status,
      ok: res.ok,
      durationMs,
      contentLength: text.length,
      headersUsed: Object.keys(headers),
      cookieSent: Boolean(cookie),
      fallbackUsed: false
    };
    if (text.length > maxBytes) {
      return { ok: res.ok, status: res.status, html: text.slice(0, maxBytes), truncated: true, diagnostics };
    }
    return { ok: res.ok, status: res.status, html: text, truncated: false, diagnostics };
  } catch (e) {
    const durationMs = Date.now() - start;
    return {
      ok: false,
      status: 0,
      html: '',
      error: e.message,
      diagnostics: { url, status: 0, ok: false, durationMs, error: e.message, fallbackUsed: true }
    };
  } finally {
    clearTimeout(timer);
  }
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
  const engRaw = after(chunk, '排気量');
  const eng = engRaw ? engRaw.replace(/cc|ＣＣ/i, '').trim().replace(/(\d)(?=(\d{3})+$)/g, '$1,') + 'cc' : null;
  const trRaw = after(chunk, 'ミッション');
  const tr = trRaw ? trRaw.trim().slice(0, 12) : null;
  const repair = after(chunk, '修復歴');
  const ext = ratingAfter(chunk, '外装');
  const int = ratingAfter(chunk, '内装');
  const location = detectPrefecture(chunk);
  const images = extractCarImages(chunk);

  if (!title && !make && !priceJpy) return null;

  const model = make ? detectModel(title || make, make) : null;

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
  const body = detectBody(after(text, 'ボディタイプ'));
  const steeringRaw = after(text, 'ハンドル');
  const st = steeringRaw ? (steeringRaw.includes('左') ? 'LHD' : 'RHD') : null;
  const drvRaw = after(text, '駆動方式');
  const drv = drvRaw ? drvRaw.trim().slice(0, 8) : null;
  const engRaw = after(text, '排気量');
  const eng = engRaw ? engRaw.replace(/cc|ＣＣ/i, '').trim().replace(/(\d)(?=(\d{3})+$)/g, '$1,') + 'cc' : null;
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
export function mergeCardAndDetail(card, detail) {
  if (!detail || !detail.make) return card;
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
export function qualityScore(car, { minPhotos = 8 } = {}) {
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

  if (car.year && car.year >= 2005) score += 10;
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
  const v = after(text, label, val => /\d{4}\s*[年(（]/.test(val));
  if (!v) return null;
  const m = v.match(/(\d{4})\s*[年(（]/);
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
