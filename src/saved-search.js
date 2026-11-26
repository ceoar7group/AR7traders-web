// Saved searches & stock alerts — the criteria language.
//
// A saved search is a snapshot of the inventory filters a buyer had on screen:
//   { q, make, model, body, fuel, tr, steer, price_min, price_max, year_min, km_max }
// Every field is optional; null/absent means "any". The SAME matcher runs in
// the browser (account page, save-search panel) and on the server (the nightly
// alert sweep in api/my-account.js), so "a new matching car" means exactly one
// thing everywhere.
//
// Pure module: no DOM, no network — unit-tested by scripts/saved-searches.test.mjs.

const CRITERIA_KEYS = ['q','make','model','body','fuel','tr','steer',
                       'price_min','price_max','year_min','km_max'];

const str = v => {
  const s = String(v ?? '').trim();
  return s === '' ? null : s.slice(0, 80);
};
const num = v => {
  const n = Number(String(v ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};

/** Parse "$38,700" / 38700 / "38,700 km" into a number (0 when unknown). */
export function moneyNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const n = Number(String(value ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Clean an untrusted criteria object down to the known shape. */
export function normalizeCriteria(raw) {
  const c = raw && typeof raw === 'object' ? raw : {};
  const out = {
    q:     str(c.q),
    make:  str(c.make),
    model: str(c.model),
    body:  str(c.body),
    fuel:  str(c.fuel),
    tr:    str(c.tr),
    steer: str(c.steer),
    price_min: num(c.price_min),
    price_max: num(c.price_max),
    year_min:  num(c.year_min),
    km_max:    num(c.km_max)
  };
  // "Any" placeholders from the filter dropdowns mean no constraint.
  for (const k of ['make','model','body','fuel','tr','steer']) {
    if (out[k] && /^(all|any)$/i.test(out[k])) out[k] = null;
  }
  return out;
}

export function criteriaIsEmpty(c) {
  const n = normalizeCriteria(c);
  return CRITERIA_KEYS.every(k => n[k] == null);
}

/** Does one car (site shape) satisfy the criteria? */
export function matchesCriteria(car, criteria) {
  if (!car) return false;
  const c = normalizeCriteria(criteria);
  const eq = (a, b) => String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
  if (c.make  && !eq(car.make,  c.make))  return false;
  if (c.model && !eq(car.model, c.model)) return false;
  if (c.body  && !eq(car.body,  c.body))  return false;
  if (c.fuel  && !eq(car.fuel,  c.fuel))  return false;
  if (c.tr    && !eq(car.tr,    c.tr))    return false;
  if (c.steer && !eq(car.st,    c.steer)) return false;
  if (c.q) {
    const hay = [car.make, car.model, car.location, car.stock_no, car.year]
      .map(v => String(v ?? '')).join(' ').toLowerCase();
    if (!hay.includes(c.q.toLowerCase())) return false;
  }
  const price = moneyNumber(car.price);
  if (c.price_min != null && !(price >= c.price_min)) return false;
  if (c.price_max != null && !(price > 0 && price < c.price_max)) return false;
  if (c.year_min != null && !(Number(car.year) >= c.year_min)) return false;
  if (c.km_max != null) {
    const km = moneyNumber(car.km);
    if (!(km <= c.km_max)) return false;
  }
  return true;
}

const money = n => '$' + Math.round(n).toLocaleString('en-US');

/** Human chips for a criteria object — ['Toyota', 'Under $20,000', '2020+']. */
export function describeCriteria(criteria) {
  const c = normalizeCriteria(criteria);
  const chips = [];
  if (c.make)  chips.push(c.make + (c.model ? ' ' + c.model : ''));
  else if (c.model) chips.push(c.model);
  if (c.q)     chips.push('“' + c.q + '”');
  if (c.body)  chips.push(c.body);
  if (c.fuel)  chips.push(c.fuel);
  if (c.tr)    chips.push(c.tr);
  if (c.steer) chips.push(c.steer);
  if (c.price_min != null && c.price_max != null) chips.push(money(c.price_min) + ' – ' + money(c.price_max));
  else if (c.price_max != null) chips.push('Under ' + money(c.price_max));
  else if (c.price_min != null) chips.push(money(c.price_min) + '+');
  if (c.year_min != null) chips.push(c.year_min + '+');
  if (c.km_max != null)   chips.push('≤ ' + Math.round(c.km_max).toLocaleString('en-US') + ' km');
  return chips.length ? chips : ['All stock'];
}

/** A default name for a saved search — "Toyota Land Cruiser · 2020+". */
export function defaultSearchName(criteria) {
  return describeCriteria(criteria).slice(0, 3).join(' · ').slice(0, 60);
}

/** The inventory URL that best replays this search. Only make/model are
 *  URL-driven (src/routing.js inventoryHref); the rest of the facets are a
 *  refinement the visitor re-applies on the page. */
export function criteriaHref(criteria, inventoryHref) {
  const c = normalizeCriteria(criteria);
  if (typeof inventoryHref === 'function') return inventoryHref(c.make, c.model);
  return '/inventory';
}
