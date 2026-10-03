#!/usr/bin/env node
// Supplier import for the machinery desk — the Goo-net equivalent for China.
//
//   npm run machinery:import                  read the inbox and report
//   npm run machinery:import -- --write       merge into src/machinery-data.js
//   npm run machinery:import -- --check       validate only (exit 1 on problems)
//
// HOW THIS IS MEANT TO BE USED
// -----------------------------
// You are going to buy a machine from a Chinese supplier. Before you pay, that
// supplier sends you what every exporter sends their buyer: photographs of the
// actual unit, the hour meter, the spec plate, and a price. Those photos are
// yours to publish — you are the customer, and the seller is asking you to sell
// it onward. This script turns that package into a listing.
//
//   machinery-suppliers/
//     zhengzhou-heavy/
//       supplier.json          ← the price list + machine facts
//       photos/
//         dx300-1.jpg          ← straight off the supplier's phone, untouched
//         dx300-2.jpg
//         dx300-3.jpg
//
// `supplier.json` per supplier folder:
//
//   {
//     "supplier": "Zhengzhou Heavy Machinery",
//     "country": "China",
//     "receivedAt": "2026-10-03",
//     "machines": [
//       {
//         "id": "mch-dx300",
//         "name": "Doosan DX300LC-9C",
//         "brand": "Doosan", "type": "Excavators",
//         "year": 2019, "hours": 6800,
//         "supplierPrice": 50000,        // USD, FOB, what they quoted you
//         "location": "Shandong",
//         "summary": "…",
//         "specs": [["Operating weight", "30,200 kg"], …],
//         "photos": ["photos/dx300-1.jpg", "photos/dx300-2.jpg"]
//       }
//     ]
//   }
//
// WHAT THE SCRIPT DOES AND DOES NOT DO
// ------------------------------------
//   • It brands every supplier photo with the AR7 mark, the machine name and
//     the stock reference (scripts/brand-machine-photo.sh), so what we publish
//     is our own record of the unit we inspected.
//   • It applies MACHINERY_MARKUP to supplierPrice and emits `price`. The
//     markup lives in src/machinery-data.js — one number, visible, changeable.
//   • It refuses a listing with no photos. A machine nobody can see is not a
//     listing, and a card with a stand-in image is how a catalogue starts to
//     lie about what it has.
//   • It never fetches anything from the internet. It reads the folder you
//     filled. There is no scraper here on purpose: see MACHINERY-SOURCES.md.

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const INBOX = path.join(root, 'machinery-suppliers');
const PHOTO_OUT = path.join(root, 'public/assets/machinery');
const DATA_FILE = path.join(root, 'src/machinery-data.js');
const BRAND = path.join(root, 'scripts/brand-machine-photo.sh');

const args = process.argv.slice(2);
const flag = n => args.includes('--' + n);

const { MACHINERY_MARKUP, MACHINES } = await import(path.join(root, 'src/machinery-data.js'));
const roundPrice = n => Math.round(n / 50) * 50;

const slug = v => String(v || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

function loadSuppliers() {
  if (!existsSync(INBOX)) return [];
  const out = [];
  for (const dir of readdirSync(INBOX, { withFileTypes: true })) {
    // Folders starting with _ are documentation, not supplier packages:
    // _example documents the format and must never be imported.
    if (!dir.isDirectory() || dir.name.startsWith('_') || dir.name.startsWith('.')) continue;
    const file = path.join(INBOX, dir.name, 'supplier.json');
    if (!existsSync(file)) continue;
    try {
      out.push({ folder: dir.name, dir: path.join(INBOX, dir.name), data: JSON.parse(readFileSync(file, 'utf8')) });
    } catch (e) {
      out.push({ folder: dir.name, error: e.message });
    }
  }
  return out;
}

/** Validate one machine entry. Returns { ok, problems[] }. */
function validate(machine, supplier, dir) {
  const problems = [];
  const where = `${supplier}/${machine.id || '(no id)'}`;
  if (!machine.id) problems.push(`${where}: missing "id"`);
  if (!machine.name) problems.push(`${where}: missing "name"`);
  if (!machine.brand) problems.push(`${where}: missing "brand"`);
  if (!machine.type) problems.push(`${where}: missing "type"`);
  else if (!['Excavators', 'Loaders', 'Trucks', 'Cranes'].includes(machine.type)) {
    problems.push(`${where}: type "${machine.type}" is not one of Excavators, Loaders, Trucks, Cranes`);
  }
  if (!Number.isFinite(Number(machine.supplierPrice)) || Number(machine.supplierPrice) <= 0) {
    problems.push(`${where}: "supplierPrice" must be a positive number (USD FOB quoted by the supplier)`);
  }
  if (!Number.isFinite(Number(machine.year)) || Number(machine.year) < 1990) {
    problems.push(`${where}: "year" must be a real model year`);
  }
  const photos = Array.isArray(machine.photos) ? machine.photos.filter(Boolean) : [];
  if (!photos.length) {
    problems.push(`${where}: no photos. A listing needs at least one photograph of the actual unit.`);
  }
  for (const rel of photos) {
    if (!existsSync(path.resolve(dir, rel))) problems.push(`${where}: photo not found: ${rel}`);
  }
  if (!Array.isArray(machine.specs) || !machine.specs.length) {
    problems.push(`${where}: no "specs". A buyer needs the technical facts.`);
  } else {
    for (const spec of machine.specs) {
      if (!Array.isArray(spec) || spec.length !== 2) problems.push(`${where}: every spec must be ["Label", "Value"]`);
    }
  }
  return { ok: !problems.length, problems };
}

function run() {
  const suppliers = loadSuppliers();
  if (!suppliers.length) {
    console.log('No supplier packages found.\n');
    console.log('Create machinery-suppliers/<supplier-name>/supplier.json plus a photos/ folder.');
    console.log('The full format is documented at the top of scripts/import-machinery.mjs');
    console.log('and in MACHINERY-SOURCES.md.');
    return 0;
  }

  const problems = [];
  const ready = [];
  for (const s of suppliers) {
    if (s.error) { problems.push(`${s.folder}/supplier.json is not valid JSON: ${s.error}`); continue; }
    const label = s.data.supplier || s.folder;
    const machines = Array.isArray(s.data.machines) ? s.data.machines : [];
    if (!machines.length) { problems.push(`${s.folder}: "machines" is empty`); continue; }
    for (const m of machines) {
      const v = validate(m, label, s.dir);
      problems.push(...v.problems);
      if (v.ok) ready.push({ supplier: label, dir: s.dir, machine: m });
    }
  }

  console.log(`Supplier packages: ${suppliers.length}`);
  console.log(`Machines ready to import: ${ready.length}`);
  if (problems.length) {
    console.log(`\n${problems.length} problem(s):`);
    for (const p of problems) console.log('  ✗ ' + p);
  }

  if (flag('check')) return problems.length ? 1 : 0;
  if (!ready.length) return problems.length ? 1 : 0;

  console.log('\nBranding photos and building listings:\n');
  const built = [];
  for (const { supplier, dir, machine } of ready) {
    const images = [];
    (machine.photos || []).forEach((rel, i) => {
      const src = path.resolve(dir, rel);
      const name = `${slug(machine.name)}-${i + 1}`;
      const brand = !!machine.brandPhotos;
      if (brand) {
        try {
          execFileSync('bash', [BRAND, src, name, machine.name, machine.ref || machine.id], { cwd: root, stdio: 'pipe' });
          images.push('/assets/machinery/' + name + '.webp');
        } catch (e) {
          console.log(`  ! could not brand ${rel}: ${e.message.split('\n')[0]}`);
        }
      }
      if (!images.includes('/assets/machinery/' + name + '.webp')) {
        // No branding requested or ImageMagick unavailable: still publish the
        // supplier's own photo, copied in unchanged.
        const ext = path.extname(src).toLowerCase() || '.jpg';
        const dest = path.join(PHOTO_OUT, name + ext);
        writeFileSync(dest, readFileSync(src));
        images.push('/assets/machinery/' + name + ext);
      }
    });

    const price = roundPrice(Number(machine.supplierPrice) * (1 + MACHINERY_MARKUP));
    built.push({ ...machine, supplier, price, images });
    console.log(`  ✓ ${machine.name}  →  ${images.length} photo(s), list price $${price.toLocaleString('en-US')} (supplier $${Number(machine.supplierPrice).toLocaleString('en-US')} + ${Math.round(MACHINERY_MARKUP * 100)}%)`);
  }

  const entry = m => `  {
    id: ${JSON.stringify(m.id)},
    ref: ${JSON.stringify(m.ref || 'AR7-MC-XXX')},
    name: ${JSON.stringify(m.name)},
    brand: ${JSON.stringify(m.brand)},
    type: ${JSON.stringify(m.type)},
    year: ${Number(m.year)},
    hours: ${Number(m.hours) || 0},
    supplierPrice: ${Number(m.supplierPrice)},
    price: ${m.price},
    origin: 'China',
    location: ${JSON.stringify(m.location || 'China')},
    status: 'Available',
    image: ${JSON.stringify(m.images[0])},
    images: ${JSON.stringify(m.images)},
    summary: ${JSON.stringify(m.summary || '')},
    specs: ${JSON.stringify(m.specs)}
  }`;

  console.log('\nGenerated entries (paste into MACHINES in src/machinery-data.js):\n');
  console.log(built.map(entry).join(',\n') + '\n');

  if (flag('write')) {
    const current = readFileSync(DATA_FILE, 'utf8');
    const existing = new Set(MACHINES.map(m => m.id));
    const fresh = built.filter(m => !existing.has(m.id));
    if (!fresh.length) {
      console.log('Nothing new to merge — every imported machine id is already in the catalogue.');
    } else {
      const block = fresh.map(entry).join(',\n');
      const marker = 'export const MACHINES = [\n';
      const at = current.indexOf(marker);
      if (at < 0) { console.log('Could not find MACHINES in src/machinery-data.js — paste the entries by hand.'); return 1; }
      const insertAt = at + marker.length;
      writeFileSync(DATA_FILE,
        current.slice(0, insertAt) + block + ',\n' + current.slice(insertAt));
      console.log(`Wrote ${fresh.length} machine(s) into src/machinery-data.js.`);
      console.log('Now run: npm test && npm run seo');
    }
  } else {
    console.log('Dry run. Re-run with --write to merge these into src/machinery-data.js.');
  }
  return problems.length ? 1 : 0;
}

process.exit(run());
