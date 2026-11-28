// The vehicle-page engagement nudge (npm run test:whatsapp-nudge).
//
// 2026-11-25 (owner: "no leads and no WhatsApp messages at all — increase
// engagement so customers message on WhatsApp / enquire on a car").
// The contract:
//   • the message a buyer sends is prefilled with the real stock reference and
//     the price EXACTLY as the listing shows it — never a number we invented,
//     and "price on request" language when the listing carries none;
//   • no fake urgency (no countdowns, no viewer counts, no invented discounts);
//   • it never blocks the page and never nags: one prompt per vehicle per week,
//     with a working "Not now";
//   • mounted on the vehicle page only, above the phone CTA dock.
let pass = 0, fail = 0;
const say = s => process.stdout.write(s + '\n');
const bad = s => process.stderr.write(s + '\n');
const ok = (cond, msg) => { if (cond) { pass++; say('  ✓ ' + msg); } else { fail++; bad('  ✗ ' + msg); } };

const {
  nudgeMessage, NUDGE_KEY, NUDGE_COOLDOWN_MS, NUDGE_DELAY_MS, NUDGE_SCROLL
} = await import('../src/whatsapp-nudge.jsx');
const { waLink } = await import('../src/site-settings.js');
const { readFileSync } = await import('node:fs');
const { join } = await import('node:path');
// Bundled into node_modules/.tmp, so resolve sources from the repo root instead
// of relative to this file's bundled location.
const ROOT = process.cwd();   // npm scripts run from the repository root
const read = name => readFileSync(join(ROOT, name), 'utf8');

say('\n1) the prefilled message quotes the listing, not a guess');
{
  const msg = nudgeMessage({ label: '2023 BMW X6 xDrive35d M Sport', ref: '0203361A20261022W005', price: '$63,532', port: 'Mombasa, Kenya' });
  ok(msg.includes('0203361A20261022W005'), 'the stock reference is in the message, so the desk can answer at once');
  ok(msg.includes('$63,532'), 'the price is quoted exactly as the page shows it');
  ok(/Mombasa/.test(msg) && /CIF/.test(msg), 'and the buyer asks for a CIF to the port they already picked');
  const noPrice = nudgeMessage({ label: '2019 Toyota Harrier', ref: 'X1', price: '', port: 'Karachi' });
  ok(!/\$|USD|price/i.test(noPrice.replace(/What is the CIF/i, '')), 'a listing with no price sends no price — nothing is invented');
  ok(/CIF to Karachi/.test(noPrice), 'and still asks the useful question');
  const noPort = nudgeMessage({ label: 'Car', ref: 'R', price: 'US$1', port: '' });
  ok(/CIF to my port/.test(noPort), 'with no destination chosen it asks for "my port" rather than guessing one');
  const link = waLink('+44 7347 132624', msg);
  ok(link.startsWith('https://wa.me/447347132624?text='), 'the link dials the desk number with the message attached');
  ok(!/\s/.test(link.split('?')[1] || ''), 'and is properly encoded');
}

say('\n2) no fake urgency, no dark patterns');
{
  const src = read('src/whatsapp-nudge.jsx');
  // Only the shipped code counts — the file header explains what it avoids.
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(line => !/^\s*\//.test(line)).join('\n');
  ok(!/countdown|only \d+ left|people (are )?viewing|last chance|expires|hurry/i.test(code),
    'no countdown, viewer count, hurry-up or expiring-offer copy is rendered');
  ok(!/setInterval/.test(src), 'nothing ticks at the buyer');
  ok(/Not now/.test(src), 'there is a plain "Not now"');
  ok(/NUDGE_COOLDOWN_MS = 7 \* 24 \* 60 \* 60 \* 1000/.test(src), 'and a week of quiet after it is used or dismissed');
  ok(NUDGE_COOLDOWN_MS === 604800000, 'the cooldown is a week, not a session');
  ok(NUDGE_KEY('X1') === 'ar7-wa-nudge:X1', 'the cooldown is per vehicle, so another car can still prompt');
  ok(NUDGE_DELAY_MS >= 30000 && NUDGE_SCROLL >= 0.5, 'it waits for a real read (40 s or 55% of the page), not the first paint');
  ok(/role="complementary"/.test(src) && /aria-label/.test(src), 'it is announced as a complementary region, not a modal');
  ok(!/position:\s*fixed/.test(src), 'no inline fixed positioning — the layout lives in CSS where the dock offset is');
}

say('\n3) it is mounted on the vehicle page, above the phone dock');
{
  const page = read('src/inner-page.jsx');
  ok(/<WhatsAppNudge/.test(page), 'the vehicle page renders the nudge');
  ok(/onEnquire=\{enquireAction\}/.test(page), 'and its "Enquire instead" opens the real enquiry dialog');
  ok(/price=\{selected\.price\}/.test(page), 'quoting the listing’s own price field');
  ok(/open=\{!zoomOpen && !spinOpen\}/.test(page), 'it steps aside while the zoom or 360° overlay is open');
  const css = read('src/detail-v2.css');
  ok(/\.wa-nudge \{/.test(css), 'the nudge is styled');
  ok(/bottom: calc\(96px \+ env\(safe-area-inset-bottom/.test(css), 'on a phone it sits above the CTA dock rather than on top of it');
  ok(/\.wa-nudge-send[^}]*background: #1faa54/.test(css), 'the WhatsApp action is the primary, recognisable green');
}

say('');
say(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
