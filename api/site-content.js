// Public website content API.
//
// GET  is PUBLIC  — the live website reads its listings/routes/articles here.
// POST/PATCH/DELETE require an authenticated member holding `site.write` —
// Administrator and Manager by default, and changeable from CRM → Team &
// permissions without a redeploy. (This used to be hard-coded to role=admin,
// which contradicted the "Edit the public website" box the grid shows ticked
// for Manager: the box said yes, the API answered 403.)
//
// This is what makes the website editable from the CRM.
import {adminClient, requireUser, send} from './_supabase.js';
import {requirePerm} from './_perm.js';
import {SITE_COLUMNS} from './_columns.js';

// Editing the public website is gated by the `site.write` permission, so the
// Team & permissions grid is the single place that decides who may do it
// (Administrator and Manager by default). Tests inject {db, getUser, permsFor}.
async function assertSiteWrite(profile, injected = {}) {
  if (injected.permsFor) {
    const allowedWrite = profile?.role === 'admin' || !!(await injected.permsFor(profile?.role))['site.write'];
    if (!allowedWrite) throw Object.assign(new Error(`Your role (${profile?.role}) is not allowed to do this`), {status: 403});
    return;
  }
  await requirePerm(profile, 'site.write');
}

// ---------------------------------------------------------------------------
// Vehicle sitemap (GET ?sitemap=vehicles, rewritten from the public URL
// /api/sitemap-vehicles.xml — see vercel.json).
//
// The logic lives IN THIS FILE, inlined for robustness and to stay under the
// Vercel Hobby 12-function cap. History, corrected 2026-09-29:
//
//   • The standalone api/sitemap-vehicles.xml.js file was a 13th function and
//     broke every deploy (preview AND production) with
//     exceeded_serverless_functions_per_deployment. Production stayed on the
//     PR #40 build until the fix in PR #42.
//
//   • During the fix, an attempt to extract the logic into a separate
//     _sitemap-core.js module appeared to 500 at runtime. That diagnosis was
//     wrong — the 500s came from an import line accidentally lost during
//     editing (undefined identifier at request time), not from cross-module
//     interop. Cross-module api imports are proven safe: goonet-stock.js →
//     goonet-sync.js works in production.
//
//   • To keep the deployment at 12 functions and avoid any extra moving parts,
//     the sitemap code is inlined here and dispatched on ?sitemap=vehicles.
//     vercel.json rewrites /api/sitemap-vehicles.xml onto it so the public URL
//     is unchanged.
//
// The two tiny helpers (carRef, hrefFor) are now deduplicated into
// src/sitemap-helpers.js and imported by BOTH src/routing.js and this file.
// The pin in scripts/sitemap-vehicles.test.mjs still guarantees the URLs match.
// ---------------------------------------------------------------------------

import { carRef, hrefFor } from '../src/sitemap-helpers.js';
// Imported dealer cars are mapped by the SAME pure module the public site
// uses, so the sitemap can only ever list a car the site actually shows.
import { mapDealerRows } from '../src/japan-stock-map.js';
export { carRef, hrefFor };

const SITEMAP_BASE = 'https://ar7traders.com';
const SITEMAP_CACHE = 'public, max-age=120, s-maxage=600';
const SITEMAP_MAX_ROWS = 5000;
// Imported dealer cars are capped separately: the public /japan-stock page
// reads at most 300 rows, so the sitemap stays in the same order of magnitude
// while still covering every imported car a visitor can reach.
const SITEMAP_MAX_IMPORTED = 1000;
const SITEMAP_UNAVAILABLE = /sold|delist|private|hidden|archived|removed/i;

/** YYYY-MM-DD for a real timestamp, or null — never a fabricated date. */
export function lastmodOf(value) {
  if (!value) return null;
  const t = Date.parse(String(value));
  if (!Number.isFinite(t)) return null;
  return new Date(t).toISOString().slice(0, 10);
}

/** XML entity escape — defence in depth on top of hrefFor's URL encoding. */
export function esc(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/** Build the urlset from site_listings rows. Pure: filtering, escaping and
 *  lastmod rules live here so the test suite can pin them exactly.
 *
// Lists only public, available, indexable vehicle detail URLs, built from
// `site_listings` — the same published rows the public /inventory page
// actually renders:
//   • published = true  (anonymous GET below already applies this);
//   • status not sold / delisted / private / hidden / archived;
//   • URL = https://ar7traders.com/inventory/<ref> where <ref> follows
//     carRef above — the stock number when present, otherwise the row id.
//
// Corrected 2026-10-01: an earlier version of this comment claimed
// `japan_dealer_stock` cars "have no public AR7 detail page" and were
// deliberately left out. That was wrong — an imported car maps into the same
// `cars` array and opens the same /inventory/<ref> page (see
// src/japan-stock-map.js, and scripts/imported-stock-render.test.jsx which
// asserts the imported car opens its own detail page). The sitemap now lists
// them too, via buildVehicleXml, so live imported inventory is not hidden
// from search engines. */
/** One <url> block for a vehicle detail page. */
function urlEntry(ref, updatedAt) {
  const loc = SITEMAP_BASE + hrefFor('inventory', ref);
  const lastmod = lastmodOf(updatedAt);
  return '  <url>\n' +
    '    <loc>' + esc(loc) + '</loc>' +
    (lastmod ? '\n    <lastmod>' + lastmod + '</lastmod>' : '') +
    '\n  </url>';
}

/** Wrap entry blocks in a complete urlset document. */
function wrapUrlset(entries) {
  return '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    entries.join('\n') +
    (entries.length ? '\n' : '') +
    '</urlset>\n';
}

/** The <url> blocks for `site_listings` rows — AR7's own published stock. */
function listingEntries(rows) {
  const entries = [];
  for (const row of rows || []) {
    if (!row || row.published === false) continue;
    if (row.status != null && SITEMAP_UNAVAILABLE.test(String(row.status))) continue;
    const hasRef = (row.stock_no != null && String(row.stock_no).trim() !== '') || row.id != null;
    if (!hasRef) continue;
    const ref = carRef(row);
    if (!ref || ref === 'undefined' || ref === 'null') continue;
    entries.push(urlEntry(ref, row.updated_at));
  }
  return entries;
}

/** The <url> blocks for `japan_dealer_stock` rows — imported cars.
 *
 *  Imported cars are NOT a second catalogue: once mapped they land in the
 *  same `cars` array and open the same /inventory/<ref> detail page as AR7's
 *  own stock (see src/japan-stock-map.js). That detail page is real and
 *  indexable, so it belongs in the sitemap — leaving it out was hiding live
 *  inventory from search engines.
 *
 *  mapDealerRows already applies exactly the visibility rules the public site
 *  applies (available, not parked, not promoted into site_listings), so this
 *  can only ever emit URLs the site actually serves. A promoted car is
 *  skipped here and listed once from its own site_listings row instead.
 *
 *  lastmod comes from the raw row's updated_at — mapped cars do not carry it,
 *  and a timestamp must never be invented. */
function importedEntries(rows) {
  const raw = Array.isArray(rows) ? rows : [];
  const byGoonet = new Map();
  for (const row of raw) {
    const key = String(row?.goonet_id ?? '');
    if (key) byGoonet.set(key, row);
  }
  const entries = [];
  for (const car of mapDealerRows(raw)) {
    const ref = carRef(car);
    if (!ref || ref === 'undefined' || ref === 'null') continue;
    entries.push(urlEntry(ref, byGoonet.get(String(car.goonet_id))?.updated_at));
  }
  return entries;
}

export function buildXml(rows) {
  return wrapUrlset(listingEntries(rows));
}

/** The sitemap for imported dealer cars on their own (used by the tests). */
export function buildDealerXml(rows) {
  return wrapUrlset(importedEntries(rows));
}

/** Both catalogues in one urlset, de-duplicated by <loc>.
 *  A car that somehow appears in both tables is published once. */
export function buildVehicleXml(listRows, dealerRows) {
  const seen = new Set();
  const entries = [];
  for (const entry of [...listingEntries(listRows), ...importedEntries(dealerRows)]) {
    const loc = entry.match(/<loc>([\s\S]*?)<\/loc>/)?.[1];
    if (loc && seen.has(loc)) continue;
    if (loc) seen.add(loc);
    entries.push(entry);
  }
  return wrapUrlset(entries);
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

/** The sitemap branch: 200 → valid urlset (possibly empty) + minutes-range
 *  cache; database failure → honest non-200, never 200 with malformed XML;
 *  GET only. `injected.db` is a test hook; Vercel always calls (req, res). */
export async function sitemapVehicles(req, res, injected = {}) {
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
      .limit(SITEMAP_MAX_ROWS);
    if (error) throw new Error(error.message || 'database error');

    // Imported dealer cars, listed alongside AR7's own stock. This read is
    // best-effort: an older database without the table must degrade to the
    // site_listings sitemap rather than fail the whole document.
    let imported = [];
    try {
      const { data: dealerRows, error: dealerError } = await db.from('japan_dealer_stock')
        .select('goonet_id,stock_no,available,rotation_state,promoted,updated_at')
        .eq('available', true)
        .order('imported_at', { ascending: false })
        .limit(SITEMAP_MAX_IMPORTED);
      if (dealerError) throw new Error(dealerError.message || 'dealer stock read failed');
      imported = dealerRows || [];
    } catch (e) {
      console.error('sitemap-vehicles: imported dealer stock unavailable:', e);
    }

    return sendXml(res, 200, buildVehicleXml(data || [], imported), SITEMAP_CACHE);
  } catch (e) {
    // Honest failure: non-200, no XML body — a broken database must never
    // look like a valid (empty) sitemap.
    console.error('sitemap-vehicles:', e);
    return sendPlain(res, 503, 'Vehicle sitemap temporarily unavailable');
  }
}

const entities = {
  listings: 'site_listings',
  routes:   'site_routes',
  articles: 'site_articles',
  blocks:   'site_blocks'
};

// Writable columns live in api/_columns.js (shared with api/approvals.js).
const allowed = SITE_COLUMNS;

function clean(entity, body) {
  const out = {};
  for (const k of allowed[entity] || []) if (k in (body || {})) out[k] = body[k];
  return out;
}

export default async function handler(req, res, injected = {}) {
  // ---- Vehicle sitemap dispatch: /api/sitemap-vehicles.xml rewrites here
  // with ?sitemap=vehicles. Kept inside this function so the deployment
  // stays at 12 Serverless Functions (Vercel Hobby cap) — see the block
  // comment above.
  if (String(req.query.sitemap || '') === 'vehicles') {
    return sitemapVehicles(req, res, injected);
  }

  const entity = String(req.query.entity || '');
  const table = entities[entity];
  if (!table) return send(res, 400, {error: 'Unknown entity'});

  const db = injected.db || adminClient();

  // ---- Public read: the live website calls this anonymously.
  if (req.method === 'GET') {
    let q = db.from(table).select('*').order('sort_order', {ascending: true});
    // Anonymous visitors only ever see published rows. site_blocks has no
    // published flag, so it is only reachable with all=1 (admin requests).
    if (req.query.all !== '1' && entity !== 'blocks') q = q.eq('published', true);
    if (entity === 'blocks' && req.query.all !== '1') return send(res, 200, []);
    const {data, error} = await q;
    if (error) return send(res, 500, {error: error.message});
    return send(res, 200, data);
  }

  // ---- Everything below needs the "Edit the public website" permission.
  // requireUser() throws with a status on failure — it does NOT return {ok}.
  let auth;
  try {
    auth = injected.getUser ? await injected.getUser(req) : await requireUser(req);
  } catch (e) {
    return send(res, e.status || 401, {error: e.message || 'Unauthorized'});
  }
  try {
    await assertSiteWrite(auth.profile, injected);
  } catch (e) {
    return send(res, e.status || 403, {error: e.message || 'Not allowed'});
  }

  if (req.method === 'POST') {
    const payload = clean(entity, req.body);
    const {data, error} = await db.from(table).insert(payload).select().single();
    if (error) return send(res, 500, {error: error.message});
    await db.from('activities').insert({
      action: `Created website ${entity.slice(0, -1)}`,
      actor: auth.user.email, entity_type: 'site_' + entity, entity_id: data.id
    });
    return send(res, 200, data);
  }

  if (req.method === 'PATCH') {
    if (!req.body?.id) return send(res, 400, {error: 'Missing id'});
    const payload = {...clean(entity, req.body), updated_at: new Date().toISOString()};
    const {data, error} = await db.from(table).update(payload).eq('id', req.body.id).select().single();
    if (error) return send(res, 500, {error: error.message});
    await db.from('activities').insert({
      action: `Updated website ${entity.slice(0, -1)}`,
      actor: auth.user.email, entity_type: 'site_' + entity, entity_id: data.id
    });
    return send(res, 200, data);
  }

  if (req.method === 'DELETE') {
    const id = req.query.id;
    if (!id) return send(res, 400, {error: 'Missing id'});
    const {error} = await db.from(table).delete().eq('id', id);
    if (error) return send(res, 500, {error: error.message});
    // Unlike api/crm.js, deletions ARE audited here.
    await db.from('activities').insert({
      action: `Deleted website ${entity.slice(0, -1)}`,
      actor: auth.user.email, entity_type: 'site_' + entity, entity_id: id
    });
    return send(res, 200, {ok: true});
  }

  return send(res, 405, {error: 'Method not allowed'});
}
