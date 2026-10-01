// japan_dealer_stock rows → the site's car shape.
//
// Imported cars are not a second catalogue: once mapped they live in the same
// `cars` array the inventory, search, compare, detail page, save, CIF estimate
// and related-stock sections already use, so an imported car behaves exactly
// like AR7's own inventory (the /inventory/<stock> experience).
//
// Rules:
//   • promoted rows are already published in site_listings — mapping them
//     again would duplicate the same car on the site
//   • rotation_state 'parked' rows are outside the live window (see
//     supabase/MIGRATION-2026-10-inventory.sql) and stay hidden
//   • available === false is a delisted car — the importer's delist check owns
//     availability, this only echoes it
//   • nothing is fabricated. Fields the row does not carry stay null; the
//     detail page's spec table already filters empty rows, so an imported car
//     shows only the facts the dealer page actually stated.
//
// Pure module: no DOM, no network — unit-tested by scripts/japan-stock-map.test.mjs.

export const IMPORTED_ID_PREFIX = 'jdk-';

/** Stable site id for an imported car. */
export function importedCarId(row) {
  const key = row?.goonet_id ?? row?.stock_no ?? row?.id;
  return key === null || key === undefined || String(key).trim() === ''
    ? null
    : IMPORTED_ID_PREFIX + String(key).trim();
}

/** True when the row has been promoted to the public website (site_listings). */
export function isPromotedRow(row) {
  // The importer writes 'listings', 'vehicles' or 'both'.
  const v = String(row?.promoted || '').trim().toLowerCase();
  return v === 'both' || v.includes('listings');
}

/** True when the rotation system has parked this row out of the live window. */
export function isParkedRow(row) {
  return String(row?.rotation_state || '') === 'parked';
}

/** True for a car that came from the dealer-stock importer (site shape). */
export function isImportedCar(car) {
  return !!(car && car.imported === true);
}

function numbers(value) {
  return Number(String(value ?? '').replace(/,/g, ''));
}

function positiveNumber(value) {
  const n = numbers(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Photo list from a DB `images` value (array, JSON string or comma list). */
export function dealerImages(row) {
  const raw = row?.images;
  let list = [];
  if (Array.isArray(raw)) list = raw;
  else if (typeof raw === 'string' && raw.trim()) {
    const s = raw.trim();
    if (s.startsWith('[')) {
      try {
        const parsed = JSON.parse(s);
        if (Array.isArray(parsed)) list = parsed;
      } catch { list = []; }
    } else {
      list = s.split(',').map(x => x.trim());
    }
  }
  const clean = list.filter(u => typeof u === 'string' && u.trim());
  const cover = typeof row?.image === 'string' && row.image.trim() ? row.image.trim() : null;
  if (cover && !clean.includes(cover)) clean.unshift(cover);
  return clean;
}

/** The price string the site renders — the row's own display price, never invented. */
export function dealerPrice(row) {
  if (row?.price) return row.price;
  const usd = positiveNumber(row?.price_usd);
  if (usd) return '$' + Math.round(usd).toLocaleString('en-US');
  return null;
}

/**
 * Map public dealer-stock rows into site cars.
 *
 * @param {Array} rows          payload of GET /api/goonet-stock
 * @param {Object} [opts]
 * @param {boolean} [opts.includeParked=false]  include parked rows (CRM/dev tools only)
 * @returns {Array} cars in the shape `cars` already uses
 */
export function mapDealerRows(rows, { includeParked = false } = {}) {
  const out = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row) continue;
    const id = importedCarId(row);
    if (!id) continue;
    if (row.available === false) continue;
    if (!includeParked && isParkedRow(row)) continue;
    if (isPromotedRow(row)) continue;
    const images = dealerImages(row);
    out.push({
      id,
      imported: true,
      goonet_id: String(row.goonet_id ?? ''),
      stock_no: row.stock_no || row.goonet_id || '',
      make: row.make || null,
      model: row.model || null,
      year: positiveNumber(row.year),
      km: row.km ?? null,
      fuel: row.fuel || null,
      body: row.body || null,
      price: dealerPrice(row),
      image: images[0] || null,
      images,
      photo_count: images.length,
      grade: row.grade || null,
      status: row.status || 'In Stock',
      location: row.location || 'Japan',
      tr: row.tr || null,
      drv: row.drv || null,
      eng: row.eng || null,
      seats: positiveNumber(row.seats),
      col: row.col || null,
      st: row.st || null
    });
  }
  return out;
}
