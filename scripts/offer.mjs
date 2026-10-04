#!/usr/bin/env node
// Manage item-specific vehicle and machinery discounts.
//
// Examples:
//   npm run offer -- --set car:STOCK-REF=15 --until 2026-12-31
//   npm run offer -- --set machine:AR7-MC-003=20 --label "Warehouse clearance"
//   npm run offer -- --remove car:STOCK-REF
//   npm run offer -- --status
//   npm run offer -- --clear
//   npm run offer -- --set machine:AR7-MC-003=20 --dry-run
//
// Every discount is keyed to one stock reference; catalogue-wide discounts are
// deliberately unsupported. Campaign messaging is published in the CRM SEO
// desk. With Supabase service credentials this command updates site_settings
// immediately and refreshes public/stock-discounts.json; without them, it writes
// the static fallback, which takes effect on the next deployment.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import {
  EMPTY_STOCK_DISCOUNTS, STOCK_DISCOUNT_VERSION, STOCK_DISCOUNT_MIN_PERCENT,
  STOCK_DISCOUNT_MAX_PERCENT, parseStockDiscounts, stockDiscountKey,
  validateStockDiscounts, describeStockDiscounts
} from '../src/stock-discounts.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const STATIC_FILE = 'public/stock-discounts.json';
const nowDefault = () => new Date();
const owns = (o, k) => Object.prototype.hasOwnProperty.call(o, k);

export function parseArgs(argv = []) {
  const out = {sets: [], removals: [], label: null, until: null, noEndDate: false,
    clear: false, status: false, dryRun: false, help: false};
  const take = (i, flag) => {
    const arg = argv[i];
    if (arg === undefined || arg.startsWith('--')) throw new Error(`${flag} needs a value.`);
    return arg;
  };
  for (let i = 0; i < argv.length; i++) {
    let arg = argv[i];
    if (arg === '--help' || arg === '-h') out.help = true;
    else if (arg === '--dry-run') out.dryRun = true;
    else if (arg === '--clear') out.clear = true;
    else if (arg === '--status') out.status = true;
    else if (arg === '--no-end-date') out.noEndDate = true;
    else if (['--set', '--remove', '--until', '--label'].includes(arg)) {
      const value = take(++i, arg);
      if (arg === '--set') out.sets.push(value);
      else if (arg === '--remove') out.removals.push(value);
      else if (arg === '--until') out.until = value;
      else out.label = value;
    } else if (/^--(?:set|remove|until|label)=/.test(arg)) {
      const [flag, ...parts] = arg.split('=');
      const value = parts.join('=');
      if (!value) throw new Error(`${flag} needs a value.`);
      if (flag === '--set') out.sets.push(value);
      else if (flag === '--remove') out.removals.push(value);
      else if (flag === '--until') out.until = value;
      else out.label = value;
    } else throw new Error(`Unknown option: ${arg}`);
  }

  if (out.help) return out;
  if (out.clear && (out.status || out.sets.length || out.removals.length)) throw new Error('--clear cannot be combined with --status, --set or --remove.');
  if (out.status && (out.sets.length || out.removals.length || out.until || out.label || out.noEndDate)) throw new Error('--status cannot be combined with changes.');
  if (out.clear && (out.until || out.label || out.noEndDate)) throw new Error('--clear cannot be combined with discount fields.');
  if (out.noEndDate && out.until) throw new Error('Use either --until or --no-end-date, not both.');
  if (!out.help && !out.status && !out.clear && !out.sets.length && !out.removals.length) {
    throw new Error('Choose --set kind:REF=PERCENT, --remove kind:REF, --clear or --status.');
  }
  if (out.label && out.label.length > 40) throw new Error('Labels may be at most 40 characters.');
  if (out.until) {
    const checked = validateStockDiscounts({version: STOCK_DISCOUNT_VERSION, items: {
      'car:DATE-CHECK': {kind: 'car', ref: 'DATE-CHECK', percent: 1, until: out.until}
    }});
    if (!checked.ok) throw new Error(checked.error);
  }

  for (const value of out.sets) {
    const match = value.match(/^(car|machine):(.+?)=(\d+)$/i);
    if (!match) throw new Error(`--set expects car:REF=PERCENT or machine:REF=PERCENT, got "${value}".`);
    const key = stockDiscountKey(match[1], match[2]);
    const percent = Number(match[3]);
    if (!key) throw new Error(`Invalid stock reference in "${value}".`);
    if (!Number.isInteger(percent) || percent < STOCK_DISCOUNT_MIN_PERCENT || percent > STOCK_DISCOUNT_MAX_PERCENT) {
      throw new Error(`${key} must have a whole-number discount between ${STOCK_DISCOUNT_MIN_PERCENT}% and ${STOCK_DISCOUNT_MAX_PERCENT}%.`);
    }
  }
  for (const value of out.removals) {
    if (!parseDiscountKey(value)) throw new Error(`--remove expects car:REF or machine:REF, got "${value}".`);
  }
  return out;
}

function parseDiscountKey(value) {
  const match = String(value || '').match(/^(car|machine):(.+)$/i);
  return match ? stockDiscountKey(match[1], match[2]) : '';
}

export function applyChanges(current, options, {now = nowDefault(), publishedBy = 'npm run offer'} = {}) {
  const items = {...parseStockDiscounts(current).items};
  if (options.clear) return EMPTY_STOCK_DISCOUNTS;
  for (const value of options.removals) delete items[parseDiscountKey(value)];
  for (const value of options.sets) {
    const match = value.match(/^(car|machine):(.+?)=(\d+)$/i);
    const kind = match[1].toLowerCase();
    const ref = match[2].trim().toUpperCase();
    const key = stockDiscountKey(kind, ref);
    const old = items[key];
    items[key] = {
      kind, ref, percent: Number(match[3]),
      label: options.label ?? old?.label ?? null,
      until: options.noEndDate ? null : options.until ?? old?.until ?? null,
      publishedAt: now.toISOString(), publishedBy
    };
  }
  const checked = validateStockDiscounts({version: STOCK_DISCOUNT_VERSION, items});
  if (!checked.ok) throw new Error(checked.error);
  return checked.value;
}

function credentials(env) {
  const url = String(env.SUPABASE_URL || '').replace(/\/+$/, '');
  const key = String(env.SUPABASE_SERVICE_ROLE_KEY || '');
  return url && key ? {url, key} : null;
}

/** Supabase PostgREST reader. Always inject fetch in tests; tests never egress. */
export async function readLiveSetting({env = process.env, fetchImpl = fetch} = {}) {
  const auth = credentials(env);
  if (!auth) return null;
  const response = await fetchImpl(`${auth.url}/rest/v1/site_settings?key=eq.stock_discounts&select=value`, {
    headers: {apikey: auth.key, Authorization: `Bearer ${auth.key}`}
  });
  if (!response.ok) throw new Error(`Could not read stock_discounts (${response.status}).`);
  const rows = await response.json();
  return Array.isArray(rows) ? rows[0]?.value ?? null : null;
}

/** Supabase PostgREST upsert. Always inject fetch in tests; tests never egress. */
export async function writeLiveSetting(value, {env = process.env, fetchImpl = fetch} = {}) {
  const auth = credentials(env);
  if (!auth) return false;
  const response = await fetchImpl(`${auth.url}/rest/v1/site_settings?on_conflict=key`, {
    method: 'POST',
    headers: {
      apikey: auth.key, Authorization: `Bearer ${auth.key}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=minimal'
    },
    body: JSON.stringify([{key: 'stock_discounts', value: JSON.stringify(value), updated_at: new Date().toISOString()}])
  });
  if (!response.ok) throw new Error(`Could not publish stock_discounts (${response.status}).`);
  return true;
}

function readStatic(cwd, readFile = readFileSync, exists = existsSync) {
  const file = path.join(cwd, STATIC_FILE);
  if (!exists(file)) return EMPTY_STOCK_DISCOUNTS;
  try { return parseStockDiscounts(readFile(file, 'utf8')); }
  catch { return EMPTY_STOCK_DISCOUNTS; }
}

export function summaryText(discounts, now = new Date()) {
  const result = describeStockDiscounts(discounts, now);
  const entries = Object.entries(parseStockDiscounts(discounts).items);
  if (!entries.length) return 'No stock discounts are configured.';
  const lines = entries.map(([key, item]) => `  ${key.padEnd(28)} ${String(item.percent).padStart(2)}%${item.until ? ` · through ${item.until}` : ' · no end date'}${item.label ? ` · ${item.label}` : ''}`);
  return `${result ? `Live summary: ${result.line}${result.untilLabel ? ` · through ${result.untilLabel}` : ''}` : 'No discounts are live today.'}\n${lines.join('\n')}`;
}

const HELP = `Per-stock discounts only — campaigns are published from the CRM SEO desk.\n\nUsage:\n  npm run offer -- --set car:REF=15 [--until YYYY-MM-DD] [--label TEXT]\n  npm run offer -- --set machine:REF=20 --no-end-date\n  npm run offer -- --remove car:REF\n  npm run offer -- --status\n  npm run offer -- --clear\n  Add --dry-run to preview without reading/writing the live setting or files.`;

export async function main(argv = process.argv.slice(2), deps = {}) {
  const cwd = deps.cwd || root;
  const env = deps.env || process.env;
  const fetchImpl = deps.fetchImpl || fetch;
  const log = deps.log || (line => console.log(line));
  const error = deps.error || (line => console.error(line));
  const readFile = deps.readFile || readFileSync;
  const writeFile = deps.writeFile || writeFileSync;
  const exists = deps.exists || existsSync;
  const now = deps.now || nowDefault();
  try {
    const options = parseArgs(argv);
    if (options.help) { log(HELP); return 0; }
    if (options.status) {
      const live = options.dryRun ? null : await readLiveSetting({env, fetchImpl});
      log(summaryText(live ?? readStatic(cwd, readFile, exists), now));
      return 0;
    }
    const live = options.dryRun ? null : await readLiveSetting({env, fetchImpl});
    const current = live ?? readStatic(cwd, readFile, exists);
    const next = applyChanges(current, options, {now, publishedBy: env.USER || env.USERNAME || 'npm run offer'});
    log(summaryText(next, now));
    if (options.dryRun) { log('Dry run — nothing published or written.'); return 0; }

    const published = await writeLiveSetting(next, {env, fetchImpl});
    const output = path.join(cwd, STATIC_FILE);
    const contents = JSON.stringify(next, null, 2) + '\n';
    if (deps.mkdir) deps.mkdir(path.dirname(output), {recursive: true});
    else if (cwd === root) {
      // The tracked fallback file exists in the repository; no directory write
      // is needed in the normal CLI path.
    }
    writeFile(output, contents);
    log(published
      ? 'Published to site_settings; the public site reads it on its next settings refresh. Static fallback refreshed.'
      : `Saved ${STATIC_FILE}; changes take effect after the next deployment. To publish immediately, use CRM → Price offers.`);
    return 0;
  } catch (e) {
    error(`Stock discount command failed: ${e.message}`);
    return 1;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().then(code => { process.exitCode = code; });
}
