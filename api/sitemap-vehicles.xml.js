// Dynamic vehicle sitemap — served at /api/sitemap-vehicles.xml
//
// Lists only public, available, indexable vehicle detail URLs, built from
// `site_listings` — the same published rows the public /inventory page
// actually renders:
//   • published = true  (anonymous /api/site-content already applies this);
//   • status not sold / delisted / private / hidden / archived;
//   • URL = https://ar7traders.com/inventory/<ref> where <ref> follows
//     `carRef` in src/routing.js — the stock number when present, otherwise
//     the row id.
//
// `japan_dealer_stock` cars are deliberately NOT listed: those cars have no
// public AR7 detail page (they render on /japan-stock and link out to the
// original goo-net listing). A goo-net car promoted into `site_listings`
// does appear, because promotion creates a published row with a detail page.
//
// Contract:
//   • 200 → a valid urlset (possibly empty) + Cache-Control in the minutes
//     range, like /api/goonet-stock;
//   • database failure → honest non-200, never 200 with malformed XML;
//   • <lastmod> emitted only when the row carries a real, parseable
//     updated_at timestamp.
//
// `injected` ({db}) is a test hook; Vercel always calls (req, res).
import { adminClient } from './_supabase.js';
import { carRef, hrefFor } from '../src/routing.js';

export const BASE = 'https://ar7traders.com';
const CACHE = 'public, max-age=120, s-maxage=600';
const MAX_ROWS = 5000;

// Statuses that mean the car is no longer publicly available. Applied to the
// rendered status text, case-insensitively.
const UNAVAILABLE = /sold|delist|private|hidden|archived|removed/i;

/** XML entity escape — defence in depth on top of hrefFor's URL encoding. */
export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** YYYY-MM-DD for a real timestamp, or null — never a fabricated date. */
export function lastmodOf(value) {
  if (!value) return null;
  const t = Date.parse(String(value));
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

/** Build the urlset from site_listings rows. Pure: filtering, escaping and
 *  lastmod rules live here so the test suite can pin them exactly. */
export function buildXml(rows) {
  const entries = [];
  for (const row of rows || []) {
    if (!row || row.published === false) continue;
    if (row.status != null && UNAVAILABLE.test(String(row.status))) continue;
    const hasRef = (row.stock_no != null && String(row.stock_no).trim() !== '') || row.id != null;
    if (!hasRef) continue;
    const ref = carRef(row);
    if (!ref || ref === 'undefined' || ref === 'null') continue;
    const loc = BASE + hrefFor('inventory', ref);
    const lastmod = lastmodOf(row.updated_at);
    entries.push(
      '  <url>\n' +
      '    <loc>' + esc(loc) + '</loc>' +
      (lastmod ? '\n    <lastmod>' + lastmod + '</lastmod>' : '') +
      '\n  </url>'
    );
  }
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.join('\n') +
    (entries.length ? '\n' : '') +
    '</urlset>\n';
}

function sendXml(res, status, body, cache) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/xml; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.end(body);
}

function sendPlain(res, status, body) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(body);
}

export default async function handler(req, res, injected = {}) {
  const method = req.method || 'GET';
  if (method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendPlain(res, 405, 'Method not allowed');
  }
  try {
    const db = injected.db || adminClient();
    const { data, error } = await db.from('site_listings')
      .select('id,stock_no,status,published,updated_at,sort_order')
      .eq('published', true)
      .order('sort_order', { ascending: true })
      .limit(MAX_ROWS);
    if (error) throw new Error(error.message || 'database error');
    return sendXml(res, 200, buildXml(data || []), CACHE);
  } catch (e) {
    // Honest failure: non-200, no XML body — a broken database must never
    // look like a valid (empty) sitemap.
    console.error('sitemap-vehicles:', e);
    return sendPlain(res, 503, 'Vehicle sitemap temporarily unavailable');
  }
}
