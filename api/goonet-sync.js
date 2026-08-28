// Goo-net importer — serverless entry point.
//
// POST /api/goonet-sync   (Authorization: Bearer <token>, profile.role = admin)
//
// Runs the same importer as scripts/goonet-scraper.mjs on the server, so the
// CRM's "Import Goo-net stock" button works without a terminal, and the
// Vercel cron can call it on a schedule (see vercel.json). Reads the rules
// from the `site_settings` table (goonet_* keys) so limits are editable.
//
// Also accepts a cron-style secret check: pass `?cron=<CRON_SECRET>` instead
// of a bearer token when invoked by Vercel's scheduler.
import {adminClient, requireUser, send} from './_supabase.js';
import {runGoonetSync, normaliseConfig} from '../scripts/goonet-core.mjs';

export default async function handler(req, res) {
  if (req.method !== 'POST' && req.method !== 'GET') return send(res, 405, {error: 'Method not allowed'});

  const CRON_SECRET = process.env.GOONET_CRON_SECRET || process.env.CRON_SECRET || '';

  // 1. Authenticate: an admin bearer token (CRM button, POST), or the cron
  //    secret (Vercel scheduler, GET). Vercel cron invokes the path via GET.
  let auth = null;
  const isCron = !!CRON_SECRET && req.query.cron === CRON_SECRET;
  if (!isCron) {
    try {
      auth = await requireUser(req);
    } catch (e) {
      return send(res, e.status || 401, {error: e.message || 'Unauthorized'});
    }
    if (auth.profile?.role !== 'admin') return send(res, 403, {error: 'Admin access required'});
  }

  const db = adminClient();

  // 2. Load the goonet_* rules from site_settings.
  let config = normaliseConfig({});
  try {
    const {data: settings} = await db.from('site_settings').select('key,value');
    const map = {};
    for (const s of settings || []) map[s.key] = s.value;
    config = normaliseConfig(map);
  } catch (e) {
    // Settings read is best-effort; defaults still apply.
    console.error('site_settings read failed', e.message);
  }

  const actor = isCron ? 'goonet cron' : auth.user.email;

  try {
    const result = await runGoonetSync({ db, fetchImpl: globalThis.fetch, config, dryRun: false });

    if (result.skipped) return send(res, 200, {ok: true, skipped: true, reason: result.reason});

    try {
      await db.from('activities').insert({
        action: `Goo-net sync — ${result.summary}`,
        actor,
        entity_type: 'site_listings'
      });
    } catch (e) {
      console.error('activity log failed', e.message);
    }
    return send(res, 200, {ok: true, summary: result.summary, ...result.done});
  } catch (e) {
    return send(res, 500, {error: e.message});
  }
}
