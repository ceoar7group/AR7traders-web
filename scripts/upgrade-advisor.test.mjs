// Upgrade Advisor logic (npm run test:advisor).
//
// The advisor must only speak from evidence: every suggestion appears when its
// trigger condition holds and disappears when it does not, apply-actions only
// exist where a safe CRM endpoint exists, and the exported brief is a real,
// dated document the developer agent can work from.
import { buildUpgradeSuggestions, buildUpgradeBrief } from '../src/upgrade-advisor.js';

let pass = 0, fail = 0;
const ok = (cond, label) => {
  if (cond) { pass++; console.log('  ✓ ' + label); }
  else { fail++; console.error('  ✗ ' + label); }
};

const NOW = Date.parse('2026-11-08T12:00:00Z');
const healthy = {
  cars: [{ make: 'Toyota', model: 'Harrier', image: '/a.jpg', published: true }],
  machines: [{ type: 'Excavators', photosPending: false }],
  articles: [{ title: 'Fresh guide', date: 'Nov 01, 2026' }],
  settings: { promo: JSON.stringify({ active: true, headline: 'New shipment', until: '2026-12-01' }) },
  agents: [
    { agent: 'leads', enabled: true, paused: false },
    { agent: 'seo', enabled: true, paused: false },
    { agent: 'social', enabled: true, paused: false }
  ],
  keywordSource: 'search-console',
  now: NOW
};

console.log('\n-- a healthy site produces no noise --');
ok(buildUpgradeSuggestions(healthy).length === 0, 'no suggestions when every check passes');

console.log('\n-- each trigger fires exactly when its evidence exists --');
const stale = buildUpgradeSuggestions({ ...healthy, articles: [{ title: 'Old', date: 'Aug 01, 2026' }] });
ok(stale.some(s => s.id === 'content-cadence'), 'guide older than 21 days → content-cadence');
ok(stale.find(s => s.id === 'content-cadence').why.includes('days old'), 'the why names the actual age');

const noPhoto = buildUpgradeSuggestions({ ...healthy, cars: [{ make: 'Toyota', published: true }, { make: 'Honda', image: '', published: true }] });
ok(noPhoto.some(s => s.id === 'stock-photos' && s.title.startsWith('2 published vehicle')), 'photo-less stock is counted');

const pendingMachines = buildUpgradeSuggestions({ ...healthy, machines: [{ photosPending: true }, { photosPending: true }, { photosPending: false }] });
ok(pendingMachines.some(s => s.id === 'machinery-photos' && s.title.startsWith('2 machine')), 'photosPending machines are counted');

const noCampaign = buildUpgradeSuggestions({ ...healthy, settings: {} });
ok(noCampaign.some(s => s.id === 'campaign-banner'), 'missing promo → campaign suggestion');
const expired = buildUpgradeSuggestions({ ...healthy, settings: { promo: JSON.stringify({ active: true, until: '2026-01-01' }) } });
ok(expired.some(s => s.id === 'campaign-banner'), 'expired promo counts as no campaign');

const leadsOff = buildUpgradeSuggestions({ ...healthy, agents: healthy.agents.map(a => a.agent === 'leads' ? { ...a, enabled: false } : a) });
const leadsSuggestion = leadsOff.find(s => s.id === 'leads-agent');
ok(!!leadsSuggestion, 'disabled Lead Gen agent is flagged');
ok(leadsSuggestion.apply && leadsSuggestion.apply.body.agent === 'leads' && leadsSuggestion.apply.body.enabled === true,
  'its one-click apply enables exactly the leads agent via the existing config endpoint');
ok(leadsSuggestion.impact === 'high', 'lead response speed is ranked high impact');

const noGsc = buildUpgradeSuggestions({ ...healthy, keywordSource: 'catalogue-only' });
ok(noGsc.some(s => s.id === 'gsc-connect' && s.kind === 'config'), 'catalogue-only keywords → connect-GSC config item');

const socialOff = buildUpgradeSuggestions({ ...healthy, articles: [{ title: 'a', date: 'Nov 01, 2026' }, { title: 'b', date: 'Nov 02, 2026' }, { title: 'c', date: 'Nov 03, 2026' }], agents: healthy.agents.map(a => a.agent === 'social' ? { ...a, paused: true } : a) });
ok(socialOff.some(s => s.id === 'social-agent'), 'paused social agent with 3+ guides is flagged');
ok(!buildUpgradeSuggestions({ ...healthy, articles: healthy.articles, agents: healthy.agents.map(a => a.agent === 'social' ? { ...a, paused: true } : a) }).some(s => s.id === 'social-agent'),
  'but not when there is nothing to distribute (fewer than 3 guides)');

console.log('\n-- ordering and the brief --');
const noisy = buildUpgradeSuggestions({ cars: [], machines: [], articles: [], settings: {}, agents: healthy.agents, keywordSource: 'catalogue-only', now: NOW });
const ranks = noisy.map(s => ({ high: 0, medium: 1, low: 2 })[s.impact]);
ok(ranks.every((r, i) => i === 0 || r >= ranks[i - 1]), 'suggestions are sorted highest impact first');

const brief = buildUpgradeBrief(noisy, { now: new Date('2026-11-08T00:00:00Z') });
ok(brief.includes('# AR7 Traders — upgrade brief for the developer agent (2026-11-08)'), 'brief is titled and dated');
ok(brief.includes('ceoar7group/AR7traders-web'), 'brief names the repository the agent works in');
ok(noisy.every(s => brief.includes(s.title)), 'every selected suggestion appears in the brief');
ok(buildUpgradeBrief([]).includes('No items selected'), 'an empty selection is stated, not hidden');

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
