#!/usr/bin/env node
// The goo-net seed must stay a faithful import: every row built from the
// captured listing cards, priced and graded by goonet-core (never by hand),
// and shaped exactly like a japan_dealer_stock row. Run:
//   node scripts/goonet-seed.test.mjs
import { readCapture, buildSeedRows, seedSql, gradeFrom } from './goonet-seed.mjs';
import { yenToUsd, usdText, manToYen } from './goonet-core.mjs';

let pass = 0, fail = 0;
const ok = (cond, name) => { if (cond) { pass++; console.log('  ✓ ' + name); } else { fail++; console.error('  ✗ ' + name); } };
const eq = (a, b, name) => {
  const same = JSON.stringify(a) === JSON.stringify(b);
  if (same) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error(`  ✗ ${name}\n      expected ${JSON.stringify(b)}\n      received ${JSON.stringify(a)}`); }
};

const capture = readCapture();
const rows = buildSeedRows(capture, { importedAt: '2026-08-31T00:00:00.000Z' });

ok(capture.cars.length === 8, `the capture holds ${capture.cars.length} cars`);
eq(rows.length, capture.cars.length, 'every captured car becomes a row');
ok(rows.every(r => r.quality_pass), 'every imported car passes the quality gate');
ok(new Set(rows.map(r => r.goonet_id)).size === rows.length, 'no duplicate goonet_ids (the upsert key)');
ok(rows.every(r => r.vendor === 'Goo-net'), 'every row is attributed to Goo-net');
ok(rows.every(r => r.available === true && r.promoted === 'none'), 'imports start available and unpromoted');
ok(rows.every(r => /^https:\/\/www\.goo-net\.com\/usedcar\/spread\/goo\/\d+\/\d+\.html$/.test(r.goonet_url)),
  'every row keeps its original goo-net listing url');
ok(rows.every(r => (r.images || []).every(u => u.startsWith('https://picture1.goo-net.com/'))),
  'every photo is a real goo-net picture url');
ok(rows.every(r => r.image === r.images[0]), 'the cover photo is the first gallery photo');
ok(rows.every(r => r.photo_count === r.images.length), 'photo_count matches the gallery');
ok(rows.every(r => r.make && r.make !== 'Unknown' && !/[ぁ-んァ-ン]/.test(r.make)),
  'makes are translated to English');
ok(rows.every(r => r.model && !/[ぁ-んァ-ン]/.test(r.model)), 'models are translated to English');
ok(rows.every(r => Number.isInteger(r.year) && r.year >= 2010), 'every row has a plausible model year');
ok(rows.every(r => /^\d+$/.test(String(r.km))), 'mileage is a plain kilometre count');

// Pricing must come from goonet-core, not from a hand-typed number.
for (const [i, r] of rows.entries()) {
  const src = capture.cars[i];
  eq(r.price_jpy, manToYen(src.price_man), `${r.make} ${r.model}: 万円 price converted to yen`);
  eq(r.price_usd, yenToUsd(r.price_jpy), `${r.make} ${r.model}: USD estimate uses the importer rate`);
  eq(r.price, usdText(r.price_usd), `${r.make} ${r.model}: display price matches the USD estimate`);
}
eq(gradeFrom(4, 3), '3.5', 'grade averages the 外装/内装 ratings');
eq(rows[0].grade, '3.5', 'the Atenza carries its real 4/3 condition grade');

// Spot-check two cars against the values printed on the goo-net cards.
const aten = rows.find(r => r.goonet_id === '988026082700209395001');
eq(aten.model, 'Atenza', 'card 1 model');
eq(aten.year, 2019, 'card 1 year (the bare "年式2019後" card)');
eq(aten.km, '47000', 'card 1 mileage');
eq(aten.price_jpy, 1999000, 'card 1 uses 車両本体価格, not 支払総額');
eq(aten.location, '愛知県', 'card 1 location');
eq(aten.eng, '2,200cc', 'card 1 engine is formatted like the importer formats it');
const alphard = rows.find(r => r.goonet_id === '988026082700208975001');
eq(alphard.model, 'Alphard', 'card 8 model');
eq(alphard.body, 'MPV', 'card 8 body type');
eq(alphard.fuel, 'Petrol', 'card 8 fuel');

// ---- SQL ------------------------------------------------------------------
const sql = seedSql(rows, capture);
ok(sql.includes('insert into public.japan_dealer_stock'), 'SQL targets japan_dealer_stock');
ok(sql.includes('on conflict (goonet_id) do update'), 'SQL is idempotent — a re-run refreshes, never duplicates');
ok(rows.every(r => sql.includes(`'${r.goonet_id}'`)), 'every car appears in the SQL');
ok(!/'undefined'|'null'/.test(sql), 'no undefined/null leaked in as a quoted string');
ok(sql.split('),\n  (').length === rows.length, 'the SQL has one value row per car');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
