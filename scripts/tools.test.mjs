// Tests for the machinery source adapters, the promotions agent and the site
// guardian. Run: npm run test:tools
//
// These pin the things that would go wrong quietly:
//   • a parser that reads a marketplace page and invents a price
//   • a listing that publishes a photo with no recorded rights basis
//   • a rusty, damaged, single-photo or worked-to-death unit reaching the site
//   • a promotion that an operator can publish without an end date being
//     respected, or with a discount the quotation cannot honour
//   • a guardian that reports a broken link that is actually a live route
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');

let failed = 0;
const ok = (cond, msg) => {
  if (!cond) { failed++; process.stderr.write('FAIL: ' + msg + '\n'); }
  else console.log('ok  :', msg);
};

const {
  extractProduct, classify, toMachine, priceToUSD, rightsAreUsable, chooseAdapter, RIGHTS, ADAPTERS,
  PHOTO_STANDARD, reviewPhotos
} = await import('../src/machinery-source.js');
const { MACHINERY_MARKUP, MACHINES } = await import('../src/machinery-data.js');

// ---- the parser reads a real product page shape ----------------------------
console.log('\n-- product parsing --');
const PAGE = `<!doctype html><html><head>
<title>Used SANY SY215C 21.5 ton crawler excavator for sale | Alibaba.com</title>
<meta property="og:title" content="Used SANY SY215C 21.5 ton crawler excavator">
<meta property="og:image" content="https://cdn.example.com/sany-1.jpg">
<meta property="product:price:amount" content="28500">
<meta property="product:price:currency" content="USD">
<script type="application/ld+json">
{"@type":"Product","name":"SANY SY215C Crawler Excavator","offers":{"@type":"Offer","price":"28500","priceCurrency":"USD"},
 "image":["https://cdn.example.com/sany-1.jpg","https://cdn.example.com/sany-2.jpg"],
 "additionalProperty":[{"name":"Operating weight","value":"21,500 kg"},{"name":"Engine","value":"Isuzu 4HK1X"}]}
</script></head><body>
<table>
<tr><th>Bucket capacity</th><td>0.9 m³</td></tr>
<tr><th>Min. Order</th><td>1 Set</td></tr>
<tr><th>Year</th><td>2021</td></tr>
</table>
</body></html>`;

const parsed = extractProduct(PAGE, 'https://www.alibaba.com/product-detail/x_1600000000.html');
ok(parsed.title.includes('SANY'), 'the title is read from the page');
ok(parsed.priceUSD === 28500, `the USD price is read (${parsed.priceUSD})`);
ok(parsed.images.length === 2, `both product images are found (${parsed.images.length})`);
ok(parsed.specs.some(([k, v]) => /operating weight/i.test(k) && /21,500/.test(v)), 'JSON-LD specs are read');
ok(parsed.specs.some(([k, v]) => /bucket/i.test(k)), 'a spec table row is read');
ok(!parsed.specs.some(([k]) => /min\.? order/i.test(k)), 'commercial rows (min. order) are not published as specifications');

const noJson = extractProduct('<html><head><title>Zoomlion ZTC250V truck crane</title></head><body><p>Price: US $45,000</p></body></html>');
ok(noJson.priceUSD === 45000, 'a price in visible text is read as a last resort');
ok(noJson.images.length === 0 && noJson.fields.images === 0, 'a page with no images reports none rather than inventing one');

ok(priceToUSD('12,000', 'CNY') === 1680, `CNY converts at the declared rate (${priceToUSD('12,000', 'CNY')})`);
ok(priceToUSD('5,000', 'XYZ') === null, 'an unconvertible currency yields no USD figure');
ok(priceToUSD('', 'USD') === null, 'an empty price yields null, not zero');

const { brand, type, name } = classify('Hot Sale Used XCMG XE215C Excavator for sale | Alibaba.com');
ok(brand === 'XCMG', 'the brand is detected');
ok(type === 'Excavators', 'the machine type is detected');
ok(!/hot sale|alibaba/i.test(name), `marketplace noise is stripped from the name ("${name}")`);

// ---- rights, and what a listing may publish -------------------------------
console.log('\n-- photo rights --');
ok(RIGHTS.includes('dropship-authorized'), 'dropshipping authorisation is a recognised basis');
ok(rightsAreUsable('supplier-permission') && !rightsAreUsable('because-im-in-a-hurry'), 'an unrecognised basis is not usable');

const withRights = toMachine({ ...parsed, images: parsed.images }, { rights: 'dropship-authorized', markup: MACHINERY_MARKUP });
ok(withRights.images.length === 2 && withRights.photosPending === false, 'a recorded basis keeps the photos');
ok(withRights.source.rights === 'dropship-authorized', 'the basis is recorded on the listing');
ok(withRights.source.url === parsed.url, 'the source URL is recorded so the price can be re-checked');

const withoutRights = toMachine({ ...parsed, images: parsed.images }, { markup: MACHINERY_MARKUP });
ok(withoutRights.images.length === 0 && withoutRights.photosPending === true, 'with no basis the listing imports with no photos');
ok(withoutRights.supplierPrice === 28500 && withoutRights.listPrice === Math.round((28500 * 1.25) / 50) * 50, 'the price still imports and still carries the markup');
ok(withoutRights.source.rights === null, 'no basis is recorded when none was given');

ok(ADAPTERS['alibaba-open'].requires.includes('ALIBABA_APP_KEY'), 'the Alibaba adapter declares the credentials it needs');
ok(ADAPTERS['facts-only'].canImages === false, 'the facts-only adapter cannot publish images');
ok(ADAPTERS['supplier-package'].mode === 'folder', 'the supplier folder is the Goo-net equivalent');
ok(chooseAdapter('https://example.com/x', { on: 'facts-only' }) === 'facts-only', 'an adapter can be forced');
ok(['product-page', 'facts-only'].includes(chooseAdapter('https://www.alibaba.com/x')), 'Alibaba without credentials falls back to a fetch adapter, not a broken API call');
ok(chooseAdapter('') === 'supplier-package', 'no URL at all means the supplier folder');

// ---- the photo standard ----------------------------------------------------
console.log('\n-- photo standard --');
ok(PHOTO_STANDARD.minPhotos >= 2 && PHOTO_STANDARD.maxAgeYears <= 10,
  'the standard asks for a full gallery and a recent unit');

const rusty = reviewPhotos({ name: 'Used CAT 320D excavator, some rust and a dented cab', year: 2019, images: ['a.jpg', 'b.jpg'] });
ok(!rusty.pass && rusty.flags.some(f => /rust|dent/.test(f)),
  'rusty and damaged copy is flagged before any photo is published');

const thin = reviewPhotos({ name: 'SANY SY215C crawler excavator', year: 2023, images: ['a.jpg'] });
ok(!thin.pass && thin.flags.some(f => f.includes('1 photo')),
  'a single-photo gallery is flagged — one photo cannot show a machine');

const oldUnit = reviewPhotos({ name: 'KOMATSU PC200-7 excavator', year: 2012, images: ['a.jpg', 'b.jpg', 'c.jpg'] });
ok(!oldUnit.pass && oldUnit.flags.some(f => f.includes('years old')),
  'an old unit is flagged until recent photos prove its current condition');

const clean = reviewPhotos({ name: 'SANY SY215C crawler excavator', year: 2024, images: ['a.jpg', 'b.jpg', 'c.jpg'] });
ok(clean.pass && clean.flags.length === 0, 'a recent machine with a full gallery passes');

const syncSrc = readFileSync(path.join(root, 'scripts/machinery-sync.mjs'), 'utf8');
ok(/reviewPhotos/.test(syncSrc) && /flag\('allow-photo-flags'\)/.test(syncSrc),
  'the importer screens every candidate gallery and needs an explicit override');
ok(/photoFlags/.test(syncSrc), 'the flags travel with the imported listing for whoever reviews it');
ok(/Photo standards/.test(readFileSync(path.join(root, 'MACHINERY-SOURCES.md'), 'utf8')),
  'the photo standard is written down for whoever runs the scraper');

// ---- the promotions agent --------------------------------------------------
console.log('\n-- promotions --');
const plan = JSON.parse(readFileSync(path.join(root, 'public/promo-plan.json'), 'utf8'));
ok(plan.campaigns.length >= 12, `the plan carries ${plan.campaigns.length} campaigns`);
ok(plan.campaigns.every(c => c.id && c.headline && c.target?.startsWith('/')), 'every campaign has an id, a headline and an internal target');
ok(new Set(plan.campaigns.map(c => c.id)).size === plan.campaigns.length, 'campaign ids are unique');
ok(plan.campaigns.some(c => c.kind === 'machinery-type'), 'machinery campaigns are generated from real stock');

const agent = readFileSync(path.join(root, 'scripts/promo-agent.mjs'), 'utf8');
ok(/nobody remembered to take it down|must be honoured|honoured in every quotation/i.test(agent), 'the agent states that a published discount has to be honoured');
// It must not manufacture urgency: no timer driving the copy, and no
// "only N left" / "ends in N hours" strings generated anywhere.
ok(!/setInterval|Date\.now\(\)\s*\+/.test(agent), 'the agent runs no countdown timer');
ok(!/ends in|only \$?\{?\d+ ?left|hurry/i.test(agent), 'the agent generates no scarcity copy');
// An impossible discount must be refused rather than published.
let refused = false;
try {
  execFileSync('node', ['scripts/promo-agent.mjs', 'publish', '--id', 'machinery-excavators', '--discount', '95'], { cwd: root, stdio: 'pipe' });
} catch { refused = true; }
ok(refused, 'a 95% discount is refused');

// ---- the guardian ----------------------------------------------------------
console.log('\n-- site guardian --');
const report = JSON.parse(readFileSync(path.join(root, 'public/guardian-report.json'), 'utf8'));
ok(Array.isArray(report.checks) && report.checks.length >= 12, `the report carries ${report.checks.length} checks`);
ok(report.summary.total === report.checks.length, 'the summary matches the checks');
ok(['security', 'health', 'seo'].every(a => report.checks.some(c => c.area === a)), 'all three areas are covered');
ok(report.checks.every(c => ['pass', 'warn', 'fail'].includes(c.status)), 'every check has a status');
ok(report.checks.every(c => c.detail), 'every check explains itself');
ok(report.checks.filter(c => c.status !== 'pass').every(c => c.fix), 'every warning and failure names the fix');
ok(report.checks.some(c => c.name === 'Security headers declared'), 'security headers are checked');

const guardian = readFileSync(path.join(root, 'scripts/guardian.mjs'), 'utf8');
ok(/from '\.\.\/src\/routing\.js'/.test(guardian) || /routing\.js/.test(guardian), 'the link check reads the route list from src/routing.js, not a copy');
ok(/guardian:public-endpoint/.test(guardian), 'a deliberate public endpoint can declare itself');
ok(existsSync(path.join(root, '.github/workflows/guardian.yml')), 'the guardian runs nightly in CI');

// The CRM must expose both agents.
const crm = readFileSync(path.join(root, 'src/crm.jsx'), 'utf8');
ok(/\[\s*'guardian',\s*'Site guardian'/.test(crm), 'the CRM has a Site guardian tab');
ok(/function GuardianView/.test(crm), 'the CRM renders the guardian panel');
ok(/Promotions<\/h3>/.test(crm), 'the CRM panel controls promotions');
const needs = ['ShieldCheck', 'Play', 'Send', 'ClipboardCopy', 'Ban', 'Copy'];
ok(needs.every(icon => new RegExp(`\\b${icon}\\b`).test(crm)), 'every icon the guardian panel uses is imported');
ok(/settings\.write/.test(crm), 'publishing a promotion is permission-gated');

// The site must read the live setting, with the file as a fallback.
const bar = readFileSync(path.join(root, 'src/promo-bar.jsx'), 'utf8');
ok(/useSettings/.test(bar) && /promo\.json/.test(bar), 'the promo bar reads the live setting and falls back to the published file');
ok(/promo\.until|until/.test(bar), 'the bar honours the campaign end date');

// api/settings.js must validate the promotion shape.
const apiSettings = readFileSync(path.join(root, 'api/settings.js'), 'utf8');
ok(/'promo'/.test(apiSettings) && /validPromo/.test(apiSettings), 'api/settings.js validates the promotion shape');
ok(/PUBLIC_KEYS[\s\S]*'promo'/.test(apiSettings), 'the promotion is readable by the public site');
ok(/promo\.href must be an internal path/.test(apiSettings), 'a promotion cannot point off-site');

// ---- keyword research -------------------------------------------------------
// The plan is what stops the audit from only checking words we already used.
console.log('\n-- keyword research --');
const kw = await import('./seo-keywords.mjs');

ok(kw.parseAutocomplete('["import car",["import car to kenya","import cars japan"]]').length === 2,
  'Google-style autocomplete arrays parse');
ok(kw.parseAutocomplete('[{"phrase":"import car to pakistan"}]')[0] === 'import car to pakistan',
  'DuckDuckGo-style autocomplete objects parse');
ok(kw.parseAutocomplete('not json at all').length === 0, 'a blocked or broken endpoint yields no keywords, never a crash');

ok(kw.intentOf('excavator price for sale') === 'transactional', 'buying words mark a query transactional');
ok(kw.intentOf('what is an auction sheet') === 'informational', 'question words mark a query informational');

// The matrix must never invent a query the site cannot honestly answer.
ok(!kw.MODIFIERS.car.some(m => /china/.test(m)), 'Japanese car seeds never get a "from china" modifier');
ok(!kw.MODIFIERS.machine.some(m => /japan/.test(m)), 'China machinery seeds never get a "from japan" modifier');

ok(kw.routeFor('toyota land cruiser for sale') === '/cars/toyota', 'a make query routes to that make\'s landing page');
ok(kw.routeFor('used excavator price') === '/machinery/excavators', 'an excavator query routes to the excavator page');
ok(kw.routeFor('import car to kenya') === '/destinations', 'a lane query routes to the destination guides');
ok(kw.routeFor('how much is import duty') === '/tools', 'a duty question routes to the calculators');
ok(kw.routeFor('what is an auction sheet') === '/faq', 'a plain question routes to the FAQ');
ok(kw.routeFor('anything else entirely') === '/inventory', 'everything vehicle-shaped falls back to inventory');

const kwPlan = kw.buildPlan(['used excavator price', 'toyota land cruiser for sale', 'import car to kenya']);
ok(Object.keys(kwPlan.routes).length === 3, 'the plan groups keywords by the page that should rank');
ok(kwPlan.routes['/machinery/excavators'][0].intent === 'transactional', 'each planned keyword carries its intent');
ok(Object.values(kwPlan.routes).flat().every(r => typeof r.covered === 'boolean' || r.covered === null),
  'every planned keyword records whether the copy already says the words');

ok(typeof kw.renderReport(kwPlan).includes === 'function' && /Keyword plan/.test(kw.renderReport(kwPlan)),
  'the report renders for a human');
ok(!/volume/i.test(kw.renderReport(kwPlan).split('\n').filter(l => l.startsWith('>')).join(' ')) === false,
  'the report says plainly that volumes need a connector');
ok(existsSync(path.join(root, 'KEYWORDS.md')), 'the reviewed keyword plan is committed');

// The auditor has to consume the plan, and only the targets it can prove.
const seoAgentSrc = readFileSync(path.join(root, 'scripts/seo-agent.mjs'), 'utf8');
ok(/keywords-plan\.json/.test(seoAgentSrc), 'the auditor reads the researched plan');
ok(/row\.covered !== true\) continue/.test(seoAgentSrc), 'only covered head terms become audit targets — gaps stay in the plan');
ok(/"seo:keywords"/.test(readFileSync(path.join(root, 'package.json'), 'utf8')), 'npm run seo:keywords exists');

console.log(failed ? `\n${failed} FAILING\n` : '\nALL PASS\n');
process.exit(failed ? 1 : 0);
