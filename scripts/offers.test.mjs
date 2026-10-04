#!/usr/bin/env node
// Regression coverage for per-stock prices, public hand-off and the CLI.
// Network boundaries below use a fake fetch. This suite never makes a live call.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = file => readFileSync(path.join(root, file), 'utf8');
let failed = 0;
const ok = (condition, message) => {
  if (!condition) { failed++; console.error('FAIL:', message); }
  else console.log('ok  :', message);
};
const at = iso => new Date(`${iso}T12:00:00`);

const discounts = await import('../src/stock-discounts.js');
const pricing = await import('../src/offers.js');
const cli = await import('./offer.mjs');
const catalogue = await import('../src/stock-discount-catalogue.js');
const {MACHINES} = await import('../src/machinery-data.js');
const {
  EMPTY_STOCK_DISCOUNTS, STOCK_DISCOUNT_MAX_ITEMS, validateStockDiscounts,
  parseStockDiscounts, stockDiscountKey, stockDiscountIsLive, stockDiscountFor,
  describeStockDiscounts
} = discounts;
const {priceWithOffer, barRows, campaignIsLive} = pricing;
const base = {version: 1, items: {
  'car:STOCK-42': {kind: 'car', ref: 'STOCK-42', percent: 15, until: '2026-11-30', label: 'Autumn price'},
  'machine:AR7-MC-003': {kind: 'machine', ref: 'AR7-MC-003', percent: 20, until: null, label: null}
}};

console.log('\n-- per-stock validation and keys --');
ok(stockDiscountKey('CAR', ' stock-42 ') === 'car:STOCK-42', 'car references are normalized to a stable, case-insensitive key');
ok(stockDiscountKey('machine', 'AR7-MC-003') === 'machine:AR7-MC-003', 'machinery references use a separate key namespace');
ok(stockDiscountKey('catalogue', 'all') === '', 'there is no catalogue-wide discount key');
ok(validateStockDiscounts(base).ok, 'a distinct vehicle and machine discount validate together');
ok(!validateStockDiscounts({version: 1, scope: 'all', percent: 20}).ok,
  'legacy catalogue-wide discount objects are rejected rather than treated as global');
ok(!validateStockDiscounts({version: 1, items: {'car:STOCK-42': {kind: 'car', ref: 'STOCK-42', percent: 0}}}).ok,
  'a zero-percent stock discount is rejected');
ok(!validateStockDiscounts({version: 1, items: {'car:STOCK-42': {kind: 'car', ref: 'STOCK-42', percent: 61}}}).ok,
  'discounts above 60 percent are rejected');
ok(!validateStockDiscounts({version: 1, items: {'machine:AR7-MC-003': {kind: 'car', ref: 'AR7-MC-003', percent: 20}}}).ok,
  'the key, kind and reference must agree');
ok(!validateStockDiscounts({version: 1, items: {'car:STOCK-42': {kind: 'car', ref: 'STOCK-42', percent: 10, until: '2026-02-30'}}}).ok,
  'impossible end dates are rejected');
ok(parseStockDiscounts('not JSON') === EMPTY_STOCK_DISCOUNTS,
  'corrupt CRM/API settings disable discounts safely');
ok(pricing.parseStockDiscounts(JSON.stringify(base)).items['car:STOCK-42']?.percent === 15,
  'the slim public reader accepts the same validated shape without loading the CRM validator');
ok(pricing.parseStockDiscounts({scope: 'all', percent: 20}) === pricing.EMPTY_STOCK_DISCOUNTS,
  'the public reader fails closed on a retired global-offer object');
{
  const items = Object.fromEntries(Array.from({length: STOCK_DISCOUNT_MAX_ITEMS + 1}, (_, i) => {
    const ref = `CAR-${i}`;
    return [`car:${ref}`, {kind: 'car', ref, percent: 1}];
  }));
  ok(!validateStockDiscounts({version: 1, items}).ok, 'the settings payload is bounded to 200 stock references');
}

console.log('\n-- live dates and prices --');
ok(stockDiscountIsLive(base.items['car:STOCK-42'], at('2026-11-30')), 'the listed end date is inclusive through that day');
ok(!stockDiscountIsLive(base.items['car:STOCK-42'], at('2026-12-01')), 'a discount expires the day after its end date');
ok(stockDiscountFor(base, 'car', 'stock-42', at('2026-11-01'))?.percent === 15, 'a case-insensitive stock lookup returns only that car discount');
ok(stockDiscountFor(base, 'car', 'STOCK-99', at('2026-11-01')) === null, 'a discount never spills onto another vehicle');
ok(stockDiscountFor(base, 'machine', 'AR7-MC-003', at('2026-11-01'))?.percent === 20, 'a machine lookup does not collide with a car reference');
{
  const p = priceWithOffer(50000, 20);
  ok(p.hasOffer && p.now === 40000 && p.was === 50000 && p.saving === 10000,
    '20 percent is applied to one list price and keeps both prices');
  ok(priceWithOffer(40412, 0).now === 40412 && !priceWithOffer(40412, 0).hasOffer,
    'an undiscounted item keeps its list price without a crossed-out value');
  ok(priceWithOffer(0, 20).now === 0 && !priceWithOffer(0, 20).hasOffer,
    'a stock row without a usable price cannot show a saving');
}

console.log('\n-- eligible stock catalogue --');
{
  const seed = {
    listings: [{stock_no: 'STATIC-A', make: 'Toyota', model: 'Prius', price_usd: 12000},
      {stock_no: 'HIDDEN-A', make: 'Honda', model: 'Fit', price_usd: 9000, published: false},
      {stock_no: 'UNAVAILABLE-A', make: 'Mazda', model: '3', price_usd: 8000, available: false},
      {stock_no: 'OVERRIDDEN-A', make: 'Nissan', model: 'March', price_usd: 8000}],
    vehicles: [],
    goonet: [{goonet_id: 'GOONET-STATIC', make: 'Nissan', model: 'Note', price: '$10,000'}]
  };
  const rows = {
    listings: [{stock_no: 'STATIC-A', make: 'Toyota', model: 'Prius', price_usd: 12500},
      {stock_no: 'OVERRIDDEN-A', make: 'Nissan', model: 'March', price_usd: 8000, published: false}],
    vehicles: [],
    goonet: [{goonet_id: 'GOONET-LIVE', make: 'Subaru', model: 'Forester', price_usd: 17000},
      {goonet_id: 'GOONET-NOPRICE', make: 'Toyota', model: 'Aqua'},
      {goonet_id: 'GOONET-SOLD', make: 'Nissan', model: 'Leaf', price_usd: 13000, status: 'Sold'}],
    machinery: [{ref: 'LIVE-M-1', name: 'Live excavator', type: 'Excavators', price_usd: 42000, published: true},
      {ref: 'HIDDEN-M-1', name: 'Draft machine', type: 'Loaders', price_usd: 23000, published: false},
      {ref: 'NO-PRICE-M-1', name: 'Unpriced machine', type: 'Cranes', price_usd: 0},
      {ref: MACHINES[0].ref, name: 'Unpublished static machine', type: MACHINES[0].type, price_usd: 25000, published: false}]
  };
  const built = catalogue.buildDiscountStockRows(rows, seed);
  const byKey = new Map(built.map(item => [item.key, item]));
  ok(byKey.get('car:STATIC-A')?.price === 12500, 'live vehicle rows override the same seeded reference');
  ok(!byKey.has('car:OVERRIDDEN-A') && !byKey.has(`machine:${MACHINES[0].ref}`),
    'live unpublished state suppresses a stale static fallback with the same reference');
  ok(byKey.has('car:GOONET-STATIC') && byKey.has('car:GOONET-LIVE'), 'seeded and live Goonet cars both enter the picker');
  ok(byKey.has('machine:LIVE-M-1'), 'published dynamic machinery with a price enters the picker');
  ok(!byKey.has('car:HIDDEN-A') && !byKey.has('car:UNAVAILABLE-A') && !byKey.has('car:GOONET-SOLD'),
    'unpublished, unavailable and sold vehicles are excluded');
  ok(!byKey.has('car:GOONET-NOPRICE') && !byKey.has('machine:HIDDEN-M-1') && !byKey.has('machine:NO-PRICE-M-1'),
    'unpriced cars and unpublished or unpriced machinery are excluded');
  ok(catalogue.readStockPrice({price: '$18,500'}) === 18500, 'currency-formatted public prices normalize for the preview');
}

console.log('\n-- PromoBar hand-off --');
{
  const promo = {active: true, id: 'winter', headline: 'Winter sourcing week', cta: 'Explore', href: '/inventory'};
  const both = barRows({promo, campaignDismissed: false, stockDiscounts: base, offerDismissed: false, now: at('2026-11-01')});
  ok(both.campaign?.id === 'winter' && both.offer?.count === 2,
    'campaign messaging and selected-stock savings can appear together');
  ok(/selected stock/.test(both.offer?.line || ''), 'the public bar says savings are on selected stock, not the whole catalogue');
  ok(barRows({promo, campaignDismissed: true, stockDiscounts: base, offerDismissed: false, now: at('2026-11-01')}).campaign === null,
    'campaign dismissal is independent from stock discounts');
  ok(barRows({promo, campaignDismissed: false, stockDiscounts: base, offerDismissed: true, now: at('2026-11-01')}).offer === null,
    'stock-savings dismissal is independent from the campaign');
  ok(campaignIsLive(promo, at('2026-11-02')) === true && campaignIsLive({...promo, until: '2026-11-01'}, at('2026-11-02')) === false,
    'campaign expiry is evaluated separately from per-stock discount dates');
  const described = describeStockDiscounts(base, at('2026-11-01'));
  ok(described && described.count === 2 && described.href === '/inventory', 'the public hand-off points to the relevant stock list');
}

console.log('\n-- CLI parser and merge behavior --');
{
  const parsed = cli.parseArgs(['--set', 'car:STOCK-55=12', '--set=machine:AR7-MC-004=25', '--until', '2026-12-31', '--label', 'Year end']);
  ok(parsed.sets.length === 2 && parsed.until === '2026-12-31' && parsed.label === 'Year end',
    'CLI accepts multiple explicit stock discounts in one edit');
}
{
  const options = cli.parseArgs(['--set', 'car:STOCK-55=12', '--set', 'machine:AR7-MC-004=25', '--until', '2026-12-31', '--label', 'Year end']);
  const next = cli.applyChanges(base, options, {now: at('2026-10-04'), publishedBy: 'Test operator'});
  ok(Object.keys(next.items).length === 4, 'CLI merges new entries without removing existing stock discounts');
  ok(next.items['car:STOCK-55'].percent === 12 && next.items['machine:AR7-MC-004'].percent === 25,
    'CLI writes each percentage to exactly its keyed stock item');
  ok(next.items['car:STOCK-55'].until === '2026-12-31' && next.items['car:STOCK-55'].publishedBy === 'Test operator',
    'CLI keeps the requested end date and audit attribution');
  const changed = cli.applyChanges(next, cli.parseArgs(['--set', 'car:STOCK-55=18']), {now: at('2026-10-05')});
  ok(changed.items['car:STOCK-55'].until === '2026-12-31', 'updating a price preserves its existing end date unless told otherwise');
  const noDate = cli.applyChanges(changed, cli.parseArgs(['--set', 'car:STOCK-55=18', '--no-end-date']), {now: at('2026-10-05')});
  ok(noDate.items['car:STOCK-55'].until === null, '--no-end-date deliberately clears an expiry');
  const removed = cli.applyChanges(noDate, cli.parseArgs(['--remove', 'machine:AR7-MC-004']), {now: at('2026-10-06')});
  ok(!removed.items['machine:AR7-MC-004'] && !!removed.items['car:STOCK-55'], 'remove deletes only the requested stock key');
  ok(Object.keys(cli.applyChanges(removed, cli.parseArgs(['--clear'])) .items).length === 0,
    '--clear removes all per-stock discounts and nothing else');
  for (const args of [
    ['--set', 'all=20'], ['--set', 'car:STOCK-55=0'], ['--set', 'car:STOCK-55=61'],
    ['--remove', 'all'], ['--set', 'car:STOCK-55=10', '--clear'], ['--status', '--set', 'car:STOCK-55=10']
  ]) {
    let threw = false;
    try { cli.parseArgs(args); } catch { threw = true; }
    ok(threw, `unsafe or conflicting CLI input is rejected: ${args.join(' ')}`);
  }
}

console.log('\n-- mocked HTTP and zero-egress dry run --');
{
  const calls = [];
  const mockFetch = async (url, init = {}) => {
    calls.push({url, init});
    if (init.method === 'POST') return {ok: true, status: 201};
    return {ok: true, status: 200, json: async () => [{value: JSON.stringify(base)}]};
  };
  const env = {SUPABASE_URL: 'https://db.example.test', SUPABASE_SERVICE_ROLE_KEY: 'mock-secret'};
  const live = await cli.readLiveSetting({env, fetchImpl: mockFetch});
  ok(parseStockDiscounts(live).items['car:STOCK-42'].percent === 15,
    'PostgREST read is decoded from the existing site_settings entity');
  const wrote = await cli.writeLiveSetting(base, {env, fetchImpl: mockFetch});
  ok(wrote && calls[1].init.method === 'POST' && /stock_discounts/.test(calls[1].init.body),
    'PostgREST write upserts only the stock_discounts setting');
  ok(calls.every(call => call.url.startsWith('https://db.example.test/')),
    'network tests use the injected mock endpoint only');

  let egress = 0;
  const log = [];
  const code = await cli.main(['--set', 'car:DRY-ONLY=10', '--dry-run'], {
    cwd: '/tmp/ar7-offer-test', env, now: at('2026-10-04'), fetchImpl: async () => { egress++; throw new Error('unexpected network'); },
    exists: () => false, writeFile: () => { throw new Error('unexpected write'); },
    log: line => log.push(line), error: line => log.push(line)
  });
  ok(code === 0 && egress === 0 && log.some(line => /Dry run/.test(line)),
    'a dry run never egresses or writes, even when service credentials are present');
}

console.log('\n-- integration wiring --');
{
  const crm = read('src/crm.jsx');
  ok(/\['offers', 'Price offers'/.test(crm) && /stock-discount-view/.test(crm),
    'the CRM retains the Price offers tab and the per-stock editor');
  const stockCatalogue = read('src/stock-discount-catalogue.js');
  ok(/buildDiscountStockRows\(rows, siteSeed\)/.test(crm) && /rows\?\.goonet/.test(stockCatalogue) && /rows\?\.machinery/.test(stockCatalogue),
    'the CRM catalogue includes dynamic Goonet cars and machinery rows');
  ok(/available === false/.test(stockCatalogue) && /published === false/.test(stockCatalogue),
    'unavailable and unpublished vehicles are skipped from the discount catalogue');
  ok(/parseStockDiscounts/.test(crm) && /stock_discounts/.test(crm),
    'the CRM validates and persists the per-stock setting');

  const api = read('api/settings.js');
  ok(/'stock_discounts'/.test(api) && /validateStockDiscounts/.test(api),
    'the existing settings endpoint validates the discount shape without a new function');
  const promo = read('src/promo-bar.jsx');
  ok(/barRows\(\{promo, campaignDismissed: hidden, stockDiscounts\}\)/.test(promo) &&
     /offerLine = offerHidden \? null : currentStockRow/.test(promo),
    'PromoBar reads selected-stock savings alongside campaign content');
  ok(/Campaign launchpad/.test(read('src/seo-desk.jsx')) && /site\.write/.test(crm),
    'promotion launch controls remain in the staff-only SEO desk');
  ok(/vehicleOfferPercent/.test(read('src/seo.js')) && /machineOfferPercent/.test(read('src/seo.js')),
    'vehicle and machine structured data receive their item-specific offer prices');

  const script = read('scripts/offer.mjs');
  ok(/stock_discounts/.test(script) && !/key:'offer'/.test(script),
    'npm run offer no longer writes the retired global offer setting');
  const pkg = JSON.parse(read('package.json'));
  ok(!!pkg.scripts.offer && pkg.scripts.test.includes('test:offers'), 'the CLI and regression suite remain in npm scripts');
}

console.log(failed ? `\n${failed} FAILING\n` : '\nALL PASS\n');
process.exit(failed ? 1 : 0);
