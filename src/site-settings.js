// Contact details the CRM controls.
//
// The website asks /api/settings once on load. Whatever the CRM has saved wins;
// these fallbacks only ever show if the API is unreachable (e.g. someone opened
// the built files straight off disk), so the page never renders blank contacts.
import {useEffect, useState} from 'react';

export const FALLBACK = {
  contact_email: 'info@ar7traders.com',
  contact_phone: '+81 80 0000 7007',
  contact_address: 'Tokyo, Japan',
  whatsapp_number: '+818000007007',
  whatsapp_message: 'Hello AR7 Traders, I would like help sourcing a vehicle.',
  enquiry_inbox: 'info@ar7traders.com'
};

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
      listeners.forEach(fn => fn(cache));
      return cache;
    });
  return inflight;
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
