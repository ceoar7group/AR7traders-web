// Upgrade Advisor — deterministic site-improvement suggestions for the AI
// Growth desk (src/ai-growth.jsx).
//
// Every suggestion is derived from data the CRM already holds: the live stock,
// the machinery catalogue, the published guides, the promo settings and the
// agent configs. Nothing is invented, and every suggestion says WHY (the
// evidence), WHAT it should achieve, and WHERE it gets done — either a CRM
// desk (one click away) or a code change (exported as a written brief for the
// Arena developer agent).
//
// Pure functions, no fetches — tested in scripts/upgrade-advisor.test.mjs.

const DAY = 86400000;

const parseArticleDate = value => {
  const t = Date.parse(String(value || ''));
  return Number.isFinite(t) ? t : null;
};

/**
 * @returns [{id, title, why, impact: 'high'|'medium'|'low', kind: 'desk'|'config'|'code',
 *            desk: crm tab id or null, apply: {path, body} | null, how}]
 */
export function buildUpgradeSuggestions({ cars = [], machines = [], articles = [], settings = {},
  agents = [], keywordSource = null, now = Date.now() } = {}) {
  const out = [];
  const live = cars.filter(c => c && c.published !== false);

  // 1 · Content cadence — fresh pages are the main lever for new organic leads.
  const newest = Math.max(0, ...articles.map(a => parseArticleDate(a.date) || 0));
  const daysSince = newest ? Math.floor((now - newest) / DAY) : null;
  if (daysSince === null || daysSince > 21) {
    out.push({
      id: 'content-cadence', impact: 'high', kind: 'desk', desk: 'seo',
      title: 'Publish a fresh guide — the news section has gone quiet',
      why: daysSince === null ? 'No dated guides found.' : `The newest guide is ${daysSince} days old. Search engines reward sites that keep answering buyer questions.`,
      how: 'Open the SEO desk → Topic Scout. One approved topic becomes a published guide in a single run.'
    });
  }

  // 2 · Stock records without photos convert far worse than photographed ones.
  const noPhoto = live.filter(c => !c.image).length;
  if (noPhoto > 0) {
    out.push({
      id: 'stock-photos', impact: 'high', kind: 'desk', desk: 'vehicles',
      title: `${noPhoto} published vehicle(s) have no photo`,
      why: 'A listing without an image is skipped in the grid and shares badly on WhatsApp.',
      how: 'Open Cars → add photos from the gallery manager, or unpublish records that are no longer for sale.'
    });
  }

  // 3 · Machinery waiting on photos never reaches the public catalogue.
  const pendingMachines = machines.filter(m => m && m.photosPending).length;
  if (pendingMachines > 0) {
    out.push({
      id: 'machinery-photos', impact: 'medium', kind: 'desk', desk: 'machinery',
      title: `${pendingMachines} machine(s) are hidden awaiting photos`,
      why: 'photosPending machines are excluded from the public machinery pages and from search.',
      how: 'Open the Machinery desk → upload supplier photos, and the records go live automatically.'
    });
  }

  // 4 · No live campaign banner → the top of every page sells nothing.
  let promo = null;
  try { promo = settings.promo ? JSON.parse(settings.promo) : null; } catch { promo = null; }
  const promoLive = !!(promo && promo.active && (!promo.until || Date.parse(promo.until) >= now - DAY));
  if (!promoLive) {
    out.push({
      id: 'campaign-banner', impact: 'medium', kind: 'desk', desk: 'seo',
      title: 'No campaign banner is live on the public site',
      why: 'The PromoBar is the one site-wide slot every visitor sees; it is currently empty.',
      how: 'Open the SEO desk → Campaign launchpad and publish an accurate, dated campaign (new arrivals, a shipment, a market focus).'
    });
  }

  // 5 · Lead Gen agent switched off — reply drafts are not being prepared.
  const leadsAgent = agents.find(a => a.agent === 'leads');
  if (leadsAgent && (!leadsAgent.enabled || leadsAgent.paused)) {
    out.push({
      id: 'leads-agent', impact: 'high', kind: 'desk', desk: 'agents',
      title: 'The Lead Gen agent is ' + (leadsAgent.paused ? 'paused' : 'disabled'),
      why: 'Enabled, it scores every new lead and prepares a stock-matched WhatsApp reply draft for approval — faster replies win deals.',
      how: 'One click below enables it in review mode: it only ever produces drafts; nothing is sent without approval.',
      apply: { label: 'Enable in review mode', path: '/api/site-content?agents=config-update',
        body: { agent: 'leads', enabled: true, paused: false } }
    });
  }

  // 6 · Keyword research still runs blind without Search Console.
  if (keywordSource === 'catalogue-only') {
    out.push({
      id: 'gsc-connect', impact: 'medium', kind: 'config', desk: null,
      title: 'Connect Google Search Console for real query data',
      why: 'Keyword research currently uses catalogue-derived ideas only. GSC shows the actual queries, impressions and positions this site already gets.',
      how: 'Add GOOGLE_SERVICE_ACCOUNT_JSON and GSC_SITE_URL to the Vercel environment (the SEO desk connector panel documents the steps), then redeploy.'
    });
  }

  // 7 · Social agent off — published guides get no distribution.
  const socialAgent = agents.find(a => a.agent === 'social');
  if (socialAgent && (!socialAgent.enabled || socialAgent.paused) && articles.length >= 3) {
    out.push({
      id: 'social-agent', impact: 'low', kind: 'desk', desk: 'agents',
      title: 'The Social Media agent is ' + (socialAgent.paused ? 'paused' : 'disabled'),
      why: `${articles.length} published guides have no social distribution. The agent drafts posts from them for approval.`,
      how: 'Enable it in review mode; it only produces drafts until an account is connected and authorised.',
      apply: { label: 'Enable in review mode', path: '/api/site-content?agents=config-update',
        body: { agent: 'social', enabled: true, paused: false } }
    });
  }

  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.impact] - rank[b.impact]);
}

/** The written brief for code-level work: paste into an Arena coding session. */
export function buildUpgradeBrief(suggestions = [], { origin = 'https://ar7traders.com', now = new Date() } = {}) {
  const lines = [];
  lines.push(`# AR7 Traders — upgrade brief for the developer agent (${now.toISOString().slice(0, 10)})`);
  lines.push('');
  lines.push(`Site: ${origin} · deploys from GitHub (ceoar7group/AR7traders-web) via Vercel.`);
  lines.push('Each item below was approved in the CRM Upgrade Advisor. Implement, test and open a PR.');
  lines.push('');
  for (const s of suggestions) {
    lines.push(`## ${s.title} [impact: ${s.impact}]`);
    lines.push(`- Why: ${s.why}`);
    lines.push(`- Suggested approach: ${s.how}`);
    lines.push('');
  }
  if (!suggestions.length) lines.push('_No items selected — nothing to do._');
  lines.push('---');
  lines.push('Also run the SEO desk full crawl and paste its "needs a code change" section here for page-level fixes.');
  return lines.join('\n');
}
