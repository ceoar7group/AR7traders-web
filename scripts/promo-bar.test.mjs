// What the promotion bar shows, and when.
//
// The bug these pin: the bar rendered the price offer ONLY when no campaign was
// live. With the China-desk campaign running (public/promo.json, until
// 2026-11-30), a discount the owner had published from the CRM's Price offers
// panel never appeared in the bar — the discount was live and applied on every
// price, but the owner's own check ("publish it, look at the top of the site")
// said broken. Worse, dismissing the campaign took the offer with it.
//
// Run: npm run test:promo-bar
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const dir = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(dir, '..');
const read = p => readFileSync(path.join(root, p), 'utf8');

let failed = 0;
const ok = (cond, msg) => {
  if (!cond) { failed++; process.stderr.write('FAIL: ' + msg + '\n'); }
  else console.log('ok  :', msg);
};

const { barRows, campaignIsLive } = await import('../src/offers.js');

const campaign = { active: true, id: 'machinery-excavators', headline: 'Excavators on the China desk', sub: 'From $46,500 FOB', cta: 'See the machines', href: '/machinery/excavators', until: '2026-11-30' };
const offer = { active: true, id: 'offer-20', scope: 'machinery', percent: 20, headline: '20% off machinery', label: null, until: null, machines: {} };
const at = iso => new Date(`${iso}T12:00:00`);

// ---- is a campaign live? ----------------------------------------------------
console.log('\n-- a campaign is live until its end date --');
ok(campaignIsLive(campaign, at('2026-10-04')), 'a campaign runs before its end date');
ok(campaignIsLive(campaign, at('2026-11-30')), 'a campaign is live ON its end date — the date it names is included');
ok(!campaignIsLive(campaign, at('2026-12-01')), 'a campaign is dead the day after its end date');
ok(campaignIsLive({ ...campaign, until: null }, at('2030-01-01')), 'a campaign with no end date stays live');
ok(!campaignIsLive({ ...campaign, active: false }, at('2026-10-04')), 'an inactive campaign is never live');
ok(!campaignIsLive(null, at('2026-10-04')) && !campaignIsLive('nope'), 'no campaign reads as no campaign, never a crash');
ok(campaignIsLive({ ...campaign, until: 'soon' }, at('2026-10-04')),
  'an unparseable date does not silently hide a running campaign');

// The live setting is checked by the same rule as the published file. The CRM
// used to write a campaign that outlived `until` until somebody edited it.
console.log('\n-- the live setting obeys the same end date --');
ok(!campaignIsLive(campaign, at('2027-02-01')), 'a campaign published from the CRM stops on its end date too');

// ---- the two rows -----------------------------------------------------------
console.log('\n-- a campaign and a price offer share the bar --');
{
  const both = barRows({ promo: campaign, offer, now: at('2026-10-04') });
  ok(both.campaign && both.offer, 'BOTH render while a campaign and an offer are live (the reported bug)');
  ok(both.offer.line.includes('20%'), 'the offer row carries the discount the owner published');
}
{
  const dismissed = barRows({ promo: campaign, campaignDismissed: true, offer, now: at('2026-10-04') });
  ok(!dismissed.campaign && dismissed.offer,
    'dismissing the campaign leaves the price offer standing');
}
{
  const dismissed = barRows({ promo: campaign, offer, offerDismissed: true, now: at('2026-10-04') });
  ok(dismissed.campaign && !dismissed.offer, 'dismissing the offer leaves the campaign standing');
}
{
  const none = barRows({ promo: campaign, campaignDismissed: true, offer, offerDismissed: true, now: at('2026-10-04') });
  ok(!none.campaign && !none.offer, 'both dismissed is an empty bar');
}
{
  const only = barRows({ promo: campaign, now: at('2026-10-04') });
  ok(only.campaign && !only.offer, 'a campaign alone still renders as before');
}
{
  const only = barRows({ offer, now: at('2026-10-04') });
  ok(!only.campaign && only.offer, 'an offer alone still renders as before');
}
{
  const expired = barRows({ promo: { ...campaign, until: '2026-09-30' }, offer, now: at('2026-10-04') });
  ok(!expired.campaign && expired.offer, 'an expired campaign drops out while the offer stays');
}
{
  const expired = barRows({ promo: campaign, offer: { ...offer, until: '2026-09-30' }, now: at('2026-10-04') });
  ok(expired.campaign && !expired.offer, 'an expired offer drops out while the campaign stays');
}

// ---- the component uses them ------------------------------------------------
console.log('\n-- the bar renders both rows --');
const bar = read('src/promo-bar.jsx');
ok(/barRows\(/.test(bar), 'the bar builds its rows from the tested helper');
ok(/promo-bar-offer:not\(:first-child\)/.test(read('src/landing-v2.css')), 'the shared bar separates the campaign row from the offer row');
ok(!/const offerLine = !promo \?/.test(bar), 'the offer is no longer gated on "no campaign"');
ok(/useSettings/.test(bar) && /promo\.json/.test(bar), 'the bar still reads the live setting and falls back to the published file');
ok(/Indicative FOB price, confirmed with your quotation\./.test(bar),
  'the discount still says the price is indicative FOB and confirmed by written quotation');
ok(/aria-label=\{campaign \? 'Current offer' : 'Price offer'\}/.test(bar), 'the bar is labelled for screen readers whichever row it carries');

if (failed) { process.stderr.write(`\n${failed} check(s) failed.\n`); process.exit(1); }
console.log('\nThe promotion bar shows a campaign and a price offer together, each dismissible on its own.');
