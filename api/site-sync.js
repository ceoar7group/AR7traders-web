// Admin-only one-click website stock sync.
//
// POST /api/site-sync   (Authorization: Bearer <token>, profile.role = admin)
//
// Runs the same sync as scripts/sync-site-listings.mjs, but on the server,
// so the CRM's "Sync website stock to latest" button works without a
// terminal: site_listings is made to match src/site-content.seed.json
// exactly (25 cars = 12 showroom + 13 Goo-net). Cars not in the seed are
// hidden with published=false (reversible), never deleted.
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

  const plan = computePlan(seedData.listings || [], dbRows || [], {hardDelete: false});
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
