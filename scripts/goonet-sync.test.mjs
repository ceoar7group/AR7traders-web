#!/usr/bin/env node
// Integration test for the Vercel importer (api/goonet-sync.js) run flow.
// Uses an in-memory Supabase-shaped client and a mocked global.fetch that
// serves fixture HTML — no network, no real database. Run:
//   node scripts/goonet-sync.test.mjs
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

let pass = 0, fail = 0;
function ok(cond, name) {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name); }
}
function eq(a, b, name) {
  const same = JSON.stringify(a) === JSON.stringify(b);
  if (same) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error(`  ✗ ${name}\n      expected ${JSON.stringify(b)}\n      received ${JSON.stringify(a)}`); }
}

const dir = path.dirname(fileURLToPath(import.meta.url));

// ---- Tiny in-memory database shaped like the Supabase query builder -------
function memDb() {
  const tables = {};
  function from(name) {
    const rows = tables[name] || (tables[name] = []);
    function q() {
      const ctx = { filters: [], order: null, limitN: null, cols: ['*'] };
      const api = {
        select: (...cols) => {
          ctx.cols = cols.length ? cols.flatMap(c => String(c).split(',').map(s => s.trim()).filter(Boolean)) : ['*'];
          return api;
        },
        eq: (k, v) => { ctx.filters.push(r => r[k] === v); return api; },
        lt: (k, v) => { ctx.filters.push(r => r[k] < v); return api; },
        gte: (k, v) => { ctx.filters.push(r => r[k] >= v); return api; },
        order: (k, opts = {}) => {
          ctx.order = (a, b) => {
            const av = a[k], bv = b[k];
            if (av == null && bv == null) return 0;
            if (av == null) return 1;
            if (bv == null) return -1;
            const c = String(av).localeCompare(String(bv), undefined, { numeric: true });
            return opts.ascending === false ? -c : c;
          };
          return api;
        },
        limit: n => { ctx.limitN = n; return api; },
        _rows() {
          let out = rows.filter(r => ctx.filters.every(f => f(r)));
          if (ctx.order) out = out.slice().sort(ctx.order);
          if (ctx.limitN) out = out.slice(0, ctx.limitN);
          if (ctx.cols[0] === '*') return out;
          return out.map(r => Object.fromEntries(ctx.cols.map(c => [c, r[c]])));
        },
        maybeSingle: async () => ({ data: api._rows()[0] || null, error: null }),
        single: async () => {
          const r = api._rows()[0];
          return r ? { data: r, error: null } : { data: null, error: new Error('not found') };
        },
        // Supabase query builders are thenable — awaiting resolves {data, error}.
        then(resolve) { return resolve({ data: api._rows(), error: null }); },
        catch() { return Promise.resolve({ data: [], error: new Error('cancelled') }); }
      };
      return api;
    }
    return {
      select: (...cols) => q().select(...cols),
      eq: (k, v) => q().eq(k, v),
      lt: (k, v) => q().lt(k, v),
      gte: (k, v) => q().gte(k, v),
      order: (k, o) => q().order(k, o),
      limit: n => q().limit(n),
      maybeSingle: async () => q().maybeSingle(),
      single: async () => q().single(),
      async insert(rowsIn) {
        for (const r of (Array.isArray(rowsIn) ? rowsIn : [rowsIn])) {
          rows.push({ ...r, id: r.id || 'id-' + Math.random().toString(36).slice(2) });
        }
        return { error: null };
      },
      update(patch) {
        // Chainable like Supabase: .update(patch).eq(k, v) → await for {error}.
        const chain = q();
        chain.then = resolve => {
          chain._rows().forEach(r => Object.assign(r, patch));
          return resolve({ error: null });
        };
        return chain;
      },
      delete() {
        const chain = q();
        chain.then = resolve => {
          const doomed = chain._rows();
          doomed.forEach(r => { const i = rows.indexOf(r); if (i >= 0) rows.splice(i, 1); });
          return resolve({ error: null });
        };
        return chain;
      },
      async upsert(list) {
        for (const item of (Array.isArray(list) ? list : [list])) {
          const existing = rows.find(r => r.key === item.key);
          if (existing) Object.assign(existing, item);
          else rows.push({ ...item });
        }
        return { error: null };
      }
    };
  }
  return {
    db: {
      from,
      auth: { getUser: async () => ({ data: { user: { id: 'u1', email: 'admin@ar7traders.com' } }, error: null }) }
    },
    tables
  };
}

// ---- Fixtures --------------------------------------------------------------
const listingHtml = readFileSync(path.join(dir, 'fixtures/goonet-listing.html'), 'utf8');
const detailHtml = readFileSync(path.join(dir, 'fixtures/goonet-detail.html'), 'utf8');
const notFoundHtml = '<html><body>ページが見つかりません。　Not,found.</body></html>';

// ---- Import the handler with the fixture-driven fetch ----------------------
const { db, tables } = memDb();
const seedSettings = [
  ['goonet_min_photos', '3'],
  ['goonet_max_new_per_run', '2'],
  ['goonet_max_delist_per_run', '2'],
  ['goonet_weekly_delist_limit', '1'],
  ['goonet_weekly_promote_limit', '1'],
  ['goonet_auto_promote', 'true'],
  ['goonet_jpy_usd_rate', '0.0068'],
  ['goonet_bookmark_page', '1'],
  ['goonet_search_url', 'https://www.goo-net.com/usedcar/price--100/']
];
tables.site_settings = seedSettings.map(([key, value]) => ({ key, value }));
// One existing car that is "delisted" on goo-net (its url returns 404).
tables.japan_dealer_stock = [{
  id: 'old-1', goonet_id: '988026062900208975002', stock_no: '988026062900208975002',
  make: 'Nissan', model: 'Note', available: true, promoted: 'none',
  goonet_url: 'https://www.goo-net.com/usedcar/spread/goo/15/988026062900208975002.html',
  last_seen_at: '2026-01-01T00:00:00Z', imported_at: '2026-01-01T00:00:00Z', quality_score: 50
}];

const fetchCalls = [];
global.fetch = async (url) => {
  const u = String(url);
  fetchCalls.push(u);
  let body = '';
  let status = 200;
  if (u === 'https://www.goo-net.com/') { body = '<html><body>goo-net</body></html>'; }
  else if (u.startsWith('https://r.jina.ai/')) { body = ''; status = 500; }
  else if (u.includes('/usedcar/spread/goo/15/988026062900208975002')) { body = notFoundHtml; }
  else if (u.includes('/usedcar/spread/goo/15/988026081900208975001')) { body = detailHtml; }
  else if (u.includes('summary.php')) { body = listingHtml; }
  else if (u.includes('/usedcar/spread/goo/')) { body = detailHtml; }
  else { status = 404; }
  return { ok: status < 400, status, text: async () => body };
};

const { default: handler } = await import('../api/goonet-sync.js');

function fakeRes() {
  const r = { statusCode: 0, body: null };
  r.status = code => { r.statusCode = code; return r; };
  r.setHeader = () => {};
  r.end = json => { r.body = JSON.parse(json); };
  return r;
}

const req = { method: 'POST', query: { key: 'test-key' }, headers: {} };
process.env.GOONET_SYNC_KEY = 'test-key';

const res = fakeRes();
await handler(req, res, { db });

// ---- Assertions -------------------------------------------------------------
const stock = tables.japan_dealer_stock;
const settings = Object.fromEntries(tables.site_settings.map(r => [r.key, r.value]));
const inserted = stock.filter(r => r.goonet_id === '988026081900208975001');
const delistedOld = stock.find(r => r.id === 'old-1');
const activities = tables.activities || [];

ok(res.statusCode === 200, 'handler responded 200');
ok(stock.length >= 2, 'run inserted at least one new car');
ok(inserted[0]?.make === 'Honda' && inserted[0]?.model === 'N-BOX', 'inserted car has parsed make/model');
ok(inserted[0]?.year === 2014, 'inserted car has year');
ok(inserted[0]?.photo_count >= 3, 'inserted car passed the photo gate');
ok(inserted[0]?.quality_score > 0, 'inserted car has a quality score');
ok(delistedOld?.available === false, 'delisted car marked unavailable');
ok(Number(settings.goonet_bookmark_page) === 2, 'bookmark advanced to page 2');
ok(fetchCalls.length >= 3, 'fetch was called for listing + detail + delist check');
ok(fetchCalls.some(u => u.includes('summary.php')), 'the listing page was fetched');
ok(fetchCalls[0].includes('summary.php'), 'the exchange listing needs no warm-up — the first call is the listing itself');
ok(fetchCalls.indexOf('https://www.goo-net.com/') > 0
  && fetchCalls.indexOf('https://www.goo-net.com/') < fetchCalls.findIndex(u => u.includes('/usedcar/spread/goo/')),
  'the cookie jar is still warmed against goo-net before the first domestic detail fetch');
ok(activities.length >= 1, 'activity log written');
ok(activities.some(a => String(a.action || '').includes('Delisted')), 'delist logged');
ok(!fetchCalls.some(u => u === 'https://r.jina.ai/https://www.goo-net-exchange.com/php/search/summary.php?b_to_b_price_max=1000000&search_type=price_search'),
  'no relay needed when goo-net answers with a real listing page');
ok(!fetchCalls.some(u => u.startsWith('https://r.jina.ai/') && u.includes('988026062900208975002')),
  'delist checks never go through the relay');
ok(res.body?.note !== 'goo-net blocked the direct request (bot protection) — page fetched via relay.',
  'no bot-protection note on a healthy direct run');

// ---- Second run: goo-net serves the bot-gate stub, relay rescues it --------
const { resetFetchState } = await import('./goonet-core.mjs');
resetFetchState();

const stubHtml = '<html><body><a href="https://www.goo-net.com/usedcar/spread/goo/15/700100218030260418003.html">car</a>セキュリティ</body></html>';
const relayCalls = [];
const db2 = memDb();
db2.tables.site_settings = seedSettings.map(([key, value]) => ({ key, value }));
db2.tables.japan_dealer_stock = [];

global.fetch = async (url) => {
  const u = String(url);
  let body = '', status = 200;
  if (u === 'https://www.goo-net.com/') body = '<html><body>goo-net</body></html>';
  else if (u.startsWith('https://r.jina.ai/')) { relayCalls.push(u); body = listingHtml; }
  else if (u.includes('/usedcar/spread/goo/')) body = detailHtml;
  else body = stubHtml;
  return { ok: status < 400, status, text: async () => body };
};

const res2 = fakeRes();
await handler(req, res2, { db: db2.db });

ok(res2.statusCode === 200, 'stub run still responds 200');
ok(relayCalls.some(u => u === 'https://r.jina.ai/https://www.goo-net-exchange.com/php/search/summary.php?b_to_b_price_max=1000000&search_type=price_search'),
  'the stub listing page was re-fetched through the relay');
ok(res2.body?.cardsSeen >= 2, 'relayed page yields real cards instead of the 1-card stub');
ok(res2.body?.note === 'goo-net blocked the direct request (bot protection) — page fetched via relay.',
  'report explains the bot gate');
ok(db2.tables.japan_dealer_stock.length >= 1, 'cars are imported from the relayed page');

// ---- Third run: bot gate AND the relay is down → say so, hold the bookmark --
resetFetchState();

// Shaped like the real thing: the gate still links one car, so the page parses
// as exactly 1 card. 1 is truthy — that is what made the old bookmark rule
// advance past a page nobody read.
const gatedStubHtml = '<html><body>セキュリティによるアクセス制限 <ul>'
  + '<li><h3><a href="https://www.goo-net.com/usedcar/spread/goo/15/700100218030260418003.html">'
  + 'ホンダ N-BOX カスタム</a></h3><span>車両本体価格 98.0万円</span></li></ul></body></html>';

const db3 = memDb();
db3.tables.site_settings = seedSettings.map(([key, value]) => ({ key, value }));
// One live car on the books: a run that read nothing must not touch it.
db3.tables.japan_dealer_stock = [{
  id: 'old-1', goonet_id: '988026062900208975002', stock_no: '988026062900208975002',
  make: 'Nissan', model: 'Note', available: true, promoted: 'none',
  goonet_url: 'https://www.goo-net.com/usedcar/spread/goo/15/988026062900208975002.html',
  last_seen_at: '2026-01-01T00:00:00Z', imported_at: '2026-01-01T00:00:00Z', quality_score: 50
}];

global.fetch = async (url) => {
  const u = String(url);
  let body = '', status = 200;
  if (u === 'https://www.goo-net.com/') body = '<html><body>goo-net</body></html>';
  else if (u.startsWith('https://r.jina.ai/')) { body = ''; status = 500; } // relay unavailable
  else if (u.includes('/usedcar/') || u.includes('summary.php')) body = gatedStubHtml; // every page is the stub
  else body = '<html><body>goo-net</body></html>';
  return { ok: status < 400, status, text: async () => body };
};

const res3 = fakeRes();
await handler(req, res3, { db: db3.db });

const settings3 = Object.fromEntries(db3.tables.site_settings.map(r => [r.key, r.value]));

ok(res3.statusCode === 200 && res3.body?.blocked === true, 'a blocked run answers 200 and says blocked:true');
ok(res3.body?.cardsSeen === 1, 'the stub is counted as 1 card, not mistaken for a real listing');
ok(Number(settings3.goonet_bookmark_page) === 1, 'the bookmark is held on the stub — never advanced past it');
ok(res3.body?.note !== 'Nothing new this run — the importer is caught up or still quality-gating.',
  'a blocked run is never reported as "caught up"');
ok(res3.body?.diagnostics?.relayAttempted === true && res3.body.diagnostics.finalStub === true,
  'blocked runs report diagnostics (relay attempted, page still a stub)');
ok(db3.tables.japan_dealer_stock.find(r => r.id === 'old-1')?.available !== false,
  'a blocked run does not delist live inventory');


// ---- Fourth run: a REAL listing page our parser cannot read ----------------
// The live incident: 50 car links in 1.1 MB of HTML that also mentions cookies.
// Must be reported as a parse miss — not as goo-net blocking us — must not burn
// the 8s budget on a relay round-trip, and must still finish the run's work.
resetFetchState();

const carLink = i => `<a href="https://www.goo-net.com/usedcar/spread/goo/15/LIVE${i}.html">car</a>`;
const realButUnparsable = '<html><body><a href="/policy/cookie">Cookie</a> Cookie conditions '
  + Array.from({ length: 50 }, (_, i) => carLink(i)).join('') + '</body></html>';

const db4 = memDb();
db4.tables.site_settings = seedSettings.map(([key, value]) => ({ key, value }));
db4.tables.japan_dealer_stock = [{
  id: 'old-1', goonet_id: '988026062900208975002', stock_no: '988026062900208975002',
  make: 'Nissan', model: 'Note', available: true, promoted: 'none',
  goonet_url: 'https://www.goo-net.com/usedcar/spread/goo/15/988026062900208975002.html',
  last_seen_at: '2026-01-01T00:00:00Z', imported_at: '2026-01-01T00:00:00Z', quality_score: 50
}];

const relayCalls4 = [];
global.fetch = async (url) => {
  const u = String(url);
  let body = '', status = 200;
  if (u.startsWith('https://r.jina.ai/')) { relayCalls4.push(u); body = ''; status = 500; }
  else if (u === 'https://www.goo-net.com/') body = '<html><body>goo-net</body></html>';
  else if (u.includes('988026062900208975002')) body = notFoundHtml;  // that car really is gone
  else body = realButUnparsable;
  return { ok: status < 400, status, text: async () => body };
};

const res4 = fakeRes();
await handler(req, res4, { db: db4.db });
const settings4 = Object.fromEntries(db4.tables.site_settings.map(r => [r.key, r.value]));

ok(res4.body?.blocked === false, 'a page we failed to parse is not blamed on the bot gate');
ok(relayCalls4.length === 0, 'no relay round-trip is burned on a page full of car links');
ok(res4.body?.parseMiss === true && res4.body?.diagnostics?.rawCarLinks === 50,
  'the report names the parse miss and how many links it saw');
ok(Number(settings4.goonet_bookmark_page) === 1, 'a parse miss still holds the bookmark — no blind crawling');
ok(db4.tables.japan_dealer_stock.find(r => r.id === 'old-1')?.available === false,
  'a parse-miss run still does its delist work');


// ---- Fifth run: the crawl took its time — the import loop must still run ----
// Regression: one 8s budget was measured from the start of the request, and the
// crawl (direct fetch + relay + rescue) could eat all of it, so the import loop
// began already over budget and the run reported `inserted: 0` after reading
// goo-net perfectly. The listing fetch below sleeps past that old limit.
resetFetchState();
const sleep = ms => new Promise(r => setTimeout(r, ms));
const db5 = memDb();
db5.tables.site_settings = seedSettings.map(([key, value]) => ({ key, value }));
db5.tables.japan_dealer_stock = [];

global.fetch = async (url) => {
  const u = String(url);
  if (u === 'https://www.goo-net.com/') return { ok: true, status: 200, text: async () => '<html>home</html>' };
  if (u.startsWith('https://r.jina.ai/')) return { ok: true, status: 200, text: async () => listingHtml };
  if (u.includes('summary.php')) {
    await sleep(8300);                       // a slow, stubbed first answer
    return { ok: true, status: 200, text: async () => '<html><body>セキュリティ</body></html>' };
  }
  return { ok: true, status: 200, text: async () => detailHtml };
};

const res5 = fakeRes();
await handler(req, res5, { db: db5.db });
ok(res5.statusCode === 200, 'the slow-crawl run still responds 200');
ok(res5.body?.cardsSeen >= 2, 'the slow crawl still read the listing (via the relay)');
ok(res5.body?.inserted >= 1,
  `a slow crawl does not starve the import loop (inserted ${res5.body?.inserted})`);
ok(db5.tables.japan_dealer_stock.length >= 1, 'cars from a slow run really reached the table');

// ---- Sixth run: a card whose title link did not parse -----------------------
// parseCard only builds a url from an <h3><a href=…spread…>. When goo-net ships
// different card markup the card still has a stock id, and the canonical detail
// URL can be rebuilt from it — the old code fetched `null`, logged "detail
// fetch failed" and dropped the car.
resetFetchState();
const noTitleCard = i => `<div class="searchResult">
  <a href="https://www.goo-net.com/usedcar/spread/goo/15/NOTITLE000${i}.html"><img src="https://picture1.goo-net.com/a/Q/p0${i}.jpg"></a>
  <p>トヨタ</p>
  <div class="carName"><a href="https://www.goo-net.com/usedcar/spread/goo/15/NOTITLE000${i}.html">プリウス Ｓ</a></div>
  <p>車両本体価格(税込)</p><p>120万円</p>
  <p>年式2020年</p><p>走行距離3.2万km</p><p>修復歴なし</p>
</div>`;
const noTitleListing = `<html><body>${noTitleCard(1)}${noTitleCard(2)}</body></html>`;
const db6 = memDb();
db6.tables.site_settings = seedSettings.map(([key, value]) => ({ key, value }));
db6.tables.japan_dealer_stock = [];
const detailUrls6 = [];

global.fetch = async (url) => {
  const u = String(url);
  if (u === 'https://www.goo-net.com/') return { ok: true, status: 200, text: async () => '<html>home</html>' };
  if (u.includes('summary.php')) return { ok: true, status: 200, text: async () => noTitleListing };
  if (u.includes('/usedcar/spread/goo/')) { detailUrls6.push(u); return { ok: true, status: 200, text: async () => detailHtml }; }
  return { ok: false, status: 404, text: async () => '' };
};

const res6 = fakeRes();
await handler(req, res6, { db: db6.db });
ok(res6.body?.cardsSeen === 2, 'cards without an <h3> title link are still seen');
ok(!res6.body?.skipped?.some(x => String(x).includes('detail fetch failed')),
  'no card is dropped for a failed detail fetch');
ok(detailUrls6.includes('https://www.goo-net.com/usedcar/spread/goo/15/NOTITLE0001.html'),
  'the canonical detail URL was rebuilt from the stock id');
ok(db6.tables.japan_dealer_stock.some(r => r.goonet_id === 'NOTITLE0001'),
  'a title-less card was imported');
ok(db6.tables.japan_dealer_stock.find(r => r.goonet_id === 'NOTITLE0001')?.goonet_url
  === 'https://www.goo-net.com/usedcar/spread/goo/15/NOTITLE0001.html',
  'the imported row keeps the rebuilt goo-net url');

// ---- Seventh run: goo-net gates the DETAIL pages, not the listing ----------
// Regression: a gated Vercel host could still read the listing while every
// detail fetch came back as a 200 bot-gate stub. Detail fetches were never
// relayed (the stub heuristic is listing-only), so the merge kept card-only
// data and every candidate was skipped for "missing fields: fuel, body" —
// a run that read goo-net perfectly yet imported nothing. A small body with
// the gate's own wording is unmistakably the gate, so it is relayed now.
resetFetchState();
const gateStub7 = '<html><body>セキュリティチェックを行っています。しばらくお待ちください。</body></html>';
const db7 = memDb();
db7.tables.site_settings = seedSettings.map(([key, value]) => ({ key, value }));
db7.tables.japan_dealer_stock = [];
const relayCalls7 = [];

global.fetch = async (url) => {
  const u = String(url);
  if (u === 'https://www.goo-net.com/') return { ok: true, status: 200, text: async () => '<html>home</html>' };
  if (u.startsWith('https://r.jina.ai/')) { relayCalls7.push(u); return { ok: true, status: 200, text: async () => detailHtml }; }
  if (u.includes('summary.php')) return { ok: true, status: 200, text: async () => listingHtml };
  return { ok: true, status: 200, text: async () => gateStub7 };   // every detail page is gated
};

const res7 = fakeRes();
await handler(req, res7, { db: db7.db });
ok(res7.body?.cardsSeen >= 2, 'gated-details run still reads the listing');
ok(relayCalls7.length > 0, 'gated detail pages are retried through the relay');
ok(res7.body?.inserted >= 1, `gated details do not starve the import (inserted ${res7.body?.inserted})`);
ok(!(res7.body?.skipped || []).some(x => String(x).includes('missing fields')),
  'no car is skipped for missing fields once the relayed detail parses');
eq(res7.body?.via, 'direct', 'the report names how the listing was read');
eq(res7.body?.relayKey, 'free (no key)', 'the report says the relay runs keyless until JINA_API_KEY is set');


// ---- Eighth run: the AI fallback self-heals a parse miss -------------------
// A real listing page the regex parser cannot read (50 bare car links — the
// live incident shape), a Gemini key configured, and a strict-JSON LLM reply.
// The extracted cards must flow through the SAME quality gate as regex cards,
// the report must name the fallback, and the bookmark must stay held.
resetFetchState();
const llmListingPage = '<html><body><a href="/policy/cookie">Cookie</a> Cookie conditions '
  + Array.from({ length: 50 }, (_, i) => `<a href="https://www.goo-net.com/usedcar/spread/goo/15/LIVE80${i}.html"></a>`).join('')
  + '<script>var gallery={"LLM8001":["https://picture1.goo-net.com/a/Q/L8001_01.jpg","https://picture1.goo-net.com/a/Q/L8001_02.jpg","https://picture1.goo-net.com/a/Q/L8001_03.jpg"],"LLM8002":["https://picture1.goo-net.com/a/Q/L8002_01.jpg","https://picture1.goo-net.com/a/Q/L8002_02.jpg","https://picture1.goo-net.com/a/Q/L8002_03.jpg"]}</script></body></html>';
const llmCardsReply = JSON.stringify([
  { stock: 'LLM8001', make: 'Toyota', model: 'Prius', title: 'Prius S 2021',
    url: 'https://www.goo-net.com/usedcar/spread/goo/15/LLM8001.html', year: 2021,
    km: '4.2万km', price: '285万円', fuel: 'Hybrid', body: 'Sedan', location: '愛知県',
    images: ['https://picture1.goo-net.com/a/Q/L8001_01.jpg', 'https://picture1.goo-net.com/a/Q/L8001_02.jpg', 'https://picture1.goo-net.com/a/Q/L8001_03.jpg'] },
  { stock: 'LLM8002', make: 'Nissan', model: 'Note', title: 'Note X 2018',
    url: 'https://www.goo-net.com/usedcar/spread/goo/15/LLM8002.html', year: 2018,
    km: '90000', price: '￥1,500,000',
    images: ['https://picture1.goo-net.com/a/Q/L8002_01.jpg', 'https://picture1.goo-net.com/a/Q/L8002_02.jpg', 'https://picture1.goo-net.com/a/Q/L8002_03.jpg'] }
]);
const db8 = memDb();
db8.tables.site_settings = seedSettings.map(([key, value]) => ({ key, value }));
db8.tables.japan_dealer_stock = [];
const llmCalls8 = [];
process.env.GEMINI_API_KEY = 'test-gemini';

global.fetch = async (url) => {
  const u = String(url);
  if (u === 'https://www.goo-net.com/') return { ok: true, status: 200, text: async () => '<html>home</html>' };
  if (u.includes('generativelanguage')) {
    llmCalls8.push(u);
    return { ok: true, status: 200, json: async () => ({ candidates: [{ content: { parts: [{ text: llmCardsReply }] } }] }) };
  }
  if (u.includes('summary.php')) return { ok: true, status: 200, text: async () => llmListingPage };
  if (u.includes('/usedcar/spread/goo/')) return { ok: true, status: 200, text: async () => detailHtml };
  return { ok: false, status: 404, text: async () => '' };
};

const res8 = fakeRes();
await handler(req, res8, { db: db8.db });
delete process.env.GEMINI_API_KEY;
const settings8 = Object.fromEntries(db8.tables.site_settings.map(r => [r.key, r.value]));

ok(res8.body?.llm?.via === 'gemini' && res8.body?.llm?.extracted === 2,
  'AI fallback: the report names the LLM provider and how many cards it extracted');
ok(llmCalls8.length === 1 && llmCalls8[0].includes('gemini-3.8-flash'),
  'AI fallback: the live call targets gemini-3.8-flash (the 404 message from goo-net\u2019s gemini-2.5-flash retirement)');
ok(res8.body?.inserted >= 1 && llmCalls8.length === 1,
  'AI fallback: the extracted cars pass the same quality gate and are imported (one LLM call per run)');
ok(String(res8.body?.note || '').includes('AI fallback (gemini)'),
  'AI fallback: the owner-facing notice names the fallback');
ok(res8.body?.parseMiss === true && Number(settings8.goonet_bookmark_page) === 1,
  'AI fallback: parseMiss stays honest and the bookmark is held');

// ---- Ninth run: parse miss WITHOUT any LLM key ------------------------------
// The fallback must not even be attempted: no llm field, no LLM dial, and the
// run stores the 2 KB markup sample the parser fix is made against.
resetFetchState();
const db9 = memDb();
db9.tables.site_settings = seedSettings.map(([key, value]) => ({ key, value }));
db9.tables.japan_dealer_stock = [];
const fetchCalls9 = [];

global.fetch = async (url) => {
  const u = String(url);
  fetchCalls9.push(u);
  if (u === 'https://www.goo-net.com/') return { ok: true, status: 200, text: async () => '<html>home</html>' };
  if (u.includes('summary.php')) return { ok: true, status: 200, text: async () => llmListingPage };
  if (u.includes('/usedcar/spread/goo/')) return { ok: true, status: 200, text: async () => detailHtml };
  return { ok: false, status: 404, text: async () => '' };
};

const res9 = fakeRes();
await handler(req, res9, { db: db9.db });
const settings9 = Object.fromEntries(db9.tables.site_settings.map(r => [r.key, r.value]));

ok(res9.body?.parseMiss === true && res9.body?.llm === undefined
  && !fetchCalls9.some(u => u.includes('generativelanguage') || u.includes('api.openai.com')),
  'without an LLM key the run is a plain parseMiss — no llm field, no LLM dial');
const evidence9 = settings9.goonet_parsemiss_sample ? JSON.parse(settings9.goonet_parsemiss_sample) : null;
ok(evidence9 && evidence9.run === 'parseMiss' && typeof evidence9.sample === 'string'
  && evidence9.sample.length > 0 && evidence9.sample.length <= 2048
  && evidence9.sample.includes('LIVE80'),
  'parseMiss runs store the 2 KB markup sample in site_settings.goonet_parsemiss_sample');

// ---- Parser diagnostic endpoint (admin) ------------------------------------
const { default: stockHandler } = await import('../api/goonet-stock.js');
const diagRes = fakeRes();
await stockHandler(
  { method: 'GET', query: { action: 'diag' }, headers: {} },
  diagRes,
  {
    db: db9.db,
    getUser: async () => ({ user: { id: 'u1', email: 'admin@ar7traders.com' }, profile: { role: 'admin', full_name: 'Admin' } }),
    permsFor: async () => ({ 'site.write': true })
  }
);
ok(diagRes.statusCode === 200 && String(diagRes.body?.sample || '').length > 0 && String(diagRes.body?.sample).includes('LIVE80')
  && diagRes.body?.run === 'parseMiss',
  'GET /api/goonet-stock?action=diag serves the stored sample to an admin');

// ---- Tenth run: the direct listing fetch ABORTS, the relay rescues it ------
// The live incident of 2026-11: the bookmarked deep page
// (…/usedcar/index-30.html) never answered, the direct request was cancelled
// by our own timer, and the run died with an opaque 502 ("This operation was
// aborted") without ever trying anything else. A connection that never
// completed must earn the same relay attempt as a bot stub.
resetFetchState();
const abortError = () => { const e = new Error('This operation was aborted'); e.name = 'AbortError'; throw e; };
const db10 = memDb();
const deepSettings = seedSettings
  .filter(([k]) => k !== 'goonet_search_url' && k !== 'goonet_bookmark_page')
  .concat([['goonet_search_url', 'https://www.goo-net.com/usedcar/'], ['goonet_bookmark_page', '30']]);
// The saved domestic non-price search translates to the default exchange
// search; its page 30 is the offset=580 URL, and the fallback search is the
// only URL carrying b_to_b_price_max=1000000.
const BOOKMARKED_PAGE = 'offset=580';
const FALLBACK_MARK = 'b_to_b_price_max=1000000&search_type=price_search';
db10.tables.site_settings = deepSettings.map(([key, value]) => ({ key, value }));
db10.tables.japan_dealer_stock = [];

global.fetch = async (url) => {
  const u = String(url);
  if (u === 'https://www.goo-net.com/') return { ok: true, status: 200, text: async () => '<html>home</html>' };
  if (u.startsWith('https://r.jina.ai/')) return { ok: true, status: 200, text: async () => listingHtml };
  if (u.includes(BOOKMARKED_PAGE)) abortError();
  if (u.includes('/usedcar/spread/goo/')) return { ok: true, status: 200, text: async () => detailHtml };
  return { ok: false, status: 404, text: async () => '' };
};

const res10 = fakeRes();
await handler(req, res10, { db: db10.db });
const settings10 = Object.fromEntries(db10.tables.site_settings.map(r => [r.key, r.value]));

ok(res10.statusCode === 200, 'direct abort + relay success: the run completes (not a 502)');
eq(res10.body?.via, 'relay', 'direct abort + relay success: the report says the page came via relay');
ok(res10.body?.inserted >= 1, `direct abort + relay success: cars import through the quality gates (inserted ${res10.body?.inserted})`);
ok(Number(settings10.goonet_bookmark_page) === 31, 'direct abort + relay success: the relayed read of the bookmarked page advances the bookmark');

// ---- Eleventh run: direct aborts AND relay aborts → fallback page 1 --------
// Both legs of the bookmarked fetch die. The run must make ONE bounded retry,
// then read page 1 of the fallback search instead — and hold the bookmark,
// because the bookmarked page itself was never read.
resetFetchState();
const db11 = memDb();
db11.tables.site_settings = deepSettings.map(([key, value]) => ({ key, value }));
db11.tables.japan_dealer_stock = [];
const calls11 = [];

global.fetch = async (url) => {
  const u = String(url);
  calls11.push(u);
  if (u === 'https://www.goo-net.com/') return { ok: true, status: 200, text: async () => '<html>home</html>' };
  if (u.includes(BOOKMARKED_PAGE)) abortError();   // direct AND relay (the relay URL embeds it)
  if (u.includes('summary.php')) return { ok: true, status: 200, text: async () => listingHtml };
  if (u.includes('/usedcar/spread/goo/')) return { ok: true, status: 200, text: async () => detailHtml };
  return { ok: false, status: 404, text: async () => '' };
};

const res11 = fakeRes();
await handler(req, res11, { db: db11.db });
const settings11 = Object.fromEntries(db11.tables.site_settings.map(r => [r.key, r.value]));

ok(res11.statusCode === 200, 'abort + abort + fallback: the run completes');
ok(res11.body?.fallbackUsed === true && String(res11.body?.fallbackUrl || '').includes(FALLBACK_MARK),
  'abort + abort + fallback: the report names the fallback page that was read');
ok(res11.body?.inserted >= 1, `abort + abort + fallback: cars import from the fallback page (inserted ${res11.body?.inserted})`);
ok(Number(settings11.goonet_bookmark_page) === 30,
  'abort + abort + fallback: the bookmark is HELD — a fallback read proves nothing about page 30');
ok(calls11.filter(u => u.includes(BOOKMARKED_PAGE) && !u.startsWith('https://r.jina.ai/')).length === 2,
  'abort + abort + fallback: exactly one bounded retry of the bookmarked page (2 direct attempts total)');
ok(String(res11.body?.note || '').includes('held on page 30'),
  'abort + abort + fallback: the note says the bookmark was held');

// ---- Twelfth run: goo-net answers 403 → NO retry, NO fallback --------------
// A 403/429 is the gate refusing on purpose. The only sanctioned attempt is
// the single relay try inside fetchPage; the importer must not add a retry
// storm or hammer the fallback search from the same blocked host.
resetFetchState();
const db12 = memDb();
db12.tables.site_settings = deepSettings.map(([key, value]) => ({ key, value }));
db12.tables.japan_dealer_stock = [];
const calls12 = [];

global.fetch = async (url) => {
  const u = String(url);
  calls12.push(u);
  if (u === 'https://www.goo-net.com/') return { ok: true, status: 200, text: async () => '<html>home</html>' };
  if (u.startsWith('https://r.jina.ai/')) return { ok: false, status: 500, text: async () => '' };
  return { ok: false, status: 403, text: async () => '<html><body>セキュリティによるアクセス制限</body></html>' };
};

const res12 = fakeRes();
await handler(req, res12, { db: db12.db });
const settings12 = Object.fromEntries(db12.tables.site_settings.map(r => [r.key, r.value]));

ok(res12.statusCode === 502 && res12.body?.failure?.kind === 'blocked',
  '403 run: reported as blocked, not as a timeout or crash');
ok(calls12.filter(u => u.includes(BOOKMARKED_PAGE) && !u.startsWith('https://r.jina.ai/')).length === 1,
  '403 run: the blocked page is fetched exactly once — no retry storm');
ok(!calls12.some(u => u.includes(FALLBACK_MARK)),
  '403 run: the fallback search is never hammered from a blocked host');
ok(Number(settings12.goonet_bookmark_page) === 30, '403 run: the bookmark is held');
ok(String(res12.body?.error || '').includes('Do not retry'),
  '403 run: the error tells the owner not to retry in a loop');

// ---- Thirteenth run: EVERYTHING times out — diagnosable, bounded, counted --
// Direct, relay and fallback all abort. The response must classify the state
// as a timeout (never the raw "This operation was aborted"), report both
// legs and the fallback, hold the bookmark, and count consecutive failures
// of the same page so a stuck bookmark surfaces an owner action.
resetFetchState();
const db13 = memDb();
db13.tables.site_settings = deepSettings.map(([key, value]) => ({ key, value }));
db13.tables.japan_dealer_stock = [];

global.fetch = async (url) => {
  const u = String(url);
  if (u === 'https://www.goo-net.com/') return { ok: true, status: 200, text: async () => '<html>home</html>' };
  abortError();
};

const res13 = fakeRes();
await handler(req, res13, { db: db13.db });
const settings13 = Object.fromEntries(db13.tables.site_settings.map(r => [r.key, r.value]));
const f13 = res13.body?.failure || {};

ok(res13.statusCode === 502 && f13.kind === 'timeout', 'all-timeout run: classified as a timeout, not a crash');
ok(!String(res13.body?.error || '').includes('This operation was aborted'),
  'all-timeout run: the raw abort message never reaches the owner');
ok(String(res13.body?.error || '').includes('timed out')
  && String(res13.body?.error || '').includes(BOOKMARKED_PAGE)
  && String(res13.body?.error || '').includes('held on page 30'),
  'all-timeout run: the error names the page, the timeout, and the held bookmark');
ok(f13.retried === true && f13.relayAttempted === true && f13.fallbackTried === true,
  'all-timeout run: the report shows retry, relay and fallback were all attempted');
ok(typeof f13.relayError === 'string' && f13.relayKey === 'free (no key)',
  'all-timeout run: relay error and relay key state are reported');
ok(Number(settings13.goonet_bookmark_page) === 30, 'all-timeout run: the bookmark is held');
ok(settings13.goonet_fetch_fail_count === '1' && settings13.goonet_fetch_fail_page === '30',
  'all-timeout run: the consecutive-failure counter starts');

// Two more failing runs on the same page → the report escalates to the owner.
resetFetchState();
const res13b = fakeRes();
await handler(req, res13b, { db: db13.db });
resetFetchState();
const res13c = fakeRes();
await handler(req, res13c, { db: db13.db });
const settings13c = Object.fromEntries(db13.tables.site_settings.map(r => [r.key, r.value]));

ok(settings13c.goonet_fetch_fail_count === '3', 'stuck bookmark: three failures on page 30 are counted');
ok(String(res13c.body?.failure?.suggestedAction || '').includes('Reset the bookmark'),
  'stuck bookmark: after repeated failures the report names the owner action');

// With the EXPLICIT setting on, the next failure auto-resets to page 1.
db13.tables.site_settings.push({ key: 'goonet_auto_reset_bookmark', value: 'true' });
resetFetchState();
const res13d = fakeRes();
await handler(req, res13d, { db: db13.db });
const settings13d = Object.fromEntries(db13.tables.site_settings.map(r => [r.key, r.value]));

ok(res13d.body?.failure?.bookmarkReset === true && settings13d.goonet_bookmark_page === '1',
  'stuck bookmark: auto-reset to page 1 happens ONLY under the explicit goonet_auto_reset_bookmark setting');

// And a later successful read of the bookmarked page clears the counter.
resetFetchState();
global.fetch = async (url) => {
  const u = String(url);
  if (u === 'https://www.goo-net.com/') return { ok: true, status: 200, text: async () => '<html>home</html>' };
  if (u.includes('/usedcar/spread/goo/')) return { ok: true, status: 200, text: async () => detailHtml };
  if (u.includes('summary.php')) return { ok: true, status: 200, text: async () => listingHtml };
  return { ok: false, status: 404, text: async () => '' };
};
const res13e = fakeRes();
await handler(req, res13e, { db: db13.db });
const settings13e = Object.fromEntries(db13.tables.site_settings.map(r => [r.key, r.value]));
ok(res13e.statusCode === 200 && settings13e.goonet_fetch_fail_count === '0',
  'a successful read of the bookmarked page clears the failure counter');

// ---- Fourteenth run: a passing import flows straight to the site ----------
// P3 (2026-11-03): japan_dealer_stock stays the provenance table, but a car
// that passes the quality gate is promoted in the SAME run — to the public
// website and the CRM inventory (goonet_auto_promote_target, default 'both'),
// bounded by goonet_max_promote_per_run. Rows imported on EARLIER runs (the
// unpromoted backlog) are an owner decision and must never be swept up.
const healthyFetch = () => {
  global.fetch = async (url) => {
    const u = String(url);
    if (u === 'https://www.goo-net.com/') return { ok: true, status: 200, text: async () => '<html>home</html>' };
    if (u.includes('/usedcar/spread/goo/')) return { ok: true, status: 200, text: async () => detailHtml };
    if (u.includes('summary.php')) return { ok: true, status: 200, text: async () => listingHtml };
    return { ok: false, status: 404, text: async () => '' };
  };
};
// Settings that keep the weekly sweeps quiet so only the per-run path acts.
const promoteSeed = extra => seedSettings
  .concat([
    ['goonet_last_weekly_delist', new Date().toISOString()],
    ['goonet_last_weekly_promote', new Date().toISOString()]
  ], extra)
  .map(([key, value]) => ({ key, value }));
const backlogRow = () => ({
  id: 'backlog-1', goonet_id: 'BACKLOG1', stock_no: 'BACKLOG1',
  make: 'Toyota', model: 'Aqua', year: 2018, available: true, promoted: 'none',
  goonet_url: 'https://www.goo-net.com/usedcar/spread/goo/15/BACKLOG1.html',
  last_seen_at: new Date().toISOString(), imported_at: '2026-01-01T00:00:00Z',
  quality_score: 99
});

resetFetchState();
healthyFetch();
const db14 = memDb();
db14.tables.site_settings = promoteSeed([]);
db14.tables.japan_dealer_stock = [backlogRow()];
const res14 = fakeRes();
await handler(req, res14, { db: db14.db });

const fresh14 = (db14.tables.japan_dealer_stock || []).find(r => r.goonet_id === '988026081900208975001');
const listing14 = (db14.tables.site_listings || []).filter(r => r.stock_no === fresh14?.stock_no);
const vehicle14 = (db14.tables.vehicles || []).filter(r => r.stock_no === fresh14?.stock_no);
const backlog14 = db14.tables.japan_dealer_stock.find(r => r.id === 'backlog-1');

ok(res14.statusCode === 200 && res14.body?.inserted >= 1, `auto-promote: the run imported (inserted ${res14.body?.inserted})`);
ok(res14.body?.promoted >= 1, `auto-promote: the report counts the same-run promotion (promoted ${res14.body?.promoted})`);
ok(fresh14?.promoted === 'both', `auto-promote: the fresh row is marked 'both' (got '${fresh14?.promoted}')`);
ok(listing14.length === 1, `auto-promote: exactly one website listing was published (got ${listing14.length})`);
ok(vehicle14.length === 1, `auto-promote: exactly one CRM inventory row was created (got ${vehicle14.length})`);
ok(listing14[0]?.published === true, 'auto-promote: the website copy is published');
ok(backlog14?.promoted === 'none', 'auto-promote: the unpromoted BACKLOG row from an earlier run is left alone');
ok(!(db14.tables.site_listings || []).some(r => r.stock_no === 'BACKLOG1')
  && !(db14.tables.vehicles || []).some(r => r.stock_no === 'BACKLOG1'),
  'auto-promote: no backlog copy reaches the website or the inventory without owner approval');

// Second pass over the same listing: the already-imported car is recognised,
// never re-imported, and still appears exactly ONCE in each destination.
resetFetchState();
healthyFetch();
const res14b = fakeRes();
await handler(req, res14b, { db: db14.db });
ok((db14.tables.japan_dealer_stock || []).filter(r => r.goonet_id === '988026081900208975001').length === 1,
  'auto-promote rerun: the known car is not re-imported into provenance');
ok((db14.tables.site_listings || []).filter(r => r.stock_no === fresh14?.stock_no).length === 1
  && (db14.tables.vehicles || []).filter(r => r.stock_no === fresh14?.stock_no).length === 1,
  'auto-promote rerun: the car still appears exactly once in each destination (no duplicates)');

// Target 'listings': the copy goes to the website only, and the provenance
// flag says exactly that.
resetFetchState();
healthyFetch();
const db14c = memDb();
db14c.tables.site_settings = promoteSeed([['goonet_auto_promote_target', 'listings']]);
db14c.tables.japan_dealer_stock = [];
const res14c = fakeRes();
await handler(req, res14c, { db: db14c.db });
const fresh14c = (db14c.tables.japan_dealer_stock || []).find(r => r.goonet_id === '988026081900208975001');
ok(fresh14c?.promoted === 'listings', `target listings: the row is marked 'listings' (got '${fresh14c?.promoted}')`);
ok((db14c.tables.vehicles || []).length === 0, 'target listings: the CRM inventory is untouched');
ok((db14c.tables.site_listings || []).some(r => r.stock_no === fresh14c?.stock_no), 'target listings: the website copy exists');

// Auto-promote switched OFF: imports land in provenance and stay there.
resetFetchState();
healthyFetch();
const db14d = memDb();
db14d.tables.site_settings = promoteSeed([['goonet_auto_promote', 'false']]).filter(r => r.key !== 'goonet_auto_promote' || r.value === 'false');
db14d.tables.japan_dealer_stock = [];
const res14d = fakeRes();
await handler(req, res14d, { db: db14d.db });
const fresh14d = (db14d.tables.japan_dealer_stock || []).find(r => r.goonet_id === '988026081900208975001');
ok(res14d.body?.inserted >= 1 && fresh14d?.promoted === 'none',
  'auto-promote off: the import lands but is not promoted');
ok((db14d.tables.site_listings || []).length === 0 && (db14d.tables.vehicles || []).length === 0,
  'auto-promote off: neither destination is written');

// Per-run bound of 0: same as off for the promotion step, import unaffected.
resetFetchState();
healthyFetch();
const db14e = memDb();
db14e.tables.site_settings = promoteSeed([['goonet_max_promote_per_run', '0']]);
db14e.tables.japan_dealer_stock = [];
const res14e = fakeRes();
await handler(req, res14e, { db: db14e.db });
const fresh14e = (db14e.tables.japan_dealer_stock || []).find(r => r.goonet_id === '988026081900208975001');
ok(res14e.body?.inserted >= 1 && fresh14e?.promoted === 'none' && (db14e.tables.site_listings || []).length === 0,
  'goonet_max_promote_per_run 0: the bound is respected — import yes, promotion no');

// ---- Fifteenth run: a SLOW relay (slower than the old 7s ceiling) ---------
// The 2026-11-04 production incident: goo-net black-holed the direct request
// (reads as a timeout) and r.jina.ai — key configured, perfectly willing —
// was cancelled by OUR OWN 7s timer on every leg. The relay renders the page
// and routinely needs 10–20s, so fetchPage now gives the listing relay leg
// RELAY_TIMEOUT_MS (20s). This run's relay answers after 8.5s: under the old
// timer it died as "timed out after 7000ms"; now it must rescue the run.
resetFetchState();
const db15 = memDb();
db15.tables.site_settings = promoteSeed([]);
db15.tables.japan_dealer_stock = [];

global.fetch = async (url) => {
  const u = String(url);
  if (u === 'https://www.goo-net.com/') return { ok: true, status: 200, text: async () => '<html>home</html>' };
  if (u.startsWith('https://r.jina.ai/')) {
    await new Promise(r => setTimeout(r, 8500));   // slower than the old 7s ceiling
    return { ok: true, status: 200, text: async () => listingHtml };
  }
  if (u.includes('/usedcar/spread/goo/')) return { ok: true, status: 200, text: async () => detailHtml };
  if (u.includes('summary.php')) { const e = new Error('This operation was aborted'); e.name = 'AbortError'; throw e; }
  return { ok: false, status: 404, text: async () => '' };
};

const res15 = fakeRes();
await handler(req, res15, { db: db15.db });
const settings15 = Object.fromEntries(db15.tables.site_settings.map(r => [r.key, r.value]));

ok(res15.statusCode === 200, 'slow relay: the run completes');
eq(res15.body?.via, 'relay', 'slow relay: the page came via relay (not cancelled at 7s)');
ok(res15.body?.inserted >= 1, `slow relay: cars import through the quality gates (inserted ${res15.body?.inserted})`);
ok(Number(settings15.goonet_bookmark_page) === 2, 'slow relay: a relayed read of the bookmarked page advances the bookmark');
ok(settings15.goonet_fetch_fail_count === undefined || settings15.goonet_fetch_fail_count === '0',
  'slow relay: no failure is counted for a run the relay rescued');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
