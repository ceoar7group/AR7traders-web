// The machinery import agent — a shared module, so it costs no Serverless
// Function (api/_*.js files are not counted; see the header in
// api/_columns.js). It is reached two ways:
//
//   • POST /api/site-content?import=machinery&step=preview  — reads a supplier
//     link and RETURNS what it found. Writes nothing, ever.
//   • POST /api/site-content?import=machinery&step=confirm  — writes what the
//     operator approved, and only that.
//   • api/goonet-sync.js?job=machinery — the nightly run over saved sources.
//
// The preview/confirm split is the whole point. An import is the one action on
// the site that writes rows nobody typed, from a source we do not control, so
// a human sees the machine before it exists and cannot be surprised by it.
import {
  ADAPTERS, chooseAdapter, extractProduct, toMachine, reviewPhotos,
  rightsAreUsable, RIGHTS
} from '../src/machinery-source.js';
// MACHINE_TYPES comes from the site's own data module rather than being
// re-exported through _machinery.js, so there is one definition of what a
// machine type is and the importer cannot drift from the catalogue.
import { MACHINE_TYPES } from '../src/machinery-data.js';
import { resolveType, normaliseRef, validateRow, toPublic, MACHINERY_TABLE } from './_machinery.js';

/** How many machines one confirm may write — a runaway import is worse than a slow one. */
export const MAX_IMPORT_BATCH = 50;

/** Fetch timeout for a supplier page. A hung supplier must not hang the function. */
const FETCH_TIMEOUT_MS = 15000;

// ---------------------------------------------------------------------------
// Dedupe
// ---------------------------------------------------------------------------

/**
 * Two machines are the same machine if the supplier says so (same source URL)
 * or if brand + model + year agree. The URL wins because it is the supplier's
 * own identity for the listing; brand/model/year is the fallback for the same
 * machine listed twice, or re-listed after a price change.
 *
 * Never match on price: a re-priced machine is the SAME machine, and matching
 * on price would import it again as a new one.
 */
export function dedupeKey(machine = {}) {
  const url = String(machine.source_url || '').trim().toLowerCase();
  if (url) return 'url:' + url.replace(/[?#].*$/, '');
  const brand = String(machine.brand || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const model = String(machine.model || '').trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
  const year = String(machine.year || '').trim();
  if (brand && model) return `bmy:${brand}|${model}|${year}`;
  return null;
}

/** Find the existing row a candidate would replace, or null. */
export function findExisting(rows, candidate) {
  const key = dedupeKey(candidate);
  if (!key) return null;
  return rows.find(r => dedupeKey(r) === key) || null;
}

// ---------------------------------------------------------------------------
// Preview — reads, never writes
// ---------------------------------------------------------------------------

/**
 * Turn a supplier link into a candidate machine WITHOUT touching the database.
 *
 * `html` may be supplied by the caller (tests, and the sync job that has
 * already fetched the page); when it is absent the page is fetched here.
 *
 * Returns {ok, machine, warnings, review, source}, where the caller shows
 * `machine` to a human and sends it back unchanged to confirm.
 */
export async function previewMachine({ url, html = null, rights = null, adapter = null, markup = 0.25 } = {}) {
  const warnings = [];

  if (!url && !html) return { ok: false, error: 'A supplier link is required' };

  const chosen = chooseAdapter(url, { on: adapter });
  const spec = ADAPTERS[chosen] || ADAPTERS['product-page'];

  let page = html;
  if (page == null) {
    if (spec.mode !== 'fetch') {
      return { ok: false, error: `The ${spec.label} adapter cannot fetch a URL — supply the data from the scheduled job` };
    }
    try {
      page = await fetchPage(url);
    } catch (e) {
      return { ok: false, error: `Could not read that link: ${e.message}` };
    }
  }

  const product = extractProduct(page, url);
  if (!product || (!product.title && !(product.specs || []).length)) {
    return {
      ok: false,
      error: 'That link has no product data we can read. It may need a login, or it may not be a product page.'
    };
  }

  // 2026-10-04: owner policy — photos import by default with the
  // 'dropship-authorized' basis (supplier terms allow reseller image use).
  // Only visibly watermarked photos are skipped; the machine always imports.
  const basis = rightsAreUsable(rights) ? rights : 'dropship-authorized';

  const machine = toMachine(product, { markup, rights: basis, adapter: chosen });

  // A machine we cannot classify is still importable, but a human must set the
  // type — a machine filed under the wrong type is invisible to whoever is
  // looking for it.
  if (!machine.type || !resolveType(machine.type)) {
    warnings.push(`Could not tell what kind of machine this is (${MACHINE_TYPES.join(', ')}). Set it before confirming.`);
  }
  if (!machine.supplierPrice) warnings.push('No price was found — the machine will import without one and cannot be quoted.');

  const review = reviewPhotos(machine);
  if (!review.pass) warnings.push(...review.flags);

  return {
    ok: true,
    machine,
    warnings,
    review,
    source: { adapter: chosen, label: spec.label, url: url || null, canImages: !!spec.canImages }
  };
}

async function fetchPage(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        // Identify ourselves honestly. A scraper pretending to be a browser is
        // the behaviour that gets suppliers' pages closed to us.
        'user-agent': 'AR7Traders-Import/1.0 (+https://ar7traders.com)',
        accept: 'text/html,application/xhtml+xml'
      }
    });
    if (!res.ok) throw new Error(`the supplier answered ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Confirm — writes, and only what was approved
// ---------------------------------------------------------------------------

/** Map the site's machine shape onto database columns. */
export function toRow(machine, { rights = null, adapter = 'product-page', ref = null } = {}) {
  // `ref` lets a re-check keep the reference it already has. toMachine()
  // invents 'AR7-MC-NEW' for a machine that has never been saved, and a
  // nightly run that wrote that over a real reference would break the
  // machine's URL and the number a buyer quotes back to us.
  const ref2 = normaliseRef(ref) || normaliseRef(machine.ref) || null;
  // 2026-10-04: owner policy — photos always carry a recorded basis. The
  // default is 'dropship-authorized' (supplier terms allow reseller image use).
  const basis = rightsAreUsable(rights) ? rights : (rightsAreUsable(machine.source?.rights) ? machine.source.rights : 'dropship-authorized');
  const row = {
    ref: ref2,
    type: resolveType(machine.type) || null,
    brand: machine.brand || null,
    model: machine.model || machine.name || null,
    year: Number.isFinite(Number(machine.year)) ? Number(machine.year) : null,
    hours: Number.isFinite(Number(machine.hours)) ? Number(machine.hours) : null,
    // NULL, not 0, when no price was found. A machine with no price is
    // importable (and the preview says so); a price of 0 fails validation
    // outright, which would silently break the promise the warning made.
    price_usd: Number(machine.listPrice) > 0 ? Number(machine.listPrice) : null,
    summary: machine.summary || null,
    specs: Array.isArray(machine.specs) ? machine.specs : [],
    // Photos carry the rights basis that was chosen at preview time.
    // Watermarked photos were already filtered in toMachine(); the remaining
    // photos are safe to publish under the recorded basis.
    images: (machine.images || []).map(src => ({ src, rights: basis })),
    status: 'Available',
    origin: machine.origin || 'China',
    location: machine.location || 'China',
    source_url: machine.source?.url || null,
    adapter,
    rights_basis: basis,
    imported_at: new Date().toISOString(),
    source_last_seen_at: new Date().toISOString(),
    published: true,
    published_by: 'auto',
    published_by_name: 'Importer (auto)',
    published_at: new Date().toISOString(),
    hold_reason: null,
    sort_order: 0
  };
  return row;
}

/**
 * The next free stock reference in the AR7-MC-NNN sequence. Imported machines
 * arrive carrying the placeholder ref toMachine() invents ('AR7-MC-NEW'); a
 * machine that kept it would share its URL and its stock number with every
 * other import, so each create is given the next free real reference instead.
 */
export function nextAutoRef(existingRows = [], extraRefs = []) {
  let max = 0;
  for (const r of [...existingRows, ...extraRefs]) {
    const m = String(r?.ref || '').match(/^AR7-MC-(\d+)$/i);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return 'AR7-MC-' + String(max + 1).padStart(3, '0');
}

const PLACEHOLDER_REF = 'AR7-MC-NEW';

/**
 * Work out, without writing, what confirming this batch would do.
 * Returns {creates, updates, skips, rePriced, errors}.
 */
export function planImport(existingRows, candidates) {
  const creates = [], updates = [], skips = [], rePriced = [], errors = [];

  if (!Array.isArray(candidates) || !candidates.length) return { creates, updates, skips, rePriced, errors };

  const assigned = [];
  for (const candidate of candidates.slice(0, MAX_IMPORT_BATCH)) {
    const row = candidate?.row || candidate;
    const checked = validateRow(row);

    if (checked.errors.length) {
      errors.push({ ref: row?.ref || null, errors: checked.errors });
      continue;
    }
    const value = checked.value;

    // Provenance the IMPORTER owns, not the operator. validateRow() only
    // carries fields a person may set, so without this the row would lose
    // who-or-what published it — and the owner asked for that on every
    // imported machine. Applied here rather than accepted from the request
    // body: nobody gets to claim a person published a machine they did not.
    value.published_by = 'auto';
    value.published_by_name = 'Importer (auto)';
    value.published_at = new Date().toISOString();
    value.imported_at = value.imported_at || new Date().toISOString();
    value.source_last_seen_at = new Date().toISOString();
    value.source_missing_since = null;

    const match = findExisting(existingRows, value);
    const key = dedupeKey(value);

    if (!key) { skips.push({ ref: value.ref, reason: 'not enough detail to tell this machine apart from another' }); continue; }

    if (!match) {
      // Placeholder refs become the next free AR7-MC-NNN: every machine needs
      // its own stock number and its own URL, and an import is exactly when
      // nobody is there to type one.
      if (!value.ref || value.ref === PLACEHOLDER_REF) {
        value.ref = nextAutoRef(existingRows, assigned);
        assigned.push(value);
      }
      creates.push(value);
      continue;
    }

    // Same machine. It keeps the reference it already has — a re-check writes
    // price and freshness, never a new stock number over the one buyers quote.
    if (!value.ref || value.ref === PLACEHOLDER_REF) value.ref = normaliseRef(match.ref) || value.ref;

    // Same machine. The interesting question is whether the price moved.
    const before = Number.isFinite(Number(match.price_usd)) ? Number(match.price_usd) : null;
    const after = Number.isFinite(Number(value.price_usd)) ? Number(value.price_usd) : null;
    const moved = before != null && after != null && Math.abs(before - after) >= 1;

    updates.push({ id: match.id, before: match, next: value, priceBefore: moved ? before : null, priceAfter: moved ? after : null });
    if (moved) rePriced.push({ ref: match.ref, before, after });
  }

  return { creates, updates, skips, rePriced, errors };
}

/**
 * Write an approved batch. Every machine is published — that is the policy —
 * and a machine whose photos did not clear review is still listed, with the
 * hold reason recorded, rather than hidden.
 */
export async function applyImport(db, plan, actor = null, { sourceUrl = null } = {}) {
  const created = [], updated = [], failed = [];

  for (const row of plan.creates) {
    try {
      const { data, error } = await db.from(MACHINERY_TABLE)
        .insert({ ...row, created_by: actor?.id || null, created_by_name: actor?.full_name || actor?.email || 'Importer' })
        .select('*').single();
      if (error) throw error;
      created.push(toPublic(data));
    } catch (e) {
      failed.push({ ref: row.ref, error: e.message });
    }
  }

  for (const u of plan.updates) {
    try {
      const patch = { ...u.next, source_last_seen_at: new Date().toISOString(), source_missing_since: null };
      // Record the old price before overwriting it, so the CRM can show
      // "was / now" instead of only "now".
      if (u.priceBefore != null) {
        patch.price_before_usd = u.priceBefore;
        patch.price_changed_at = new Date().toISOString();
      }
      const { data, error } = await db.from(MACHINERY_TABLE).update(patch).eq('id', u.id).select('*').single();
      if (error) throw error;
      updated.push(toPublic(data));
    } catch (e) {
      failed.push({ ref: u.next?.ref || u.id, error: e.message });
    }
  }

  return {
    created, updated, failed,
    rePriced: plan.rePriced,
    skipped: plan.skips,
    invalid: plan.errors
  };
}

// ---------------------------------------------------------------------------
// Staleness — flag, never silently delist
// ---------------------------------------------------------------------------

/**
 * Mark machines from this source that the run did not see.
 *
 * They are FLAGGED, never delisted: a supplier taking a listing down for a
 * weekend is not the same thing as the machine no longer being available, and
 * only the owner can tell those apart. A machine seen again clears its flag.
 */
export async function markStale(db, { sourceHost = null, seenIds = [], actor = null } = {}) {
  if (!sourceHost) return { flagged: 0, cleared: 0 };
  const { data: rows, error } = await db.from(MACHINERY_TABLE)
    .select('*')
    .eq('adapter', 'product-page');
  if (error || !Array.isArray(rows)) return { flagged: 0, cleared: 0 };

  const seen = new Set(seenIds.map(String));
  const now = new Date().toISOString();
  let flagged = 0, cleared = 0;

  for (const row of rows) {
    const sameHost = String(row.source_url || '').includes(sourceHost);
    if (!sameHost) continue;
    if (seen.has(String(row.id))) {
      if (row.source_missing_since) { await db.from(MACHINERY_TABLE).update({ source_missing_since: null, source_last_seen_at: now }).eq('id', row.id); cleared++; }
      continue;
    }
    if (!row.source_missing_since) { await db.from(MACHINERY_TABLE).update({ source_missing_since: now }).eq('id', row.id); flagged++; }
  }
  return { flagged, cleared };
}
