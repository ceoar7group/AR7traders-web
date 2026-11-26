// English display for imported Japanese dealer-stock fields (2026-11-18).
//
// The importer stores the dealer data VERBATIM (see GOONET-SYNC.md): colour
// パールホワイト, prefecture 愛知県, transmission 6速MT. Buyers read the site
// in English (or one of the other languages) — a katakana maker colour is
// meaningless to them, and it was leaking onto cards, the detail spec table,
// compare, and image alt text.
//
// HONESTY RULES
//   • Katakana colour names are loanwords, so a token dictionary translates
//     them compositionally and faithfully: ホワイトパールクリスタルシャイン →
//     "White Pearl Crystal Shine" — Toyota's own English name for that paint.
//   • Anything the dictionary cannot fully account for is returned UNCHANGED
//     (minus scraped boilerplate): a wrong guess is worse than Japanese.
//   • Scraped dealer boilerplate (販売店情報 無料 電話お問い合わせ…) that the
//     parser occasionally captures after a colour is cut — it is not part of
//     the colour on any reading.
//
// Pure module: no DOM, no network — pinned by scripts/jp-display.test.mjs.

const JP_RE = /[\u3040-\u30ff\u4e00-\u9fff]/;
export const hasJapanese = s => JP_RE.test(String(s ?? ''));

// Full-width ASCII (ＬＳ, ＮＶ１００, （Ｍ）) → half-width, plus the
// separators the source listings use inside colour names.
function normalizeWidth(s) {
  return String(s)
    .replace(/[\uff01-\uff5e]/g, ch => String.fromCharCode(ch.charCodeAt(0) - 0xfee0))
    .replace(/\u3000/g, ' ')
    .replace(/・/g, ' ')
    .replace(/[／]/g, '/');
}

// Scraped boilerplate tails: everything from 販売店情報 ("dealer info") on is
// page chrome the parser swallowed, never part of the field value.
const cutBoilerplate = s => s.split('販売店情報')[0].trim();

// All 47 prefectures — complete, so a new dealer location can never regress
// to Japanese. Values are the plain English names buyers and forwarders use.
export const PREFECTURES = {
  北海道: 'Hokkaido', 青森県: 'Aomori', 岩手県: 'Iwate', 宮城県: 'Miyagi',
  秋田県: 'Akita', 山形県: 'Yamagata', 福島県: 'Fukushima', 茨城県: 'Ibaraki',
  栃木県: 'Tochigi', 群馬県: 'Gunma', 埼玉県: 'Saitama', 千葉県: 'Chiba',
  東京都: 'Tokyo', 神奈川県: 'Kanagawa', 新潟県: 'Niigata', 富山県: 'Toyama',
  石川県: 'Ishikawa', 福井県: 'Fukui', 山梨県: 'Yamanashi', 長野県: 'Nagano',
  岐阜県: 'Gifu', 静岡県: 'Shizuoka', 愛知県: 'Aichi', 三重県: 'Mie',
  滋賀県: 'Shiga', 京都府: 'Kyoto', 大阪府: 'Osaka', 兵庫県: 'Hyogo',
  奈良県: 'Nara', 和歌山県: 'Wakayama', 鳥取県: 'Tottori', 島根県: 'Shimane',
  岡山県: 'Okayama', 広島県: 'Hiroshima', 山口県: 'Yamaguchi', 徳島県: 'Tokushima',
  香川県: 'Kagawa', 愛媛県: 'Ehime', 高知県: 'Kochi', 福岡県: 'Fukuoka',
  佐賀県: 'Saga', 長崎県: 'Nagasaki', 熊本県: 'Kumamoto', 大分県: 'Oita',
  宮崎県: 'Miyazaki', 鹿児島県: 'Kagoshima', 沖縄県: 'Okinawa'
};

/** 愛知県 → Aichi. Unknown or already-English input is returned unchanged. */
export function englishLocation(value) {
  const v = String(value ?? '').trim();
  return PREFECTURES[v] || value;
}

// Colour vocabulary. Katakana loanword → its English source word. Matching is
// greedy longest-first, so クリスタルシャイン resolves before クリスタル.
const COLOR_TOKENS = {
  ホワイト: 'White', ブラック: 'Black', シルバー: 'Silver', グレー: 'Gray',
  グレイ: 'Gray', レッド: 'Red', ブルー: 'Blue', グリーン: 'Green',
  ブラウン: 'Brown', ベージュ: 'Beige', パープル: 'Purple', ピンク: 'Pink',
  ゴールド: 'Gold', オレンジ: 'Orange', イエロー: 'Yellow', ワイン: 'Wine',
  ボルドー: 'Bordeaux', ネイビー: 'Navy', カーキ: 'Khaki', アイボリー: 'Ivory',
  パール: 'Pearl', メタリック: 'Metallic', メタル: 'Metal', マイカ: 'Mica',
  クリスタル: 'Crystal', シャイニング: 'Shining', シャイン: 'Shine',
  プレミアム: 'Premium', スーパー: 'Super', ピュア: 'Pure',
  ブリリアント: 'Brilliant', ブリリアン: 'Brilliant', ダーク: 'Dark',
  ライト: 'Light', ミッドナイト: 'Midnight', ナイト: 'Night',
  アーバン: 'Urban', アティチュード: 'Attitude', グラファイト: 'Graphite',
  スレート: 'Slate', スチール: 'Steel', スティール: 'Steel',
  ブロンド: 'Blonde', ブロンズ: 'Bronze', チャンピオンシップ: 'Championship',
  デニム: 'Denim', ガンメタリック: 'Gun Metallic', ガン: 'Gun',
  トワイライト: 'Twilight', ミスト: 'Mist', フィヨルド: 'Fjord',
  ナデシコ: 'Nadeshiko', ニュートラル: 'Neutral', セラミック: 'Ceramic',
  ソウル: 'Soul', アイス: 'Ice', ジャングル: 'Jungle', ジェット: 'Jet',
  スパークリング: 'Sparkling', スパークル: 'Sparkle', スパーク: 'Spark', スピーディー: 'Speedy',
  スマート: 'Smart', プラチナ: 'Platinum', マグネタイト: 'Magnetite',
  ミラノ: 'Milano', ルナ: 'Luna', ライム: 'Lime', ローズ: 'Rose',
  ナチュラル: 'Natural', アラバスター: 'Alabaster', アークティック: 'Arctic',
  アーク: 'Arc', テック: 'Tech', フレーム: 'Flame', プレシャス: 'Precious',
  シリカ: 'Silica', ガラスフレーク: 'Glass Flake', ガラス: 'Glass',
  フレーク: 'Flake', ダイヤモンド: 'Diamond', ダイアモンド: 'Diamond',
  アッシュ: 'Ash', ブライト: 'Bright', プリズム: 'Prism',
  ブリティッシュ: 'British', シャンパン: 'Champagne', チタニウム: 'Titanium',
  チタン: 'Titanium', サンド: 'Sand', モカ: 'Mocha', カッパー: 'Copper',
  コート: 'Coat', ビーム: 'Beam', ツートン: 'Two-tone', トーン: 'tone',
  ルーフ: 'Roof', ブラッキッシュ: 'Blackish', アゲハ: 'Ageha', オパール: 'Opal',
  マルーン: 'Maroon', ラベンダー: 'Lavender', ターコイズ: 'Turquoise',
  エメラルド: 'Emerald', サファイア: 'Sapphire', オニキス: 'Onyx',
  クールシルバー: 'Cool Silver', クール: 'Cool', ホット: 'Hot',
  ディープ: 'Deep', ファイン: 'Fine', グロス: 'Gloss', マット: 'Matte'
};
const COLOR_KEYS = Object.keys(COLOR_TOKENS).sort((a, b) => b.length - a.length);

/**
 * パールホワイト → "Pearl White". The whole string must be accounted for by
 * the vocabulary (plus ASCII, digits and separators) or the cleaned original
 * comes back unchanged — partial guesses are never shown.
 */
export function englishColor(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return value;
  const cleaned = cutBoilerplate(normalizeWidth(raw)).trim();
  if (!JP_RE.test(cleaned)) return cleaned || value;
  let out = '', i = 0, ok = true;
  while (i < cleaned.length) {
    const ch = cleaned[i];
    if (!JP_RE.test(ch)) {
      // An ASCII qualifier straight after a translated word (ＭシルバーＭ →
      // "Silver M", （Ｐ）→ " (P)", ２トーン → " 2-tone") needs its space back.
      if (/[A-Za-z0-9(]/.test(ch) && /[A-Za-z]$/.test(out)) out += ' ';
      out += ch; i++; continue;
    }
    const hit = COLOR_KEYS.find(k => cleaned.startsWith(k, i));
    if (!hit) { ok = false; break; }
    // Space-separate words; keep 2トーン → "2-tone" readable.
    if (out && !/[\s/(×]$/.test(out)) out += COLOR_TOKENS[hit] === 'tone' ? '-' : ' ';
    out += COLOR_TOKENS[hit];
    i += hit.length;
  }
  if (!ok) return cleaned; // boilerplate still cut — honest partial cleanup
  return out.replace(/\s+/g, ' ').replace(/\s*\/\s*/g, ' / ').trim();
}

/** 6速MT → "6-speed MT"; インパネAT → "AT"; junk tails (過給器 －) cut. */
export function englishTransmission(value) {
  const raw = String(value ?? '').trim();
  if (!raw || !JP_RE.test(raw)) return value;
  const v = normalizeWidth(raw).split('過給器')[0].trim();
  const speed = v.match(/(\d+)速(MT|AT)/);
  if (speed) return `${speed[1]}-speed ${speed[2]}`;
  const shifted = v.match(/^(インパネ|コラム|フロア)(AT|MT|CVT)$/);
  if (shifted) return shifted[2];
  if (/^(AT|MT|CVT)$/.test(v)) return v;
  // A Japanese value with no transmission token at all (パワー ステアリング H,
  // truncated feature lists) is a parser capture error, not a transmission.
  // Showing nothing is more honest than showing someone else's field.
  return '';
}

// Model names the importer’s make/model detector missed (it returns the raw
// "メーカー モデル" string). Same rule: fully accounted for, or unchanged.
const MAKE_WORDS = {
  トヨタ: 'Toyota', レクサス: 'Lexus', 日産: 'Nissan', ホンダ: 'Honda',
  マツダ: 'Mazda', スバル: 'Subaru', スズキ: 'Suzuki', ダイハツ: 'Daihatsu',
  三菱: 'Mitsubishi', いすゞ: 'Isuzu', 日野: 'Hino'
};
const MODEL_WORDS = {
  ハイエースバン: 'Hiace Van', ハイエース: 'Hiace', スカイライン: 'Skyline',
  クリッパーバン: 'Clipper Van', クリッパー: 'Clipper', キャラバン: 'Caravan',
  ランドクルーザープラド: 'Land Cruiser Prado', ランドクルーザー: 'Land Cruiser',
  アルファード: 'Alphard', ヴェルファイア: 'Vellfire', プリウス: 'Prius',
  アクア: 'Aqua', ノア: 'Noah', ヴォクシー: 'Voxy', セレナ: 'Serena',
  フィット: 'Fit', ヴェゼル: 'Vezel', バン: 'Van', トラック: 'Truck',
  ワゴン: 'Wagon'
};
const MODEL_KEYS = Object.keys(MODEL_WORDS).sort((a, b) => b.length - a.length);

/** "トヨタ ハイエースバン" (make Toyota) → "Hiace Van". */
export function englishModel(value, make) {
  const raw = String(value ?? '').trim();
  if (!raw || !JP_RE.test(raw)) return value;
  const words = normalizeWidth(raw).split(/\s+/).map(w => {
    if (MAKE_WORDS[w]) return MAKE_WORDS[w];
    if (!JP_RE.test(w)) return w;
    let out = '', i = 0;
    while (i < w.length) {
      const ch = w[i];
      if (!JP_RE.test(ch)) { out += ch; i++; continue; }
      const hit = MODEL_KEYS.find(k => w.startsWith(k, i));
      if (!hit) return null;
      if (out && !/[\s]$/.test(out)) out += ' ';
      out += MODEL_WORDS[hit];
      i += hit.length;
    }
    return out;
  });
  if (words.some(w => w === null)) return value;
  let name = words.join(' ').replace(/\s+/g, ' ').trim();
  // The raw string usually repeats the make ("日産 スカイライン" with
  // make=Nissan) — the card already prints the make, so drop the duplicate.
  const mk = String(make ?? '').trim().toLowerCase();
  if (mk && name.toLowerCase().startsWith(mk + ' ')) name = name.slice(mk.length + 1);
  return name;
}

/** In-place: translate the display fields of one car row. */
export function englishCarFields(c) {
  if (!c || typeof c !== 'object') return c;
  if (hasJapanese(c.col)) c.col = englishColor(c.col);
  if (hasJapanese(c.location)) c.location = englishLocation(c.location);
  if (hasJapanese(c.tr)) c.tr = englishTransmission(c.tr);
  if (hasJapanese(c.model)) c.model = englishModel(c.model, c.make);
  return c;
}
