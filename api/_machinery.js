// Shared machinery logic — NOT a Serverless Function.
//
// Files named api/_*.js are shared modules and do not count against the Vercel
// Hobby 12-function cap (see scripts/function-count.test.mjs). That is what
// makes this the safe home for the machinery desk: all of the new code lives
// here, in one file with one job, while api/site-content.js and
// api/goonet-sync.js each grow only a few lines of dispatch. The alternative —
// three new api/*.js files — would take the deployment from 12 functions to 15
// and fail every deploy with exceeded_serverless_functions_per_deployment,
// which is exactly the outage this repo already survived once.
//
// Nothing here is reachable from the browser. It runs inside a Vercel function
// with the service role.

import { RIGHTS, rightsAreUsable, reviewPhotos, IMPORT_STATUS } from '../src/machinery-source.js';
import { MACHINE_TYPES } from '../src/machinery-data.js';
import { machineRef, machineTypeSlug } from '../src/sitemap-helpers.js';

export { RIGHTS, rightsAreUsable, IMPORT_STATUS };

export const MACHINERY_TABLE = 'machinery';

// Writable columns. Mirrors api/_columns.js: an approval or a PATCH can never
// set a column the CRUD path would refuse, because both filter through here.
// Deliberately excludes the audit/import-provenance columns a client may not
// invent — published_by, published_at, hold_reason, price_before_usd,
// source_last_seen_at and source_missing_since are written by the server.
export const MACHINERY_COLUMNS = [
  'ref', 'type', 'brand', 'model', 'year', 'hours', 'price_usd',
  'summary', 'specs', 'images', 'status',
  'origin', 'location',
  'source_url', 'adapter', 'rights_basis', 'imported_at',
  'published', 'sort_order'
];

export const MACHINE_STATUSES = ['Available', 'Reserved', 'Sold', 'Archived'];

/** Why a machine is in the review queue instead of live on the site. */
export const HOLD = {
  NO_RIGHTS: 'no-rights-basis',
  FEW_PHOTOS: 'too-few-photos',
  NO_PRICE: 'no-price',
  NO_TYPE: 'unresolved-type',
  STALE: 'source-gone'
};

export const HOLD_LABEL = {
  [HOLD.NO_RIGHTS]: 'A photo has no rights basis recorded',
  [HOLD.FEW_PHOTOS]: 'Fewer photos than the minimum',
  [HOLD.NO_PRICE]: 'No price',
  [HOLD.NO_TYPE]: 'The machine type could not be resolved',
  [HOLD.STALE]: 'The source listing can no longer be read'
};

// Importer rules. Every default mirrors the seed in supabase/machinery.sql, so
// a database with no site_settings row still behaves the way the SQL says.
export const MACHINERY_SETTING_DEFAULTS = {
  machinery_autopublish: 'true',
  machinery_min_photos: '1',
  machinery_max_reprice_per_run: '10',
  machinery_stale_after_days: '14',
  machinery_allow_placeholder_photo: 'false'
};

/** Read the importer's rules out of site_settings, falling back to the seed. */
export async function machinerySettings(db) {
  const out = { ...MACHINERY_SETTING_DEFAULTS };
  try {
    const { data } = await db.from('site_settings').select('key,value').like('key', 'machinery_%');
    for (const r of data || []) if (r.value !== null && r.value !== '') out[r.key] = r.value;
  } catch { /* an unreadable settings table must not block a read of the catalogue */ }
  return out;
}

const bool = (v, dflt) => (v === undefined || v === null || v === '' ? dflt
  : String(v).toLowerCase() === 'true' || v === '1');
const num = (v, dflt) => { const n = Number(v); return Number.isFinite(n) && n > 0 ? Math.round(n) : dflt; };

// ---------------------------------------------------------------------------
// Normalisation and validation
// ---------------------------------------------------------------------------

/** A reference is what a buyer quotes back to us and what sits in the URL. */
export function normaliseRef(value) {
  return String(value ?? '').trim().toUpperCase();
}

/**
 * Resolve a free-text type onto a catalogue type (`excavator` -> `Excavators`).
 * Returns null when it cannot be resolved, which is a publish blocker rather
 * than a hard error: an import may still be stored and fixed by hand.
 */
export function resolveType(value) {
  const want = String(value ?? '').trim().toLowerCase();
  if (!want) return null;
  return MACHINE_TYPES.find(t => t.toLowerCase() === want) ||
    MACHINE_TYPES.find(t => t.toLowerCase().replace(/s$/, '') === want.replace(/s$/, '')) ||
    MACHINE_TYPES.find(t => t.toLowerCase().startsWith(want)) || null;
}

/** Keep only the columns a client may write. */
export function cleanRow(payload) {
  const out = {};
  for (const k of MACHINERY_COLUMNS) if (k in (payload || {})) out[k] = payload[k];
  return out;
}

/**
 * Validate a machine. Returns {errors, value}: `errors` is a list of
 * {field, message} and `value` is the normalised row, which the caller only
 * uses when `errors` is empty — a partial write must never go through with
 * half of its fields sanitised and the rest left raw.
 *
 * `partial` is true for PATCH, where a field is checked only if it is present.
 */
export function validateRow(payload, { partial = false } = {}) {
  const errors = [];
  const body = payload || {};
  const has = k => Object.prototype.hasOwnProperty.call(body, k);
  const want = k => has(k) || !partial;
  const out = {};

  // ---- ref -----------------------------------------------------------------
  if (want('ref')) {
    const ref = normaliseRef(body.ref);
    if (!ref) errors.push({ field: 'ref', message: 'A reference is required, e.g. AR7-MC-001' });
    else if (!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(ref))
      errors.push({ field: 'ref', message: 'Use letters, numbers, dots, dashes and underscores only' });
    else out.ref = ref;
  }

  // ---- type ----------------------------------------------------------------
  if (want('type')) {
    const resolved = resolveType(body.type);
    if (!resolved) {
      errors.push({
        field: 'type',
        message: `Unknown machine type — use one of: ${MACHINE_TYPES.join(', ')}`
      });
    } else out.type = resolved;
  }

  // ---- brand / model -------------------------------------------------------
  for (const k of ['brand', 'model']) {
    if (!want(k)) continue;
    const v = String(body[k] ?? '').trim();
    if (!v) errors.push({ field: k, message: `${k === 'brand' ? 'Brand' : 'Model'} is required` });
    else if (v.length > 120) errors.push({ field: k, message: 'Keep this under 120 characters' });
    else out[k] = v;
  }

  // ---- numbers -------------------------------------------------------------
  if (has('year') && body.year !== null && body.year !== '') {
    const y = Number(body.year);
    const maxYear = new Date().getFullYear() + 1;
    if (!Number.isFinite(y) || y < 1950 || y > maxYear)
      errors.push({ field: 'year', message: `Year must be between 1950 and ${maxYear}` });
    else out.year = Math.round(y);
  } else if (!partial) errors.push({ field: 'year', message: 'Model year is required' });

  if (has('hours') && body.hours !== null && body.hours !== '') {
    const h = Number(body.hours);
    if (!Number.isFinite(h) || h < 0 || h > 200000)
      errors.push({ field: 'hours', message: 'Hours must be between 0 and 200,000' });
    else out.hours = Math.round(h);
  }

  if (has('price_usd') && body.price_usd !== null && body.price_usd !== '') {
    const p = Number(body.price_usd);
    if (!Number.isFinite(p) || p <= 0 || p > 100000000)
      errors.push({ field: 'price_usd', message: 'Price must be a positive amount in USD' });
    else out.price_usd = Math.round(p * 100) / 100;
  }

  if (has('sort_order') && body.sort_order !== null && body.sort_order !== '') {
    const s = Number(body.sort_order);
    out.sort_order = Number.isFinite(s) ? Math.round(s) : 0;
  }

  // ---- text ----------------------------------------------------------------
  for (const k of ['summary', 'origin', 'location', 'adapter', 'source_url', 'status']) {
    if (!has(k)) continue;
    const v = body[k] === null ? null : String(body[k]).trim();
    if (v === null) { out[k] = null; continue; }
    if (k === 'status' && v && !MACHINE_STATUSES.includes(v))
      errors.push({ field: 'status', message: `Status must be one of: ${MACHINE_STATUSES.join(', ')}` });
    else if (k === 'source_url' && v && !/^https?:\/\//i.test(v))
      errors.push({ field: 'source_url', message: 'A source URL must start with http:// or https://' });
    else out[k] = v;
  }

  // ---- specs: [["Label","value"], …] --------------------------------------
  if (has('specs')) {
    const specs = normaliseSpecs(body.specs);
    if (specs === null) errors.push({ field: 'specs', message: 'Specs must be a list of [label, value] pairs' });
    else out.specs = specs;
  }

  // ---- images: [{src, rights}, …] -----------------------------------------
  if (has('images')) {
    const images = normaliseImages(body.images);
    if (images === null) errors.push({ field: 'images', message: 'Images must be a list of {src, rights} entries' });
    else out.images = images;
  }

  if (has('rights_basis')) {
    const basis = String(body.rights_basis ?? '').trim();
    if (basis && !RIGHTS.includes(basis))
      errors.push({ field: 'rights_basis', message: `Rights basis must be one of: ${RIGHTS.join(', ')}` });
    else out.rights_basis = basis || null;
  }

  if (has('published')) out.published = !!body.published;
  if (has('imported_at')) out.imported_at = body.imported_at || null;

  return { errors, value: out };
}

/** Specs arrive as [["Label","value"]] or [{label,value}] — accept both. */
function normaliseSpecs(input) {
  if (input == null) return [];
  const list = Array.isArray(input) ? input : null;
  if (!list) return null;
  const out = [];
  for (const entry of list) {
    let label, value;
    if (Array.isArray(entry)) [label, value] = entry;
    else if (entry && typeof entry === 'object') { label = entry.label ?? entry.k; value = entry.value ?? entry.v; }
    else if (typeof entry === 'string' && entry.includes(':')) [label, value] = entry.split(/:(.*)/s);
    else return null;
    label = String(label ?? '').trim();
    value = String(value ?? '').trim();
    if (label && value) out.push([label, value]);
  }
  return out;
}

/**
 * Images arrive as [{src, rights}] or as bare strings (the shape
 * src/machinery-data.js uses). Both are accepted; a bare string carries no
 * rights basis, which is exactly what must block publication.
 */
export function normaliseImages(input) {
  if (input == null) return [];
  const list = Array.isArray(input) ? input : null;
  if (!list) return null;
  const out = [];
  for (const entry of list) {
    if (typeof entry === 'string') {
      const src = entry.trim();
      if (src) out.push({ src, rights: '' });
      continue;
    }
    if (!entry || typeof entry !== 'object') return null;
    const src = String(entry.src ?? entry.url ?? entry.image ?? '').trim();
    if (!src) continue;
    const rights = String(entry.rights ?? entry.rights_basis ?? '').trim();
    out.push({ src, rights: RIGHTS.includes(rights) ? rights : '' });
  }
  return out;
}

/** The photos of a row, normalised, in order. */
export function photosOf(row) {
  return normaliseImages(row?.images) || [];
}

/**
 * The rights gate. A photo with no recorded rights basis never reaches the
 * site — autopublished or not. This is the rule the owner has stated every
 * time, so it is enforced here in one place rather than in each caller.
 */
export function photoRights(row) {
  const photos = photosOf(row);
  const usable = photos.filter(p => rightsAreUsable(p.rights));
  const missing = photos.filter(p => !rightsAreUsable(p.rights)).map(p => p.src);
  return { photos, usable, missing, ok: photos.length > 0 && missing.length === 0 };
}

/**
 * Why this machine may not be published yet. An empty array means it may.
 *
 * `reviewPhotos()` (from src/machinery-source.js) is consulted as well, so a
 * machine cannot sneak past on a technicality: the same photo standard the
 * supplier-inbox importer applies is applied here too.
 */
export function publishBlockers(row, settings = {}) {
  const blockers = [];
  const minPhotos = num(settings.machinery_min_photos, 1);
  const allowPlaceholder = bool(settings.machinery_allow_placeholder_photo, false);

  if (!resolveType(row?.type)) blockers.push(HOLD.NO_TYPE);

  const price = Number(row?.price_usd);
  if (!Number.isFinite(price) || price <= 0) blockers.push(HOLD.NO_PRICE);

  const rights = photoRights(row);
  if (!rights.ok) {
    if (!(allowPlaceholder && rights.photos.length === 0)) blockers.push(HOLD.NO_RIGHTS);
  } else if (rights.usable.length < minPhotos) {
    blockers.push(HOLD.FEW_PHOTOS);
  }

  // The photo standard the supplier importer already applies.
  const review = reviewPhotos(row, { now: new Date().getFullYear() });
  if (review && Array.isArray(review.issues) && review.issues.length) {
    for (const issue of review.issues) {
      const code = String(issue?.code || issue || '');
      if (code && !blockers.includes(code)) blockers.push(code);
    }
  }
  return blockers;
}

/** The single reason shown in the CRM (it is a column, so it holds one). */
export function primaryHoldReason(row, settings = {}) {
  const blockers = publishBlockers(row, settings);
  return blockers.length ? blockers[0] : null;
}

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

/**
 * Map a database row onto the shape src/machinery-data.js hands the site, so
 * the pages, the cards, `listPriceUSD()` and `machineHref()` all work on a
 * database-backed machine exactly as they do on a file-backed one. This is the
 * whole reason hydration is a drop-in rather than a rewrite.
 */
export function toPublic(row) {
  if (!row) return null;
  const photos = photosOf(row).filter(p => rightsAreUsable(p.rights));
  const srcs = photos.map(p => p.src);
  return {
    id: row.id,
    ref: machineRef(row),
    name: [row.brand, row.model].filter(Boolean).join(' '),
    brand: row.brand,
    model: row.model,
    type: row.type,
    year: row.year ?? null,
    hours: row.hours ?? null,
    // listPriceUSD() prefers `price` when it is set, so the listed figure is
    // the CRM figure with no markup applied on top of it.
    price: Number.isFinite(Number(row.price_usd)) ? Number(row.price_usd) : 0,
    supplierPrice: 0,
    summary: row.summary || '',
    specs: Array.isArray(row.specs) ? row.specs : [],
    images: srcs,
    image: srcs[0] || '',
    photosPending: srcs.length === 0,
    status: row.status || 'Available',
    origin: row.origin || 'China',
    location: row.location || '',
    // Provenance, for the CRM and for anyone auditing a listing.
    source_url: row.source_url || null,
    adapter: row.adapter || null,
    rights_basis: row.rights_basis || null,
    imported_at: row.imported_at || null,
    published_by: row.published_by || null,
    hold_reason: row.hold_reason || null,
    price_before_usd: row.price_before_usd ?? null,
    price_changed_at: row.price_changed_at || null,
    source_missing_since: row.source_missing_since || null,
    sort_order: row.sort_order || 0,
    updated_at: row.updated_at || null,
    // From the file fallback, not stored: AR7 does not hold these machines.
    _db: true
  };
}

/** The type slug used in /machinery/<type>. Shared with the sitemap. */
export function typeSlugOf(row) {
  return machineTypeSlug(row) || machineTypeSlug({ type: resolveType(row?.type) });
}
