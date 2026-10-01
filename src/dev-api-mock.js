// Dev-only mock for /api/goonet-stock so the "Japan dealer stock" page has
// something to show in local previews (no Supabase keys needed). Never used
// in production — Vercel routes /api/* to the real serverless functions.
//
// The rows are not hand-written: they are built from a real goo-net capture
// (scripts/fixtures/goonet-capture-2026-08-31.json) through the same
// goonet-core maths the live importer uses, so the preview shows exactly what
// `node scripts/goonet-seed.mjs --push` writes to Supabase.
import { readCapture, buildSeedRows } from '../scripts/goonet-seed.mjs';
import { parseGoonetCarUrls } from '../scripts/goonet-core.mjs';

let STOCK = [];
try {
  // Imported a day apart from each other, newest first, like real runs.
  const rows = buildSeedRows(readCapture());
  STOCK = rows.map((r, i) => {
    const importedAt = new Date(Date.now() - (i + 1) * 864e5).toISOString();
    const { total_price_jpy, quality_pass, quality_reasons, repair_history, shop, ...row } = r;
    return { ...row, imported_at: importedAt, last_seen_at: importedAt, updated_at: importedAt };
  });
} catch (e) {
  console.warn('[ar7-dev-api-mock] could not build goo-net seed rows:', e.message);
}

// The import assistant, as far as a key-less local preview can honestly go:
// the URL is validated with the same parser the server uses, but there is no
// network here, so a car that is already in the dev capture reports as
// `already_present` and anything else reports `unavailable` instead of
// pretending a page was read. Deploy (or run against the real DB) for a real
// import. This keeps the paste → preview → import → publish UI walkable.
function devAssistant(action) {
  const batch = parseGoonetCarUrls(currentAssistantBody?.urls ?? '', { max: 5 });
  const preview = batch.urls.map(u => {
    const row = STOCK.find(r => String(r.goonet_id) === String(u.stock));
    if (!row) {
      return {
        source_url: u.input, url: u.url, stock_id: u.stock, status: 'unavailable',
        reason: 'the dev preview has no network access — the live server reads this page itself'
      };
    }
    return {
      source_url: u.input, url: u.url, stock_id: u.stock,
      make: row.make, model: row.model, title: row.model, year: row.year, km: row.km,
      price: row.price, price_jpy: row.price_jpy, price_usd: row.price_usd,
      fuel: row.fuel, body: row.body, location: row.location,
      photo_count: row.images?.length || 0, photos: row.images || [],
      quality: { pass: row.quality_score >= 70, score: row.quality_score || 0, reasons: [] },
      missing_fields: [], status: 'already_present', reason: 'already in Japan dealer stock (dev capture)'
    };
  });
  const rejected = batch.errors.map(e => ({ input: e.input, reason: e.reason }));
  if (action === 'preview_import') {
    return {
      ok: true, preview, rejected, limits: { maxUrls: 5, minPhotos: 5, minYear: 2000 },
      message: preview.length
        ? `${preview.filter(x => x.status === 'ready').length} of ${preview.length} URL(s) are ready to import.`
        : 'No Goo-net vehicle URLs in that request.'
    };
  }
  return {
    ok: true, preview, rejected, results: preview, inserted: 0,
    message: 'Nothing was imported — the dev preview has no network access. Import from the live CRM to write to Japan dealer stock.'
  };
}

let currentAssistantBody = null;

export function devApiMock() {
  return {
    name: 'ar7-dev-api-mock',
    configureServer(server) {
      server.middlewares.use('/api/goonet-stock', (req, res, next) => {
        res.setHeader('Content-Type', 'application/json');
        const action = new URL(req.url, 'http://localhost').searchParams.get('action');
        if (req.method === 'POST' && (action === 'preview_import' || action === 'import_urls')) {
          let raw = '';
          req.on('data', c => { raw += c; });
          req.on('end', () => {
            try { currentAssistantBody = JSON.parse(raw || '{}'); } catch { currentAssistantBody = {}; }
            res.end(JSON.stringify(devAssistant(action)));
          });
          return;
        }
        if (next && req.method !== 'GET' && req.method !== 'POST') return next();
        res.end(JSON.stringify(STOCK));
      });
    }
  };
}
