// Stock links for staff replies.
//
// The public pages and the CRM must send the same thing about a car: the page's
// own forward text plus the listing URL, which WhatsApp turns into the 1200×630
// share card (api/_og-card.js) because api/_wa.js sends with preview_url: true.
//
// The two rules this module exists to keep:
//   1. only a PUBLISHED listing is offered — a link to a sold or draft car is an
//      apology waiting to happen;
//   2. the reference is the one the URL actually uses (stock_no, else the same
//      row-id fallback the public site derives), so the card and the page can
//      never disagree about which car was meant.
//
// Pure and framework-free so the picker in src/crm.jsx stays a thin list.
import { vehicleShareLink, vehicleShareMessage } from './vehicle-actions.jsx';

/** The public reference for a listing — identical to the site's own rule. */
export const stockRefOf = car => {
  if (!car) return null;
  const label = String(car.stock_no ?? '').trim();
  return label || ('AR7-' + (26000 + car.id));
};

/** Rows the website itself would show. */
export const publishedStock = rows =>
  (Array.isArray(rows) ? rows : []).filter(car => car && car.published !== false);

/** The picker's search: every word must appear somewhere in the car's own
 *  fields, so "toyota 2019" finds a 2019 Toyota and an empty query lists the
 *  newest-published rows it was given. */
export function matchStock(rows, query, limit = 8) {
  const words = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hits = publishedStock(rows).filter(car => {
    const haystack = [car.stock_no, car.make, car.model, car.year, car.status, car.body]
      .filter(v => v !== null && v !== undefined && String(v).trim() !== '')
      .join(' ').toLowerCase();
    return words.every(word => haystack.includes(word));
  });
  return hits.slice(0, Math.max(0, limit));
}

/** The message a staff member drops into a WhatsApp reply: the page's own
 *  forward text plus the absolute listing URL. */
export function stockLinkFor(car, origin = 'https://ar7traders.com') {
  const ref = stockRefOf(car);
  // A draft must never travel as a link, even if a caller gets one this far.
  if (car && car.published === false) return vehicleShareMessage(car, ref);
  return vehicleShareLink(car, ref, origin);
}

/** Insert a link into whatever the staff member has already typed, without
 *  disturbing it: a blank draft becomes the link, a draft keeps its own line. */
export function appendStockLink(draft, car, origin) {
  const snippet = stockLinkFor(car, origin);
  const existing = String(draft || '').replace(/\s+$/, '');
  return existing ? `${existing}\n${snippet}` : snippet;
}
