// Admin-only one-click website stock sync.
//
// POST /api/site-sync   (Authorization: Bearer <token>, profile.role = admin)
//
// Runs the same sync as scripts/sync-site-listings.mjs, but on the server,
// so the CRM's "Sync website stock to latest" button works without a
// terminal: the seed cars in site_listings are made to match
// src/site-content.seed.json exactly. Cars not in the seed are hidden with
// published=false (reversible), never deleted — except importer-managed
// cars (japan_dealer_stock), which the sync never touches.
//
// Same auth pattern as api/site-content.js: public reads only, everything
// else requires an authenticated admin via the service role.
import {adminClient, requireUser, send} from './_supabase.js';
// "with {type:'json'}" so the seed inlines into the function bundle and the
// file also runs under bare Node 22+ (which requires the import attribute).
import seedData from '../src/site-content.seed.json' with {type: 'json'};
import {computePlan, applyPlan, summarize} from '../scripts/sync-core.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST') return send(res, 405, {error: 'Method not allowed'});

  let auth;
  try {
    auth = await requireUser(req);
  } catch (e) {
    return send(res, e.status || 401, {error: e.message || 'Unauthorized'});
  }
  if (auth.profile?.role !== 'admin') return send(res, 403, {error: 'Admin access required'});

  const db = adminClient();
  const {data: dbRows, error: readErr} = await db.from('site_listings').select('*');
  if (readErr) return send(res, 500, {error: 'Could not read site_listings: ' + readErr.message});

  // Cars the Goo-net importer promoted into site_listings are managed by the
  // importer, not the seed — the sync must never hide them. (2026-11-05: a
  // sync without this guard unpublished 162 live imported cars.)
  const {data: importerRows, error: impErr} = await db.from('japan_dealer_stock').select('stock_no,goonet_id');
  if (impErr) return send(res, 500, {error: 'Could not read japan_dealer_stock: ' + impErr.message});
  const protectedStocks = new Set((importerRows || [])
    .map(r => String(r.stock_no || r.goonet_id || '').trim()).filter(Boolean));

  const plan = computePlan(seedData.listings || [], dbRows || [], {hardDelete: false, protectedStocks});
  try {
    const done = await applyPlan(db, plan);
    try {
      await db.from('activities').insert({
        action: `Synced website stock to latest seed — ${summarize(plan, done)}`,
        actor: auth.user.email,
        entity_type: 'site_listings',
        created_by: auth.profile.id
      });
    } catch (e) {
      console.error('activity log failed', e.message);
    }
    return send(res, 200, {ok: true, summary: summarize(plan, done), ...done});
  } catch (e) {
    return send(res, 500, {error: e.message});
  }
}
