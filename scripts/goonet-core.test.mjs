// Unit tests for scripts/goonet-core.mjs — pure logic, no network.
//   node scripts/goonet-core.test.mjs
import {
  normaliseConfig, DEFAULTS, stripHtml, extractImages, parseDetailHtml,
  parseSearchHtml, isHighQuality, toListing, inferBody, priceFromYen,
  computeGoonetPlan, applyGoonetPlan, summarizeGoonet
} from './goonet-core.mjs';

let pass = 0, fail = 0;
const t = (name, fn) => {
  try { fn(); pass++; console.log('  ✓ ' + name); }
  catch (e) { fail++; console.error('  ✗ ' + name + '\n      ' + e.message); }
};
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error((msg || 'mismatch') + `\n      expected ${JSON.stringify(b)}\n      got      ${JSON.stringify(a)}`); };
const ok = (v, msg) => { if (!v) throw new Error(msg || 'expected truthy'); };

const SAMPLE = `
<title>TOYOTA LAND CRUISER ZX | 2020 | PEARL | 31070 km | details</title>
<img src="https://picture1.goo-net.com/7000560694/30260821/J/70005606943026082100100.jpg">
${Array.from({ length: 25 }, (_, i) => `<img src="https://picture1.goo-net.com/056/0560694/J/0560694A30260821W001${String(i + 1).padStart(2, '0')}.jpg">`).join('\n')}
<img src="https://www.goo-net-exchange.com/common/assets/img/common/icon/icn_camera.svg">26
<h3>TOYOTA LAND CRUISER ZX</h3>
<strong>Stock Number:</strong> 0560694A30260821W001
¥7,330,000
Chiba Japan
<table>
<tr><th>Month/Year</th><td>12.2020</td></tr>
<tr><th>Color</th><td>PEARL</td></tr>
<tr><th>Mileage</th><td>31,070 km</td></tr>
<tr><th>Steering</th><td>Right</td></tr>
<tr><th>Transmission</th><td>AT</td></tr>
<tr><th>Fuel</th><td>GASOLINE</td></tr>
<tr><th>Drive System</th><td>4WD</td></tr>
<tr><th>Doors</th><td>5D</td></tr>
<tr><th>Displacement</th><td>4600cc</td></tr>
</table>
`;

console.log('\ngoonet-core tests\n');

t('normaliseConfig: defaults when no settings', () => {
  const c = normaliseConfig({});
  eq(c.dailyLimit, 40);
  eq(c.minPhotos, 10);
  eq(c.maxLive, 400);
  eq(c.pinnedCount, 60);
});

t('normaliseConfig: overrides from settings map', () => {
  const c = normaliseConfig({ goonet_daily_limit: '25', goonet_enabled: 'false', goonet_min_photos: '18' });
  eq(c.dailyLimit, 25);
  eq(c.enabled, false);
  eq(c.minPhotos, 18);
});

t('normaliseConfig: seed URLs parse from comma string', () => {
  const c = normaliseConfig({ goonet_seed_urls: 'https://a.com/, https://b.com/' });
  eq(c.seedUrls.length, 2);
  eq(c.seedUrls[0], 'https://a.com/');
});

t('extractImages: dedupes jpg, skips movies', () => {
  const imgs = extractImages(SAMPLE);
  eq(imgs.length, 26);
  eq(imgs[0], 'https://picture1.goo-net.com/7000560694/30260821/J/70005606943026082100100.jpg');
});

t('parseDetailHtml: full field extraction', () => {
  const c = parseDetailHtml(SAMPLE, 'https://www.goo-net-exchange.com/usedcars/TOYOTA/LAND_CRUISER/700056069430260821001/');
  ok(c, 'parsed a car');
  eq(c.make, 'TOYOTA');
  eq(c.model, 'LAND CRUISER ZX');
  eq(c.year, 2020);
  eq(c.km, '31,070');
  eq(c.fuel, 'Petrol');
  eq(c.body, 'SUV');
  eq(c.tr, 'AT');
  eq(c.drv, '4WD');
  eq(c.eng, '4600cc');
  eq(c.col, 'PEARL');
  eq(c.st, 'RHD');
  eq(c.location, 'Chiba');
  eq(c.stock_no, '0560694A30260821W001');
  eq(c.goonet_id, '700056069430260821001');
  eq(c.price, '$47,300');
  eq(c.photo_count, 26);
});

t('parseDetailHtml: rejects non-vehicle pages', () => {
  eq(parseDetailHtml('<html><body>nothing here</body></html>', ''), null);
});

t('priceFromYen: rounds to nearest $100', () => {
  eq(priceFromYen(7330000, 155), '$47,300');
  eq(priceFromYen(1000000, 150), '$6,700');
});

t('inferBody: keyword mapping', () => {
  eq(inferBody('LAND CRUISER ZX'), 'SUV');
  eq(inferBody('ALPHARD S'), 'MPV');
  eq(inferBody('PRIUS S'), 'Sedan');
  eq(inferBody('HIACE WAGON'), 'Van');
  eq(inferBody('CX-5 XD'), 'SUV');
});

t('isHighQuality: respects minPhotos and missing image', () => {
  ok(isHighQuality({ image: 'x.jpg', photo_count: 20 }, 10));
  ok(!isHighQuality({ image: 'x.jpg', photo_count: 3 }, 10));
  ok(!isHighQuality({ photo_count: 30 }, 10), 'no image → reject');
});

t('toListing: maps source/dealer_stock/status', () => {
  const c = parseDetailHtml(SAMPLE, 'https://x/700056069430260821001/');
  const row = toListing(c);
  eq(row.source, 'goonet');
  eq(row.dealer_stock, true);
  eq(row.pinned, false);
  eq(row.status, 'New Arrival');
  eq(row.stock_no, '0560694A30260821W001');
});

t('computeGoonetPlan: inserts new high-quality cars up to the daily limit', () => {
  const cars = Array.from({ length: 5 }, (_, i) => ({
    stock_no: '0560694A30260821W' + String(100 + i).padStart(3, '0'),
    make: 'TOYOTA', model: 'LAND CRUISER', image: 'x.jpg', images: Array(12).fill('x.jpg'),
    photo_count: 12, price: '$10,000', year: 2020
  }));
  const plan = computeGoonetPlan(cars, [], { dailyLimit: 3, pinnedCount: 60 });
  eq(plan.toInsert.length, 3);
  eq(plan.toUpdate.length, 0);
  eq(plan.importedToday, 0);
});

t('computeGoonetPlan: daily limit accounts for cars imported today', () => {
  const cars = [{ stock_no: 'NEW1', make: 'A', model: 'B', image: 'x.jpg', images: Array(12).fill('x.jpg'), photo_count: 12 }];
  const existing = [{ id: 'u1', stock_no: 'OLD1', source: 'goonet', first_seen_at: new Date().toISOString(), sort_order: 61, published: true }];
  const plan = computeGoonetPlan(cars, existing, { dailyLimit: 1, pinnedCount: 60 });
  eq(plan.importedToday, 1);
  eq(plan.toInsert.length, 0, 'limit already consumed today');
});

t('computeGoonetPlan: pinned/manual cars are never touched', () => {
  const cars = [{ stock_no: 'AR7-26001', make: 'Rolls-Royce', model: 'Ghost', image: 'x.jpg', images: Array(12).fill('x.jpg'), photo_count: 12 }];
  const existing = [{ id: 'u1', stock_no: 'AR7-26001', source: 'manual', pinned: true, sort_order: 1, published: true }];
  const plan = computeGoonetPlan(cars, existing, {});
  eq(plan.toInsert.length, 0);
  eq(plan.toUpdate.length, 0);
});

t('computeGoonetPlan: re-seen car is refreshed and restored', () => {
  const cars = [{ stock_no: 'G1', make: 'TOYOTA', model: 'X', image: 'new.jpg', images: Array(12).fill('new.jpg'), photo_count: 12, price: '$9,900', year: 2021 }];
  const existing = [{ id: 'u1', stock_no: 'G1', source: 'goonet', pinned: false, published: false, image: 'old.jpg', images: [], sort_order: 62 }];
  const plan = computeGoonetPlan(cars, existing, {});
  eq(plan.toInsert.length, 0);
  eq(plan.toUpdate.length, 1);
  eq(plan.toUpdate[0].changes.published, true, 'restored to published');
});

t('computeGoonetPlan: hides cars unseen past the grace period', () => {
  const old = new Date(Date.now() - 30 * 86400000).toISOString();
  const existing = [{ id: 'u1', stock_no: 'STALE', source: 'goonet', pinned: false, published: true, last_seen_at: old, sort_order: 63 }];
  const plan = computeGoonetPlan([], existing, { unavailableGraceDays: 21 });
  eq(plan.toUnpublish.length, 1);
});

t('computeGoonetPlan: recently-seen cars are not hidden', () => {
  const recent = new Date(Date.now() - 2 * 86400000).toISOString();
  const existing = [{ id: 'u1', stock_no: 'RECENT', source: 'goonet', pinned: false, published: true, last_seen_at: recent, sort_order: 64 }];
  const plan = computeGoonetPlan([], existing, { unavailableGraceDays: 21 });
  eq(plan.toUnpublish.length, 0);
});

t('computeGoonetPlan: soft cap hides oldest non-pinned overflow', () => {
  const existing = Array.from({ length: 5 }, (_, i) => ({
    id: 'u' + i, stock_no: 'G' + i, source: 'goonet', pinned: false, published: true,
    last_seen_at: new Date().toISOString(), sort_order: 70 + i
  }));
  const plan = computeGoonetPlan([], existing, { maxLive: 3, unavailableGraceDays: 21 });
  eq(plan.overflow.length, 2);
  // oldest (lowest sort_order) are hidden first
  eq(plan.overflow[0].stock_no, 'G0');
  eq(plan.overflow[1].stock_no, 'G1');
});

t('computeGoonetPlan: New Arrival ages to In Stock', () => {
  const old = new Date(Date.now() - 10 * 86400000).toISOString();
  const existing = [{ id: 'u1', stock_no: 'AGED', source: 'goonet', pinned: false, published: true, status: 'New Arrival', first_seen_at: old, sort_order: 80 }];
  const plan = computeGoonetPlan([], existing, { newArrivalDays: 7 });
  eq(plan.statusRoll.length, 1);
});

t('computeGoonetPlan: fresh New Arrival stays', () => {
  const recent = new Date(Date.now() - 1 * 86400000).toISOString();
  const existing = [{ id: 'u1', stock_no: 'FRESH', source: 'goonet', pinned: false, published: true, status: 'New Arrival', first_seen_at: recent, sort_order: 81 }];
  const plan = computeGoonetPlan([], existing, { newArrivalDays: 7 });
  eq(plan.statusRoll.length, 0);
});

t('parseSearchHtml: extracts slug + image links', () => {
  const html = `<a href="https://www.goo-net-exchange.com/usedcars/TOYOTA/LAND_CRUISER/700056069430260821001/">
    <img src="https://picture1.goo-net.com/7000560694/30260821/J/70005606943026082100100.jpg"></a>
    <a href="https://www.goo-net-exchange.com/usedcars/TOYOTA/LAND_CRUISER/975026080100402076001/">
    <img src="https://picture1.goo-net.com/9750260801/00402076/J/97502608010040207600100.jpg"></a>`;
  const entries = parseSearchHtml(html);
  eq(entries.length, 2);
  eq(entries[0].slug, '700056069430260821001');
  eq(entries[1].image, 'https://picture1.goo-net.com/9750260801/00402076/J/97502608010040207600100.jpg');
});

t('applyGoonetPlan: fake db round-trips the plan', async () => {
  const calls = { insert: [], update: [], unpublish: [] };
  const db = {
    from: (table) => ({
      insert: (rows) => { calls.insert.push(rows); return Promise.resolve({ error: null }); },
      update: (payload) => ({ eq: (k, v) => { calls.update.push({ payload, id: v }); return Promise.resolve({ error: null }); }, in: (k, ids) => { calls.unpublish.push({ payload, ids }); return Promise.resolve({ error: null }); } }),
      select: () => Promise.resolve({ data: [], error: null })
    })
  };
  const plan = {
    toInsert: [{ stock_no: 'A' }, { stock_no: 'B' }],
    toUpdate: [{ id: 'u1', stock_no: 'C', changes: { price: '$1' }, payload: { price: '$1' } }],
    toUnpublish: [{ id: 'u2', stock_no: 'D' }],
    overflow: [],
    statusRoll: []
  };
  const done = await applyGoonetPlan(db, plan);
  eq(done.inserted, 2);
  eq(done.updated, 1);
  eq(done.unpublished, 1);
  eq(calls.insert[0].length, 2);
});

t('summarizeGoonet: human line', () => {
  const s = summarizeGoonet({ fetchedCount: 5, seenCount: 4 }, { inserted: 3, updated: 1, unpublished: 2, rolled: 1 });
  ok(s.includes('3 imported'));
  ok(s.includes('2 hidden'));
});

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
