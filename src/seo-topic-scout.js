// Topic Scout + audit upgrade report — pure logic for the SEO desk.
//
// buildTopicIdeas() proposes article topics tied to THIS business: the live
// car stock, the machinery catalogue and the destination markets. Every topic
// ships with catalogue-derived FACTS (counts, models, year and price ranges)
// so the AI draft step can obey its own contract — "use ONLY supplied
// verified facts" — and never has to invent anything.
//
// buildUpgradeReport() turns a finished live crawl into a prioritised,
// copy-pastable upgrade report, split into what the desk operator can do
// alone and what needs a code change (the part to hand to a developer agent).
//
// Both functions are deterministic and side-effect free (tested in
// scripts/seo-topic-scout.test.mjs).

const text = v => String(v ?? '').trim();
const usdOf = car => Number(String(car?.price || '').replace(/[^0-9.]/g, '')) || null;
const fmtUsd = n => '$' + Math.round(n).toLocaleString('en-US');

/** Published-slug set so the scout never proposes a duplicate. */
const slugOf = title => text(title).toLowerCase()
  .replace(/[’'".,:;!?()&/]+/g, ' ').replace(/\s+/g, '-').replace(/^-+|-+$/g, '').slice(0, 90);

export function buildTopicIdeas({ cars = [], machines = [], dests = [], published = [] } = {}) {
  const taken = new Set(published.map(a => slugOf(a.title)));
  const ideas = [];
  const push = idea => { if (!taken.has(slugOf(idea.title))) ideas.push(idea); };

  // ---- 1. Brand guides from the LIVE stock (top makes with real depth) ----
  const live = cars.filter(c => c && c.published !== false);
  const byMake = new Map();
  for (const c of live) {
    if (!c.make) continue;
    if (!byMake.has(c.make)) byMake.set(c.make, []);
    byMake.get(c.make).push(c);
  }
  const makes = [...byMake.entries()].sort((a, b) => b[1].length - a[1].length).slice(0, 4);
  for (const [make, stock] of makes) {
    if (stock.length < 5) continue;
    const models = [...new Set(stock.map(c => c.model).filter(Boolean))];
    const years = stock.map(c => Number(c.year)).filter(Boolean);
    const prices = stock.map(usdOf).filter(Boolean);
    const facts = [
      `AR7 Traders currently lists ${stock.length} ${make} vehicles for export on ar7traders.com.`,
      `${make} models currently in the AR7 inventory include: ${models.slice(0, 6).join(', ')}.`,
      ...(years.length ? [`The listed ${make} stock spans model years ${Math.min(...years)} to ${Math.max(...years)}.`] : []),
      ...(prices.length ? [`Listed ${make} FOB asking prices currently range from ${fmtUsd(Math.min(...prices))} to ${fmtUsd(Math.max(...prices))} USD.`] : []),
      'AR7 Traders sources vehicles through Japanese auctions and dealer stock; website prices are indicative FOB figures and the binding figure is always the written quotation.',
      'Browsing the live stock: ar7traders.com/inventory filters by make, body type, fuel and budget.'
    ];
    push({
      id: 'make-' + make.toLowerCase().replace(/\s+/g, '-'),
      title: `Buying a used ${make} from Japan: what's in stock right now`,
      cat: 'BUYING GUIDE', kind: 'guide',
      img: '/assets/used-japanese-cars-auction-export-toyota-3.jpg',
      why: `${stock.length} ${make} vehicles live — searches for "used ${make.toLowerCase()} from japan" land on competitors' pages today.`,
      facts
    });
  }

  // ---- 2. Destination checklists from the markets we actually ship to -----
  for (const d of dests.slice(0, 8)) {
    const [country, port, transit] = d;
    const facts = [
      `AR7 Traders ships vehicles from Japan to ${country}, discharging at ${port}.`,
      `Typical sea transit from Japan to ${port} is ${transit}.`,
      `The destination guide at ar7traders.com covers ${country}'s ports, typical costs and the standard document pack (invoice, Bill of Lading, Japanese Export Certificate with translation).`,
      'Import duty, age limits and roadworthiness rules are set by the destination country and change without notice; buyers should confirm current rules with their customs authority or clearing agent before ordering.',
      'AR7 quotations state FOB or CIF terms explicitly; CIF adds the agreed sea freight and marine insurance to the named port.'
    ];
    push({
      id: 'dest-' + slugOf(country),
      title: `Shipping a car from Japan to ${country}: the pre-order checklist`,
      cat: 'LOGISTICS', kind: 'guide',
      img: '/assets/og/shipping.jpg',
      why: `"${country.toLowerCase()} import used car from japan" is a buying-intent query this site can own with one page.`,
      facts
    });
  }

  // ---- 3. Machinery guides from the catalogue ------------------------------
  const visibleMachines = machines.filter(m => m && !m.photosPending);
  if (visibleMachines.length >= 3) {
    const types = [...new Set(visibleMachines.map(m => m.type).filter(Boolean))];
    const brands = [...new Set(visibleMachines.map(m => m.brand).filter(Boolean))];
    push({
      id: 'machinery-overview',
      title: 'Buying used construction machinery for export: how AR7 sources it',
      cat: 'BUYING GUIDE', kind: 'guide',
      img: '/assets/machinery/hero-yard.webp',
      why: 'The machinery desk has stock but almost no editorial surface for machinery buyers to find.',
      facts: [
        `AR7 Traders currently lists ${visibleMachines.length} machines for export, across these types: ${types.join(', ')}.`,
        ...(brands.length ? [`Brands currently in the machinery catalogue include: ${brands.slice(0, 6).join(', ')}.`] : []),
        'Machinery is sourced to order from vetted suppliers, quoted FOB with freight to the buyer\'s port on request.',
        'Each machine listing shows the inspection photos available to AR7; buyers can request additional condition documentation before committing.',
        'The machinery desk is at ar7traders.com/machinery, with one page per equipment type.'
      ]
    });
  }

  return ideas;
}

// ---------------------------------------------------------------------------
// Audit → upgrade report.

/** Classify a failing/warning check: can the desk fix it alone, or is it code? */
const DESK_FIXABLE = new Set(['title', 'desc', 'keywords', 'h1', 'og-image', 'content']);

export function buildUpgradeReport(rows = [], { origin = 'https://ar7traders.com', now = new Date() } = {}) {
  const audited = rows.filter(r => r && Array.isArray(r.checks));
  const broken = rows.filter(r => r && !Array.isArray(r.checks));
  const failing = audited.filter(r => r.fails > 0);
  const warning = audited.filter(r => r.fails === 0 && r.warns > 0);
  const clean = audited.filter(r => r.fails === 0 && r.warns === 0);

  // Group every non-passing check across pages: one issue, N pages.
  const issues = new Map();
  for (const row of audited) {
    for (const check of row.checks) {
      if (check.status === 'pass') continue;
      const key = check.id + ':' + check.status;
      if (!issues.has(key)) issues.set(key, { id: check.id, label: check.label, status: check.status, fix: check.fix, detail: check.detail, paths: [] });
      issues.get(key).paths.push(row.path || row.url);
    }
  }
  const sorted = [...issues.values()].sort((a, b) =>
    (b.status === 'fail') - (a.status === 'fail') || b.paths.length - a.paths.length);

  const deskItems = sorted.filter(i => DESK_FIXABLE.has(i.id));
  const codeItems = sorted.filter(i => !DESK_FIXABLE.has(i.id));

  const lines = [];
  lines.push(`# AR7 Traders — SEO upgrade report (${now.toISOString().slice(0, 10)})`);
  lines.push('');
  lines.push(`Audited ${audited.length} live pages on ${origin}.`);
  lines.push(`Clean: ${clean.length} · warnings only: ${warning.length} · failing: ${failing.length}` +
    (broken.length ? ` · unreachable/errored: ${broken.length}` : ''));
  lines.push('');
  if (broken.length) {
    lines.push('## Unreachable pages (fix first — crawlers see these too)');
    for (const r of broken.slice(0, 10)) lines.push(`- ${r.path || r.url}: ${r.error || r.state}`);
    lines.push('');
  }
  const block = (title, items, note) => {
    if (!items.length) return;
    lines.push(`## ${title}`);
    if (note) lines.push(`_${note}_`);
    for (const issue of items) {
      lines.push(`- **${issue.label}** (${issue.status.toUpperCase()}) — ${issue.paths.length} page(s): ` +
        issue.paths.slice(0, 5).join(', ') + (issue.paths.length > 5 ? ` +${issue.paths.length - 5} more` : ''));
      if (issue.fix) lines.push(`  - Fix: ${issue.fix}`);
      else if (issue.detail) lines.push(`  - Detail: ${issue.detail}`);
    }
    lines.push('');
  };
  block('Fixable from this desk (titles, descriptions, headings, images, copy)', deskItems,
    'Edit the page or guide in the CRM — no code change needed.');
  block('Needs a code change (hand this section to your developer agent)', codeItems,
    'Paste this report into your Arena coding session; each item names the check and the affected paths.');
  if (!sorted.length && audited.length) lines.push('No failing or warning checks — every audited page passed. Re-run after the next content change.');
  return lines.join('\n');
}
