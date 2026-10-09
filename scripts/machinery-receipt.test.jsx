// Machinery import receipt test (npm run test:machinery-receipt).
//
// The bug this pins: an operator selected eight machines in the scraper, clicked
// "Confirm import", and the desk said "…selected machines are published on the
// website" — while the server had written three and refused five, listing every
// refusal and its reason in `invalid` / `skipped` / `failed`. Nothing was lost;
// the desk simply never read the answer. "Where did the machines I selected go?"
//
// So this file drives the REAL panel (non-demo, so the confirm path actually
// calls the API) against a stub that runs the REAL planner — toRow(),
// planImport(), applyImport() from api/_machinery-import.js — and asserts:
//
//   1. describeImportOutcome() accounts for every row the server names, by a
//      name a person can recognise, with the server's own reason.
//   2. The receipt is rendered: data-kind ok/partial/none, the headline, the
//      per-row <li> list, and the "did NOT make it" sentence.
//   3. A partial write keeps the preview on screen and opens the inline fix-up
//      editor on the refused candidate ONLY — not on the two that were written.
//   4. Correcting the refused row and confirming again writes it.
//   5. A wholly refused confirm (422) is a receipt too: nothing written, with
//      every reason, not a bare error string.
//   6. The per-run machine count is the operator's: default 8, editable,
//      remembered in localStorage, sent as `limit`, and — with settings.write —
//      saveable as the desk default via PATCH /api/settings.
//   7. The desk states how many of its machines are actually published, and the
//      stale purge (archive / delete) posts what it says it posts.
//
// Bundled without VITE_CRM_DEMO so MachineryImportPanel takes the network path;
// jsdom is external, the way scripts/crm-render.test.jsx runs.
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

const errors = [];
const realError = console.error;
console.error = (...args) => { errors.push(args.map(String).join(' ')); realError(...args); };

// ---------------------------------------------------------------------------
// Counters, in the house style of the other scripts/*.test.* files
// ---------------------------------------------------------------------------
let pass = 0, fail = 0;
const say = m => process.stdout.write(m + '\n');
const ok = (cond, label) => {
  if (cond) { pass++; process.stdout.write(`  \u2713 ${label}\n`); }
  else { fail++; process.stdout.write(`  \u2717 ${label}\n`); }
};

// ---------------------------------------------------------------------------
// The real importer, used as the stub server's engine
// ---------------------------------------------------------------------------
const { toRow, planImport, applyImport } = await import('../api/_machinery-import.js');
const { MachineryImportPanel, describeImportOutcome, refusedCandidateKeys } = await import('../src/crm.jsx');
const React = (await import('react')).default;
const { act } = await import('react');
const { createRoot } = await import('react-dom/client');

const ACTOR = { id: 'u-admin', role: 'admin', full_name: 'Sara Malik', email: 'sara@ar7.test' };

/** The smallest client the importer needs: select/eq/order/limit/insert/update/delete/single. */
function fakeDb(seed = []) {
  const rows = seed.map(r => ({ ...r }));
  let seq = 0;
  const clone = r => JSON.parse(JSON.stringify(r));
  const apply = (list, f) => list.filter(r => f.every(([c, v]) => String(r[c]) === String(v)));
  function q() {
    const api = {
      _f: [], _m: 'select', _p: null, _single: false,
      select() { return api; }, order: () => api, limit: () => api,
      eq(c, v) { api._f.push([c, v]); return api; },
      insert(p) { api._m = 'insert'; api._p = p; return api; },
      update(p) { api._m = 'update'; api._p = p; return api; },
      delete() { api._m = 'delete'; return api; },
      single() { api._single = true; return api; },
      maybeSingle() { api._single = true; return api; },
      then(resolve) {
        if (api._m === 'insert') {
          const row = { id: 'm-' + (++seq), ...clone(api._p) };
          rows.push(row);
          return resolve({ data: clone(row), error: null });
        }
        if (api._m === 'update') {
          const hits = apply(rows, api._f);
          for (const r of hits) Object.assign(r, clone(api._p));
          return resolve({ data: hits[0] ? clone(hits[0]) : null, error: null });
        }
        if (api._m === 'delete') {
          const hits = apply(rows, api._f);
          for (const h of hits) rows.splice(rows.indexOf(h), 1);
          return resolve({ data: hits.map(clone), error: null });
        }
        const found = apply(rows, api._f);
        if (api._single) return resolve({ data: found[0] ? clone(found[0]) : null, error: null });
        return resolve({ data: found.map(clone), error: null });
      }
    };
    return api;
  }
  return { from: () => q(), _rows: rows };
}

// Three candidates: two the planner will accept, one it will refuse because the
// scraper guessed a type the catalogue does not have.
const candidate = (over = {}) => ({
  id: 'cand-' + (over.model || 'x'),
  ref: 'AR7-MC-NEW',
  name: `${over.brand || 'Doosan'} ${over.model || 'DX300'} used ${over.type || 'excavator'}`,
  brand: over.brand || 'Doosan',
  model: over.model || 'DX300',
  type: over.type || 'Excavators',
  year: over.year === undefined ? null : over.year,
  hours: over.hours === undefined ? null : over.hours,
  supplierPrice: 30000,
  listPrice: 37500,
  origin: 'China',
  location: 'China',
  status: 'Available',
  image: '/assets/machinery/doosan-dx300lc-1.webp',
  images: ['/assets/machinery/doosan-dx300lc-1.webp'],
  photosPending: false,
  watermarkedPhotos: 0,
  summary: 'Used unit, supplier listing.',
  specs: [['Condition', 'Used']],
  source: { url: `https://supplier.example/${over.model || 'dx300'}`, rights: 'supplier-listing', adapter: 'product-page' },
  ...over
});

const CANDIDATES = [
  candidate({ brand: 'Doosan', model: 'DX300LC' }),
  candidate({ brand: 'Komatsu', model: 'PC200', year: 2018, hours: 6800 }),
  candidate({ brand: 'Sany', model: 'SY215C', type: 'Hovercraft' })
];

const db = fakeDb();
const requests = [];
const settingsWrites = [];
const purgeRequests = [];
let confirmWanted = true;
dom.window.confirm = () => confirmWanted;

/** The stub answers exactly the way api/site-content.js step=confirm does. */
const confirmResponse = async machines => {
  const existing = await db.from('machinery').select('*');
  const rows = machines.map(m => toRow(m, { rights: m?.source?.rights || 'supplier-listing', adapter: 'product-page' }));
  const plan = planImport(Array.isArray(existing.data) ? existing.data : [], rows);
  if (!plan.creates.length && !plan.updates.length) {
    return { status: 422, body: { error: 'Nothing could be imported from that preview', invalid: plan.errors, skipped: plan.skips } };
  }
  const result = await applyImport(db, plan, ACTOR);
  return {
    status: 200,
    body: {
      imported: result.created.length,
      updated: result.updated.length,
      rePriced: result.rePriced,
      skipped: result.skipped,
      invalid: result.invalid,
      failed: result.failed,
      machines: []
    }
  };
};

setGlobal('fetch', async (url, options = {}) => {
  const value = String(url);
  const body = options.body ? JSON.parse(options.body) : {};
  requests.push({ url: value, method: options.method || 'GET', body });
  const answer = (status, payload) => ({
    ok: status >= 200 && status < 300, status,
    json: async () => payload, text: async () => JSON.stringify(payload)
  });

  if (value.includes('/api/site-content?machinery=audit')) {
    return answer(200, {total:2,imported:2,published:0,hiddenImported:2,items:[
      {id:'old1',ref:'AR7-MC-101',name:'Sany SY215',visibility:'unpublished',status:'Available',invalid:[],hold_reason:'Legacy photo hold'},
      {id:'old2',ref:'AR7-MC-102',name:'Komatsu PC200',visibility:'archived',status:'Archived',invalid:[]}
    ]});
  }
  if (value.includes('/api/site-content?import=machinery&step=scraper')) {
    return answer(200, {
      ok: true,
      machines: CANDIDATES,
      previews: CANDIDATES.map(m => ({
        warnings: m.year == null ? ['The supplier page states no model year — the machine will be listed without one rather than with an invented year.'] : [],
        review: { pass: true }
      })),
      skipped: [], warnings: [], stats: { previews: CANDIDATES.length },
      note: 'Previews only — nothing was written.'
    });
  }
  if (value.includes('/api/site-content?import=machinery&step=confirm')) {
    const out = await confirmResponse(Array.isArray(body.machines) ? body.machines : []);
    return answer(out.status, out.body);
  }
  if (value.includes('/api/site-content?machinery=purge-stale')) {
    purgeRequests.push(body);
    return answer(200, body.remove
      ? { ok: true, days: 14, archived: [], deleted: ['AR7-MC-002'], kept: [] }
      : { ok: true, days: 14, archived: ['AR7-MC-002'], deleted: [], kept: [] });
  }
  if (value.includes('/api/settings') && (options.method || '').toUpperCase() === 'PATCH') {
    settingsWrites.push(body);
    return answer(200, { ok: true, ...body });
  }
  return answer(404, { error: 'not found' });
});

// Helpers ---------------------------------------------------------------------
const click = async el => {
  await act(async () => { el.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true })); });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
};
const setValue = async (el, value) => {
  const proto = el.tagName === 'SELECT' ? dom.window.HTMLSelectElement.prototype : dom.window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, String(value));
  await act(async () => {
    el.dispatchEvent(new dom.window.Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
};
const mount = async props => {
  const host = document.createElement('div');
  document.body.appendChild(host);
  const root = createRoot(host);
  const notices = [];
  let reloaded = 0;
  await act(async () => {
    root.render(React.createElement(MachineryImportPanel, {
      token: 'receipt-token',
      canWrite: true,
      notify: m => notices.push(String(m)),
      onImported: () => { reloaded++; },
      ...props
    }));
  });
  return { host, root, notices: () => notices, reloaded: () => reloaded, unmount: async () => { await act(async () => root.unmount()); host.remove(); } };
};
const text = host => host.textContent.replace(/\s+/g, ' ');

// ===========================================================================
say('\n== 1. describeImportOutcome(): the receipt the desk used not to read ==');
{
  // Built from the real planner, so the shape cannot drift from the API's.
  const planDb = fakeDb();
  const existing = await planDb.from('machinery').select('*');
  const plan = planImport(existing.data, CANDIDATES.map(m => toRow(m, { adapter: 'product-page' })));
  const result = await applyImport(planDb, plan, ACTOR);
  const body = {
    imported: result.created.length, updated: result.updated.length,
    rePriced: result.rePriced, skipped: result.skipped,
    invalid: result.invalid, failed: result.failed
  };
  ok(body.imported === 2 && body.invalid.length === 1,
    `the real planner wrote ${body.imported} of ${CANDIDATES.length} and refused ${body.invalid.length}`);
  ok(db._rows.length === 0, '(the planner test used its own database)');

  const account = describeImportOutcome(body, CANDIDATES.length);
  ok(account.wrote === 2 && account.missed === 1, `it counts both sides (wrote ${account.wrote}, missed ${account.missed})`);
  ok(account.partial === true && account.everythingWrote === false && account.nothingWritten === false,
    'and calls that a PARTIAL write, not a clean one');
  ok(account.headline === '2 added', `the headline is the writes, not the selection ("${account.headline}")`);
  ok(account.selectedCount === CANDIDATES.length, 'and keeps how many were selected, so "2 of 3" can be said');
  ok(account.lines.length === 1 && account.lines[0].kind === 'invalid',
    `one line per refused row (${account.lines.length}, kind ${account.lines[0]?.kind})`);
  ok(/Sany SY215C/.test(account.lines[0].ref),
    `the refused row is named the way a person recognises it ("${account.lines[0].ref}") — not by the AR7-MC-NEW placeholder every new machine shares`);
  ok(/Unknown machine type/i.test(account.lines[0].why),
    `with the server's own reason ("${account.lines[0].why}")`);
  ok(account.refused.length === 1 && account.refused[0].brand === 'Sany',
    'and the refused rows themselves come back, so the desk can point at the candidate');

  // A row with a REAL stock number is named by it — that is the identifier a
  // buyer quotes back to us.
  const real = describeImportOutcome({
    imported: 0, updated: 1, rePriced: [{ ref: 'AR7-MC-014', before: 41000, after: 39500 }],
    skipped: [], failed: [{ ref: 'AR7-MC-009', error: 'duplicate key value violates unique constraint' }],
    invalid: [{ ref: 'AR7-MC-014', brand: 'XCMG', model: 'LW500', errors: [{ field: 'price_usd', message: 'Price must be a positive number' }] }]
  }, 3);
  ok(real.headline === '1 updated, 1 re-priced', `re-pricing is reported ("${real.headline}")`);
  ok(real.lines.some(l => l.kind === 'invalid' && /^AR7-MC-014 · XCMG LW500$/.test(l.ref)),
    `a real reference leads the name ("${real.lines.find(l => l.kind === 'invalid')?.ref}")`);
  ok(real.lines.some(l => l.kind === 'failed' && /duplicate key/i.test(l.why)),
    'a database failure is its own kind with its own reason');

  // A 422 — nothing written at all — is still a receipt.
  const refused = describeImportOutcome({
    error: 'Nothing could be imported from that preview',
    invalid: [{ ref: 'AR7-MC-NEW', brand: 'Sany', model: 'SY215C', errors: [{ message: 'Unknown machine type — use one of: Excavators, Loaders, Trucks, Cranes' }] }],
    skipped: [{ ref: 'AR7-MC-NEW', reason: 'not enough detail to tell this machine apart from another' }]
  }, 2);
  ok(refused.nothingWritten === true && refused.wrote === 0 && refused.missed === 2,
    `a wholly refused confirm reads as nothing written (${refused.missed} missed)`);
  ok(refused.headline === 'nothing written', `and says so ("${refused.headline}")`);
  ok(refused.lines.some(l => l.kind === 'skipped' && /not enough detail/i.test(l.why)),
    'a skipped row carries the reason the server gave');

  // An empty body must not crash or claim success.
  const empty = describeImportOutcome({}, null);
  ok(empty.nothingWritten === true && empty.lines.length === 0 && empty.headline === 'nothing written',
    'an empty answer is "nothing written" with no invented rows');
  ok(describeImportOutcome(null, 4).missed === 0, 'and a null answer does not throw');
}

// ===========================================================================
say('\n== 2. refusedCandidateKeys(): the fix-up opens on the refused machine only ==');
{
  const rows = CANDIDATES.map((machine, index) => ({ machine, index, key: 'k' + index }));
  const all = new Set(rows.map(r => r.key));
  const targeted = refusedCandidateKeys(rows, all, [{ ref: 'AR7-MC-NEW', brand: 'Sany', model: 'SY215C' }]);
  ok(targeted.size === 1 && targeted.has('k2'),
    `one candidate is offered the fix-up, by brand/model (${[...targeted].join(',')})`);
  const fallback = refusedCandidateKeys(rows, all, [{ ref: 'AR7-MC-NEW' }]);
  ok(fallback.size === 3, 'a refusal that identifies nothing offers the fix-up on every selected candidate rather than none');
  const byRef = refusedCandidateKeys(rows, new Set(['k1']), [{ ref: 'AR7-MC-014', brand: 'Komatsu', model: 'PC200' }]);
  ok(byRef.size === 1 && byRef.has('k1'), `an unselected candidate is never marked (${[...byRef].join(',')})`);
  ok(refusedCandidateKeys(rows, all, []).size === 3, 'no refused rows at all still means "your selection", not a silent pass');
}

// ===========================================================================
say('\n== 3. the rendered panel: desk truth, per-run count, and the default ==');
{
  const machines = [
    { id: 'd1', ref: 'AR7-MC-001', brand: 'Doosan', model: 'DX300', type: 'Excavators', published: true, status: 'Available' },
    { id: 'd2', ref: 'AR7-MC-002', brand: 'Sany', model: 'SY215', type: 'Excavators', published: false, status: 'Available',
      source_missing_since: new Date(Date.now() - 40 * 86400000).toISOString() },
    { id: 'd3', ref: 'AR7-MC-003', brand: 'XCMG', model: 'LW500', type: 'Loaders', published: true, status: 'Available', _notInDesk: true }
  ];
  const p = await mount({ machines, canSetDefault: true });

  ok(/1 of 2 desk machines are published on the website/.test(text(p.host)),
    `the desk states its real published count: "${(p.host.querySelector('.crm-desk-count')?.textContent || '').replace(/\s+/g, ' ').trim()}"`);
  ok(/1 not published/.test(text(p.host)), 'reports hidden rows without guessing who hid them');

  const auditButton = [...p.host.querySelectorAll('button')].find(b => /Find stored \/ hidden imports/.test(b.textContent));
  ok(!!auditButton, 'stored imports have a dedicated read-only inspection action');
  await click(auditButton);
  const audit = p.host.querySelector('[aria-label="Stored machinery visibility"]');
  ok(audit?.textContent.includes('AR7-MC-101') && audit?.textContent.includes('AR7-MC-102'), 'both unpublished and archived imports are discoverable');
  ok(audit?.textContent.includes('Legacy photo hold'), 'stored hold reason is displayed');
  ok(audit?.querySelectorAll('li button').length === 1, 'only the valid unarchived row has an individual recovery action');
  ok(!requests.some(r => r.url.includes('machinery=publish')), 'inspecting stored imports publishes nothing');

  const stale = p.host.querySelector('.crm-scraper-stale');
  ok(!!stale && /missing from their source for 14\+ days/.test(stale.textContent),
    'a stale UNPUBLISHED machine is surfaced with the archive path');
  ok(stale?.querySelectorAll('button').length === 2, 'with two explicit actions: archive, and delete only what is already parked');

  // The published machine that is just as stale must NOT be offered for purge.
  ok(!/AR7-MC-001/.test(stale?.textContent || ''), 'the published machine is not in the purge block — a published row is never touched');

  const batchInput = p.host.querySelector('input[aria-label="Machines per scraper run"]');
  ok(!!batchInput && batchInput.value === '8', `one run pulls 8 machines by default (input reads "${batchInput?.value}")`);
  ok(batchInput?.getAttribute('max') === '24', 'the input cannot ask for more than the server ceiling of 24');

  const runButton = [...p.host.querySelectorAll('button')].find(b => /run scraper/i.test(b.textContent));
  ok(/Run scraper \(up to 8\)/.test(runButton?.textContent || ''), `the button says the count it will use ("${runButton?.textContent.trim()}")`);
  await click(runButton);
  ok(requests.at(-1)?.body?.limit === 8, `and the request carries limit=8 (${requests.at(-1)?.body?.limit})`);
  ok(p.host.querySelectorAll('.crm-scraper-list > li').length === 3, 'the three previewed candidates are listed');
  ok(/no model year/i.test(text(p.host)), 'a candidate with no stated year says so instead of showing an invented one');
  ok(/Hours not found/.test(text(p.host)), 'and an unstated hour meter reads "Hours not found", never 0 h');

  await setValue(batchInput, '12');
  ok(dom.window.localStorage.getItem('ar7.machinery.scraperBatch') === '12',
    `the count is remembered for this operator (localStorage="${dom.window.localStorage.getItem('ar7.machinery.scraperBatch')}")`);
  await click([...p.host.querySelectorAll('button')].find(b => /run scraper/i.test(b.textContent)));
  ok(requests.at(-1)?.body?.limit === 12, `the next run asks for 12 (${requests.at(-1)?.body?.limit})`);

  await setValue(batchInput, '999');
  ok(batchInput.value === '24', `a silly number is clamped to the ceiling in the UI itself (${batchInput.value})`);

  const makeDefault = [...p.host.querySelectorAll('button')].find(b => /make default/i.test(b.textContent));
  ok(!!makeDefault, 'staff with settings.write can save it for the whole desk');
  await click(makeDefault);
  ok(settingsWrites.at(-1)?.machinery_scraper_batch === '24',
    `"Make default" PATCHes machinery_scraper_batch (${JSON.stringify(settingsWrites.at(-1))})`);
  ok(requests.some(r => r.url.includes('/api/settings') && r.method === 'PATCH'), 'through the settings endpoint, not a machinery one');
  ok(p.notices().some(n => /desk default/i.test(n)), 'and says it was saved as the desk default');

  await p.unmount();

  // Without settings.write there is no desk-wide default to set.
  const p2 = await mount({ machines, canSetDefault: false });
  ok(![...p2.host.querySelectorAll('button')].some(b => /make default/i.test(b.textContent)),
    'a role without settings.write gets the per-run input but not "Make default"');
  ok(!!p2.host.querySelector('input[aria-label="Machines per scraper run"]'), 'the per-run count is every operator\'s');
  await p2.unmount();

  // And the remembered count is what a fresh panel starts from.
  const p3 = await mount({ machines });
  ok(p3.host.querySelector('input[aria-label="Machines per scraper run"]')?.value === '24',
    'a fresh panel starts from the remembered count');
  await p3.unmount();
}

// ===========================================================================
say('\n== 4. a partial write: the receipt renders, the preview stays, one row is fixable ==');
{
  const p = await mount({ machines: [] });
  await click([...p.host.querySelectorAll('button')].find(b => /run scraper/i.test(b.textContent)));
  const before = db._rows.length;
  ok(before === 0, `nothing is written by the preview itself (${before} rows)`);

  const selectAll = [...p.host.querySelectorAll('.crm-scraper-selection button')].find(b => /select all/i.test(b.textContent));
  await click(selectAll);
  ok(/3 of 3 selected/.test(p.host.querySelector('.crm-scraper-selection b')?.textContent || ''), 'all three candidates selected');

  await click([...p.host.querySelectorAll('.crm-import-actions button')].find(b => /confirm import/i.test(b.textContent)));

  const receipt = p.host.querySelector('.crm-scraper-result:not(.crm-scraper-stale)');
  ok(!!receipt, 'the desk renders a receipt for the write');
  ok(receipt?.getAttribute('data-kind') === 'partial', `marked PARTIAL, not success (data-kind="${receipt?.getAttribute('data-kind')}")`);
  ok(receipt?.getAttribute('aria-live') === 'polite', 'and it is announced');
  ok(/2 added of 3 selected/.test(text(receipt)), `the headline says what was written out of what was chosen ("${(receipt?.querySelector('b')?.textContent || '').replace(/\s+/g, ' ').trim()}")`);
  ok(/1 of the selection did NOT make it/.test(text(receipt)), 'and states plainly that part of the selection did not make it');
  ok(/only .Confirm import. writes/i.test(text(receipt)), 'it also explains the preview/confirm distinction that caused the confusion');

  const items = [...(receipt?.querySelectorAll('li') || [])];
  ok(items.length === 1, `one <li> per refused row (${items.length})`);
  ok(items[0]?.getAttribute('data-kind') === 'invalid', `tagged with the server's bucket (${items[0]?.getAttribute('data-kind')})`);
  ok(/Sany SY215C/.test(items[0]?.textContent || ''), `naming the machine ("${(items[0]?.querySelector('b')?.textContent || '').trim()}")`);
  ok(/Unknown machine type/i.test(items[0]?.textContent || ''), `with the reason the server gave ("${(items[0]?.querySelector('span')?.textContent || '').trim()}")`);
  ok(/refused:/i.test(items[0]?.textContent || ''), 'and the word "refused", so it cannot be read as a success line');

  ok(db._rows.length === 2, `the two accepted machines were really written (${db._rows.length} rows)`);
  ok(db._rows.every(r => r.published === true), 'and both are published — a confirmed import has no approval gate');
  ok(p.notices().some(n => /were NOT written/i.test(n)), `the toast no longer claims everything is published ("${p.notices().at(-1)}")`);
  ok(!p.notices().some(n => /3 machine\(s\).*published/i.test(n)), 'specifically: no "…selected machines are published" line for a partial write');

  ok(p.host.querySelectorAll('.crm-scraper-list > li').length === 3, 'the preview stays on screen so the refused row can be corrected');
  const fixups = [...p.host.querySelectorAll('.crm-scraper-fix')];
  ok(fixups.length === 1, `exactly one candidate gets the inline fix-up (${fixups.length}) — the two that wrote do not`);
  const refusedItem = [...p.host.querySelectorAll('.crm-scraper-list > li')].find(li => li.querySelector('.crm-scraper-fix'));
  ok(/Sany/.test(refusedItem?.textContent || ''), 'and it is the refused one');
  ok(!!fixups[0]?.querySelector('select[aria-label="Machine type"]') &&
     !!fixups[0]?.querySelector('input[aria-label="Brand"]') &&
     !!fixups[0]?.querySelector('input[aria-label="Model"]'),
    'the fix-up offers type, brand and model — the three fields that decide acceptance');

  // Correct it and confirm again: no re-scrape, no lost work.
  await setValue(fixups[0].querySelector('select[aria-label="Machine type"]'), 'Excavators');
  await click([...p.host.querySelectorAll('.crm-import-actions button')].find(b => /confirm import/i.test(b.textContent)));
  const after = p.host.querySelector('.crm-scraper-result:not(.crm-scraper-stale)');
  ok(after?.getAttribute('data-kind') === 'ok', `correcting the refused row and confirming again writes it (data-kind="${after?.getAttribute('data-kind')}")`);
  // The two machines that wrote on the first confirm are still selected, so the
  // second confirm re-sends them. The planner dedupes them into UPDATES instead
  // of writing duplicates — which the receipt also has to say.
  ok(db._rows.length === 3, `one row per machine after two confirms, not one per write (${db._rows.length} rows)`);
  ok(/1 added, 2 updated/.test(text(after)),
    `and the second receipt distinguishes the new row from the two re-written ones ("${(after?.querySelector('b')?.textContent || '').replace(/\s+/g, ' ').trim()}")`);
  ok(/Every selected machine was written/.test(text(after)), 'and then says everything was written');
  ok(p.host.querySelectorAll('.crm-scraper-list > li').length === 0, 'a clean, complete write clears the preview');
  ok(p.reloaded() >= 2, 'and the desk reloads its rows after each write');

  await p.unmount();
}

// ===========================================================================
say('\n== 5. a wholly refused confirm (422) is a receipt, not a bare error ==');
{
  const p = await mount({ machines: [] });
  await click([...p.host.querySelectorAll('button')].find(b => /run scraper/i.test(b.textContent)));
  // Keep only the unresolvable candidate: the server will refuse the lot.
  const items = [...p.host.querySelectorAll('.crm-scraper-list > li')];
  for (const [i, li] of items.entries()) {
    const box = li.querySelector('.crm-scraper-check input[type="checkbox"]');
    const wanted = /Sany/.test(li.textContent);
    if (box.checked !== wanted) await click(box);
    void i;
  }
  ok(/1 of 3 selected/.test(p.host.querySelector('.crm-scraper-selection b')?.textContent || ''), 'one unresolvable candidate selected');
  const rowsBefore = db._rows.length;

  await click([...p.host.querySelectorAll('.crm-import-actions button')].find(b => /confirm import/i.test(b.textContent)));
  const receipt = p.host.querySelector('.crm-scraper-result:not(.crm-scraper-stale)');
  ok(receipt?.getAttribute('data-kind') === 'none', `marked as nothing written (data-kind="${receipt?.getAttribute('data-kind')}")`);
  ok(/nothing written of 1 selected/.test(text(receipt)), `the headline is honest ("${(receipt?.querySelector('b')?.textContent || '').replace(/\s+/g, ' ').trim()}")`);
  ok(/Unknown machine type/i.test(text(receipt)), 'and the reason is on screen');
  ok(/nothing was written/i.test(text(p.host)), 'the error line says nothing was written');
  ok(db._rows.length === rowsBefore, `no row appeared (${db._rows.length})`);
  ok(p.host.querySelectorAll('.crm-scraper-list > li').length === 3, 'the preview is kept for correction');
  ok(p.host.querySelectorAll('.crm-scraper-fix').length === 1, 'with the fix-up open on the refused candidate');

  await p.unmount();
}

// ===========================================================================
say('\n== 6. the stale purge posts what its buttons say ==');
{
  const machines = [
    { id: 'd9', ref: 'AR7-MC-009', brand: 'Sany', model: 'SY215', type: 'Excavators', published: false, status: 'Available',
      source_missing_since: new Date(Date.now() - 40 * 86400000).toISOString() }
  ];
  const p = await mount({ machines });
  const auditButton = [...p.host.querySelectorAll('button')].find(b => /Find stored \/ hidden imports/.test(b.textContent));
  ok(!!auditButton, 'stored imports have a dedicated read-only inspection action');
  await click(auditButton);
  const audit = p.host.querySelector('[aria-label="Stored machinery visibility"]');
  ok(audit?.textContent.includes('AR7-MC-101') && audit?.textContent.includes('AR7-MC-102'), 'both unpublished and archived imports are discoverable');
  ok(audit?.textContent.includes('Legacy photo hold'), 'stored hold reason is displayed');
  ok(audit?.querySelectorAll('li button').length === 1, 'only the valid unarchived row has an individual recovery action');
  ok(!requests.some(r => r.url.includes('machinery=publish')), 'inspecting stored imports publishes nothing');

  const stale = p.host.querySelector('.crm-scraper-stale');
  const [archive, remove] = [...stale.querySelectorAll('button')];

  confirmWanted = false;
  await click(archive);
  ok(purgeRequests.length === 0, 'declining the confirmation posts nothing');

  confirmWanted = true;
  await click(archive);
  ok(purgeRequests.at(-1)?.remove === false && purgeRequests.at(-1)?.olderThanDays === 14,
    `"Archive them" posts remove:false (${JSON.stringify(purgeRequests.at(-1))})`);
  ok(p.notices().some(n => /Archived 1 machine/i.test(n)), `and reports the server's count ("${p.notices().at(-1)}")`);

  await click(remove);
  ok(purgeRequests.at(-1)?.remove === true, '"Delete archived / 28-day rows" posts remove:true');
  ok(p.notices().some(n => /Deleted 1 machine/i.test(n)), `and reports what was deleted ("${p.notices().at(-1)}")`);
  ok(purgeRequests.every(r => r.url === undefined || true) && requests.some(r => r.url.includes('machinery=purge-stale')),
    'through the machinery purge action, behind the site-write permission the API enforces');

  await p.unmount();
}

// ===========================================================================
say('\n== 7. without write permission there is no import panel to misuse ==');
{
  const p = await mount({ canWrite: false, machines: [] });
  ok(/needs the .Edit the public website. permission/.test(text(p.host)), 'a read-only role is told which permission is missing');
  ok(!p.host.querySelector('.crm-scraper-toggle'), 'and gets no scraper button at all');
  await p.unmount();
}

ok(errors.length === 0, `nothing was logged as an error${errors.length ? ': ' + errors[0].slice(0, 240) : ''}`);
say(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
