// Topic Scout + upgrade report logic (npm run test:topic-scout).
//
// Guards the two contracts the SEO desk's new automation relies on:
//   1. buildTopicIdeas only proposes topics backed by catalogue-derived facts,
//      never duplicates a published guide, and only suggests brand guides for
//      makes with real stock depth.
//   2. buildUpgradeReport turns crawl rows into a report that splits desk-
//      fixable issues from code-change issues, so the operator knows exactly
//      what to hand to a developer agent.
import { buildTopicIdeas, buildUpgradeReport, suggestCoverFixes, cleanArticleTitle } from '../src/seo-topic-scout.js';

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.error('  ✗ ' + label); }
};

console.log('\n-- buildTopicIdeas --');
const cars = [
  ...Array.from({ length: 6 }, (_, i) => ({ make: 'Toyota', model: 'Harrier', year: 2020 + (i % 3), price: '$' + (20000 + i * 1000).toLocaleString('en-US'), published: true })),
  ...Array.from({ length: 5 }, (_, i) => ({ make: 'Honda', model: 'Vezel', year: 2019 + i, price: '$15,000', published: true })),
  { make: 'Lexus', model: 'LC 500', year: 2021, price: '$95,000', published: true }, // only 1 — no guide
  { make: 'Toyota', model: 'Supra', year: 2020, price: '$55,000', published: false } // unpublished — excluded
];
const dests = [['Pakistan', 'Karachi / Port Qasim', '18–24 days'], ['Kenya', 'Mombasa', '21–28 days']];
const machines = [
  { type: 'Excavators', brand: 'Doosan', photosPending: false },
  { type: 'Loaders', brand: 'SDLG', photosPending: false },
  { type: 'Cranes', brand: 'XCMG', photosPending: false },
  { type: 'Trucks', brand: 'Howo', photosPending: true } // hidden — not counted
];

const ideas = buildTopicIdeas({ cars, machines, dests, published: [] });
ok(ideas.some(i => i.id === 'make-toyota'), 'proposes a Toyota guide (6 cars in stock)');
ok(ideas.some(i => i.id === 'make-honda'), 'proposes a Honda guide (5 cars in stock)');
ok(!ideas.some(i => i.id === 'make-lexus'), 'no guide for a make with a single car');
ok(ideas.some(i => i.id === 'dest-pakistan') && ideas.some(i => i.id === 'dest-kenya'), 'one checklist per destination market');
ok(ideas.some(i => i.id === 'machinery-overview'), 'machinery guide when 3+ machines are visible');

const toyota = ideas.find(i => i.id === 'make-toyota');
ok(toyota.facts.some(f => f.includes('6 Toyota vehicles')), 'facts carry the live stock count');
ok(toyota.facts.some(f => f.includes('Harrier')), 'facts name the models actually in stock');
ok(!toyota.facts.some(f => f.includes('Supra')), 'unpublished stock never reaches the facts');
ok(toyota.facts.some(f => f.includes('$20,000') && f.includes('$25,000')), 'price range comes from the real listings');
ok(ideas.every(i => Array.isArray(i.facts) && i.facts.length >= 3), 'every topic ships with at least 3 verified facts');
ok(ideas.every(i => /^\/assets\//.test(i.img)), 'every topic image is a site asset path (validateGuide requirement)');

const pakistanIdea = ideas.find(i => i.id === 'dest-pakistan');
ok(pakistanIdea.facts.some(f => f.includes('18–24 days')), 'destination facts carry the real transit time');

const machineryIdea = ideas.find(i => i.id === 'machinery-overview');
ok(machineryIdea.facts.some(f => f.includes('3 machines')), 'machinery count excludes photosPending records');

// Cover uniqueness (2026-11-08 owner report: three articles shared one photo).
ok(new Set(ideas.map(i => i.img)).size === ideas.length, 'every proposed topic gets a distinct cover image');
ok(/toyota/.test(toyota.img), 'the Toyota guide gets a Toyota cover, not a generic one');
const honda = ideas.find(i => i.id === 'make-honda');
ok(/honda/.test(honda.img), 'the Honda guide gets a Honda cover');

// Duplicate suppression: publishing a guide with the same title removes the idea.
const afterPublish = buildTopicIdeas({ cars, machines, dests, published: [{ title: toyota.title }] });
ok(!afterPublish.some(i => i.id === 'make-toyota'), 'a published guide suppresses its own topic');
ok(afterPublish.some(i => i.id === 'make-honda'), 'other topics survive the suppression');

// Subject-level suppression (2026-11-08: the desk re-proposed a Suzuki guide
// while "Used Suzuki Vehicles in Stock at AR7 Traders" was already live —
// different slug, same subject). ANY published title naming the make/market
// now suppresses the idea, not just an exact slug match.
const subjectPublished = [
  { title: 'Used Honda Vehicles in Stock at AR7 Traders' },
  { title: 'Your Complete Kenya Import Playbook' }
];
const afterSubjects = buildTopicIdeas({ cars, machines, dests, published: subjectPublished });
ok(!afterSubjects.some(i => i.id === 'make-honda'), 'a published article naming the make suppresses the make guide (subject-level dedupe)');
ok(!afterSubjects.some(i => i.id === 'dest-kenya'), 'a published article naming the market suppresses the destination guide');
ok(afterSubjects.some(i => i.id === 'make-toyota') && afterSubjects.some(i => i.id === 'dest-pakistan'), 'uncovered subjects still get proposed');

// Image dedupe against the live site: a cover used by ANY published article
// is never proposed again.
const takenImg = toyota.img;
const afterImgTaken = buildTopicIdeas({ cars, machines, dests, published: [{ title: 'Some Other Story', img: takenImg }] });
const toyotaRetry = afterImgTaken.find(i => i.id === 'make-toyota');
ok(toyotaRetry && toyotaRetry.img !== takenImg, 'a cover already used by a published article is never reused');
ok(/^\/assets\//.test(toyotaRetry.img), 'the replacement cover is still a site asset');

console.log('\n-- buildUpgradeReport --');
const rows = [
  { path: '/inventory', url: 'https://ar7traders.com/inventory', fails: 1, warns: 1, checks: [
    { id: 'title', label: 'Title tag', status: 'fail', detail: 'Missing', fix: 'Add a 50–60 character title.' },
    { id: 'canonical', label: 'Canonical', status: 'warn', detail: 'Relative URL', fix: 'Use an absolute canonical.' },
    { id: 'desc', label: 'Meta description', status: 'pass', detail: 'ok' }
  ] },
  { path: '/about', url: 'https://ar7traders.com/about', fails: 1, warns: 0, checks: [
    { id: 'title', label: 'Title tag', status: 'fail', detail: 'Missing', fix: 'Add a 50–60 character title.' }
  ] },
  { path: '/faq', url: 'https://ar7traders.com/faq', fails: 0, warns: 0, checks: [
    { id: 'title', label: 'Title tag', status: 'pass', detail: 'ok' }
  ] },
  { path: '/broken', url: 'https://ar7traders.com/broken', state: 'http_error', error: 'Page request returned HTTP 500.' }
];
const report = buildUpgradeReport(rows, { origin: 'https://ar7traders.com', now: new Date('2026-11-08T00:00:00Z') });
ok(report.includes('# AR7 Traders — SEO upgrade report (2026-11-08)'), 'report is dated');
ok(report.includes('Audited 3 live pages'), 'unreachable rows are not counted as audited');
ok(report.includes('Clean: 1 · warnings only: 0 · failing: 2'), 'summary counts are right');
ok(report.includes('## Unreachable pages'), 'unreachable pages get their own section');
ok(report.includes('HTTP 500'), 'the unreachable reason is quoted');
ok(report.includes('Fixable from this desk'), 'desk-fixable section exists');
ok(report.includes('**Title tag** (FAIL) — 2 page(s): /inventory, /about'), 'one issue groups all its pages');
ok(report.includes('Needs a code change'), 'code-change section exists');
ok(report.includes('**Canonical**'), 'canonical issue lands in the code section');
ok(report.includes('Fix: Add a 50–60 character title.'), 'the audit fix line is carried into the report');

const cleanReport = buildUpgradeReport([rows[2]], { now: new Date('2026-11-08T00:00:00Z') });
ok(cleanReport.includes('every audited page passed'), 'an all-clean crawl says so plainly');

// ---------------------------------------------------------------------------
// 3. suggestCoverFixes — the CRM "cover image doctor" (2026-11-10 owner:
// duplicate covers shipped on four live articles; the desk must be able to
// find and fix that itself). Contracts: the best title↔image match KEEPS a
// shared cover, every proposed replacement is unique across the whole batch
// plus everything already in use, missing covers get one too, and a clean
// list yields zero fixes.
{
  const dup = '/assets/used-japanese-cars-auction-export-toyota-3.jpg';
  const fixes = suggestCoverFixes([
    { id: 'a', title: 'Used Toyota Vehicles in Stock', image: dup },
    { id: 'b', title: 'Honda Vezel Buyer Guide', image: dup },
    { id: 'c', title: 'Shipping Lanes to Mombasa', image: dup },
    { id: 'd', title: 'No Cover Draft' },
    // og/shipping.jpg — NOT og/auction.jpg, which the scene map knows is the
    // same photograph as the Honda Vezel brand asset.
    { id: 'e', title: 'Already Unique', image: '/assets/og/shipping.jpg' }
  ]);
  ok(!fixes.some(f => f.id === 'a'), 'the Toyota article keeps the toyota cover (best title match wins)');
  ok(!fixes.some(f => f.id === 'e'), 'an article with a unique cover is left alone');
  const byId = Object.fromEntries(fixes.map(f => [f.id, f]));
  ok(byId.b && /honda/.test(byId.b.to), 'the Honda article is re-covered from the Honda brand pool');
  ok(byId.c && byId.c.to && byId.c.to !== dup, 'the shipping article gets a non-duplicate replacement');
  ok(byId.d && byId.d.reason === 'missing cover' && byId.d.to.startsWith('/assets/'), 'a cover-less draft is assigned a site asset');
  const proposed = fixes.map(f => f.to);
  ok(new Set(proposed).size === proposed.length, 'no two fixes propose the same image');
  ok(!proposed.includes('/assets/og/shipping.jpg') && !proposed.some(p2 => p2.includes('inspection-shipping-1')),
    'proposals never collide with an image already in use — even as a .jpg/.webp twin of the same photo');
  ok(fixes.every(f => f.to.startsWith('/assets/')), 'every proposal is a site asset (validateGuide og:image contract)');
  // Real on-disk neutral assets (asset-refs.test.mjs walks test fixtures too).
  ok(suggestCoverFixes([{ id: 1, title: 'A', image: '/assets/japan-car-carrier-trucks-1.jpg' }, { id: 2, title: 'B', image: '/assets/japanese-car-auction-inspection-shipping-3.webp' }]).length === 0,
    'a healthy article list produces zero fixes');
  // 2026-11-10 round 5 (owner: Nissan wore a Lamborghini, Honda wore a
  // Nissan): the doctor must catch WRONG-BRAND covers even when unique, and
  // covers with competitor branding baked into the picture.
  const wrong = suggestCoverFixes([
    { id: 'n', title: 'Used Nissan Stock from Japan', image: '/assets/showroom/hero-02-v2.webp' },
    { id: 'h', title: 'Used Honda Stock from Japan', image: '/assets/japan-used-car-export-stock-honda-vezel--1.webp' },
    { id: 'b', title: 'RoRo vs container', image: '/assets/japanese-car-auction-inspection-shipping-5.webp' }
  ]);
  const wb = Object.fromEntries(wrong.map(f => [f.id, f]));
  ok(wb.n && /nissan/.test(wb.n.to) && /lamborghini/.test(wb.n.reason),
    'a unique but wrong-brand cover is still flagged (the filename cannot hide the Lamborghini)');
  ok(wb.h && /vezel--4|og\/auction/.test(wb.h.to) && /nissan/.test(wb.h.reason),
    'a cover whose CONTENT contradicts its own filename is judged by content');
  ok(wb.b && /competitor branding/.test(wb.b.reason),
    'a cover with competitor branding in the picture is always replaced');
  ok(!wrong.some(f => /toyota-h-|export-toyota-5|inspection-shipping-5/.test(f.to)),
    'watermarked assets are never proposed as replacements');
  ok(suggestCoverFixes([]).length === 0 && suggestCoverFixes().length === 0, 'empty and missing input are safe');
}

// ---------------------------------------------------------------------------
// 2026-11-10 regressions (owner screenshot: six destination checklists all
// wearing the SAME port aerial, and the NZ + UK checklists each live TWICE
// under AI-rewritten titles, one still carrying "| AR7 Traders").
// ---------------------------------------------------------------------------
console.log('\n-- round-23: cover exhaustion, alias dedupe, title hygiene --');
{
  // 8 destination markets in one batch, with every seed article already
  // holding a logistics scene — the exact situation of 2026-11-09/10.
  const manyDests = [
    ['Pakistan', 'Karachi / Port Qasim', '18–24 days'], ['Kenya', 'Mombasa', '21–28 days'],
    ['Tanzania', 'Dar es Salaam', '21–28 days'], ['Uganda', 'Mombasa (transit)', '28–35 days'],
    ['Zambia', 'Dar es Salaam (transit)', '28–35 days'], ['Jamaica', 'Kingston', '35–45 days'],
    ['Fiji', 'Suva', '21–30 days'], ['Guyana', 'Georgetown', '40–50 days']
  ];
  const seedPublished = [
    { title: 'RoRo vs Container', img: '/assets/japan-vehicle-export-port-aerial-1.jpg' },
    { title: 'Documents Guide', img: '/assets/japanese-car-auction-inspection-shipping-1.webp' },
    { title: 'FOB vs CIF', img: '/assets/japanese-car-auction-inspection-shipping-2.webp' },
    { title: 'Auction Sheets', img: '/assets/japanese-car-auction-inspection-shipping-3.webp' },
    { title: 'UAE Checklist', img: '/assets/japan-car-carrier-trucks-1.jpg' },
    { title: 'Suzuki Guide', img: '/assets/japan-car-auction-hall-1.jpg' }
  ];
  const batch = buildTopicIdeas({ cars: [], machines: [], dests: manyDests, published: seedPublished });
  const destIdeas = batch.filter(i => i.id.startsWith('dest-'));
  ok(destIdeas.length === 8, 'all 8 destination checklists are proposed');
  const counts = destIdeas.reduce((m, i) => m.set(i.img, (m.get(i.img) || 0) + 1), new Map());
  ok(Math.max(...counts.values()) === 1,
    'with the widened pool, 8 checklists on a taken-up site still get 8 DISTINCT covers (the six-identical-port-aerials bug)');
  ok(destIdeas.some(i => i.img.startsWith('/assets/covers/')),
    'the new AR7-owned cover scenes are actually drawn from');

  // Exhaustion fallback rotates instead of stacking on pool[0][0]: take every
  // scene including the new ones, then ask for 8 covers.
  const everythingTaken = [
    ...seedPublished,
    { title: 'A', img: '/assets/og/shipping.jpg' },
    { title: 'B', img: '/assets/covers/container-terminal-dusk.webp' },
    { title: 'C', img: '/assets/covers/roro-ramp-loading.webp' },
    { title: 'D', img: '/assets/covers/export-documents-desk.webp' },
    { title: 'E', img: '/assets/covers/cargo-ship-at-sea.webp' }
  ];
  const starved = buildTopicIdeas({ cars: [], machines: [], dests: manyDests, published: everythingTaken })
    .filter(i => i.id.startsWith('dest-'));
  const starvedCounts = starved.reduce((m, i) => m.set(i.img, (m.get(i.img) || 0) + 1), new Map());
  ok(starved.length === 8 && Math.max(...starvedCounts.values()) <= 2,
    'even with EVERY scene taken, repeats rotate across the pool instead of all landing on the port aerial');

  // Alias dedupe: the AI retitled the live articles, so the country name never
  // appears verbatim — the abbreviation must still suppress the idea.
  const aliasPublished = [
    { title: 'NZ Car Import Checklist: Your Pre-Order Guide' },
    { title: 'Shipping Your Car from Japan to the UK: The Pre-Order Checklist' },
    { title: 'Your UAE Vehicle Import Playbook' }
  ];
  const aliasDests = [
    ['New Zealand', 'Auckland', '14–21 days'], ['United Kingdom', 'Southampton', '28–35 days'],
    ['UAE', 'Jebel Ali', '12–18 days'], ['Kenya', 'Mombasa', '21–28 days']
  ];
  const afterAlias = buildTopicIdeas({ cars: [], machines: [], dests: aliasDests, published: aliasPublished });
  ok(!afterAlias.some(i => i.id === 'dest-new-zealand'), '"NZ …" suppresses the New Zealand checklist (alias dedupe)');
  ok(!afterAlias.some(i => i.id === 'dest-united-kingdom'), '"… the UK …" suppresses the United Kingdom checklist');
  ok(!afterAlias.some(i => i.id === 'dest-uae'), 'a UAE title suppresses the UAE checklist');
  ok(afterAlias.some(i => i.id === 'dest-kenya'), 'an uncovered market still gets proposed');
  // Short aliases only hit on word boundaries: "fukuoka" must not look like "uk".
  const fukuoka = buildTopicIdeas({ cars: [], machines: [], dests: [['United Kingdom', 'Southampton', '28–35 days']],
    published: [{ title: 'Inside the Fukuoka Auction Hall' }] });
  ok(fukuoka.some(i => i.id === 'dest-united-kingdom'), '"Fukuoka" does not suppress the UK (word-boundary alias match)');

  // Title hygiene: the stored headline never carries the site-name suffix.
  ok(cleanArticleTitle('NZ Car Import Checklist: Essential Guide | AR7 Traders') === 'NZ Car Import Checklist: Essential Guide',
    'the "| AR7 Traders" suffix is stripped before a title is stored');
  ok(cleanArticleTitle('Shipping to the UK I AR7 Traders') === 'Shipping to the UK',
    'the "I AR7 Traders" variant is stripped too');
  ok(cleanArticleTitle('Why AR7 Traders Inspects Twice') === 'Why AR7 Traders Inspects Twice',
    'a headline legitimately NAMING AR7 Traders mid-sentence is left alone');
  ok(cleanArticleTitle('') === '' && cleanArticleTitle(null) === '', 'empty and null titles are safe');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
