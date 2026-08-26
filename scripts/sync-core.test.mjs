// Regression test for the website stock sync core (no Supabase needed).
//   node scripts/sync-core.test.mjs
// Counts are derived from the seed file itself, so adding cars keeps the test valid:
//   • first SHOWROOM entries of the seed are the showroom cars (sort_order 1–12)
//   • every remaining seed entry is a Japan-stock (Goo-net) car
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {computePlan, applyPlan, summarize} from './sync-core.mjs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const seed = JSON.parse(readFileSync(path.join(dir, '../src/site-content.seed.json'), 'utf8')).listings;

const SHOWROOM = 12;                       // showroom block size (sort_order 1–12)
const TOTAL = seed.length;                 // all seed cars
const GOONET = TOTAL - SHOWROOM;           // Japan-stock cars in the seed
const OLD_IMPORT = 42;                     // simulated stale "old import" row count
const STALE = OLD_IMPORT - SHOWROOM;       // old rows not in the seed (AR7-26013+)

// ---- minimal Supabase-thenable mock ----------------------------------------
function makeDb(tables) {
  return {
    from(table) {
      let mode = null, payload = null, filter = null;
      const builder = {
        select: () => { mode = 'select'; return builder; },
        insert: p => { mode = 'insert'; payload = p; return builder; },
        update: p => { mode = 'update'; payload = p; return builder; },
        delete: () => { mode = 'delete'; return builder; },
        eq: (c, v) => { filter = r => r[c] === v; return builder; },
        in: (c, vs) => { filter = r => vs.includes(r[c]); return builder; },
        then(res, rej) {
          Promise.resolve().then(() => {
            const rows = tables[table];
            if (mode === 'select') return res({ data: rows.filter(filter ?? (() => true)), error: null });
            if (mode === 'insert') {
              const arr = Array.isArray(payload) ? payload : [payload];
              const created = arr.map(r => ({ id: 'gen-' + Math.random().toString(36).slice(2), ...r }));
              rows.push(...created);
              return res({ data: created, error: null });
            }
            if (mode === 'update') {
              if (!filter) throw new Error('update without filter');
              const hits = rows.filter(filter);
              hits.forEach(r => Object.assign(r, payload));
              return res({ data: hits, error: null });
            }
            if (mode === 'delete') {
              if (!filter) throw new Error('delete without filter');
              for (let i = rows.length - 1; i >= 0; i--) if (filter(rows[i])) rows.splice(i, 1);
              return res({ data: null, error: null });
            }
            throw new Error('no mode set');
          }).catch(rej);
        }
      };
      return builder;
    }
  };
}

// The live DB as of 2026-08-26: the old 42-car import, all published, no galleries.
function oldImport() {
  const rows = [];
  for (let i = 1; i <= OLD_IMPORT; i++) {
    rows.push({
      id: 'old-' + i, stock_no: 'AR7-26' + String(i).padStart(3, '0'),
      make: 'Toyota', model: 'Old Car ' + i, year: 2020, km: '100',
      fuel: 'Petrol', body: 'SUV', price: '$10,000',
      image: '/assets/old-' + i + '.jpg', images: null, gallery: null,
      grade: '4.0', status: 'In Stock', location: 'Tokyo',
      tr: 'AT', drv: '2WD', eng: '2,000cc', seats: 5, col: 'White', st: 'RHD',
      published: true, sort_order: i
    });
  }
  return rows;
}

let failures = 0;
function check(name, cond, extra) {
  if (cond) console.log('  ✓ ' + name);
  else { failures++; console.error('  ✗ ' + name + (extra ? ' — ' + extra : '')); }
}

// ---- 1. default mode: insert Goo-net, update showroom, hide stale ------------
console.log(`\n1) old ${OLD_IMPORT}-car import → seed sync (default: hide stale rows)`);
{
  const rows = oldImport();
  const db = makeDb({site_listings: rows});
  const {data: dbRows} = await db.from('site_listings').select('*');
  const plan = computePlan(seed, dbRows, {hardDelete: false});

  check(`${GOONET} Goo-net cars inserted`, plan.toInsert.length === GOONET, 'got ' + plan.toInsert.length);
  check(`${SHOWROOM} showroom cars updated (galleries added)`, plan.toUpdate.length === SHOWROOM, 'got ' + plan.toUpdate.length);
  check(`${STALE} stale old-import cars hidden`, plan.toUnpublish.length === STALE, 'got ' + plan.toUnpublish.length);
  check('nothing hard-deleted in default mode', plan.toDelete.length === 0);

  // seed order: positions 1–12 showroom, rest Goo-net
  const insOrders = plan.toInsert.map(r => r.sort_order).sort((a, b) => a - b);
  check('inserted cars take positions 13–' + TOTAL, JSON.stringify(insOrders) === JSON.stringify([...Array(GOONET)].map((_, i) => SHOWROOM + 1 + i)), JSON.stringify(insOrders));
  const updOrders = plan.toUpdate.map(r => r.payload.sort_order).sort((a, b) => a - b);
  check('showroom cars keep positions 1–12', JSON.stringify(updOrders) === JSON.stringify([...Array(SHOWROOM)].map((_, i) => 1 + i)), JSON.stringify(updOrders));
  check('inserted rows are published with galleries', plan.toInsert.every(r => r.published === true && Array.isArray(r.images) && r.images.length > 0));

  const done = await applyPlan(db, plan);
  const {data: after} = await db.from('site_listings').select('*');
  const published = after.filter(r => r.published).sort((a, b) => a.sort_order - b.sort_order);

  check(`table has ${OLD_IMPORT + GOONET} rows (${OLD_IMPORT} old + ${GOONET} new, nothing deleted — reversible)`, after.length === OLD_IMPORT + GOONET, 'got ' + after.length);
  check(`exactly ${TOTAL} published cars`, published.length === TOTAL, 'got ' + published.length);
  check('first 12 published are showroom AR7-26001–26012',
    published.slice(0, SHOWROOM).every((r, i) => r.stock_no === 'AR7-26' + String(i + 1).padStart(3, '0')),
    published.slice(0, SHOWROOM).map(r => r.stock_no).join(','));
  check('published cars carry the seed galleries', published.every(r => Array.isArray(r.images) && r.images.length > 0));
  console.log('    summary: ' + summarize(plan, done));

  // idempotency — a second sync must be a no-op
  const plan2 = computePlan(seed, after, {hardDelete: false});
  check('second run is a no-op', plan2.toInsert.length === 0 && plan2.toUpdate.length === 0 && plan2.toUnpublish.length === 0 && plan2.unchanged.length === TOTAL,
    `insert=${plan2.toInsert.length} update=${plan2.toUpdate.length} hide=${plan2.toUnpublish.length} ok=${plan2.unchanged.length}`);

  // stale rows already hidden stay untouched
  const plan3 = computePlan(seed, after, {hardDelete: false});
  check('already-hidden rows are not re-updated', plan3.toUnpublish.length === 0);
}

// ---- 2. hard-delete mode -----------------------------------------------------
console.log('\n2) --hard-delete: stale rows are removed');
{
  const rows = oldImport();
  const db = makeDb({site_listings: rows});
  const {data: dbRows} = await db.from('site_listings').select('*');
  const plan = computePlan(seed, dbRows, {hardDelete: true});
  check(`${STALE} stale rows marked for deletion`, plan.toDelete.length === STALE, 'got ' + plan.toDelete.length);
  check('no unpublished list in hard-delete mode', plan.toUnpublish.length === 0);
  await applyPlan(db, plan);
  const {data: after} = await db.from('site_listings').select('*');
  check(`exactly ${TOTAL} rows remain, all published`, after.length === TOTAL && after.every(r => r.published), 'got ' + after.length);
}

// ---- 3. empty table bootstrap -------------------------------------------------
console.log(`\n3) empty site_listings → full insert of the ${TOTAL} seed cars`);
{
  const db = makeDb({site_listings: []});
  const plan = computePlan(seed, [], {hardDelete: false});
  check(`${TOTAL} inserts, 0 stale`, plan.toInsert.length === TOTAL && plan.staleCount === 0);
  await applyPlan(db, plan);
  const {data: after} = await db.from('site_listings').select('*');
  check(`${TOTAL} published rows, sort_order 1–${TOTAL}`, after.length === TOTAL && after.every(r => r.published) && after.sort((a, b) => a.sort_order - b.sort_order).every((r, i) => r.sort_order === i + 1));
}

console.log(failures ? `\n${failures} check(s) FAILED\n` : '\nAll checks passed.\n');
process.exit(failures ? 1 : 0);
