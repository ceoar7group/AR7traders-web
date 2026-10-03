#!/usr/bin/env node
// Apply a price offer — the same offer the CRM's "Price offers" panel writes.
//
// The website reads one setting (`offer`) and one file (`public/offer.json`),
// both in the shape src/offers.js validates. This script is the command-line
// and agent face of that: it takes a sentence, or explicit flags, turns it into
// a validated offer, shows what buyers will pay for every machine, and writes
// it. No deploy, no build: the settings API holds the live one, the file is the
// fallback for a site with no API.
//
// Usage
//   npm run offer -- "20% off machinery until 30 November"
//   npm run offer -- --percent 15 --scope machinery --types Excavators
//   npm run offer -- --percent 10 --scope all --until 2026-12-31 --label "Winter sale"
//   npm run offer -- --machine AR7-MC-003=25          # one unit only, no campaign
//   npm run offer -- --clear
//   npm run offer -- --status
//   npm run offer -- --dry-run "10% off mymachinery"  # validate + preview only
//
// Publishing needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (the same two the
// CRM uses through the API). Without them the script still validates and
// previews, and writes public/offer.json, which is what a static deployment
// reads — it says which of the two it did, every time.
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');
const read = p => readFileSync(path.join(root, p), 'utf8');

const { MACHINES, listPriceUSD } = await import('../src/machinery-data.js');
const { validateOffer, parseOffer, priceWithOffer, percentFor, describeOffer } = await import('../src/offers.js');
const { parseOfferRequest } = await import('../src/offers-request.js');

const argv = process.argv.slice(2);
const flag = name => {
  const i = argv.indexOf('--' + name);
  if (i === -1) return null;
  const next = argv[i + 1];
  return next && !next.startsWith('--') ? next : true;
};
const sentence = argv.filter(a => !a.startsWith('--') && argv[argv.indexOf(a) - 1] !== '--percent'
  && argv[argv.indexOf(a) - 1] !== '--scope' && argv[argv.indexOf(a) - 1] !== '--until'
  && argv[argv.indexOf(a) - 1] !== '--label' && argv[argv.indexOf(a) - 1] !== '--types'
  && argv[argv.indexOf(a) - 1] !== '--machine').join(' ').trim();

const money = n => '$' + Number(n || 0).toLocaleString('en-US');

// ---------------------------------------------------------------------------
// Build the offer: from the sentence, from flags, or from --clear
// ---------------------------------------------------------------------------
let offer = null;
let note = '';

if (flag('status')) {
  const current = currentOffer();
  if (!current) console.log('No offer is live. Every page shows the list price.');
  else {
    const d = describeOffer(current);
    console.log(`Live offer: ${d.line}${d.untilLabel ? ' — ends ' + d.untilLabel : ' — no end date'}`);
    console.log(`   scope ${current.scope}${current.types?.length ? ' · ' + current.types.join(', ') : ''} · ${current.percent}% · set by ${current.publishedBy || 'unknown'}`);
    report(current);
  }
  process.exit(0);
}

if (flag('clear')) {
  offer = { active: false };
  note = 'Clearing the offer — visitors go back to list prices.';
} else if (sentence) {
  const parsed = parseOfferRequest(sentence, { machines: MACHINES, existing: currentOffer() });
  if (!parsed.ok) {
    console.error('Could not read that: ' + parsed.reply);
    console.error('Say it as a percentage and a scope, e.g. "20% off machinery until 30 November".');
    process.exit(1);
  }
  offer = parsed.offer;
  note = parsed.reply;
} else {
  const percent = Number(flag('percent'));
  const scope = String(flag('scope') || 'machinery');
  const types = flag('types') ? String(flag('types')).split(',').map(s => s.trim()).filter(Boolean) : [];
  const machines = {};
  const unit = flag('machine');
  if (unit && unit !== true) {
    for (const pair of String(unit).split(',')) {
      const [ref, pct] = pair.split('=');
      if (!ref || !Number(pct)) { console.error(`--machine expects REF=PERCENT, got "${pair}"`); process.exit(1); }
      machines[ref.trim().toUpperCase()] = Number(pct);
    }
  }
  if (!Number.isFinite(percent) || percent <= 0) {
    console.error('Nothing to do. Give a sentence ("20% off machinery") or --percent 20 --scope machinery.');
    console.error('Other flags: --scope machinery|cars|all, --types Excavators,Loaders, --until YYYY-MM-DD, --label "Autumn offer".');
    process.exit(1);
  }
  const draft = {
    active: true, scope, percent, types, machines,
    label: flag('label') && flag('label') !== true ? String(flag('label')) : null,
    headline: `${Math.round(percent)}% off ${types.length ? types.join(', ').toLowerCase() : scope === 'all' ? 'everything' : scope === 'cars' ? 'cars' : 'machinery'}`,
    until: flag('until') && flag('until') !== true ? String(flag('until')) : null,
    publishedBy: 'npm run offer'
  };
  offer = draft;
  note = `Offers ${draft.headline}${draft.until ? ' until ' + draft.until : ''}.`;
}

const checked = validateOffer(offer);
if (!checked.ok) { console.error('That offer is not valid: ' + checked.error); process.exit(1); }
const value = checked.value;

// ---------------------------------------------------------------------------
// Preview — the same arithmetic the website runs
// ---------------------------------------------------------------------------
function report(live) {
  console.log('');
  console.log('  machine                 type        list      offer    buyer pays');
  console.log('  ────────────────────────────────────────────────────────────────────');
  let totalWas = 0, totalNow = 0;
  for (const m of MACHINES) {
    const pct = percentFor(live, 'machine', { ref: m.ref, type: m.type });
    const p = priceWithOffer(listPriceUSD(m), pct);
    totalWas += p.was; totalNow += p.now;
    console.log(`  ${m.ref.padEnd(12)} ${m.name.slice(0, 20).padEnd(21)} ${String(m.type).padEnd(11)} ${money(p.was).padStart(8)} ${(p.hasOffer ? p.percent + '%' : '—').padStart(7)} ${money(p.now).padStart(12)}`);
  }
  if (totalNow < totalWas) {
    console.log(`  ${' '.repeat(12)} ${'catalogue total'.padEnd(21)} ${' '.repeat(11)} ${money(totalWas).padStart(8)} ${' '.repeat(7)} ${money(totalNow).padStart(12)}  (${money(totalWas - totalNow)} off)`);
  }
  console.log('');
}

/** The live offer, from the settings table when this machine can reach it. */
function currentOffer() {
  try {
    const env = readEnv();
    if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return fileOffer();
    const res = spawnSync('node', ['-e', `
      const {createClient}=require('@supabase/supabase-js');
      const c=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
      c.from('site_settings').select('value').eq('key','offer').single().then(({data})=>{
        console.log(data?.value||''); }).catch(()=>{});
    `], { env: { ...process.env, ...env }, encoding: 'utf8', timeout: 20000 });
    return parseOffer(String(res.stdout || '').trim()) || fileOffer();
  } catch { return fileOffer(); }
}

function fileOffer() {
  try {
    if (!existsSync(path.join(root, 'public/offer.json'))) return null;
    return parseOffer(read('public/offer.json'));
  } catch { return null; }
}

function readEnv() {
  const out = {};
  for (const file of ['.env', '.env.local', '.env.production']) {
    try {
      for (const line of read(file).split('\n')) {
        const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
        if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
      }
    } catch { /* the file may not exist */ }
  }
  return { ...out, ...process.env };
}

import { spawnSync } from 'node:child_process';

console.log(note);
if (value.active) {
  const d = describeOffer(value);
  console.log('');
  console.log(`  ${d.line}${d.untilLabel ? ' — ends ' + d.untilLabel : ' — no end date'}`);
  console.log('  ' + d.note);
  report(value);
}

if (flag('dry-run')) {
  console.log('Dry run — nothing written. Drop --dry-run to publish.');
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Write it: to the settings table (live) and to public/offer.json (fallback)
// ---------------------------------------------------------------------------
const json = JSON.stringify(value);
let published = false;
try {
  const env = readEnv();
  if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
    const res = spawnSync('node', ['-e', `
      const {createClient}=require('@supabase/supabase-js');
      const c=createClient(process.env.SUPABASE_URL,process.env.SUPABASE_SERVICE_ROLE_KEY);
      c.from('site_settings').upsert({key:'offer',value:process.env.AR7_OFFER,label:'Live price offer'},{onConflict:'key'})
        .then(({error})=>{ if(error){console.error(error.message);process.exit(1);} console.log('settings ok'); });
    `], { env: { ...process.env, ...env, AR7_OFFER: json }, encoding: 'utf8', timeout: 30000 });
    published = /settings ok/.test(res.stdout || '');
    if (!published) console.error('   settings write failed: ' + String(res.stderr || res.stdout).trim().slice(0, 200));
  } else {
    console.log('   No SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY here, so the live setting was not written.');
  }
} catch (err) {
  console.error('   settings write threw: ' + err.message);
}

writeFileSync(path.join(root, 'public/offer.json'), JSON.stringify(value, null, 2) + '\n');
console.log(`   wrote public/offer.json (${value.active ? value.percent + '% off ' + value.scope : 'cleared'})`);
console.log(published
  ? '   live now: the website reads the setting on its next page load.'
  : '   the site will pick up public/offer.json on the next deploy; to make it live immediately, publish the same offer from the CRM (Website settings / Price offers).');
console.log('');
