// Japan dealer stock API — cars imported from Goo-net.
//
// GET  (public)            → available cars for the website's
//                            "Japan dealer stock" page (published only)
// GET  all=1 (admin)       → every imported car (CRM management page)
// POST / PATCH / DELETE    → admin CRUD (CRM editor)
// POST action=promote      → move a car to the public website (site_listings)
//                            or to CRM inventory (vehicles)
// POST action=delist       → manually delist / re-list a car
import {adminClient, requireUser, send} from './_supabase.js';
import {
  delistCar as coreDelist,
  promoteToListings, promoteToInventory
} from './goonet-sync.js';

const ALLOWED = [
  'goonet_id', 'stock_no', 'make', 'model', 'year', 'km', 'fuel', 'body',
  'price_jpy', 'price_usd', 'price', 'image', 'images', 'grade', 'status',
  'location', 'tr', 'drv', 'eng', 'seats', 'col', 'st', 'vendor',
  'goonet_url', 'photo_count', 'quality_score', 'available', 'promoted'
];

function clean(body) {
  const out = {};
  for (const k of ALLOWED) if (k in (body || {})) out[k] = body[k];
  return out;
}

async function admin(req) {
  const auth = await requireUser(req);
  if (auth.profile?.role !== 'admin') throw Object.assign(new Error('Admin access required'), { status: 403 });
  return auth;
}

export default async function handler(req, res) {
  try {
    const db = adminClient();

    // ---- Public read: the Japan dealer stock page -------------------------
    if (req.method === 'GET' && req.query.all !== '1') {
      let q = db.from('japan_dealer_stock').select('*')
        .eq('available', true).order('imported_at', { ascending: false }).limit(300);
      const { data, error } = await q;
      if (error) return send(res, 500, { error: error.message });
      res.setHeader('Cache-Control', 'public, max-age=120, s-maxage=600');
      return send(res, 200, data || []);
    }

    // ---- Everything below requires an admin -------------------------------
    const auth = await admin(req);
    const actor = auth.profile.full_name || auth.user.email;

    // POST action routes (promote / delist) — separate from plain CRUD.
    if (req.method === 'POST' && req.body?.action) {
      const id = req.body.id;
      if (!id) return send(res, 400, { error: 'Car id is required' });
      const { data: row, error: readErr } = await db.from('japan_dealer_stock').select('*').eq('id', id).single();
      if (readErr || !row) return send(res, 404, { error: 'Car not found' });

      if (req.body.action === 'promote') {
        const target = req.body.target; // 'listings' | 'vehicles' | 'both'
        if (!['listings', 'vehicles', 'both'].includes(target)) return send(res, 400, { error: 'target must be listings, vehicles or both' });
        if (target === 'listings' || target === 'both') await promoteToListings(db, row, actor);
        if (target === 'vehicles' || target === 'both') await promoteToInventory(db, row, actor);
        return send(res, 200, { ok: true, message: `Moved ${row.make} ${row.model} to ${target}` });
      }
      if (req.body.action === 'delist') {
        if (req.body.available === true) {
          await db.from('japan_dealer_stock')
            .update({ available: true, delisted_at: null, updated_at: new Date().toISOString() })
            .eq('id', row.id);
          await db.from('activities').insert({
            action: `Re-listed ${row.make} ${row.model} (${row.stock_no}) on the website`,
            actor, entity_type: 'japan_dealer_stock', entity_id: row.id
          });
          return send(res, 200, { ok: true, message: 'Car re-listed' });
        }
        await coreDelist(db, row, actor);
        return send(res, 200, { ok: true, message: 'Car delisted' });
      }
      return send(res, 400, { error: 'Unknown action' });
    }

    if (req.method === 'GET') {
      const { data, error } = await db.from('japan_dealer_stock').select('*')
        .order('imported_at', { ascending: false }).limit(1000);
      if (error) return send(res, 500, { error: error.message });
      return send(res, 200, data || []);
    }

    if (req.method === 'POST') {
      const payload = { ...clean(req.body), created_by: auth.user.id };
      const { data, error } = await db.from('japan_dealer_stock').insert(payload).select().single();
      if (error) return send(res, 500, { error: error.message });
      await db.from('activities').insert({
        action: `Added imported car ${data.make} ${data.model} (${data.stock_no || data.goonet_id})`,
        actor, entity_type: 'japan_dealer_stock', entity_id: data.id
      });
      return send(res, 201, data);
    }

    if (req.method === 'PATCH') {
      if (!req.body?.id) return send(res, 400, { error: 'Record id is required' });
      const payload = { ...clean(req.body), updated_at: new Date().toISOString() };
      const { data, error } = await db.from('japan_dealer_stock').update(payload).eq('id', req.body.id).select().single();
      if (error) return send(res, 500, { error: error.message });
      await db.from('activities').insert({
        action: `Updated imported car ${data.make} ${data.model} (${data.stock_no || data.goonet_id})`,
        actor, entity_type: 'japan_dealer_stock', entity_id: data.id
      });
      return send(res, 200, data);
    }

    if (req.method === 'DELETE') {
      const id = req.query.id || req.body?.id;
      if (!id) return send(res, 400, { error: 'Record id is required' });
      const { error } = await db.from('japan_dealer_stock').delete().eq('id', id);
      if (error) return send(res, 500, { error: error.message });
      await db.from('activities').insert({
        action: `Deleted imported car record`, actor, entity_type: 'japan_dealer_stock', entity_id: id
      });
      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return send(res, e.status || 500, { error: e.message || 'Japan stock request failed' });
  }
}
