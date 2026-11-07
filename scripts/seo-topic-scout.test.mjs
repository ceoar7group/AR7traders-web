// Topic Scout + upgrade report logic (npm run test:topic-scout).
//
// Guards the two contracts the SEO desk's new automation relies on:
//   1. buildTopicIdeas only proposes topics backed by catalogue-derived facts,
//      never duplicates a published guide, and only suggests brand guides for
//      makes with real stock depth.
//   2. buildUpgradeReport turns crawl rows into a report that splits desk-
//      fixable issues from code-change issues, so the operator knows exactly
//      what to hand to a developer agent.
import { buildTopicIdeas, buildUpgradeReport } from '../src/seo-topic-scout.js';

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

// Duplicate suppression: publishing a guide with the same title removes the idea.
const afterPublish = buildTopicIdeas({ cars, machines, dests, published: [{ title: toyota.title }] });
ok(!afterPublish.some(i => i.id === 'make-toyota'), 'a published guide suppresses its own topic');
ok(afterPublish.some(i => i.id === 'make-honda'), 'other topics survive the suppression');

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

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
