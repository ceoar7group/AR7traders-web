// Stock links for staff replies — both catalogues.
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
import { machineShareMessage, machineHref } from './machinery-data.js';

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

// ---------------------------------------------------------------------------
//  Machinery — the same job, on the other catalogue.
//
//  A machine has its own URL (/machinery/<type>/<ref>) and its own card
//  (/api/og/m/<ref>), and its price is INDICATIVE FOB by house rule. So the
//  text is machineShareMessage(), which already says "indicative FOB", and the
//  price label is passed in: the desk formats it with the CRM's own currency
//  setting, exactly as the public machine page formats the visitor's.
//
//  Only machines the website publishes are offered, and — unlike a car — a
//  machine without a reference is not offered at all: its type and ref are the
//  URL, so there is nothing honest to link to.
// ---------------------------------------------------------------------------

/** The reference a machine's URL and card are keyed by. */
export const machineRefOf = machine => String(machine?.ref ?? '').trim();

/** Machines the website itself shows, i.e. linkable. */
export const publishedMachines = rows =>
  (Array.isArray(rows) ? rows : []).filter(m => m && m.published !== false && machineRefOf(m));

export function matchMachines(rows, query, limit = 6) {
  const words = String(query || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  const hits = publishedMachines(rows).filter(m => {
    const haystack = [m.ref, m.name, m.brand, m.model, m.type, m.year, m.status, m.location]
      .filter(v => v !== null && v !== undefined && String(v).trim() !== '')
      .join(' ').toLowerCase();
    return words.every(word => haystack.includes(word));
  });
  return hits.slice(0, Math.max(0, limit));
}

/** What a staff member drops into a reply about a machine. `priceLabel` is the
 *  already-formatted price (see the desk's currency setting); an empty label
 *  simply leaves it out — the message never invents one. */
export function machineLinkFor(machine, priceLabel = '', origin = 'https://ar7traders.com') {
  const text = machineShareMessage(machine, priceLabel || '');
  if (!machine || machine.published === false || !machineRefOf(machine)) return text;
  const base = String(origin || '').replace(/\/+$/, '');
  return `${text} ${base}${machineHref(machine)}`;
}

/** Insert a link into whatever the staff member has already typed, without
 *  disturbing it: a blank draft becomes the link, a draft keeps its own line. */
const appendSnippet = (draft, snippet) => {
  const existing = String(draft || '').replace(/\s+$/, '');
  return existing ? `${existing}\n${snippet}` : snippet;
};

export const appendStockLink = (draft, car, origin) =>
  appendSnippet(draft, stockLinkFor(car, origin));

export const appendMachineLink = (draft, machine, priceLabel, origin) =>
  appendSnippet(draft, machineLinkFor(machine, priceLabel, origin));
