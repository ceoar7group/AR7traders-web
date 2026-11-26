#!/usr/bin/env node
// Machinery desk: API validation, permissions, publish/unpublish and the
// rights gate (npm run test:machinery-crm).
//
// Runs against an in-memory fake of the Supabase client, so it needs no
// network, no database and no credentials — the same house style as
// scripts/goonet-core.test.mjs and scripts/settings-api.test.mjs.
import siteContent, { buildMachineryXml } from '../api/site-content.js';
const handler = siteContent;
import {
  validateRow, publishBlockers, photosOf, toPublic, resolveType,
  MACHINE_STATUSES, HOLD
} from '../api/_machinery.js';

let pass = 0, fail = 0;
const ok = (cond, name) => {
  if (cond) { pass++; console.log('  ✓ ' + name); }
  else { fail++; console.error('  ✗ ' + name); }
};

// ---------------------------------------------------------------------------
// A tiny in-memory Supabase. It implements only the shapes the machinery desk
// uses, and throws on anything else so a new query pattern fails loudly.
// ---------------------------------------------------------------------------
function fakeDb(seed = {}) {
  const tables = { machinery: [], activities: [], site_settings: [], ...seed };
  let idSeq = 0;
  const clone = r => (typeof structuredClone === 'function' ? structuredClone(r) : JSON.parse(JSON.stringify(r)));

  function applyFilters(rows, filters) {
    return rows.filter(r => filters.every(([c, v]) => String(r[c]) === String(v)));
  }

  function makeQuery(table) {
    const q = {
      _table: table, _filters: [], _method: 'select',
      _payload: null, _single: false, _maybe: false,
      select() { return this; },
      order() { return this; },
      limit() { return this; },
      eq(c, v) { this._filters.push([c, v]); return this; },
      like() { return this; },
      insert(payload) { this._method = 'insert'; this._payload = payload; return this; },
      update(payload) { this._method = 'update'; this._payload = payload; return this; },
      delete() { this._method = 'delete'; return this; },
      single() { this._single = true; return this; },
      maybeSingle() { this._maybe = true; this._single = true; return this; },
      then(resolve, reject) {
        try {
          const rows = tables[this._table] || [];
          if (this._method === 'insert') {
            const row = { id: 'id-' + (++idSeq), ...clone(this._payload) };
            rows.push(row);
            return resolve({ data: row, error: null });
          }
          if (this._method === 'update') {
            const hits = applyFilters(rows, this._filters);
            for (const r of hits) Object.assign(r, clone(this._payload));
            const one = hits[0] || null;
            return resolve({ data: one, error: null });
          }
          if (this._method === 'delete') {
            const hits = applyFilters(rows, this._filters);
            for (const r of hits) rows.splice(rows.indexOf(r), 1);
            return resolve({ data: null, error: null });
          }
          // Rows come back DETACHED, as they do from real Supabase (which
          // deserialises JSON into fresh objects). Returning the stored
          // reference would let a later UPDATE mutate the `before` snapshot
          // this code takes, and a price change would compare a value against
          // itself. That was a fake-database bug, not a production one.
          const found = applyFilters(rows, this._filters);
          if (this._maybe) return resolve({ data: found[0] ? clone(found[0]) : null, error: null });
          if (this._single) return resolve({ data: found[0] ? clone(found[0]) : null, error: null });
          return resolve({ data: found.map(clone), error: null });
        } catch (e) { if (reject) reject(e); }
      }
    };
    return q;
  }
  return {
    from: t => makeQuery(t),
    _tables: tables,
    activities: () => tables.activities
  };
}

function fakeRes() {
  const r = {
    statusCode: 0, body: null, headers: {},
    status(c) { r.statusCode = c; return r; },
    setHeader(k, v) { r.headers[String(k).toLowerCase()] = v; return r; },
    end(b) { r.body = b; return r; },
    json: () => (typeof r.body === 'string' ? JSON.parse(r.body) : r.body)
  };
  return r;
}

const ADMIN = { id: 'u-admin', role: 'admin', full_name: 'Sara Malik', email: 'sara@ar7.test' };
const SALES = { id: 'u-sales', role: 'sales', full_name: 'Omar Ali', email: 'omar@ar7.test' };

/** A signed-in caller whose role decides what `site.write` allows. */
function asUser(profile) {
  return {
    getUser: async () => ({ user: { id: profile.id, email: profile.email }, profile, db: null }),
    permsFor: async role => ({ 'site.write': role === 'admin' || role === 'manager' })
  };
}

const req = (method, query, body) => ({ method, query, body, headers: {} });

// ---------------------------------------------------------------------------
const GOOD = {
  ref: 'AR7-MC-001', type: 'Excavators', brand: 'Doosan', model: 'DX300LC-9C',
  year: 2019, hours: 6800, price_usd: 62500,
  summary: '30-tonne class crawler excavator.',
  specs: [['Operating weight', '30,200 kg']],
  images: [{ src: '/assets/machinery/doosan-dx300lc-1.webp', rights: 'own-photo' }]
};

console.log('\n-- validation --');
{
  const r = validateRow(GOOD);
  ok(r.errors.length === 0, 'a complete machine validates');
  ok(r.value.published === true, 'a new machine is published by default');
  ok(resolveType('excavator') === 'Excavators', 'a loose type name resolves (excavator -> Excavators)');
  ok(resolveType('Spaceship') === null, 'an unknown type does not resolve');
  const bad = validateRow({ ...GOOD, ref: '', type: 'Spaceship', price_usd: -1 });
  ok(bad.errors.some(e => e.field === 'ref'), 'an empty reference is rejected');
  ok(bad.errors.some(e => e.field === 'type'), 'an unknown type is rejected');
  ok(bad.errors.some(e => e.field === 'price_usd'), 'a negative price is rejected');
  const badUrl = validateRow({ ...GOOD, source_url: 'not-a-url' });
  ok(badUrl.errors.some(e => e.field === 'source_url'), 'a non-http source URL is rejected');
  const badStatus = validateRow({ ...GOOD, status: 'Teleporting' });
  ok(badStatus.errors.some(e => e.field === 'status'), `an unknown status is rejected (allowed: ${MACHINE_STATUSES.join(', ')})`);
}

console.log('\n-- photo basis: recorded, never a publishing gate --');
{
  const clean = { ...GOOD, images: [{ src: '/a.webp', rights: 'own-photo' }] };
  ok(publishBlockers(clean, {}).length === 0, 'a photo with a basis raises no blocker');
  for (const basis of ['supplier-listing', 'dropship-authorized', 'supplier-permission', 'own-photo']) {
    ok(publishBlockers({ ...GOOD, images: [{ src: '/a.webp', rights: basis }] }, {}).length === 0,
      `${basis} is accepted and raises no blocker`);
  }
  // 2026-10-07: a machine lists with its photos whatever basis they carry; the
  // desk shows the basis, and a marketplace copy is flagged for replacement.
  const marketplace = { ...GOOD, images: [{ src: 'https://image.made-in-china.com/a.jpg', rights: 'supplier-listing' }] };
  const pub = toPublic({ id: 'x', ...marketplace });
  ok(pub.images.length === 1, 'a marketplace-hosted photo is published, not withheld');
  ok(pub.photos_withheld === 0, 'nothing is withheld for want of an agreement');
  ok(pub.photos_flagged === 1, 'and the CRM is told the copy looks watermarked');
  ok(pub.published !== false, 'the machine is listed');

  const mixed = { ...GOOD, images: [{ src: '/a.webp', rights: 'own-photo' }, { src: '/b.webp', rights: 'supplier-listing' }] };
  ok(JSON.stringify(toPublic({ id: 'x', ...mixed }).images) === '["/a.webp","/b.webp"]',
    'a mixed gallery keeps every photo');

  // A legacy row that explicitly records an empty basis still reports the hold,
  // so the desk can ask for the missing provenance.
  const dirty = { ...GOOD, images: [{ src: '/a.webp', rights: '' }] };
  ok(publishBlockers(dirty, {}).includes(HOLD.NO_RIGHTS), 'an explicitly empty basis is still reported');
  ok(toPublic({ id: 'x', ...dirty }).images.length === 1, 'but the photo itself is not hidden from the site');
}

console.log('\n-- create / read through the API --');
{
  const db = fakeDb();
  const res = fakeRes();
  await handler(req('POST', { machinery: 'create' }, GOOD), res, { db, ...asUser(ADMIN) });
  ok(res.statusCode === 201, `an admin can create a machine (got ${res.statusCode})`);
  const created = res.json();
  ok(created.ref === 'AR7-MC-001', 'the reference is preserved');
  ok(created.published !== false, 'the machine is published on creation');
  ok(created.created_by_name === 'Sara Malik', 'the CRM can see who added it');
  ok(created.published_by_name === 'Sara Malik', 'the CRM can see who published it');
  ok(db.activities().some(a => /Added Doosan DX300LC-9C/.test(a.action)), 'adding writes an activity entry');
  ok(db.activities().some(a => /Published AR7-MC-001/.test(a.action)), 'publishing writes an activity entry');

  const list = fakeRes();
  await handler(req('GET', { machinery: 'list' }), list, { db });
  ok(list.statusCode === 200 && list.json().length === 1, 'the public read returns the published machine');

  const bad = fakeRes();
  await handler(req('POST', { machinery: 'create' }, { ...GOOD, price_usd: -5 }), bad, { db, ...asUser(ADMIN) });
  ok(bad.statusCode === 400, `an invalid machine is refused (got ${bad.statusCode})`);
  ok(Array.isArray(bad.json().details), 'the error carries per-field details for the form');
}

console.log('\n-- permissions --');
{
  const db = fakeDb();
  const created = fakeRes();
  await handler(req('POST', { machinery: 'create' }, { ...GOOD, ref: 'AR7-MC-002' }), created, { db, ...asUser(ADMIN) });
  const id = created.json().id;

  const denied = fakeRes();
  await handler(req('PATCH', { machinery: 'update' }, { id, price_usd: 1 }), denied, { db, ...asUser(SALES) });
  ok(denied.statusCode === 403, `a role without site.write cannot edit (got ${denied.statusCode})`);

  const deniedPublish = fakeRes();
  await handler(req('POST', { machinery: 'unpublish' }, { id }), deniedPublish, { db, ...asUser(SALES) });
  ok(deniedPublish.statusCode === 403, 'a role without site.write cannot publish/unpublish');

  const anon = fakeRes();
  await handler(req('PATCH', { machinery: 'update' }, { id, price_usd: 1 }), anon, { db });
  ok(anon.statusCode === 401, `an anonymous caller cannot edit (got ${anon.statusCode})`);

  const allowed = fakeRes();
  await handler(req('PATCH', { machinery: 'update' }, { id, price_usd: 60000 }), allowed, { db, ...asUser(ADMIN) });
  ok(allowed.statusCode === 200, 'an admin can edit');
  ok(allowed.json().price === 60000, 'the new price is returned');
  ok(allowed.json().price_before_usd === 62500, 'the old price is kept for the CRM to show was/now');
  ok(db.activities().some(a => /Re-priced AR7-MC-002: 62500 → 60000/.test(a.action)),
    'a price change is logged old → new');
}

console.log('\n-- publish / unpublish / archive --');
{
  const db = fakeDb();
  const created = fakeRes();
  await handler(req('POST', { machinery: 'create' }, { ...GOOD, ref: 'AR7-MC-003' }), created, { db, ...asUser(ADMIN) });
  const id = created.json().id;

  const off = fakeRes();
  await handler(req('POST', { machinery: 'unpublish' }, { id }), off, { db, ...asUser(ADMIN) });
  ok(off.statusCode === 200 && off.json().published === false, 'unpublish hides the machine');
  ok(off.json().published_by === null, 'unpublishing clears who published it');

  const hidden = fakeRes();
  await handler(req('GET', { machinery: 'list' }), hidden, { db });
  ok(hidden.json().length === 0, 'an unpublished machine is absent from the public read');

  const adminList = fakeRes();
  await handler(req('GET', { machinery: 'list', all: '1' }), adminList, { db, ...asUser(ADMIN) });
  ok(adminList.json().length === 1, 'the CRM still sees it with all=1');
  ok('price_usd' in adminList.json()[0], 'private desk read keeps the editable database price column');
  const audit = fakeRes();
  await handler(req('GET', { machinery: 'audit' }), audit, { db, ...asUser(ADMIN) });
  ok(audit.statusCode === 200 && audit.json().total === 1, 'audit discovers the stored unpublished row');
  ok(audit.json().items[0].visibility === 'unpublished', 'audit names the exact visibility state');
  const deniedAudit = fakeRes();
  await handler(req('GET', { machinery: 'audit' }), deniedAudit, { db, ...asUser(SALES) });
  ok(deniedAudit.statusCode === 403, 'audit does not expose private records to a role without site.write');


  const anonAll = fakeRes();
  await handler(req('GET', { machinery: 'list', all: '1' }), anonAll, { db });
  ok(anonAll.statusCode === 401, 'an anonymous caller cannot ask for all=1');

  const back = fakeRes();
  await handler(req('POST', { machinery: 'publish' }, { id }), back, { db, ...asUser(ADMIN) });
  ok(back.json().published === true && back.json().published_by === 'u-admin', 'publishing records the person');

  const arch = fakeRes();
  await handler(req('POST', { machinery: 'archive' }, { id }), arch, { db, ...asUser(ADMIN) });
  ok(arch.json().status === 'Archived' && arch.json().published === false, 'archive sets Archived and hides it');
}

console.log('\n-- the machinery sitemap --');
{
  const db = fakeDb();
  for (const [ref, type] of [['AR7-MC-001', 'Excavators'], ['AR7-MC-002', 'Loaders']]) {
    await handler(req('POST', { machinery: 'create' }, { ...GOOD, ref, type }), fakeRes(), { db, ...asUser(ADMIN) });
  }
  const res = fakeRes();
  await handler(req('GET', { machinery: 'list' }), res, { db });
  const xml = buildMachineryXml(res.json());
  ok(xml.startsWith('<?xml version="1.0" encoding="UTF-8"?>'), 'the document declares XML');
  ok(xml.includes('<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'), 'it is a sitemaps.org urlset');
  const locs = [...xml.matchAll(/<loc>([^<]*)<\/loc>/g)].map(m => m[1]);
  ok(locs.every(l => l.startsWith('https://ar7traders.com/')), 'every URL is absolute and on the canonical domain');
  ok(locs.every(l => !l.includes('www.')), 'no URL uses www.');
  ok(locs.includes('https://ar7traders.com/machinery/excavators'), 'the catalogue page is listed');
  ok(locs.includes('https://ar7traders.com/machinery/excavators/AR7-MC-001'), 'the detail page is listed');
  ok(locs.includes('https://ar7traders.com/machinery/loaders'), 'a second type gets its own catalogue page');
  ok(new Set(locs).size === locs.length, 'no duplicate URLs');

  // Unpublished machines must not appear.
  const unpublished = fakeRes();
  await handler(req('POST', { machinery: 'unpublish' }, { id: db._tables.machinery[0].id }), unpublished, { db, ...asUser(ADMIN) });
  const after = fakeRes();
  await handler(req('GET', { machinery: 'list' }), after, { db });
  const xml2 = buildMachineryXml(after.json());
  ok(!xml2.includes('AR7-MC-001'), 'an unpublished machine leaves the sitemap');
  ok(xml2.includes('AR7-MC-002'), 'the published one stays');
  ok(buildMachineryXml([]).includes('<urlset'), 'an empty catalogue is still a valid urlset');
}

console.log('\n-- live-site hydration --');
{
  // The public site replaces its built-in fallback with the CRM's published
  // rows. The one thing that must never happen is the catalogue going blank —
  // or worse, the home page crashing — because a response was malformed. This
  // is the exact failure that took the home page down once already.
  const { MACHINES, hydrateMachines } = await import('../src/machinery-data.js');
  const before = MACHINES.length;
  ok(before > 0, `the built-in fallback is non-empty (${before} machines)`);

  ok(hydrateMachines(null) === false, 'a null response leaves the fallback standing');
  ok(hydrateMachines([]) === false, 'an empty response leaves the fallback standing');
  ok(hydrateMachines('not an array') === false, 'a non-array response leaves the fallback standing');
  ok(MACHINES.length === before, 'and the catalogue is untouched by all three');

  // Rows with no `type` — e.g. car listings from a proxy that answered the
  // wrong endpoint. Accepting them used to crash the home teaser on
  // m.type.replace(). They must be dropped, not rendered.
  const cars = [{ id: 1, make: 'Toyota', model: 'Land Cruiser', price: 41000 }];
  ok(hydrateMachines(cars) === false, 'rows with no type are rejected outright');
  ok(MACHINES.length === before, 'the catalogue is unchanged after a wholly bad batch');

  // A mostly-good batch with one bad row: keep the good ones, drop the bad.
  const mixed = [
    { id: 'a', ref: 'AR7-X-1', type: 'Excavators', brand: 'Doosan', model: 'DX300', year: 2019, price: 60000 },
    { id: 'b', make: 'Toyota' }
  ];
  ok(hydrateMachines(mixed) === true, 'a mixed batch is accepted for its good rows');
  ok(MACHINES.length === 1, `only the renderable row survives (got ${MACHINES.length})`);
  ok(MACHINES[0].type === 'Excavators', 'the surviving row is the renderable one');
  ok(Array.isArray(MACHINES[0].images), 'a hydrated row always has an images array');
  ok(Array.isArray(MACHINES[0].specs), 'a hydrated row always has a specs array');
  ok(!!MACHINES[0].name, 'a hydrated row always has a display name');
  ok(MACHINES.length === 1 && MACHINES[0].status === 'Available', 'a missing status defaults to Available');

  // Every hydrated row must survive the components that render it.
  let renderCrash = null;
  try {
    for (const m of MACHINES) {
      if (typeof m.type !== 'string') throw new Error('type is not a string');
      String(m.type).replace(/s$/, '');            // the home teaser
      String(m.type).toLowerCase();                // the URL helper
    }
  } catch (e) { renderCrash = e.message; }
  ok(renderCrash === null, `hydrated rows survive what the home teaser does to them${renderCrash ? ` — ${renderCrash}` : ''}`);
}

console.log('\n-- owner-requested hidden import recovery --');
{
  const seed = { ...GOOD, source_url:'https://supplier.example/machine', published:false, status:'Available', price_usd:null, images:[] };
  const db = fakeDb({machinery:[
    {...seed,id:'recover1',ref:'AR7-MC-901'},
    {...seed,id:'archive1',ref:'AR7-MC-902',status:'Archived'},
    {...seed,id:'sold1',ref:'AR7-MC-903',status:'Sold'},
    {...seed,id:'invalid1',ref:'AR7-MC-904',type:'unknown'},
    {...seed,id:'reserved1',ref:'AR7-MC-905',status:'Reserved'}
  ]});
  const denied = fakeRes();
  await handler(req('POST',{machinery:'recover-imports'},{confirm:false}),denied,{db,...asUser(ADMIN)});
  ok(denied.statusCode === 400,'bulk recovery needs explicit confirmation');
  const response = fakeRes();
  await handler(req('POST',{machinery:'recover-imports'},{confirm:true}),response,{db,...asUser(ADMIN)});
  ok(response.statusCode === 200,'confirmed recovery completes');
  ok(response.json().restored.length === 1 && response.json().restored[0] === 'AR7-MC-901','recovers valid available import without photos or a price');
  ok(db._tables.machinery.length === 5,'creates no duplicate records');
  ok(db._tables.machinery.filter(r=>r.published).length === 1,'does not publish archived, sold, reserved or invalid rows');
  const again = fakeRes();
  await handler(req('POST',{machinery:'recover-imports'},{confirm:true}),again,{db,...asUser(ADMIN)});
  ok(again.json().restored.length === 0,'recovery is idempotent');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
