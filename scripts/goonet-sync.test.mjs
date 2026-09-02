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
  else if (u.includes('price--100')) { body = listingHtml; }
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
ok(fetchCalls.some(u => u.includes('price--100')), 'the listing page was fetched');
ok(fetchCalls[0] === 'https://www.goo-net.com/', 'the run warms up a cookie jar against goo-net first');
ok(activities.length >= 1, 'activity log written');
ok(activities.some(a => String(a.action || '').includes('Delisted')), 'delist logged');
ok(!fetchCalls.some(u => u === 'https://r.jina.ai/https://www.goo-net.com/usedcar/price--100/'),
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
ok(relayCalls.some(u => u === 'https://r.jina.ai/https://www.goo-net.com/usedcar/price--100/'),
  'the stub listing page was re-fetched through the relay');
ok(res2.body?.cardsSeen >= 2, 'relayed page yields real cards instead of the 1-card stub');
ok(String(res2.body?.note || '').startsWith('goo-net blocked the direct request (bot protection) — page fetched via relay.'),
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
  else if (u.includes('/usedcar/')) body = gatedStubHtml;                    // every page is the stub
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
  if (u.includes('price--100')) {
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
  if (u.includes('price--100')) return { ok: true, status: 200, text: async () => noTitleListing };
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

// ---- Seventh run: listing reads fine, but every detail fetch fails ---------
// The live failure mode on serverless hosts: the listing arrives through the
// relay, but the relay cannot read the detail pages that day. The bookmark
// must be HELD (the cars were never processed), the failures counted, and the
// report must not say "caught up".
resetFetchState();
const db7 = memDb();
db7.tables.site_settings = seedSettings.map(([key, value]) => ({ key, value }));
db7.tables.japan_dealer_stock = [];

global.fetch = async (url) => {
  const u = String(url);
  if (u === 'https://www.goo-net.com/') return { ok: true, status: 200, text: async () => '<html>home</html>' };
  if (u.startsWith('https://r.jina.ai/')) {
    // the relay can read the listing but nothing else today
    if (u.includes('price--100')) return { ok: true, status: 200, text: async () => listingHtml };
    return { ok: false, status: 500, text: async () => '' };
  }
  throw new Error('fetch failed');   // goo-net resets our datacenter socket
};

const res7 = fakeRes();
await handler(req, res7, { db: db7.db });
const settings7 = Object.fromEntries(db7.tables.site_settings.map(r => [r.key, r.value]));

ok(res7.body?.inserted === 0, 'no car is imported when every detail fetch fails');
ok(res7.body?.detailFailures >= 1, `detail fetch failures are counted (${res7.body?.detailFailures})`);
ok(Number(settings7.goonet_bookmark_page) === 1, 'the bookmark is held for a page whose cars were not processed');
ok(String(res7.body?.note || '').includes('Bookmark held'), 'the report explains why the bookmark was held');
ok(res7.body?.bookmarkAdvanced === false, 'bookmarkAdvanced is false on an infrastructure-failure run');

// ---- Eighth run: every card on the page is known or blocklisted ------------
// Nothing new to do — the page was still fully processed, so the crawler MUST
// advance. Holding here would park the importer on page 1 forever.
resetFetchState();
const db8 = memDb();
db8.tables.site_settings = seedSettings.map(([key, value]) => ({ key, value }));
db8.tables.japan_dealer_stock = [];
db8.tables.goonet_blocklist = [
  '988026062900208975002', '988026081900208975001', '988026082700206352001'
].map(stock => ({ goonet_id: stock, stock_no: stock, reason: 'test blocklist' }));

global.fetch = async (url) => {
  const u = String(url);
  let body = '', status = 200;
  if (u === 'https://www.goo-net.com/') body = '<html><body>goo-net</body></html>';
  else if (u.includes('price--100')) body = listingHtml;
  else if (u.includes('/usedcar/spread/goo/')) body = detailHtml;
  else status = 404;
  return { ok: status < 400, status, text: async () => body };
};

const res8 = fakeRes();
await handler(req, res8, { db: db8.db });
const settings8 = Object.fromEntries(db8.tables.site_settings.map(r => [r.key, r.value]));

ok(res8.body?.inserted === 0 && res8.body?.newCards === 0, 'a fully blocklisted page imports nothing and reports no new cards');
ok(Number(settings8.goonet_bookmark_page) === 2, 'a fully processed (all known/blocked) page advances the bookmark');
ok(res8.body?.bookmarkAdvanced === true, 'bookmarkAdvanced is true when the page was fully processed');

// ---- Ninth run: a car whose detail page is already 404 (sold) --------------
// A sold car is a content change, not an infrastructure failure — it must be
// skipped without holding the bookmark hostage.
resetFetchState();
const db9 = memDb();
db9.tables.site_settings = seedSettings.map(([key, value]) =>
  key === 'goonet_max_new_per_run' ? { key, value: '3' } : { key, value });
db9.tables.japan_dealer_stock = [];

global.fetch = async (url) => {
  const u = String(url);
  let body = '', status = 200;
  if (u === 'https://www.goo-net.com/') body = '<html><body>goo-net</body></html>';
  else if (u.includes('price--100')) body = listingHtml;
  else if (u.includes('/usedcar/spread/goo/15/988026062900208975002')) { body = notFoundHtml; status = 404; }
  else if (u.includes('/usedcar/spread/goo/')) body = detailHtml;
  else status = 404;
  return { ok: status < 400, status, text: async () => body };
};

const res9 = fakeRes();
await handler(req, res9, { db: db9.db });
const settings9 = Object.fromEntries(db9.tables.site_settings.map(r => [r.key, r.value]));

ok(res9.body?.inserted === 2, 'the two live cars are imported');
ok(res9.body?.skipped?.some(x => String(x).includes('detail page gone')), 'the sold car is skipped as gone');
ok(res9.body?.detailFailures === 0, 'a 404 detail page is not counted as an infrastructure failure');
ok(Number(settings9.goonet_bookmark_page) === 2, 'a sold car does not hold the bookmark');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
