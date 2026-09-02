#!/usr/bin/env node
// scripts/clean-goonet.js must block-then-delete exactly the bad imports:
// fewer than 8 photos, missing/placeholder make or model, old/missing year,
// missing price — and leave good cars and their promoted copies alone.
// Run: node scripts/clean-goonet.test.mjs
import { cleanup, badReason } from './clean-goonet.js';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.error('  ✗ ' + name); } };

// ---- Minimal in-memory Supabase (select/eq/in/order/range/limit/delete/upsert/insert) ----
function memDb(tables) {
  function from(name) {
    const rows = () => tables[name] || (tables[name] = []);
    const q = (mode = 'select') => {
      const ctx = { filters: [], range: null, limit: null, selectAfter: false };
      const apply = () => rows().filter(r => ctx.filters.every(f => f(r)));
      const api = {
        select() { if (mode === 'delete') ctx.selectAfter = true; return api; },
        eq(k, v) { ctx.filters.push(r => r[k] === v); return api; },
        in(k, list) { ctx.filters.push(r => list.includes(r[k])); return api; },
        order() { return api; },
        limit(n) { ctx.limit = n; return api; },
        range(a, b) { ctx.range = [a, b]; return api; },
        then(resolve) {
          if (mode === 'delete') {
            const gone = apply();
            tables[name] = rows().filter(r => !gone.includes(r));
            return resolve({ data: ctx.selectAfter ? gone : null, error: null });
          }
          let data = apply();
          if (ctx.range) data = data.slice(ctx.range[0], ctx.range[1] + 1);
          if (ctx.limit != null) data = data.slice(0, ctx.limit);
          return resolve({ data, error: null });
        }
      };
      return api;
    };
    return {
      select: () => q('select').select(),
      delete: () => q('delete'),
      async upsert(list, opts = {}) {
        const key = opts.onConflict || 'goonet_id';
        for (const item of (Array.isArray(list) ? list : [list])) {
          const ex = rows().find(r => r[key] === item[key]);
          if (ex) Object.assign(ex, item); else rows().push({ ...item });
        }
        return { error: null };
      },
      async insert(row) { rows().push({ ...row }); return { error: null }; }
    };
  }
  return { from };
}

const pics = n => Array.from({ length: n }, (_, i) => `https://picture1.goo-net.com/a/Q/p${String(i).padStart(2, '0')}.jpg`);
const car = (over) => ({
  id: over.id, goonet_id: over.id, stock_no: over.id, make: 'Toyota', model: 'Prius', year: 2019,
  price_jpy: 1500000, price_usd: 10200, photo_count: 12, images: pics(12), promoted: 'none', imported_at: '2026-08-01', ...over
});

const tables = {
  japan_dealer_stock: [
    car({ id: 'GOOD1' }),
    car({ id: 'GOOD2', photo_count: 8, images: pics(8) }),
    car({ id: 'ONEPIC', photo_count: 1, images: pics(1) }),
    car({ id: 'SEVEN', photo_count: 7, images: pics(7) }),
    car({ id: 'COUNTLIES', photo_count: 20, images: pics(3) }),   // photo_count says 20, gallery has 3
    car({ id: 'NOMAKE', make: 'Unknown' }),
    car({ id: 'GENERIC', model: 'Car' }),
    car({ id: 'USEDCAR', model: 'Used Car' }),
    car({ id: 'OLD', year: 1998 }),
    car({ id: 'NOYEAR', year: null }),
    car({ id: 'NOPRICE', price_jpy: null, price_usd: null }),
    car({ id: 'NULLIMG', images: null, photo_count: null })
  ],
  site_listings: [
    { id: 'l1', stock_no: 'GOOD1' }, { id: 'l2', stock_no: 'ONEPIC' }, { id: 'l3', stock_no: 'GENERIC' }, { id: 'l4', stock_no: 'OTHER-SHOWROOM' }
  ],
  vehicles: [
    { id: 'v1', stock_no: 'GOOD1', vendor: 'Goo-net' }, { id: 'v2', stock_no: 'ONEPIC', vendor: 'Goo-net' },
    { id: 'v3', stock_no: 'ONEPIC', vendor: 'AR7 Showroom' }   // same stock no. but not an import → kept
  ],
  goonet_blocklist: [],
  activities: []
};

// ---- badReason -------------------------------------------------------------
ok(badReason(car({ id: 'x' })) === null, 'a complete 12-photo car is fine');
ok(badReason(car({ id: 'x', photo_count: 8, images: pics(8) })) === null, 'exactly 8 photos is fine');
ok(/photos/.test(badReason(car({ id: 'x', photo_count: 7, images: pics(7) })) || ''), '7 photos is bad');
ok(/photos/.test(badReason(car({ id: 'x', photo_count: 20, images: pics(3) })) || ''), 'a photo_count that overstates the gallery is judged by the gallery');
ok(/make/.test(badReason(car({ id: 'x', make: 'Unknown' })) || ''), '"Unknown" make is bad');
ok(/model/.test(badReason(car({ id: 'x', model: 'Car' })) || ''), '"Car" heading is bad');
ok(/model/.test(badReason(car({ id: 'x', model: 'Used Car' })) || ''), '"Used Car" heading is bad');
ok(/model/.test(badReason(car({ id: 'x', model: 'Toyota' })) || ''), 'a model that repeats the make is bad');
ok(/year/.test(badReason(car({ id: 'x', year: 1999 })) || ''), 'pre-2000 is bad');
ok(/price/.test(badReason(car({ id: 'x', price_jpy: 0, price_usd: 0 })) || ''), 'no price is bad');
ok(badReason(car({ id: 'x', price_jpy: null, price_usd: 9000 })) === null, 'a USD-only price still counts as priced');
ok(/photos/.test(badReason(car({ id: 'x', images: pics(10), photo_count: 10 }), { minPhotos: 12 }) || ''), 'minPhotos is configurable');

// ---- dry run: nothing changes ----------------------------------------------
const logs = [];
const snapshot = JSON.stringify(tables);
const dry = await cleanup(memDb(tables), { dryRun: true, log: m => logs.push(m) });
ok(dry.dryRun === true && dry.bad === 10 && dry.deleted === 0 && dry.blocked === 0, `dry run finds 10 bad cars and touches nothing (bad=${dry.bad})`);
ok(JSON.stringify(tables) === snapshot, 'dry run leaves every table untouched');
ok(logs.some(l => /DRY RUN/.test(l)), 'dry run says so');

// ---- real run --------------------------------------------------------------
const res = await cleanup(memDb(tables), { log: () => {} });
const left = tables.japan_dealer_stock.map(r => r.id).sort();
ok(JSON.stringify(left) === JSON.stringify(['GOOD1', 'GOOD2']), `only the two good cars remain (${left.join(', ')})`);
ok(res.deleted === 10 && res.blocked === 10, `10 cars deleted and 10 blocked (deleted=${res.deleted}, blocked=${res.blocked})`);
const blocked = tables.goonet_blocklist.map(r => r.goonet_id).sort();
ok(JSON.stringify(blocked) === JSON.stringify(['COUNTLIES', 'GENERIC', 'NOMAKE', 'NOPRICE', 'NOYEAR', 'NULLIMG', 'OLD', 'ONEPIC', 'SEVEN', 'USEDCAR']),
  'every deleted car is on the blocklist');
ok(tables.goonet_blocklist.every(r => r.reason && r.blocked_at && r.stock_no), 'blocklist rows carry stock_no, reason and blocked_at');
ok(tables.goonet_blocklist.find(r => r.goonet_id === 'ONEPIC').reason.includes('1 photos'), 'the reason names the photo count');
ok(tables.site_listings.map(r => r.id).sort().join() === 'l1,l4', 'website copies of bad cars are removed; good + non-import listings stay');
ok(tables.vehicles.map(r => r.id).sort().join() === 'v1,v3', 'CRM copies of bad cars are removed; the showroom car with the same stock no. stays');
ok(tables.activities.length === 1 && /blocked and deleted 10/.test(tables.activities[0].action), 'the cleanup is written to the activity log');
ok(tables.japan_dealer_stock.every(r => (r.photo_count ?? 0) >= 8 && r.images.length >= 8), 'SELECT COUNT(*) WHERE photo_count < 8 would now be 0');

// ---- re-run is a no-op -----------------------------------------------------
const again = await cleanup(memDb(tables), { log: () => {} });
ok(again.bad === 0 && again.deleted === 0 && tables.japan_dealer_stock.length === 2, 'a second run finds nothing to do');

// ---- --keep-copies ---------------------------------------------------------
const t2 = { japan_dealer_stock: [car({ id: 'BAD', photo_count: 2, images: pics(2) })], site_listings: [{ id: 'l', stock_no: 'BAD' }], vehicles: [], goonet_blocklist: [], activities: [] };
await cleanup(memDb(t2), { keepCopies: true, log: () => {} });
ok(t2.japan_dealer_stock.length === 0 && t2.site_listings.length === 1 && t2.goonet_blocklist.length === 1, '--keep-copies blocks and deletes the import but leaves the website copy');

// ---- missing blocklist table → refuses to run -------------------------------
const noTable = { from: name => name === 'goonet_blocklist'
  ? { select: () => ({ limit: () => ({ then: r => r({ data: null, error: new Error('relation "goonet_blocklist" does not exist') }) }) }) }
  : memDb({ japan_dealer_stock: [] }).from(name) };
let threw = null;
try { await cleanup(noTable, { log: () => {} }); } catch (e) { threw = e; }
ok(threw && /goonet_blocklist is missing/.test(threw.message), 'without the blocklist table the script stops instead of deleting');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
