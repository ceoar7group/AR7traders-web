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

// ---------------------------------------------------------------------------
// Cover pictures (2026-11-08 owner report: "the articles are using the same
// image… it should not use the same twice at all").
//
// Guide covers must be site assets (validateGuide requires /assets/ paths, so
// a hot-linked stock photo can never be an og:image). The scout now picks
// from pools — brand-matched first, generic second — and REFUSES to assign a
// cover that is already used by a published article or by another idea in
// the same batch. Only when every pooled asset is taken does it fall back to
// the first brand/generic entry rather than propose nothing.
// 2026-11-10 (owner report: "for nissan u added lambo image, for honda u
// added nissan, for suzuki u added honda"): every pooled asset below has been
// LOOKED AT, because several filenames lied about their content —
// honda-vezel--1 is a Nissan Serena, honda-vezel--2/--3 are Toyota Vitz,
// toyota-5 is a Nissan Murano with a competitor watermark, both toyota-h-*
// files carry a BE FORWARD watermark and inspection-shipping-5 shows another
// dealer's sign. None of those may ever be proposed as a cover. The pools
// now hold only verified-content, watermark-free assets; a cover from the
// wrong brand's pool is worse than a neutral one, so GENERIC holds only
// brand-neutral yard/port/inspection scenes.
const BRAND_COVERS = {
  toyota: [
    '/assets/used-japanese-cars-auction-export-toyota-1.webp',   // Noah
    '/assets/used-japanese-cars-auction-export-toyota-2.webp',   // Alphard
    '/assets/used-japanese-cars-auction-export-toyota-4.webp',   // Vellfire
    '/assets/og/inventory.jpg'                                   // Voxy
  ],
  honda: [
    '/assets/japan-used-car-export-stock-honda-vezel--4.webp',   // Vezel
    '/assets/og/auction.jpg'                                     // Vezel
  ],
  nissan: [
    '/assets/japan-used-car-export-stock-nissan-serena-1.webp'   // Serena
  ]
};
const GENERIC_COVERS = [
  '/assets/japan-car-auction-hall-1.jpg',                     // auction hall
  '/assets/japanese-car-auction-inspection-shipping-1.webp',  // export yard
  '/assets/japan-vehicle-export-port-aerial-1.jpg',           // port aerial
  '/assets/japanese-car-auction-inspection-shipping-2.webp',  // RoRo vessel
  '/assets/japan-car-carrier-trucks-1.jpg',                   // carrier truck
  '/assets/japanese-car-auction-inspection-shipping-3.webp'   // inspection bay
];
const LOGISTICS_COVERS = [
  '/assets/japan-vehicle-export-port-aerial-1.jpg',
  '/assets/og/shipping.jpg',
  '/assets/japanese-car-auction-inspection-shipping-2.webp',
  '/assets/japan-car-carrier-trucks-1.jpg',
  '/assets/japanese-car-auction-inspection-shipping-1.webp',
  '/assets/japanese-car-auction-inspection-shipping-3.webp'
];
// Assets whose CONTENT shows a brand (verified by eye, not by filename).
// suggestCoverFixes uses this to catch a cover wearing the WRONG make —
// the filename-derived guess is overridden where the filename lies.
const COVER_BRANDS = {
  '/assets/japan-used-car-export-stock-honda-vezel--1.webp': 'nissan',
  '/assets/japan-used-car-export-stock-honda-vezel--2.webp': 'toyota',
  '/assets/japan-used-car-export-stock-honda-vezel--3.webp': 'toyota',
  '/assets/japan-used-car-export-stock-honda-vezel--4.webp': 'honda',
  '/assets/japan-used-car-export-stock-honda-vezel--5.webp': 'honda',
  '/assets/japan-used-car-export-stock-nissan-serena-1.webp': 'nissan',
  '/assets/og/inventory.jpg': 'toyota',
  '/assets/og/auction.jpg': 'honda',
  '/assets/og/help.jpg': 'toyota',
  '/assets/used-japanese-cars-auction-export-toyota-5.webp': 'nissan',
  '/assets/showroom/hero-02.webp': 'lamborghini'
};
// Covers that must never appear on an article at all: competitor or dealer
// branding is visible in the picture.
const BANNED_COVERS = new Set([
  '/assets/japan-used-car-export-inventory-toyota-h-1.webp',
  '/assets/japan-used-car-export-inventory-toyota-h-2.webp',
  '/assets/used-japanese-cars-auction-export-toyota-5.webp',
  '/assets/japanese-car-auction-inspection-shipping-5.webp'
]);

// ---------------------------------------------------------------------------
// Cover image doctor (2026-11-10 owner: "make a function in CRM to fix such
// issues later as well"; extended same day after the first pass shipped a
// Lamborghini on the Nissan guide — duplicates were fixed, brands were not).
// Pure and deterministic: given the article list it flags, in this order,
//   1. covers with visible competitor/dealer branding (BANNED_COVERS),
//   2. covers whose pictured make contradicts the title's make — judged by
//      verified CONTENT (COVER_BRANDS) first, filename token second,
//   3. missing covers,
//   4. duplicate covers (the best title↔image match keeps the image),
// and proposes a unique replacement for each offender from the audited
// pools — title's brand pool first, then neutral generic/logistics — never
// re-using an image already on ANY article or already proposed in the batch.
// Several assets are crops/re-exports of the SAME photograph under different
// names (.jpg/.webp twins, and the og/* social images). Two articles wearing
// two files of one photograph still LOOK like duplicates, so the doctor
// reasons about scenes, not paths: the basename without extension, plus the
// known og/* aliases (verified by eye).
const COVER_SCENE_ALIASES = {
  'shipping': 'japanese-car-auction-inspection-shipping-1', // og/shipping.jpg
  'auction': 'japan-used-car-export-stock-honda-vezel--4',  // og/auction.jpg
  'inventory': 'used-japanese-cars-auction-export-toyota-1' // og/inventory.jpg
};
export const coverSceneOf = image => {
  const path = text(image);
  if (!path) return '';
  const stem = (path.split('/').pop() || '').replace(/\.(jpe?g|webp|png)$/i, '');
  return path.startsWith('/assets/og/') && COVER_SCENE_ALIASES[stem] ? COVER_SCENE_ALIASES[stem] : stem;
};
const KNOWN_MAKES = ['toyota', 'honda', 'nissan', 'suzuki', 'mazda', 'subaru',
  'mitsubishi', 'daihatsu', 'lexus', 'isuzu', 'lamborghini', 'ferrari'];
const titleMakeOf = title => {
  const t = title.toLowerCase();
  return KNOWN_MAKES.find(b => t.includes(b)) || null;
};
const imageMakeOf = image => {
  if (COVER_BRANDS[image]) return COVER_BRANDS[image];
  const f = image.toLowerCase();
  return KNOWN_MAKES.find(b => f.includes(b)) || null;
};
export function suggestCoverFixes(articles = []) {
  const rows = articles.filter(a => a && a.id != null).map(a => ({
    id: a.id, title: text(a.title), image: text(a.image || a.img)
  }));
  const used = new Set(rows.map(r => coverSceneOf(r.image)).filter(Boolean));
  // Title↔image affinity: the picture really showing the title's make beats
  // everything; a neutral picture beats a wrong-make one.
  const affinity = r => {
    const want = titleMakeOf(r.title);
    const got = imageMakeOf(r.image);
    if (want && got === want) return 2;
    if (got && want && got !== want) return -1;
    return 0;
  };
  const nextFree = r => {
    const want = titleMakeOf(r.title);
    const logistics = /shipp|freight|port|roro|container|clearance|lane/i.test(r.title);
    const pools = [
      ...(want && BRAND_COVERS[want] ? [BRAND_COVERS[want]] : []),
      ...(logistics ? [LOGISTICS_COVERS] : []),
      GENERIC_COVERS, LOGISTICS_COVERS
    ];
    for (const pool of pools) for (const img of pool) {
      // Never hand out a banned asset, and never hand a WRONG make's picture
      // to a titled guide — a Suzuki guide takes a neutral yard over a Toyota.
      const poolMake = imageMakeOf(img);
      if (BANNED_COVERS.has(img)) continue;
      if (want && poolMake && poolMake !== want) continue;
      const scene = coverSceneOf(img);
      if (!used.has(scene)) { used.add(scene); return img; }
    }
    return null; // every pooled asset is taken — surface "no fix" honestly
  };
  const fixes = [];
  const fixed = new Set();
  const propose = (r, from, reason) => {
    if (fixed.has(r.id)) return;
    const to = nextFree(r);
    if (to) { fixed.add(r.id); fixes.push({ id: r.id, title: r.title, from, to, reason }); }
  };
  // 1. Banned branding and 2. wrong make — worst first.
  for (const r of rows) {
    if (!r.image) continue;
    if (BANNED_COVERS.has(r.image)) { propose(r, r.image, 'competitor branding visible in the picture'); continue; }
    const want = titleMakeOf(r.title), got = imageMakeOf(r.image);
    if (want && got && got !== want) propose(r, r.image, `cover shows a ${got}, the title says ${want}`);
  }
  // 3. Missing covers, in list order.
  for (const r of rows) {
    if (!r.image) propose(r, '', 'missing cover');
  }
  // 4. Duplicate groups: keep the best title match, re-cover the rest.
  const byImage = new Map();
  for (const r of rows) {
    if (!r.image || fixed.has(r.id)) continue;
    const scene = coverSceneOf(r.image);
    if (!byImage.has(scene)) byImage.set(scene, []);
    byImage.get(scene).push(r);
  }
  for (const [img, group] of byImage) {
    if (group.length < 2) continue;
    const keeper = group.reduce((best, r) => affinity(r) > affinity(best) ? r : best, group[0]);
    for (const r of group) {
      if (r !== keeper) propose(r, img, `duplicate of “${keeper.title}”`);
    }
  }
  return fixes;
}

export function buildTopicIdeas({ cars = [], machines = [], dests = [], published = [] } = {}) {
  const taken = new Set(published.map(a => slugOf(a.title)));
  // Subject-level coverage (2026-11-08 owner report: the desk kept proposing
  // "Buying a used Suzuki…" while "Used Suzuki Vehicles in Stock…" was
  // already live — the exact-slug check passed, the subject was still a
  // duplicate). A make/market is covered when ANY published title names it.
  const publishedSlugs = published.map(a => slugOf(a.title)).filter(Boolean);
  const covered = subject => {
    const t = slugOf(subject);
    return !!t && publishedSlugs.some(s => s.includes(t));
  };
  // Covers already in use — published articles' images are off the table.
  // Compared as SCENES (coverSceneOf), because .jpg/.webp twins and the og/*
  // aliases are the same photograph wearing different filenames.
  const usedCovers = new Set(published.map(a => coverSceneOf(a.img || a.image)).filter(Boolean));
  const pickCover = (...pools) => {
    for (const pool of pools) for (const img of pool) {
      if (BANNED_COVERS.has(img)) continue;
      const scene = coverSceneOf(img);
      if (!usedCovers.has(scene)) { usedCovers.add(scene); return img; }
    }
    return (pools[0] && pools[0][0]) || GENERIC_COVERS[0]; // every asset taken — last resort
  };
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
    if (covered(make)) continue; // a live article already owns this make
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
      img: pickCover(BRAND_COVERS[make.toLowerCase()] || [], GENERIC_COVERS),
      why: `${stock.length} ${make} vehicles live — searches for "used ${make.toLowerCase()} from japan" land on competitors' pages today.`,
      facts
    });
  }

  // ---- 2. Destination checklists from the markets we actually ship to -----
  for (const d of dests.slice(0, 8)) {
    const [country, port, transit] = d;
    if (covered(country)) continue; // a live article already owns this market
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
      img: pickCover(LOGISTICS_COVERS, GENERIC_COVERS),
      why: `"${country.toLowerCase()} import used car from japan" is a buying-intent query this site can own with one page.`,
      facts
    });
  }

  // ---- 3. Machinery guides from the catalogue ------------------------------
  const visibleMachines = machines.filter(m => m && !m.photosPending);
  if (visibleMachines.length >= 3 && !covered('machinery')) {
    const types = [...new Set(visibleMachines.map(m => m.type).filter(Boolean))];
    const brands = [...new Set(visibleMachines.map(m => m.brand).filter(Boolean))];
    push({
      id: 'machinery-overview',
      title: 'Buying used construction machinery for export: how AR7 sources it',
      cat: 'BUYING GUIDE', kind: 'guide',
      img: pickCover(['/assets/machinery/hero-yard.webp'], GENERIC_COVERS),
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
