// One market's own page: /destinations/kenya (2026-10-08).
//
// Lazy-loaded from src/main.jsx like the machinery desk and the globe, so a
// visitor on the home page never downloads a page about Mombasa. `Link`,
// `Related` and `Flag` arrive as props: they belong to main.jsx (PageLink,
// RelatedStock over the live `cars` list, and the flag map) and importing them
// from here would make the route module depend on the module that loads it.
//
// The facts, the document packs and the five FAQs come from src/destinations.js
// — the same module src/seo.js reads to build this URL's title, description and
// FAQPage markup, so what is rendered and what is claimed cannot drift apart.
import React from 'react';
import { ArrowRight, Check, Globe2, ShieldCheck } from 'lucide-react';
import { DEST, destinationFacts, destinationFaqs, destinationHref } from './destinations.js';

// ── One market's own page (/destinations/kenya) ────────────────────────────
// The hub's picker answers a visitor who is already here. This page answers the
// search: one H1 naming the route, that market's real facts, the documents its
// port needs, live stock the route carries, and the five questions its buyers
// ask — rendered visibly and mirrored in the FAQPage markup src/seo.js emits
// for the same URL. Transit windows stay planning estimates and no duty rate is
// ever quoted (CLAIMS-POLICY.md: that is the buyer's own customs authority's
// number, not ours).
export function DestinationPage({dest,destSlug,navigate,openAuction,Link,Related,Flag}){
 if(!dest)return <section className="inner-page destination-page"><div className="shell">
  <Link className="back-btn" to="destinations" navigate={navigate}>← All destinations</Link>
  <div className="empty-state"><Globe2/><h3>No market guide for that URL yet</h3>
   <p>We ship from Japan to the markets below. Tell us your port and we will quote the route, the sailing and the document pack in writing.</p>
   <div className="destination-market-links">{DEST.map(d=><Link key={d[0]} className="outline-btn" to={destinationHref(d[0])} navigate={navigate}>{Flag[d[0]]} Japan to {d[0]}</Link>)}</div>
   <button className="primary" type="button" onClick={openAuction}>Ask about your market <ArrowRight/></button>
  </div></div></section>;
 const f=destinationFacts(dest);
 const faqs=destinationFaqs(dest);
 return <section className="inner-page destination-page">
  <div className="shell">
   <Link className="back-btn" to="destinations" navigate={navigate}>← All destinations</Link>
   <div className="destination-hero">
    <div className="kicker">{Flag[f.country]} JAPAN → {f.country.toUpperCase()} · {f.port}</div>
    <h1>{f.h1}</h1>
    <p className="destination-lede">Used cars bought at Japanese auctions and from dealer stock, exported to {f.port} with the document pack your clearing agent files with. Every price on this site is an indicative FOB figure, confirmed by a written quotation.</p>
    {f.eligibility&&<p className="destination-note"><b>Before you buy:</b> {f.eligibility} <a href={f.source} target="_blank" rel="noopener noreferrer">Check the official import guidance</a></p>}
    <dl className="destination-facts">
     <div><dt>Port of discharge</dt><dd>{f.port}</dd></div>
     <div><dt>Planning transit</dt><dd>{f.transit} <small>estimate — vessel schedules and transshipment vary</small></dd></div>
     <div><dt>Models this route carries</dt><dd>{f.models.join(' · ')}</dd></div>
     <div><dt>Loading ports in Japan</dt><dd>Yokohama · Nagoya · Osaka · Kobe</dd></div>
    </dl>
    <div className="destination-cta">
     <button className="primary" type="button" onClick={openAuction}>Get a written quotation for {f.country} <ArrowRight/></button>
     <Link className="outline-btn" to="inventory" navigate={navigate}>See Japan stock ready to ship <ArrowRight/></Link>
    </div>
   </div>
   <div className="destination-guide-cols">
    <article className="destination-guide-card"><div className="kicker">BEFORE DEPARTURE</div><h2>What happens in Japan</h2><p>{f.whatToExpect}</p></article>
    <article className="destination-guide-card"><div className="kicker">PORT CLEARANCE</div><h2>On arrival at {f.port}</h2><p>{f.onArrival}</p></article>
   </div>
   <section className="destination-docs" aria-label={`Documents required to import a used car into ${f.country}`}>
    <div className="kicker">DOCUMENT PACK</div>
    <h2>What {f.authority} needs</h2>
    <ul>{f.docs.map(d=><li key={d}><Check/> {d}</li>)}</ul>
    {f.inspection&&<p className="destination-note"><ShieldCheck/> <span><b>Pre-shipment inspection:</b> {f.inspection}.</span></p>}
    <p className="destination-note"><ShieldCheck/> <span><b>Duty and taxes:</b> assessed by {f.authority} at the port of entry. We never quote a duty rate — your licensed clearing agent calculates what is payable from the original documents we courier.</span></p>
   </section>
   <Related navigate={navigate} limit={3} kicker="STOCK THIS ROUTE CARRIES" note={`Live Japan stock in the models ${f.country} buyers ask for most. Indicative FOB, confirmed by written quotation.`}
     pick={c=>f.models.some(model=>{const key=String(model).toLowerCase().split(' ')[0];return key.length>2&&String(c.model||'').toLowerCase().includes(key)})}/>
   <section className="destination-faq" aria-label={`Importing a used car from Japan to ${f.country}: questions buyers ask`}>
    <div className="kicker">QUESTIONS BUYERS ASK</div>
    <h2>Importing from Japan to {f.country}, answered</h2>
    <div className="destination-faq-list">{faqs.map(([q,a])=><details key={q}><summary>{q}</summary><p>{a}</p></details>)}</div>
   </section>
   <nav className="destination-market-links" aria-label="Other markets we ship to from Japan">
    {DEST.filter(d=>d[0]!==f.country).map(d=><Link key={d[0]} className="outline-btn" to={destinationHref(d[0])} navigate={navigate}>{Flag[d[0]]} Japan to {d[0]}</Link>)}
   </nav>
  </div>
 </section>;
}

