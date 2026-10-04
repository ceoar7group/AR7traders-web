// Dev-only mock for /api/goonet-stock so the "Japan dealer stock" page has
// something to show in local previews (no Supabase keys needed). Never used
// in production — Vercel routes /api/* to the real serverless functions.
//
// The rows are not hand-written: they are built from a real goo-net capture
// (scripts/fixtures/goonet-capture-2026-08-31.json) through the same
// goonet-core maths the live importer uses, so the preview shows exactly what
// `node scripts/goonet-seed.mjs --push` writes to Supabase.
//
// Since 2026-10-04 it also mocks /api/site-content?import=machinery (the
// scraper + confirm steps) so the machinery desk's Run scraper → preview →
// import walk works in a key-less preview. It runs the REAL scraper module
// against fixture pages — the sandbox has no egress to made-in-china.com —
// and keeps imported machines in memory.
import { readCapture, buildSeedRows } from '../scripts/goonet-seed.mjs';
import { parseGoonetCarUrls } from '../scripts/goonet-core.mjs';
import { runScraper, SCRAPER_ORIGIN, SCRAPER_CATEGORIES } from '../api/_machinery-scraper.js';
import { toRow, planImport, applyImport } from '../api/_machinery-import.js';
import { toPublic } from '../api/_machinery.js';

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

// ---- machinery scraper fixtures --------------------------------------------
// The preview sandbox cannot reach made-in-china.com, so the real scraper runs
// against these fixture pages instead: one category page per machine type and
// three product pages each, shaped like the live site (JSON-LD + spec table +
// one watermarked marketplace photo per machine, which the owner's policy
// filters at import). The real robots.txt → category → product order, the
// dedupe and the preview shape are all exercised — only the host is fake.
const DEV_HOST = 'dev-supplier.en.made-in-china.com';
const DEV_TITLES = {
  excavators: ['Doosan Dx300lc Crawler Excavator', 'Sany Sy215c Hydraulic Excavator', 'Komatsu Pc200 Used Excavator'],
  loaders: ['SDLG LG956L Wheel Loader', 'LiuGong CLG856H Wheel Loader', 'XCMG LW500KN Front Loader'],
  trucks: ['Sinotruk HOWO 6x4 Dump Truck', 'Shacman F3000 Tipper Truck', 'HOWO 371HP Cargo Truck'],
  cranes: ['XCMG QY25K Truck Crane', 'Zoomlion ZTC250 Truck Crane', 'Sany STC250H Mobile Crane']
};
const devProductUrl = (cat, i) => `https://${DEV_HOST}/product/dev-${cat}-${i}/China-${DEV_TITLES[cat][i].replace(/[^A-Za-z0-9]+/g, '-')}.html`;
const devProductPage = (cat, i) => {
  const title = DEV_TITLES[cat][i];
  const price = 12000 + (i + 1) * 7500 + cat.length * 100;
  return `<!doctype html><html><head><title>${title} for sale</title>
<script type="application/ld+json">{"@type":"Product","name":"${title}","offers":{"price":${price},"priceCurrency":"USD"},"image":["https://cdn.dev-supplier.example/${cat}-${i}-a.jpg","https://image.made-in-china.com/202f0j00dev/${cat}-${i}-marked.webp"]}</script>
</head><body><h1>${title}</h1>
<table><tr><th>Condition</th><td>Used</td></tr><tr><th>Year</th><td>2021</td></tr></table>
</body></html>`;
};
const devCategoryPage = cat => '<!doctype html><html><body>' +
  DEV_TITLES[cat].map((t, i) => `<a href="${devProductUrl(cat, i)}">${t}</a>`).join('') +
  '</body></html>';

async function devScraperFetch(url) {
  const u = String(url);
  const pages = {
    'https://www.made-in-china.com/robots.txt': 'User-agent: *\nDisallow: /sendInquiry/\nDisallow: /*html?*',
    [`https://${DEV_HOST}/robots.txt`]: 'User-agent: *\nDisallow: /print/'
  };
  for (const cat of Object.keys(DEV_TITLES)) {
    pages[SCRAPER_ORIGIN + SCRAPER_CATEGORIES[cat]] = devCategoryPage(cat);
    DEV_TITLES[cat].forEach((_, i) => { pages[devProductUrl(cat, i)] = devProductPage(cat, i); });
  }
  const hit = pages[u];
  return hit
    ? { ok: true, status: 200, text: hit, networkError: false }
    : { ok: false, status: 404, text: '', networkError: false };
}

// In-memory machinery store + the minimum Supabase query shape the importer
// uses. Machines imported in the preview survive until the dev server stops.
const DEV_MACHINES = [];
function devMachineryDb() {
  const clone = r => JSON.parse(JSON.stringify(r));
  let seq = 0;
  return {
    from(table) {
      const api = {
        _f: [], _m: 'select', _p: null, _single: false,
        select() { return api; }, order() { return api; }, limit() { return api; },
        eq(c, v) { api._f.push([c, v]); return api; },
        insert(p) { api._m = 'insert'; api._p = p; return api; },
        update(p) { api._m = 'update'; api._p = p; return api; },
        single() { api._single = true; return api; },
        then(resolve) {
          if (table !== 'machinery') return resolve({ data: [], error: null });
          const hits = DEV_MACHINES.filter(r => api._f.every(([c, v]) => String(r[c]) === String(v)));
          if (api._m === 'insert') { const row = { id: 'dev-m-' + (++seq), ...clone(api._p) }; DEV_MACHINES.push(row); return resolve({ data: clone(row), error: null }); }
          if (api._m === 'update') { for (const r of hits) Object.assign(r, clone(api._p)); return resolve({ data: hits[0] ? clone(hits[0]) : null, error: null }); }
          if (api._single) return resolve({ data: hits[0] ? clone(hits[0]) : null, error: null });
          return resolve({ data: hits.map(clone), error: null });
        }
      };
      return api;
    }
  };
}

export function devApiMock() {
  return {
    name: 'ar7-dev-api-mock',
    configureServer(server) {
      server.middlewares.use('/api/goonet-stock', (req, res, next) => {
        res.setHeader('Content-Type', 'application/json');
        const actionFromQuery = new URL(req.url, 'http://localhost').searchParams.get('action');
        if (req.method === 'POST' && (actionFromQuery === 'preview_import' || actionFromQuery === 'import_urls')) {
          let raw = '';
          req.on('data', c => { raw += c; });
          req.on('end', () => {
            let body = {};
            try { body = JSON.parse(raw || '{}'); } catch { body = {}; }
            currentAssistantBody = body;
            // The real function reads the action from the query string OR the
            // body — the CRM sends both. Mirror that here so the local preview
            // cannot drift from production again.
            res.end(JSON.stringify(devAssistant(body.action || actionFromQuery)));
          });
          return;
        }
        if (next && req.method !== 'GET' && req.method !== 'POST') return next();
        res.end(JSON.stringify(STOCK));
      });

      // Machinery import agent — scraper + confirm, running the REAL modules
      // against the fixtures above (no egress in a preview sandbox). step=preview
      // is honest about having no network; step=scraper previews; step=confirm
      // writes into the in-memory store so the desk can show the machine.
      server.middlewares.use('/api/site-content', (req, res, next) => {
        const params = new URL(req.url, 'http://localhost').searchParams;
        if (params.get('import') !== 'machinery') return next();
        let raw = '';
        req.on('data', c => { raw += c; });
        req.on('end', async () => {
          let body = {};
          try { body = JSON.parse(raw || '{}'); } catch { body = {}; }
          res.setHeader('Content-Type', 'application/json');
          const step = String(params.get('step') || body.step || '');
          try {
            if (step === 'scraper') {
              // The 1-second politeness pause is skipped in the preview: the
              // pages are local fixtures, and production keeps the real delay.
              const out = await runScraper(devMachineryDb(), {
                category: body.category || null,
                fetch: devScraperFetch,
                sleep: () => Promise.resolve()
              });
              return res.end(JSON.stringify(out));
            }
            if (step === 'confirm') {
              const db = devMachineryDb();
              const candidates = Array.isArray(body.machines) ? body.machines : [];
              const rows = candidates.map(m => (m && m.row)
                ? m.row
                : toRow(m, { rights: m?.source?.rights || body.rights || null, adapter: m?.source?.adapter || 'product-page' }));
              const { data: existing } = await db.from('machinery').select('*');
              const plan = planImport(Array.isArray(existing) ? existing : [], rows);
              const result = await applyImport(db, plan, { id: 'dev', full_name: 'Dev preview' });
              const { data: fresh } = await db.from('machinery').select('*');
              return res.end(JSON.stringify({
                imported: result.created.length,
                updated: result.updated.length,
                rePriced: result.rePriced,
                skipped: result.skipped,
                invalid: result.invalid,
                failed: result.failed,
                machines: (fresh || []).map(toPublic)
              }));
            }
            return res.end(JSON.stringify({
              error: 'The dev preview has no network access — paste-a-link preview runs on the deployed site. Use Run scraper here.'
            }));
          } catch (e) {
            res.statusCode = 500;
            return res.end(JSON.stringify({ error: e.message }));
          }
        });
      });

      // Dev-only crash reporter. The error boundary in src/main.jsx posts here
      // when the app fails to render, so a report from a preview pane that the
      // developer cannot open a console in still lands in the dev server log.
      // Never part of the production build (this plugin is dev-only).
      server.middlewares.use('/api/__client-error', (req, res) => {
        let raw = '';
        req.on('data', c => { raw += c; });
        req.on('end', () => {
          let body = {};
          try { body = JSON.parse(raw || '{}'); } catch { body = { raw: raw.slice(0, 500) }; }
          const lines = [
            '──────────── AR7 CLIENT RENDER ERROR ────────────',
            `time      : ${body.time || new Date().toISOString()}`,
            `page      : ${body.url || '?'}  viewport ${body.w || '?'}x${body.h || '?'}`,
            `message   : ${body.message || '(none)'}`,
            `component : ${String(body.componentStack || '').split('\n').filter(Boolean).slice(0, 6).join(' <- ') || '(no component stack)'}`
          ];
          if (body.stack) lines.push('stack     :\n' + String(body.stack).split('\n').slice(0, 8).join('\n'));
          lines.push('─────────────────────────────────────────────────');
          console.warn(lines.join('\n'));
          res.setHeader('Content-Type', 'application/json');
          res.end(JSON.stringify({ ok: true }));
        });
      });
    }
  };
}
