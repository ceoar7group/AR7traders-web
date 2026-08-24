// Public website content API.
//
// GET  is PUBLIC  — the live website reads its listings/routes/articles here.
// POST/PATCH/DELETE require an authenticated admin (same rule as api/crm.js).
//
// This is what makes the website editable from the CRM.
import {adminClient, requireUser, send} from './_supabase.js';

const entities = {
  listings: 'site_listings',
  routes:   'site_routes',
  articles: 'site_articles',
  blocks:   'site_blocks'
};

const allowed = {
  listings: ['stock_no','make','model','year','km','fuel','body','price','image','grade','status','location','tr','drv','eng','seats','col','st','published','sort_order'],
  routes:   ['country','port','transit','popular','freight_base','duty_pct','published','sort_order'],
  articles: ['title','category','date','read_min','image','excerpt','body','published','sort_order'],
  blocks:   ['key','label','value','page']
};

function clean(entity, body) {
  const out = {};
  for (const k of allowed[entity] || []) if (k in (body || {})) out[k] = body[k];
  return out;
}

export default async function handler(req, res) {
  const entity = String(req.query.entity || '');
  const table = entities[entity];
  if (!table) return send(res, 400, {error: 'Unknown entity'});

  const db = adminClient();

  // ---- Public read: the live website calls this anonymously.
  if (req.method === 'GET') {
    let q = db.from(table).select('*').order('sort_order', {ascending: true});
    // Anonymous visitors only ever see published rows.
    if (req.query.all !== '1') q = q.eq('published', true);
    const {data, error} = await q;
    if (error) return send(res, 500, {error: error.message});
    return send(res, 200, data);
  }

  // ---- Everything below is admin-only.
  const auth = await requireUser(req);
  if (!auth.ok) return send(res, auth.status, {error: auth.error});
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
