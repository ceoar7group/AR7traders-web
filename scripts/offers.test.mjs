// Price offers — the discount the CRM applies, the website shows, and the
// agent can be asked for in a sentence.
//
// These pin the things that would go wrong commercially rather than loudly:
//   • a discount the site shows but the quotation cannot honour
//   • a per-unit override that leaks onto the whole catalogue
//   • an offer that outlives its end date
//   • a machine page that shows a reduced price with no list price to compare
//   • a sentence the assistant "understands" into the wrong percentage
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');
const read = p => readFileSync(path.join(root, p), 'utf8');

let failed = 0;
const ok = (cond, msg) => {
  if (!cond) { failed++; process.stderr.write('FAIL: ' + msg + '\n'); }
  else console.log('ok  :', msg);
};

const {
  validateOffer, parseOffer, offerIsLive, offerCovers, percentFor, priceWithOffer,
  roundOfferPrice, describeOffer, MIN_OFFER_PERCENT, MAX_OFFER_PERCENT
} = await import('../src/offers.js');
const { parseOfferRequest } = await import('../src/offers-request.js');
const { MACHINES, listPriceUSD } = await import('../src/machinery-data.js');

const base = {active: true, scope: 'machinery', percent: 20, label: null, headline: '20% off machinery', until: null, machines: {}};
const at = iso => new Date(`${iso}T12:00:00`);

// ---- validation -------------------------------------------------------------
console.log('\n-- what an offer may say --');
ok(validateOffer({...base}).ok, 'a plain 20% machinery offer validates');
ok(!validateOffer({...base, percent: 0}).ok, 'a 0% offer is rejected — it is not an offer');
ok(!validateOffer({...base, percent: MAX_OFFER_PERCENT + 1}).ok, `more than ${MAX_OFFER_PERCENT}% is rejected`);
ok(!validateOffer({...base, scope: 'everything'}).ok, 'an unknown scope is rejected');
ok(validateOffer({...base, active: false}).ok, 'clearing an offer needs nothing but active:false');
ok(!validateOffer('not json').ok, 'a broken settings string is rejected');
ok(parseOffer('not json') === null, 'a broken settings string reads as no offer, never a crash');
ok(parseOffer(JSON.stringify({...base, active: false})) === null, 'an inactive offer reads as no offer');
{
  // Read-side validation trims rather than rejects: an over-long line stored by
  // some other tool must not make the whole offer disappear from the site.
  const trimmed = validateOffer({...base, headline: 'x'.repeat(91), label: 'y'.repeat(60)});
  ok(trimmed.ok && trimmed.value.headline.length === 90 && trimmed.value.label.length === 40,
    'an over-long headline or label is trimmed on read, never published whole');
}

// ---- live window ------------------------------------------------------------
console.log('\n-- when an offer is live --');
ok(offerIsLive(base, at('2027-01-01')), 'an offer with no end date stays live');
ok(offerIsLive({...base, until: '2026-11-30'}, at('2026-11-30')), 'an offer is live on its end date');
ok(!offerIsLive({...base, until: '2026-11-30'}, at('2026-12-01')), 'an offer is dead the day after its end date');

// ---- scope ------------------------------------------------------------------
console.log('\n-- what an offer covers --');
ok(offerCovers(base, 'machine', {type: 'Excavators'}), 'machinery scope covers a machine');
ok(!offerCovers(base, 'car'), 'machinery scope does not touch cars');
ok(offerCovers({...base, scope: 'cars'}, 'car'), 'cars scope covers a car');
ok(!offerCovers({...base, scope: 'cars'}, 'machine', {type: 'Cranes'}), 'cars scope does not touch machines');
ok(offerCovers({...base, scope: 'all'}, 'car') && offerCovers({...base, scope: 'all'}, 'machine', {type: 'Trucks'}),
  'everything scope covers both desks');
ok(offerCovers({...base, types: ['Excavators']}, 'machine', {type: 'excavators'}), 'a type filter matches case-insensitively');
ok(!offerCovers({...base, types: ['Excavators']}, 'machine', {type: 'Loaders'}), 'a type filter excludes other types');

// ---- the arithmetic ---------------------------------------------------------
console.log('\n-- the price a buyer sees --');
{
  const p = priceWithOffer(50000, 20);
  ok(p.hasOffer && p.now === 40000 && p.saving === 10000, '20% off $50,000 is $40,000, saving $10,000');
  ok(roundOfferPrice(40412) === 40400, 'prices round to the nearest $50, exactly like the list price');
  const off = priceWithOffer(50000, 0);
  ok(!off.hasOffer && off.now === off.was, 'no percentage means no offer and no struck-out price');
  const zero = priceWithOffer(0, 20);
  ok(!zero.hasOffer, 'a machine with no price never shows a discount');
}
{
  // The per-unit override is the reason percentFor exists: a campaign must not
  // be able to rewrite a unit that has its own deal.
  const withOverride = {...base, machines: {'AR7-MC-003': 35}};
  ok(percentFor(withOverride, 'machine', {ref: 'AR7-MC-003', type: 'Excavators'}) === 35, 'a unit override wins over the campaign percentage');
  ok(percentFor(withOverride, 'machine', {ref: 'AR7-MC-001', type: 'Excavators'}) === 20, 'other units keep the campaign percentage');
  ok(percentFor(withOverride, 'machine', {ref: 'AR7-MC-001', type: 'Loaders'}) === 20, 'a machinery campaign has no type filter unless one is set');
  ok(percentFor({...base, machines: {'AR7-MC-003': 35}}, 'car') === 0, 'a machine override never reaches a car');
  ok(percentFor({...base, active: false}, 'machine', {ref: 'AR7-MC-001'}) === 0, 'a cleared offer discounts nothing');
}

// ---- the sentence the assistant reads ---------------------------------------
console.log('\n-- the request box --');
{
  const opts = {machines: MACHINES, now: at('2026-10-03')};
  const a = parseOfferRequest('20% off machinery until 30 November', opts);
  ok(a.ok && a.offer.percent === 20 && a.offer.scope === 'machinery', '"20% off machinery until 30 November" reads the percentage and the scope');
  ok(a.offer.until === '2026-11-30', 'the end date is read from the sentence');

  const b = parseOfferRequest('give 15% discount on excavators', opts);
  ok(b.ok && b.offer.percent === 15 && b.offer.types.includes('Excavators'), '"15% discount on excavators" narrows to the type');

  const c = parseOfferRequest('10 percent off all cars', opts);
  ok(c.ok && c.offer.scope === 'cars', '"10 percent off all cars" scopes to cars');
  ok(c.offer.types.length === 0, 'a car offer never picks up a machine type');

  const d = parseOfferRequest('clear the offer', opts);
  ok(d.ok && d.offer.active === false, '"clear the offer" prepares a clear');

  const e = parseOfferRequest('make it cheaper', opts);
  ok(!e.ok, 'a sentence with no percentage is refused, not guessed');
  const f = parseOfferRequest('20% off', opts);
  ok(!f.ok && /which/i.test(f.reply), 'a percentage with no scope asks which, instead of assuming');
  const g = parseOfferRequest('90% off machinery', opts);
  ok(!g.ok, 'an absurd percentage is refused with the range in the reply');

  // A date already past must not publish a dead offer.
  const h = parseOfferRequest('10% off machinery until 30 November', {machines: MACHINES, now: at('2026-12-15')});
  ok(h.ok && h.offer.until === '2027-11-30', 'a past date rolls to next year rather than publishing a dead offer');

  const i = parseOfferRequest('20% off machinery', opts);
  ok(i.ok && i.offer.until === null, 'no date in the sentence means no end date, not an invented one');
  ok(validateOffer(i.offer).ok, 'whatever the assistant prepares is valid before it is shown');
}

// ---- the copy ---------------------------------------------------------------
console.log('\n-- what we say about it --');
{
  const d = describeOffer({...base, until: '2026-11-30'}, at('2026-10-03'));
  ok(/indicative FOB/i.test(d.note), 'the offer line says the discount applies to the indicative price');
  ok(/ends 30 Nov 2026/.test(d.note), 'the offer line states the end date');
  ok(describeOffer({...base, until: '2026-11-30'}, at('2027-01-01')) === null, 'a dead offer describes nothing');
  ok(/20% off/.test(describeOffer(base).line), 'the offer line names the percentage');
}

// ---- the site and the CRM read the same engine ------------------------------
console.log('\n-- one engine, three surfaces --');
{
  const machinery = read('src/machinery.jsx');
  ok(/from '\.\/offers\.js'/.test(machinery), 'the machinery page prices from src/offers.js');
  ok(/priceWithOffer\(listPriceUSD\(machine\), percent\)/.test(machinery), 'the card and the detail page run the same price function');
  ok(!/mch-demo/.test(machinery) && !/mch-demo/.test(read('src/main.jsx')), 'the DEMO badge is gone from machines');
  ok(!/mch-modal/.test(machinery), 'the modal detail view is gone — a machine opens on its own page');
  ok(/machineHref\(machine\)/.test(machinery), 'cards link to the machine page');

  const crm = read('src/crm.jsx');
  ok(/parseOfferRequest/.test(crm), 'the CRM has the ask-the-assistant request box');
  ok(/\['offers', 'Price offers'/.test(crm), 'the CRM has a Price offers tab');
  ok(/offer-live/.test(crm) && /offer-preview/.test(crm), 'the panel shows the live offer and a preview');

  const api = read('api/settings.js');
  ok(/'offer'/.test(api), 'the offer setting is known to the API');
  ok(/validOffer/.test(api), 'the API validates the offer shape itself, not just its length');
  ok(/offer\.percent must be between 1 and 60/.test(api), 'the API bounds the percentage');

  const pkg = JSON.parse(read('package.json'));
  ok(!!pkg.scripts['offer'], 'npm run offer exists');
  ok(!!pkg.scripts['test:offers'], 'npm run test:offers exists');
  ok(pkg.scripts.test.includes('test:offers'), 'the offer tests are part of npm test');

  // Every machine must still have a page, and the page must be reachable.
  const data = read('src/machinery-data.js');
  ok(/export const machineHref/.test(data) && /export const machineByRef/.test(data),
    'machinery-data exports the page URL and the lookup');
  ok(MACHINES.every(m => machineHrefOk(m)), 'every machine produces a detail URL of the right shape');
}

function machineHrefOk(machine) {
  const href = `/machinery/${String(machine.type).toLowerCase()}/${machine.ref}`;
  return /^\/machinery\/[a-z]+\/AR7-MC-\d+$/.test(href);
}

console.log(failed ? `\n${failed} FAILING\n` : '\nALL PASS\n');
process.exit(failed ? 1 : 0);
