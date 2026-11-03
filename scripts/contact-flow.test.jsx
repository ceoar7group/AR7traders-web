// Regression: ordinary contact is one direct, phone-required enquiry. The
// auction/vehicle dialogs remain separate and never hijack /contact. All POSTs
// are intercepted fixtures; no production enquiry or notification is sent.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body></body></html>', {
  url: 'https://ar7traders.com/contact', pretendToBeVisual: true,
});
const g = globalThis;
const setGlobal = (k, v) => { try { g[k] = v; } catch { Object.defineProperty(g, k, { value: v, writable: true, configurable: true }); } };
for (const [k, v] of Object.entries({
  window: dom.window, document: dom.window.document, navigator: dom.window.navigator,
  location: dom.window.location, history: dom.window.history,
  HTMLElement: dom.window.HTMLElement, Element: dom.window.Element, Node: dom.window.Node,
  Event: dom.window.Event, MouseEvent: dom.window.MouseEvent, KeyboardEvent: dom.window.KeyboardEvent,
  CustomEvent: dom.window.CustomEvent, PopStateEvent: dom.window.PopStateEvent,
  FormData: dom.window.FormData,
  getComputedStyle: dom.window.getComputedStyle,
  localStorage: dom.window.localStorage, sessionStorage: dom.window.sessionStorage,
  IS_REACT_ACT_ENVIRONMENT: true,
})) setGlobal(k, v);
setGlobal('requestAnimationFrame', cb => setTimeout(() => cb(Date.now()), 0));
setGlobal('cancelAnimationFrame', id => clearTimeout(id));
dom.window.scrollTo = () => {};
dom.window.HTMLElement.prototype.scrollIntoView = function () {};
dom.window.matchMedia = dom.window.matchMedia || (() => ({ matches: false, addEventListener() {}, removeEventListener() {} }));
dom.window.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} takeRecords() { return []; } };
dom.window.ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
setGlobal('scrollTo', dom.window.scrollTo);
setGlobal('matchMedia', dom.window.matchMedia);
setGlobal('IntersectionObserver', dom.window.IntersectionObserver);
setGlobal('ResizeObserver', dom.window.ResizeObserver);
setGlobal('addEventListener', dom.window.addEventListener.bind(dom.window));
setGlobal('removeEventListener', dom.window.removeEventListener.bind(dom.window));
setGlobal('dispatchEvent', dom.window.dispatchEvent.bind(dom.window));

const leadCalls = [];
let leadResponse = async () => ({ ok: true, status: 201, json: async () => ({ ok: true, id: 'lead-fixture-1' }) });
setGlobal('fetch', async (url, options = {}) => {
  if (String(url) === '/api/leads') {
    leadCalls.push(JSON.parse(options.body));
    return leadResponse();
  }
  return { ok: false, status: 404, json: async () => ({}), text: async () => '' };
});

const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { App } = await import('../src/main.jsx');
const { CurrencyProvider } = await import('../src/currency.jsx');
const { readFileSync } = await import('node:fs');

let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; process.stdout.write('  ✓ ' + msg + '\n'); } else { fail++; process.stderr.write('  ✗ ' + msg + '\n'); } };
const logs = [];
const realError = console.error;
console.error = (...args) => logs.push(args.map(String).join(' '));
const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 30)); }); };
const container = document.createElement('div');
document.body.appendChild(container);
const root = createRoot(container);
await act(async () => { root.render(React.createElement(CurrencyProvider, null, React.createElement(App))); });
await flush();

const goto = async path => {
  await act(async () => {
    dom.window.history.pushState({}, '', path);
    dom.window.dispatchEvent(new dom.window.PopStateEvent('popstate', { state: {} }));
  });
  await flush();
};
const contactForm = () => document.querySelector('.enquiry-form-contact form');
const setValue = (el, value) => {
  el.value = value;
  el.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
};
const fill = (form, { name = 'Fixture Buyer', email = 'fixture@example.test', phone = '+92 300 1234567', message = 'Please quote a Toyota Aqua to Karachi.' } = {}) => {
  setValue(form.querySelector('[name="name"]'), name);
  setValue(form.querySelector('[name="email"]'), email);
  setValue(form.querySelector('[name="phone"]'), phone);
  setValue(form.querySelector('[name="message"]'), message);
};
const submit = async form => {
  await act(async () => { form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); });
  await flush();
};
const click = async el => { await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); }); await flush(); };

process.stdout.write('\nContact form — direct submission, mandatory phone, honest states\n');
{
  const form = contactForm();
  ok(!!form, '/contact renders the ordinary contact form');
  ok(!document.querySelector('.modal-backdrop') && !document.querySelector('[role="dialog"]'), 'no auction-access modal opens on the contact page');
  ok(document.querySelectorAll('.enquiry-form').length === 1, 'there is exactly one enquiry form, not a second step');
  const phone = form.querySelector('[name="phone"]');
  ok(phone.required && phone.type === 'tel' && phone.inputMode === 'tel' && phone.autocomplete === 'tel', 'phone is required and uses telephone input semantics/autocomplete');
  const label = form.querySelector(`label[for="${phone.id}"]`);
  ok(label && /contact phone number/i.test(label.textContent) && /required/i.test(label.textContent), 'phone has a clear, associated required label');
  ok(/country code/i.test(form.querySelector(`#${phone.id}-hint`)?.textContent || ''), 'phone hint supports international formats');
  const controls = [...form.querySelectorAll('input:not([name="website"]),select,textarea')];
  ok(controls.every(el => form.querySelector(`label[for="${el.id}"]`)), 'every visible control has an associated label');

  const before = leadCalls.length;
  fill(form, { phone: '' });
  await submit(form);
  ok(leadCalls.length === before, 'missing phone blocks submission on the client');
  ok(form.querySelector('[name="phone"]').getAttribute('aria-invalid') === 'true' && /phone/i.test(form.textContent), 'missing phone shows an accessible field error');
  ok(!document.querySelector('.enquiry-success'), 'missing phone never shows success');

  setValue(form.querySelector('[name="phone"]'), '123');
  await submit(form);
  ok(leadCalls.length === before, 'an invalid short phone blocks submission on the client');

  fill(form);
  await submit(form);
  ok(leadCalls.length === before + 1, 'a valid phone allows one controlled submission');
  ok(leadCalls.at(-1).source === 'Website contact' && leadCalls.at(-1).phone === '+92 300 1234567', 'the direct contact payload carries the phone and contact source');
  ok(leadCalls.at(-1).message.includes('Toyota Aqua'), 'the message is submitted, not discarded');
  ok(document.querySelector('.enquiry-success[role="status"]') && /Enquiry received/.test(document.body.textContent), 'success is shown only after the API confirms a saved id');
  ok(!document.querySelector('.modal-backdrop'), 'successful contact submission still does not open auction access');
}

process.stdout.write('\nContact form — failures preserve input and never claim sent\n');
await click(document.querySelector('.enquiry-success button'));
for (const [label, response] of [
  ['server validation failure', async () => ({ ok: false, status: 400, json: async () => ({ error: 'Please enter a valid phone number.', field: 'phone' }) })],
  ['database unavailable', async () => ({ ok: false, status: 503, json: async () => ({ error: 'The enquiry service is temporarily unavailable.' }) })],
  ['2xx without persistence proof', async () => ({ ok: true, status: 200, json: async () => ({ ok: false }) })],
  ['network failure', async () => { throw new TypeError('Failed to fetch'); }],
]) {
  const form = contactForm();
  fill(form);
  leadResponse = response;
  await submit(form);
  ok(!document.querySelector('.enquiry-success'), `${label} never shows success`);
  ok(!!document.querySelector('.enquiry-alert[role="alert"]'), `${label} is surfaced clearly`);
  ok(contactForm().querySelector('[name="phone"]').value === '+92 300 1234567', `${label} preserves the entered phone for retry`);
}
leadResponse = async () => ({ ok: true, status: 201, json: async () => ({ ok: true, id: 'lead-fixture-2' }) });
{
  const form = contactForm();
  fill(form);
  let release;
  const pending = new Promise(r => { release = r; });
  leadResponse = () => pending.then(() => ({ ok: true, status: 201, json: async () => ({ ok: true, id: 'lead-fixture-3' }) }));
  const before = leadCalls.length;
  await act(async () => { form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); });
  ok(form.querySelector('button[type="submit"]').disabled, 'the submit button is disabled while saving');
  await act(async () => { form.dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })); });
  release();
  await flush();
  ok(leadCalls.length === before + 1, 'a double submit cannot create two leads');
}

process.stdout.write('\nAuction and vehicle enquiries stay separate\n');
await goto('/auction');
{
  const start = [...document.querySelectorAll('button')].find(b => /Get started/.test(b.textContent));
  await click(start);
  const dialog = document.querySelector('[role="dialog"]');
  ok(!!dialog && /auction access/i.test(dialog.textContent), 'the explicit auction CTA opens the distinct auction-access dialog');
  ok(dialog.querySelector('[name="phone"]').required, 'auction access also requires a contact phone');
  const before = leadCalls.length;
  await submit(dialog.querySelector('form'));
  ok(leadCalls.length === before && !document.querySelector('.enquiry-success'), 'auction access cannot submit without a phone');
  await act(async () => { dialog.dispatchEvent(new dom.window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })); });
  await flush();
  ok(!document.querySelector('[role="dialog"]'), 'Escape closes the auction dialog');
}
await goto('/inventory/AR7-26001');
{
  const enquire = [...document.querySelectorAll('button')].find(b => /Enquire now/.test(b.textContent));
  await click(enquire);
  const dialog = document.querySelector('[role="dialog"]');
  ok(!!dialog && /Enquire about this vehicle/.test(dialog.textContent), 'vehicle enquiry is labelled as a vehicle enquiry, not auction access');
  ok(/Rolls-Royce Ghost/.test(dialog.querySelector('[name="vehicle_interest"]').value), 'vehicle enquiry keeps the stock context');
  ok(dialog.querySelector('[name="phone"]').required, 'vehicle enquiry requires a phone');
  fill(dialog.querySelector('form'));
  await submit(dialog.querySelector('form'));
  ok(leadCalls.at(-1).source === 'Vehicle enquiry', 'vehicle enquiry is tagged distinctly in the lead payload');
}

process.stdout.write('\nMobile/accessibility contracts\n');
{
  const css = readFileSync('src/enquiry-form.css', 'utf8');
  ok(/@media\(max-width:650px\)\{[\s\S]*?\.enquiry-row\{grid-template-columns:1fr\}/.test(css), 'phone layout stacks the two-column rows');
  ok(/\.enquiry-form input,\.enquiry-form select,\.enquiry-form textarea\{[\s\S]*?font:500 16px/.test(css), 'mobile inputs use 16px text to avoid iOS zoom');
  ok(/\.enquiry-form input,\.enquiry-form select\{min-height:48px/.test(css), 'inputs meet a comfortable touch height');
  ok(!logs.some(line => line.includes('fixture@example.test') || line.includes('300 1234567')), 'client failure paths do not log personal details');
}

await act(async () => { root.unmount(); });
console.error = realError;
process.stdout.write(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
