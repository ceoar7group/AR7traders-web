// Contrast & overflow pins — the 2026-11-11 owner report, kept fixed.
//
// 1. A CRM-published guide once carried a long unbreakable token; the article
//    grid's implicit track grew past the viewport and every paragraph and the
//    cover image ran off the page. Two CSS guards make that impossible; this
//    test pins them so a refactor cannot quietly drop either one.
// 2. Lighthouse flagged gold-as-text (#e09a26) on cream surfaces across six
//    pages (4.1–4.4:1, below WCAG AA 4.5:1). Those spots now use --gold-ink,
//    and the token itself must KEEP a passing ratio against every light
//    surface it sits on — computed here from the stylesheet, not assumed.
// 3. WCAG 2.5.3 label-in-name: controls whose aria-label did not contain
//    their visible text ("Make offer", "Compare", the header brand) broke
//    voice control on every page. The accessible names are pinned.

import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; console.log('  \u2713 ' + label); }
  else { fail++; console.error('  \u2717 ' + label); }
};
const css = f => readFileSync(new URL('../src/' + f, import.meta.url), 'utf8');

// --- WCAG relative-luminance contrast, straight from the spec -------------
const lum = hex => {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

console.log('1) The article page cannot be stretched by its own content');
{
  const e = css('expanded.css');
  const art = e.match(/\.news-article\{[^}]*\}/)?.[0] || '';
  ok(/grid-template-columns:\s*minmax\(0,\s*1fr\)/.test(art),
    '.news-article pins its single grid track with minmax(0,1fr) — a long token cannot widen it');
  ok(/overflow-wrap:\s*anywhere/.test(art),
    '.news-article carries overflow-wrap:anywhere — any unbreakable token wraps inside the column');
  ok(/max-width:\s*780px/.test(art), 'the 780px reading width is unchanged');
  ok(/\.news-grid p\{[^}]*overflow-wrap:\s*anywhere/.test(e) && /\.news-grid h3,\.news-grid h2\{[^}]*overflow-wrap:\s*anywhere/.test(e),
    'guide cards on /news wrap long tokens too');
}

console.log('\n2) Gold-as-text meets WCAG AA on every light surface it sits on');
{
  const s = css('styles.css');
  const goldInk = s.match(/:root\{[^}]*--gold-ink:(#[0-9a-f]{6})/i)?.[1];
  const bg = s.match(/:root\{[^}]*--bg:(#[0-9a-f]{6})/i)?.[1];
  ok(!!goldInk && !!bg, `tokens read from styles.css (--gold-ink ${goldInk}, --bg ${bg})`);
  // The surfaces gold text actually sits on: page bg, white cards, and the
  // warm tints produced by color-mix(gold 16–18%, transparent) over them.
  for (const [name, surface] of [['--bg', bg], ['white cards', 'ffffff'], ['gold-tinted chips', 'f9edd8']]) {
    const r = ratio(goldInk, surface.replace('#', ''));
    ok(r >= 4.5, `--gold-ink on ${name}: ${r.toFixed(2)}:1 (AA needs 4.5)`);
  }
  // 2026-11-11 (owner: light-mode gold looked muddy): display gold split off
  // into --gold-head, used ONLY on headline ems — large text, so WCAG AA asks
  // 3:1, which lets it be visibly brighter than the 4.5:1 body ink.
  const goldHead = s.match(/:root\{[^}]*--gold-head:(#[0-9a-f]{6})/i)?.[1];
  ok(!!goldHead, `display token read from styles.css (--gold-head ${goldHead})`);
  for (const [name, surface] of [['--bg', bg], ['white cards', '#ffffff']]) {
    const r = ratio(goldHead, surface.replace('#', ''));
    ok(r >= 3, `--gold-head (display sizes only) on ${name}: ${r.toFixed(2)}:1 (AA large text needs 3)`);
  }
  // The header wordmark gold (--brand-gold, matched to the logo) renders at
  // 19px/800 — large text under WCAG, so it too must clear 3:1 on the nav card.
  const brandGold = s.match(/:root\{[^}]*--brand-gold:(#[0-9a-f]{6})/i)?.[1];
  ok(!!brandGold && ratio(brandGold, 'ffffff') >= 3,
    `--brand-gold wordmark on the nav card: ${ratio(brandGold || 'ffffff', 'ffffff').toFixed(2)}:1 (AA large text needs 3)`);
  // The six spots Lighthouse failed now use the ink token, not raw gold.
  const e = css('expanded.css'), n = css('network.css'), p = css('pages.css'), m = css('machinery.css');
  ok(/\.inventory-group-head span\{[^}]*var\(--gold-ink\)/.test(e), 'inventory group label uses --gold-ink');
  ok(/\.hb-step>span\{[^}]*color:var\(--gold-ink\)/.test(e), 'how-to-buy step numbers use --gold-ink');
  ok(/\.faq-topic-title\{[^}]*var\(--gold-ink\)/.test(e), 'FAQ topic titles use --gold-ink');
  ok(/\.world-copy h1 em\{[^}]*var\(--gold-head\)/.test(n), 'world page headline em uses the display gold (--gold-head)');
  ok(/\.net-panel li b\{[^}]*var\(--gold-ink\)/.test(n), 'network panel markers use --gold-ink');
  ok(/\.feature-cards article>span\{[^}]*var\(--gold-ink\)/.test(p) && /\.shipping-flow span\{[^}]*var\(--gold-ink\)/.test(p),
    'feature card indices and shipping flow steps use --gold-ink');
}

console.log('\n3) The page-hero kicker is readable on the dark green hero');
{
  const p = css('pages.css');
  ok(/\.page-hero \.kicker\{color:var\(--gold2\)\}/.test(p),
    'page-hero kicker is --gold2 (was --green-text #045138 on #032b1d: 1.3:1 — invisible)');
  const deep = css('styles.css').match(/--deep:(#[0-9a-f]{6})/i)[1];
  const gold2 = css('styles.css').match(/--gold2:(#[0-9a-f]{6})/i)[1];
  const r = ratio(gold2, deep);
  ok(r >= 4.5, `--gold2 on --deep hero: ${r.toFixed(2)}:1`);
}

console.log('\n4) Status chips and small labels pass AA');
{
  const n = css('network.css');
  for (const [cls, want] of [['loaded', 4.5], ['loading', 4.5], ['atos', 4.5], ['booking', 4.5]]) {
    const mch = n.match(new RegExp(`\\.st\\.${cls}\\{background:(#[0-9a-f]{6});color:(#[0-9a-f]{6})\\}`, 'i'));
    if (!mch) { ok(false, `.st.${cls} rule found`); continue; }
    const r = ratio(mch[2], mch[1]);
    ok(r >= want, `.st.${cls}: ${r.toFixed(2)}:1`);
  }
  const m = css('machinery.css');
  const facet = m.match(/\.mch-facets label\{[^}]*color:(#[0-9a-f]{6})\}/i)?.[1];
  ok(facet && ratio(facet, 'f5f6f2') >= 4.5, `machinery facet labels: ${facet && ratio(facet, 'f5f6f2').toFixed(2)}:1`);
}

console.log('\n5) WCAG 2.5.3 — visible text is part of every accessible name');
{
  const header = readFileSync(new URL('../src/site-header.jsx', import.meta.url), 'utf8');
  ok(!/className="brand"[^>]*aria-label/.test(header),
    'the header brand link has NO aria-label — its visible text is its name');
  const main = readFileSync(new URL('../src/main.jsx', import.meta.url), 'utf8');
  ok(/aria-label=\{'Make offer on the '/.test(main),
    'the card offer label starts with its visible text "Make offer"');
  ok(/aria-label=\{comp\?\('Added — remove '/.test(main) && /'Compare '\+\(c\.make/.test(main),
    'the compare chip label starts with its visible text ("Compare" / "Added")');
  ok(main.includes("setIdx(i)} tabIndex={a>1?-1:0}>") && !main.includes("aria-label={off===0?`Open"),
    'hero inventory slides have no aria-label overriding their caption');
}

console.log('\n6) Below-the-fold home sections defer their rendering work');
{
  const perf = css('performance.css');
  ok(/content-visibility:auto/.test(perf) && /contain-intrinsic-size:auto 900px/.test(perf),
    'content-visibility:auto with reserved intrinsic size (CLS-safe) is in place');
  const noComments = perf.replace(/\/\*[\s\S]*?\*\//g, '');
  const deferredBlock = noComments.match(/([^}]*)\{\s*content-visibility:auto/)?.[1] || '';
  ok(deferredBlock.length > 0 && !/\.hero\b|\.ticker\b/.test(deferredBlock),
    'the hero and ticker (above the fold) are not in the deferred set');
}

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
