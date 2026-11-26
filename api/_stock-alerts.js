// Saved-search stock alerts — the server half.
//
// Reads live stock the same way the website does (published site_listings +
// imported japan_dealer_stock through mapDealerRows), runs the shared matcher
// from src/saved-search.js over every saved search, and e-mails each buyer a
// digest of the cars that are NEW since their search last looked.
//
// "New" is a set difference, not a date guess: every search carries seen_refs,
// the stock references it has already been shown (seeded at save time). A car
// alerts once, ever, per search — a price edit or re-import can't re-ping.
//
// This is NOT a Vercel function (underscore prefix): it is dispatched through
// api/my-account.js (?alerts=run), because the project sits at the Hobby
// plan's 12-function limit (scripts/function-count.test.mjs guards it).
//
// Unit-tested by scripts/saved-searches.test.mjs via the injected hooks.

import { mapDealerRows } from '../src/japan-stock-map.js';
import { normalizeCriteria, matchesCriteria, describeCriteria } from '../src/saved-search.js';

const SITE = 'https://ar7traders.com';
export const MAX_SEEN_REFS = 800;   // per search — oldest trimmed first
export const MAX_EMAIL_CARS = 6;    // a digest, not a catalogue

/** Stable public reference for a car (the /inventory/<ref> URL segment). */
export function stockRef(car) {
  const ref = String(car?.stock_no ?? car?.id ?? '').trim();
  return ref || null;
}

/** Current public stock in the site's car shape. Never throws on a missing
 *  dealer table — an older database degrades to site_listings alone. */
export async function loadPublicStock(db) {
  const { data: listings, error } = await db.from('site_listings')
    .select('*').eq('published', true);
  if (error) throw new Error('site_listings read failed: ' + error.message);
  const cars = (listings || []).slice();
  try {
    const { data: dealer, error: dealerErr } = await db.from('japan_dealer_stock')
      .select('*').eq('available', true);
    if (dealerErr) throw new Error(dealerErr.message);
    cars.push(...mapDealerRows(dealer || []));
  } catch (e) {
    console.error('stock-alerts: dealer stock unavailable:', e.message);
  }
  return cars;
}

/** One search against the stock → { matchRefs, newRefs, newCars }. */
export function evaluateSearch(search, stock) {
  const criteria = normalizeCriteria(search?.criteria);
  const seen = new Set(Array.isArray(search?.seen_refs) ? search.seen_refs.map(String) : []);
  const matchRefs = [], newRefs = [], newCars = [];
  for (const car of Array.isArray(stock) ? stock : []) {
    const ref = stockRef(car);
    if (!ref || !matchesCriteria(car, criteria)) continue;
    matchRefs.push(ref);
    if (!seen.has(ref)) { newRefs.push(ref); newCars.push(car); }
  }
  return { matchRefs, newRefs, newCars };
}

/** seen_refs after a sweep/ack: everything previously seen plus the current
 *  matches, trimmed from the front so the set cannot grow without bound. */
export function nextSeenRefs(search, matchRefs) {
  const seen = Array.isArray(search?.seen_refs) ? search.seen_refs.map(String) : [];
  const merged = [...new Set([...seen, ...matchRefs.map(String)])];
  return merged.slice(Math.max(0, merged.length - MAX_SEEN_REFS));
}

const esc = s => String(s ?? '').replace(/[&<>"]/g,
  ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

/** The digest e-mail for one search. Exported for tests. */
export function alertEmail(search, newCars) {
  const chips = describeCriteria(search?.criteria).join(' · ');
  const name = String(search?.name || '').trim() || chips;
  const shown = newCars.slice(0, MAX_EMAIL_CARS);
  const more = newCars.length - shown.length;
  const line = c => {
    const title = [c.year, c.make, c.model].filter(Boolean).join(' ');
    const bits = [c.price, c.km ? String(c.km).replace(/\s*km$/i, '') + ' km' : null]
      .filter(Boolean).join(' · ');
    return { title, bits, url: SITE + '/inventory/' + encodeURIComponent(stockRef(c)) };
  };
  const rows = shown.map(line);
  const subject = newCars.length === 1
    ? 'New in stock: ' + rows[0].title
    : newCars.length + ' new cars match your search “' + name + '”';
  const text = [
    'Good news — new stock in Japan matches your saved search “' + name + '” (' + chips + '):',
    '',
    ...rows.map(r => '• ' + r.title + (r.bits ? ' — ' + r.bits : '') + '\n  ' + r.url),
    more > 0 ? '…and ' + more + ' more.' : null,
    '',
    'See every match and manage your alerts in your AR7 account:',
    SITE + '/account',
    '',
    'You get this because you saved a stock alert on ar7traders.com. Turn it off any time from your account.'
  ].filter(v => v !== null).join('\n');
  const html =
    '<div style="font-family:Arial,sans-serif;max-width:560px">' +
    '<p>Good news — new stock in Japan matches your saved search <b>“' + esc(name) + '”</b> <span style="color:#777">(' + esc(chips) + ')</span>:</p>' +
    rows.map(r =>
      '<p style="margin:10px 0"><a href="' + esc(r.url) + '" style="font-weight:bold;color:#0b5c3e">' + esc(r.title) + '</a>' +
      (r.bits ? '<br><span style="color:#555">' + esc(r.bits) + '</span>' : '') + '</p>').join('') +
    (more > 0 ? '<p>…and ' + more + ' more.</p>' : '') +
    '<p><a href="' + SITE + '/account" style="color:#0b5c3e">See every match and manage your alerts →</a></p>' +
    '<p style="color:#999;font-size:12px">You get this because you saved a stock alert on ar7traders.com. Turn it off any time from your account.</p>' +
    '</div>';
  return { subject, text, html };
}

/** Send one e-mail through Resend (same pattern as api/leads.js). */
export async function sendAlertEmail(to, { subject, text, html }) {
  const key = String(process.env.RESEND_API_KEY || '').trim();
  if (!key || !to) return 'not-configured';
  const from = String(process.env.LEAD_FROM || '').trim() || 'AR7 Traders <onboarding@resend.dev>';
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + key },
      body: JSON.stringify({ from, to, subject, text, html }),
      signal: controller.signal
    });
    if (!response.ok) { console.error('stock alert e-mail failed', { code: 'HTTP_' + response.status }); return 'failed'; }
    return 'sent';
  } catch (error) {
    console.error('stock alert e-mail failed', { code: error?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK' });
    return 'failed';
  } finally { clearTimeout(timer); }
}

/**
 * The nightly sweep: evaluate every saved search, e-mail the owners whose
 * searches gained new matches, and persist the updated seen_refs so each car
 * alerts once. Hooks (`stock`, `emailFn`, `now`) are test seams.
 */
export async function runAlertSweep(db, { stock, emailFn, now } = {}) {
  const at = (now || new Date()).toISOString();
  const cars = stock || await loadPublicStock(db);
  const { data: searches, error } = await db.from('saved_searches').select('*');
  if (error) throw new Error('saved_searches read failed: ' + error.message);
  const sendFn = emailFn || sendAlertEmail;
  let emailed = 0, matchedSearches = 0;
  for (const search of searches || []) {
    const { matchRefs, newRefs, newCars } = evaluateSearch(search, cars);
    const patch = { last_checked_at: at, updated_at: at };
    if (newRefs.length) {
      matchedSearches++;
      patch.seen_refs = nextSeenRefs(search, matchRefs);
      if (search.email_alerts && search.email) {
        const outcome = await sendFn(search.email, alertEmail(search, newCars));
        if (outcome === 'sent') { emailed++; patch.last_notified_at = at; }
      }
    }
    const { error: upErr } = await db.from('saved_searches').update(patch).eq('id', search.id);
    if (upErr) console.error('stock-alerts: update failed for', search.id, upErr.message);
  }
  return { checked: (searches || []).length, stock: cars.length, matched: matchedSearches, emailed };
}
