// Prospect radar — collects PUBLIC business contacts of companies that
// import used cars from Japan (dealers, importers, clearing agents), so the
// sales desk and the AI outreach drafts start from real, current data.
//
//   PROSPECT_SOURCES="https://…,https://…" \
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… \
//   node scripts/prospect-scan.mjs
//
// Honesty rules (deliberate, do not relax):
//   • PUBLIC business pages only — directories, "our dealers" pages, trade
//     association member lists. Published business contact details are fair
//     to collect; personal data scraping is not what this does.
//   • robots.txt is respected: a disallowed path is skipped, not fetched.
//   • Everything lands in the `prospects` CRM tab for a HUMAN to review and
//     convert to a lead. Nothing is auto-emailed — cold email without review
//     is how a domain gets blacklisted and a brand gets burned.
//
// Sources come from the PROSPECT_SOURCES env (comma/newline separated URLs)
// or scripts/prospect-sources.txt (one URL per line, # comments). With a
// JINA_API_KEY the page is read through r.jina.ai (renders JS-heavy
// directories); without it a plain fetch is used.
//
// Pure extraction functions are exported for scripts/prospect-scan.test.mjs,
// which runs on fixtures — the sandbox has no outbound web, the real run
// happens in GitHub Actions (.github/workflows/prospect-scan.yml).

import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// ---------------------------------------------------------------------------
// Extraction (pure)
// ---------------------------------------------------------------------------

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,24}/g;
// International numbers as printed on business pages: +254 722 123456,
// +81-3-1234-5678, 0300 1234567 … at least 9 digits once stripped.
const PHONE_RE = /(?:\+|00)\d[\d\s().-]{7,18}\d/g;

/** Obvious non-contact addresses: trackers, packagers, example domains. */
export function isJunkEmail(email) {
  const e = String(email || '').toLowerCase();
  if (!e || e.length > 80) return true;
  if (/\.(png|jpe?g|gif|webp|svg|css|js)$/.test(e)) return true; // img@2x.png
  if (/@(example|sentry|wixpress|placeholder|domain|email|test)\./.test(e)) return true;
  if (/^(noreply|no-reply|donotreply|mailer-daemon|postmaster|abuse|privacy|dpo)@/.test(e)) return true;
  if (/@[^@]*\.(local|invalid|test)$/.test(e)) return true;
  return false;
}

export function extractEmails(text) {
  const found = String(text || '').match(EMAIL_RE) || [];
  return [...new Set(found.map(e => e.toLowerCase()).filter(e => !isJunkEmail(e)))].slice(0, 20);
}

export function extractPhones(text) {
  const found = String(text || '').match(PHONE_RE) || [];
  const cleaned = found
    .map(p => p.replace(/[^\d+]/g, '').replace(/^00/, '+'))
    .filter(p => { const d = p.replace(/\D/g, ''); return d.length >= 9 && d.length <= 15; });
  return [...new Set(cleaned)].slice(0, 10);
}

/** Company name guess: page <title> / first heading, cleaned of boilerplate. */
export function guessCompany(text, fallbackHost = '') {
  const m = String(text || '').match(/<title[^>]*>([^<]{2,120})<\/title>/i)
    || String(text || '').match(/^Title:\s*(.{2,120})$/mi)
    || String(text || '').match(/<h1[^>]*>([^<]{2,120})<\/h1>/i);
  let name = m ? m[1] : '';
  name = name.split(/[|–—-]{1,2}|::/)[0].replace(/\s+/g, ' ').trim();
  if (!name || /^(home|welcome|index|untitled)$/i.test(name)) {
    name = String(fallbackHost || '').replace(/^www\./, '').split('.')[0];
    name = name ? name[0].toUpperCase() + name.slice(1) : '';
  }
  return name.slice(0, 120);
}

/** One page → one prospect row (or null when the page yields no contacts). */
export function extractContacts(text, sourceUrl = '', country = '') {
  const emails = extractEmails(text);
  const phones = extractPhones(text);
  if (!emails.length && !phones.length) return null;
  let host = '';
  try { host = new URL(sourceUrl).hostname; } catch { /* fixture without URL */ }
  return {
    company: guessCompany(text, host),
    website: host ? 'https://' + host : null,
    country: country || null,
    emails, phones,
    source_url: String(sourceUrl || '').slice(0, 500) || null,
    status: 'new'
  };
}

/** Merge rows that are the same business (same website or same first email). */
export function dedupeProspects(rows) {
  const byKey = new Map();
  for (const r of rows || []) {
    if (!r) continue;
    const key = (r.website || r.emails?.[0] || r.company || Math.random()).toString().toLowerCase();
    const prev = byKey.get(key);
    if (!prev) { byKey.set(key, { ...r }); continue; }
    prev.emails = [...new Set([...(prev.emails || []), ...(r.emails || [])])].slice(0, 20);
    prev.phones = [...new Set([...(prev.phones || []), ...(r.phones || [])])].slice(0, 10);
    if (!prev.company && r.company) prev.company = r.company;
  }
  return [...byKey.values()];
}

// ---------------------------------------------------------------------------
// Fetching (network — GitHub Actions only; the test never calls these)
// ---------------------------------------------------------------------------

const UA = 'AR7TradersProspectBot/1.0 (+https://ar7traders.com; business-directory reader)';

/** Minimal robots.txt check for our UA (and *): is this path allowed? */
export function robotsAllows(robotsTxt, path) {
  const lines = String(robotsTxt || '').split(/\r?\n/);
  let applies = false; const dis = [];
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, '').trim();
    const ua = line.match(/^user-agent:\s*(.+)$/i);
    if (ua) { applies = ua[1].trim() === '*' || /ar7/i.test(ua[1]); continue; }
    const d = line.match(/^disallow:\s*(.*)$/i);
    if (d && applies) dis.push(d[1].trim());
  }
  return !dis.some(rule => rule && path.startsWith(rule));
}

async function allowedByRobots(url) {
  try {
    const u = new URL(url);
    const r = await fetch(u.origin + '/robots.txt', { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(10000) });
    if (!r.ok) return true; // no robots file → public default
    return robotsAllows(await r.text(), u.pathname);
  } catch { return true; }
}

async function readPage(url) {
  const jina = String(process.env.JINA_API_KEY || '').trim();
  if (jina) {
    const r = await fetch('https://r.jina.ai/' + url, {
      headers: { Authorization: 'Bearer ' + jina, 'X-Return-Format': 'text' },
      signal: AbortSignal.timeout(45000)
    });
    if (r.ok) return await r.text();
  }
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html' }, signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error('HTTP ' + r.status);
  return await r.text();
}

export function sourceList(env = process.env, fileUrl = new URL('./prospect-sources.txt', import.meta.url)) {
  const fromEnv = String(env.PROSPECT_SOURCES || '').split(/[\n,]+/).map(s => s.trim()).filter(s => /^https?:\/\//.test(s));
  if (fromEnv.length) return fromEnv.slice(0, 40);
  try {
    const file = fileURLToPath(fileUrl);
    if (existsSync(file)) {
      return readFileSync(file, 'utf8').split(/\r?\n/)
        .map(s => s.trim()).filter(s => s && !s.startsWith('#') && /^https?:\/\//.test(s)).slice(0, 40);
    }
  } catch { /* no file */ }
  return [];
}

// ---------------------------------------------------------------------------
// Main (upsert into Supabase `prospects`)
// ---------------------------------------------------------------------------

async function main() {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are required.'); process.exit(1); }
  const sources = sourceList();
  if (!sources.length) { console.log('No sources configured (PROSPECT_SOURCES or scripts/prospect-sources.txt) — nothing to scan.'); return; }

  const { createClient } = await import('@supabase/supabase-js');
  const db = createClient(url, key, { auth: { persistSession: false } });

  const rows = [];
  for (const src of sources) {
    try {
      if (!(await allowedByRobots(src))) { console.log('robots.txt disallows, skipping:', src); continue; }
      const text = await readPage(src);
      const row = extractContacts(text, src);
      if (row) { rows.push(row); console.log('✓', src, '→', row.emails.length, 'email(s),', row.phones.length, 'phone(s)'); }
      else console.log('·', src, '→ no public contacts found');
      await new Promise(r => setTimeout(r, 1500)); // be a polite guest
    } catch (e) { console.log('✗', src, '→', e.message); }
  }

  const unique = dedupeProspects(rows);
  let saved = 0, skipped = 0;
  for (const row of unique) {
    // Insert-only upsert: a prospect a human already worked (status changed,
    // note added) must never be overwritten by tonight's scan.
    const q = row.website
      ? db.from('prospects').select('id').eq('website', row.website).limit(1)
      : db.from('prospects').select('id').contains('emails', row.emails.slice(0, 1)).limit(1);
    const { data: existing } = await q;
    if (existing?.length) { skipped++; continue; }
    const { error } = await db.from('prospects').insert(row);
    if (error) console.log('insert failed:', row.website || row.company, error.code || error.message);
    else saved++;
  }
  console.log(`Done. ${saved} new prospect(s), ${skipped} already known, ${sources.length} source(s) scanned.`);
}

const isCli = process.argv[1] && import.meta.url === new URL('file://' + process.argv[1].replace(/\\/g, '/')).href;
if (isCli) main().catch(e => { console.error(e); process.exit(1); });
