// Shared core of the Goo-net importer — one implementation, several callers:
//
//   scripts/goonet-scraper.mjs   → CLI (terminal / GitHub Actions / cron)
//   api/goonet-sync.js           → admin one-click button + Vercel cron target
//   scripts/goonet-core.test.mjs → unit tests
//
// Purpose: keep the public website's "Dealer Stock" fed with high-quality
// Goo-net Exchange vehicles, and remove cars that are no longer available on
// Goo-net — without ever touching the pinned / manually-authored cars and
// without overloading the database or the site.
//
// No dependencies beyond the passed-in Supabase client and an injectable
// fetch, so the file bundles into the Vercel function and runs under bare
// Node 20+.

// ---------------------------------------------------------------------------
// Configuration. These are the defaults; the live values come from the
// `site_settings` table (keys `goonet_*`), which the CRM can edit, so the
// rules below are tuned without a code deploy.
// ---------------------------------------------------------------------------
export const GOONET_CONFIG_KEYS = {
  goonet_enabled:           'enabled',
  goonet_daily_limit:       'dailyLimit',
  goonet_min_photos:        'minPhotos',
  goonet_pinned_count:      'pinnedCount',
  goonet_max_live:          'maxLive',
  goonet_unavailable_grace: 'unavailableGraceDays',
  goonet_new_arrival_days:  'newArrivalDays',
  goonet_request_delay_ms:  'requestDelayMs',
  goonet_page_limit:        'pageLimit',
  goonet_jpy_to_usd:        'jpyToUsd',
  goonet_seed_urls:         'seedUrls'
};

export const DEFAULTS = {
  enabled: true,
  // Max NEW cars imported per run. 40/day is a safe default: it keeps the
  // scrape polite (small number of requests) and the site fast to browse.
  dailyLimit: 40,
  // A car is only imported if it has at least this many photos. Goo-net
  // "high quality" listings routinely have 20–80 photos; listings with 1–3
  // photos are thumbnail-only and are skipped.
  minPhotos: 10,
  // The first N cars (by sort_order) on the site are permanent fixtures and
  // are never auto-removed. Manual cars are always protected regardless.
  pinnedCount: 60,
  // Soft cap on live Goo-net cars. Past this, the oldest non-pinned Goo-net
  // cars are hidden so the inventory stays quick to load and the DB small.
  maxLive: 400,
  // A Goo-net car is marked "unavailable" after this many days without being
  // re-seen on Goo-net. Generous on purpose: the scrape only visits a subset
  // of listings each run, so absence must persist before we remove anything.
  unavailableGraceDays: 21,
  // Newly imported cars keep the "New Arrival" badge for this many days,
  // then roll to "In Stock" so the New Arrival page stays fresh.
  newArrivalDays: 7,
  // Politeness delay between HTTP requests, in milliseconds.
  requestDelayMs: 1500,
  // Max search-result pages to walk per run.
  pageLimit: 6,
  // JPY → USD rate used to convert Goo-net FOB prices into the site's USD
  // display price. Kept configurable because the market rate moves.
  jpyToUsd: 155,
  // Default Goo-net Exchange search URLs (popular export models). The CRM can
  // override this with a comma-separated list.
  seedUrls: [
    'https://www.goo-net-exchange.com/usedcars/TOYOTA/LAND_CRUISER/',
    'https://www.goo-net-exchange.com/usedcars/TOYOTA/ALPHARD/',
    'https://www.goo-net-exchange.com/usedcars/TOYOTA/HARRIER/',
    'https://www.goo-net-exchange.com/usedcars/TOYOTA/VELLFIRE/',
    'https://www.goo-net-exchange.com/usedcars/HONDA/VEZEL/',
    'https://www.goo-net-exchange.com/usedcars/TOYOTA/PRIUS/'
  ]
};

const num = (v, d) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? n : d; };
const bool = (v, d) => v == null ? d : String(v) === 'true' || v === true;

/** Merge `site_settings` rows (or any {key:value} map) over the defaults. */
export function normaliseConfig(settings = {}) {
  const map = {};
  for (const [k, v] of Object.entries(settings || {})) map[k] = v;
  const cfg = { ...DEFAULTS };
  const g = key => map[key];
  cfg.enabled = bool(g('goonet_enabled'), DEFAULTS.enabled);
  cfg.dailyLimit = Math.floor(num(g('goonet_daily_limit'), DEFAULTS.dailyLimit));
  cfg.minPhotos = Math.floor(num(g('goonet_min_photos'), DEFAULTS.minPhotos));
  cfg.pinnedCount = Math.floor(num(g('goonet_pinned_count'), DEFAULTS.pinnedCount));
  cfg.maxLive = Math.floor(num(g('goonet_max_live'), DEFAULTS.maxLive));
  cfg.unavailableGraceDays = Math.floor(num(g('goonet_unavailable_grace'), DEFAULTS.unavailableGraceDays));
  cfg.newArrivalDays = Math.floor(num(g('goonet_new_arrival_days'), DEFAULTS.newArrivalDays));
  cfg.requestDelayMs = Math.floor(num(g('goonet_request_delay_ms'), DEFAULTS.requestDelayMs));
  cfg.pageLimit = Math.max(1, Math.floor(num(g('goonet_page_limit'), DEFAULTS.pageLimit)));
  cfg.jpyToUsd = num(g('goonet_jpy_to_usd'), DEFAULTS.jpyToUsd);
  const urls = (g('goonet_seed_urls') || '')
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
  cfg.seedUrls = urls.length ? urls : DEFAULTS.seedUrls;
  return cfg;
}

// ---------------------------------------------------------------------------
// HTML normalisation + parsing (Goo-net Exchange)
// ---------------------------------------------------------------------------

/** Turn raw HTML into label/table-aware text the extractors below can read. */
export function stripHtml(html) {
  return String(html || '')
    .replace(/<(title|h[1-6]|th|dt|strong|b|label)[^>]*>/gi, '\n$&')
    .replace(/<\/(title|h[1-6]|th|dt|tr|div|li|p|table|ul|ol)>/gi, '\n')
    .replace(/<td[^>]*>/gi, ': ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&yen;/gi, '¥')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/[ \t]+/g, ' ')
    .replace(/\n[ ]+/g, '\n')
    .replace(/\n{2,}/g, '\n');
}

const first = (html, re) => { const m = String(html || '').match(re); return m ? m[1] : null; };

/** Extract every Goo-net photo URL (jpg only — skip the mp4 preview "movies"). */
export function extractImages(html) {
  const seen = new Set();
  const out = [];
  const re = /https:\/\/picture1\.goo-net\.com\/[^\s"'()\\]+\.(?:jpg|jpeg)/gi;
  let m;
  while ((m = re.exec(String(html || '')))) {
    const u = m[0];
    if (seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

const FUEL_MAP = { GASOLINE: 'Petrol', DIESEL: 'Diesel', HYBRID: 'Hybrid', ELECTRIC: 'EV', GAS: 'Petrol', CNG: 'CNG', LPG: 'LPG' };
const DRV_MAP = { '2WD': '2WD', '4WD': '4WD', 'AWD': 'AWD', 'FF': '2WD', 'FR': '2WD', 'RR': '2WD', 'MR': '2WD' };

const BODY_HINTS = [
  ['PICKUP', 'Pickup'], ['TRUCK', 'Truck'], ['MPV', 'MPV'], ['VAN', 'Van'],
  ['WAGON', 'Wagon'], ['HATCHBACK', 'Hatchback'], ['SEDAN', 'Sedan'],
  ['COUPE', 'Coupe'], ['CONVERTIBLE', 'Convertible'], ['CROSSOVER', 'SUV'],
  ['SUV', 'SUV'], ['KEI', 'Kei']
];

// Common export models whose body type isn't obvious from the name alone.
const MODEL_BODY = {
  'LAND CRUISER': 'SUV', 'PRADO': 'SUV', 'HARRIER': 'SUV', 'RAV4': 'SUV',
  'HIGHLANDER': 'SUV', 'FORTUNER': 'SUV', 'VEZEL': 'SUV', 'CX-3': 'SUV',
  'CX-5': 'SUV', 'CX-8': 'SUV', 'CX-30': 'SUV', 'CX-60': 'SUV',
  'OUTLANDER': 'SUV', 'FORESTER': 'SUV', 'X-TRAIL': 'SUV', 'JUKE': 'SUV',
  'ALPHARD': 'MPV', 'VELLFIRE': 'MPV', 'NOAH': 'MPV', 'VOXY': 'MPV',
  'SIENTA': 'MPV', 'SERENA': 'MPV', 'STEPWGN': 'MPV', 'ODYSSEY': 'MPV',
  'FREED': 'MPV', 'HIACE': 'Van', 'CARAVAN': 'Van',
  'PRIUS': 'Sedan', 'COROLLA': 'Sedan', 'CAMRY': 'Sedan', 'CROWN': 'Sedan',
  'CIVIC': 'Sedan', 'ACCORD': 'Sedan', 'MIRAI': 'Sedan', 'SKYLINE': 'Sedan',
  'AQUA': 'Hatchback', 'FIT': 'Hatchback', 'NOTE': 'Hatchback',
  'SWIFT': 'Hatchback', 'YARIS': 'Hatchback',
  'MOVE': 'Kei', 'TAFT': 'Kei', 'MIRA': 'Kei', 'WAGON R': 'Kei', 'N-BOX': 'Kei',
  'HILUX': 'Pickup', 'D-MAX': 'Pickup', 'TRITON': 'Pickup'
};
const MODEL_BODY_KEYS = Object.keys(MODEL_BODY).sort((a, b) => b.length - a.length);

/** Guess a site "body" value from a model name; 'Other' when unsure. */
export function inferBody(model) {
  const m = String(model || '').toUpperCase();
  for (const k of MODEL_BODY_KEYS) if (m.includes(k)) return MODEL_BODY[k];
  for (const [k, v] of BODY_HINTS) if (m.includes(k)) return v;
  return 'Other';
}

/**
 * Parse one Goo-net Exchange detail page into a normalised car object.
 * Returns null when the page doesn't look like a vehicle detail page.
 */
export function parseDetailHtml(html, url = '') {
  const raw = String(html || '');
  const text = stripHtml(raw);

  const images = extractImages(raw);
  const stockNo = first(text, /\b(\d{7}[A-Z]\d{8}[A-Z]\d{3})\b/) ||
    first(raw, /Stock Number[^0-9A-Z]*([0-9A-Z]{10,})/i);

  // Goo-net listing id = trailing numeric path segment of the URL
  // (e.g. .../700056069430260821001/). Also matches the main photo prefix.
  const slug = (() => {
    const m = String(url || '').match(/(\d{15,})\/?$/);
    return m ? m[1] : null;
  })();

  const title = first(raw, /<title[^>]*>([^<]+)<\/title>/i);
  const titleBits = (title || '').split(/\s*\|\s*/).map(s => s.trim()).filter(Boolean);

  // "TOYOTA LAND CRUISER ZX" → make = first word, model = remainder.
  const name = titleBits[0] || first(text, /\n#+\s*(.+)\n/) || '';
  const words = String(name).trim().split(/\s+/).filter(Boolean);
  const make = words[0] || '';
  const model = words.slice(1).join(' ');

  if (!make || !model || (!stockNo && !slug)) return null;

  const priceYen = first(text, /¥\s*([0-9][0-9,]*)/);
  const priceUsd = priceYen ? priceFromYen(priceYen, DEFAULTS.jpyToUsd) : null;

  const monthYearMatch = text.match(/Month\/Year[:\s]*([0-9]{1,2})\.([0-9]{4})/i);
  const year = monthYearMatch ? Number(monthYearMatch[2])
    : (titleBits[1] && /^\d{4}$/.test(titleBits[1]) ? Number(titleBits[1])
    : (first(text, /\b((?:19|20)\d{2})\b/) ? Number(first(text, /\b((?:19|20)\d{2})\b/)) : null));

  const mileage = first(text, /Mileage[:\s]*([0-9][0-9,]*)\s*km/i) ||
    first(titleBits.join(' '), /([0-9][0-9,]*)\s*km/i);

  const photoCountLabel = first(text, /camera[^0-9]{0,30}(\d{1,3})/i);

  return {
    goonet_id: slug,
    stock_no: stockNo || ('GOO-' + slug),
    make,
    model,
    year,
    km: mileage ? Number(String(mileage).replace(/,/g, '')).toLocaleString('en-US') : null,
    fuel: FUEL_MAP[(first(text, /Fuel[:\s]*(GASOLINE|DIESEL|HYBRID|ELECTRIC|GAS|CNG|LPG)/i) || '').toUpperCase()] || null,
    body: inferBody(model),
    price_yen: priceYen ? Number(String(priceYen).replace(/,/g, '')) : null,
    price: priceUsd,
    image: images[0] || null,
    images,
    photo_count: photoCountLabel ? Number(photoCountLabel) : images.length,
    location: first(text, /([A-Z][a-zA-Z]+)\s+Japan/) || 'Japan',
    tr: first(text, /Transmission[:\s]*(AT|MT|CVT|DCT|AMT|AT\/CVT)/i) || 'AT',
    drv: DRV_MAP[(first(text, /Drive System[:\s]*(2WD|4WD|AWD|FF|FR|RR|MR)/i) || '').toUpperCase()] || null,
    eng: first(text, /Displacement[:\s]*([0-9,]+)\s*cc/i) ? first(text, /Displacement[:\s]*([0-9,]+)\s*cc/i).replace(/,/g, '') + 'cc' : null,
    doors: first(text, /Doors[:\s]*(\d)/i) ? Number(first(text, /Doors[:\s]*(\d)/i)) : null,
    seats: null,
    col: first(text, /Color[:\s]*([A-Za-z /-]+?)(?=\s*(?:Mileage|Repaired|Steering|Transmission|Fuel|Drive|Doors|Displacement|Chassis|Model|\n|$))/i) || null,
    st: /Left/i.test(text) && /Steering/i.test(text) ? 'LHD' : 'RHD'
  };
}

/** Round a JPY amount to a clean USD display price string like "$47,300". */
export function priceFromYen(yen, rate) {
  const usd = Number(String(yen).replace(/[^0-9.]/g, '')) / (rate || DEFAULTS.jpyToUsd);
  if (!Number.isFinite(usd)) return null;
  const rounded = Math.max(100, Math.round(usd / 100) * 100);
  return '$' + rounded.toLocaleString('en-US');
}

/**
 * Parse one Goo-net Exchange search-results page into a list of listing
 * entries ({slug, image}). The detail page is fetched later for full data.
 */
export function parseSearchHtml(html, baseUrl = '') {
  const raw = String(html || '');
  const seen = new Set();
  const out = [];
  const re = /href="(https:\/\/www\.goo-net-exchange\.com\/usedcars\/[^"#]+?\/(\d{15,})\/?)"/gi;
  let m;
  while ((m = re.exec(raw))) {
    const href = m[1];
    const slug = m[2];
    if (seen.has(slug)) continue;
    seen.add(slug);
    // First photo for the entry: the picture1 image nearest after the link.
    const after = raw.slice(m.index, m.index + 4000);
    const img = first(after, /(https:\/\/picture1\.goo-net\.com\/[^\s"'()\\]+\.(?:jpg|jpeg))/i);
    out.push({ slug, url: href, image: img || null });
  }
  return out;
}

// ---------------------------------------------------------------------------
// High-quality photo filter
// ---------------------------------------------------------------------------

/**
 * "High quality" = enough photos to give the buyer a real look at the car.
 * Goo-net thumbnail-only listings carry 1–3 photos; we require `minPhotos`.
 * A listing with a missing cover image is always rejected.
 */
export function isHighQuality(car, minPhotos) {
  if (!car || !car.image) return false;
  const count = Number(car.photo_count) || (Array.isArray(car.images) ? car.images.length : 0);
  return count >= (minPhotos || DEFAULTS.minPhotos);
}

// ---------------------------------------------------------------------------
// Mapping a parsed Goo-net car into a `site_listings` row
// ---------------------------------------------------------------------------

export function toListing(car, { now = new Date().toISOString() } = {}) {
  return {
    stock_no: car.stock_no,
    goonet_id: car.goonet_id || null,
    make: car.make,
    model: car.model,
    year: car.year,
    km: car.km,
    fuel: car.fuel,
    body: car.body || 'Other',
    price: car.price,
    image: car.image,
    images: car.images || [],
    grade: null,
    status: 'New Arrival',
    location: car.location,
    tr: car.tr || 'AT',
    drv: car.drv || '2WD',
    eng: car.eng,
    seats: car.seats || (car.doors || 5),
    col: car.col,
    st: car.st || 'RHD',
    source: 'goonet',
    dealer_stock: true,
    pinned: false,
    photo_count: car.photo_count || (car.images || []).length,
    first_seen_at: now,
    last_seen_at: now,
    published: true
  };
}

// ---------------------------------------------------------------------------
// Planning
// ---------------------------------------------------------------------------

/** A car is "protected" if it is pinned or was authored manually. */
export function isProtected(row) {
  return !!(row && (row.pinned === true || row.pinned === 'true' || row.source !== 'goonet'));
}

function dayKey(d) {
  const x = new Date(d);
  return x.toISOString().slice(0, 10);
}

/**
 * Produce a change plan from freshly-scraped high-quality cars + the current
 * DB rows. Pure function — safe for --dry-run.
 *
 * Rules enforced here (the "keep the site smooth" contract):
 *   • Daily limit: never import more than `dailyLimit` NEW cars in a run.
 *   • Photo quality: `fetched` is assumed pre-filtered by `isHighQuality`.
 *   • Pinned/manual cars are never modified or removed.
 *   • Re-seen cars are refreshed (images, price, last_seen_at) and, if they
 *     were hidden as unavailable, restored to published.
 *   • Goo-net cars not seen for `unavailableGraceDays` are hidden (published
 *     = false) — reversible, nothing is hard-deleted by default.
 *   • Soft cap `maxLive`: oldest non-pinned Goo-net cars beyond the cap are
 *     hidden first, keeping inventory size (and load) bounded.
 *   • New Arrival aging: Goo-net cars older than `newArrivalDays` roll to
 *     "In Stock".
 */
export function computeGoonetPlan(fetched, dbRows, config = {}, { now = new Date().toISOString() } = {}) {
  const cfg = { ...DEFAULTS, ...normaliseConfig({}), ...config };
  const rows = dbRows || [];
  const byStock = new Map();
  for (const r of rows) byStock.set(String(r.stock_no), r);

  const fetchedStocks = new Set(fetched.map(c => String(c.stock_no)));

  // How many Goo-net cars were first imported today (counts against the limit).
  const today = dayKey(now);
  const importedToday = rows.filter(r => r.source === 'goonet' && r.first_seen_at && dayKey(r.first_seen_at) === today).length;

  const toInsert = [];
  const toUpdate = [];
  let insertBudget = Math.max(0, (cfg.dailyLimit || 0) - importedToday);

  // Base sort_order for new Goo-net cars: after every existing row.
  let baseSort = 0;
  for (const r of rows) baseSort = Math.max(baseSort, Number(r.sort_order) || 0);
  baseSort = Math.max(baseSort, cfg.pinnedCount || 0);

  // Live Goo-net cars, oldest (lowest sort_order = imported first) first, so
  // the soft cap hides the oldest imports and keeps the newest stock visible.
  const liveGoonet = rows
    .filter(r => r.source === 'goonet' && r.published !== false && !isProtected(r))
    .sort((a, b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0));

  const seenGoonet = new Set();
  for (const car of fetched) {
    const stock = String(car.stock_no);
    seenGoonet.add(stock);
    const existing = byStock.get(stock);

    if (existing && isProtected(existing)) continue; // never touch pinned/manual

    if (existing) {
      const payload = toListing(car, { now });
      // Keep first_seen_at from the original import; refresh the rest.
      const changes = {};
      const refresh = ['image', 'images', 'price', 'year', 'km', 'fuel', 'body', 'location', 'tr', 'drv', 'eng', 'seats', 'col', 'st', 'photo_count', 'goonet_id'];
      for (const k of refresh) if (!sameValue(k, payload[k], existing[k])) changes[k] = payload[k];
      changes.last_seen_at = now;
      if (existing.published === false) changes.published = true; // available again
      if (changes.published === true) changes.unavailable_since = null;
      if (Object.keys(changes).length) {
        toUpdate.push({ id: existing.id, stock_no: stock, changes, payload: { ...changes, updated_at: now } });
      }
      continue;
    }

    // New car — respects the daily limit.
    if (insertBudget <= 0) continue;
    const payload = { ...toListing(car, { now }), sort_order: ++baseSort };
    toInsert.push(payload);
    insertBudget--;
    liveGoonet.push({ stock_no: stock, sort_order: payload.sort_order, published: true, source: 'goonet', pinned: false });
  }

  // ---- Unavailable detection (grace period) ----
  const nowMs = Date.parse(now);
  const toUnpublish = [];
  for (const r of rows) {
    if (r.source !== 'goonet' || isProtected(r) || r.published === false) continue;
    if (seenGoonet.has(String(r.stock_no))) continue; // was just re-seen
    const last = Date.parse(r.last_seen_at || r.first_seen_at || r.created_at || 0);
    const days = (nowMs - last) / 86400000;
    if (days >= (cfg.unavailableGraceDays || DEFAULTS.unavailableGraceDays)) {
      toUnpublish.push({ id: r.id, stock_no: r.stock_no });
    }
  }

  // ---- Soft cap (site smoothness) ----
  const overflow = [];
  if (cfg.maxLive) {
    const liveNow = liveGoonet.filter(r => !toUnpublish.some(u => u.id === r.id));
    const extra = liveNow.length - cfg.maxLive;
    if (extra > 0) {
      // liveGoonet is already sorted oldest-first.
      for (let i = 0; i < liveNow.length && overflow.length < extra; i++) {
        const r = liveNow[i];
        if (r.id && !toUnpublish.some(u => u.id === r.id)) overflow.push({ id: r.id, stock_no: r.stock_no });
      }
    }
  }

  // ---- New Arrival → In Stock aging ----
  const statusRoll = [];
  for (const r of rows) {
    if (r.source !== 'goonet' || r.status !== 'New Arrival' || isProtected(r)) continue;
    const first = Date.parse(r.first_seen_at || r.created_at || 0);
    const days = (nowMs - first) / 86400000;
    if (days >= (cfg.newArrivalDays || DEFAULTS.newArrivalDays)) {
      statusRoll.push({ id: r.id, stock_no: r.stock_no });
    }
  }

  return {
    toInsert,
    toUpdate,
    toUnpublish,
    overflow,
    statusRoll,
    importedToday,
    fetchedCount: fetched.length,
    seenCount: seenGoonet.size
  };
}

function sameValue(k, a, b) {
  if (k === 'images') return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  if (k === 'year' || k === 'seats' || k === 'sort_order' || k === 'photo_count') return Number(a ?? 0) === Number(b ?? 0);
  return String(a ?? '') === String(b ?? '');
}

// ---------------------------------------------------------------------------
// Apply
// ---------------------------------------------------------------------------

export async function applyGoonetPlan(db, plan) {
  const done = { inserted: 0, updated: 0, unpublished: 0, rolled: 0 };
  if (!plan) return done;

  if (plan.toInsert.length) {
    const { error } = await db.from('site_listings').insert(plan.toInsert);
    if (error) throw new Error('goo-net insert failed: ' + error.message);
    done.inserted = plan.toInsert.length;
  }

  for (const u of plan.toUpdate) {
    const { error } = await db.from('site_listings').update(u.payload).eq('id', u.id);
    if (error) throw new Error('goo-net update failed for ' + u.stock_no + ': ' + error.message);
    done.updated++;
  }

  const unpublishIds = [...plan.toUnpublish, ...plan.overflow].map(r => r.id).filter(Boolean);
  if (unpublishIds.length) {
    const { error } = await db.from('site_listings')
      .update({ published: false, updated_at: new Date().toISOString() })
      .in('id', unpublishIds);
    if (error) throw new Error('goo-net unpublish failed: ' + error.message);
    done.unpublished = unpublishIds.length;
  }

  if (plan.statusRoll.length) {
    for (const r of plan.statusRoll) {
      const { error } = await db.from('site_listings')
        .update({ status: 'In Stock', updated_at: new Date().toISOString() })
        .eq('id', r.id);
      if (error) throw new Error('goo-net status roll failed: ' + error.message);
      done.rolled++;
    }
  }

  return done;
}

export function summarizeGoonet(plan, done = {}) {
  const parts = [];
  if (done.inserted) parts.push(done.inserted + ' imported');
  if (done.updated) parts.push(done.updated + ' refreshed');
  if (done.unpublished) parts.push(done.unpublished + ' hidden (unavailable / cap)');
  if (done.rolled) parts.push(done.rolled + ' rolled off New Arrival');
  if (!parts.length) parts.push('no changes');
  const skipped = (plan.fetchedCount || 0) - (plan.seenCount || 0);
  if (skipped > 0) parts.push(skipped + ' already present / skipped');
  return parts.join(', ');
}

// ---------------------------------------------------------------------------
// Full run orchestrator (injectable fetch for tests)
// ---------------------------------------------------------------------------

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Scrape Goo-net, filter to high-quality cars, and apply the plan.
 * Returns a summary object. `fetchImpl` defaults to global fetch.
 */
export async function runGoonetSync({
  db,
  fetchImpl = globalThis.fetch,
  config = {},
  urls,
  dryRun = false,
  onProgress = () => {}
} = {}) {
  const cfg = { ...DEFAULTS, ...normaliseConfig({}), ...config };
  if (!cfg.enabled) return { skipped: true, reason: 'disabled', summary: 'Goo-net import is disabled' };

  const targets = urls && urls.length ? urls : cfg.seedUrls;
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    'Accept-Language': 'en-US,en;q=0.9'
  };

  // 1. Walk search pages to enumerate candidate listing slugs.
  const candidates = [];
  const seen = new Set();
  for (const base of targets) {
    for (let p = 1; p <= cfg.pageLimit; p++) {
      const url = p === 1 ? base : base.replace(/\/?$/, '/') + 'index.html?page=' + p;
      onProgress({ step: 'search', url, page: p });
      let html = '';
      try {
        const res = await fetchImpl(url, { headers });
        if (!res || !res.ok) break;
        html = await res.text();
      } catch {
        break;
      }
      const entries = parseSearchHtml(html, url);
      let added = 0;
      for (const e of entries) {
        if (seen.has(e.slug)) continue;
        seen.add(e.slug);
        candidates.push(e);
        added++;
      }
      if (!added) break;
      await sleep(cfg.requestDelayMs);
    }
  }
  onProgress({ step: 'search-done', candidates: candidates.length });

  // 2. Visit detail pages until we've found enough high-quality cars.
  const fetched = [];
  for (const entry of candidates) {
    if (fetched.length >= cfg.dailyLimit) break;
    await sleep(cfg.requestDelayMs);
    onProgress({ step: 'detail', url: entry.url });
    try {
      const res = await fetchImpl(entry.url, { headers });
      if (!res || !res.ok) continue;
      const html = await res.text();
      const car = parseDetailHtml(html, entry.url);
      if (car && isHighQuality(car, cfg.minPhotos)) fetched.push(car);
    } catch {
      // single listing failure must not kill the run
    }
  }
  onProgress({ step: 'detail-done', fetched: fetched.length });

  // 3. Plan + apply against the database.
  const { data: dbRows, error: readErr } = await db.from('site_listings').select('*');
  if (readErr) throw new Error('could not read site_listings: ' + readErr.message);

  const plan = computeGoonetPlan(fetched, dbRows || [], cfg);
  let done = { inserted: 0, updated: 0, unpublished: 0, rolled: 0 };
  if (!dryRun) done = await applyGoonetPlan(db, plan);

  const summary = summarizeGoonet(plan, done);
  return { skipped: false, plan, done, summary, fetchedCount: fetched.length, candidateCount: candidates.length };
}
