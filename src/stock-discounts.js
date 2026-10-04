// Per-stock price discounts, shared by the public site, CRM and settings API.
//
// A discount belongs to one stable stock reference (never to a whole catalogue
// scope). The `kind:REF` key keeps cars and machinery separate even if a source
// happens to reuse a reference. Validation here is pure so the client and API
// enforce the same bounds without adding another Vercel function.

export const STOCK_DISCOUNT_VERSION = 1;
export const STOCK_DISCOUNT_MIN_PERCENT = 1;
export const STOCK_DISCOUNT_MAX_PERCENT = 60;
export const STOCK_DISCOUNT_MAX_ITEMS = 200;
export const EMPTY_STOCK_DISCOUNTS = Object.freeze({version: STOCK_DISCOUNT_VERSION, items: Object.freeze({})});

const KINDS = new Set(['car', 'machine']);
const REF_SHAPE = /^[A-Z0-9][A-Z0-9._/-]{0,79}$/;
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

function cleanRef(value) {
  const ref = String(value ?? '').trim().toUpperCase();
  return REF_SHAPE.test(ref) ? ref : '';
}

export function stockDiscountKey(kind, ref) {
  const type = String(kind ?? '').trim().toLowerCase();
  const id = cleanRef(ref);
  return KINDS.has(type) && id ? `${type}:${id}` : '';
}

function validIsoDate(value) {
  const date = String(value ?? '').trim();
  if (!date) return null;
  if (!DATE_SHAPE.test(date)) return undefined;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : undefined;
}

function parseInput(raw) {
  if (typeof raw === 'string') {
    try { return JSON.parse(raw); }
    catch { return null; }
  }
  return raw;
}

/**
 * Validate and normalise an unknown saved discounts value.
 * Returns `{ok, value, error}` and never throws.
 */
export function validateStockDiscounts(raw) {
  const input = parseInput(raw);
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {ok: false, error: 'stock_discounts must be a JSON object.'};
  }
  const source = input.items;
  if (!source || typeof source !== 'object' || Array.isArray(source)) {
    return {ok: false, error: 'stock_discounts.items must be an object.'};
  }
  const entries = Object.entries(source);
  if (entries.length > STOCK_DISCOUNT_MAX_ITEMS) {
    return {ok: false, error: `A maximum of ${STOCK_DISCOUNT_MAX_ITEMS} stock discounts may be stored.`};
  }

  const items = {};
  for (const [suppliedKey, rawItem] of entries) {
    if (!rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) {
      return {ok: false, error: `Discount ${suppliedKey} must be an object.`};
    }
    const keyParts = String(suppliedKey).match(/^(car|machine):(.+)$/i);
    const kind = String(rawItem.kind || keyParts?.[1] || '').trim().toLowerCase();
    const ref = cleanRef(rawItem.ref || keyParts?.[2] || '');
    const key = stockDiscountKey(kind, ref);
    const normalizedSuppliedKey = keyParts
      ? `${String(keyParts[1]).toLowerCase()}:${String(keyParts[2]).trim().toUpperCase()}`
      : '';
    if (!key || key !== normalizedSuppliedKey || kind !== String(keyParts?.[1] || '').toLowerCase()) {
      return {ok: false, error: `Discount ${suppliedKey} needs a matching car:REF or machine:REF stock key.`};
    }
    const percent = Number(rawItem.percent);
    if (!Number.isInteger(percent) || percent < STOCK_DISCOUNT_MIN_PERCENT || percent > STOCK_DISCOUNT_MAX_PERCENT) {
      return {ok: false, error: `${key} must have a whole-number discount between ${STOCK_DISCOUNT_MIN_PERCENT}% and ${STOCK_DISCOUNT_MAX_PERCENT}%.`};
    }
    const until = validIsoDate(rawItem.until);
    if (until === undefined) return {ok: false, error: `${key}.until must be a real YYYY-MM-DD date.`};
    const label = String(rawItem.label ?? '').trim();
    if (label.length > 40) return {ok: false, error: `${key}.label is too long (max 40 characters).`};

    items[key] = {
      kind,
      ref,
      percent,
      label: label || null,
      until,
      publishedAt: rawItem.publishedAt ? String(rawItem.publishedAt).slice(0, 40) : null,
      publishedBy: rawItem.publishedBy ? String(rawItem.publishedBy).slice(0, 80) : null
    };
  }

  return {ok: true, value: {version: STOCK_DISCOUNT_VERSION, items}};
}

/** Safe read: malformed settings disable discounts rather than applying them. */
export function parseStockDiscounts(raw) {
  const checked = validateStockDiscounts(raw);
  return checked.ok ? checked.value : EMPTY_STOCK_DISCOUNTS;
}

/** Expiry is inclusive of the date shown to the buyer. */
export function stockDiscountIsLive(discount, now = new Date()) {
  if (!discount || !Number.isInteger(Number(discount.percent)) || Number(discount.percent) < STOCK_DISCOUNT_MIN_PERCENT || Number(discount.percent) > STOCK_DISCOUNT_MAX_PERCENT) return false;
  if (!discount.until) return true;
  const end = new Date(`${discount.until}T23:59:59`);
  return Number.isFinite(end.getTime()) && now <= end;
}

/** Find a live discount for one stable stock reference. */
export function stockDiscountFor(discounts, kind, ref, now = new Date()) {
  const parsed = discounts?.items && typeof discounts.items === 'object'
    ? discounts
    : parseStockDiscounts(discounts);
  const key = stockDiscountKey(kind, ref);
  const discount = key ? parsed.items?.[key] : null;
  return stockDiscountIsLive(discount, now) ? discount : null;
}

const endLabel = iso => {
  if (!iso) return null;
  const [year, month, day] = iso.split('-').map(Number);
  return new Date(year, month - 1, day).toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'});
};

function stableHash(text) {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
}

/**
 * A truthful summary for the public PromoBar. It never implies every vehicle or
 * machine is discounted: the actual percentage and price remain on that item's
 * own card/detail page.
 */
export function describeStockDiscounts(discounts, now = new Date()) {
  const parsed = discounts?.items && typeof discounts.items === 'object'
    ? discounts
    : parseStockDiscounts(discounts);
  const active = Object.entries(parsed.items || {})
    .filter(([, value]) => stockDiscountIsLive(value, now));
  if (!active.length) return null;

  const cars = active.filter(([, value]) => value.kind === 'car').length;
  const machines = active.length - cars;
  const kinds = [cars ? 'vehicles' : '', machines ? 'machinery units' : ''].filter(Boolean);
  const percents = [...new Set(active.map(([, value]) => value.percent))];
  const type = kinds.length > 1 ? 'stock' : kinds[0];
  const line = percents.length === 1
    ? `${percents[0]}% off selected ${type}`
    : `Individual discounts on selected ${type}`;
  const untils = [...new Set(active.map(([, value]) => value.until).filter(Boolean))];
  const untilLabel = untils.length === 1 && active.every(([, value]) => value.until === untils[0])
    ? endLabel(untils[0]) : null;
  const target = machines && !cars ? '/machinery' : '/inventory';
  const identity = active.map(([key, value]) => `${key}:${value.percent}:${value.until || ''}`).sort().join('|');

  return {
    id: `stock-discounts-${stableHash(identity)}`,
    line,
    label: percents.length === 1 ? `${percents[0]}% off selected stock` : 'Stock-specific savings',
    percent: percents.length === 1 ? percents[0] : null,
    count: active.length,
    href: target,
    untilLabel,
    note: 'Individual savings appear on each eligible listing. Indicative FOB price; confirmed in your written quotation.'
  };
}
