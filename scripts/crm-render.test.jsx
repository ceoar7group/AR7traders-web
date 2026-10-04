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
const eq = (a, b, msg) => ok(a === b, a === b ? msg : `${msg} (expected ${JSON.stringify(b)}, got ${JSON.stringify(a)})`);

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
  'News & guides', 'Machinery desk', 'Approvals', 'Team & permissions', 'People & payroll', 'Website settings',
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

// ---- the Goo-net import assistant -------------------------------------------
// The assistant writes nothing until an explicit Import, so its render-level
// contract is: it exists for staff who can write stock, it stays closed until
// opened, and Import is dead until a server preview has been produced.
say('\nGoo-net import assistant');
await clickText('.crm-side nav button', 'Japan dealer stock');
const importToggle = document.querySelector('.crm-goonet .crm-import-toggle');
ok(!!importToggle, 'the Japan dealer stock tab offers "Import from Goo-net URLs"');
ok(!document.querySelector('.crm-goonet .crm-import-body'), 'the assistant is closed until it is opened');
if (importToggle) {
  await act(async () => { importToggle.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); });
  const body = document.querySelector('.crm-goonet .crm-import-body');
  ok(!!body, 'opening it reveals the paste box');
  const area = body?.querySelector('textarea');
  ok(!!area, 'there is a textarea for the URLs');
  const buttons = [...(body?.querySelectorAll('.crm-import-actions button') || [])];
  ok(buttons.length === 3, `it offers Preview, Import and Clear (${buttons.map(b => b.textContent.trim()).join(' / ')})`);
  const importBtn = buttons.find(b => /Import/.test(b.textContent));
  ok(importBtn && importBtn.disabled, 'Import is disabled before anything has been previewed');
  const previewBtn = buttons.find(b => /Preview/.test(b.textContent));
  ok(previewBtn && previewBtn.disabled, 'Preview is disabled while the box is empty');
  if (area) {
    // React tracks the textarea value, so set it through the native setter.
    const setValue = Object.getOwnPropertyDescriptor(dom.window.HTMLTextAreaElement.prototype, 'value').set;
    await act(async () => {
      setValue.call(area, 'https://www.goo-net.com/usedcar/spread/goo/15/988026092600206860001.html');
      area.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
    });
    const after = [...body.querySelectorAll('.crm-import-actions button')];
    ok(!after.find(b => /Preview/.test(b.textContent))?.disabled, 'Preview wakes up once a URL is pasted');
    ok(after.find(b => /Import/.test(b.textContent))?.disabled, 'Import stays disabled until the server has previewed the list');
    if (previewBtn) {
      await act(async () => { after.find(b => /Preview/.test(b.textContent)).dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); });
      const notice = document.querySelector('.crm-notice span')?.textContent || '';
      ok(/demo mode/i.test(notice), `in demo mode Preview explains itself instead of faking a fetch ("${notice}")`);
    }
  }
}

// ---- "already added" is visible on the Japan dealer stock row ---------------
// The owner's ask: once an imported car has been added to the inventory, the
// CRM must say so on the row instead of offering to add it again. The demo
// seed has one car promoted to the website (g2) and one to the inventory (g4),
// and two unpromoted ones (g1, g3) — exactly the four states to pin.
say('\nJapan dealer stock: "already added" state');
await clickText('.crm-side nav button', 'Japan dealer stock');
{
  const rowsOf = () => [...document.querySelectorAll('.crm-goonet tbody tr')];
  const rowFor = model => rowsOf().find(tr => (tr.textContent || '').includes(model));
  const actionsOf = model => [...(rowFor(model)?.querySelectorAll('.goonet-actions button') || [])];
  const labelOf = model => rowFor(model)?.querySelector('td:nth-child(10) em')?.textContent?.trim() || '';

  const g2 = rowFor('Harrier Z Leather Package');
  const g4 = rowFor('Vezel Hybrid Z Honda Sensing');
  ok(!!g2 && !!g4, 'the imported rows render');
  // The demo seed mirrors the live database: those cars are also in the website
  // listings, so "on the website" is read from the Website cars records, not
  // only from the row's flag.
  eq(labelOf('Harrier Z Leather Package'), 'On website', 'a car on the website shows as "On website"');
  eq(labelOf('Vezel Hybrid Z Honda Sensing'), 'Website + inventory',
    'a car in both places shows both, read from the records themselves');
  const g2Website = actionsOf('Harrier Z Leather Package').find(b => /On website/.test(b.textContent));
  const g4Inventory = actionsOf('Vezel Hybrid Z Honda Sensing').find(b => /In inventory/.test(b.textContent));
  ok(g2Website && g2Website.disabled, 'the Website button is replaced by a disabled "On website" confirmation');
  ok(g4Inventory && g4Inventory.disabled, 'the Inventory button is replaced by a disabled "In inventory" confirmation');
  ok(/already/i.test(g4Inventory?.getAttribute('title') || ''), 'the title says it is already there, and where to find it');

  // Pressing Inventory on a car that is not in the inventory adds it and flips
  // the row to the "already added" state right away.
  const realConfirm = dom.window.confirm;
  dom.window.confirm = () => true;
  const before = actionsOf('Harrier S').find(b => /Inventory/.test(b.textContent));
  ok(!!before && !before.disabled, 'a car that is not in the inventory still offers the Inventory action');
  await act(async () => { before.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); });
  let notice = document.querySelector('.crm-notice span')?.textContent || '';
  ok(/inventory/i.test(notice) && !/already/i.test(notice), `the notice reports the add ("${notice}")`);
  eq(labelOf('Harrier S'), 'Website + inventory', 'the row shows the added state immediately');
  const after = actionsOf('Harrier S').find(b => /In inventory/.test(b.textContent));
  ok(after && after.disabled, 'and the action is replaced by the confirmation, so it cannot be added twice');
  ok([...document.querySelectorAll('.crm-goonet tbody tr')].filter(tr => (tr.textContent || '').includes('Harrier S')).length === 1,
    'no duplicate row appears for the same car');

  // A car in NEITHER place shows no promoted state and offers both actions —
  // built by adding a row to the demo list and asking the CRM to refresh, which
  // is the same code path the Refresh button uses.
  const stored = JSON.parse(dom.window.localStorage.getItem('ar7-crm-goonet') || '[]');
  dom.window.localStorage.setItem('ar7-crm-goonet', JSON.stringify([...stored, {
    id: 'g9', goonet_id: 'TEST-STOCK-9', stock_no: 'TEST-STOCK-9', make: 'Subaru', model: 'Forester Test',
    year: 2021, km: '30,000', fuel: 'Petrol', body: 'SUV', price: '$19,000', price_usd: 19000,
    status: 'New Arrival', location: 'Saitama', available: true, promoted: 'none',
    imported_at: '2026-10-01T09:00:00Z', photo_count: 6, quality_score: 80,
    images: ['/assets/ar7-mark.png']
  }]));
  const refresh = [...document.querySelectorAll('.crm-goonet .crm-tools button')]
    .find(b => (b.getAttribute('title') || '').includes('Refresh records'));
  await act(async () => { refresh?.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); });
  ok(!!rowFor('Forester Test'), 'the refreshed list shows the new car');
  eq(labelOf('Forester Test'), '—', 'a car in neither place shows no promoted state');
  const freshActions = actionsOf('Forester Test').map(b => b.textContent.trim());
  ok(freshActions.some(t => /^Website$/.test(t)) && freshActions.some(t => /^Inventory$/.test(t)),
    `both actions are offered for a car that has not been copied yet (${freshActions.join(' / ')})`);

  const subaru = actionsOf('Forester Test').find(b => /Inventory/.test(b.textContent));
  await act(async () => { subaru.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); });
  notice = document.querySelector('.crm-notice span')?.textContent || '';
  ok(/inventory/i.test(notice), `the add is confirmed in words ("${notice}")`);
  eq(labelOf('Forester Test'), 'In inventory', 'and the row is now marked as added');
  ok(!!actionsOf('Forester Test').find(b => /In inventory/.test(b.textContent))?.disabled,
    'pressing it again is not possible — the CRM cannot copy the same car twice');
  dom.window.confirm = realConfirm;
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

// ---- the machinery desk ---------------------------------------------------
// The owner's acceptance criteria, at the level only a render test can see:
// every machine is listed, and the table says who added it and who (or what)
// published it.
say('\nMachinery desk');
await clickText('.crm-side nav button', 'Machinery desk');
{
  const heads = [...document.querySelectorAll('.crm-table-wrap table thead th')]
    .map(th => (th.textContent || '').trim());
  ok(heads.some(h => /added\s*by/i.test(h)), `the table has an "Added by" column (${heads.join(' | ')})`);
  ok(heads.some(h => /published\s*by/i.test(h)), 'the table has a "Published by" column');
  ok(heads.some(h => /ref/i.test(h)), 'the table has a Reference column');

  if (!document.querySelector('.crm-table-wrap')) {
    const main = document.querySelector('.crm-main');
  }
  const bodyRows = [...document.querySelectorAll('.crm-table-wrap table tbody tr')];
  ok(bodyRows.length > 0, `the desk lists machines in demo mode (${bodyRows.length} rows)`);

  // Every row must be able to answer "who added it" and "who published it".
  const blankAttribution = bodyRows.filter(tr => {
    const cells = [...tr.querySelectorAll('td')].map(td => (td.textContent || '').trim());
    return cells.some(c => c === 'undefined' || c === 'null');
  });
  ok(blankAttribution.length === 0,
    `no row prints "undefined" or "null" for who added or published it${blankAttribution.length ? ` (${blankAttribution.length} bad)` : ''}`);

  // Every machine in the database is listed — that is the policy. So a row
  // must offer Unpublish (the deliberate act) rather than Publish (approval).
  const unpublish = [...document.querySelectorAll('.crm-row-actions button')]
    .filter(b => /unpublish/i.test(b.textContent || ''));
  ok(unpublish.length > 0, `published machines offer Unpublish (${unpublish.length} buttons)`);
  const publish = [...document.querySelectorAll('.crm-row-actions button')]
    .filter(b => /^\s*publish\s*$/i.test(b.textContent || ''));
  ok(publish.length === 0, 'no machine is waiting behind a Publish approval step');

  ok([...document.querySelectorAll('.crm-row-actions button')].some(b => /photos/i.test(b.textContent || '')),
    'each row can open the photo editor');
}

// ---- machinery photos need a rights basis ----------------------------------
// A photograph without a recorded reason we may use it must never reach the
// website. The editor is where that is enforced in the UI: every photo gets a
// rights dropdown, and a photo with none chosen is visibly held back rather
// than silently published.
say('\nMachinery photo rights');
{
  const photosBtn = [...document.querySelectorAll('.crm-row-actions button')]
    .find(b => /photos/i.test(b.textContent || ''));
  ok(!!photosBtn, 'the photo editor button is present');
  if (photosBtn) {
    await act(async () => { photosBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); });
    const modal = document.querySelector('.crm-photo-modal');
    ok(!!modal, 'the photo editor opens');

    const selects = [...(modal?.querySelectorAll('figcaption select') || [])];
    ok(selects.length > 0, `each photo carries a rights dropdown (${selects.length} photos)`);
    // The three accepted bases, plus the empty "no rights" option.
    const emptyOption = selects[0] && [...selects[0].options].some(o => o.value === '');
    ok(!!emptyOption, 'a photo can be added with no rights recorded');
    const known = selects[0] ? [...selects[0].options].map(o => o.value).filter(Boolean) : [];
    for (const basis of ['own-photo', 'supplier-permission', 'dropship-authorized'])
      ok(known.includes(basis), `the editor offers "${basis}" as a rights basis`);

    // Choose "no rights" on the first photo: it must be flagged as held back.
    if (selects[0]) {
      await act(async () => {
        selects[0].value = '';
        selects[0].dispatchEvent(new dom.window.Event('change', { bubbles: true }));
      });
      const held = document.querySelectorAll('.crm-photo-modal figure.is-held').length;
      ok(held > 0, `a photo with no rights basis is visibly held back (${held} flagged)`);
      ok(/held back/i.test(document.querySelector('.crm-photo-modal footer')?.textContent || ''),
        'the save button says how many photos are held back');
    }

    const closeBtn = document.querySelector('.crm-photo-modal footer .crm-ghost-btn');
    if (closeBtn) await act(async () => { closeBtn.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); });
  }
}


// ---- machinery import: paste a supplier link -------------------------------
// Nothing is written until the operator has read the machine and pressed
// Import. That is enforced by the server, but the UI has to make it obvious:
// Preview is dead until a link is pasted, and Import does not exist until a
// preview has come back.
say('\nMachinery import panel');
await clickText('.crm-side nav button', 'Machinery desk');
{
  const panel = document.querySelector('.crm-import-panel');
  ok(!!panel, 'the machinery desk offers an import panel');
  const toggle = panel?.querySelector('.crm-import-toggle');
  ok(!!toggle, 'it has a toggle');
  ok(!panel?.querySelector('.crm-import-body'), 'it is closed until opened');

  if (toggle) {
    await act(async () => { toggle.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); });
    const body = document.querySelector('.crm-import-body');
    ok(!!body, 'opening it reveals the link box');

    const input = body?.querySelector('input[type="url"]');
    ok(!!input, 'there is a box for the supplier link');
    const rightsSelect = body?.querySelector('select');
    ok(!!rightsSelect, 'there is a rights-basis dropdown');
    ok(!!rightsSelect && [...rightsSelect.options].some(o => o.value === ''),
      'it can be set to facts-only, importing no photos at all');
    for (const basis of ['own-photo', 'supplier-permission', 'dropship-authorized'])
      ok(!!rightsSelect && [...rightsSelect.options].some(o => o.value === basis),
        `it offers "${basis}" as a rights basis`);

    const buttons = () => [...document.querySelectorAll('.crm-import-body button')].map(b => (b.textContent || '').trim());
    const previewBtn = () => [...document.querySelectorAll('.crm-import-body button')].find(b => /preview/i.test(b.textContent || ''));
    ok(!!previewBtn(), `Preview is offered (${buttons().join(' / ')})`);
    ok(previewBtn()?.disabled === true, 'Preview is disabled until a link is pasted');
    ok(!buttons().some(b => /^import machine$/i.test(b)), 'Import does not exist before a preview');

    // Type a link: Preview wakes up, Import still does not exist.
    if (input) {
      await act(async () => {
        const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, 'value').set;
        setter.call(input, 'https://supplier.example/product/doosan-dx300lc');
        input.dispatchEvent(new dom.window.Event('input', { bubbles: true }));
      });
      ok(previewBtn()?.disabled === false, 'Preview wakes up once a link is pasted');
      ok(![...document.querySelectorAll('.crm-import-body button')].some(b => /^import machine$/i.test(b.textContent || '')),
        'Import still does not exist — the machine has not been read yet');
    }
  }
}

// ---- React logged nothing ---------------------------------------------------
console.error = realError; console.warn = realWarn;
const real = errors.filter(e => !/not wrapped in act|Not implemented|jsdom/i.test(e));
ok(real.length === 0, `nothing was logged as an error${real.length ? ': ' + real.slice(0, 3).join(' || ').slice(0, 900) : ''}`);

await act(async () => { root.unmount(); });

say(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
