#!/usr/bin/env node
// Keyword research — what buyers actually type, and which page should answer it.
//
// The auditor (`npm run seo`) checks that a page *covers* the keywords we chose.
// This script is the step before it: it chooses them.
//
//   1. Offline (always): a matrix built from the site's own catalogue — every
//      make and body type we list, every machine type on the China desk, every
//      destination lane we quote, and the questions the FAQ already answers —
//      crossed with the modifiers buyers type ("import", "for sale", "price",
//      "cost", "to <country>", "how much", "duty", "auction sheet").
//
//   2. Live (--live, and harmless when it fails): free autocomplete endpoints.
//      No API key, no account, no paid keyword tool:
//        Google      https://suggestqueries.google.com/complete/search?client=firefox&q=
//        Bing        https://api.bing.com/osjson.aspx?query=
//        DuckDuckGo  https://duckduckgo.com/ac/?q=
//      They return what people really type, which catches phrasing the matrix
//      would miss. If this machine has no network egress (or an endpoint
//      blocks datacentre IPs) the run says so and the offline plan stands.
//
// What this cannot do: report search *volume* or difficulty. Those numbers come
// from a data source — Google Search Console (queries you already appear for),
// Bing Webmaster Tools, or Google Ads Keyword Planner — and the connector
// status for all three is printed by `npm run seo:connect`. Treat the plan as
// "what to write next", and the connectors as "what worked".
//
// Outputs
//   KEYWORDS.md          human plan, grouped by the page that should rank
//   keywords-plan.json   machine-readable, read by scripts/seo-agent.mjs to set
//                        per-route keyword targets (gitignored: regenerate it)
//
// Usage
//   npm run seo:keywords            # offline plan + files
//   npm run seo:keywords -- --live  # also query the autocomplete endpoints
//   npm run seo:keywords -- --print # print to stdout, write nothing
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');
const read = p => readFileSync(path.join(root, p), 'utf8');

const { PAGE_SEO, MACHINERY_SEO, FAQ_ITEMS, brandSeo } = await import('../src/seo.js');
const { MACHINES } = await import('../src/machinery-data.js');
const { DEST } = await import('../src/destinations.js');

// ---------------------------------------------------------------------------
// 1. The catalogue side of the matrix
// ---------------------------------------------------------------------------
// Cars live inside src/main.jsx (JSX, so it cannot be imported by node). The
// same pattern the asset and copy tests use: read the source and pull the
// make/model pairs out of it. If the file ever stops declaring them this way,
// the matrix simply loses the car half — the machinery, destination and FAQ
// halves keep working and the report says which sources were read.
const mainSrc = read('src/main.jsx');
const carMakes = [...new Set([...mainSrc.matchAll(/make:'([^']+)'/g)].map(m => m[1]))].sort();
const carModels = [...new Set([...mainSrc.matchAll(/model:'([^']+)'/g)].map(m => m[1]))].sort();
const carBodies = [...new Set([...mainSrc.matchAll(/body:'([^']+)'/g)].map(m => m[1]))].sort();
// "mclaren 720s" beats "720s" as a query, so pair each model with the make it
// is declared next to (the cars array declares make before model, one car per
// line).
const carPairs = [];
for (const line of mainSrc.split('\n')) {
  const make = /make:'([^']+)'/.exec(line);
  const model = /model:'([^']+)'/.exec(line);
  if (make && model) carPairs.push(`${make[1]} ${model[1]}`);
}

export const machineTypes = [...new Set(MACHINES.map(m => m.type))];
export const machineBrands = [...new Set(MACHINES.map(m => m.brand))].sort();
export const destinations = DEST.map(row => row[0]);
export const faqQuestions = FAQ_ITEMS.map(row => row[0]);

// ---------------------------------------------------------------------------
// 2. Modifiers, and what each one says about intent
// ---------------------------------------------------------------------------
// `head` is the part that decides which page can answer the query. Everything
// else is the modifier. Keeping them apart is what lets the plan route a
// keyword to a page instead of dumping a word cloud.
export const INTENTS = {
  transactional: ['buy', 'for sale', 'price', 'cost', 'quote', 'import', 'export', 'shipping', 'fob', 'cif'],
  commercial: ['best', 'cheap', 'used', 'second hand', 'dealer', 'exporter', 'supplier'],
  informational: ['how', 'what', 'why', 'guide', 'documents', 'inspection', 'auction sheet', 'duty', 'tax', 'grade'],
  navigational: ['ar7', 'ar7traders']
};

// Modifiers are origin-aware on purpose: pairing "export from china" with a
// Japanese make (or "export from japan" with an excavator) would put queries in
// the plan that no page can honestly answer.
export const MODIFIERS = {
  car: ['for sale', 'price', 'cost', 'import', 'import to {country}', 'shipping to {country}',
    'export from japan', 'auction sheet', 'how much', 'best', 'used', 'duty and taxes', 'fob price'],
  machine: ['for sale', 'price', 'cost', 'import', 'import to {country}', 'shipping to {country}',
    'export from china', 'how much', 'best', 'used', 'duty and taxes', 'fob price', 'supplier'],
  general: ['for sale', 'price', 'cost', 'import to {country}', 'shipping to {country}', 'how much', 'best', 'used']
};

export function parseAutocomplete(text) {
  // Google/Bing return ["query", ["a","b"]]; DuckDuckGo returns [{"phrase":"a"}].
  try {
    const data = JSON.parse(text);
    if (!Array.isArray(data)) return [];
    const rows = Array.isArray(data[1]) ? data[1] : Array.isArray(data) ? data : [];
    return rows.map(r => (typeof r === 'string' ? r : r && r.phrase)).filter(Boolean).map(s => String(s).toLowerCase().trim());
  } catch { return []; }
}

export function intentOf(keyword) {
  const kw = String(keyword).toLowerCase();
  for (const [intent, words] of Object.entries(INTENTS)) {
    if (words.some(w => kw.includes(w))) return intent;
  }
  return 'informational';
}

/** How specific a query is — long, multi-word queries convert and are winnable. */
export function specificity(keyword) {
  const words = String(keyword).trim().split(/\s+/).length;
  return Math.min(5, Math.max(1, words));
}

export function expandSeeds(seeds, modifiers = MODIFIERS.general, countries = destinations) {
  const out = new Set();
  for (const seed of seeds) {
    out.add(seed);
    for (const mod of modifiers) {
      if (mod.includes('{country}')) {
        // Destination lanes get each country baked in, which is how import
        // queries are really typed: "import car to kenya".
        for (const c of countries) out.add(`${seed} ${mod.replace('{country}', c.toLowerCase())}`);
      } else {
        out.add(`${seed} ${mod}`);
      }
    }
  }
  return [...out].map(k => k.replace(/\s+/g, ' ').trim()).filter(Boolean);
}

// ---------------------------------------------------------------------------
// 3. Routing: which page is allowed to answer this query
// ---------------------------------------------------------------------------
// Order matters: the first rule that matches wins, so the most specific
// catalogue (a machine type, a make) is tested before the catch-all inventory
// and guide pages.
const slug = s => String(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

export function routeRules() {
  const rules = [];
  for (const type of machineTypes) {
    const word = type.toLowerCase().replace(/s$/, '');
    rules.push({ route: '/machinery/' + type.toLowerCase(), match: k => new RegExp(`\\b${word}s?\\b`).test(k) });
  }
  for (const make of machineBrands) {
    rules.push({ route: '/machinery', match: k => k.includes(make.toLowerCase()) });
  }
  rules.push({ route: '/machinery', match: k => /\b(excavator|loader|wheel loader|crane|tipper|truck|machinery|machine|heavy equipment|bulldozer|forklift)\b/.test(k) });
  rules.push({ route: '/tools', match: k => /\b(duty|tax|taxes|customs|cif|freight|calculator|shipping cost)\b/.test(k) });
  // 2026-10-08: a query that names ONE market belongs on that market's own
  // page, not on the hub — /destinations/kenya is the URL that can answer
  // "import car to kenya". A query that spans markets ("kenya or tanzania")
  // belongs on the hub, the only page that compares them, so that rule has to
  // come first: routeFor() takes the first match.
  rules.push({ route: '/destinations',
    match: k => destinations.filter(c => k.includes(c.toLowerCase())).length > 1 });
  for (const country of destinations) {
    const needle = country.toLowerCase();
    rules.push({ route: `/destinations/${needle.replace(/[^a-z0-9]+/g, '-')}`, match: k => k.includes(needle), country });
  }
  for (const make of carMakes) {
    rules.push({ route: '/cars/' + slug(make), match: k => k.includes(make.toLowerCase()) });
  }
  rules.push({ route: '/faq', match: k => /^(how|what|why|can|is|do)\b/.test(k) });
  rules.push({ route: '/auction', match: k => /\bauction\b/.test(k) });
  rules.push({ route: '/news', match: k => /\b(guide|documents|inspection|grade|sheet|explained)\b/.test(k) });
  rules.push({ route: '/inventory', match: () => true });
  return rules;
}

export function routeFor(keyword, rules = routeRules()) {
  const kw = String(keyword).toLowerCase().trim();
  return (rules.find(r => r.match(kw)) || { route: '/inventory' }).route;
}

/** Words that say nothing about which page can answer a query. */
const STOPWORDS = new Set(['import', 'export', 'importing', 'for', 'sale', 'to', 'from', 'car', 'cars',
  'the', 'a', 'an', 'and', 'of', 'in', 'on', 'best', 'used', 'price', 'prices', 'cost', 'how', 'much',
  'buy', 'buying', 'shipping', 'quote', 'quotes', 'supplier', 'dealers', 'dealer', 'exporter', 'second', 'hand']);

export const contentWords = keyword => String(keyword).toLowerCase().split(/\s+/)
  .filter(w => w.length > 2 && !STOPWORDS.has(w));

export function copyForRoute(route) {
  const parts = route.split('/').filter(Boolean);
  if (parts[0] === 'cars') {
    const brand = brandSeo(parts[1] || '');
    return brand ? `${brand.title} ${brand.description}`.toLowerCase() : '';
  }
  if (parts[0] === 'machinery' && parts[1] && MACHINERY_SEO[parts[1]]) return MACHINERY_SEO[parts[1]].join(' ').toLowerCase();
  const meta = PAGE_SEO[parts[0] || 'home'];
  return Array.isArray(meta) ? meta.join(' ').toLowerCase() : '';
}

/** Does the page that would answer this already say (one of) the words? */
export function coveredByRoute(keyword) {
  const haystack = copyForRoute(routeFor(keyword));
  if (!haystack) return null;
  const words = contentWords(keyword);
  if (!words.length) return true;
  return words.some(w => haystack.includes(w));
}

// ---------------------------------------------------------------------------
// 4. The plan
// ---------------------------------------------------------------------------
export function buildPlan(keywords, { live = {}, sources = {} } = {}) {
  const rules = routeRules();
  const rows = [...new Set(keywords.map(k => String(k).toLowerCase().trim()).filter(Boolean))]
    .map(keyword => {
      const route = routeFor(keyword, rules);
      return {
        keyword,
        route,
        intent: intentOf(keyword),
        specificity: specificity(keyword),
        covered: coveredByRoute(keyword),
        source: live[keyword] ? 'autocomplete' : 'catalogue'
      };
    })
    .sort((a, b) => b.specificity - a.specificity || a.keyword.localeCompare(b.keyword));

  const byRoute = {};
  for (const row of rows) (byRoute[row.route] = byRoute[row.route] || []).push(row);

  return {
    generatedAt: new Date().toISOString(),
    sources,
    total: rows.length,
    routes: Object.fromEntries(Object.entries(byRoute).map(([route, list]) => [route, list])),
    gaps: rows.filter(r => r.covered === false).map(r => ({ keyword: r.keyword, route: r.route }))
  };
}

// ---------------------------------------------------------------------------
// 5. Live autocomplete (free, key-less, optional)
// ---------------------------------------------------------------------------
const ENDPOINTS = [
  { name: 'google', url: q => 'https://suggestqueries.google.com/complete/search?client=firefox&hl=en&q=' + encodeURIComponent(q) },
  { name: 'bing', url: q => 'https://api.bing.com/osjson.aspx?query=' + encodeURIComponent(q) },
  { name: 'duckduckgo', url: q => 'https://duckduckgo.com/ac/?q=' + encodeURIComponent(q) }
];

export async function liveSuggest(seeds, { timeout = 8000, endpoints = ENDPOINTS, log = () => {} } = {}) {
  const found = {};
  for (const seed of seeds) {
    for (const ep of endpoints) {
      try {
        const res = await fetch(ep.url(seed), { signal: AbortSignal.timeout(timeout), headers: { 'user-agent': 'AR7Traders-SEO/1.0 (+https://ar7traders.com)' } });
        if (!res.ok) { log(`${ep.name} ${res.status} for "${seed}"`); continue; }
        const list = parseAutocomplete(await res.text());
        for (const kw of list) if (!found[kw]) found[kw] = ep.name;
        if (list.length) log(`${ep.name}: ${list.length} suggestions for "${seed}"`);
      } catch (err) {
        log(`${ep.name} unreachable for "${seed}" (${err.name})`);
      }
    }
  }
  return found;
}

// ---------------------------------------------------------------------------
// 6. Report
// ---------------------------------------------------------------------------
export function renderReport(plan, { live = false, liveNote = '' } = {}) {
  const lines = [];
  lines.push('# Keyword plan — what to write next');
  lines.push('');
  lines.push(`Generated: ${plan.generatedAt}  ·  ${plan.total} keywords across ${Object.keys(plan.routes).length} pages`);
  lines.push('');
  lines.push('Built by `scripts/seo-keywords.mjs` (`npm run seo:keywords`) from the site\'s own');
  lines.push('catalogue — the makes and bodies it lists, the machine types on the China desk, the');
  lines.push('destination lanes it quotes and the questions the FAQ answers.');
  lines.push('');
  lines.push(live
    ? `Live autocomplete: **on** (free Google/Bing/DuckDuckGo suggestion endpoints, no API key). ${liveNote}`
    : 'Live autocomplete: **off** this run (`--live` turns it on; it needs network egress).');
  lines.push('');
  lines.push('> This plan gives the *shape* of demand, not volumes. Search volume and difficulty');
  lines.push('> come from Google Search Console, Bing Webmaster Tools or Keyword Planner — run');
  lines.push('> `npm run seo:connect` to see which of those the agent can already read.');
  lines.push('');
  const routeOrder = Object.entries(plan.routes).sort((a, b) => b[1].length - a[1].length);
  for (const [route, list] of routeOrder) {
    lines.push(`## ${route}  ·  ${list.length}`);
    lines.push('');
    lines.push('| keyword | intent | words | already covered |');
    lines.push('| --- | --- | --- | --- |');
    for (const row of list.slice(0, 25)) {
      lines.push(`| ${row.keyword} | ${row.intent} | ${row.specificity} | ${row.covered === null ? '—' : row.covered ? 'yes' : '**no**'} |`);
    }
    if (list.length > 25) lines.push(`| … | | | ${list.length - 25} more in keywords-plan.json |`);
    lines.push('');
  }
  const gaps = plan.gaps.slice(0, 40);
  lines.push('## Where the copy does not yet say the words');
  lines.push('');
  if (!gaps.length) lines.push('Every routed keyword\'s head term already appears in that page\'s title or description.');
  else {
    lines.push('These routed keywords use a head term the target page\'s title/description does not contain yet — the cheapest ranking work available:');
    lines.push('');
    for (const g of gaps) lines.push(`- \`${g.keyword}\` → ${g.route}`);
  }
  lines.push('');
  lines.push('## How to use this with the auditor');
  lines.push('');
  lines.push('1. Write the words into the page (title, H1, first paragraph, an FAQ answer).');
  lines.push('2. `npm run seo` — the audit fails any page that lost its keyword targets.');
  lines.push('3. `npm run seo:indexnow` — push the changed URLs to Bing and Yandex.');
  lines.push('4. Re-run this script after a month of Search Console data and keep what ranks.');
  lines.push('');
  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// 7. CLI
// ---------------------------------------------------------------------------
const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const live = args.includes('--live');
  const printOnly = args.includes('--print');

  // Seeds. Catalogue seeds carry the nouns we sell; lane seeds carry the
  // routes, and only they get a country baked in — otherwise every keyword
  // ends up looking like a destination query.
  const carSeeds = [
    ...carMakes.map(m => `${m.toLowerCase()} car`),
    ...[...new Set(carPairs)].slice(0, 60).map(m => m.toLowerCase()),
    ...carBodies.map(b => `${b.toLowerCase()} car`)
  ];
  const machineSeeds = [
    ...machineTypes.map(t => `${t.toLowerCase().replace(/s$/, '')} for sale`),
    ...machineTypes.map(t => `used ${t.toLowerCase().replace(/s$/, '')}`),
    ...machineBrands.map(b => `${b.toLowerCase()} machinery`)
  ];
  const catalogueSeeds = [...carSeeds, ...machineSeeds,
    ...faqQuestions.map(q => q.toLowerCase().replace(/[?.]$/, ''))];
  const laneSeeds = ['import car', 'import machinery', 'car shipping', 'vehicle export', 'excavator shipping'];
  const countries = ['{country}', ...destinations];
  const seeds = [...catalogueSeeds, ...laneSeeds];

  // Live pass: the endpoints are free but not unlimited, so ask about the most
  // valuable seeds only. `--seeds 30` widens it.
  const seedCap = Number((args.find(a => a.startsWith('--seeds=')) || '').split('=')[1]) || 12;

  let liveFound = {};
  let liveNote = '';
  if (live) {
    const liveSeeds = [...laneSeeds.map(s => `${s} to ${countries[1].toLowerCase()}`), ...catalogueSeeds].slice(0, seedCap);
    console.log(`Asking the free autocomplete endpoints about ${liveSeeds.length} seeds…`);
    liveFound = await liveSuggest(liveSeeds, { log: msg => console.log('   ', msg) });
    const n = Object.keys(liveFound).length;
    liveNote = n ? `Collected ${n} suggestions.` : 'No endpoint answered — the offline plan stands.';
    console.log('   ', liveNote);
  }

  const keywords = [
    ...expandSeeds(carSeeds, MODIFIERS.car),
    ...expandSeeds(machineSeeds, MODIFIERS.machine),
    ...expandSeeds(faqQuestions.map(q => q.toLowerCase().replace(/[?.]$/, '')), MODIFIERS.general),
    ...expandSeeds(laneSeeds, ['import {country}', 'shipping to {country}', 'import to {country}']),
    ...Object.keys(liveFound)
  ];
  const plan = buildPlan(keywords, {
    live: liveFound,
    sources: { carMakes: carMakes.length, carPairs: carPairs.length, carBodies: carBodies.length, machineTypes: machineTypes.length, machineBrands: machineBrands.length, destinations: destinations.length, faqQuestions: faqQuestions.length }
  });
  const report = renderReport(plan, { live, liveNote });

  console.log(`\n${plan.total} keywords · ${Object.keys(plan.routes).length} pages · ${plan.gaps.length} uncovered head terms`);
  for (const [route, list] of Object.entries(plan.routes).sort((a, b) => b[1].length - a[1].length).slice(0, 12)) {
    console.log(`   ${String(list.length).padStart(5)}  ${route}`);
  }

  if (printOnly) {
    console.log('\n' + report);
  } else {
    writeFileSync(path.join(root, 'KEYWORDS.md'), report);
    writeFileSync(path.join(root, 'keywords-plan.json'), JSON.stringify(plan, null, 2));
    console.log('\nWrote KEYWORDS.md and keywords-plan.json');
    console.log('Next: npm run seo   (the audit reads keywords-plan.json when it is present)');
  }
}
