// Public website content API.
//
// GET  is PUBLIC  — the live website reads its listings/routes/articles here.
// POST/PATCH/DELETE require an authenticated admin (same rule as api/crm.js).
//
// This is what makes the website editable from the CRM.
import {adminClient, requireUser, send} from './_supabase.js';

// ---------------------------------------------------------------------------
// Vehicle sitemap (GET ?sitemap=vehicles, rewritten from the public URL
// /api/sitemap-vehicles.xml — see vercel.json).
//
// The logic lives IN THIS FILE, not in its own api/*.js function and not in
// an imported module, for two reasons found the hard way on 2026-09-29:
//   1. Vercel Hobby allows **12 Serverless Functions per deployment** — a
//      13th api/*.js file broke every deploy (preview AND production,
//      exceeded_serverless_functions_per_deployment).
//   2. A separate _sitemap-core.js module built fine but 500'd at runtime
//      under the function runtime's cross-module interop, so the dispatcher
//      below calls these local functions directly.
// The two tiny helpers are pinned to their originals in src/routing.js by
// scripts/sitemap-vehicles.test.mjs.
// ---------------------------------------------------------------------------

const SITEMAP_BASE = 'https://ar7traders.com';
const SITEMAP_CACHE = 'public, max-age=120, s-maxage=600';
const SITEMAP_MAX_ROWS = 5000;
const SITEMAP_UNAVAILABLE = /sold|delist|private|hidden|archived|removed/i;

/** Keep in sync with carRef() in src/routing.js (pinned by tests). */
export function carRef(c) {
  if (!c) return '';
  const stock = c.stock_no && String(c.stock_no).trim();
  return stock || String(c.id);
}

/** Keep in sync with hrefFor() in src/routing.js (pinned by tests). */
export function hrefFor(page, carId) {
  if (!page || page === 'home') return '/';
  if (page === 'inventory' && carId) return '/inventory/' + encodeURIComponent(String(carId));
  return '/' + page;
}

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
// `japan_dealer_stock` cars are deliberately NOT listed: those cars have no
// public AR7 detail page (they render on /japan-stock and link out to the
// original goo-net listing). A goo-net car promoted into `site_listings`
// does appear, because promotion creates a published row with a detail page. */
export function buildXml(rows) {
  const entries = [];
  for (const row of rows || []) {
    if (!row || row.published === false) continue;
    if (row.status != null && SITEMAP_UNAVAILABLE.test(String(row.status))) continue;
    const hasRef = (row.stock_no != null && String(row.stock_no).trim() !== '') || row.id != null;
    if (!hasRef) continue;
    const ref = carRef(row);
    if (!ref || ref === 'undefined' || ref === 'null') continue;
    const loc = SITEMAP_BASE + hrefFor('inventory', ref);
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
    return sendXml(res, 200, buildXml(data || []), SITEMAP_CACHE);
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

const allowed = {
  listings: ['stock_no','make','model','year','km','fuel','body','price','image','images','gallery','grade','status','location','tr','drv','eng','seats','col','st','published','sort_order'],
  routes:   ['country','port','transit','popular','freight_base','duty_pct','lon','lat','show_on_map','published','sort_order'],
  articles: ['title','category','date','read_min','image','excerpt','body','published','sort_order'],
  blocks:   ['key','label','value','page']
};

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

  const db = adminClient();

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

  // ---- Everything below is admin-only.
  // requireUser() throws with a status on failure — it does NOT return {ok}.
  let auth;
  try {
    auth = await requireUser(req);
  } catch (e) {
    return send(res, e.status || 401, {error: e.message || 'Unauthorized'});
  }
  if (auth.profile?.role !== 'admin') return send(res, 403, {error: 'Admin access required'});

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
