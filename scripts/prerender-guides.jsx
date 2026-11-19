// Build-time HTML for editorial routes and rich static route previews.
// Uses the SAME market component and metadata as the client; live inventory
// is deliberately not frozen at build.
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { DEST, destinationHref } from '../src/destinations.js';
import { DestinationPage } from '../src/destination-page.jsx';
import { Flag } from '../src/flag.jsx';
import { NEWS, articleSlug } from '../src/news-data.js';
import { applySeo, BASE, PAGE_SEO, FAQ_ITEMS, FAQ_TOPICS, MACHINERY_FAQS, MACHINERY_SEO } from '../src/seo.js';
import { MACHINES, machineHref, machineTypeSlug, MACHINE_TYPES, listPriceUSD, machineYear, machineHours, machineImages } from '../src/machinery-data.js';
import { translate } from '../src/i18n.js';
import { CATALOGUE_LINKS } from '../src/catalogue-links.js';

const template = readFileSync('dist/index.html', 'utf8');
const Link = ({to, children, className}) => <a className={className} href={to.startsWith('/') ? to : '/' + to}>{children}</a>;
function emit(path, page, id, content, opts = {}) {
  const dom = new JSDOM(template, {url: BASE + path});
  const doc = dom.window.document;
  applySeo(page, id, null, { ...opts, doc });
  doc.getElementById('root').innerHTML = renderToStaticMarkup(<><nav aria-label="Main navigation"><a href="/">AR7 Traders</a> · <a href="/inventory">Inventory</a> · <a href="/destinations">Destinations</a> · <a href="/news">Buyer guides</a></nav><main>{content}</main></>);
  doc.querySelector('noscript')?.remove();
  const dir = 'dist' + path;
  mkdirSync(dir, {recursive: true});
  writeFileSync(dir + '/index.html', dom.serialize());
  dom.window.close();
}
for (const dest of DEST) {
  emit(destinationHref(dest[0]), 'destinations', null,
    <DestinationPage dest={dest} Link={Link} Related={() => null} Flag={Flag}/>, {destination: dest});
}
for (const article of NEWS) {
  const slug = article.slug || articleSlug(article);
  emit('/news/' + slug, 'news', slug,
    <article className="inner-page shell"><a href="/news">All buyer guides</a><h1>{article.title}</h1><p>{article.ex}</p>{String(article.body || '').split(/\n\n+/).map((p,i) => <p key={i}>{p}</p>)}<a href="/contact">Request a written quotation</a>
    {/* Keep-exploring block (2026-11-07 crawl report): guides had under 8
        internal links, so crawlers hit a dead end instead of the catalogue.
        These are the pages a guide reader actually goes to next. */}
    <nav aria-label="Keep exploring"><h2>Keep exploring</h2><ul>
      <li><a href="/cars/toyota">Used Toyota stock from Japan</a></li>
      <li><a href="/auction">How the Japanese auctions work</a></li>
      <li><a href="/machinery">Heavy machinery sourced from China</a></li>
      <li><a href="/tools">Import duty & CIF calculators</a></li>
      <li><a href="/services">Export services & inspection</a></li>
      <li><a href="/faq">Buyer questions, answered</a></li>
    </ul></nav></article>);
}

const STATIC_BODY_COPY = {
  inventory: {
    h1: 'Live Japanese Car Inventory for Worldwide Export',
    points: [
      ['Curated showroom & Japan dealer stock', 'Inspect verified RHD vehicles from Toyota, Lexus, Honda, Nissan, Mazda, Subaru, Mitsubishi and European makes.'],
      ['Transparent FOB & indicative CIF pricing', 'Compare mileage, auction grade, engine size, transmission and shipping estimates to 27 destination markets.'],
      ['Pre-export inspection & paperwork', 'Every unit ships with Japanese de-registration, Export Certificate, Commercial Invoice and Bill of Lading.']
    ],
    links: [['/cars/toyota', 'Toyota stock'], ['/cars/lexus', 'Lexus stock'], ['/cars/honda', 'Honda stock'], ['/cars/nissan', 'Nissan stock'], ['/auction', 'Auction bidding'], ['/tools', 'Import cost calculator'], ['/destinations', 'Shipping destinations']]
  },
  auction: {
    h1: 'Japanese Car Auction Access & Live Bidding',
    points: [
      ['100+ Japanese auction venues', 'Direct trade bidding across USS Tokyo, USS Nagoya, USS Yokohama, TAA, JU, CAA, HAA Kobe and LAA Kansai.'],
      ['Plain-English auction sheet translation', 'We translate inspector grades (5, 4.5, 4, R), panel codes (A1, U1, W2) and handwritten notes before you bid.'],
      ['Pre-agreed maximum bid ceiling', 'You approve a written yen cap in advance — zero hidden escalation or surprise markups.']
    ],
    links: [['/inventory', 'Browse live inventory'], ['/howbuy', '8-step buying guide'], ['/services', 'Export services'], ['/faq', 'Auction FAQ'], ['/contact', 'Open auction bidding']]
  },
  services: {
    h1: 'End-to-End Vehicle & Machinery Export Services',
    points: [
      ['Sourcing & independent yard verification', 'Auction lot shortlisting, Japan dealer-stock procurement and China heavy machinery inspections with walkaround video.'],
      ['Mandatory destination inspections', 'JEVIC, QISJ, EAA and biosecurity cleaning arranged in Japan ahead of vessel loading.'],
      ['RoRo, container & couriered originals', 'Flexible sea freight from Yokohama, Nagoya, Kobe and Chinese ports with 1.6% marine transit insurance and DHL documents.']
    ],
    links: [['/shipping', 'Shipping & tracking'], ['/tools', 'Landed cost calculator'], ['/howbuy', 'Step-by-step buying'], ['/machinery', 'China machinery desk'], ['/contact', 'Request a quotation']]
  },
  brands: {
    h1: 'Car Brands Exported Worldwide from Japan & China',
    points: [
      ['Japanese core makes', 'Toyota, Lexus, Honda, Nissan, Mazda, Subaru, Mitsubishi, Suzuki and Daihatsu sourced daily.'],
      ['European & performance imports', 'Mercedes-Benz, BMW, Porsche, Land Rover, Audi and specialty collector vehicles inspected in Japan.']
    ],
    links: [
      ['/cars/toyota', 'Toyota for export'], ['/cars/lexus', 'Lexus for export'], ['/cars/honda', 'Honda for export'],
      ['/cars/nissan', 'Nissan for export'], ['/cars/mazda', 'Mazda for export'], ['/cars/mercedes-benz', 'Mercedes-Benz for export'],
      ['/cars/bmw', 'BMW for export'], ['/cars/land-rover', 'Land Rover for export'], ['/cars/subaru', 'Subaru for export'], ['/cars/mitsubishi', 'Mitsubishi for export']
    ]
  },
  destinations: {
    h1: '27 Vehicle Export Destinations, Ports & Duty Guides',
    points: [
      ['Port-by-port transit & customs rules', 'Dedicated import rule, age limit, pre-shipment inspection and freight guides for Asia, Middle East, Africa, UK, Oceania and the Caribbean.']
    ],
    links: DEST.slice(0, 12).map(d => [destinationHref(d[0]), `${d[0]} import guide (${d[1]})`])
  },
  tools: {
    h1: 'Import Duty, Freight & CIF Landed Cost Calculator',
    points: [
      ['Estimate landed port cost before buying', 'Combine vehicle FOB price, ocean RoRo or container freight and 1.6% marine insurance by destination port.'],
      ['Market rule awareness', 'Check typical age caps, RHD/LHD compliance and pre-export inspection notes before placing an auction bid.']
    ],
    links: [['/inventory', 'Pick a vehicle to quote'], ['/destinations', 'Country import rules'], ['/shipping', 'Shipping methods'], ['/contact', 'Request firm written CIF quote']]
  },
  world: {
    h1: 'AR7 Traders Global Export Network & Ports',
    points: [
      ['Origin hubs in Japan and China', 'Loading from Yokohama, Nagoya, Osaka, Kobe, Shanghai, Qingdao and Tianjin to global RoRo and container hubs.'],
      ['27 active destination markets', 'Dedicated clearing and documentation workflows across South Asia, GCC, East & Southern Africa, UK and Oceania.']
    ],
    links: [['/destinations/pakistan', 'Pakistan (Karachi)'], ['/destinations/uae', 'UAE (Jebel Ali)'], ['/destinations/kenya', 'Kenya (Mombasa)'], ['/destinations/tanzania', 'Tanzania (Dar es Salaam)'], ['/destinations/united-kingdom', 'United Kingdom (Southampton)'], ['/shipping', 'Track a shipment']]
  },
  news: {
    h1: 'Japanese Car Import Guides, Auction Tips & Shipping Briefings',
    points: [
      ['Practical guides written by our export desk', 'Decode auction sheets, compare RoRo vs container freight, understand model demand and verify total landed cost.']
    ],
    links: NEWS.map(a => ['/news/' + (a.slug || articleSlug(a)), a.title])
  },
  about: {
    h1: 'About AR7 Traders — Tokyo Vehicle Exporter & Machinery Desk',
    points: [
      ['Tokyo sourcing + China machinery procurement', 'Licensed Japanese auction buyer and vetted Chinese construction equipment exporter serving individual buyers and dealerships worldwide.'],
      ['Single team, itemized paperwork', 'Every purchase follows written proforma invoicing, transparent auction/supplier pricing and tracked DHL originals.']
    ],
    links: [['/howbuy', 'How buying works'], ['/reviews', 'Customer reviews'], ['/inventory', 'View live stock'], ['/machinery', 'View machinery'], ['/contact', 'Speak with our export desk']]
  },
  reviews: {
    h1: 'AR7 Traders Customer Reviews & Delivered Vehicle Stories',
    points: [
      ['Verified export experiences worldwide', 'Read buyer feedback across Pakistan, Kenya, the UAE, Tanzania, the UK and Caribbean markets covering auction translations and port clearance.']
    ],
    links: [['/inventory', 'Browse current inventory'], ['/destinations', 'Read destination guides'], ['/howbuy', 'See the 8-step process'], ['/contact', 'Ask for references']]
  },
  contact: {
    h1: 'Contact the AR7 Traders Japan & China Export Desk',
    points: [
      ['Direct Tokyo & UK desk lines', 'Email ar7tradersinfo@gmail.com or message +44 7347 132624 on WhatsApp for FOB/CIF quotations, auction sheet translations or machinery specs.']
    ],
    links: [['/inventory', 'Live car inventory'], ['/machinery', 'Construction machinery'], ['/tools', 'Calculate CIF cost'], ['/faq', 'Frequently asked questions']]
  },
  shipping: {
    h1: 'RoRo & Container Vehicle Shipping & Shipment Tracking',
    points: [
      ['Live invoice tracking by reference number', 'Enter your AR7 shipment reference to check vessel loading, port departure, ocean transit and ETA updates.'],
      ['RoRo, dedicated container & breakbulk', 'Cars ship RoRo or containerized from Japanese ports; excavators, wheel loaders and cranes ship flat-rack or breakbulk from China.']
    ],
    links: [['/destinations', 'Destination port guides'], ['/tools', 'Estimate freight cost'], ['/services', 'Export documents & insurance'], ['/contact', 'Ask about sailing dates']]
  },
  privacy: { h1: 'Privacy Policy — AR7 Traders', points: [['Data minimisation', 'AR7 Traders collects only the details needed to prepare export quotations, vehicle reservations and shipping documentation.']], links: [['/cookies', 'Cookie policy'], ['/terms', 'Terms & export policy'], ['/contact', 'Contact us']] },
  cookies: { h1: 'Cookie & Browser Storage Policy — AR7 Traders', points: [['No advertising cookies', 'Only functional local preferences (theme, language, currency, saved vehicles) and cookieless analytics are used.']], links: [['/privacy', 'Privacy policy'], ['/terms', 'Terms & export policy'], ['/inventory', 'Return to inventory']] },
  terms: { h1: 'Terms & Vehicle Export Policy — AR7 Traders', points: [['Export terms', 'Written proforma invoices, T/T bank settlement, FOB/CIF definitions and pre-shipment inspection responsibilities.']], links: [['/howbuy', 'How buying works'], ['/shipping', 'Shipping & insurance'], ['/contact', 'Export desk contact']] }
};

function renderStaticRoutePreview(page, opts = {}) {
  if (page === 'faq') {
    return (
      <>
        <nav aria-label="Breadcrumb"><a href="/">Home</a> / FAQ</nav>
        <h1>Japanese Car &amp; Machinery Import FAQ</h1>
        <p>{PAGE_SEO.faq[1]}</p>
        {FAQ_TOPICS.map(topic => (
          <section key={topic}>
            <h2>{topic}</h2>
            <dl>
              {FAQ_ITEMS.filter(x => x[2] === topic).map(([q, a]) => (
                <React.Fragment key={q}><dt><b>{q}</b></dt><dd>{a}</dd></React.Fragment>
              ))}
            </dl>
          </section>
        ))}
        <nav aria-label="Explore next"><a href="/howbuy">How to buy</a> · <a href="/inventory">Live inventory</a> · <a href="/machinery">Machinery</a> · <a href="/tools">Import cost calculator</a> · <a href="/contact">Contact us</a></nav>
      </>
    );
  }
  if (page === 'howbuy') {
    const steps = [1, 2, 3, 4, 5, 6, 7, 8].map(i => [i, translate('en', `hb.s${i}t`), translate('en', `hb.s${i}p`)]);
    return (
      <>
        <nav aria-label="Breadcrumb"><a href="/">Home</a> / How to Buy</nav>
        <h1>How to Buy &amp; Import a Car from Japan (8 Steps)</h1>
        <p>{PAGE_SEO.howbuy[1]}</p>
        <ol>{steps.map(([i, t, p]) => <li key={i}><b>Step {i}: {t}</b> — {p}</li>)}</ol>
        <nav aria-label="Explore next"><a href="/auction">Auction bidding</a> · <a href="/inventory">Live stock</a> · <a href="/tools">Calculate CIF cost</a> · <a href="/shipping">Shipping &amp; tracking</a> · <a href="/contact">Start enquiry</a></nav>
      </>
    );
  }
  if (page === 'machinery' && opts.machine) {
    const m = opts.machine;
    const price = listPriceUSD(m);
    const yr = machineYear(m);
    const hrs = machineHours(m);
    const imgs = machineImages(m);
    const typeSlug = String(m.type || '').toLowerCase();
    return (
      <>
        <nav aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/machinery">Machinery</a> / <a href={`/machinery/${typeSlug}`}>{m.type}</a> / {m.ref}</nav>
        <h1>{[yr, m.name, `(${m.ref}) — Export from China`].filter(Boolean).join(' ')}</h1>
        <p>{m.summary}</p>
        {imgs[0] ? <img src={imgs[0]} alt={`${m.name} (${m.ref})`} width="760" height="507"/> : null}
        <ul>
          <li>Category: {m.type}</li>
          <li>Brand: {m.brand}</li>
          {yr ? <li>Year: {yr}</li> : null}
          {hrs != null ? <li>Usage: {hrs.toLocaleString('en-US')} {m.type === 'Trucks' ? 'km' : 'hours'}</li> : null}
          <li>Pricing: {price ? `Indicative FOB US$${Number(price).toLocaleString('en-US')}` : 'FOB price on request'} (sourced to order from vetted Chinese suppliers)</li>
        </ul>
        <p>Inspected with walkaround video and cold-start footage prior to payment; flat-rack, container or breakbulk shipping quoted to your port.</p>
        <nav aria-label="Explore next"><a href={`/machinery/${typeSlug}`}>All {m.type}</a> · <a href="/machinery">All construction machinery</a> · <a href="/contact">Request machine quote</a></nav>
      </>
    );
  }
  if (page === 'machinery') {
    const slug = opts.machineType ? String(opts.machineType).toLowerCase() : null;
    const typeLabel = MACHINE_TYPES.find(t => t.toLowerCase() === slug) || slug;
    const filtered = slug ? MACHINES.filter(m => String(m.type).toLowerCase() === slug) : MACHINES;
    const seoPair = slug ? MACHINERY_SEO[slug] : PAGE_SEO.machinery;
    const faqs = MACHINERY_FAQS[slug || 'all'] || MACHINERY_FAQS.all;
    return (
      <>
        <nav aria-label="Breadcrumb"><a href="/">Home</a> / {slug ? <><a href="/machinery">Machinery</a> / {typeLabel}</> : 'Machinery'}</nav>
        <h1>{seoPair ? seoPair[0].replace(/\s*\|\s*AR7 Traders$/, '') : 'Construction Machinery for Export'}</h1>
        <p>{seoPair ? seoPair[1] : PAGE_SEO.machinery[1]}</p>
        <p>Browse by type: {MACHINE_TYPES.map((t, i) => <React.Fragment key={t}>{i > 0 ? ' · ' : ''}<a href={`/machinery/${t.toLowerCase()}`}>{t}</a></React.Fragment>)}</p>
        <ul>
          {filtered.map(m => {
            const p = listPriceUSD(m);
            return <li key={m.ref}><a href={machineHref(m)}>{m.name} ({m.ref})</a> — {m.brand}{p ? ` · Indicative FOB US$${Number(p).toLocaleString('en-US')}` : ''}</li>;
          })}
        </ul>
        <h2>Common questions</h2>
        <dl>{faqs.map(([q, a]) => <React.Fragment key={q}><dt><b>{q}</b></dt><dd>{a}</dd></React.Fragment>)}</dl>
        <nav aria-label="Explore next"><a href="/inventory">Japanese cars</a> · <a href="/services">Export services</a> · <a href="/shipping">Shipping</a> · <a href="/contact">Request quotation</a></nav>
      </>
    );
  }
  const spec = STATIC_BODY_COPY[page];
  const seoPair = PAGE_SEO[page] || PAGE_SEO.home;
  return (
    <>
      <nav aria-label="Breadcrumb"><a href="/">Home</a> / {spec ? spec.h1 : seoPair[0]}</nav>
      <h1>{spec ? spec.h1 : seoPair[0].replace(/\s*\|\s*AR7 Traders$/, '')}</h1>
      <p>{seoPair[1]}</p>
      {spec?.points?.length ? (
        <ul>{spec.points.map(([t, d]) => <li key={t}><b>{t}:</b> {d}</li>)}</ul>
      ) : null}
      {spec?.links?.length ? (
        <nav aria-label="Related sections"><h2>Explore next</h2><ul>{spec.links.map(([href, label]) => <li key={href}><a href={href}>{label}</a></li>)}</ul></nav>
      ) : null}
    </>
  );
}

// ---------------------------------------------------------------------------
// Head + route-matched crawler/no-JS fallback prerender for static public
// routes. Keeps #ar7-boot completely untouched (scripts/indexing-followup.test.mjs)
// while replacing the generic homepage text inside #ar7-static-preview with
// route-unique headings, specs, FAQs/steps, and internal cross-links so search
// engines and AI crawlers never read 34 static routes as duplicate home HTML.
// ---------------------------------------------------------------------------
function emitHeadOnly(path, page, opts = {}) {
  const dom = new JSDOM(template, {url: BASE + path});
  const doc = dom.window.document;
  applySeo(page, null, null, { ...opts, doc });
  const preview = doc.getElementById('ar7-static-preview');
  if (preview) {
    preview.innerHTML = renderToStaticMarkup(<>{renderStaticRoutePreview(page, opts)}<nav aria-label="Browse the catalogue"><h2>Browse the catalogue</h2><ul>{CATALOGUE_LINKS.filter(([href]) => href !== path).map(([href, label]) => <li key={href}><a href={href}>{label}</a></li>)}</ul></nav></>);
  }
  const dir = 'dist' + path;
  mkdirSync(dir, {recursive: true});
  writeFileSync(dir + '/index.html', dom.serialize());
  dom.window.close();
}

export const STATIC_PAGE_ROUTES = [
  'inventory', 'auction', 'services', 'brands', 'destinations', 'tools',
  'world', 'howbuy', 'news', 'about', 'reviews', 'faq', 'contact',
  'shipping', 'machinery', 'privacy', 'cookies', 'terms'
];
for (const page of STATIC_PAGE_ROUTES) emitHeadOnly('/' + page, page);
for (const type of MACHINE_TYPES) {
  const slug = String(type).toLowerCase();
  emitHeadOnly('/machinery/' + slug, 'machinery', { machineType: slug });
}
for (const machine of MACHINES) {
  emitHeadOnly(machineHref(machine), 'machinery',
    { machineType: machineTypeSlug(machine.type), machineRef: machine.ref, machine });
}
