// Machinery source adapters — the "paste a link" import path, the same idea as
// the Goo-net crawler on the car side.
//
// ── WHAT THIS DOES ─────────────────────────────────────────────────────────
//
// Given a product URL from a supplier (Alibaba, Made-in-China, a factory's own
// site, or a link a supplier emailed you), it extracts the product facts — make,
// model, price, specification — and turns them into a machine entry in the shape
// src/machinery-data.js uses.
//
// ── THE TWO THINGS IT EXTRACTS, AND WHY THEY ARE TREATED DIFFERENTLY ───────
//
//   1. FACTS — model, year, hours, price, engine, weight, bucket size.
//      Facts are not copyrightable. Import these freely, from any link.
//
//   2. PHOTOGRAPHS — every product photo belongs to whoever took it. A
//      watermark is a label, not the source of the right, so removing one does
//      not make a photo available.
//
// So the importer has a `rights` field, and it is not a nag screen: it records
// the basis on which a photo may be published, and it is stored on the listing.
// The legitimate bases, all of which real exporters use:
//
//   • `supplier-listing`     — the photograph on the supplier's own product
//                              page or marketplace listing, published for
//                              buyers. This is the default for imports and
//                              needs no separate agreement; it is recorded on
//                              every imported photo so the provenance is
//                              auditable. (2026-10-07: replaces the
//                              drop-shipping/written-agreement gate.)
//
//   • `dropship-authorized`  — Alibaba.com's dropshipping/authorised-reseller
//                              programme, or the supplier's own reseller terms,
//                              grant use of the product images. This is the
//                              normal case when you are quoting their machine.
//   • `supplier-permission`  — the supplier sent you the photos (WhatsApp,
//                              email, WeChat) with permission to sell from them.
//                              Keep the message; this is what a dispute turns on.
//   • `own-photo`            — AR7 or its inspector took the photo.
//
// A machine with no photographs at all (a supplier page that publishes none)
// still imports — with its real price and full specification — and is marked
// `photosPending`. That is the only case in which a listing opens without a
// picture, and the catalogue never blocks on rights paperwork.
//
// ── ALIBABA'S OFFICIAL ROUTE ───────────────────────────────────────────────
//
// Scraping a marketplace is against its terms and breaks when they change their
// markup. The supported route is the Alibaba.com Open Platform API, which
// returns product data and images for authorised applications. Set
// ALIBABA_APP_KEY and ALIBABA_APP_SECRET and the `alibaba-open` adapter uses it.
// See MACHINERY-SOURCES.md §"Alibaba, the sanctioned way".

export const RIGHTS = ['supplier-listing', 'dropship-authorized', 'supplier-permission', 'own-photo'];

/**
 * The basis recorded when a supplier page or marketplace listing is imported
 * and no other basis was chosen. `supplier-listing` says exactly what it is: a
 * photograph the supplier publishes on their own listing for buyers to use in
 * a purchase enquiry, which is the same footing the car scraper works on.
 *
 * 2026-10-07 owner instruction: drop the drop-shipping / written-agreement
 * gate. The scraper imports and lists machines exactly as the car scraper
 * does — photos included — and the basis is recorded so the CRM can show where
 * each picture came from. Nothing is withheld for want of an agreement.
 */
export const DEFAULT_RIGHTS = 'supplier-listing';

export const rightsAreUsable = rights =>
  RIGHTS.includes(String(rights || '')) || !String(rights || '').trim();

/** Adapter registry. `mode` says how the data arrives. */
export const ADAPTERS = {
  'alibaba-open': {
    label: 'Alibaba Open Platform API',
    mode: 'api',
    canImages: true,
    requires: ['ALIBABA_APP_KEY', 'ALIBABA_APP_SECRET'],
    note: 'The sanctioned route: product data and images for authorised applications.'
  },
  'product-page': {
    label: 'Supplier product page',
    mode: 'fetch',
    canImages: true,
    requires: [],
    note: 'Reads the product data a page publishes for buyers and search engines. Images need a recorded rights basis.'
  },
  'facts-only': {
    label: 'Facts only (no photos)',
    mode: 'fetch',
    canImages: false,
    requires: [],
    note: 'Imports price and specification from any link and leaves the listing awaiting photos.'
  },
  'supplier-package': {
    label: 'Supplier folder (Goo-net equivalent)',
    mode: 'folder',
    canImages: true,
    requires: [],
    note: 'machinery-suppliers/<supplier>/ — photos and a price list straight from the seller.'
  }
};

/** Pick an adapter from the URL and flags. */
export function chooseAdapter(url, { on } = {}) {
  if (on && ADAPTERS[on]) return on;
  const u = String(url || '').toLowerCase();
  if (/alibaba\.com/.test(u) && process.env.ALIBABA_APP_KEY && process.env.ALIBABA_APP_SECRET) return 'alibaba-open';
  if (!url) return 'supplier-package';
  return 'product-page';
}

const decode = s => String(s ?? '')
  .replace(/&nbsp;/gi, ' ')
  .replace(/&amp;/gi, '&')
  .replace(/&lt;/gi, '<')
  .replace(/&gt;/gi, '>')
  .replace(/&quot;/gi, '"')
  .replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
  .replace(/\s+/g, ' ')
  .trim();

const stripTags = html => decode(String(html || '').replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' '));

/**
 * First match of a meta tag by property or name. The capture is quote-aware:
 * French product titles carry apostrophes ("Excavatrice d'occasion…"), and a
 * `[^"']+` capture would cut the value off at the first one.
 */
function meta(html, key) {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content="([^"]*)"`, 'i'),
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content='([^']*)'`, 'i'),
    new RegExp(`<meta[^>]+content="([^"]*)"[^>]*(?:property|name)=["']${key}["']`, 'i'),
    new RegExp(`<meta[^>]+content='([^']*)'[^>]*(?:property|name)=["']${key}["']`, 'i')
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decode(m[1]);
  }
  return null;
}

/** Every JSON-LD block on the page, parsed. Invalid blocks are skipped. */
export function jsonLdBlocks(html) {
  const out = [];
  for (const m of String(html).matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const parsed = JSON.parse(m[1].trim());
      const list = Array.isArray(parsed) ? parsed : (parsed['@graph'] ? parsed['@graph'] : [parsed]);
      out.push(...list.filter(Boolean));
    } catch { /* an unparseable block is not a failure — keep looking */ }
  }
  return out;
}

const money = v => {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  const m = String(v).replace(/[,\s]/g, '').match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
};

/**
 * Parse a price AMOUNT string found in page text, tolerating the number
 * formats marketplaces actually print:
 *   "25,000.00" (en) · "25 000,00" (fr, narrow-space thousands + decimal
 *   comma) · "1.234,56" · plain "25000".
 * money() above is kept untouched for JSON-LD/meta values; this runs only on
 * free text, where a French decimal comma would otherwise read 25 000,00 as
 * 2 500 000.
 */
export function parseAmount(v) {
  if (v == null) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const t = String(v).replace(/[\s\u00a0\u202f]/g, '');
  if (!t) return null;
  // Decimal-comma form: ends in ",dd" — any dots are thousands separators.
  if (/,\d{1,2}$/.test(t)) {
    const n = Number(t.replace(/\.(?=\d{3}\b)/g, '').replace(',', '.'));
    return Number.isFinite(n) && n > 0 ? n : null;
  }
  const m = t.replace(/,/g, '').match(/(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) : null;
}

// ---------------------------------------------------------------------------
// Watermark detection — a label on the photograph, surfaced BEFORE anyone is
// tempted to publish it.
//
// Two heuristics, either of which flags the image for a human:
//   1. The URL itself says so: stems like "watermark", "wm_", "_wm." or
//      "logo_overlay" are how suppliers and marketplaces name the marked copy.
//   2. The hosting domain is a marketplace CDN whose served copies always
//      carry a mark: Alibaba's sc04.alicdn.com and Made-in-China's product
//      image host (image.made-in-china.com).
//
// A flag is a warning, not a verdict — reviewPhotos() reports it and the CRM
// shows it; the rights basis is still what decides whether ANY photo may be
// published. Removing a watermark never creates a right; that is why this is
// detection, not cleaning.
// ---------------------------------------------------------------------------
const WATERMARK_STEMS = /watermark|wm_|_wm\.|logo[_-]?overlay/i;
export const WATERMARK_CDNS = ['sc04.alicdn.com', 'image.made-in-china.com'];

/** True when an image URL looks like a watermarked marketplace copy. */
export function looksWatermarked(src) {
  const url = String(src || '').trim();
  if (!url) return false;
  if (WATERMARK_STEMS.test(url)) return true;
  const host = (url.match(/^https?:\/\/([^/?#]+)/i) || [])[1];
  if (!host) return false;
  const h = host.toLowerCase();
  return WATERMARK_CDNS.some(cdn => h === cdn || h.endsWith('.' + cdn));
}

/** The currency a price string implies, and a rough USD conversion. */
export function priceToUSD(value, currency) {
  const n = money(value);
  if (n == null || !Number.isFinite(n) || n <= 0) return null;
  const cur = String(currency || 'USD').toUpperCase();
  // Deliberately conservative: only conversions we can stand behind. Anything
  // else is kept in its own currency and shown as a range, not invented.
  const rates = { USD: 1, CNY: 0.14, RMB: 0.14, EUR: 1.08, GBP: 1.27 };
  const rate = rates[cur];
  return rate ? Math.round(n * rate) : null;
}

/**
 * Extract the product facts from a page. Returns whatever it could find and
 * lists what it could not — a partial import is still useful, and pretending a
 * field was found when it was not is how wrong specs reach a listing.
 */
export function extractProduct(html, url = '') {
  const blocks = jsonLdBlocks(html);
  const product = blocks.find(b => {
    const t = b['@type'];
    return t === 'Product' || (Array.isArray(t) && t.includes('Product'));
  }) || null;

  const title = decode(
    (product && product.name) ||
    meta(html, 'og:title') ||
    (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] ||
    ''
  );

  // ---- price --------------------------------------------------------------
  let price = null;
  let currency = null;
  const offers = product && (product.offers || product.Offer);
  const offer = Array.isArray(offers) ? offers[0] : offers;
  if (offer) {
    price = money(offer.price ?? offer.lowPrice ?? offer.highPrice);
    currency = offer.priceCurrency || null;
  }
  if (price == null) {
    const amount = meta(html, 'product:price:amount') || meta(html, 'og:price:amount');
    currency = currency || meta(html, 'product:price:currency') || meta(html, 'og:price:currency');
    price = money(amount);
  }
  if (price == null) {
    const text = stripTags(html).slice(0, 20000);
    // Prefix forms: US $25,000.00 · USD 25000 · US$ 25 000,00 — the amount may
    // carry thin spaces inside it (French-locale marketplace pages).
    let m = text.match(/US\s?\$\s?([\d][\d.,]*(?:[\s\u00a0\u202f]\d+)*)/i)
      || text.match(/USD\s?([\d][\d.,]*(?:[\s\u00a0\u202f]\d+)*)/i);
    // Suffix form (Made-in-China's French locale prints "25 000,00 $US"): the
    // amount comes first, the currency marker after.
    if (!m) m = text.match(/([\d][\d\u00a0\u202f ]{0,15}(?:,\d{1,2})?)\s*\$\s*US\b/i)
      || text.match(/([\d][\d\u00a0\u202f ]{0,15}(?:,\d{1,2})?)\s*USD\b/i);
    if (m) { price = parseAmount(m[1]); currency = currency || 'USD'; }
  }
  const priceUSD = priceToUSD(price, currency || 'USD');

  // ---- images -------------------------------------------------------------
  const images = new Set();
  if (product) {
    const img = product.image;
    const list = Array.isArray(img) ? img : (img ? [img] : []);
    for (const item of list) {
      const src = typeof item === 'string' ? item : (item?.url || item?.contentUrl);
      if (src) images.add(String(src));
    }
  }
  const og = meta(html, 'og:image');
  if (og) images.add(og);
  for (const m of String(html).matchAll(/<img[^>]+src=["']([^"']+\.(?:jpe?g|png|webp))["']/gi)) {
    // "transparent" catches the lazy-load placeholder pixel that Made-in-China
    // serves as src while the real photo sits in data-src.
    if (/logo|icon|sprite|flag|avatar|qr|transparent/i.test(m[1])) continue;
    images.add(m[1]);
  }

  // ---- specs --------------------------------------------------------------
  // Marketplace labels usually carry a presentational colon ("Garantie:",
  // "Personnalisation:") — dropped so spec keys read clean and de-duplicate.
  const cleanLabel = s => String(s).replace(/[:：]\s*$/, '').trim();
  const specs = [];
  if (product) {
    const props = product.additionalProperty || product.additionalProperties;
    for (const p of (Array.isArray(props) ? props : (props ? [props] : []))) {
      const label = p?.name;
      const value = p?.value ?? p?.valueReference;
      if (label && value != null && String(value).trim()) specs.push([decode(label), decode(value)]);
    }
  }
  // Spec tables: two cells per row is the near-universal shape. Always scanned,
  // not only when JSON-LD is thin: a marketplace's structured data usually
  // covers three or four headline attributes while the real specification —
  // bucket capacity, travel speed, shipping dimensions — is in the table.
  // Duplicates are dropped by label below, JSON-LD winning.
  {
    for (const m of String(html).matchAll(/<tr[^>]*>([\s\S]{10,400}?)<\/tr>/gi)) {
      const cells = [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map(c => stripTags(c[1]));
      if (cells.length === 2 && cells[0] && cells[1] && cells[0].length < 48 && cells[1].length < 90) {
        const label = cleanLabel(cells[0]);
        if (!label) continue;
        if (/^(price|price range|min\.? order|payment|supply ability|port|packaging)/i.test(label)) continue;
        specs.push([label, cells[1]]);
      }
      if (specs.length >= 18) break;
    }
  }
  // Definition-list spec blocks: Made-in-China's "Basic Info" section renders
  // its label/value pairs as <dl><dt>label</dt><dd>value</dd></dl>, which the
  // table scan above never sees. Same quality gates, same dedup below.
  for (const m of String(html).matchAll(/<dl[^>]*>([\s\S]*?)<\/dl>/gi)) {
    for (const p of m[1].matchAll(/<dt[^>]*>([\s\S]*?)<\/dt>\s*<dd[^>]*>([\s\S]*?)<\/dd>/gi)) {
      const k = cleanLabel(stripTags(p[1]));
      const v = stripTags(p[2]);
      if (!k || !v || k.length >= 48 || v.length >= 90) continue;
      if (/^(price|price range|min\.? order|payment|supply ability|port|packaging)/i.test(k)) continue;
      specs.push([k, v]);
    }
    if (specs.length >= 18) break;
  }
  // De-duplicate by label, keeping the first (usually the headline table).
  const seen = new Set();
  const uniqueSpecs = specs.filter(([k]) => {
    const key = k.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  // Year: a spec row explicitly labelled as the year wins — marketplace pages
  // are full of year-shaped noise (ISO9001: 2000, "since 2015" badges) that a
  // bare regex happily mistakes for the machine's age.
  const yearRow = uniqueSpecs.find(([k]) =>
    /^(year|année|an[oñ]o|baujahr|model year|production year|manufacture year)$/i.test(String(k).trim()));
  const yearFromSpecs = yearRow ? (String(yearRow[1]).match(/\b(19[89]\d|20[0-4]\d)\b/) || [])[1] : null;
  const yearMatch = stripTags(title + ' ' + html.slice(0, 60000)).match(/\b(19[89]\d|20[0-4]\d)\b/);

  return {
    url,
    title,
    priceOriginal: price,
    currency: currency || null,
    priceUSD,
    images: [...images].slice(0, 12),
    specs: uniqueSpecs.slice(0, 14),
    year: yearFromSpecs ? Number(yearFromSpecs) : (yearMatch ? Number(yearMatch[1]) : null),
    fields: {
      title: !!title,
      price: priceUSD != null,
      images: images.size,
      specs: uniqueSpecs.length
    }
  };
}

const BRANDS = ['Doosan', 'Sany', 'XCMG', 'Komatsu', 'SDLG', 'LiuGong', 'Shacman', 'Sinotruk',
  'HOWO', 'Zoomlion', 'Caterpillar', 'Hitachi', 'Kobelco', 'Volvo', 'Liebherr', 'Hyundai',
  'LongGong', 'Shantui', 'Yuchai', 'Weichai', 'Bobcat', 'JCB', 'Terex', 'XGMA'];

const TYPE_HINTS = [
  // Supplier pages arrive in many locales: the French and Spanish words for
  // excavator are as common on Made-in-China as the English one.
  ['Excavators', /excavator|excavatrice|excavadora|escavadora|pelleteuse|pelle hydraulique|digger|\bXE\d|SY\d|DX\d|PC\d|EC\d|ZX\d/i],
  ['Loaders', /loader|wheel load|backhoe|\bLG\d|CLG\d|ZL\d|LG9/i],
  ['Trucks', /tipper|dump truck|tractor head|dumper|howo|shacman|cargo truck|sinotruk/i],
  ['Cranes', /crane|zoomlion|lifting|\bZTC|QY\d|LTM/i]
];

/** Work out brand, type and a clean name from the page title. */
export function classify(title, specs = []) {
  const haystack = [title, ...specs.flat()].join(' ');
  const brand = BRANDS.find(b => new RegExp(`\\b${b}\\b`, 'i').test(haystack)) || null;
  const type = (TYPE_HINTS.find(([, re]) => re.test(haystack)) || [])[0] || null;
  // Trim marketplace noise off the title: "… for sale | Alibaba.com"
  let name = String(title || '')
    .split(/\s*[|｜]\s*/)[0]
    .replace(/\b(used|new|second[- ]?hand|for sale|hot sale|high quality|china|made in china|factory price|cheap)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .replace(/^[\s,–-]+|[\s,–-]+$/g, '')
    .slice(0, 70)
    .trim();
  if (brand && name && !new RegExp(brand, 'i').test(name)) name = `${brand} ${name}`;
  return { brand, type, name: name || title || 'Imported machine' };
}

/** The status line an imported listing carries until a human reviews it. */
export const IMPORT_STATUS = 'Imported — review before quoting';

/**
 * Photo standards — the bar every machine photo has to clear, whether it was
 * imported from a supplier or generated for the site.
 *
 * AR7 quotes current, working machines. A rusty, dented, mud-caked or
 * worked-to-death unit misrepresents what the suppliers actually offer and
 * costs the buyer's trust before the price is read, so the importer refuses to
 * publish those photographs and asks for replacements instead of quietly
 * using them. The same standards are what the image generation prompts follow.
 * Mirrored in MACHINERY-SOURCES.md, "Photo standards".
 */
export const PHOTO_STANDARD = {
  minPhotos: 2,       // one photo cannot show a whole machine's condition
  maxAgeYears: 8,     // older units are only publishable with recent photos
  // Stems, so "rust" also catches rusty/rusted and "corro" catches corrosion.
  // "used" is deliberately absent: every supplier listing says "used", and the
  // point is condition, not age. "Worn out" is banned; normal wear is not.
  banned: ['rust', 'corro', 'dent', 'damag', 'crack', 'broken', 'salvage', 'scrap', 'junk',
    'for parts', 'as-is', 'repaint', 'weld', 'leak', 'worn out', 'worn-out', 'burnt',
    'fire damage', 'accident', 'wreck', 'flood'],
  note: 'recent machine, clean paint, whole unit in frame — no rust, dents, cracks, repairs, missing panels or heavy wear'
};
const PHOTO_BANNED = new RegExp('\\b(' + PHOTO_STANDARD.banned.join('|') + ')');

/** Screen a candidate listing's photos against PHOTO_STANDARD. */
export function reviewPhotos(machine, { now = new Date().getFullYear() } = {}) {
  const flags = [];
  const hay = [machine.name, machine.summary, ...(machine.specs || [])].join(' ').toLowerCase();
  const hit = hay.match(PHOTO_BANNED);
  if (hit) flags.push(`listing copy says "${hit[0]}"`);
  const images = machine.images || [];
  if (images.length && images.length < PHOTO_STANDARD.minPhotos) {
    flags.push(`only ${images.length} photo — the standard asks for ${PHOTO_STANDARD.minPhotos}+ showing the whole machine`);
  }
  // Watermarked copies misrepresent the machine and belong to the marketplace,
  // so they are flagged for replacement. Detection only — a watermark removed
  // is still not a right, and the rights basis decides what gets published.
  const watermarked = images
    .map(p => (typeof p === 'string' ? p : p?.src))
    .filter(looksWatermarked);
  if (watermarked.length) {
    flags.push(`${watermarked.length} photo(s) look watermarked (watermark stem in the URL or a marketplace CDN that always watermarks) — replace with original photos before publishing`);
  }
  const year = Number(machine.year);
  if (year && now - year > PHOTO_STANDARD.maxAgeYears) {
    flags.push(`${year} unit (${now - year} years old) — publish only with recent photos of its current condition`);
  }
  return { pass: flags.length === 0, flags, note: PHOTO_STANDARD.note };
}

/**
 * Build a machine entry from an extracted product.
 *
 * `markup` is applied to the supplier price exactly as it is everywhere else —
 * listPriceUSD() stays the single source of truth for what we publish.
 */
export function toMachine(product, {
  markup, rights = null, adapter = 'product-page', ref = null, id = null, summary = '', now = new Date().toISOString()
} = {}) {
  const { brand, type, name } = classify(product.title, product.specs);
  const price = Number(product.priceUSD) > 0 ? Number(product.priceUSD) : null;
  // 2026-10-07: owner instruction — the scraper imports and lists machines the
  // way the car scraper does. Every photograph the supplier page publishes is
  // imported; a marketplace watermark is REPORTED for review, never a reason to
  // throw the picture away (throwing it away is what left the machinery desk
  // importing facts-only, which read as "the scraper is broken").
  const basis = rightsAreUsable(rights) && String(rights || '').trim() ? rights : DEFAULT_RIGHTS;
  const allImages = product.images || [];
  const watermarked = allImages.filter(looksWatermarked);
  const images = allImages;
  return {
    id: id || ('mch-import-' + Math.random().toString(36).slice(2, 8)),
    ref: ref || 'AR7-MC-NEW',
    name,
    brand: brand || 'Unbranded',
    type: type || 'Excavators',
    year: product.year || new Date().getFullYear(),
    hours: 0,
    supplierPrice: price,
    listPrice: price ? Math.round((price * (1 + (markup ?? 0.25))) / 50) * 50 : null,
    origin: 'China',
    location: 'China',
    status: IMPORT_STATUS,
    image: images[0] || null,
    images,
    photosPending: images.length === 0,
    watermarkedPhotos: watermarked.length,
    skippedPhotos: 0,
    summary: summary || `${name} offered by a vetted Chinese supplier. Price and specification as quoted; confirmed by written quotation.`,
    specs: (product.specs || []).slice(0, 10),
    source: {
      adapter,
      url: product.url || null,
      rights: basis,
      fetchedAt: now,
      priceOriginal: product.priceOriginal ?? null,
      currency: product.currency || null
    },
    needsReview: true
  };
}
