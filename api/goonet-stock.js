// Japan dealer stock API — cars imported from Goo-net.
//
// GET  (public)            → available cars for the website's
//                            "Japan dealer stock" page (published only)
// GET  all=1 (admin)       → every imported car (CRM management page)
// POST / PATCH / DELETE    → admin CRUD (CRM editor)
// POST action=promote      → move a car to the public website (site_listings)
//                            or to CRM inventory (vehicles)
// POST action=delist       → manually delist / re-list a car
//
// Writes need the `site.write` permission (Administrator + Manager by default),
// decided by CRM → Team & permissions rather than a hard-coded role check.
import {adminClient, requireUser, send} from './_supabase.js';
import {requirePerm} from './_perm.js';
import {GOONET_COLUMNS} from './_columns.js';
import {
  delistCar as coreDelist,
  promoteToListings, promoteToInventory,
  promotesToListings, promotesToInventory
} from './goonet-sync.js';
// The import assistant runs on the SAME serverless function as the rest of the
// Japan dealer stock API (Vercel Hobby caps the deployment at 12 functions), and
// it reads pages through the SAME shared core the scheduled importer uses —
// charset-aware fetch, detail parser, quality gate, required-field rules.
import {
  fetchPage, parseDetailPage, qualityScore, parseGoonetCarUrls,
  isDelistedPage, detailUrlFor
} from '../scripts/goonet-core.mjs';

// A staff request may carry at most this many URLs. Each one costs a real
// goo-net fetch, so the batch is small on purpose: it keeps the request inside
// the function budget and keeps our request rate to the source polite.
const ASSISTANT_MAX_URLS = 5;
const ASSISTANT_FETCH_TIMEOUT_MS = 9000;
const ASSISTANT_BUDGET_MS = 45000;
const ASSISTANT_GAP_MS = 250;
const sleep = ms => new Promise(r => setTimeout(r, ms));

const REQUIRED_FIELDS = ['make', 'model', 'year', 'price_jpy', 'km', 'fuel', 'body'];

function numSetting(v, dflt) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? Math.round(n) : dflt;
}

function gradeOf(ext, int) {
  return ext && int ? String(Math.round(((ext + int) / 2) * 2) / 2) : null;
}

// Exactly the reasons the quality gate and the importer's required-field check
// produce — never a friendlier summary, so a preview cannot promise an import
// the import would then refuse.
function missingFieldsFor(car) {
  return REQUIRED_FIELDS.filter(f => !car[f] || car[f] === 'Unknown' || car[f] === '');
}

// One Goo-net vehicle URL → a verified preview. Reads the page through the
// shared core (correct charset), parses the real detail page, applies the
// configured quality gate, and reports every reason a car would be refused.
//
// Scraped markup is DATA here, never instructions: only the parser's typed
// fields are used, nothing from the page is executed, and no field is invented
// when the page does not state it.
async function inspectGoonetUrl(db, parsed, settings, knownIds, budget) {
  const result = {
    source_url: parsed.input,
    url: parsed.url,
    stock_id: parsed.stock,
    status: 'unavailable',
    reason: null
  };
  let row = null;
  try {
    const fetched = await fetchPage(parsed.url, { timeoutMs: ASSISTANT_FETCH_TIMEOUT_MS, purpose: 'detail' });
    result.source = fetched.via || 'direct';
    if (!fetched.ok || isDelistedPage(fetched)) {
      result.reason = fetched.status === 404
        ? 'the listing is gone (goo-net returned 404)'
        : (fetched.error ? 'could not read the page (' + fetched.error + ')' : 'could not read the page (HTTP ' + fetched.status + ')');
      return { result, row };
    }
    const detail = parseDetailPage(fetched.html, parsed.url);
    if (!detail || !detail.make || !detail.title) {
      result.reason = 'the page did not parse as a Goo-net vehicle page (markup changed or a gate page was returned)';
      return { result, row };
    }
    const car = { ...detail, grade: gradeOf(detail.ext_rating, detail.int_rating) };
    const q = qualityScore(car, settings);
    const missing = missingFieldsFor(car);
    const photos = (car.images || []).filter(Boolean);

    result.make = car.make;
    result.model = car.model;
    result.title = car.title;
    result.year = car.year || null;
    result.km = car.km || null;
    result.price_jpy = car.price_jpy || null;
    result.price_usd = car.price_usd || null;
    result.price = car.price || null;
    result.fuel = car.fuel || null;
    result.body = car.body || null;
    result.tr = car.tr || null;
    result.eng = car.eng || null;
    result.drv = car.drv || null;
    result.st = car.st || null;
    result.seats = car.seats || null;
    result.col = car.col || null;
    result.location = car.location || null;
    result.repair_history = car.repair_history || null;
    result.grade = car.grade || null;
    result.photo_count = photos.length;
    result.photos = photos.slice(0, 8);
    result.quality = { pass: q.pass && missing.length === 0 && photos.length >= settings.minPhotos, score: q.score, reasons: q.reasons.slice() };
    result.missing_fields = missing;

    if (knownIds.has(String(parsed.stock))) {
      result.status = 'already_present';
      result.reason = 'already in Japan dealer stock';
      return { result, row };
    }
    const { data: blocked } = await db.from('goonet_blocklist')
      .select('goonet_id').eq('goonet_id', String(parsed.stock)).maybeSingle();
    if (blocked) {
      result.status = 'rejected';
      result.reason = 'this car was deleted from the CRM and is on the blocklist';
      return { result, row };
    }
    if (!q.pass) {
      result.status = 'rejected';
      result.reason = 'quality gate: ' + q.reasons.join(', ');
      return { result, row };
    }
    if (photos.length < settings.minPhotos) {
      result.status = 'rejected';
      result.reason = 'only ' + photos.length + ' photo(s); the importer needs ' + settings.minPhotos + '+';
      return { result, row };
    }
    if (missing.length) {
      result.status = 'rejected';
      result.reason = 'missing required field(s): ' + missing.join(', ');
      return { result, row };
    }

    const now = new Date().toISOString();
    row = {
      goonet_id: String(parsed.stock),
      stock_no: parsed.stock,
      make: car.make, model: car.model,
      year: car.year, km: car.km, fuel: car.fuel, body: car.body,
      price_jpy: car.price_jpy, price_usd: car.price_usd, price: car.price,
      image: car.image, images: car.images,
      grade: car.grade, status: 'New Arrival', location: car.location || 'Japan',
      tr: car.tr, drv: car.drv, eng: car.eng, seats: car.seats, col: car.col, st: car.st,
      vendor: 'Goo-net', goonet_url: parsed.url,
      photo_count: photos.length, quality_score: q.score,
      available: true, promoted: 'none',
      imported_at: now, last_seen_at: now, updated_at: now
    };
    result.status = 'ready';
    return { result, row };
  } catch (e) {
    result.status = 'failed';
    result.reason = e.message || 'unexpected error';
    return { result, row };
  } finally {
    if (budget && Date.now() > budget.deadline) budget.exhausted = true;
  }
}

// Shared by both assistant actions: validate the pasted block, read each URL
// through the shared core, and return per-URL results. Nothing is written here.
async function runAssistant(db, body) {
  const batch = parseGoonetCarUrls(body?.urls ?? body?.url ?? '', { max: ASSISTANT_MAX_URLS });
  const { data: settingRows } = await db.from('site_settings').select('key,value');
  const s = Object.fromEntries((settingRows || []).map(r => [r.key, r.value]));
  const settings = {
    minPhotos: numSetting(s.goonet_min_photos, 5),
    minYear: numSetting(s.goonet_min_year, 2000)
  };
  const { data: knownRows } = await db.from('japan_dealer_stock').select('goonet_id');
  const knownIds = new Set((knownRows || []).map(r => String(r.goonet_id)));

  const preview = [];
  const rejectedInputs = batch.errors.map(e => ({ input: e.input, reason: e.reason }));
  const deadline = Date.now() + ASSISTANT_BUDGET_MS;
  for (let i = 0; i < batch.urls.length; i++) {
    if (i > 0) await sleep(ASSISTANT_GAP_MS);
    if (Date.now() > deadline) {
      preview.push({
        source_url: batch.urls[i].input, url: batch.urls[i].url, stock_id: batch.urls[i].stock,
        status: 'failed', reason: 'the serverless time budget for one request was reached — import the rest in the next batch'
      });
      continue;
    }
    const { result } = await inspectGoonetUrl(db, batch.urls[i], settings, knownIds, null);
    preview.push(result);
  }
  return { preview, rejectedInputs, settings, batch };
}

// Writable columns live in api/_columns.js (shared with api/approvals.js).
const ALLOWED = GOONET_COLUMNS;

function clean(body) {
  const out = {};
  for (const k of ALLOWED) if (k in (body || {})) out[k] = body[k];
  return out;
}

// Same rule as api/site-content.js: editing imported stock is gated by the
// `site.write` permission, not by a hard-coded role, so CRM → Team &
// permissions is the only place that decides who may do it.
async function admin(req, injected = {}) {
  const auth = injected.getUser ? await injected.getUser(req) : await requireUser(req);
  if (injected.permsFor) {
    const allowedWrite = auth.profile?.role === 'admin' || !!(await injected.permsFor(auth.profile?.role))['site.write'];
    if (!allowedWrite) throw Object.assign(new Error(`Your role (${auth.profile?.role}) is not allowed to do this`), { status: 403 });
    return auth;
  }
  await requirePerm(auth.profile, 'site.write');
  return auth;
}

// The assistant reads up to five Goo-net pages in one request; the default
// Hobby duration is too short for that, and the sync function already runs
// with the same 60s budget.
export const config = { maxDuration: 60 };

export default async function handler(req, res, injected = {}) {
  try {
    const db = injected.db || adminClient();

    // ---- Parser diagnostic (admin) ----------------------------------------
    // Serves the 2 KB markup sample the importer stored on the last blocked or
    // parse-miss run (site_settings.goonet_parsemiss_sample). The CRM "Copy
    // parser diagnostic" button reads this so the saved markup can be pasted
    // into the parser-fix ticket. It sits BEFORE the public read branch: this
    // is an admin-only surface, not part of the website's car list.
    if (req.method === 'GET' && req.query.action === 'diag') {
      await admin(req, injected);
      const { data: row } = await db.from('site_settings')
        .select('value').eq('key', 'goonet_parsemiss_sample').maybeSingle();
      const raw = row?.value ? String(row.value) : null;
      if (!raw) {
        return send(res, 200, { ok: true, sample: null,
          message: 'No parser diagnostic stored — the importer last read the page successfully.' });
      }
      let diag = null;
      try { diag = JSON.parse(raw); } catch { /* stored before the JSON envelope existed */ }
      if (diag && typeof diag === 'object' && !Array.isArray(diag)) {
        return send(res, 200, { ok: true, ...diag });
      }
      return send(res, 200, { ok: true, sample: raw });
    }

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
    const auth = await admin(req, injected);
    const actor = auth.profile.full_name || auth.user.email;

    // POST action routes (promote / delist / reset_bookmark / the import
    // assistant) — separate from plain CRUD.
    //
    // The action may arrive in the QUERY STRING or in the body, and both are
    // read here on purpose. The CRM calls `POST /api/goonet-stock?action=promote`
    // with a plain `{id, target}` body, the import assistant calls
    // `?action=preview_import`, while the scripts and tests post the action in
    // the body. Reading only `req.body.action` meant every CRM button — the
    // Inventory and Website buttons, Delist, Reset bookmark and the whole
    // import assistant — skipped this block and fell through to the CRUD
    // insert below, which tried to insert an empty row and answered with a raw
    // "null value in column \"goonet_id\" of relation \"japan_dealer_stock\"
    // violates not-null constraint". That is the error the owner saw while
    // adding an imported car to inventory: nothing was ever copied, so the CRM
    // had no car to show as added either.
    const action = String(req.body?.action || req.query?.action || '');
    if (req.method === 'POST' && action) {
      // Reset the crawler bookmark back to page 1 so the next import run
      // re-crawls from the beginning. No car id is involved here, so it is
      // handled before the id check below.
      if (action === 'reset_bookmark') {
        await db.from('site_settings').upsert(
          { key: 'goonet_bookmark_page', value: '1', updated_at: new Date().toISOString() },
          { onConflict: 'key' }
        );
        await db.from('activities').insert({
          action: 'Reset the Goo-net importer bookmark to page 1',
          actor, entity_type: 'japan_dealer_stock'
        });
        return send(res, 200, { ok: true, message: 'Importer bookmark reset to page 1 — the next run starts from the first page.' });
      }
      // ---- Import assistant: preview a small batch of Goo-net URLs --------
      // Nothing is written here. The preview is derived entirely server-side
      // from the source URLs, and the same inspection runs again on import —
      // a client-submitted preview is never trusted.
      if (action === 'preview_import') {
        const { preview, rejectedInputs, settings } = await runAssistant(db, req.body);
        return send(res, 200, {
          ok: true, preview, rejected: rejectedInputs,
          limits: { maxUrls: ASSISTANT_MAX_URLS, minPhotos: settings.minPhotos, minYear: settings.minYear },
          message: preview.length
            ? `${preview.filter(p => p.status === 'ready').length} of ${preview.length} URL(s) are ready to import.`
            : 'No Goo-net vehicle URLs in that request.'
        });
      }

      // ---- Import assistant: fetch and import the approved batch ----------
      // Every URL is re-validated and re-read from goo-net here; the preview
      // the browser holds is only a suggestion. Duplicates, blocklists and the
      // quality gate are re-applied against live data before anything is
      // inserted, and the car lands in Japan dealer stock unpromoted — the
      // explicit Publish/Promote action is what puts it on the website.
      if (action === 'import_urls') {
        const { preview, rejectedInputs } = await runAssistant(db, req.body);
        const results = [];
        for (const item of preview) {
          if (item.status !== 'ready') { results.push(item); continue; }
          const now = new Date().toISOString();
          const row = {
            goonet_id: String(item.stock_id),
            stock_no: item.stock_id,
            make: item.make, model: item.model,
            year: item.year, km: item.km, fuel: item.fuel, body: item.body,
            price_jpy: item.price_jpy, price_usd: item.price_usd, price: item.price,
            image: item.photos?.[0] || null, images: item.photos || [],
            grade: item.grade, status: 'New Arrival', location: item.location || 'Japan',
            tr: item.tr, drv: item.drv, eng: item.eng, seats: item.seats, col: item.col, st: item.st,
            vendor: 'Goo-net', goonet_url: item.url,
            photo_count: item.photo_count, quality_score: item.quality?.score || 0,
            available: true, promoted: 'none',
            imported_at: now, last_seen_at: now, updated_at: now
          };
          const { data, error } = await db.from('japan_dealer_stock').insert(row).select().single();
          if (error) {
            if (/duplicate/i.test(error.message || '')) {
              results.push({ ...item, status: 'already_present', reason: 'already in Japan dealer stock' });
            } else {
              results.push({ ...item, status: 'failed', reason: error.message });
            }
            continue;
          }
          try {
            await db.from('activities').insert({
              action: `Imported ${row.make} ${row.model} (${row.stock_no}) from ${row.goonet_url} with the Goo-net import assistant`,
              actor, entity_type: 'japan_dealer_stock', entity_id: data?.id || null
            });
          } catch (e) { console.error('activity log failed', e.message); }
          results.push({ ...item, id: data?.id || null, status: 'imported', promoted: 'none' });
        }
        const imported = results.filter(r => r.status === 'imported').length;
        return send(res, 200, {
          ok: true, results, rejected: rejectedInputs,
          inserted: imported,
          message: imported
            ? `${imported} car(s) imported into Japan dealer stock. Publish each one when you are ready.`
            : 'Nothing was imported — see each row for the reason.'
        });
      }

      const id = req.body.id;
      if (!id) return send(res, 400, { error: 'Car id is required' });
      const { data: row, error: readErr } = await db.from('japan_dealer_stock').select('*').eq('id', id).single();
      if (readErr || !row) return send(res, 404, { error: 'Car not found' });

      if (action === 'promote') {
        const target = req.body.target; // 'listings' | 'vehicles' | 'both'
        if (!['listings', 'vehicles', 'both'].includes(target)) return send(res, 400, { error: 'target must be listings, vehicles or both' });
        // A promotion copies the dealer row into site_listings and/or the CRM
        // vehicles table and only then flags the dealer row. The helpers verify
        // every write and throw a reason, so this route can never answer
        // "moved" for a copy that did not land — and it tells the CRM when the
        // car was already in the destination, so the screen can say "already
        // added" instead of offering to add it again.
        const results = {};
        if (target === 'listings' || target === 'both') results.listings = await promoteToListings(db, row, actor);
        if (target === 'vehicles' || target === 'both') results.vehicles = await promoteToInventory(db, row, actor);
        const promoted = results.vehicles?.promoted || results.listings?.promoted || row.promoted || 'none';
        const label = `${row.make || ''} ${row.model || ''}`.trim() || (row.stock_no || row.goonet_id || 'Car');
        const parts = [];
        if (results.listings) parts.push(results.listings.already
          ? 'is already on the website (listing refreshed)'
          : 'is now published on the website');
        if (results.vehicles) parts.push(results.vehicles.already
          ? 'is already in CRM inventory (details refreshed)'
          : 'is now in CRM inventory');
        return send(res, 200, {
          ok: true, promoted, results,
          state: {
            // 'both' means both places — read the flag with the shared
            // helpers, never with includes() ('both'.includes('listings') is
            // false, which is how a car in both places looked like neither).
            on_website: promotesToListings({ promoted }),
            in_inventory: promotesToInventory({ promoted }),
            already_in_inventory: !!results.vehicles?.already,
            already_on_website: !!results.listings?.already
          },
          message: `${label} ${parts.join(' and ')}`
        });
      }
      if (action === 'delist') {
        // `available` is the state the caller wants to END UP in: true = put it
        // back on the website, false/absent = hide it. The CRM now sends the
        // right one for the button that was pressed (Re-list used to send
        // false and so hid a car the user was trying to restore).
        if (req.body.available === true) {
          const { error } = await db.from('japan_dealer_stock')
            .update({ available: true, delisted_at: null, updated_at: new Date().toISOString() })
            .eq('id', row.id);
          if (error) return send(res, 500, { error: 'Could not re-list the car — ' + error.message });
          try {
            await db.from('activities').insert({
              action: `Re-listed ${row.make} ${row.model} (${row.stock_no}) on the website`,
              actor, entity_type: 'japan_dealer_stock', entity_id: row.id
            });
          } catch (e) { console.error('activity log failed', e.message); }
          return send(res, 200, { ok: true, available: true, message: 'Car re-listed' });
        }
        await coreDelist(db, row, actor);
        return send(res, 200, { ok: true, available: false, message: 'Car delisted' });
      }
      return send(res, 400, { error: 'Unknown action' });
    }

    if (req.method === 'GET') {
      const { data, error } = await db.from('japan_dealer_stock').select('*')
        .order('imported_at', { ascending: false }).limit(1000);
      if (error) return send(res, 500, { error: error.message });
      // The signed-in CRM view: every row, including delisted ones (that is
      // what makes Re-list possible), and never cached — the public branch
      // below is CDN/browser cacheable for minutes, which used to leave the
      // CRM showing a stale "not promoted yet" state right after an action.
      res.setHeader('Cache-Control', 'no-store');
      return send(res, 200, data || []);
    }

    if (req.method === 'POST') {
      // `japan_dealer_stock` has no `created_by` column — see the table in
      // supabase/SETUP-EVERYTHING.sql. The payload used to add one, so this
      // insert could only ever be rejected by PostgREST with
      //   Could not find the 'created_by' column of 'japan_dealer_stock' in the
      //   schema cache
      // and that is the second half of the owner's report: whichever way the
      // row actions reached this branch, the insert failed. The caller is
      // recorded in `activities` below instead, and `clean()` keeps the payload
      // to the columns the table really has so an unknown key can never leak
      // into it.
      const payload = clean(req.body);
      // A row with no identifier is refused with a sentence rather than the
      // raw `null value in column "goonet_id" … violates not-null constraint`
      // the database would answer with. This branch is what the CRM's dealer
      // editor posts to, and a bare Postgres message is what made the original
      // report hard to read.
      if (!payload.goonet_id && !payload.stock_no) {
        return send(res, 400, { error: 'A stock number (or Goo-net id) is required to add a car to Japan dealer stock' });
      }
      const { data, error } = await db.from('japan_dealer_stock').insert(payload).select().single();
      if (error) return send(res, 500, { error: error.message });
      await db.from('activities').insert({
        action: `Added imported car ${data.make} ${data.model} (${data.stock_no || data.goonet_id})`,
        actor, entity_type: 'japan_dealer_stock', entity_id: data.id,
        // `activities` DOES have created_by — record the caller here, where the
        // column exists, instead of on the dealer row.
        created_by: auth.user.id
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

      // First, get the car to add to blocklist to prevent re-import
      const { data: car, error: readErr } = await db.from('japan_dealer_stock')
        .select('goonet_id, stock_no')
        .eq('id', id)
        .single();

      if (readErr || !car) return send(res, 404, { error: 'Car not found' });

      // Add to blocklist to prevent re-import
      await db.from('goonet_blocklist').upsert({
        goonet_id: car.goonet_id,
        stock_no: car.stock_no,
        reason: 'Manually deleted via CRM',
        blocked_at: new Date().toISOString()
      }, { onConflict: 'goonet_id' });

      // Now delete from main table
      const { error } = await db.from('japan_dealer_stock').delete().eq('id', id);
      if (error) return send(res, 500, { error: error.message });

      await db.from('activities').insert({
        action: `Permanently deleted and blocked car ${car.stock_no}`,
        actor, entity_type: 'japan_dealer_stock', entity_id: id
      });

      return send(res, 200, { ok: true });
    }

    return send(res, 405, { error: 'Method not allowed' });
  } catch (e) {
    console.error(e);
    return send(res, e.status || 500, { error: e.message || 'Japan stock request failed' });
  }
}
