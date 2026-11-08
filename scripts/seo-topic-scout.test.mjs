// Topic Scout + upgrade report logic (npm run test:topic-scout).
//
// Guards the two contracts the SEO desk's new automation relies on:
//   1. buildTopicIdeas only proposes topics backed by catalogue-derived facts,
//      never duplicates a published guide, and only suggests brand guides for
//      makes with real stock depth.
//   2. buildUpgradeReport turns crawl rows into a report that splits desk-
//      fixable issues from code-change issues, so the operator knows exactly
//      what to hand to a developer agent.
import { buildTopicIdeas, buildUpgradeReport, suggestCoverFixes } from '../src/seo-topic-scout.js';

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
    { id: 'n', title: 'Used Nissan Stock from Japan', image: '/assets/showroom/hero-02.webp' },
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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
