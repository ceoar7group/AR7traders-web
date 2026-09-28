// Contact details the CRM controls.
//
// The website asks /api/settings once on load. Whatever the CRM has saved wins;
// these fallbacks only ever show if the API is unreachable (e.g. someone opened
// the built files straight off disk), so the page never renders blank contacts.
//
// PUBLIC_CONTACTS are the owner-confirmed defaults (2026-09-28):
//   ar7tradersinfo@gmail.com · +44 7347 132624 · wa.me/447347132624
// They replace the earlier Japanese placeholder details, which must never
// reappear in any public surface.
//
// STATIC SYNC — index.html, public/llms.txt and public/404.html carry the same
// details for crawlers and no-JS visitors. They cannot import this module, so
// scripts/contacts.test.mjs (npm run test:contacts) fails the build if any of
// them drifts from PUBLIC_CONTACTS. When the owner changes contacts in the CRM,
// runtime content updates immediately; update these static files (and the
// AutoDealer JSON-LD) in the same change — see SEO-SUBMIT.md.
import {useEffect, useState} from 'react';

export const PUBLIC_CONTACTS = {
  contact_email: 'ar7tradersinfo@gmail.com',
  contact_phone: '+44 7347 132624',
  contact_address: 'Tokyo, Japan',
  whatsapp_number: '+447347132624',
  whatsapp_message: 'Hello AR7 Traders, I would like help sourcing a vehicle.',
  enquiry_inbox: 'ar7tradersinfo@gmail.com'
};

export const FALLBACK = {...PUBLIC_CONTACTS};

let cache = null;
let inflight = null;
const listeners = new Set();

export function getSettings() {
  return cache || FALLBACK;
}

export function loadSettings() {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = fetch('/api/settings')
    .then(r => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then(data => {
      cache = {...FALLBACK, ...Object.fromEntries(
        Object.entries(data || {}).filter(([, v]) => v !== null && v !== '')
      )};
      if (typeof document !== 'undefined') syncBusinessJsonLd(cache);
      listeners.forEach(fn => fn(cache));
      return cache;
    });
  return inflight;
}

/** Test-only: forget the cached settings so the next loadSettings() re-fetches. */
export function resetSettingsForTests() {
  cache = null;
  inflight = null;
  listeners.clear();
}

/**
 * Keeps the static AutoDealer JSON-LD (index.html, <script id="business-jsonld">)
 * in step with the loaded CRM settings: updates contact fields IN PLACE on the
 * existing node. Never adds a second business node and never touches unrelated
 * @graph items. The static file already carries the confirmed defaults, so any
 * failure here simply leaves those correct values untouched.
 */
export function syncBusinessJsonLd(settings) {
  try {
    const el = typeof document !== 'undefined' ? document.getElementById('business-jsonld') : null;
    if (!el) return;
    const data = JSON.parse(el.textContent);
    const graph = Array.isArray(data?.['@graph']) ? data['@graph'] : [data];
    let touched = false;
    for (const node of graph) {
      if (!node || node['@type'] !== 'AutoDealer') continue;
      const points = Array.isArray(node.contactPoint) ? node.contactPoint : [];
      if (settings.contact_email) {
        node.email = settings.contact_email;
        points.forEach(cp => { if (cp && 'email' in cp) cp.email = settings.contact_email; });
        touched = true;
      }
      if (settings.contact_phone) {
        node.telephone = settings.contact_phone;
        points.forEach(cp => { if (cp && 'telephone' in cp) cp.telephone = settings.contact_phone; });
        touched = true;
      }
      if (settings.whatsapp_number) {
        const wa = 'https://wa.me/' + waDigits(settings.whatsapp_number);
        points.forEach(cp => { if (cp && typeof cp.url === 'string' && cp.url.includes('wa.me/')) cp.url = wa; });
        touched = true;
      }
    }
    if (touched) el.textContent = JSON.stringify(data, null, 2);
  } catch { /* keep the static (already confirmed) values */ }
}

/** Live contact details. Re-renders the component once the real values land. */
export function useSettings() {
  const [value, setValue] = useState(() => getSettings());
  useEffect(() => {
    let alive = true;
    listeners.add(setValue);
    loadSettings().then(s => { if (alive) setValue(s); });
    return () => { alive = false; listeners.delete(setValue); };
  }, []);
  return value;
}

/** Digits only — what wa.me expects. */
export const waDigits = n => String(n || '').replace(/\D/g, '');

/** tel: href — keeps a leading + so mobiles dial internationally. */
export const telHref = n => 'tel:' + String(n || '').replace(/[^\d+]/g, '');

export const waLink = (number, message) =>
  'https://wa.me/' + waDigits(number) +
  (message ? '?text=' + encodeURIComponent(message) : '');
