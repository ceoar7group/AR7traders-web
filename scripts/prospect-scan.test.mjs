// Prospect radar contract tests (npm run test:prospects).
//
// The sandbox has no outbound web, so these tests run the PURE extraction
// pipeline on fixtures — the shapes real directory pages produce. The
// network run happens in GitHub Actions (prospect-scan.yml).
let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
const ok = (cond, msg) => { if (cond) { pass++; say('  ✓ ' + msg); } else { fail++; process.stderr.write('  ✗ ' + msg + '\n'); } };

import {
  extractEmails, extractPhones, isJunkEmail, guessCompany,
  extractContacts, dedupeProspects, robotsAllows, sourceList
} from './prospect-scan.mjs';

say('1) email extraction — real contacts in, junk out');
{
  const page = `
    <title>Mombasa Auto Imports — Japanese used cars Kenya</title>
    Contact our sales team: Sales@Example-Dealer.co.ke or imports@example-dealer.co.ke.
    Hotline +254 722 123 456 · Office +254 (41) 222-3344
    <img src="logo@2x.png"> tracking: beacon@sentry.io, no-reply@example-dealer.co.ke
    Data protection: dpo@example-dealer.co.ke
  `;
  const emails = extractEmails(page);
  ok(emails.includes('sales@example-dealer.co.ke'), 'address found and lowercased');
  ok(emails.includes('imports@example-dealer.co.ke'), 'second address found');
  ok(!emails.some(e => e.includes('sentry')), 'tracker addresses dropped');
  ok(!emails.some(e => e.startsWith('no-reply')), 'no-reply dropped');
  ok(!emails.some(e => e.startsWith('dpo@')), 'data-protection officer dropped (not a sales contact)');
  ok(!emails.some(e => e.endsWith('.png')), 'image names that look like emails dropped');
  ok(isJunkEmail('x@example.com') && !isJunkEmail('sales@autotrader.co.ke'), 'isJunkEmail splits junk from real');
}

say('\n2) phone extraction — international formats, bounded length');
{
  const text = 'Call +254 722 123 456, or +81-3-1234-5678. Fax 0043. Serial 123456789012345678901.';
  const phones = extractPhones(text);
  ok(phones.includes('+254722123456'), 'spaced Kenyan mobile normalised');
  ok(phones.includes('+81312345678'), 'hyphenated Japanese number normalised');
  ok(phones.length === 2, 'short codes and long serials are not phones');
  ok(extractPhones('0044 20 7946 0999').includes('+442079460999'), '00-prefix converted to +');
}

say('\n3) company guess + one-page contact row');
{
  const html = '<title>Karachi Motors Trading | Japanese Car Importers</title> info@example-motors.pk +92 300 1234567';
  ok(guessCompany(html) === 'Karachi Motors Trading', 'company from <title>, boilerplate stripped');
  ok(guessCompany('', 'www.example-motors.pk') === 'Example-motors', 'host fallback when no title');
  const row = extractContacts(html, 'https://example-motors.pk/contact', 'Pakistan');
  ok(row.company === 'Karachi Motors Trading' && row.website === 'https://example-motors.pk', 'row carries company + website');
  ok(row.emails.length === 1 && row.phones.length === 1 && row.country === 'Pakistan', 'contacts and country filled');
  ok(row.status === 'new' && row.source_url === 'https://example-motors.pk/contact', 'row starts as "new" with its source');
  ok(extractContacts('nothing here', 'https://x.com') === null, 'a page without contacts yields no row');
}

say('\n4) dedupe — one business, one row');
{
  const rows = [
    { company: 'A Ltd', website: 'https://a.com', emails: ['x@a.com'], phones: ['+111111111'] },
    { company: '', website: 'https://a.com', emails: ['y@a.com'], phones: ['+111111111', '+222222222'] },
    { company: 'B Ltd', website: null, emails: ['sales@b.com'], phones: [] }
  ];
  const out = dedupeProspects(rows);
  ok(out.length === 2, 'same website merges into one row');
  const a = out.find(r => r.website === 'https://a.com');
  ok(a.emails.length === 2 && a.phones.length === 2, 'emails and phones merged without duplicates');
}

say('\n5) robots.txt is honoured');
{
  const robots = 'User-agent: *\nDisallow: /private/\nDisallow: /admin\n\nUser-agent: GoodBot\nDisallow:';
  ok(robotsAllows(robots, '/members') === true, 'public path allowed');
  ok(robotsAllows(robots, '/private/list') === false, 'disallowed path refused');
  ok(robotsAllows('', '/anything') === true, 'no robots file → public default');
}

say('\n6) source list — env wins, bad lines dropped');
{
  const fromEnv = sourceList({ PROSPECT_SOURCES: 'https://a.com/dir, not-a-url ,https://b.com/members' }, new URL('file:///nonexistent.txt'));
  ok(fromEnv.length === 2 && fromEnv[1] === 'https://b.com/members', 'env sources parsed, junk dropped');
  const none = sourceList({}, new URL('file:///nonexistent.txt'));
  ok(Array.isArray(none) && none.length === 0, 'no env + no file → empty list (scan is a no-op, not a crash)');
  const fromFile = sourceList({}, new URL('./prospect-sources.txt', import.meta.url));
  ok(fromFile.every(u => /^https?:\/\//.test(u)), 'bundled sources file yields only URLs (comments ignored)');
}

// ---------------------------------------------------------------------------
// 7–9) AI scout (api/_prospect-scout.js via /api/crm?entity=prospects&ai=scan)
// — the on-demand, in-CRM version of this scanner. Same honesty contract:
// robots.txt respected, only contacts printed on the page are saved.
// ---------------------------------------------------------------------------
import { scanUrlProblem, stripHtml, verifiedOnPage } from '../api/_prospect-scout.js';

say('\n7) scout URL guard — public http(s) domains only');
{
  ok(scanUrlProblem('https://example.org/members') === null, 'normal public page accepted');
  ok(scanUrlProblem('not a url') !== null, 'garbage refused with a human message');
  ok(scanUrlProblem('ftp://example.org/x') !== null, 'non-http scheme refused');
  ok(scanUrlProblem('http://localhost/admin') !== null, 'localhost refused');
  ok(scanUrlProblem('http://10.0.0.8/x') !== null && scanUrlProblem('http://169.254.169.254/latest') !== null, 'raw IPs (incl. metadata endpoints) refused');
}

say('\n8) anti-fabrication gate — a contact must be printed on the page');
{
  const page = stripHtml('<p>Mombasa Motors — sales@mombasamotors.co.ke · Tel: +254 722 123 456</p><p>Dar Imports, phone 0712 345 678</p>');
  ok(verifiedOnPage(page, { email: 'sales@mombasamotors.co.ke', phone: null }).any, 'printed email verifies');
  ok(verifiedOnPage(page, { email: 'SALES@MOMBASAMOTORS.CO.KE', phone: null }).okEmail, 'email check is case-insensitive');
  ok(verifiedOnPage(page, { email: null, phone: '+254 722 123 456' }).okPhone, 'printed phone verifies across spacing');
  ok(verifiedOnPage(page, { email: null, phone: '0712-345-678' }).okPhone, 'differently punctuated same digits verify');
  ok(!verifiedOnPage(page, { email: 'ceo@mombasamotors.co.ke', phone: null }).any, 'email the page never printed is dropped');
  ok(!verifiedOnPage(page, { email: null, phone: '+254 799 999 999' }).any, 'phone the page never printed is dropped — the scout cannot invent a number');
}

say('\n9) scan endpoint — fetches, extracts, dedupes, respects robots and permissions');
{
  const crm = (await import('../api/crm.js')).default;
  const { DEFAULTS } = await import('../api/_perm.js');
  const permsFor = async role => DEFAULTS[role] || {};
  const userFor = role => async () => ({ user: { id: 'u-' + role, email: role + '@ar7' }, profile: { id: 'u-' + role, full_name: role + ' user', role, active: true }, db: null });
  const memDb = (seed = {}) => {
    const tables = {}; let seq = 0;
    for (const [n, rows] of Object.entries(seed)) tables[n] = rows.map(r => ({ ...r }));
    const rowsOf = n => (tables[n] || (tables[n] = []));
    const from = name => {
      const rows = rowsOf(name);
      const start = () => {
        const ctx = { filters: [], limitN: null };
        const settle = () => { let out = rows.filter(r => ctx.filters.every(f => f(r))); return ctx.limitN ? out.slice(0, ctx.limitN) : out; };
        const api = {
          select: () => api, order: () => api,
          eq: (k, v) => { ctx.filters.push(r => r[k] === v); return api; },
          contains: (k, v) => { ctx.filters.push(r => (r[k] || []).includes(v[0])); return api; },
          limit: n => { ctx.limitN = n; return api; },
          single: async () => { const out = settle(); return out.length ? { data: out[0], error: null } : { data: null, error: new Error('no row') }; },
          then(resolve) { return resolve({ data: settle(), error: null }); }
        };
        return api;
      };
      return {
        select: () => start(),
        insert(rec) {
          const list = (Array.isArray(rec) ? rec : [rec]).map(r => ({ ...r, id: r.id || 'id-' + (++seq) }));
          rows.push(...list);
          return { error: null, data: list[0], select: () => ({ single: async () => ({ data: list[0], error: null }) }), then(res) { return res({ data: list, error: null }); } };
        },
        update: patch => ({ eq: (k, v) => ({ select: () => ({ single: async () => { const r = rows.find(x => x[k] === v); if (r) Object.assign(r, patch); return { data: r || null, error: r ? null : new Error('no row') }; } }) }) })
      };
    };
    return { db: { from }, tables };
  };
  const fakeRes = () => { const r = { statusCode: 0, body: null }; r.status = c => { r.statusCode = c; return r; }; r.setHeader = () => {}; r.end = p => { try { r.body = JSON.parse(p); } catch { r.body = p; } }; return r; };
  const run = async (req, injected) => { const res = fakeRes(); const realErr = console.error; console.error = () => {}; try { await crm(req, res, injected); } finally { console.error = realErr; } return res; };
  const PAGE = '<title>Kenya Auto Importers Association</title><p>Mombasa Motors Ltd — sales@mombasamotors.co.ke · +254 722 123 456</p>';
  const fetchFor = (pages, robots = '') => async url => {
    if (String(url).endsWith('/robots.txt')) return robots ? { ok: true, status: 200, text: async () => robots } : { ok: false, status: 404, text: async () => '' };
    const page = pages[url]; return page ? { ok: true, status: 200, text: async () => page } : { ok: false, status: 404, text: async () => '' };
  };
  const q = { entity: 'prospects', ai: 'scan' };
  const src = 'https://kaia-example.org/members';

  // happy path, no Gemini key → deterministic extraction, honest note
  let { db, tables } = memDb();
  let r = await run({ method: 'POST', query: q, body: { url: src, country: 'Kenya' } },
    { getUser: userFor('admin'), db, permsFor, env: {}, fetch: fetchFor({ [src]: PAGE }) });
  ok(r.statusCode === 200 && r.body.ok === true, 'scan answers 200 ok');
  ok(r.body.inserted === 1 && (tables.prospects || []).length === 1, 'one prospect filed from the page');
  const p = (tables.prospects || [])[0] || {};
  ok((p.emails || []).includes('sales@mombasamotors.co.ke') && p.source_url === src, 'published email saved with the source link');
  ok(p.country === 'Kenya' && p.status === 'new', 'country carried, status new (a human reviews)');
  ok(r.body.provider === 'rules' && /GEMINI/i.test(r.body.note || ''), 'without an AI key the note says so honestly');
  ok((tables.activities || []).length === 1 && /AI scout/.test(tables.activities[0].action), 'audit trail records the scan');

  // scanning the same page again inserts nothing (insert-only upsert)
  r = await run({ method: 'POST', query: q, body: { url: src } },
    { getUser: userFor('admin'), db, permsFor, env: {}, fetch: fetchFor({ [src]: PAGE }) });
  ok(r.statusCode === 200 && r.body.inserted === 0 && r.body.skipped >= 1, 'rescan skips known prospects, never overwrites');

  // robots.txt disallow → refused, nothing fetched into the CRM
  ({ db, tables } = memDb());
  r = await run({ method: 'POST', query: q, body: { url: src } },
    { getUser: userFor('admin'), db, permsFor, env: {}, fetch: fetchFor({ [src]: PAGE }, 'User-agent: *\nDisallow: /members') });
  ok(r.statusCode === 400 && /robots/.test(r.body.error || '') && !(tables.prospects || []).length, 'robots.txt disallow is honoured');

  // viewer (no leads.write) is refused
  r = await run({ method: 'POST', query: q, body: { url: src } },
    { getUser: userFor('viewer'), db: memDb().db, permsFor, env: {}, fetch: fetchFor({ [src]: PAGE }) });
  ok(r.statusCode === 403, 'a role without leads.write cannot run the scout');

  // junk URL → human-readable 400 before any fetch
  r = await run({ method: 'POST', query: q, body: { url: 'http://127.0.0.1/x' } },
    { getUser: userFor('admin'), db: memDb().db, permsFor, env: {}, fetch: async () => { throw new Error('must not fetch'); } });
  ok(r.statusCode === 400, 'private addresses are refused before any request is made');
}

say(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
