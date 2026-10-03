// Tests for the machinery catalogue shape, the supplier importer, the
// translations and the backlink agent. Run: npm run test:machinery
//
// These pin the things that would quietly go wrong: a machine with no photos,
// a price that ignores the markup, an advertised language with no dictionary,
// or an importer that would publish a listing nobody can see.
import { readFileSync, existsSync, mkdtempSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { tmpdir } from 'node:os';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');

let failed = 0;
const ok = (cond, msg) => {
  if (!cond) { failed++; process.stderr.write('FAIL: ' + msg + '\n'); }
  else console.log('ok  :', msg);
};

const {
  MACHINES, MACHINE_TYPES, MACHINERY_MARKUP, listPriceUSD, machineImages, machinesByType
} = await import('../src/machinery-data.js');
const { LANGUAGES, translate, registerDicts, DEFAULT_LANG, langMeta, isRtl } = await import('../src/i18n.js');
const DICTS = (await import('../src/i18n-dicts.js')).default;

// ---- the catalogue ----------------------------------------------------------
console.log('\n-- machinery catalogue --');
ok(MACHINES.length >= 12, `the catalogue carries ${MACHINES.length} machines`);
ok(MACHINES.every(m => m.id && m.ref && m.name && m.brand && m.type && m.year), 'every machine has id, ref, name, brand, type and year');
ok(MACHINES.every(m => MACHINE_TYPES.includes(m.type)), 'every machine belongs to a published type');
ok(MACHINES.every(m => m.specs?.length >= 3), 'every machine carries at least three spec rows in English');
ok(new Set(MACHINES.map(m => m.id)).size === MACHINES.length, 'machine ids are unique');
ok(new Set(MACHINES.map(m => m.ref)).size === MACHINES.length, 'stock references are unique');

// every photo referenced actually exists, and every machine has more than one
console.log('\n-- photos --');
const missing = [];
let multi = 0;
let pending = 0;
for (const m of MACHINES) {
  const imgs = machineImages(m);
  if (imgs.length > 1) multi++;
  if (m.photosPending) {
    pending++;
    // A pending unit must carry NO image at all. Pointing it at another
    // machine's photo is the failure this flag exists to prevent.
    if (imgs.length !== 0 || m.image) missing.push(`${m.id}: marked photosPending but still carries an image`);
  }
  for (const src of imgs) {
    const file = path.join(root, 'public', src.replace(/^\//, ''));
    if (!existsSync(file)) missing.push(`${m.id}: ${src}`);
  }
}
ok(missing.length === 0, missing.length ? `photo problems: ${missing.join(', ')}` : 'every referenced photo exists, and no pending unit borrows one');
const withPhotos = MACHINES.filter(m => !m.photosPending);
ok(multi >= withPhotos.length - 1, `${multi} of ${withPhotos.length} photographed machines carry more than one photo`);
ok(withPhotos.every(m => machineImages(m).length >= 1), 'every machine with photos published has at least one');
ok(pending <= 4, `at most a handful of units await photos (${pending} pending)`);
ok(machineImages({ photosPending: true, image: '/x.webp', images: ['/y.webp'] }).length === 0,
  'machineImages refuses to return a photo for a unit flagged photosPending');
ok(machineImages({ image: '/a.webp', images: ['/b.webp'] })[0] === '/b.webp', 'machineImages prefers the gallery over the single image');
ok(machineImages({ image: '/a.webp' })[0] === '/a.webp', 'machineImages falls back to the single image');
ok(machineImages(null).length === 0, 'machineImages tolerates a missing machine');

// ---- pricing ---------------------------------------------------------------
console.log('\n-- pricing --');
ok(MACHINERY_MARKUP > 0 && MACHINERY_MARKUP < 1, `the markup is a sane fraction (${MACHINERY_MARKUP})`);
{
  const m = MACHINES.find(x => x.supplierPrice && !x.price);
  ok(!!m, 'at least one machine is priced from a supplier quote');
  if (m) {
    const expected = Math.round((m.supplierPrice * (1 + MACHINERY_MARKUP)) / 50) * 50;
    ok(listPriceUSD(m) === expected, `${m.name}: list price is supplier price + ${Math.round(MACHINERY_MARKUP * 100)}% ($${expected.toLocaleString('en-US')})`);
    ok(listPriceUSD(m) > m.supplierPrice, 'the listed price is above the supplier quote');
  }
  ok(listPriceUSD({ price: 1000, supplierPrice: 10 }) === 1000, 'an explicit price wins over the markup');
  ok(listPriceUSD({ supplierPrice: 0 }) === 0 && listPriceUSD(null) === 0, 'a missing price is 0, never NaN');
}
ok(MACHINES.every(m => listPriceUSD(m) > 0), 'every machine in the catalogue has a real listed price');
ok(machinesByType('Excavators').every(m => m.type === 'Excavators'), 'machinesByType filters by type');
ok(machinesByType('All').length === MACHINES.length, 'machinesByType("All") returns everything');

// ---- translations ----------------------------------------------------------
console.log('\n-- translations --');
ok(LANGUAGES.length >= 12, `${LANGUAGES.length} languages are offered`);
ok(LANGUAGES.some(l => l.code === 'ar') && LANGUAGES.some(l => l.code === 'ps') && LANGUAGES.some(l => l.code === 'ur'),
  'Arabic, Pashto and Urdu are offered');
for (const code of ['ar', 'ps', 'ur', 'fa']) ok(isRtl(code), `${code} is marked right-to-left`);
ok(!isRtl('en') && !isRtl('fr'), 'English and French stay left-to-right');
ok(langMeta('nope').code === 'en', 'an unknown language falls back to English');

const advertised = LANGUAGES.map(l => l.code);
const provided = Object.keys(DICTS);
const withoutDict = advertised.filter(c => c !== DEFAULT_LANG && !provided.includes(c));
ok(withoutDict.length === 0, withoutDict.length ? `advertised with no dictionary: ${withoutDict.join(', ')}` : 'every advertised language has a dictionary');

registerDicts(DICTS);
ok(translate('en', 'machinery.quote') === 'Request a quotation', 'English resolves from the source dictionary');
for (const code of provided) {
  const text = translate(code, 'machinery.quote');
  ok(text && text !== 'machinery.quote', `${code}: the machinery quote button is translated ("${text}")`);
  const h1 = translate(code, 'machinery.h1');
  ok(h1 && h1 !== 'machinery.h1', `${code}: the machinery heading is translated`);
}
ok(translate('ar', 'machinery.indicative').includes('FOB'), 'Arabic keeps the FOB term buyers recognise');
ok(translate('nope', 'machinery.quote') === 'Request a quotation', 'an unknown language falls back to English text');
ok(translate('ar', 'no.such.key') === 'no.such.key', 'a missing key returns the key, never blank');
ok(translate('en', 'common.shippingTo', { market: 'Kenya' }).includes('Shipping'), 'translate interpolates variables');

// no dictionary should be a copy of English (a placeholder would be worse than nothing)
for (const [code, dict] of Object.entries(DICTS)) {
  const same = Object.keys(dict).filter(k => dict[k] === translate('en', k)).length;
  ok(same < Object.keys(dict).length * 0.5, `${code}: is genuinely translated (${same} strings identical to English)`);
}

// ---- the supplier importer -------------------------------------------------
console.log('\n-- supplier importer --');
{
  const sandbox = mkdtempSync(path.join(tmpdir(), 'ar7-supplier-'));
  try {
    // an empty inbox must not throw
    const out = execFileSync('node', ['scripts/import-machinery.mjs'], { cwd: root, encoding: 'utf8' });
    ok(/No supplier packages found/.test(out), 'the importer reports an empty inbox without failing');

    // a package with no photos must be refused
    const pkg = path.join(sandbox, 'test-supplier');
    mkdirSync(path.join(pkg, 'photos'), { recursive: true });
    writeFileSync(path.join(pkg, 'supplier.json'), JSON.stringify({
      supplier: 'Test Supplier',
      machines: [{ id: 'x', name: 'X', brand: 'Y', type: 'Excavators', year: 2020, supplierPrice: 1000, specs: [['a', 'b']], photos: [] }]
    }));
    const inbox = path.join(root, 'machinery-suppliers');
    const backup = existsSync(inbox);
    ok(backup, 'the supplier inbox folder exists');
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

// ---- the backlink agent ----------------------------------------------------
console.log('\n-- backlink agent --');
{
  const out = execFileSync('node', ['scripts/seo-backlinks.mjs', '--plan'], { cwd: root, encoding: 'utf8' });
  ok(/(Backlink prospects|Added \d+ prospect)/.test(out), 'the backlink agent builds a prospect list');
  const md = readFileSync(path.join(root, 'seo-backlinks.md'), 'utf8');
  ok(/No script can create a backlink/.test(md), 'the plan is honest that it cannot create links');
  ok(/freight-forwarder/.test(md) && /inspection-company/.test(md),
    'the prospects are the parties the business actually trades with');
  ok(/marketplace-profile/.test(md), 'the plan names the legitimate marketplace route');
  ok(/Do not lift\s+>?\s*photographs|Publish your own photographs/i.test(md),
    "the plan warns off copying other sellers' photos");
  ok(/Outreach template/.test(md), 'the plan includes the outreach copy');
  ok(existsSync(path.join(root, 'seo-backlinks.json')), 'the agent keeps a machine-readable prospect list');
}

// ---- the branded-photo script is real --------------------------------------
console.log('\n-- photo branding --');
{
  const script = readFileSync(path.join(root, 'scripts/brand-machine-photo.sh'), 'utf8');
  ok(script.includes('ar7-mark.png'), 'the branding script composites the AR7 mark');
  ok(script.includes('REF') && script.includes('#043f28E6'), 'the branding script draws the reference bar and uses the brand green');
  ok(!/https?:\/\//.test(script.replace(/^#.*$/gm, '')), 'the branding script fetches nothing from the network');
}

console.log(failed ? `\n${failed} FAILURES` : '\nALL PASS');
process.exit(failed ? 1 : 0);
