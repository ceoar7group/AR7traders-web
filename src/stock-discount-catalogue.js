// One public-price catalogue for the CRM's per-stock discount picker.
// Static fallback rows and API-hydrated rows share the same key and eligibility
// rules; no live HTTP is needed to test the aggregation.
import {MACHINES, listPriceUSD} from './machinery-data.js';
import {stockDiscountKey} from './stock-discounts.js';
import {carRef} from './sitemap-helpers.js';

export function readStockPrice(row) {
  const raw = row?.price_usd ?? row?.priceUSD ?? row?.list_price_usd ?? row?.price;
  if (typeof raw === 'number') return Number.isFinite(raw) && raw > 0 ? raw : 0;
  const amount = Number(String(raw ?? '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : 0;
}

const unavailable = row => row?.available === false || row?.published === false ||
  /sold|delivered|unavailable|not available|out of stock|withdrawn|archived|delisted/i.test(String(row?.status || ''));

export function buildDiscountStockRows(rows = {}, seed = {}) {
  const byKey = new Map();
  const sourceCars = [
    ...(seed?.listings || []), ...(seed?.vehicles || []), ...(seed?.goonet || []),
    ...(rows?.listings || []), ...(rows?.vehicles || []), ...(rows?.goonet || [])
  ];
  for (const car of sourceCars) {
    if (!car) continue;
    const ref = String(car.stock_no || (car.id != null ? carRef(car) : car.goonet_id || '')).trim();
    const key = stockDiscountKey('car', ref);
    if (!key) continue;
    if (unavailable(car)) { byKey.delete(key); continue; }
    const price = readStockPrice(car);
    if (!price) { byKey.delete(key); continue; }
    byKey.set(key, {key, kind: 'car', ref: ref.toUpperCase(),
      name: `${car.make || ''} ${car.model || ''}`.trim() || ref,
      category: 'Vehicle', price, detail: car.year ? String(car.year) : car.location || ''});
  }
  for (const machine of [...MACHINES, ...(rows?.machinery || [])]) {
    if (!machine) continue;
    const ref = String(machine.ref || machine.id || '').trim();
    const key = stockDiscountKey('machine', ref);
    if (!key) continue;
    if (unavailable(machine)) { byKey.delete(key); continue; }
    const price = readStockPrice(machine) || listPriceUSD(machine);
    if (!price) { byKey.delete(key); continue; }
    byKey.set(key, {key, kind: 'machine', ref: ref.toUpperCase(),
      name: machine.name || ref, category: machine.type || 'Machinery',
      price, detail: machine.brand || machine.origin || ''});
  }
  return [...byKey.values()].sort((a, b) => a.kind.localeCompare(b.kind) || a.name.localeCompare(b.name));
}
