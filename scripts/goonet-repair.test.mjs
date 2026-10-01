#!/usr/bin/env node
// Regression tests for scripts/goonet-repair.mjs — the one-off repair of rows
// the old parser stored wrong.
//
//   node scripts/goonet-repair.test.mjs
//
// The repair may ONLY touch make/model/tr/col/seats/eng/grade. These tests
// prove that price, photos, availability and promotion can never be written by
// it, and that a garbage spec value is repaired while a value that already
// looks like the field is left alone.
import { parseDetailPage } from './goonet-core.mjs';
import { repairFields, gradeFrom, formatChange, inspectRow, REPAIR_COLUMNS } from './goonet-repair.mjs';

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

// A detail page whose navigation names other brands and whose equipment list
// follows the spec rows — the exact shape that produced the bad rows.
const HTML = `<!doctype html><html><body>
<nav>日産 トヨタ マツダ スズキ</nav>
<div><h1>ホンダ　Ｎ－ＢＯＸ カスタム Ｌ</h1>
<img src="https://picture1.goo-net.com/7000000000/30260101/J/x00.jpg" alt="ホンダ N-BOX">
<table>
<tr><th>年式(初度登録)</th><td>2021(令和3)年</td><th>ハンドル</th><td>右</td></tr>
<tr><th>走行距離</th><td>2.3万km</td><th>修復歴</th><td>なし</td></tr>
<tr><th>ミッション</th><td>CVT パワーステアリングＨ　エアコン</td><th>車体色</th><td>ブラックマイカパワーステアリングＨ</td></tr>
<tr><th>排気量</th><td>660cc</td><th>乗車定員</th><td>４名</td></tr>
<tr><th>燃料</th><td>ガソリン</td><th>外装</th><td>4点</td></tr>
<tr><th>内装</th><td>4点</td><th>車両本体価格</th><td>145万円</td></tr>
</table></div></body></html>`;

const url = 'https://www.goo-net.com/usedcar/spread/goo/15/988026062900208975003.html';
const detail = parseDetailPage(HTML, url);

console.log('\n-- repairFields --');
const row = {
  id: 7, goonet_id: '988026062900208975003', stock_no: '988026062900208975003', goonet_url: url,
  make: 'NISSAN', model: 'N-BOX Custom L', tr: 'パワーステアリングＨ', col: 'パワーステアリングＨ',
  seats: null, eng: null, grade: null,
  // Everything below must never appear in a patch:
  price: '$9,900', price_jpy: 1450000, price_usd: 9900, image: 'https://picture1.goo-net.com/x.jpg',
  images: ['https://picture1.goo-net.com/x.jpg'], available: true, promoted: 'listings', status: 'In Stock'
};
const fields = repairFields(row, detail);
eq(fields.make, 'Honda', 'the wrong make (NISSAN → Honda) is repaired');
eq(fields.tr, 'CVT', 'the equipment word is replaced by the real transmission');
eq(fields.col, 'ブラックマイカ', 'the colour is repaired');
eq(fields.seats, 4, 'a missing seat count is filled from the page');
eq(fields.eng, '660cc', 'a missing engine size is filled from the page');
eq(fields.grade, '4', 'the grade is recomputed from the page ratings');
for (const k of Object.keys(fields)) {
  ok(REPAIR_COLUMNS.includes(k), `repair patch only contains a repair column (${k})`);
}
ok(!('price' in fields) && !('price_usd' in fields) && !('price_jpy' in fields),
  'price is never touched by a repair');
ok(!('image' in fields) && !('images' in fields), 'photos are never touched by a repair');
ok(!('available' in fields) && !('promoted' in fields), 'availability and promotion are never touched');
ok(formatChange(row, fields).includes('make: NISSAN → Honda'), 'formatChange reports the make change for the owner');

console.log('\n-- a row that is already correct is left alone --');
const good = { ...row, make: 'Honda', model: 'N-BOX', tr: 'CVT', col: 'ブラックマイカ', seats: 4, eng: '660cc', grade: '4' };
eq(repairFields(good, detail), null, 'an already-correct row produces no patch');
ok(!('tr' in (repairFields({ ...row, tr: 'AT' }, detail) || {})),
  'a value that already looks like a transmission is not rewritten');
ok(!('col' in (repairFields({ ...row, col: 'パールホワイト' }, detail) || {})),
  'a value that already looks like a colour is not rewritten');

console.log('\n-- junk pages never overwrite good data --');
eq(repairFields(row, { make: 'Unknown', title: 'x', model: null }), null, 'an Unknown make is refused');
eq(repairFields(row, { make: 'Toyota' }), null, 'a detail without an <h1> title is refused');
eq(repairFields(row, null), null, 'a missing detail is refused');
// A make that contradicts the model→brand table must not be installed.
ok(!('make' in (repairFields({ ...row, make: 'NISSAN' }, { ...detail, make: 'Nissan' }) || {})),
  'a make contradicting the model table is refused (N-BOX can never become Nissan)');
eq(gradeFrom(null, 4), null, 'gradeFrom needs both ratings');
eq(gradeFrom(4, 5), '4.5', 'gradeFrom averages the two ratings');

console.log('\n-- inspectRow --');
const fetched = { ok: true, status: 200, html: HTML, via: 'direct' };
let res = await inspectRow(row, { fetchImpl: async () => fetched });
ok(!!res.fields && res.fields.make === 'Honda', 'inspectRow returns a patch for a bad row');
res = await inspectRow(row, { fetchImpl: async () => ({ ok: false, status: 404, html: '' }) });
ok(!res.fields && /gone/.test(res.skip), 'a 404 row is skipped, never patched');
res = await inspectRow({ ...row, goonet_url: null }, { fetchImpl: async () => fetched });
ok(!res.fields && /goonet_url/.test(res.skip), 'a row without a stored URL is skipped');
res = await inspectRow(row, { fetchImpl: async () => { throw new Error('timeout'); } });
ok(!res.fields && /fetch failed/.test(res.skip), 'a fetch error is reported, not swallowed');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
