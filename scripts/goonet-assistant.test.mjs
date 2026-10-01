#!/usr/bin/env node
// CRM import assistant — end-to-end regression suite.
//
// Everything here runs through the REAL serverless handler (api/goonet-stock.js)
// and the REAL shared core (scripts/goonet-core.mjs): the fetch mock hands out
// genuine EUC-JP BYTES, exactly the encoding goo-net serves, so the decode path
// that broke the live importer is exercised end to end rather than stubbed.
// No network and no database — an in-memory Supabase-shaped client stands in.
//
//   node scripts/goonet-assistant.test.mjs
import { legacyEncoder, byteResponse } from './legacy-jp.mjs';

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

const eucJp = legacyEncoder('euc-jp');

// ---- In-memory Supabase-shaped client --------------------------------------
function memDb(seed = {}) {
  const tables = {};
  for (const [name, rows] of Object.entries(seed)) tables[name] = rows.map(r => ({ ...r }));
  const rowsOf = n => (tables[n] || (tables[n] = []));
  let seq = 0;
  const matches = (r, filters) => filters.every(f => f(r));

  function from(name) {
    const rows = rowsOf(name);
    function query() {
      const ctx = { filters: [], order: null, limitN: null, patch: null };
      const settle = () => {
        let out = rows.filter(r => matches(r, ctx.filters));
        if (ctx.order) out = out.slice().sort(ctx.order);
        if (ctx.limitN) out = out.slice(0, ctx.limitN);
        return out;
      };
      const api = {
        select: () => api,
        eq: (k, v) => { ctx.filters.push(r => r[k] === v); return api; },
        order: (k, o = {}) => {
          const dir = o.ascending === false ? -1 : 1;
          ctx.order = (a, b) => dir * String(a[k] ?? '').localeCompare(String(b[k] ?? ''), undefined, { numeric: true });
          return api;
        },
        limit: n => { ctx.limitN = n; return api; },
        maybeSingle: async () => ({ data: settle()[0] || null, error: null }),
        single: async () => {
          const out = settle();
          return out.length ? { data: out[0], error: null } : { data: null, error: new Error('no row') };
        },
        // Supabase builders are thenable; awaiting resolves { data, error }
        // (and, like the real client, UPDATE chains resolve after applying).
        then(resolve) {
          if (api.patch) settle().forEach(r => Object.assign(r, api.patch));
          if (api.remove) settle().forEach(r => { const i = rows.indexOf(r); if (i >= 0) rows.splice(i, 1); });
          return resolve({ data: settle(), error: api.error || null });
        }
      };
      return api;
    }
    return {
      select: (...cols) => {
        const api = query();
        api._cols = cols;
        return api;
      },
      eq: (k, v) => query().eq(k, v),
      order: (k, o) => query().order(k, o),
      limit: n => query().limit(n),
      single: () => query().single(),
      maybeSingle: () => query().maybeSingle(),
      then: res => query().then(res),
      insert(rec) {
        const list = (Array.isArray(rec) ? rec : [rec]).map(r => ({ ...r, id: r.id || 'id-' + (++seq) }));
        for (const r of list) {
          const dupKey = r.goonet_id !== undefined ? 'goonet_id' : (r.key !== undefined ? 'key' : null);
          if (dupKey && rows.some(x => String(x[dupKey]) === String(r[dupKey]))) {
            const error = { message: `duplicate key value violates unique constraint "${dupKey}"` };
            const shaped = { data: null, error, select: () => ({ single: async () => ({ data: null, error }) }), then: res => res({ data: null, error }) };
            return shaped;
          }
          rows.push(r);
        }
        return {
          data: list[0], error: null,
          select: () => ({ single: async () => ({ data: list[0], error: null }), then: r => r({ data: list, error: null }) }),
          then: r => r({ data: list, error: null })
        };
      },
      update(patch) {
        const api = query();
        api.patch = patch;
        return api;
      },
      delete() {
        const api = query();
        api.remove = true;
        return api;
      },
      upsert(rec) {
        for (const item of (Array.isArray(rec) ? rec : [rec])) {
          const existing = rows.find(r => r.key !== undefined && r.key === item.key)
            || rows.find(r => r.goonet_id !== undefined && r.goonet_id === item.goonet_id);
          if (existing) Object.assign(existing, item);
          else rows.push({ ...item, id: item.id || 'id-' + (++seq) });
        }
        return { error: null, then: r => r({ error: null }) };
      }
    };
  }
  return { db: { from }, tables };
}

function fakeRes() {
  const r = { statusCode: 0, body: null, headers: {} };
  r.status = code => { r.statusCode = code; return r; };
  r.setHeader = (k, v) => { r.headers[String(k).toLowerCase()] = v; };
  r.end = payload => { try { r.body = JSON.parse(payload); } catch { r.body = payload; } };
  return r;
}

const userFor = (id, role) => async () => ({
  user: { id, email: role + '@ar7traders.com' },
  profile: { id, full_name: role + ' user', role, active: true }
});
import { DEFAULTS } from '../api/_perm.js';
const permsFor = async role => DEFAULTS[role] || {};
const auth = { authorization: 'Bearer ok' };

// ---- Goo-net pages as EUC-JP BYTES -----------------------------------------
const PHOTO = i => `https://picture1.goo-net.com/020/0208975/Q/0208975A20260628D0010${i}.jpg`;

// A real detail page shape: <h1> title, photo gallery, and the two spec tables
// goo-net prints (走行距離/修復歴, then 年式/排気量/燃料/ボディタイプ/価格/評価).
function detailBytes({ stock, make = 'ホンダ', model = 'Ｎ－ＢＯＸ Ｇ　ＳＳパッケージ', photos = 5, price = '99万円', withPrice = true } = {}) {
  const gallery = Array.from({ length: photos }, (_, i) => `<img src="${PHOTO(i)}">`).join('');
  const priceRow = withPrice ? `<tr><th>車両本体価格</th><td>${price}</td><th>外装</th><td>4</td></tr>` : '<tr><th>外装</th><td>4</td></tr>';
  return eucJp(`<html><head><title>${make} ${model}</title></head><body>
<h1>${make} ${model}（愛知県）の中古車販売情報</h1>
${gallery}
<table>
<tr><th>走行距離</th><td>7.1万km</td><th>修復歴</th><td>なし</td></tr>
<tr><th>禁煙車</th><td>○</td><th>登録済未使用車</th><td>－</td></tr>
</table>
<table>
<tr><th>年式(初度登録)</th><td>2014(平成26)年</td><th>ハンドル</th><td>右</td></tr>
<tr><th>排気量</th><td>660cc</td><th>乗車定員</th><td>４名</td></tr>
<tr><th>駆動方式</th><td>2WD</td><th>燃料</th><td>ガソリン</td></tr>
<tr><th>ドア</th><td>5D</td><th>ミッション</th><td>CVT</td></tr>
<tr><th>車体色</th><td>ホワイト</td><th>車台番号下３桁</th><td>152</td></tr>
${priceRow}
<tr><th>内装</th><td>4</td><th>ボディタイプ</th><td>軽自動車</td></tr>
</table>
</body></html>`);
}

const STOCK_A = '988026081900208975001';
const STOCK_B = '965026092600203954001';
const URL_A = `https://www.goo-net.com/usedcar/spread/goo/15/${STOCK_A}.html`;
const URL_B = `https://www.goo-net.com/usedcar/spread/goo/16/${STOCK_B}.html`;

// One armed fetch mock for the whole suite. Detail pages are EUC-JP bytes;
// everything else answers as an empty 404 so a URL the test did not plan for
// fails loudly instead of silently succeeding.
let routes = {};
let fetchCalls = [];
function armFetch(map) {
  routes = map || {};
  fetchCalls = [];
  global.fetch = async (url, opts = {}) => {
    const u = String(url);
    fetchCalls.push({ url: u, headers: opts.headers || {} });
    if (u === 'https://www.goo-net.com/' && !routes.home) return byteResponse(eucJp('<!doctype html><html><body>goo-net</body></html>'));
    const hit = Object.keys(routes).find(k => u.includes(k));
    if (hit) return routes[hit];
    return byteResponse(eucJp('<html><body>ページが見つかりません</body></html>'), { status: 404 });
  };
}

const { default: handler } = await import('../api/goonet-stock.js');
const { parseGoonetCarUrl, parseGoonetCarUrls } = await import('../scripts/goonet-core.mjs');

async function call(req, injected) {
  const res = fakeRes();
  const realError = console.error;
  console.error = () => {};
  try { await handler(req, res, injected); } finally { console.error = realError; }
  return res;
}
const post = (body, role = 'admin') => ({ method: 'POST', query: {}, headers: { ...auth }, body });
const injectedFor = (db, role = 'admin') => ({ db, getUser: userFor(role + '1', role), permsFor });

// ---------------------------------------------------------------------------
console.log('\n1) URL validation happens on the PARSED url, not on a string prefix');
{
  const good = parseGoonetCarUrl('https://www.goo-net.com/usedcar/spread/goo/15/988026081900208975001.html#3');
  ok(good.ok && good.stock === '988026081900208975001' && good.url.endsWith('.html'),
    'a Goo-net vehicle URL is accepted and rebuilt canonically (fragment dropped)');
  ok(parseGoonetCarUrl('www.goo-net.com/usedcar/spread/goo/16/965026092600203954001.html').ok,
    'a scheme-less paste is accepted');
  ok(!parseGoonetCarUrl('http://www.goo-net.com/usedcar/spread/goo/15/988026081900208975001.html').ok,
    'plain http is rejected');
  ok(!parseGoonetCarUrl('https://www.goo-net.com.attacker.tld/usedcar/spread/goo/15/988026081900208975001.html').ok,
    'a lookalike host is rejected (no string-prefix match)');
  ok(!parseGoonetCarUrl('https://user:pass@www.goo-net.com/usedcar/spread/goo/15/988026081900208975001.html').ok,
    'credentials in the URL are rejected');
  ok(!parseGoonetCarUrl('https://www.goo-net.com:8443/usedcar/spread/goo/15/988026081900208975001.html').ok,
    'an unexpected port is rejected');
  ok(!parseGoonetCarUrl('https://127.0.0.1/usedcar/spread/goo/15/988026081900208975001.html').ok,
    'an internal/private target is rejected');
  ok(!parseGoonetCarUrl('https://www.goo-net.com/usedcar/price-100-300/').ok,
    'a non-vehicle Goo-net page is rejected');
  const batch = parseGoonetCarUrls(`${URL_A}\n${URL_A}#2\nhttps://evil.example.com/x\n${URL_B}`, { max: 5 });
  eq(batch.urls.length, 2, 'the batch keeps the two distinct valid URLs');
  eq(batch.errors.length, 2, 'the duplicate and the foreign host are reported, not silently dropped');
  const over = parseGoonetCarUrls(Array.from({ length: 9 }, (_, i) => `https://www.goo-net.com/usedcar/spread/goo/15/9880260819002089750${i}1.html`).join('\n'), { max: 5 });
  eq(over.urls.length, 5, 'the batch is capped at the server-side limit');
  ok(over.errors.some(e => /batch limit/.test(e.reason)), 'the capped URL is reported with its reason');
}

// ---------------------------------------------------------------------------
console.log('\n2) Authorization: staff write permission, never the public widget');
{
  const { db, tables } = memDb({ site_settings: [{ key: 'goonet_min_photos', value: '3' }], japan_dealer_stock: [], goonet_blocklist: [], activities: [], site_listings: [] });
  armFetch({ [STOCK_A]: byteResponse(detailBytes({ stock: STOCK_A })) });

  let r = await call({ method: 'POST', query: {}, headers: {}, body: { action: 'preview_import', urls: URL_A } }, { db });
  eq(r.statusCode, 401, 'an anonymous preview is refused');

  r = await call(post({ action: 'preview_import', urls: URL_A }, 'viewer'), injectedFor(db, 'viewer'));
  eq(r.statusCode, 403, 'a viewer without site.write is refused');

  r = await call(post({ action: 'import_urls', urls: URL_A }, 'viewer'), injectedFor(db, 'viewer'));
  eq(r.statusCode, 403, 'a viewer cannot import either');
  eq(tables.japan_dealer_stock.length, 0, 'nothing was written by the refused calls');

  r = await call({ method: 'GET', query: {}, headers: {} }, { db });
  eq(r.statusCode, 200, 'the public Japan stock read still works anonymously');
}

// ---------------------------------------------------------------------------
console.log('\n3) Preview: real EUC-JP bytes decoded through the shared core');
{
  const made = memDb({ site_settings: [{ key: 'goonet_min_photos', value: '3' }, { key: 'goonet_min_year', value: '2000' }], japan_dealer_stock: [], goonet_blocklist: [], activities: [], site_listings: [] });
  const db3 = made.db;
  armFetch({ [STOCK_A]: byteResponse(detailBytes({ stock: STOCK_A })) });

  const r = await call(post({ action: 'preview_import', urls: URL_A }), injectedFor(db3));
  eq(r.statusCode, 200, 'preview responds 200');
  const p = r.body.preview[0];
  eq(p.status, 'ready', 'the car previews as ready');
  eq(p.make, 'Honda', 'make decoded from EUC-JP bytes');
  eq(p.model, 'N-BOX', 'model decoded from EUC-JP bytes');
  ok(String(p.title).includes('Ｎ－ＢＯＸ') && String(p.title).includes('ホンダ'),
    'the Japanese title is readable, not replacement characters: ' + JSON.stringify(String(p.title).slice(0, 24)));
  ok(!/\uFFFD/.test(JSON.stringify(p)), 'no replacement character anywhere in the preview');
  eq(p.year, 2014, 'year');
  eq(p.km, '71000', 'mileage');
  eq(p.price_jpy, 990000, 'price in yen');
  eq(p.price, '$6,732', 'estimated USD price');
  eq(p.fuel, 'Petrol', 'fuel');
  eq(p.body, 'Kei', 'body');
  eq(p.location, '愛知県', 'prefecture read from the decoded page');
  eq(p.photo_count, 5, 'verified photo count');
  eq(p.photos.length, 5, 'verified photo URLs are returned for the preview');
  ok(p.photos.every(u => /^https:\/\/picture1\.goo-net\.com\//.test(u)), 'every photo URL is a goo-net picture host');
  ok(p.quality.pass === true && p.missing_fields.length === 0, 'quality verdict: pass with no missing fields');
  ok(String(p.source_url).includes(STOCK_A), 'the preview names its source URL');
  const rows = made.tables.japan_dealer_stock;
  eq(rows.length, 0, 'preview wrote NOTHING to stock');
  eq((made.tables.activities || []).length, 0, 'preview wrote no activity either');
}

// ---------------------------------------------------------------------------
console.log('\n4) Preview reports every reason a car would be refused');
{
  const { db } = memDb({ site_settings: [{ key: 'goonet_min_photos', value: '4' }], japan_dealer_stock: [], goonet_blocklist: [], activities: [], site_listings: [] });
  armFetch({
    [STOCK_A]: byteResponse(detailBytes({ stock: STOCK_A, photos: 2 })),
    [STOCK_B]: byteResponse(detailBytes({ stock: STOCK_B, withPrice: false }))
  });
  const r = await call(post({ action: 'preview_import', urls: `${URL_A}\n${URL_B}` }), injectedFor(db));
  const [a, b] = r.body.preview;
  eq(a.status, 'rejected', 'too few photos is a rejection, not a ready import');
  ok(/photos 2\/4/.test(a.reason) || /only 2 photo/.test(a.reason), 'the photo reason is explicit: ' + a.reason);
  eq(b.status, 'rejected', 'a page without a price is rejected');
  ok(/no price/.test(b.reason) || /missing required field/.test(b.reason), 'the price reason is explicit: ' + b.reason);
}

// ---------------------------------------------------------------------------
console.log('\n5) Unavailable listings and unsafe redirects are never imported');
{
  const { db, tables } = memDb({ site_settings: [], japan_dealer_stock: [], goonet_blocklist: [], activities: [], site_listings: [] });
  armFetch({
    [STOCK_A]: byteResponse(eucJp('<html><body>ページが見つかりません。　Not,found.</body></html>'), { status: 404 }),
    [STOCK_B]: byteResponse(detailBytes({ stock: STOCK_B }), { finalUrl: 'https://evil.example.com/hijacked' })
  });
  const r = await call(post({ action: 'import_urls', urls: `${URL_A}\n${URL_B}` }), injectedFor(db));
  eq(r.body.results[0].status, 'unavailable', 'a 404 listing is reported unavailable');
  const redirected = r.body.results[1];
  ok(redirected.status !== 'imported', 'a page that redirected off goo-net is not imported (' + redirected.status + ')');
  ok(/redirect/i.test(redirected.reason || ''), 'the redirect escape is named in the reason: ' + redirected.reason);
  eq(tables.japan_dealer_stock.length, 0, 'neither car reached the stock table');
}

// ---------------------------------------------------------------------------
console.log('\n6) Import: re-reads the page server-side and writes real fields');
{
  const { db, tables } = memDb({ site_settings: [{ key: 'goonet_min_photos', value: '3' }], japan_dealer_stock: [], goonet_blocklist: [], activities: [], site_listings: [] });
  armFetch({ [STOCK_A]: byteResponse(detailBytes({ stock: STOCK_A })) });

  const r = await call(post({
    action: 'import_urls',
    urls: URL_A,
    // A client that tries to smuggle its own preview payload: the server must
    // ignore it completely and read the page again.
    preview: [{ status: 'ready', stock_id: 'FORGED', make: 'Ferrari', model: 'F40', price_jpy: 1 }]
  }), injectedFor(db));

  eq(r.statusCode, 200, 'import responds 200');
  eq(r.body.inserted, 1, 'one car imported');
  eq(r.body.results[0].status, 'imported', 'the per-car result says imported');
  const row = tables.japan_dealer_stock[0];
  eq(row.goonet_id, STOCK_A, 'idempotency key is the goo-net id');
  ok(row.make === 'Honda' && row.model === 'N-BOX', 'the forged preview was ignored — the row is the real car');
  eq(row.year, 2014, 'year stored');
  eq(row.km, '71000', 'mileage stored');
  eq(row.price_jpy, 990000, 'price stored');
  eq(row.price_usd, 6732, 'usd price stored');
  eq(row.fuel, 'Petrol', 'fuel stored');
  eq(row.body, 'Kei', 'body stored');
  eq(row.photo_count, 5, 'photo count stored');
  eq(Array.isArray(row.images) ? row.images.length : 0, 5, 'gallery stored');
  eq(row.status, 'New Arrival', 'status');
  eq(row.available, true, 'available');
  eq(row.promoted, 'none', 'imported cars stay unpromoted until an explicit Publish');
  eq(row.vendor, 'Goo-net', 'vendor');
  eq(row.goonet_url, URL_A, 'source URL stored');
  ok(row.quality_score > 0, 'quality score stored');
  const acts = tables.activities || [];
  ok(acts.some(a => String(a.action).includes('import assistant')), 'the import is written to the activity log');

  // ---- duplicate -----------------------------------------------------------
  fetchCalls = [];
  const r2 = await call(post({ action: 'import_urls', urls: URL_A }), injectedFor(db));
  eq(r2.body.inserted, 0, 're-importing the same URL inserts nothing');
  eq(r2.body.results[0].status, 'already_present', 'it is reported as already present');
  eq(tables.japan_dealer_stock.length, 1, 'the stock table still holds exactly one row');
  ok(fetchCalls.every(c => !/evil/.test(c.url)), 'no request left goo-net');
}

// ---------------------------------------------------------------------------
console.log('\n7) Blocklist and quality thresholds are enforced at import time');
{
  const { db, tables } = memDb({
    site_settings: [{ key: 'goonet_min_photos', value: '3' }],
    japan_dealer_stock: [],
    goonet_blocklist: [{ goonet_id: STOCK_B, stock_no: STOCK_B, reason: 'Manually deleted via CRM' }],
    activities: [], site_listings: []
  });
  armFetch({ [STOCK_A]: byteResponse(detailBytes({ stock: STOCK_A })), [STOCK_B]: byteResponse(detailBytes({ stock: STOCK_B })) });

  const r = await call(post({ action: 'import_urls', urls: `${STOCK_A ? URL_A : ''}\n${URL_B}` }), injectedFor(db));
  const byId = Object.fromEntries(r.body.results.filter(x => x.stock_id).map(x => [x.stock_id, x]));
  eq(byId[STOCK_B].status, 'rejected', 'a blocklisted car is refused');
  ok(/blocklist/i.test(byId[STOCK_B].reason), 'the blocklist is named as the reason');
  eq(tables.japan_dealer_stock.filter(x => x.goonet_id === STOCK_B).length, 0, 'the blocklisted car is never written');
  eq(byId[STOCK_A].status, 'imported', 'the unblocked car in the same batch still imports');

  // A blocklisted car must not be importable through the preview either.
  const p = await call(post({ action: 'preview_import', urls: URL_B }), injectedFor(db));
  eq(p.body.preview[0].status, 'rejected', 'preview refuses the blocklisted car too');
}

// ---------------------------------------------------------------------------
console.log('\n8) Promotion through the existing workflow');
{
  const { db, tables } = memDb({ site_settings: [{ key: 'goonet_min_photos', value: '3' }], japan_dealer_stock: [], goonet_blocklist: [], activities: [], site_listings: [] });
  armFetch({ [STOCK_A]: byteResponse(detailBytes({ stock: STOCK_A })) });

  const imp = await call(post({ action: 'import_urls', urls: URL_A }), injectedFor(db));
  const id = imp.body.results[0].id;
  ok(id, 'the import returns the new row id for the publish button');

  const promo = await call(post({ action: 'promote', id, target: 'listings' }), injectedFor(db));
  eq(promo.statusCode, 200, 'the existing promote action accepts the imported row');
  const listing = (tables.site_listings || [])[0];
  ok(listing && listing.published === true, 'the car is published to the website listings');
  eq(listing.stock_no, STOCK_A, 'the public listing keeps the goo-net stock number');
  ok(listing.image && String(listing.image).includes('picture1.goo-net.com'), 'the published listing carries a real photo');
  const row = tables.japan_dealer_stock[0];
  eq(row.promoted, 'listings', 'the stock row records the promotion');
}

// ---------------------------------------------------------------------------
console.log('\n9) No LLM call, no relay when the source answers directly');
{
  const { db } = memDb({ site_settings: [], japan_dealer_stock: [], goonet_blocklist: [], activities: [], site_listings: [] });
  armFetch({ [STOCK_A]: byteResponse(detailBytes({ stock: STOCK_A })) });
  await call(post({ action: 'preview_import', urls: URL_A }), injectedFor(db));
  ok(!fetchCalls.some(c => /generativelanguage|api\.openai\.com/.test(c.url)), 'the assistant never calls an LLM provider');
  ok(!fetchCalls.some(c => /r\.jina\.ai/.test(c.url)), 'no relay round-trip when goo-net answers directly');
  ok(fetchCalls.every(c => /^https:\/\/www\.goo-net\.com\//.test(c.url)), 'every request stayed on goo-net');
  const detailCall = fetchCalls.find(c => c.url.includes(STOCK_A));
  ok(detailCall && /Mozilla/.test(detailCall.headers['User-Agent'] || ''), 'the fetch sends the browser user agent the core always used');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
