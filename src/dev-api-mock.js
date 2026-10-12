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

// ---------------------------------------------------------------------------
// AI Growth (CRM → AI Growth) in a key-less preview.
//
// The desk is a management area: it must be visible without a database, so the
// preview serves a small, clearly-marked example state — three configured
// agents, one run each, and DRAFTS waiting for review. It never claims anything
// was published, sent or posted, the run button explains that agents run on the
// deployed site, and the provider status reports "no key", which is the truth
// in a preview. Approve / reject / cancel / execute work in memory so the
// review flow can be walked end to end.
// ---------------------------------------------------------------------------
const DEV_AI = {
  generatedAt: '2026-10-11T07:05:00.000Z',
  demo: true,
  settings: { enabled: true, emergencyStop: false, dryRunDefault: true, maxRunsPerDay: 6, provider: 'gemini' },
  provider: { configured: false, name: 'formatter', model: 'gemini-3.8-flash', tier: 'free',
    note: 'Preview only: no GEMINI_API_KEY here, so drafts come from the no-key factual formatter.' },
  note: 'Read-only in this preview. Every draft below is a PROPOSAL: nothing has been published, sent or posted.',
  agents: [
    { id: 'dev-ai-leads', agent: 'leads', label: 'Lead Gen & CRM', enabled: true, paused: false, dry_run: true,
      max_items_per_run: 3, max_runs_per_day: 4, require_approval: true, autopublish: false, schedule_cron: '5 7 * * 1-5', timezone: 'Asia/Karachi' },
    { id: 'dev-ai-seo', agent: 'seo', label: 'SEO Engine', enabled: false, paused: false, dry_run: true,
      max_items_per_run: 2, max_runs_per_day: 2, require_approval: true, autopublish: false, schedule_cron: '35 6 * * 2,5', timezone: 'Asia/Karachi' },
    { id: 'dev-ai-social', agent: 'social', label: 'Social Media', enabled: false, paused: true, dry_run: true,
      max_items_per_run: 3, max_runs_per_day: 2, require_approval: true, autopublish: false, schedule_cron: '10 8 * * *', timezone: 'Asia/Karachi' }
  ],
  runs: [
    { id: 'dev-run-1', agent: 'leads', status: 'awaiting_review', mode: 'dry-run', trigger: 'manual',
      requested_by: 'Owner', created_at: '2026-10-11T07:05:00.000Z', started_at: '2026-10-11T07:05:01.000Z',
      finished_at: '2026-10-11T07:05:03.000Z', counts: { attempted: 1, succeeded: 1, skipped: 0, failed: 0, drafted: 1 },
      provider: { name: 'formatter', model: null, usage: null },
      steps: [
        { step: 'settings', state: 'ok', detail: 'AI Growth enabled; dry run; approval required' },
        { step: 'lease', state: 'ok', detail: 'lease acquired for this run only' },
        { step: 'enquiry', state: 'ok', detail: 'consent granted; contact allowed' },
        { step: 'readiness', state: 'ok', detail: 'scored with evidence (ar7-readiness-1)' },
        { step: 'stock-match', state: 'ok', detail: 'matched published, Available stock only' },
        { step: 'draft', state: 'ok', detail: 'reply draft prepared for review — nothing sent' }
      ] }
  ],
  drafts: [
    { id: 'dev-draft-1', agent: 'leads', run_id: 'dev-run-1', kind: 'lead-reply', status: 'awaiting_review',
      title: 'Reply draft — Toyota Harrier enquiry (Kenya)', target: '/machinery',
      created_at: '2026-10-11T07:05:03.000Z',
      body: 'Thank you for your enquiry.\n\nFor the 2021 Toyota Harrier you asked about, we can confirm the current stock and the export documents that travel with it. Freight and insurance to Mombasa are quoted per vessel booking, so the CIF figure is confirmed by quotation rather than estimated here.\n\nNext step: confirm your preferred vessel month and the receiving port, and we will send the quotation.',
      meta: {
        provider: null,
        enquirySummary: 'Enquiry about a Toyota Harrier, budget stated, ready to buy this week, destination Kenya.',
        cif: { available: false, label: 'Quotation required', missing: ['freight', 'insurance rate'] },
        score: { rubric: 'ar7-readiness-1', score: 7, max: 10,
          evidence: [{ points: 2, reason: 'Budget stated' }, { points: 2, reason: 'Stated timeframe ("this week")' },
            { points: 2, reason: 'Destination country named (Kenya)' }, { points: 1, reason: 'Named model' }],
          missing: ['Vessel month', 'Receiving port'],
          consent: { state: 'granted', mayContact: true },
          disclaimer: 'This score prioritises follow-up. It is not a credit check, a financial assessment or a judgement about the person.' },
        stock: { matches: [{ ref: 'AR7-EX-0001', name: 'Sany SY215C', href: '/machinery/excavator/AR7-EX-0001', priceBasis: 'Indicative FOB, USD (confirmed by quotation)', checkedAt: '2026-10-11T07:05:02.000Z' }] },
        warnings: ['Nothing has been sent. Sending requires an approved draft and a configured WhatsApp connection.']
      } },
    { id: 'dev-draft-2', agent: 'seo', run_id: null, kind: 'brief', status: 'awaiting_review',
      title: 'Research brief — Japan to Kenya car shipping documents', target: '/destinations/kenya',
      created_at: '2026-10-11T06:35:00.000Z',
      body: 'Evidence is not sufficient for a draft.\n\nWhat is missing: verified source notes (at least 80 characters) with dated references.\n\nNext step: collect dated, citable facts (port/route documentation, official notices) and record where each came from. Do not publish anything until the facts exist.',
      meta: { measured: false, sources: [], warnings: ['Speculative keyword idea — no measured search volume is claimed.'] } },
    { id: 'dev-draft-3', agent: 'social', run_id: null, kind: 'social-post', status: 'approved',
      title: 'Post — Sany SY215C (AR7-EX-0001)', target: 'AR7-EX-0001', created_at: '2026-10-11T08:10:00.000Z',
      approved_by: 'Owner',
      body: 'Sany SY215C — stock ref AR7-EX-0001\n2020 model year · 4,200 hours · Excavator · located in Shanghai\nIndicative FOB USD 88,000 — confirmed by quotation.\n\nAvailable from our China desk. DM or WhatsApp the stock ref for the full specification sheet and a CIF quotation to your port.',
      meta: { captions: { instagram: 'Sany SY215C — stock ref AR7-EX-0001 …', linkedin: 'Sany SY215C — stock ref AR7-EX-0001 …', whatsapp: 'Sany SY215C (stock AR7-EX-0001) listed for export by AR7 Traders' },
        altText: 'Yellow Sany SY215C excavator on a yard, photographed from the front left.',
        accounts: { instagram: 'not configured', linkedin: 'not configured', whatsapp: 'not configured' },
        publicationBlockers: ['No authorised Instagram connection is configured — approve exports the caption for a person to post.'],
        media: ['/assets/machinery/doosan-dx250lca-1.webp'], specCard: 'Sany SY215C · 2020 · 4,200 h · Shanghai · FOB USD 88,000 (indicative)' } }
  ],
  locks: [],
  usage: [{ id: 'dev-usage-1', provider: 'formatter', feature: 'leads', day: '2026-10-11', requests: 1, tokens_in: 0, tokens_out: 0, errors: 0, last_state: 'no provider key — factual formatter used' }]
};
DEV_AI.counts = {
  awaitingReview: DEV_AI.drafts.filter(d => d.status === 'awaiting_review').length,
  approved: DEV_AI.drafts.filter(d => d.status === 'approved').length,
  executed: DEV_AI.drafts.filter(d => d.status === 'executed').length,
  failed: DEV_AI.runs.filter(r => ['failed', 'partially_completed'].includes(r.status)).length,
  running: DEV_AI.runs.filter(r => r.status === 'running').length
};

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

      // Machinery list, as production answers when the migration has not been
      // run. Without this branch the preview always looks healthy, and the one
      // failure the desk exists to explain cannot be seen. ?dev=stranded forces
      // it; the default ?machinery=doctor answer mirrors machineryDoctor().
      server.middlewares.use('/api/site-content', (req, res, next) => {
        const params = new URL(req.url, 'http://localhost').searchParams;
        if (params.get('machinery') !== 'doctor') return next();
        res.setHeader('Content-Type', 'application/json');
        const healthy = !String(params.get('dev') || '').includes('stranded');
        return res.end(JSON.stringify(healthy ? {
          ok: true, readOnly: true, storage: { ok: true, state: 'ok', table: 'machinery', migration: null },
          catalogue: { source: 'database', note: 'Reading stored machines.' }, inventory: { total: 12, published: 12, hiddenImported: 0 },
          checks: [
            { name: 'Machinery storage readable', ok: true, detail: 'public.machinery answered 12 row(s).' },
            { name: 'Public catalogue source', ok: true, detail: 'Database rows are being served (not the built-in fallback).', fix: null },
            { name: 'Hidden eligible imports', ok: true, detail: 'No hidden published-eligible imports.', fix: null }
          ],
          ownerAction: null, note: 'Read-only diagnostic. Nothing was changed.'
        } : {
          ok: false, readOnly: true, storage: { ok: false, state: 'missing-table', table: 'machinery', migration: 'supabase/MIGRATION-2026-10-machinery.sql' },
          catalogue: { source: 'built-in-fallback', note: 'The public catalogue is showing the catalogue that ships with the site.' },
          inventory: { total: 0, published: 0 },
          checks: [
            { name: 'Machinery storage readable', ok: false, detail: "Could not find the table 'public.machinery' in the schema cache", fix: 'Run supabase/MIGRATION-2026-10-machinery.sql in the Supabase SQL editor, then run: select pg_notify(\'pgrst\',\'reload schema\');' },
            { name: 'Public catalogue source', ok: false, detail: 'The public catalogue is showing the built-in fallback, so imports cannot appear on the website.', fix: 'Apply the migration above, then reload the schema cache.' },
            { name: 'Hidden eligible imports', ok: false, detail: 'Cannot be checked while the storage is missing.', fix: null }
          ],
          ownerAction: 'Run supabase/MIGRATION-2026-10-machinery.sql in the Supabase SQL editor, then run: select pg_notify(\'pgrst\',\'reload schema\');',
          note: 'Read-only diagnostic. Nothing was changed.'
        }));
      });

      // AI Growth (CRM → AI Growth) and the provider status the desk tests.
      // Read the DEV_AI block above for what this preview does and does not claim.
      server.middlewares.use('/api/site-content', (req, res, next) => {
        const params = new URL(req.url, 'http://localhost').searchParams;
        const agentsAction = params.get('agents');
        const seoAction = params.get('seo');
        if (!agentsAction && seoAction !== 'ai-status') return next();
        let raw = '';
        req.on('data', c => { raw += c; });
        req.on('end', () => {
          let body = {};
          try { body = JSON.parse(raw || '{}'); } catch { body = {}; }
          res.setHeader('Content-Type', 'application/json');
          const reply = payload => res.end(JSON.stringify({ ...payload, demo: true }));
          const draft = id => DEV_AI.drafts.find(d => String(d.id) === String(id));
          if (seoAction === 'ai-status') {
            return reply({
              provider: 'formatter',
              gemini: { configured: false, model: 'gemini-3.8-flash', defaultModel: 'gemini-3.8-flash', tier: 'free' },
              openai: { configured: false, model: 'gpt-4o-mini', enabled: false },
              formatter: { available: true, note: 'The factual formatter needs no key and never invents anything.' },
              note: 'Preview: GEMINI_API_KEY is not set here. Deploy with the key to enable generated drafts. This code never enables billing and never falls back to a paid provider.',
              connectionTest: { ok: false, state: 'no-key', model: 'gemini-3.8-flash', keyHint: null, latencyMs: null,
                message: 'GEMINI_API_KEY is not set in this preview.',
                ownerAction: 'Add GEMINI_API_KEY in Vercel → Settings → Environment Variables (Production, Preview and Development), then redeploy.' }
            });
          }
          if (agentsAction === 'overview') return reply({ ...DEV_AI, counts: { ...DEV_AI.counts } });
          if (agentsAction === 'config') return reply({ agents: DEV_AI.agents, settings: DEV_AI.settings });
          if (agentsAction === 'draft') return reply({ draft: draft(params.get('id')) || null, run: null, messages: [] });
          if (agentsAction === 'approve') {
            const d = draft(body.id);
            if (!d) return reply({ error: 'Draft not found' });
            d.status = body.approve === false ? 'rejected' : 'approved';
            DEV_AI.counts = { ...DEV_AI.counts,
              awaitingReview: DEV_AI.drafts.filter(x => x.status === 'awaiting_review').length,
              approved: DEV_AI.drafts.filter(x => x.status === 'approved').length };
            return reply(d);
          }
          if (agentsAction === 'cancel') {
            const d = draft(body.id);
            if (d) d.status = 'cancelled';
            return reply(d || { error: 'Draft not found' });
          }
          if (agentsAction === 'execute') {
            const d = draft(body.id);
            if (!d) return reply({ error: 'Draft not found' });
            d.status = 'executed';
            d.result = { action: d.kind === 'brief' ? 'article-created' : 'message-prepared', demo: true,
              note: d.kind === 'article' || d.kind === 'brief'
                ? 'Preview: a real run saves an UNPUBLISHED draft in News & guides.'
                : 'Preview: a real run prepares the message; nothing is sent without a configured connection.' };
            return reply({ state: 'executed', draft: d, result: d.result });
          }
          if (agentsAction === 'config-update') {
            if (body.agent) { const a = DEV_AI.agents.find(x => x.agent === body.agent); if (a) Object.assign(a, body.agent === a.agent ? Object.fromEntries(Object.entries(body).filter(([k]) => k !== 'agent')) : {}); return reply(a || { error: 'Unknown agent' }); }
            if (body.global) { Object.assign(DEV_AI.settings, {
              enabled: 'ai_growth_enabled' in body.global ? body.global.ai_growth_enabled === true || body.global.ai_growth_enabled === 'true' : DEV_AI.settings.enabled,
              emergencyStop: 'ai_growth_emergency_stop' in body.global ? body.global.ai_growth_emergency_stop === true || body.global.ai_growth_emergency_stop === 'true' : DEV_AI.settings.emergencyStop
            }); }
            return reply({ ok: true, settings: DEV_AI.settings });
          }
          if (agentsAction === 'run' || agentsAction === 'run-scheduled') {
            return reply({ state: 'preview', results: [],
              reason: 'This preview has no database or provider key, so an agent cannot run here. On the deployed site the run is bounded, leased and idempotent, and stops immediately if the emergency stop is on or the agent is disabled.' });
          }
          return reply({ error: `Unknown AI Growth action: ${agentsAction || seoAction}` });
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
