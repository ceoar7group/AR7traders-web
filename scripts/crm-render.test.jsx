// CRM render test (npm run test:crm).
//
// Mounts the real <CrmApp/> in demo mode inside jsdom and walks the sidebar.
// The API-side authorization contract is pinned by crm-authz.test.mjs; this
// covers the half a server test cannot see: that the permission grid shows
// every permission the API enforces, and that each tab the sidebar offers
// actually renders instead of throwing.
import { JSDOM } from 'jsdom';

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
  url: 'https://ar7traders.com/crm',
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
setGlobal('fetch', () => Promise.resolve({ ok: false, status: 404, json: async () => ({}), text: async () => '' }));

const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');
const { default: CrmApp } = await import('../src/crm.jsx');

let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
const bad = s => process.stderr.write(s + '\n');
const ok = (cond, msg) => { if (cond) { pass++; say('  ✓ ' + msg); } else { fail++; bad('  ✗ ' + msg); } };

const errors = [];
const realError = console.error, realWarn = console.warn;
console.error = (...a) => { errors.push(a.map(String).join(' ')); };
console.warn = () => {};

const container = document.getElementById('root');
const root = createRoot(container);
await act(async () => { root.render(React.createElement(CrmApp)); });

// Tabs that show a count render it inside the button, so the button's own
// textContent is "Leads29" — match the label span instead.
const clickText = async (selector, text) => {
  const el = [...document.querySelectorAll(selector)].find(e =>
    (e.querySelector(':scope > span')?.textContent || e.textContent || '').trim() === text);
  if (!el) return null;
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); });
  return el;
};

say('\nCRM boots');
ok(!!document.querySelector('.crm-shell'), 'the CRM shell mounts in demo mode');
ok(document.querySelector('.crm-side nav button'), 'the sidebar renders its tabs');

// ---- every sidebar tab renders ---------------------------------------------
say('\nEvery sidebar tab renders');
const TABS = ['Overview', 'Leads', 'Customers', 'Customer accounts', 'Inventory', 'Profit & sourcing',
  'Japan dealer stock', 'Quotes', 'Shipments', 'Tasks', 'Website cars', 'Shipping routes',
  'News & guides', 'Approvals', 'Team & permissions', 'People & payroll', 'Website settings',
  'Activity log'];
for (const label of TABS) {
  const btn = await clickText('.crm-side nav button', label);
  if (!btn) { ok(false, `"${label}" tab is missing from the sidebar`); continue; }
  const heading = document.querySelector('.crm-top-title h1')?.textContent || '';
  const main = document.querySelector('.crm-main');
  ok(!!main && main.children.length > 0 && !/failed to load/i.test(document.body.textContent),
    `"${label}" renders (heading: ${heading.trim()})`);
  if (label === 'Customer accounts') {
    // These four KPIs read NaN straight onto the screen when sum() was called
    // without an accumulator, and "Lifetime revenue" quietly showed $0.
    const kpis = [...document.querySelectorAll('.acc-kpis article')]
      .map(a => [a.querySelector('span')?.textContent, a.querySelector('b')?.textContent || '']);
    for (const [name, value] of kpis)
      ok(!/NaN|undefined|null/.test(value), `the "${name}" KPI renders a real figure ("${value}")`);
    const revenue = kpis.find(([n]) => /revenue/i.test(n))?.[1] || '';
    ok(/\$[\d,]+/.test(revenue) && revenue !== '$0', `lifetime revenue is summed, not collapsed to zero (${revenue})`);
  }
}

// ---- the permission grid matches what the API enforces ----------------------
say('\nTeam & permissions grid');
await clickText('.crm-side nav button', 'Team & permissions');
const gridRows = [...document.querySelectorAll('.perm-table tbody tr')];
const rowLabels = gridRows.map(r => r.querySelector('td')?.textContent?.trim());
const colsPerRow = gridRows.map(r => r.querySelectorAll('.perm-cell').length);

// The permissions the API actually checks. If a permission is enforced by an
// endpoint but missing from the grid, an admin cannot grant or revoke it.
const ENFORCED = [
  'Add / edit leads', 'Add / edit customers', 'Add / edit inventory', 'Add / edit orders',
  'Record & apply payments', 'Add / edit quotes', 'Add / edit shipments', 'Add / edit tasks',
  'Edit the public website', 'Manage team members', 'Approve or reject requests',
  'Delete without approval', 'Open a customer account', 'Change website settings',
  'View staff & performance', 'Add / edit staff records', 'View salaries & payslips',
  'Run payroll & mark paid'
];
for (const label of ENFORCED) ok(rowLabels.includes(label), `the grid has a row for "${label}"`);
ok(gridRows.length === ENFORCED.length,
  `the grid has exactly the enforced permissions (${gridRows.length} rows / ${ENFORCED.length} enforced)`);
ok(colsPerRow.every(n => n === 5), 'every permission row has a box for each of the 5 roles');
const adminBoxes = gridRows.map(r => r.querySelectorAll('.perm-cell input')[0]);
ok(adminBoxes.every(b => b.checked && b.disabled), 'the admin column is ticked and locked on every row');

// ---- React logged nothing ---------------------------------------------------
console.error = realError; console.warn = realWarn;
const real = errors.filter(e => !/not wrapped in act|Not implemented|jsdom/i.test(e));
ok(real.length === 0, `nothing was logged as an error${real.length ? ': ' + real.slice(0, 3).join(' || ').slice(0, 900) : ''}`);

await act(async () => { root.unmount(); });
say(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
