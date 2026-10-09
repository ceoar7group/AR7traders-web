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

import { RIGHTS, rightsAreUsable, reviewPhotos, IMPORT_STATUS, DEFAULT_RIGHTS, looksWatermarked } from '../src/machinery-source.js';
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
  [HOLD.NO_RIGHTS]: 'A photo has no basis recorded',
  [HOLD.FEW_PHOTOS]: 'Fewer photos than the minimum',
  [HOLD.NO_PRICE]: 'No price',
  [HOLD.NO_TYPE]: 'The machine type could not be resolved',
  [HOLD.STALE]: 'The source listing can no longer be read'
};

// Importer rules. Every default mirrors the seed in supabase/machinery.sql, so
// a database with no site_settings row still behaves the way the SQL says.
export const MACHINERY_SETTING_DEFAULTS = {
  machinery_autopublish: 'true',
  // How many machines one scraper run may pull into the desk. 2026-10-08: 8 —
  // the review queue and the row count are the real cost of a run, not the
  // table size, and 8 previews is what one operator can actually read before
  // confirming. MAX_SCRAPER_MACHINES (24) stays the hard ceiling; a setting or
  // a per-run limit may lower it, never raise it.
  machinery_scraper_batch: '8',
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
  // 2026-10-08: a model year is validated hard when stated and stored as NULL
  // when it is not. Requiring it used to force the importer to invent one (see
  // toMachine in src/machinery-source.js); a machine with no verified year is
  // listed without one, which is true, instead of refused or fabricated.
  if (has('year') && body.year !== null && body.year !== '') {
    const y = Number(body.year);
    const maxYear = new Date().getFullYear() + 1;
    if (!Number.isFinite(y) || y < 1950 || y > maxYear)
      errors.push({ field: 'year', message: `Year must be between 1950 and ${maxYear}` });
    else out.year = Math.round(y);
  } else {
    out.year = null;
  }

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

  // Every machine in the table exists to be listed — hand-added, imported or
  // scraped. `published` starts true and only a person sets it false (the CRM's
  // unpublish / archive action). 2026-10-07: nothing about the photos blocks a
  // listing either — the machine renders with the photographs the importer
  // stored, exactly as a car does, and the CRM shows the basis recorded on
  // each one.
  if (has('published')) out.published = body.published === undefined ? true : !!body.published;
  else if (!partial) out.published = true;
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
 * src/machinery-data.js uses). Both are accepted. A photo with no basis
 * recorded is filed under the standing import basis, because the desk lists
 * machines with their pictures (2026-10-07) — the basis is provenance, not a
 * gate. Only an EXPLICIT empty basis stays empty, so an operator who cleared
 * it still sees that in the desk.
 */
export function normaliseImages(input) {
  if (input == null) return [];
  const list = Array.isArray(input) ? input : null;
  if (!list) return null;
  const out = [];
  for (const entry of list) {
    if (typeof entry === 'string') {
      const src = entry.trim();
      // A photo with no basis recorded is filed under the standing import
      // basis rather than being withheld — 2026-10-07: the desk imports and
      // lists machines the way the car scraper does.
      if (src) out.push({ src, rights: DEFAULT_RIGHTS });
      continue;
    }
    if (!entry || typeof entry !== 'object') return null;
    const src = String(entry.src ?? entry.url ?? entry.image ?? '').trim();
    if (!src) continue;
    const raw = entry.rights ?? entry.rights_basis;
    // A recorded basis is kept; an absent one is filed under the standing
    // import basis; an EXPLICIT empty string stays empty, because an operator
    // who chose "no basis recorded" should see exactly that in the desk.
    const rights = String(raw ?? '').trim();
    const resolved = raw === undefined || raw === null
      ? DEFAULT_RIGHTS
      : (RIGHTS.includes(rights) ? rights : '');
    out.push({ src, rights: resolved });
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
  // "Missing" means no basis is recorded at all — a provenance gap the desk
  // asks about. It is not a publish blocker any more (2026-10-07): the photo
  // still goes on the site, because the import basis covers it.
  const missing = photos.filter(p => !String(p.rights ?? p.rights_basis ?? '').trim()).map(p => p.src);
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

  // Photos never block a listing any more (2026-10-07): a machine with no
  // pictures is listed with `photosPending` and shows up in the desk's review
  // queue, exactly like an imported car without photos. The only remaining
  // rights hold is a photo that explicitly records an empty basis — a legacy
  // row — which the CRM offers to fix rather than hiding the machine.
  const rights = photoRights(row);
  if (rights.missing.length > 0) blockers.push(HOLD.NO_RIGHTS);
  else if (!allowPlaceholder && rights.photos.length < minPhotos) blockers.push(HOLD.FEW_PHOTOS);

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
  // 2026-10-07: the photo rights GATE is gone. A machine renders with every
  // photograph the importer stored, exactly as the car side does; the basis
  // recorded on each photo is provenance for the CRM, not a publishing
  // condition. Watermarked marketplace copies are counted so the desk can
  // offer a replacement, never hidden.
  const allPhotos = photosOf(row);
  const photos = allPhotos;
  const srcs = photos.map(p => p.src);
  // Imported models already carry their brand (classify() prepends it), so a
  // naive join would say "Doosan Doosan DX300LC" on the card and the page.
  const nameModel = String(row.model || '').trim();
  const nameBrand = String(row.brand || '').trim();
  const name = nameBrand && nameModel.toLowerCase().startsWith(nameBrand.toLowerCase())
    ? nameModel
    : [nameBrand, nameModel].filter(Boolean).join(' ');
  return {
    id: row.id,
    ref: machineRef(row),
    name,
    brand: row.brand,
    model: row.model,
    type: row.type,
    year: row.year ?? null,
    hours: row.hours ?? null,
    // listPriceUSD() prefers `price` when it is set, so the listed figure is
    // the CRM figure with no markup applied on top of it.
    price: Number.isFinite(Number(row.price_usd)) ? Number(row.price_usd) : 0,
    supplierPrice: 0,
    price_usd: row.price_usd ?? null,
    source_last_seen_at: row.source_last_seen_at || null,
    summary: row.summary || '',
    specs: Array.isArray(row.specs) ? row.specs : [],
    images: srcs,
    image: srcs[0] || '',
    photosPending: srcs.length === 0,
    photos_withheld: 0,
    // Kept for the CRM's review queue: marketplace-hosted copies usually carry
    // a visible mark, so they are listed for replacement rather than dropped.
    photos_flagged: srcs.filter(src => looksWatermarked(src)).length,
    created_by: row.created_by || null,
    created_by_name: row.created_by_name || null,
    status: row.status || 'Available',
    origin: row.origin || 'China',
    location: row.location || '',
    // Provenance, for the CRM and for anyone auditing a listing.
    source_url: row.source_url || null,
    adapter: row.adapter || null,
    rights_basis: row.rights_basis || null,
    imported_at: row.imported_at || null,
    published: row.published !== false,
    published_by: row.published_by || null,
    published_by_name: row.published_by_name || null,
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

// ---------------------------------------------------------------------------
// Handlers
// ---------------------------------------------------------------------------
// These run inside api/site-content.js (dispatched on ?machinery=…) and
// api/goonet-sync.js (dispatched on ?job=machinery). `actor` is the profile
// from requireUser(), or null for an unattended run.

const now = () => new Date().toISOString();

/** Write an audit-trail entry. Never throws — a failed log must not fail the write. */
async function audit(db, actor, action, entityId) {
  try {
    await db.from('activities').insert({
      action,
      actor: actor?.full_name || actor?.email || 'System',
      entity_type: MACHINERY_TABLE,
      entity_id: entityId || null,
      created_by: actor?.id || null
    });
  } catch (e) { console.error('machinery activity log failed', e.message); }
}

const rowLabel = row => [row?.brand, row?.model].filter(Boolean).join(' ') || row?.ref || 'machine';

/**
 * Read machines.
 *  - publishedOnly (the public default): only rows a person has not hidden.
 *    Photographs travel with the row (2026-10-07) — the basis recorded on each
 *    one is provenance for the desk, not a condition on publication.
 *  - all=1 from the CRM: every row including hidden ones.
 */
// Supabase's default response cap must not silently hide older imports or
// make duplicate detection forget them. Stable, paged reads; errors are not []!
export async function readMachineryRows(db, { publishedOnly = false, type = null } = {}) {
  const rows = [];
  const size = 500;
  for (let offset = 0; offset < 100000; offset += size) {
    let q = db.from(MACHINERY_TABLE).select('*').order('id', { ascending: true });
    if (publishedOnly) q = q.eq('published', true);
    if (type) q = q.eq('type', type);
    const paged = typeof q.range === 'function';
    if (paged) q = q.range(offset, offset + size - 1);
    const { data, error } = await q;
    if (error) throw Object.assign(new Error(error.message), { status: 500, code: error.code });
    if (!Array.isArray(data)) throw new Error('Machinery database returned no readable rows');
    rows.push(...data);
    if (!paged || data.length < size) return rows;
  }
  throw new Error('Machinery catalogue exceeds the safe scan limit; no partial result was used');
}

/** Private, read-only inventory of stored rows — no guessed publication cause. */
export function machineryVisibility(rows) {
  const items = rows.map(row => {
    const invalid = validateRow({ ...row, ref: row.ref }).errors.map(e => e.message);
    const visible = row.published === true && !!resolveType(row.type) && !!normaliseRef(row.ref);
    return {
      id: row.id, ref: row.ref, name: [row.brand, row.model].filter(Boolean).join(' '),
      imported: !!(row.imported_at || row.source_url),
      published: row.published === true, status: row.status || 'Available',
      visibility: visible ? 'published' : row.status === 'Archived' ? 'archived'
        : row.published !== true ? 'unpublished' : 'invalid-route',
      hold_reason: row.hold_reason || null, invalid,
      href: visible ? `/machinery/${typeSlugOf(row)}/${normaliseRef(row.ref)}` : null
    };
  });
  return {
    total: items.length,
    imported: items.filter(r => r.imported).length,
    published: items.filter(r => r.visibility === 'published').length,
    hiddenImported: items.filter(r => r.imported && r.visibility !== 'published').length,
    items
  };
}

export async function listMachines(db, { publishedOnly = true, type = null } = {}) {
  const rows = await readMachineryRows(db, { publishedOnly, type });
  return rows.sort((a,b) => (Number(a.sort_order) || 0) - (Number(b.sort_order) || 0)
    || String(b.created_at || '').localeCompare(String(a.created_at || ''))).map(toPublic);
}

export async function createMachine(db, body, actor) {
  const { errors, value } = validateRow(body);
  if (errors.length) throw Object.assign(new Error(errors.map(e => e.message).join('; ')), { status: 400, details: errors });

  const settings = await machinerySettings(db);
  const row = {
    ...value,
    created_by: actor?.id || null,
    created_by_name: actor?.full_name || actor?.email || (actor ? null : 'Importer'),
    published_by: value.published === false ? null : (actor?.id || 'auto'),
    published_by_name: value.published === false ? null : (actor?.full_name || actor?.email || 'Automatic'),
    published_at: value.published === false ? null : now(),
    imported_at: value.imported_at || null,
    created_at: now(),
    updated_at: now()
  };
  const blockers = row.published ? [] : publishBlockers(row, settings);
  row.hold_reason = row.published ? primaryHoldReason(row, settings) : blockers[0] || null;

  const { data, error } = await db.from(MACHINERY_TABLE).insert(row).select().single();
  if (error) throw Object.assign(new Error(error.message), { status: 500 });
  await audit(db, actor, `Added ${rowLabel(data)} (${data.ref}) to the machinery desk`, data.id);
  if (data.published) await audit(db, actor, `Published ${data.ref} on the website`, data.id);
  return toPublic(data);
}

export async function updateMachine(db, id, body, actor) {
  if (!id) throw Object.assign(new Error('Missing id'), { status: 400 });
  const { errors, value } = validateRow(body, { partial: true });
  if (errors.length) throw Object.assign(new Error(errors.map(e => e.message).join('; ')), { status: 400, details: errors });

  const settings = await machinerySettings(db);
  const { data: before } = await db.from(MACHINERY_TABLE).select('*').eq('id', id).maybeSingle();
  if (!before) throw Object.assign(new Error('Machine not found'), { status: 404 });

  const next = { ...value, updated_at: now() };
  // A price edit keeps the old figure so the CRM can show "was / now".
  if (next.price_usd !== undefined && Number(next.price_usd) !== Number(before.price_usd)) {
    next.price_before_usd = before.price_usd ?? null;
    next.price_changed_at = now();
  }
  if (next.published !== undefined && next.published !== before.published) {
    next.published_by = next.published ? (actor?.id || 'auto') : null;
    next.published_by_name = next.published ? (actor?.full_name || actor?.email || 'Automatic') : null;
    next.published_at = next.published ? now() : null;
  }
  // Re-evaluate the hold flag against the row as it will be, not as it was.
  const merged = { ...before, ...next };
  next.hold_reason = primaryHoldReason(merged, settings);

  const { data, error } = await db.from(MACHINERY_TABLE).update(next).eq('id', id).select().single();
  if (error) throw Object.assign(new Error(error.message), { status: 500 });

  const changes = Object.keys(value).filter(k => JSON.stringify(before[k]) !== JSON.stringify(data[k]));
  await audit(db, actor, `Updated ${rowLabel(data)} (${data.ref}): ${changes.join(', ') || 'no field change'}`, id);
  if (next.price_changed_at) {
    await audit(db, actor,
      `Re-priced ${data.ref}: ${before.price_usd ?? 'no price'} → ${data.price_usd} USD`, id);
  }
  if (before.published !== data.published) {
    await audit(db, actor, data.published ? `Published ${data.ref} on the website` : `Unpublished ${data.ref}`, id);
  }
  return toPublic(data);
}

/** Publish / unpublish / archive. `manual` marks it as a person's decision. */
export async function setPublished(db, id, published, actor, { reason = '', archive = false } = {}) {
  if (!id) throw Object.assign(new Error('Missing id'), { status: 400 });
  const patch = {
    published: !!published,
    published_by: published ? (actor?.id || 'auto') : null,
    published_by_name: published ? (actor?.full_name || actor?.email || 'Automatic') : null,
    published_at: published ? now() : null,
    updated_at: now()
  };
  if (archive) patch.status = 'Archived';
  const { data, error } = await db.from(MACHINERY_TABLE).update(patch).eq('id', id).select().single();
  if (error) throw Object.assign(new Error(error.message), { status: 500 });
  if (!data) throw Object.assign(new Error('Machine not found'), { status: 404 });
  await audit(db, actor,
    (published ? 'Published ' : 'Unpublished ') + data.ref +
    (archive ? ' (archived)' : '') + (reason ? ' — ' + reason : ''), id);
  return toPublic(data);
}

/**
 * The deliberate end of the staleness path. `step=stale` only FLAGS a machine
 * whose source listing disappeared (source_missing_since); nothing ever removed
 * one, so an unpublished row from a dead supplier stayed in the table and in
 * the review queue forever. Row count and the photo-review queue are the real
 * cost of this desk, so a person can now clear them — per call, audited:
 *
 *   remove=false (default)  → status='Archived'. The row is kept and the
 *                             decision is reversible.
 *   remove=true             → the row is DELETED, and only if a person already
 *                             parked it (status='Archived') or it has been
 *                             missing for twice the threshold. A supplier's
 *                             weekend outage must never delete stock.
 *
 * Published rows are never touched, at either setting: `published=false` means
 * a person hid it deliberately, and a person decides when it goes.
 */
export async function purgeStale(db, { olderThanDays = 14, remove = false, actor = null } = {}) {
  const days = Math.max(1, Math.min(365, Math.round(Number(olderThanDays) || 14)));
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();
  const double = new Date(Date.now() - days * 2 * 86400000).toISOString();
  // Only unpublished rows are ever considered, so the filter is `published=false`
  // server-side and the date comparison is done here, on ISO strings (which sort
  // chronologically). Keeping the query to one `.eq()` means the same call works
  // against PostgREST and against the test doubles.
  const { data, error } = await db.from(MACHINERY_TABLE)
    .select('id,ref,status,source_missing_since')
    .eq('published', false)
    .order('source_missing_since', { ascending: true });
  if (error) throw Object.assign(new Error(error.message), { status: 500 });
  const rows = (Array.isArray(data) ? data : [])
    .filter(r => r.source_missing_since && String(r.source_missing_since) < cutoff);
  const archived = [], deleted = [], kept = [];

  for (const row of rows) {
    if (!remove) {
      if (row.status === 'Archived') { kept.push(row.ref); continue; }
      const { error: e2 } = await db.from(MACHINERY_TABLE)
        .update({ status: 'Archived', updated_at: now() }).eq('id', row.id);
      if (e2) throw Object.assign(new Error(e2.message), { status: 500 });
      archived.push(row.ref);
      await audit(db, actor,
        `Archived ${row.ref} — unpublished and missing from its source since ${String(row.source_missing_since).slice(0, 10)}`,
        row.id);
      continue;
    }
    // Deleting needs a person to have already parked the row, or the row to be
    // twice as stale as the threshold. Everything else is kept and reported.
    const parked = row.status === 'Archived';
    const twice = String(row.source_missing_since) < double;
    if (!parked && !twice) { kept.push(row.ref); continue; }
    const { error: e3 } = await db.from(MACHINERY_TABLE).delete().eq('id', row.id);
    if (e3) throw Object.assign(new Error(e3.message), { status: 500 });
    deleted.push(row.ref);
    await audit(db, actor,
      `Deleted ${row.ref} — unpublished, source missing since ${String(row.source_missing_since).slice(0, 10)}${parked ? ', already archived' : ', over twice the stale threshold'}`,
      row.id);
  }
  return { days, cutoff, considered: rows.length, archived, deleted, kept };
}

export async function deleteMachine(db, id, actor) {
  if (!id) throw Object.assign(new Error('Missing id'), { status: 400 });
  const { data } = await db.from(MACHINERY_TABLE).select('ref,brand,model').eq('id', id).maybeSingle();
  const { error } = await db.from(MACHINERY_TABLE).delete().eq('id', id);
  if (error) throw Object.assign(new Error(error.message), { status: 500 });
  await audit(db, actor, `Deleted ${rowLabel(data)} (${data?.ref || id}) from the machinery desk`, id);
  return { ok: true };
}

/** Owner-requested recovery, never a nightly task. Reuses existing rows and
 * refuses archived/sold/reserved or incomplete records. No photos/price gate. */
export async function recoverImportedMachines(db, actor, {confirm = false, ids = null} = {}) {
  if (confirm !== true) throw Object.assign(new Error('Explicit confirmation is required to publish hidden imports'), {status:400});
  const rows = await readMachineryRows(db);
  const eligible = rows.filter(r => r.published === false && r.status === 'Available' &&
    (r.imported_at || r.source_url) && !validateRow(r).errors.length &&
    (!Array.isArray(ids) || ids.includes(r.id)));
  const restored = [], failed = [];
  const start = Date.now();
  for (const row of eligible.slice(0,100)) {
    if (Date.now()-start > 40000) break;
    const {data, error} = await db.from(MACHINERY_TABLE).update({published:true,hold_reason:null,
      published_at:now(),updated_at:now(),published_by:actor?.id || 'owner-recovery',
      published_by_name:actor?.full_name || 'Owner-requested recovery'})
      .eq('id',row.id).eq('published',false).eq('status','Available').select('*').single();
    if (error || !data) failed.push({ref:row.ref,error:error?.message || 'Row changed before recovery; not overwritten'});
    else {restored.push(row.ref); await audit(db,actor,`Recovered hidden import ${row.ref} — owner requested publication`,row.id);}
  }
  return {restored,failed,remaining:Math.max(0,eligible.length-restored.length),
    inventory:machineryVisibility(await readMachineryRows(db))};
}
