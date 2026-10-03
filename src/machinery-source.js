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
//   • `dropship-authorized`  — Alibaba.com's dropshipping/authorised-reseller
//                              programme, or the supplier's own reseller terms,
//                              grant use of the product images. This is the
//                              normal case when you are quoting their machine.
//   • `supplier-permission`  — the supplier sent you the photos (WhatsApp,
//                              email, WeChat) with permission to sell from them.
//                              Keep the message; this is what a dispute turns on.
//   • `own-photo`            — AR7 or its inspector took the photo.
//
// With no recorded basis the machine still imports — with its real price and
// full specification — and is marked `photosPending` until photos arrive. That
// is the honest middle: the catalogue grows today, and no listing ever shows a
// photograph we cannot stand behind.
//
// ── ALIBABA'S OFFICIAL ROUTE ───────────────────────────────────────────────
//
// Scraping a marketplace is against its terms and breaks when they change their
// markup. The supported route is the Alibaba.com Open Platform API, which
// returns product data and images for authorised applications. Set
// ALIBABA_APP_KEY and ALIBABA_APP_SECRET and the `alibaba-open` adapter uses it.
// See MACHINERY-SOURCES.md §"Alibaba, the sanctioned way".

export const RIGHTS = ['dropship-authorized', 'supplier-permission', 'own-photo'];

export const rightsAreUsable = rights => RIGHTS.includes(String(rights || ''));

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

/** First match of a meta tag by property or name. */
function meta(html, key) {
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${key}["'][^>]*content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]*(?:property|name)=["']${key}["']`, 'i')
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
    const m = text.match(/US\s?\$\s?([\d,.]+)/i) || text.match(/USD\s?([\d,.]+)/i);
    if (m) { price = money(m[1]); currency = currency || 'USD'; }
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
    if (/logo|icon|sprite|flag|avatar|qr/i.test(m[1])) continue;
    images.add(m[1]);
  }

  // ---- specs --------------------------------------------------------------
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
        if (/^(price|price range|min\.? order|payment|supply ability|port|packaging)/i.test(cells[0])) continue;
        specs.push([cells[0], cells[1]]);
      }
      if (specs.length >= 18) break;
    }
  }
  // De-duplicate by label, keeping the first (usually the headline table).
  const seen = new Set();
  const uniqueSpecs = specs.filter(([k]) => {
    const key = k.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const yearMatch = stripTags(title + ' ' + html.slice(0, 60000)).match(/\b(19[89]\d|20[0-4]\d)\b/);

  return {
    url,
    title,
    priceOriginal: price,
    currency: currency || null,
    priceUSD,
    images: [...images].slice(0, 12),
    specs: uniqueSpecs.slice(0, 14),
    year: yearMatch ? Number(yearMatch[1]) : null,
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
  ['Excavators', /excavator|digger|\bXE\d|SY\d|DX\d|PC\d|EC\d|ZX\d/i],
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
  const basis = rightsAreUsable(rights) ? rights : null;
  const images = basis ? product.images || [] : [];
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
