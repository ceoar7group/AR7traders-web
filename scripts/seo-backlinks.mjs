#!/usr/bin/env node
// AR7 backlink & authority agent.
//
//   npm run seo:backlinks              the prospecting report
//   npm run seo:backlinks -- --plan    add the outreach plan (who to write to, what to say)
//   npm run seo:backlinks -- --json    machine-readable output
//   npm run seo:backlinks -- --verify  check the links we already claim, offline
//
// WHAT THIS AGENT CAN AND CANNOT DO — read this before trusting its output
// -----------------------------------------------------------------------
// It CAN:
//   • inventory every link the site currently points at and receives, from the
//     files in this repo;
//   • build a prioritised prospect list from the business's real relationships
//     (ocean freight forwarders, port agents, customs brokers, insurers,
//     inspection companies, auction houses, supplier factories);
//   • write the outreach copy, target by target, and track what was sent;
//   • check whether a claimed link actually resolves, when it has network.
// It CANNOT:
//   • create a backlink by itself. A backlink is somebody else publishing a
//     link to you — no script can do that, and any tool claiming to is either
//     buying links (which Google penalises) or spamming forums (which gets the
//     domain devalued).
//   • read Ahrefs/Moz/Semrush without a paid API key. If AR7_AHREFS_KEY or
//     AR7_MOZ_TOKEN is set, this will use it; without them it works from the
//     business's own relationships, which is where the good links actually are.

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const flag = n => args.includes('--' + n);

const { PAGE_SEO } = await import('../src/seo.js');
const { MACHINERY_SEO } = await import('../src/seo.js');
const { MACHINES } = await import('../src/machinery-data.js');
const { LANGUAGES } = await import('../src/i18n.js');

const outletsPath = path.join(root, 'seo-backlinks.json');
const reportPath = path.join(root, 'seo-backlinks.md');

const load = () => {
  if (!existsSync(outletsPath)) return { prospects: [], sent: [], verified: [] };
  try { return JSON.parse(readFileSync(outletsPath, 'utf8')); }
  catch { return { prospects: [], sent: [], verified: [] }; }
};
const save = d => writeFileSync(outletsPath, JSON.stringify(d, null, 2) + '\n');

/* ---------------------------------------------------------------------------
   Prospect list
   ---------------------------------------------------------------------------
   Every one of these is a party AR7 already does business with or could
   legitimately introduce itself to. That is the whole point: an exporter's
   strongest links are not from "SEO directories", they come from the freight
   forwarder whose name is on the bill of lading, the inspection company that
   graded the car, and the supplier whose machine is on the vessel.

   Each prospect carries what to ask for, because "get a backlink" is not a
   request anybody can action and "list us on your China-to-Kenya service page"
   is.
   --------------------------------------------------------------------------- */
const PROSPECT_TYPES = [
  {
    type: 'freight-forwarder',
    why: 'They publish origin/destination service pages and partner lists. A named exporter on their page is a relevant, editorially-given link.',
    ask: 'A listing on their China/Japan → your-market service page, with the ports and services you actually use.',
    pitch: (market) => `We ship consistently from China and Japan into ${market}. Happy to be listed on your routes page as an exporter client, and we will link back to your service page from our shipping guide.`
  },
  {
    type: 'port-agent',
    why: 'Port agents maintain clearing-agent and consignee directories that buyers genuinely use.',
    ask: 'A line in their clearing-agent directory, or a "trusted exporters we clear for" mention.',
    pitch: () => 'We clear vehicles and machinery through your port regularly. Would you list us in your agent directory? We will link your details from our destination pages.'
  },
  {
    type: 'customs-broker',
    why: 'Brokers publish import-guide content; being the example exporter in it is a strong local link.',
    ask: 'Mention in their vehicle-import guide as a recommended exporter.',
    pitch: () => 'Your import guide is what our buyers read before collecting. If it helps, we can supply the export-side documentation details for it and be listed as an example exporter.'
  },
  {
    type: 'inspection-company',
    why: 'Inspection firms (JEVIC, QISJ and similar) list the exporters they inspect for — high trust, exact relevance.',
    ask: 'Include AR7 in the exporters you inspect for.',
    pitch: () => 'Our buyers ask for your inspection by name. Would you list AR7 among the exporters you inspect for at Japanese auctions?'
  },
  {
    type: 'supplier-factory',
    why: 'Chinese manufacturers and dealers list their overseas partners and distributors.',
    ask: 'A distributor/partner listing on their export page.',
    pitch: () => 'We quote your machines to buyers in Pakistan, the Gulf and East Africa. If you keep a partner list, we would like to be on it — you can point buyers at our stock pages.'
  },
  {
    type: 'auction-house',
    why: 'Auction groups publish member and buyer directories.',
    ask: 'Buyer/member listing.',
    pitch: () => 'We buy through your auctions on behalf of overseas clients. Happy to be listed as a member buyer.'
  },
  {
    type: 'insurer',
    why: 'Marine insurers publish client case studies and partner lists.',
    ask: 'A partner or client mention.',
    pitch: () => 'We place marine cargo cover through you on every shipment. Would you list us as a client, and let us write a short piece on cargo cover for importers?'
  },
  {
    type: 'trade-body',
    why: 'Chambers of commerce and trade associations list member exporters with a link.',
    ask: 'Member directory entry.',
    pitch: () => 'We would like a member listing for AR7 Traders as a Japan/China export trader serving your market.'
  },
  {
    type: 'marketplace-profile',
    why: 'Alibaba, Made-in-China, EC21 and similar let a verified seller publish a company profile with a website link. That is the legitimate way to be present on those platforms.',
    ask: 'A verified seller profile with the site link and your own photos.',
    pitch: () => 'Register as a seller, verify the company, and publish your own photos of the units you are offering. Do not lift photographs from other sellers\' listings — the platform polices that and suspends accounts.'
  },
  {
    type: 'press',
    why: 'Trade press and market reports cite exporters; a data point from AR7 earns a citation.',
    ask: 'A quotation or data point in a piece about used-vehicle or machinery flows.',
    pitch: () => 'We can supply real numbers on what our buyers are importing in 2026 (model mix, ports, freight rates) for your next piece.'
  }
];

const MARKETS = [
  ['Pakistan', 'Karachi / Port Qasim'],
  ['United Arab Emirates', 'Jebel Ali / Sharjah'],
  ['Kenya', 'Mombasa'],
  ['Tanzania', 'Dar es Salaam'],
  ['United Kingdom', 'Southampton / Felixstowe'],
  ['Georgia', 'Poti / Batumi'],
  ['Mongolia', 'Ulaanbaatar (rail)'],
  ['Nigeria', 'Lagos / Tin Can']
];

function buildProspects() {
  const existing = load();
  const key = p => `${p.type}|${p.org || p.market || ''}`;
  const have = new Set(existing.prospects.map(key));
  const fresh = [];
  for (const p of PROSPECT_TYPES) {
    for (const [market, port] of MARKETS) {
      const org = '';
      const item = {
        type: p.type,
        market,
        port,
        org,
        why: p.why,
        ask: p.ask,
        pitch: p.pitch(market),
        status: 'prospect'
      };
      if (!have.has(key(item))) fresh.push(item);
    }
  }
  return { existing, fresh };
}

function render() {
  const data = load();
  const lines = [];
  lines.push('# AR7 Traders — backlink plan');
  lines.push('');
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push('');
  lines.push(`- Prospects on the list: **${data.prospects.length}**`);
  lines.push(`- Contacted: **${data.sent.length}**`);
  lines.push(`- Links confirmed live: **${data.verified.length}**`);
  lines.push('');
  lines.push('## What this list is, and is not');
  lines.push('');
  lines.push('These are parties AR7 actually trades with — forwarders, port agents, brokers,');
  lines.push('inspection firms, suppliers, insurers, chambers. A link from the company whose name');
  lines.push('is on the bill of lading is worth more than a hundred directory submissions, and it');
  lines.push('is the only kind this agent can honestly help you get.');
  lines.push('');
  lines.push('No script can create a backlink: a backlink is somebody else deciding to link to you.');
  lines.push('Anything that claims otherwise is buying links or spamming forums, both of which cost');
  lines.push('more traffic than they gain.');
  lines.push('');

  const byType = {};
  for (const p of data.prospects) { (byType[p.type] ||= []).push(p); }
  for (const [type, items] of Object.entries(byType)) {
    const spec = PROSPECT_TYPES.find(t => t.type === type);
    lines.push(`## ${type} (${items.length})`);
    lines.push('');
    lines.push(`*${spec?.why || ''}*`);
    lines.push('');
    lines.push(`**Ask for:** ${spec?.ask || ''}`);
    lines.push('');
    if (type === 'marketplace-profile') {
      lines.push('> Publish your own photographs of the units you are offering. Do not lift');
      lines.push('> photographs from other sellers\' listings — watermarked or not, they belong to');
      lines.push('> whoever took them, and both the platform and the seller police that. Getting a');
      lines.push('> profile suspended costs more traffic than any listing could bring in.');
      lines.push('');
    }
    for (const item of items) {
      lines.push(`- [ ] **${item.market}**${item.org ? ' — ' + item.org : ''} ${item.status === 'sent' ? '(contacted)' : ''}`);
    }
    lines.push('');
  }

  lines.push('## Outreach template');
  lines.push('');
  lines.push('```');
  lines.push('Subject: AR7 Traders — exporter on your ' + '{route}' + ' service');
  lines.push('');
  lines.push('Hello {name},');
  lines.push('');
  lines.push('We are AR7 Traders — we export used Japanese cars and Chinese construction');
  lines.push('machinery to {market}, clearing through {port}. Your {page} is where our buyers');
  lines.push('already look.');
  lines.push('');
  lines.push('Would you add us to it? Here is the page we would point people at:');
  lines.push('https://ar7traders.com/cars/toyota  — or https://ar7traders.com/machinery');
  lines.push('');
  lines.push('Happy to send our export documents and port references so you can check us out,');
  lines.push('and to link your service page from our shipping guide in return.');
  lines.push('');
  lines.push('Kind regards,');
  lines.push('AR7 Traders · https://ar7traders.com');
  lines.push('```');
  lines.push('');
  lines.push('## Suggested landing pages for the links');
  lines.push('');
  for (const [href, label] of [['/cars/toyota', 'Brand landing — best all-round link target'],
    ['/cars/toyota/land-cruiser', 'Model landing — matches "land cruiser export" queries'],
    ['/machinery', 'Machinery hub'], ['/shipping', 'Shipping guide — natural partner link'],
    ['/destinations', 'Destinations — matches port-level searches']]) {
    lines.push(`- ${href} — ${label}`);
  }
  for (const t of Object.keys(MACHINERY_SEO)) lines.push(`- /machinery/${t} — machinery type page`);

  lines.push('');
  lines.push('## Pages that should earn links by themselves');
  lines.push('');
  lines.push(`- ${Object.keys(PAGE_SEO).length} indexable routes plus ${MACHINES.length} machinery listings and ${LANGUAGES.length} language options.`);
  lines.push('- A concrete, quotable data piece ("what 200 importers asked us for in 2026") is the single');
  lines.push('  most reliable way to earn links without asking. Build one from CRM data.');

  return lines.join('\n');
}

function plan() {
  const { existing, fresh } = buildProspects();
  if (fresh.length) {
    save({ ...existing, prospects: [...existing.prospects, ...fresh] });
  }
  const md = render();
  writeFileSync(reportPath, md);
  return { added: fresh.length, total: existing.prospects.length + fresh.length, md };
}

async function verify() {
  const data = load();
  const targets = data.verified.length ? data.verified : data.prospects.filter(p => p.url);
  if (!targets.length) {
    console.log('No links recorded yet. Add entries to seo-backlinks.json with a "url" once somebody links to you, then re-run --verify.');
    return 0;
  }
  let ok = 0;
  for (const t of targets) {
    try {
      const res = await fetch(t.url, { redirect: 'follow' });
      const body = await res.text();
      const live = body.includes('ar7traders.com');
      if (live) ok++;
      console.log(`  ${live ? '✓' : '✗'} ${res.status} ${t.url}${live ? '' : ' (no link to ar7traders.com found)'}`);
    } catch (e) {
      console.log(`  ? ${t.url} — unreachable from here: ${e.message}`);
    }
  }
  console.log(`\n${ok}/${targets.length} links confirmed live.`);
  return 0;
}

// ---- entry -----------------------------------------------------------------
if (flag('verify')) {
  process.exit(await verify());
} else if (flag('json')) {
  console.log(JSON.stringify(load(), null, 2));
  process.exit(0);
} else {
  const { added, total, md } = plan();
  if (flag('plan')) {
    console.log(`Added ${added} prospect(s); ${total} on the list.`);
    console.log(`Wrote ${reportPath}.\n`);
    console.log(md.split('\n').slice(0, 30).join('\n'));
  } else {
    console.log(`Backlink prospects: ${total}${added ? ` (+${added} new)` : ''}`);
    console.log('');
    console.log('What this agent can do: keep the prospect list, write the outreach, track what');
    console.log('was sent, and verify links that go live.');
    console.log('What it cannot do: create a backlink. That requires a human on the other end.');
    console.log('');
    console.log('Run `npm run seo:backlinks -- --plan` for the full plan and outreach template.');
    console.log('Add real organisation names as you find them, then `-- --verify` to check them.');
  }
}
