// SEO desk content creation (npm run test:seo-desk-create).
//
// SEO desk guide publishing (npm run test:seo-desk-create).
// Pins the title-derived canonical slug (the existing site_articles schema has
// no slug column), validation, staff permission, mocked CRUD write/refresh,
// sitemap audit, and real image assets. No live HTTP or database access.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
  url: 'https://ar7traders.com/seo',
  pretendToBeVisual: true
});

const g = globalThis;
const setGlobal = (k, v) => {
  try { g[k] = v; }
  catch { Object.defineProperty(g, k, { value: v, writable: true, configurable: true }); }
};
for (const k of ['window', 'document', 'navigator', 'location', 'history', 'HTMLElement', 'Element',
  'Node', 'Event', 'MouseEvent', 'CustomEvent', 'KeyboardEvent', 'PopStateEvent',
  'getComputedStyle', 'localStorage', 'sessionStorage']) setGlobal(k, dom.window[k === 'window' ? 'window' : k]);
setGlobal('window', dom.window);
setGlobal('requestAnimationFrame', cb => setTimeout(() => cb(Date.now()), 0));
setGlobal('cancelAnimationFrame', id => clearTimeout(id));
setGlobal('IS_REACT_ACT_ENVIRONMENT', true);
setGlobal('scrollTo', () => {});
setGlobal('matchMedia', dom.window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} })));
setGlobal('IntersectionObserver', class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } });
setGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
setGlobal('addEventListener', dom.window.addEventListener.bind(dom.window));
setGlobal('removeEventListener', dom.window.removeEventListener.bind(dom.window));
setGlobal('dispatchEvent', dom.window.dispatchEvent.bind(dom.window));
dom.window.scrollTo = () => {};
dom.window.HTMLElement.prototype.scrollIntoView = function () {};

// Crawl files and API responses are local fixtures. The article CRUD mock
// records a private draft POST, an explicit publish PATCH and the resulting refresh.
const SITEMAP_XML = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://ar7traders.com/</loc></url>
  <url><loc>https://ar7traders.com/news</loc></url>
  <url><loc>https://ar7traders.com/news/how-online-bidding-works-with-ar7</loc></url>
</urlset>`;
const ROBOTS_TXT = `User-agent: *
Disallow: /crm
Disallow: /seo
Sitemap: https://ar7traders.com/sitemap.xml
Sitemap: https://ar7traders.com/api/sitemap-news.xml`;
let siteArticleRows = [];
let postBody = null;
const patchBodies = [];
const confirmCalls = [];
let confirmAnswer = true;
const fetchCalls = [];
dom.window.confirm = message => { confirmCalls.push(String(message)); return confirmAnswer; };
setGlobal('confirm', dom.window.confirm.bind(dom.window));
setGlobal('fetch', (url, options = {}) => {
  const u = String(url);
  const method = options.method || 'GET';
  fetchCalls.push({url: u, options});
  if (u.includes('?seo=status')) return Promise.resolve({ok: true, status: 200, json: async () => ({
    google: {state: 'not_configured', configured: false, ready: false, detail: 'Search Console credentials are not configured.'},
    indexNow: {state: 'not_configured', configured: false, ready: false, detail: 'Set AR7_INDEXNOW_KEY and publish its key file.'}
  })});
  if (u.includes('?seo=audit')) return Promise.resolve({ok: true, status: 200, json: async () => []});
  if (u.includes('sitemap.xml')) return Promise.resolve({ok: true, status: 200, text: async () => SITEMAP_XML});
  if (u.includes('robots.txt')) return Promise.resolve({ok: true, status: 200, text: async () => ROBOTS_TXT});
  if (u.includes('/api/site-content?entity=articles') && method === 'POST') {
    postBody = JSON.parse(options.body);
    const row = {id: 'article-test-1', ...postBody};
    siteArticleRows = [...siteArticleRows.filter(old => old.id !== row.id), row];
    return Promise.resolve({ok: true, status: 201, json: async () => row});
  }
  if (u.includes('/api/site-content?entity=articles') && method === 'PATCH') {
    const patch = JSON.parse(options.body);
    patchBodies.push(patch);
    const index = siteArticleRows.findIndex(row => row.id === patch.id);
    if (index < 0) return Promise.resolve({ok: false, status: 404, json: async () => ({error: 'Draft not found'})});
    siteArticleRows[index] = {...siteArticleRows[index], ...patch};
    return Promise.resolve({ok: true, status: 200, json: async () => siteArticleRows[index]});
  }
  if (u.includes('/api/site-content?entity=articles')) {
    const rows = u.includes('all=1') ? siteArticleRows : siteArticleRows.filter(row => row.published === true);
    return Promise.resolve({ok: true, status: 200, json: async () => rows});
  }
  if (u.includes('/api/settings'))
    return Promise.resolve({ok: true, status: 200, json: async () => ({})});
  return Promise.resolve({ok: false, status: 404, json: async () => ({}), text: async () => ''});
});

// Clipboard stub — capture what the desk copies.
let clipboard = [];
const notifications = [];
Object.defineProperty(dom.window.navigator, 'clipboard', {
  value: { writeText: async t => { clipboard.push(t); } },
  configurable: true
});

// Capture the console — the creator logs the article JSON there on purpose.
const logs = [];
const realLog = console.log;
console.log = (...a) => { logs.push(a.join(' ')); };

const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { default: SeoDesk, GUIDE_ASSETS, validateGuide, buildArticle, buildFactualDraft } = await import('../src/seo-desk.jsx');
  const { NEWS, getPublishedNews } = await import('../src/news-data.js');
const { existsSync } = await import('node:fs');
const { fileURLToPath } = await import('node:url');
const path = (await import('node:path')).default;

// The bundle lands in node_modules/.tmp/, so walk up until package.json —
// that is the repo root the public/ assets live under.
const root = (() => {
  try {
    let d = path.dirname(fileURLToPath(import.meta.url));
    for (let i = 0; i < 6 && !existsSync(path.join(d, 'package.json')); i++) d = path.resolve(d, '..');
    return d;
  } catch { return process.cwd(); }
})();

let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
const bad = s => process.stderr.write(s + '\n');
const ok = (cond, msg) => { if (cond) { pass++; say('  ✓ ' + msg); } else { fail++; bad('  ✗ ' + msg); } };

// ---- mount / interaction helpers --------------------------------------------
let root_ = null;
const container = document.getElementById('root');
async function mountDesk() {
  await act(async () => {
    if (root_) root_.unmount();
    root_ = createRoot(container);
    root_.render(React.createElement(SeoDesk, {
      navigate: () => {}, token: 'test-token', canPublish: true, canPromote: true,
      notify: message => { if (message) notifications.push(message); }
    }));
  });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
}
const $ = sel => document.querySelector(sel);
const $$ = sel => [...document.querySelectorAll(sel)];
async function click(el) {
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); });
}
function setValue(el, value) {
  const proto = el.tagName === 'TEXTAREA'
    ? dom.window.HTMLTextAreaElement.prototype
    : el.tagName === 'SELECT'
      ? dom.window.HTMLSelectElement.prototype
      : dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new dom.window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
}
async function setReactValue(el, value) {
  await act(async () => { setValue(el, value); });
}
async function submitForm() {
  const form = $('.seo-create');
  await act(async () => { form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
}
const errTexts = () => $$('.seo-err').map(e => e.textContent).join(' | ');
const labelOf = txt => $$('label').find(l => new RegExp(txt, 'i').test(l.querySelector('span')?.textContent || ''));

say('\nSEO desk: guide creator');
await mountDesk();
ok(!!$('.seo-score'), 'the desk boots and audits the page it sits on');
const createBtn = $$('button').find(b => /create draft/i.test(b.textContent));
ok(!!createBtn, 'the desk has a "Create draft" button');
await click(createBtn);
ok(!!$('.seo-create'), 'clicking it opens the guide form');
ok($$('.seo-create label').length >= 6, 'the form carries title, slug, category, image, description and body');
ok($$('.seo-create select option').some(o => o.textContent === 'MARKET WATCH'), 'categories come from NEWS_CATEGORIES');

say('\nValidation — missing fields');
{
  await submitForm();
  const errs = errTexts();
  ok(/title is required/i.test(errs), 'an empty title is refused');
  ok(/slug is required/i.test(errs), 'an empty slug is refused');
  ok(/description is required/i.test(errs), 'an empty meta description is refused');
  ok(/body is required/i.test(errs), 'an empty body is refused');
  ok(!$('.seo-created'), 'nothing was generated from an empty form');
}

say('\nValidation — canonical slug follows the persisted title');
{
  const title = labelOf('title').querySelector('input');
  const slugInput = labelOf('canonical slug').querySelector('input');
  ok(slugInput.readOnly && slugInput.maxLength === 90,
    'the slug is read-only because site_articles stores the title, not a separate slug');

  await setReactValue(title, 'How to Import a Used Excavator From China');
  ok(slugInput.value === 'how-to-import-a-used-excavator-from-china',
    `the public URL slug derives from the title (${slugInput.value})`);

  await setReactValue(title, 'A '.repeat(100) + 'used excavator');
  ok(slugInput.value.length <= 90, 'long titles derive a readable slug within the public 90-character cap');

  await setReactValue(title, 'How online bidding works with AR7');
  await submitForm();
  ok(/already published/i.test(errTexts()), 'a title deriving an existing NEWS slug is refused as a duplicate');
  ok(!$('.seo-created'), 'a duplicate title is never submitted');
}

say('\nGeneration — save an unpublished draft, review it, then publish explicitly');
{
  await mountDesk(); // fresh form state
  await click($$('button').find(b => /create draft/i.test(b.textContent)));

  const desc = 'What to check in a Chinese supplier listing — hours, undercarriage photos, the nameplate and the FOB quote — before you commit to a used excavator.';
  await setReactValue(labelOf('title').querySelector('input'), 'How to Import a Used Excavator From China');
  await setReactValue(labelOf('meta description').querySelector('textarea'), desc);
  await setReactValue(labelOf('body').querySelector('textarea'),
    'Buying a used excavator from China starts with the listing itself.\n\nAsk for cold-start video, the hour meter and the spec plate before you commit.');
  await submitForm();

  const created = $('.seo-created');
  ok(!!created, 'a valid form saves the guide through the existing articles CRUD');
  ok(clipboard.length === 0, 'saving a draft does not copy or publish anything automatically');
  ok(postBody?.published === false && postBody?.title === 'How to Import a Used Excavator From China',
    'the authenticated staff POST persists the guide with published=false');
  ok(siteArticleRows[0]?.published === false && !getPublishedNews().some(a => a.title === postBody.title),
    'the saved draft stays out of public news before a separate publish action');
  ok(confirmCalls.length === 0, 'draft save does not trigger the publication confirmation');
  ok(!('slug' in postBody), 'the canonical slug is derived from the persisted title, not a nonexistent slug column');
  ok(fetchCalls.some(call => call.options.method === 'POST' && call.options.headers?.Authorization === 'Bearer test-token'),
    'draft save is authenticated with the staff token');

  const copyButton = $$('.seo-create-actions button').find(button => /copy json backup/i.test(button.textContent));
  ok(!!copyButton, 'the desk offers a separate JSON backup action');
  if (copyButton) await click(copyButton);
  ok(clipboard.length > 0, 'the JSON backup is copied only after its button is clicked');
  const json = clipboard[clipboard.length - 1];
  let article = null;
  try { article = JSON.parse(json); } catch { /* asserted below */ }
  ok(!!article, 'the clipboard payload is valid JSON');
  ok(article && JSON.stringify(Object.keys(article).sort()) === JSON.stringify(['body', 'cat', 'date', 'ex', 'img', 'min', 'slug', 'title'].sort()),
    'the article has exactly the shape RAW_NEWS uses (cat, date, min, img, title, ex, body, slug)');
  ok(article?.slug === 'how-to-import-a-used-excavator-from-china', `the slug is the articleSlug() of the title (${article?.slug})`);
  ok(article?.title === 'How to Import a Used Excavator From China', 'the title is carried across');
  ok(article?.ex === desc, 'the meta description becomes the excerpt');
  ok(article?.cat === NEWS[0].cat, `the category is one NEWS_CATEGORIES (${article?.cat})`);
  ok(/^\/assets\//.test(article?.img || ''), `the image is an existing /assets/ path (${article?.img})`);
  ok(article?.min >= 2, `reading minutes are estimated (${article?.min})`);
  ok(/\w+ \d{2}, \d{4}/.test(article?.date || ''), `the date matches the NEWS format (${article?.date})`);
  ok($('.seo-json')?.textContent.includes('"slug"'), 'the JSON is shown on the page, selectable');
  ok(/sitemap-news\.xml/i.test(created.textContent), 'the dynamic news-sitemap endpoint is spelled out');

  const publishButton = $$('.seo-create-actions button').find(button => /publish reviewed draft/i.test(button.textContent));
  const reviewCheckbox = $('.seo-review-check input');
  ok(!!publishButton && publishButton.disabled, 'publishing is disabled until the reviewer checks the review gate');
  ok(!!reviewCheckbox, 'the desk requires an explicit human-review checkbox');
  if (reviewCheckbox) await click(reviewCheckbox);
  ok(!!publishButton && !publishButton.disabled, 'the publish action unlocks only after review is acknowledged');
  if (publishButton) await click(publishButton);
  ok(confirmCalls.length === 1 && /review/i.test(confirmCalls[0]), 'publication requires a second explicit confirmation');
  ok(patchBodies.length === 1 && patchBodies[0].published === true, 'publication is a separate authenticated PATCH');
  ok(siteArticleRows[0]?.published === true, 'only the confirmed publish action makes the article public');
}
say('\nDraft audit — the same engine, at the canonical path');
{
  const audit = $('.seo-draft-audit');
  ok(!!audit, 'the draft is audited after generation');
  ok(/news\/how-to-import-a-used-excavator-from-china/.test(audit.textContent), 'the audit is named after the canonical /news/<slug> path');
  const score = audit.querySelector('.seo-score-ring b')?.textContent;
  ok(score === '100', `a clean draft scores 100/100 as it will ship (got ${score})`);
  const checks = [...audit.querySelectorAll('.seo-checks li')];
  ok(checks.length >= 10, `the audit lists its checks (${checks.length})`);
  ok(checks.every(li => li.className === 'pass'), 'every check passes for a well-formed guide');
  const canonical = checks.find(li => /canonical/i.test(li.textContent));
  ok(!!canonical && canonical.textContent.includes('https://ar7traders.com/news/how-to-import-a-used-excavator-from-china'),
    'the canonical URL is the article\'s own absolute path');
}

say('\nStaff-tool and public-content guarantees');
{
  ok($('.seo-create'), 'the form stays available after publication — no navigation was forced');
  ok(siteArticleRows.length === 1 && getPublishedNews().some(a => a.title === 'How to Import a Used Excavator From China'),
    'the public news module hydrates the newly published row after the mocked CRUD refresh');
  ok(fetchCalls.every(call => call.url.startsWith('/')),
    'the browser-facing desk uses same-origin mock routes only and makes no live egress');
  ok(notifications.some(message => /Guide published/.test(message)), 'the operator receives a publication confirmation');
  const pageChecks = $$('.seo-card .seo-checks li').length;
  ok(pageChecks > 0, 'the desk\'s own page audit still renders beneath the creator');
}

say('\nThe og:image list only offers real assets');
{
  for (const asset of GUIDE_ASSETS) {
    ok(existsSync(path.join(root, 'public', asset.replace(/^\//, ''))), `${asset} exists in public/`);
  }
}

say('\nPure helpers agree with the UI');
{
  const factual = buildFactualDraft({title: 'Verified buyer note', cat: NEWS[0].cat, img: '/assets/og/help.jpg',
    facts: 'Current page lists model X and year 2022.\n- The supplier quote states FOB at the named port.'});
  ok(factual?.body.includes('Current page lists model X and year 2022.') && factual.body.includes('EDITOR REVIEW'),
    'the deterministic draft formatter uses only staff-provided facts and adds an explicit review reminder');
  ok(!buildFactualDraft({title: 'No facts', facts: '   '}), 'the formatter refuses to invent a draft without verified facts');
  const badCheck = validateGuide({title: '', cat: 'NOPE', img: '', desc: '', body: ''});
  ok(Object.keys(badCheck.errors).length >= 5, 'validateGuide refuses an empty form');
  const dup = validateGuide({title: 'How online bidding works with AR7', slug: 'ignored-custom-slug',
    cat: NEWS[0].cat, img: '/assets/og/auction.jpg', desc: 'x'.repeat(80), body: 'y'});
  ok(/already published/i.test(dup.errors.slug || ''), 'validateGuide detects duplicates from the stored title');
  const derived = validateGuide({title: 'A guide title', slug: 'custom-path', cat: NEWS[0].cat,
    img: '/assets/og/auction.jpg', desc: 'x'.repeat(80), body: 'y'});
  ok(derived.slug === 'a-guide-title', 'validateGuide ignores an unpersisted override and returns the title-derived slug');
  const dynamicCategory = validateGuide({title: 'New machinery guide', cat: 'MACHINERY',
    img: '/assets/og/auction.jpg', desc: 'x'.repeat(80), body: 'y'}, [{title: 'Old machine guide', slug: 'old-machine-guide', cat: 'MACHINERY'}]);
  ok(!dynamicCategory.errors.cat, 'categories already used by published site_articles rows remain valid');
  const built = buildArticle({title: 'T', cat: NEWS[0].cat, img: '/assets/og/auction.jpg', desc: 'd', body: 'b'}, 'the-slug', {now: new Date('2026-10-04T12:00:00Z')});
  ok(built.slug === 'the-slug' && built.date === 'Oct 04, 2026', 'buildArticle stamps the derived slug and date for the SEO audit');
}

console.log = realLog;
say(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
