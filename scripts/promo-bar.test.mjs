// PromoBar regressions: campaign messaging stays independent from persisted
// per-stock savings, including expiry and dismissal. Run: npm run test:promo-bar
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
const { parseStockDiscounts } = await import('../src/stock-discounts-public.js');

const campaign = { active: true, id: 'machinery-excavators', headline: 'Excavators on the China desk', sub: 'From $46,500 FOB', cta: 'See the machines', href: '/machinery/excavators', until: '2026-11-30' };
const stockDiscounts = parseStockDiscounts({version: 1, items: {
  'car:AR7-42': {kind: 'car', ref: 'AR7-42', percent: 20, until: null},
  'machine:AR7-MC-004': {kind: 'machine', ref: 'AR7-MC-004', percent: 20, until: null}
}});
const expiredStockDiscounts = parseStockDiscounts({version: 1, items: {
  'car:AR7-42': {kind: 'car', ref: 'AR7-42', percent: 20, until: '2026-09-30'}
}});
const at = iso => new Date(`${iso}T12:00:00`);

// ---- campaign validity -----------------------------------------------------
console.log('\n-- a campaign is live until its end date --');
ok(campaignIsLive(campaign, at('2026-10-04')), 'a campaign runs before its end date');
ok(campaignIsLive(campaign, at('2026-11-30')), 'a campaign is live ON its end date — the named date is included');
ok(!campaignIsLive(campaign, at('2026-12-01')), 'a campaign is dead the day after its end date');
ok(campaignIsLive({...campaign, until: null}, at('2030-01-01')), 'a campaign with no end date stays live');
ok(!campaignIsLive({...campaign, active: false}, at('2026-10-04')), 'an inactive campaign is never shown');
ok(!campaignIsLive(null, at('2026-10-04')) && !campaignIsLive('nope'), 'no campaign reads as no campaign, never a crash');
ok(!campaignIsLive({...campaign, until: 'soon'}, at('2026-10-04')),
  'an unparseable campaign date fails closed instead of keeping an unbounded banner live');

// ---- campaign and selected-stock rows -------------------------------------
console.log('\n-- a campaign and selected-stock savings share the public bar --');
{
  const both = barRows({promo: campaign, stockDiscounts, now: at('2026-10-04')});
  ok(both.campaign?.id === campaign.id && both.offer?.count === 2,
    'campaign messaging and persisted car/machine savings appear together');
  ok(both.offer?.line === '20% off selected stock' && both.offer.href === '/inventory',
    'mixed vehicle and machinery discounts are described as selected stock and link to inventory');
  ok(both.offer?.note.includes('Individual savings appear on each eligible listing'),
    'the savings summary never claims the whole catalogue is discounted');
  const marginCampaign = barRows({promo: {...campaign, discount: 12}, stockDiscounts, now: at('2026-10-04')});
  ok(marginCampaign.campaign?.discount === 12 && marginCampaign.offer?.count === 2,
    'an owner-confirmed campaign margin message stays independent from itemized prices');
}
{
  const dismissed = barRows({promo: campaign, campaignDismissed: true, stockDiscounts, now: at('2026-10-04')});
  ok(!dismissed.campaign && dismissed.offer, 'dismissing the campaign leaves per-stock savings visible');
}
{
  const dismissed = barRows({promo: campaign, stockDiscounts, offerDismissed: true, now: at('2026-10-04')});
  ok(dismissed.campaign && !dismissed.offer, 'dismissing stock savings leaves the campaign visible');
}
{
  const none = barRows({promo: campaign, campaignDismissed: true, stockDiscounts, offerDismissed: true, now: at('2026-10-04')});
  ok(!none.campaign && !none.offer, 'each row can be dismissed independently');
}
{
  const only = barRows({promo: campaign, now: at('2026-10-04')});
  ok(only.campaign && !only.offer, 'a campaign alone still renders');
}
{
  const only = barRows({stockDiscounts, now: at('2026-10-04')});
  ok(!only.campaign && only.offer?.count === 2, 'selected-stock savings still render without a campaign');
}
{
  const expiredCampaign = barRows({promo: {...campaign, until: '2026-09-30'}, stockDiscounts, now: at('2026-10-04')});
  ok(!expiredCampaign.campaign && expiredCampaign.offer, 'an expired campaign drops out while live stock savings stay');
  const expiredDiscount = barRows({promo: campaign, stockDiscounts: expiredStockDiscounts, now: at('2026-10-04')});
  ok(expiredDiscount.campaign && !expiredDiscount.offer, 'expired item discounts drop out while campaign messaging stays');
}
{
  const machinesOnly = parseStockDiscounts({version: 1, items: {
    'machine:AR7-MC-004': {kind: 'machine', ref: 'AR7-MC-004', percent: 15, until: null}
  }});
  const row = barRows({stockDiscounts: machinesOnly, now: at('2026-10-04')}).offer;
  ok(row?.href === '/machinery' && row.line === '15% off selected machinery units',
    'a machinery-only notice points at machinery and identifies selected units');
}
{
  const edited = parseStockDiscounts({version: 1, items: {
    'car:AR7-42': {kind: 'car', ref: 'AR7-42', percent: 21, until: null},
    'machine:AR7-MC-004': {kind: 'machine', ref: 'AR7-MC-004', percent: 20, until: null}
  }});
  ok(barRows({stockDiscounts: edited}).offer?.id !== barRows({stockDiscounts}).offer?.id,
    'changing a stock discount changes the dismissal identity so the new notice can reappear');
}

// ---- component wiring and content -----------------------------------------
console.log('\n-- the public component preserves the campaign and stock-notice contract --');
const bar = read('src/promo-bar.jsx');
ok(/barRows\(\{promo: shownPromo, campaignDismissed: hidden, stockDiscounts\}\)/.test(bar) &&
   /offerLine = offerHidden \? null : currentStockRow/.test(bar),
  'PromoBar derives the stock row independently from campaign state and dismissal');
// 2026-11 (owner: reload "stutters multiple times", part 2): the campaign must
// render in the SAME paint as the discounts row when one settings answer
// carries both — an effect-set campaign painted one row first and two rows a
// beat later, jolting the whole page twice on every reload. The live CRM
// campaign is therefore derived synchronously during render; the settings
// effect remains only for settled bookkeeping and the stale/file contract.
ok(/const shownPromo = useMemo\(\(\) => liveSettingsCampaign\(settings\), \[settings\?\.promo\]\) \|\| promo;/.test(bar),
  'the live CRM campaign is derived at render time, so campaign and discounts rows mount in one paint');
ok(/promo-bar-offer:not\(:first-child\)/.test(read('src/landing-v2.css')), 'the shared bar separates a second row from campaign content');
ok(/useSettings/.test(bar) && /promo\.json/.test(bar), 'the bar reads staff settings and retains its static campaign fallback');
ok(/Indicative FOB price; confirmed in your written quotation\./.test(read('src/stock-discounts-public.js')),
  'the savings notice states that each indicative FOB price is confirmed in a written quote');
ok(/campaign\.discount/.test(bar) && /off margin/.test(bar),
  'the existing campaign margin badge remains separate from itemized stock-price reductions');
ok(/aria-label=\{campaign \? 'Current campaign and stock savings' : 'Selected stock savings'\}/.test(bar),
  'the bar region remains accurately named for screen readers with either or both rows');
// 2026-11-13 (live PageSpeed mobile CLS 0.126): the CRM held a campaign whose
// `until` had passed, the settings effect checked only `active`, and the
// expired campaign silenced the still-live /promo.json fallback — the bar
// collapsed after first paint and shifted the whole page up on every first
// visit. The settings path must run the SAME liveness check as the file path,
// and an expired CRM campaign must not clear a live fallback campaign.
ok(/liveSettingsCampaign/.test(bar) && /p\?\.active && campaignIsLive\(p\)/.test(bar),
  'the CRM settings campaign passes through campaignIsLive, exactly like the fallback file');
ok(/if \(live\) setPromo\(live\);/.test(bar) && /setPromo\(p => \(p\?\.__fromFile \? p : null\)\)/.test(bar),
  'a live CRM campaign wins; an expired one clears only a stale settings campaign, never the file fallback');
ok(/if \(liveSettingsCampaign\(settings\)\) return;/.test(bar),
  'the fallback fetch defers only to a LIVE settings campaign, not an expired one');
ok(/setPromo\(\{ \.\.\.data, __fromFile: true \}\)/.test(bar),
  'file campaigns are marked so the settings effect can tell them apart');
// 2026-11 (owner: reload "stutters multiple times"): promo.json answers before
// /api/settings, so the fallback campaign used to mount first as a one-row
// bar (collapsing the two-row reservation), then the CRM answer re-mounted
// the live campaign + discounts row — two full-page jolts on every reload
// that lost the race, and the stored bar height flip-flopped between visits.
// The file path must WAIT for the settings answer (which also resolves on
// failure, keeping the static-deploy fallback alive) and re-check against the
// settled cache before mounting.
ok(/await loadSettings\(\)\.catch\(\(\) => null\);/.test(bar),
  'the file fallback waits for the settings answer instead of racing it to first paint');
ok(/if \(liveSettingsCampaign\(getSettings\(\)\)\) return;/.test(bar),
  'after the wait, the file defers to the settled cache — a live CRM campaign mounts exactly once');
const fileEffect = bar.slice(bar.indexOf("fetch('/promo.json'"), bar.indexOf('__fromFile: true'));
ok(fileEffect.includes('await loadSettings()'),
  'the wait sits between the file fetch and the file mount, not anywhere else');
ok(/setHidden\(!!shownPromo\?\.id && localStorage\.getItem\(DISMISS_KEY\) === shownPromo\.id\)/.test(bar) &&
   /setOfferHidden\(!!currentStockRow && localStorage\.getItem\(OFFER_DISMISS_KEY\) === currentStockRow\.id\)/.test(bar),
  'dismissal state is recalculated per campaign/discount id so new notices can reappear');

if (failed) { process.stderr.write(`\n${failed} check(s) failed.\n`); process.exit(1); }
console.log('\nPromoBar keeps campaign messaging and selected-stock savings visible and independently dismissible.');
