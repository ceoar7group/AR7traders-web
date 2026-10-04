// Small, safe read-side for public prices. The staff/API writer imports the
// full validator in stock-discounts.js; this module keeps that heavier editor
// validation out of the first-load bundle while still failing closed.
export const STOCK_DISCOUNT_VERSION = 1;
export const STOCK_DISCOUNT_MIN_PERCENT = 1;
export const STOCK_DISCOUNT_MAX_PERCENT = 60;
export const STOCK_DISCOUNT_MAX_ITEMS = 200;
export const EMPTY_STOCK_DISCOUNTS = Object.freeze({version: 1, items: Object.freeze({})});
const KINDS = new Set(['car', 'machine']);
const REF_SHAPE = /^[A-Z0-9][A-Z0-9._/-]{0,79}$/;
const DATE_SHAPE = /^\d{4}-\d{2}-\d{2}$/;

export function stockDiscountKey(kind, ref) {
  const type = String(kind ?? '').trim().toLowerCase();
  const id = String(ref ?? '').trim().toUpperCase();
  return KINDS.has(type) && REF_SHAPE.test(id) ? `${type}:${id}` : '';
}

function readDate(value) {
  if (value == null || value === '') return null;
  const date = String(value).trim();
  if (!DATE_SHAPE.test(date)) return undefined;
  const parsed = new Date(`${date}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === date ? date : undefined;
}

/** Normalize a public setting; malformed entries disable the setting safely. */
export function parseStockDiscounts(raw) {
  let input = raw;
  if (typeof input === 'string') {
    try { input = JSON.parse(input); } catch { return EMPTY_STOCK_DISCOUNTS; }
  }
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      !input.items || typeof input.items !== 'object' || Array.isArray(input.items)) return EMPTY_STOCK_DISCOUNTS;
  const entries = Object.entries(input.items);
  if (entries.length > STOCK_DISCOUNT_MAX_ITEMS) return EMPTY_STOCK_DISCOUNTS;
  const items = {};
  for (const [supplied, rawItem] of entries) {
    const parts = supplied.match(/^(car|machine):(.+)$/i);
    if (!parts || !rawItem || typeof rawItem !== 'object' || Array.isArray(rawItem)) return EMPTY_STOCK_DISCOUNTS;
    const kind = String(rawItem.kind || parts[1]).trim().toLowerCase();
    const ref = String(rawItem.ref || parts[2]).trim().toUpperCase();
    const key = stockDiscountKey(kind, ref);
    if (!key || key !== `${parts[1].toLowerCase()}:${parts[2].trim().toUpperCase()}` || kind !== parts[1].toLowerCase()) return EMPTY_STOCK_DISCOUNTS;
    const percent = Number(rawItem.percent);
    if (!Number.isInteger(percent) || percent < 1 || percent > 60) return EMPTY_STOCK_DISCOUNTS;
    const until = readDate(rawItem.until);
    if (until === undefined) return EMPTY_STOCK_DISCOUNTS;
    const label = String(rawItem.label ?? '').trim();
    if (label.length > 40) return EMPTY_STOCK_DISCOUNTS;
    items[key] = {kind, ref, percent, label: label || null, until};
  }
  return {version: STOCK_DISCOUNT_VERSION, items};
}

export function stockDiscountIsLive(discount, now = new Date()) {
  const percent = Number(discount?.percent);
  if (!Number.isInteger(percent) || percent < 1 || percent > 60) return false;
  if (!discount.until) return true;
  const end = new Date(`${discount.until}T23:59:59`);
  return Number.isFinite(end.getTime()) && now <= end;
}

export function stockDiscountFor(discounts, kind, ref, now = new Date()) {
  const parsed = discounts?.items && typeof discounts.items === 'object'
    ? discounts : parseStockDiscounts(discounts);
  const key = stockDiscountKey(kind, ref);
  const discount = key ? parsed.items?.[key] : null;
  return stockDiscountIsLive(discount, now) ? discount : null;
}

const stableHash = text => {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i++) hash = Math.imul(hash ^ text.charCodeAt(i), 16777619);
  return (hash >>> 0).toString(36);
};

/** Truthful PromoBar summary: discounts apply to selected refs, never all stock. */
export function describeStockDiscounts(discounts, now = new Date()) {
  const parsed = discounts?.items && typeof discounts.items === 'object' ? discounts : parseStockDiscounts(discounts);
  const active = Object.entries(parsed.items || {}).filter(([, item]) => stockDiscountIsLive(item, now));
  if (!active.length) return null;
  const cars = active.filter(([, item]) => item.kind === 'car').length;
  const machines = active.length - cars;
  const scopes = [cars ? 'vehicles' : '', machines ? 'machinery units' : ''].filter(Boolean);
  const percents = [...new Set(active.map(([, item]) => item.percent))];
  const type = scopes.length > 1 ? 'stock' : scopes[0];
  const line = percents.length === 1 ? `${percents[0]}% off selected ${type}` : `Individual discounts on selected ${type}`;
  const target = machines && !cars ? '/machinery' : '/inventory';
  const identity = active.map(([key, item]) => `${key}:${item.percent}:${item.until || ''}`).sort().join('|');
  return {id: `stock-discounts-${stableHash(identity)}`, line,
    label: percents.length === 1 ? `${percents[0]}% off selected stock` : 'Stock-specific savings',
    percent: percents.length === 1 ? percents[0] : null, count: active.length, href: target,
    note: 'Individual savings appear on each eligible listing. Indicative FOB price; confirmed in your written quotation.'};
}
