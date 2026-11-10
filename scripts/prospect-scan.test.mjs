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

say(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
