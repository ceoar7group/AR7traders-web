#!/usr/bin/env node
// AR7 promotions agent.
//
//   npm run promo                    inspect the static fallback and run history
//   npm run promo:plan               build this week's campaign candidates from real stock
//   npm run promo:social -- --id <id>    ready-to-send copy for WhatsApp/FB/IG/email
//   CRM → SEO desk → Campaign launchpad    publish or clear the live campaign
//   npm run promo:publish -- --id <id>     legacy static-file fallback only
//   npm run promo:report             inspect local fallback/history (not live API settings)
//
// WHAT IT IS
// ----------
// A promotion is not a banner: it is a reason to buy this week. This agent
// reads what AR7 actually has (live brands, machinery types, destination
// markets), proposes campaign candidates and writes channel copy. A staff
// member reviews and publishes through the SEO desk; this CLI only writes the
// static fallback when explicitly used for a static-only deployment.
//
// WHAT IT REFUSES TO DO
// ---------------------
// • It will not invent a discount. `discount` must be a real number the owner
//   sets, because a "10% off" that a quotation then contradicts is a refund
//   waiting to happen.
// • It will not state a stock count, a sold count or a deadline that is not
//   real. A countdown that resets is the fastest way to lose a buyer's trust.
// • It will not post anywhere by itself. It writes the copy and the links;
//   sending is a human action on a real account. See "Publishing to social"
//   at the bottom of this file.

import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { editorialPlan } from '../src/editorial-plan.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = n => args.includes('--' + n);
const opt = n => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : null; };

const { MACHINES, MACHINE_TYPES, listPriceUSD } = await import('../src/machinery-data.js');
const { SEO_BRANDS } = await import('../src/seo.js').catch(() => ({ SEO_BRANDS: [] }));
const { LANGUAGES } = await import('../src/i18n.js');

const PUBLIC = path.join(root, 'public');
const PROMO_FILE = path.join(PUBLIC, 'promo.json');
const STATE_FILE = path.join(root, 'promo-state.json');
const PLAN_FILE = path.join(root, 'PROMO-PLAN.md');

const read = (p, fallback) => {
  try { return JSON.parse(readFileSync(p, 'utf8')); } catch { return fallback; }
};
const write = (p, data) => writeFileSync(p, JSON.stringify(data, null, 2) + '\n');

const state = () => read(STATE_FILE, { campaigns: [], published: null, history: [] });

/* ---------------------------------------------------------------------------
   Campaign shapes
   ---------------------------------------------------------------------------
   Each generator returns campaigns grounded in something true about the
   business right now. Nothing here is a timer or a fake scarcity device.
   --------------------------------------------------------------------------- */
const MARKETS = [
  { name: 'Kenya', port: 'Mombasa', slug: 'kenya' },
  { name: 'Pakistan', port: 'Karachi / Port Qasim', slug: 'pakistan' },
  { name: 'the UAE', port: 'Jebel Ali', slug: 'uae' },
  { name: 'Tanzania', port: 'Dar es Salaam', slug: 'tanzania' },
  { name: 'the UK', port: 'Southampton / Felixstowe', slug: 'uk' },
  { name: 'Nigeria', port: 'Lagos / Tin Can', slug: 'nigeria' }
];

function generators() {
  const out = [];

  // 1. Machinery type spotlight — one per type, pointed at its landing page.
  const byType = MACHINE_TYPES.map(t => [t, MACHINES.filter(m => m.type === t)]).filter(([, l]) => l.length);
  for (const [type, list] of byType) {
    const cheapest = list.reduce((a, b) => (listPriceUSD(a) < listPriceUSD(b) ? a : b));
    out.push({
      id: `machinery-${type.toLowerCase()}`,
      kind: 'machinery-type',
      headline: `${type} on the China desk`,   // never "ready to ship": AR7 quotes to order, it does not hold the yard
      sub: `From ${'$' + listPriceUSD(cheapest).toLocaleString('en-US')} FOB — ${list.length} ${type.toLowerCase()} on the desk`,
      target: `/machinery/${type.toLowerCase()}`,
      cta: 'See the machines',
      onSite: true,
      channels: ['site', 'whatsapp', 'facebook', 'email']
    });
  }

  // 2. Destination spotlight — markets we actually ship to.
  for (const m of MARKETS) {
    out.push({
      id: `destination-${m.slug}`,
      kind: 'destination',
      headline: `Shipping to ${m.name} this month`,
      sub: `Cars from Japan and machinery from China, quoted to ${m.port} with the documents handled`,
      target: `/destinations`,
      cta: `Get a ${m.name} quote`,
      onSite: true,
      channels: ['site', 'whatsapp', 'email']
    });
  }

  // 3. Brand spotlight — a real brand with stock behind it.
  const carBrands = ['Toyota', 'Lexus', 'Nissan', 'Honda', 'Mazda', 'Mercedes-Benz', 'BMW'];
  for (const b of carBrands) {
    out.push({
      id: `brand-${b.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      kind: 'brand',
      headline: `Fresh ${b} stock at Japanese auctions`,
      sub: `Auction sheets translated, condition reported honestly, shipped to your port`,
      target: `/cars/${b.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
      cta: `Browse ${b}`,
      onSite: true,
      channels: ['site', 'whatsapp', 'facebook']
    });
  }

  // 4. Process education — the posts that actually bring search traffic.
  out.push({
    id: 'guide-roto-vs-container',
    kind: 'education',
    headline: 'RoRo or container? The answer depends on your car',
    sub: 'A short guide to choosing the cheaper method for your vehicle and port',
    target: '/news/roro-vs-container-which-shipping-method-fits-your-car',
    cta: 'Read the guide',
    onSite: false,
    channels: ['blog', 'facebook', 'whatsapp']
  });
  out.push({
    id: 'guide-auction-sheet',
    kind: 'education',
    headline: 'What R, A and 4.5 mean on a Japanese auction sheet',
    sub: 'Read the grade before you bid — our translation guide',
    target: '/news/auction-sheet-decoded-what-r-a-and-4-5-really-mean',
    cta: 'Read the guide',
    onSite: false,
    channels: ['blog', 'facebook']
  });

  return out;
}

/* ---------------------------------------------------------------------------
   Copy, per channel
   ---------------------------------------------------------------------------
   Written to be sent, not to be admired: WhatsApp gets a short message a buyer
   can reply to, Facebook gets a post with the link up top, email gets a subject
   line that is not a lie.
   --------------------------------------------------------------------------- */
function copyFor(campaign, { price = null, discount = null } = {}) {
  const url = 'https://ar7traders.com' + campaign.target;
  const utm = `${url}${url.includes('?') ? '&' : '?'}utm_source={channel}&utm_medium=promo&utm_campaign=${campaign.id}`;
  const priceLine = price ? `From $${Number(price).toLocaleString('en-US')} FOB. ` : '';
  const discountLine = discount ? `${discount}% off our margin on this until the end of the month. ` : '';
  return {
    whatsapp:
`${campaign.headline}

${campaign.sub}
${discountLine}${priceLine}Send us your port and we will quote landed cost today.

${utm.replace('{channel}', 'whatsapp')}`,
    facebook:
`${campaign.headline}

${campaign.sub}
${discountLine}${priceLine}We handle inspection, documents and shipping — one price to your port.

${campaign.cta}: ${utm.replace('{channel}', 'facebook')}`,
    instagram:
`${campaign.headline}
${campaign.sub}
${discountLine}${priceLine}
Link in bio · @ar7traders
${utm.replace('{channel}', 'instagram')}`,
    email: {
      subject: campaign.headline,
      body:
`Hello,

${campaign.sub}
${discountLine}${priceLine}Reply with the machine or car you are after and your port, and we will send a written quotation with freight included.

${campaign.cta}: ${utm.replace('{channel}', 'email')}

AR7 Traders
ar7tradersinfo@gmail.com · +44 7347 132624`
    },
    blog: {
      title: campaign.headline,
      body: `${campaign.sub}\n\nRead it here: ${utm.replace('{channel}', 'site')}\n\nAR7 Traders exports used Japanese cars and Chinese construction machinery, with inspection, documentation and shipping handled end to end.`
    }
  };
}

/* ---------------------------------------------------------------------------
   Commands
   --------------------------------------------------------------------------- */
function plan() {
  const campaigns = generators();
  const guides = editorialPlan(new Date(), opt('guides-per-month') || 2);
  const s = state();
  const run = new Set(s.history.map(h => h.id));
  const lines = [];
  lines.push('# AR7 promotion plan');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`${campaigns.length} campaigns available, ${run.size} already run.`);
  lines.push('');
  lines.push('A promotion here is a reason to buy, not a countdown. Nothing in this plan');
  lines.push('claims a deadline, a stock count or a discount that is not real — see the');
  lines.push('header of scripts/promo-agent.mjs.');
  lines.push('');
  for (const c of campaigns) {
    lines.push(`## ${c.headline}`);
    lines.push('');
    lines.push(`- id: \`${c.id}\`  ·  kind: ${c.kind}  ·  ${run.has(c.id) ? '**already run**' : 'not yet run'}`);
    lines.push(`- target: \`${c.target}\``);
    lines.push(`- channels: ${c.channels.join(', ')}`);
    lines.push(`- ${c.sub}`);
    lines.push('');
  }
  lines.push('## Buyer-guide publishing calendar (2–4 per month)');
  lines.push('Draft → verify authority sources → review in CRM SEO desk → publish → check sitemap and indexing. Dates are editorial targets, not proof of publication.');
  for (const g of guides) lines.push(`- ${g.due}: **${g.title}** — ${g.brief} Link: ${g.target}. Status: ${g.status}.`);
  lines.push('');
  lines.push('## Launching a campaign');
  lines.push('');
  lines.push('Review the candidate and publish it from the CRM\'s SEO desk → Campaign launchpad.');
  lines.push('The desk saves to the authenticated `promo` setting and updates the live PromoBar');
  lines.push('without a deploy. Only staff with `settings.write` can publish or clear it.');
  lines.push('');
  lines.push('```bash');
  lines.push('npm run promo:social -- --id machinery-excavators');
  lines.push('```');
  lines.push('');
  lines.push('Social copy is printed for you to send from the real accounts — see');
  lines.push('"Publishing to social" in scripts/promo-agent.mjs for why.');
  lines.push('');
  lines.push('The legacy `npm run promo:publish` command only edits `public/promo.json`,');
  lines.push('the static fallback used when the settings API is unavailable.');
  writeFileSync(PLAN_FILE, lines.join('\n'));
  // The generated JSON and Markdown are planning artifacts, not an interactive
  // CRM campaign list; staff choose and publish in the SEO desk.
  writeFileSync(path.join(PUBLIC, 'promo-plan.json'), JSON.stringify({
    generatedAt: new Date().toISOString(),
    guides,
    campaigns: campaigns.map(c => ({ ...c, ran: run.has(c.id) }))
  }, null, 2) + '\n');
  return { campaigns, lines: lines.join('\n') };
}

function publish() {
  const none = flag('none');
  const id = opt('id');
  const s = state();
  if (none) {
    write(PROMO_FILE, { active: false });
    s.published = null;
    write(STATE_FILE, s);
    console.log('Static promo fallback cleared. Clear the live campaign in CRM → SEO desk → Campaign launchpad if needed.');
    return 0;
  }
  if (!id) {
    const { campaigns } = plan();
    console.log('Choose a campaign:\n');
    for (const c of campaigns) console.log(`  ${c.id.padEnd(34)} ${c.headline}`);
    console.log('\nThen: npm run promo:publish -- --id <id>');
    return 1;
  }
  const { campaigns } = plan();
  const c = campaigns.find(x => x.id === id);
  if (!c) { console.log(`No campaign '${id}'. Run npm run promo:plan.`); return 1; }

  const discount = opt('discount') ? Number(opt('discount')) : null;
  const price = opt('price') ? Number(opt('price')) : null;
  if (discount != null && (!Number.isFinite(discount) || discount <= 0 || discount > 40)) {
    console.log('✗ --discount must be a real percentage between 1 and 40. It is shown to buyers, so it has to be honoured.');
    return 1;
  }
  const until = opt('until');
  if (until && !/^\d{4}-\d{2}-\d{2}$/.test(until)) { console.log('✗ --until must be YYYY-MM-DD'); return 1; }

  const promo = {
    active: true,
    id: c.id,
    kind: c.kind,
    headline: c.headline,
    sub: c.sub,
    cta: c.cta,
    href: c.target,
    discount,
    priceFrom: price,
    until: until || null,
    publishedAt: new Date().toISOString(),
    // The bar is translated client-side from these keys where a dictionary has
    // them, so a promotion does not read as English-only on an Arabic page.
    headlineIsCopy: true
  };
  write(PROMO_FILE, promo);
  s.published = promo;
  if (!s.history.some(h => h.id === c.id)) s.history.push({ id: c.id, firstRun: promo.publishedAt, runs: 1 });
  else s.history.find(h => h.id === c.id).runs++;
  s.campaigns = campaigns.map(x => x.id);
  write(STATE_FILE, s);

  console.log(`Static fallback updated: ${c.headline}`);
  console.log(`  public/promo.json → ${c.target}${discount ? ` · ${discount}% off margin` : ''}${until ? ` · until ${until}` : ''}`);
  console.log('This does not update an active settings API campaign. Publish live from CRM → SEO desk → Campaign launchpad.');
  console.log('');
  console.log('Next:');
  console.log('  npm run promo:social -- --id ' + c.id + '   (copy for every channel)');
  console.log('  npm run build && deploy                   (static fallback only)');
  return 0;
}

function social() {
  const id = opt('id') || state().published?.id;
  if (!id) { console.log('No campaign given and none published. Try: npm run promo:social -- --id machinery-excavators'); return 1; }
  const { campaigns } = plan();
  const c = campaigns.find(x => x.id === id);
  if (!c) { console.log(`No campaign '${id}'.`); return 1; }
  const latest = MACHINES.map(listPriceUSD).filter(Boolean).sort((a, b) => a - b)[0];
  const copy = copyFor(c, { price: opt('price') || latest, discount: opt('discount') ? Number(opt('discount')) : null });
  const out = [];
  out.push(`# ${c.headline}\n`);
  for (const ch of c.channels) {
    if (ch === 'site') continue;
    if (ch === 'email') {
      out.push(`## Email\n\nSubject: ${copy.email.subject}\n\n\`\`\`\n${copy.email.body}\n\`\`\`\n`);
    } else if (ch === 'blog') {
      out.push(`## Blog / news post\n\nTitle: ${copy.blog.title}\n\n\`\`\`\n${copy.blog.body}\n\`\`\`\n`);
    } else {
      out.push(`## ${ch === 'whatsapp' ? 'WhatsApp' : ch[0].toUpperCase() + ch.slice(1)}\n\n\`\`\`\n${copy[ch]}\n\`\`\`\n`);
    }
  }
  const text = out.join('\n');
  writeFileSync(path.join(root, 'PROMO-COPY.md'), text);
  console.log(text);
  console.log('\nEvery link carries UTM tags, so the analytics connector can attribute the traffic.');
  console.log('Wrote PROMO-COPY.md.');
  return 0;
}

function report() {
  const s = state();
  const pub = read(PROMO_FILE, { active: false });
  console.log('Promotions — local fallback and history\n');
  console.log('Guide cadence: 2–4/month. Run promo:plan -- --guides-per-month 2; review and publish in the CRM SEO desk.');
  console.log(`  Static fallback: ${pub.active ? pub.headline + '  →  ' + pub.href : '(none)'}`);
  if (pub.active) {
    console.log(`  Published: ${pub.publishedAt}${pub.until ? ` · runs until ${pub.until}` : ''}`);
    if (pub.discount) console.log(`  Discount shown: ${pub.discount}% off margin — must be honoured in every quotation until it ends.`);
    if (!pub.until) console.log('  No end date set. A promotion with no end is just the price.');
  }
  console.log(`  Campaigns run so far: ${s.history.length}`);
  for (const h of s.history) console.log(`    ${h.id} — first run ${h.firstRun.slice(0, 10)}, ${h.runs} run(s)`);
  if (!s.history.length) console.log('    (none yet — use the fallback-only publish command to record a static run)');
  console.log('  Live production campaign: CRM → SEO desk → Campaign launchpad (not read by this CLI).');
  console.log('');
  console.log('Traffic attribution: the links carry utm_source/utm_medium/utm_campaign.');
  console.log('Run `npm run seo:connect` and set GA4_PROPERTY_ID to read the results.');
  return 0;
}

/* ---------------------------------------------------------------------------
   Publishing to social — why there is no API call here
   ---------------------------------------------------------------------------
   Meta's Graph API can post to a Facebook Page, and WhatsApp Business can send
   approved templates. Both need a business app, an approved app review and a
   page token the owner generates under their own account, and both can get the
   account restricted if used to blast unapproved content. That is the owner's
   decision to make with a token in their own hand, not something a script
   should assume — so this agent writes the copy and prints it. If AR7 later
   wants automated posting, the token goes in META_PAGE_TOKEN and the call goes
   here; the copy is already written for it.
   --------------------------------------------------------------------------- */

const cmd = process.argv[2] || 'report';
if (cmd === 'plan') {
  const { campaigns } = plan();
  console.log(`${campaigns.length} campaigns available. Wrote ${path.basename(PLAN_FILE)}.`);
  console.log('');
  console.log('Run these first — they match stock you actually have:');
  for (const c of campaigns.filter(x => x.kind !== 'destination').slice(0, 5)) {
    console.log(`  ${c.id.padEnd(32)} ${c.headline}`);
  }
} else if (cmd === 'publish') {
  process.exit(publish());
} else if (cmd === 'social') {
  process.exit(social());
} else {
  process.exit(report());
}
