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
import {NEWS, articleSlug} from '../src/news-data.js';

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

import { carRef, hrefFor, carLandingPath, slugify, machinePath, machineTypePath } from '../src/sitemap-helpers.js';
// Imported dealer cars are mapped by the SAME pure module the public site
// uses, so the sitemap can only ever list a car the site actually shows.
import { mapDealerRows } from '../src/japan-stock-map.js';
export { carRef, hrefFor };

// Machinery lives in api/_machinery.js — a shared module, so it costs no
// Serverless Function against the Vercel Hobby cap of 12. Only the dispatch
// below is added here.
import {
  listMachines, createMachine, updateMachine, setPublished, deleteMachine,
  MACHINERY_TABLE, purgeStale, toPublic
} from './_machinery.js';
// The import agent: another shared module, so the machinery desk, the paste-a
// -link box and the nightly job all cost zero extra functions.
import {
  MAX_IMPORT_BATCH, previewMachine, toRow, planImport, applyImport, markStale
} from './_machinery-import.js';
// The category scraper: same pattern — a shared module, dispatched below on
// step=scraper, previews only (the confirm step does the writing).
import { runScraper } from './_machinery-scraper.js';
// Search Console and IndexNow share this function, preserving the 12-function
// Vercel limit. The workflow is staff-only and records submissions in activities.
import { handleSeoWorkflow } from './_seo-workflows.js';
export { machinePath, machineTypePath };

// The public read and the vehicle sitemap are quick, but the paste-a-link
// import shares this function and fetches a supplier page over the network,
// so it needs the same 60s allowance api/goonet-sync.js already uses.
export const config = { maxDuration: 60 };

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

/**
 * Landing-page URLs derived from live stock: one `/cars/<make>` per brand and
 * one `/cars/<make>/<model>` per model actually listed.
 *
 * 2026-10-03 (SEO): this is the BeForward model — a crawlable page per make
 * and per model instead of a filter behind a query string. Building them from
 * the same rows as the detail pages means the sitemap can never advertise a
 * brand or model the site has no page for, and each page carries the newest
 * updated_at in its group as lastmod (never an invented date).
 */
function landingEntries(listRows, dealerRows = []) {
  const groups = new Map();
  const collect = (make, model, updatedAt) => {
    const m = slugify(make);
    if (!m) return;
    const touch = (key, path) => {
      const prev = groups.get(key);
      const stamp = lastmodOf(updatedAt);
      groups.set(key, {
        path,
        lastmod: prev && prev.lastmod && stamp ? (prev.lastmod > stamp ? prev.lastmod : stamp) : (prev?.lastmod || stamp)
      });
    };
    touch('m:' + m, carLandingPath(make));
    const mo = slugify(model);
    if (mo) touch('x:' + m + '/' + mo, carLandingPath(make, model));
  };

  for (const row of listRows || []) {
    if (!row || row.published === false) continue;
    if (row.status != null && SITEMAP_UNAVAILABLE.test(String(row.status))) continue;
    collect(row.make, row.model, row.updated_at);
  }
  // Imported cars go through exactly the same visibility rules as their detail
  // pages (mapDealerRows drops delisted and parked rows), so a landing page can
  // never be advertised for stock the public page would refuse to show.
  const raw = Array.isArray(dealerRows) ? dealerRows : [];
  const byGoonet = new Map();
  for (const row of raw) {
    const key = String(row?.goonet_id ?? '');
    if (key) byGoonet.set(key, row);
  }
  for (const car of mapDealerRows(raw)) {
    collect(car.make, car.model, byGoonet.get(String(car.goonet_id))?.updated_at);
  }

  const entries = [];
  for (const { path, lastmod } of groups.values()) {
    entries.push('  <url>\n' +
      '    <loc>' + esc(SITEMAP_BASE + path) + '</loc>' +
      (lastmod ? '\n    <lastmod>' + lastmod + '</lastmod>' : '') +
      '\n  </url>');
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
  // Landing pages come first: they are the pages that are supposed to rank,
  // and a sitemap reader weights early entries higher.
  for (const entry of landingEntries(listRows, dealerRows)) {
    const loc = entry.match(/<loc>([\s\S]*?)<\/loc>/)?.[1];
    if (loc && seen.has(loc)) continue;
    if (loc) seen.add(loc);
    entries.push(entry);
  }
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
      .select('id,stock_no,make,model,status,published,updated_at,sort_order')
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
        .select('goonet_id,stock_no,make,model,available,rotation_state,promoted,updated_at')
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

/** Published built-in and CRM-authored guides, deduplicated by canonical slug. */
export function buildNewsXml(rows = []) {
  const bySlug = new Map();
  for (const article of NEWS) {
    const slug = articleSlug(article.title);
    if (slug) bySlug.set(slug, {slug, updatedAt: null});
  }
  for (const row of Array.isArray(rows) ? rows : []) {
    if (!row || row.published === false) continue;
    const slug = articleSlug(row.title);
    if (!slug) continue;
    bySlug.set(slug, {slug, updatedAt: row.updated_at || row.created_at || null});
  }
  const entries = [...bySlug.values()].map(({slug, updatedAt}) =>
    urlEntryLoc(`${SITEMAP_BASE}/news/${encodeURIComponent(slug)}`, updatedAt));
  return wrapUrlset(entries);
}

/** Dynamic news sitemap dispatched through this existing function (no new
 * Vercel function). */
export async function sitemapNews(req, res, injected = {}) {
  if ((req.method || 'GET') !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendPlain(res, 405, 'Method not allowed');
  }
  try {
    const db = injected.db || adminClient();
    const {data, error} = await db.from('site_articles')
      .select('title,published,updated_at,sort_order')
      .eq('published', true).order('sort_order', {ascending: true}).limit(500);
    if (error) throw new Error(error.message || 'article read failed');
    return sendXml(res, 200, buildNewsXml(data || []), SITEMAP_CACHE);
  } catch (error) {
    // Built-in guides remain routable/indexable if the database is briefly
    // unavailable; dynamic articles return on the next successful read.
    console.error('sitemap-news:', error);
    return sendXml(res, 200, buildNewsXml([]), SITEMAP_CACHE);
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

// ---------------------------------------------------------------------------
// Machinery sitemap — GET ?sitemap=machinery, rewritten from the public URL
// /api/sitemap-machinery.xml (see vercel.json).
//
// It lives here, inlined and dispatched on a query param, for exactly the
// reason the vehicle sitemap does: a standalone api/sitemap-machinery.xml.js
// would be a 13th Serverless Function and fail every deploy with
// exceeded_serverless_functions_per_deployment. The owner asked for
// machinery to have its own sitemap rather than being folded into the car
// one, and this is how that happens without breaking the cap.
// ---------------------------------------------------------------------------

/** One <url> block for an already-absolute URL. urlEntry() is car-specific. */
function urlEntryLoc(loc, updatedAt) {
  const lastmod = lastmodOf(updatedAt);
  return '  <url>\n' +
    '    <loc>' + esc(loc) + '</loc>' +
    (lastmod ? '\n    <lastmod>' + lastmod + '</lastmod>' : '') +
    '\n  </url>';
}

/**
 * Published machines only: every /machinery/<type> catalogue page plus every
 * /machinery/<type>/<REF> detail page. An empty list is valid — the site
 * falls back to src/machinery-data.js until the first machine is published.
 *
 * The paths come from machineTypePath()/machinePath() in
 * src/sitemap-helpers.js, the same helpers src/routing.js uses, so this
 * sitemap can only ever advertise a path the SPA actually serves.
 */
export function buildMachineryXml(machines = []) {
  const seen = new Set();
  const entries = [];
  for (const m of machines || []) {
    if (!m?.type) continue;
    const catalogue = SITEMAP_BASE + machineTypePath(m.type);
    if (!seen.has(catalogue)) { seen.add(catalogue); entries.push(urlEntryLoc(catalogue, m.updated_at)); }
    const detail = SITEMAP_BASE + machinePath(m.type, m.ref);
    if (!seen.has(detail)) { seen.add(detail); entries.push(urlEntryLoc(detail, m.updated_at)); }
  }
  return wrapUrlset(entries);
}

export async function sitemapMachinery(req, res, injected = {}) {
  try {
    const db = injected.db || adminClient();
    // Published rows only. listMachines() maps through toPublic(), which has
    // already dropped every photo without a rights basis, so this never
    // advertises a page whose imagery we are not entitled to show.
    const machines = await listMachines(db, { publishedOnly: true });
    res.status(200);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader('Cache-Control', SITEMAP_CACHE);
    res.end(buildMachineryXml(machines));
  } catch (e) {
    console.error('sitemap-machinery:', e);
    return sendPlain(res, 503, 'Machinery sitemap temporarily unavailable');
  }
}

function clean(entity, body) {
  const out = {};
  for (const k of allowed[entity] || []) if (k in (body || {})) out[k] = body[k];
  return out;
}

/**
 * The machinery desk. Reads are public (the live site asks for published
 * machines anonymously); every write needs `site.write`, the same permission
 * that gates listings, routes and articles — machinery is website content, so
 * the Team & permissions grid stays the single place that decides who may
 * edit it.
 */
async function machineryDispatch(req, res, action, injected = {}) {
  const db = injected.db || adminClient();
  const sendErr = e => send(res, e.status || 500, {
    error: e.message || 'Machinery request failed',
    details: e.details
  });

  // ---- Public read. Anonymous visitors only ever see published rows, and
  // listMachines() has already stripped any photo without a rights basis.
  if (action === 'list' && req.method === 'GET' && req.query.all !== '1') {
    try {
      return send(res, 200, await listMachines(db, {
        publishedOnly: true,
        type: req.query.type ? String(req.query.type) : null
      }));
    } catch (e) { return sendErr(e); }
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

  const id = req.body?.id || req.query.id;
  try {
    if (action === 'list' && req.method === 'GET')
      return send(res, 200, await listMachines(db, {publishedOnly: false}));
    if (action === 'create' && req.method === 'POST')
      return send(res, 201, await createMachine(db, req.body, auth.profile));
    if (action === 'update' && req.method === 'PATCH')
      return send(res, 200, await updateMachine(db, id, req.body, auth.profile));
    if (action === 'delete' && req.method === 'DELETE')
      return send(res, 200, await deleteMachine(db, id, auth.profile));
    if (action === 'publish')
      return send(res, 200, await setPublished(db, id, true, auth.profile, {reason: 'published from the CRM'}));
    if (action === 'unpublish')
      return send(res, 200, await setPublished(db, id, false, auth.profile, {reason: 'unpublished from the CRM'}));
    if (action === 'archive')
      return send(res, 200, await setPublished(db, id, false, auth.profile,
        {archive: true, reason: 'archived from the CRM'}));
    // 2026-10-08: the deliberate end of the staleness path. step=stale only
    // flags; this archives (default) or deletes rows a person has already
    // unpublished and whose source has been gone for N days. Same site.write
    // gate as every other write on this desk.
    if (action === 'purge-stale' && req.method === 'POST')
      return send(res, 200, await purgeStale(db, {
        olderThanDays: req.body?.olderThanDays,
        remove: req.body?.remove === true,
        actor: auth.profile
      }));
  } catch (e) { return sendErr(e); }

  return send(res, 400, {error: `Unknown machinery action: ${action}`});
}

/**
 * The machinery import agent.
 *
 * Three steps, and the read/write split is deliberately absolute:
 *
 *   step=preview  reads a supplier link and RETURNS a candidate. It writes
 *                 nothing — not a row, not an activity, not a log line. The
 *                 operator sees the machine before it exists.
 *   step=scraper  crawls the Made-in-China category pages (robots.txt first,
 *                 1s between fetches, max six machines) and returns previews
 *                 through the same pipeline. It writes nothing either.
 *   step=confirm  writes what the operator approved.
 *
 * All three need `site.write`. An import is the one action that puts rows on
 * the website nobody typed, from a source we do not control.
 */
async function importDispatch(req, res, injected = {}) {
  const db = injected.db || adminClient();
  const step = String(req.query.step || req.body?.step || '').toLowerCase();
  const sendErr = e => send(res, e.status || 500, {
    error: e.message || 'Machinery import failed',
    details: e.details
  });

  // requireUser() throws with a status on failure — it does NOT return {ok}.
  let auth;
  try {
    auth = injected.getUser ? await injected.getUser(req) : await requireUser(req);
  } catch (e) {
    return send(res, e.status || 401, { error: e.message || 'Unauthorized' });
  }
  try {
    await assertSiteWrite(auth.profile, injected);
  } catch (e) {
    return send(res, e.status || 403, { error: e.message || 'Not allowed' });
  }

  const body = req.body || {};

  try {
    // ---- PREVIEW: read only -------------------------------------------------
    if (step === 'preview') {
      const url = String(body.url || '').trim();
      if (!url) return send(res, 400, { error: 'Paste a supplier link first' });
      if (!/^https?:\/\//i.test(url)) return send(res, 400, { error: 'That is not a web address — it should start with http:// or https://' });

      // `html` is forwarded when the caller already has the page — the
      // scheduled job fetches it once and reuses it. Without it the adapter
      // fetches the link itself. Forgetting to forward it meant every preview
      // hit the network even when the page was in hand.
      const result = await previewMachine({
        url,
        html: body.html || null,
        rights: body.rights || null,
        adapter: body.adapter || null
      });
      if (!result.ok) return send(res, 422, { error: result.error, warnings: result.warnings || [] });

      // Say what it WOULD do, without doing any of it.
      const { data: existing } = await db.from(MACHINERY_TABLE).select('*');
      const row = toRow(result.machine, { rights: body.rights || null, adapter: result.source?.adapter });
      const plan = planImport(Array.isArray(existing) ? existing : [], [row]);

      return send(res, 200, {
        preview: true,
        written: false,
        machine: result.machine,
        warnings: result.warnings,
        review: result.review,
        source: result.source,
        would: {
          create: plan.creates.length,
          update: plan.updates.length,
          rePrice: plan.rePriced,
          invalid: plan.errors
        },
        // Echoed back so confirm writes exactly what was shown.
        confirmWith: { url, rights: body.rights || null, adapter: result.source?.adapter }
      });
    }

    // ---- CONFIRM: write ----------------------------------------------------
    if (step === 'confirm') {
      const candidates = Array.isArray(body.machines) ? body.machines : [];
      if (!candidates.length) return send(res, 400, { error: 'Nothing to import — preview a link first' });
      if (candidates.length > MAX_IMPORT_BATCH) {
        return send(res, 400, { error: `Import at most ${MAX_IMPORT_BATCH} machines at a time` });
      }

      const { data: existing } = await db.from(MACHINERY_TABLE).select('*');
      const rows = candidates.map(m => (m && m.row)
        ? m.row
        : toRow(m, { rights: m?.source?.rights || body.rights || null, adapter: m?.source?.adapter || body.adapter || 'product-page' }));
      const plan = planImport(Array.isArray(existing) ? existing : [], rows);

      if (!plan.creates.length && !plan.updates.length) {
        return send(res, 422, {
          error: 'Nothing could be imported from that preview',
          invalid: plan.errors, skipped: plan.skips
        });
      }

      const result = await applyImport(db, plan, auth.profile);
      const { data: fresh } = await db.from(MACHINERY_TABLE)
        .select('*').eq('published', true).order('sort_order', { ascending: true });

      return send(res, 200, {
        imported: result.created.length,
        updated: result.updated.length,
        rePriced: result.rePriced,
        skipped: result.skipped,
        invalid: result.invalid,
        failed: result.failed,
        machines: Array.isArray(fresh) ? fresh.map(toPublic) : []
      });
    }

    // ---- SCRAPER: crawl the Made-in-China category pages, preview only ----
    // Reads category pages + product pages (robots.txt first, 1s between
    // fetches, max six machines) and returns previews through the same
    // previewMachine() pipeline as step=preview. Writes nothing — the
    // operator's confirm click is what imports, exactly as with a pasted link.
    if (step === 'scraper') {
      const out = await runScraper(db, {
        category: body.category || null,
        categories: Array.isArray(body.categories) && body.categories.length ? body.categories : null,
        limit: body.limit || null,
        fetch: injected.fetch || null,
        sleep: injected.sleep || null,
        markup: Number.isFinite(Number(body.markup)) ? Number(body.markup) : 0.25
      });
      return send(res, 200, out);
    }

    // ---- STALE: flag machines a scheduled run did not see ------------------
    // Never deletes. A supplier taking a listing down for a weekend is not the
    // same thing as the machine being gone, and only the owner can tell those
    // apart — so the row is flagged, not removed.
    if (step === 'stale') {
      const out = await markStale(db, { sourceHost: body.sourceHost || null, seenIds: body.seenIds || [] });
      return send(res, 200, { ...out, note: 'Flagged, never deleted — the owner decides' });
    }

    return send(res, 400, { error: `Unknown import step: ${step || '(none)'}. Use step=preview, step=confirm or step=scraper.` });
  } catch (e) { return sendErr(e); }
}

async function seoDispatch(req, res, action, injected = {}) {
  const db = injected.db || adminClient();
  let auth;
  try {
    auth = injected.getUser ? await injected.getUser(req) : await requireUser(req);
  } catch (error) {
    return send(res, error.status || 401, {error: error.message || 'Unauthorized'});
  }
  try {
    await assertSiteWrite(auth.profile, injected);
  } catch (error) {
    return send(res, error.status || 403, {error: error.message || 'Not allowed'});
  }
  return handleSeoWorkflow(req, res, action, {db, auth, injected});
}

export default async function handler(req, res, injected = {}) {
  // ---- Vehicle sitemap dispatch: /api/sitemap-vehicles.xml rewrites here
  // with ?sitemap=vehicles. Kept inside this function so the deployment
  // stays at 12 Serverless Functions (Vercel Hobby cap) — see the block
  // comment above.
  if (String(req.query.sitemap || '') === 'vehicles') {
    return sitemapVehicles(req, res, injected);
  }
  if (String(req.query.sitemap || '') === 'news') {
    return sitemapNews(req, res, injected);
  }
  if (String(req.query.sitemap || '') === 'machinery') {
    return sitemapMachinery(req, res, injected);
  }

  // ---- Staff SEO workflows: local audit stays in the browser; real provider
  // calls are dispatched through this existing function (no new Vercel route).
  const seoAction = String(req.query.seo || '');
  if (seoAction) return seoDispatch(req, res, seoAction, injected);

  // ---- Machinery desk: ?machinery=list|create|update|delete|publish|
  // unpublish|archive. Dispatched here rather than in its own file so the
  // deployment stays at 12 Serverless Functions.
  const machineAction = String(req.query.machinery || '');
  if (machineAction) return machineryDispatch(req, res, machineAction, injected);

  // ---- Machinery import agent: ?import=machinery&step=preview|confirm
  if (String(req.query.import || '') === 'machinery') return importDispatch(req, res, injected);

  const entity = String(req.query.entity || '');
  const table = entities[entity];
  if (!table) return send(res, 400, {error: 'Unknown entity'});

  const db = injected.db || adminClient();

  // ---- Public read: the live website calls this anonymously. Complete CRM
  // reads (all=1) are staff-only so unpublished site_articles cannot leak from
  // a query-string shortcut.
  if (req.method === 'GET') {
    let auth = null;
    if (req.query.all === '1') {
      try {
        auth = injected.getUser ? await injected.getUser(req) : await requireUser(req);
      } catch (error) {
        return send(res, error.status || 401, {error: error.message || 'Unauthorized'});
      }
      try {
        await assertSiteWrite(auth.profile, injected);
      } catch (error) {
        return send(res, error.status || 403, {error: error.message || 'Not allowed'});
      }
    }
    let q = db.from(table).select('*').order('sort_order', {ascending: true});
    // Anonymous visitors only ever see published rows. site_blocks has no
    // published flag, so it is only reachable in the permission-checked CRM view.
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
