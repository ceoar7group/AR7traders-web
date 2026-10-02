// Contact-consistency regression suite (npm run test:contacts).
//
// The owner confirmed one set of public contact details:
//   ar7tradersinfo@gmail.com · +44 7347 132624 · tel:+447347132624 · wa.me/447347132624
// These tests keep every surface that can show contacts agreeing:
//   • runtime fallbacks (src/site-settings.js PUBLIC_CONTACTS / FALLBACK)
//   • static HTML (index.html JSON-LD + crawler preview + noscript)
//   • public/llms.txt and public/404.html
//   • CRM overrides, delayed/failed/empty/partial /api/settings responses
//   • the runtime AutoDealer JSON-LD sync (no duplicate nodes, graph preserved)
// and fail if any obsolete placeholder (info@ar7traders.com, +81 80 0000 7007,
// 818000007007) reappears in active source or generated output.
import { JSDOM } from 'jsdom';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(dir, '..');

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'https://ar7traders.com/'
});
globalThis.window = dom.window;
globalThis.document = dom.window.document;

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error('FAIL:', msg); } else console.log('ok  :', msg); };

const {
  PUBLIC_CONTACTS, FALLBACK, waDigits, telHref, waLink,
  loadSettings, getSettings, resetSettingsForTests, syncBusinessJsonLd
} = await import('../src/site-settings.js');

// ---- confirmed defaults -----------------------------------------------------
ok(PUBLIC_CONTACTS.contact_email === 'ar7tradersinfo@gmail.com', 'default contact email is the confirmed address');
ok(PUBLIC_CONTACTS.contact_phone === '+44 7347 132624', 'default phone display is the confirmed UK number');
ok(PUBLIC_CONTACTS.whatsapp_number.replace(/\D/g, '') === '447347132624', 'default WhatsApp number is the confirmed UK number');
ok(PUBLIC_CONTACTS.enquiry_inbox === 'ar7tradersinfo@gmail.com', 'default enquiry inbox is the confirmed address');
ok(FALLBACK.contact_email === PUBLIC_CONTACTS.contact_email, 'FALLBACK mirrors PUBLIC_CONTACTS');

// ---- link encoding ----------------------------------------------------------
ok(telHref(PUBLIC_CONTACTS.contact_phone) === 'tel:+447347132624', 'tel: href is the confirmed international form');
ok(waDigits(PUBLIC_CONTACTS.whatsapp_number) === '447347132624', 'wa.me digits match the confirmed WhatsApp number');
ok(waLink(PUBLIC_CONTACTS.whatsapp_number) === 'https://wa.me/447347132624', 'WhatsApp link is https://wa.me/447347132624');
ok(waLink(PUBLIC_CONTACTS.whatsapp_number, 'Hello there') === 'https://wa.me/447347132624?text=' + encodeURIComponent('Hello there'),
  'WhatsApp pre-filled message is URL-encoded');
ok(telHref(null) === 'tel:' && waLink(null) === 'https://wa.me/', 'helpers survive missing numbers without throwing');

// ---- obsolete placeholders must not come back -------------------------------
const OBSOLETE = ['info@ar7traders.com', '+81 80 0000 7007', '+81-80-0000-7007', '818000007007'];
const ACTIVE_SURFACES = [
  ['src/site-settings.js', readFileSync(path.join(root, 'src/site-settings.js'), 'utf8')],
  ['src/main.jsx', readFileSync(path.join(root, 'src/main.jsx'), 'utf8')],
  ['src/vehicle-actions.jsx', readFileSync(path.join(root, 'src/vehicle-actions.jsx'), 'utf8')],
  ['index.html', readFileSync(path.join(root, 'index.html'), 'utf8')],
  ['public/llms.txt', readFileSync(path.join(root, 'public/llms.txt'), 'utf8')],
  ['public/404.html', readFileSync(path.join(root, 'public/404.html'), 'utf8')]
];
if (existsSync(path.join(root, 'dist/index.html'))) {
  ACTIVE_SURFACES.push(['dist/index.html (generated)', readFileSync(path.join(root, 'dist/index.html'), 'utf8')]);
  if (existsSync(path.join(root, 'dist/llms.txt')))
    ACTIVE_SURFACES.push(['dist/llms.txt (generated)', readFileSync(path.join(root, 'dist/llms.txt'), 'utf8')]);
}
for (const [name, src] of ACTIVE_SURFACES) {
  for (const bad of OBSOLETE) {
    ok(!src.includes(bad), `${name} contains no obsolete contact "${bad}"`);
  }
}

// ---- static files agree with the confirmed contacts --------------------------
const indexHtml = ACTIVE_SURFACES.find(([n]) => n === 'index.html')[1];
ok(indexHtml.includes('mailto:ar7tradersinfo@gmail.com'), 'index.html static preview links the confirmed email');
ok(indexHtml.includes('tel:+447347132624'), 'index.html static preview links tel:+447347132624');
ok(indexHtml.includes('+44 7347 132624'), 'index.html shows the confirmed phone display form');
const noscript = indexHtml.split('<noscript>')[1] || '';
ok(noscript.includes('ar7tradersinfo@gmail.com'), 'noscript fallback names the confirmed email');

const llms = ACTIVE_SURFACES.find(([n]) => n === 'public/llms.txt')[1];
ok(llms.includes('ar7tradersinfo@gmail.com'), 'llms.txt lists the confirmed email');
ok(llms.includes('+44 7347 132624'), 'llms.txt lists the confirmed phone');
ok(llms.includes('https://wa.me/447347132624'), 'llms.txt lists the confirmed WhatsApp link');

const page404 = ACTIVE_SURFACES.find(([n]) => n === 'public/404.html')[1];
ok(page404.includes('ar7tradersinfo@gmail.com'), '404.html names the confirmed email');

// ---- static AutoDealer JSON-LD matches ---------------------------------------
const ldMatch = indexHtml.match(/<script type="application\/ld\+json" id="business-jsonld">([\s\S]*?)<\/script>/);
ok(!!ldMatch, 'index.html business JSON-LD is tagged id="business-jsonld" so runtime sync can find it');
if (ldMatch) {
  const graph = JSON.parse(ldMatch[1]);
  const dealer = (graph['@graph'] || []).filter(n => n['@type'] === 'AutoDealer');
  ok(dealer.length === 1, 'exactly one AutoDealer node in the static graph');
  ok(dealer[0].email === PUBLIC_CONTACTS.contact_email, 'static AutoDealer email is the confirmed address');
  ok(dealer[0].telephone === PUBLIC_CONTACTS.contact_phone, 'static AutoDealer telephone is the confirmed number');
  const waPoint = (dealer[0].contactPoint || []).find(cp => String(cp.url || '').includes('wa.me/'));
  ok(waPoint?.url === 'https://wa.me/447347132624', 'static sales contactPoint links the confirmed WhatsApp');
  const badPoint = (dealer[0].contactPoint || []).find(cp => cp.email && cp.email !== PUBLIC_CONTACTS.contact_email);
  ok(!badPoint, 'no contactPoint carries an unconfirmed email');
}

// ---- runtime settings behavior ------------------------------------------------
async function withFetch(mock, fn) {
  const real = globalThis.fetch;
  globalThis.fetch = mock;
  resetSettingsForTests();
  try { return await fn(); } finally { globalThis.fetch = real; resetSettingsForTests(); }
}

// Before anything loads (initial paint / crawler without JS): confirmed defaults.
ok(getSettings().contact_email === 'ar7tradersinfo@gmail.com' && getSettings().whatsapp_number === '+447347132624',
  'initial (pre-fetch) settings are the confirmed defaults');

// Successful CRM override wins for the keys it provides.
await withFetch(async () => ({ ok: true, json: async () => ({
  contact_email: 'sales@ar7traders.example', contact_phone: '+92 300 1234567', whatsapp_number: '+923001234567'
}) }), async () => {
  const s = await loadSettings();
  ok(s.contact_email === 'sales@ar7traders.example', 'CRM email override wins at runtime');
  ok(s.contact_phone === '+92 300 1234567', 'CRM phone override wins at runtime');
  ok(telHref(s.contact_phone) === 'tel:+923001234567', 'overridden phone still encodes a valid tel: link');
  ok(s.whatsapp_number === '+923001234567' && waLink(s.whatsapp_number) === 'https://wa.me/923001234567',
    'overridden WhatsApp still encodes a valid wa.me link');
  ok(s.contact_address === PUBLIC_CONTACTS.contact_address, 'keys the CRM did not send keep the confirmed defaults');
});

// Empty response → all defaults.
await withFetch(async () => ({ ok: true, json: async () => ({}) }), async () => {
  const s = await loadSettings();
  ok(s.contact_email === 'ar7tradersinfo@gmail.com', 'empty settings response keeps confirmed defaults');
});

// Partial response → provided keys override, missing keys fall back.
await withFetch(async () => ({ ok: true, json: async () => ({ contact_phone: '+44 20 0000 0000' }) }), async () => {
  const s = await loadSettings();
  ok(s.contact_phone === '+44 20 0000 0000' && s.contact_email === 'ar7tradersinfo@gmail.com',
    'partial response overrides only the provided key');
});

// Blank/null values are dropped so the UI never renders an empty contact.
await withFetch(async () => ({ ok: true, json: async () => ({ contact_email: '', whatsapp_number: null }) }), async () => {
  const s = await loadSettings();
  ok(s.contact_email === 'ar7tradersinfo@gmail.com' && s.whatsapp_number === '+447347132624',
    'blank/null CRM values fall back to confirmed contacts');
});

// HTTP failure and network failure → defaults (never blank contacts).
await withFetch(async () => ({ ok: false, status: 500, json: async () => ({}) }), async () => {
  const s = await loadSettings();
  ok(s.contact_phone === '+44 7347 132624', 'HTTP 500 from /api/settings keeps confirmed defaults');
});
await withFetch(async () => { throw new Error('offline'); }, async () => {
  const s = await loadSettings();
  ok(s.enquiry_inbox === 'ar7tradersinfo@gmail.com', 'network failure keeps confirmed defaults');
});

// Delayed response: confirmed defaults are correct while the request is pending.
await withFetch(() => new Promise(resolve => setTimeout(() => resolve({ ok: true, json: async () => ({ contact_email: 'late@ar7traders.example' }) }), 25)), async () => {
  const p = loadSettings();
  ok(getSettings().contact_email === 'ar7tradersinfo@gmail.com', 'pending settings show confirmed defaults, not blanks');
  const s = await p;
  ok(s.contact_email === 'late@ar7traders.example', 'late CRM values replace the defaults once they land');
});

// ---- runtime AutoDealer JSON-LD sync ------------------------------------------
{
  document.head.innerHTML = `<script type="application/ld+json" id="business-jsonld">${
    JSON.stringify({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'AutoDealer', '@id': 'https://ar7traders.com/#business', name: 'AR7 Traders',
          email: 'old@example.com', telephone: '+81-80-0000-7007',
          contactPoint: [
            { '@type': 'ContactPoint', contactType: 'customer service', email: 'old@example.com', telephone: '+81-80-0000-7007' },
            { '@type': 'ContactPoint', contactType: 'sales', telephone: '+81-80-0000-7007', url: 'https://wa.me/818000007007' }
          ] },
        { '@type': 'WebSite', '@id': 'https://ar7traders.com/#website', name: 'AR7 Traders' },
        { '@type': 'FAQPage', mainEntity: [] }
      ]
    })}</script>`;
  syncBusinessJsonLd({ contact_email: 'crm@ar7traders.example', contact_phone: '+44 7347 132624', whatsapp_number: '+447347132624' });
  const data = JSON.parse(document.getElementById('business-jsonld').textContent);
  const dealers = (data['@graph'] || []).filter(n => n['@type'] === 'AutoDealer');
  ok(dealers.length === 1, 'sync does not duplicate the AutoDealer node');
  ok(dealers[0].email === 'crm@ar7traders.example', 'sync updates the AutoDealer email');
  ok(dealers[0].telephone === '+44 7347 132624', 'sync updates the AutoDealer telephone');
  ok(data['@graph'].length === 3, 'sync preserves unrelated graph items (WebSite, FAQPage)');
  ok(dealers[0].contactPoint[0].email === 'crm@ar7traders.example', 'sync updates contactPoint email');
  ok(dealers[0].contactPoint[1].url === 'https://wa.me/447347132624', 'sync rewrites only wa.me contactPoint URLs');
  ok(data['@graph'][1]['@type'] === 'WebSite' && data['@graph'][2]['@type'] === 'FAQPage', 'WebSite/FAQ nodes untouched');
  // A malformed script must not throw and must not blank the node.
  document.getElementById('business-jsonld').textContent = '{not json';
  syncBusinessJsonLd({ contact_email: 'x@y.example' });
  ok(document.getElementById('business-jsonld').textContent === '{not json', 'sync leaves a malformed JSON-LD block alone');
}

console.log(failed ? `\n${failed} FAILURES` : '\nALL PASS');
process.exit(failed ? 1 : 0);
