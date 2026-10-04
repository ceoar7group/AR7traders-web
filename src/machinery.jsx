// Machinery & construction equipment page (loaded on demand from /machinery).
//
// The page is part of the car site's business: AR7 sources cars from Japanese
// auctions and heavy equipment from vetted Chinese suppliers. Everything on
// this page is presented as an enquiry catalogue — every price is labelled
// indicative FOB and confirmed by written quotation — and the main call to
// action is a quotation request through the site's own lead form.
//
// Each card opens a page of its own, /machinery/<type>/<REF>, exactly the way a
// car opens at /inventory/<ref>: a URL a buyer can send to a colleague, a title
// and a price a search engine can index, and a link the site's own sitemap can
// carry. The card's thumbnail strip stays on the card (it is a preview), but
// the photo and the "N photos" button both go to the page.
//
// A live price offer (the CRM's "Price offers" panel, `npm run offer`, or an
// instruction typed into that panel) is applied here from src/offers.js: the
// card and the detail page show the list price struck through, the reduced
// price, and what the buyer saves — from one function, never two.
import React, {useEffect, useMemo, useState} from 'react';
import {createPortal} from 'react-dom';
import {
  ArrowLeft, ArrowRight, BadgeCheck, Camera, Check, ClipboardCheck, Container, Gauge,
  Images, MapPin, MessageCircle, PackageCheck, Search, Settings2, Ship, ShieldCheck, Sparkles,
  Truck, Wrench, X
} from 'lucide-react';
import {useCurrency} from './currency.jsx';
import {useSettings, telHref, waLink} from './site-settings.js';
import {useLang} from './i18n.jsx';
import {
  MACHINES, MACHINE_TYPES, MACHINERY_NOTE, listPriceUSD, machineImages, machinesByType,
  machineByRef, machineHref
} from './machinery-data.js';
import { useMachineryVersion } from './machinery-hydrate.jsx';
import {useOffer, percentFor, priceWithOffer, describeOffer} from './offers.js';
import {MACHINERY_FAQS} from './seo.js';
import './machinery.css';

// The catalogue's FAQ block — rendered visibly on the hub and every type page,
// and mirrored in the FAQPage JSON-LD that src/seo.js emits for the same
// routes. One source of truth, so markup and copy cannot drift.
function MachineryFaq({start}){
 const faqs = MACHINERY_FAQS[String(start || '').toLowerCase()] || MACHINERY_FAQS.all;
 const label = start && start !== 'All' ? start : 'machinery';
 return <section className="mch-faq" aria-labelledby="mch-faq-title">
  <div className="kicker">COMMON QUESTIONS</div>
  <h2 id="mch-faq-title">{start && start !== 'All' ? start : 'Machinery export'}, answered.</h2>
  <div className="mch-faq-list">
   {faqs.map(([q, a]) => (
    <details key={q}>
     <summary>{q}</summary>
     <p>{a}</p>
    </details>
   ))}
  </div>
 </section>;
}

const TRUST = [
  [ClipboardCheck, 'Supplier vetting', 'Dealer and factory checks before a machine is offered to you.'],
  [Camera, 'Photo & video survey', 'Walkaround, hour-meter and cold-start video before payment.'],
  [Ship, 'Shipping arranged', 'Container, flat-rack, breakbulk or RoRo — quoted to your port.'],
  [PackageCheck, 'Spares & manuals', 'Parts sourcing and operator manuals after delivery.']
];

// One unique, keyword-shaped intro per catalogue page: /machinery/excavators
// must not read like the generic landing page.
const MACHINE_INTRO = {
  Excavators: 'Crawler excavators from 13 to 37 tonnes — Doosan, Sany, XCMG and Komatsu — sourced to order from vetted Chinese suppliers, inspected with photos and video, and shipped to your port as breakbulk, flat-rack or container cargo.',
  Loaders: 'Wheel loaders from 3 to 6 tonnes for aggregates, batching plants and bulk handling, sourced to order from vetted Chinese suppliers with inspection photos and shipping to your port.',
  Trucks: 'Tipper trucks and tractor heads from Shacman, Sinotruk and Howo — heavy haulage machines sourced to order from vetted Chinese suppliers, shipped breakbulk with export documents.',
  Cranes: 'Truck cranes and rough-terrain cranes from Zoomlion and XCMG, sourced to order from vetted Chinese suppliers with lifting certificates, inspection video and shipping to your port.',
  All: 'Excavators, wheel loaders, tippers and cranes sourced to order from vetted Chinese suppliers — inspected, photographed and shipped to your port with the paperwork handled.'
};

const usageOf = m => {
  const h = Number(m.hours);
  if (!Number.isFinite(h) || h <= 0) return m.type === 'Trucks' ? 'km on request' : 'hours on request';
  return m.type === 'Trucks' ? `${h.toLocaleString('en-US')} km` : `${h.toLocaleString('en-US')} h`;
};

/* --------------------------------------------------------------------------
   Machine detail view — the whole walkaround, the full spec table and the
   reference number a buyer quotes when they enquire. This is where the extra
   photos earn their place: a buyer spending USD 40k wants to see the machine
   from more than one angle before they ask for a quotation.
   -------------------------------------------------------------------------- */
/**
 * One machine's own page. Same shape as a car's detail page on purpose: big
 * photograph, the facts in a table, the price with any live offer on it, the
 * reference number, and a way to ask about it. Nothing here claims the unit is
 * in stock — the wording says "sourced to order" everywhere a buyer might read
 * it as stock.
 */
function MachineDetailPage({machine, navigate, onQuote, onChat}) {
  const {fmt} = useCurrency();
  const {t} = useLang();
  const offer = useOffer();
  useMachineryVersion();
  const photos = machineImages(machine);
  const [shot, setShot] = useState(0);
  const [zoom, setZoom] = useState(false);
  const label = machine.type.endsWith('s') ? machine.type.slice(0, -1) : machine.type;
  const percent = percentFor(offer, 'machine', {ref: machine.ref, type: machine.type});
  const price = priceWithOffer(listPriceUSD(machine), percent);
  const related = MACHINES.filter(m => m.id !== machine.id && m.type === machine.type).slice(0, 3);
  const back = `/machinery/${machine.type.toLowerCase()}`;
  useEffect(() => {
    if (!zoom || photos.length <= 1) return;
    const onKey = e => {
      if (e.key === 'ArrowLeft') { setShot(s => (s - 1 + photos.length) % photos.length); }
      if (e.key === 'ArrowRight') { setShot(s => (s + 1) % photos.length); }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [zoom, photos.length]);
  return <section className="inner-page machinery-page mch-detail-page">
    <div className="shell page-content">
      <a className="back-btn" href={back} onClick={e => {
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
        e.preventDefault();
        navigate(back);
      }}>
        <ArrowLeft size={14}/> Back to {machine.type}
      </a>

      <div className="mch-detail">
        <div className="mch-detail-gallery">
          {photos.length
            ? <button className="mch-detail-shot" type="button" onClick={() => setZoom(true)}
                aria-label={`Enlarge the ${machine.name} photograph`}>
                <img width="900" height="600" src={photos[shot]} loading="eager" decoding="async" fetchPriority="high"
                  alt={`${machine.name} ${label.toLowerCase()} offered for export from China — ${machine.ref}, photo ${shot + 1} of ${photos.length}`}/>
              </button>
            : <div className="mch-nophoto large">
                <Camera/>
                <b>Photos on request</b>
                <span>Photos and a walkaround video of this unit are sent by the desk before any payment. This is the one part of a listing we will not improvise.</span>
              </div>}
          {price.hasOffer && <span className="mch-offer-flag"><Sparkles size={13}/> {price.percent}% off{offer?.until ? ` · ends ${offer.until.slice(8, 10)}/${offer.until.slice(5, 7)}` : ''}</span>}
          {photos.length > 1 && (
            <div className="mch-detail-strip" role="group" aria-label={`${machine.name} photos`}>
              {photos.map((src, i) => <button key={src} type="button" className={i === shot ? 'active' : ''}
                onClick={() => setShot(i)} aria-label={`Show photo ${i + 1} of ${photos.length}`}>
                <img loading="lazy" decoding="async" width="150" height="100" src={src} alt=""/>
              </button>)}
            </div>
          )}
        </div>

        <div className="mch-detail-info">
          <div className="kicker">{label.toUpperCase()} · {t('machinery.ref')} <b>{machine.ref}</b></div>
          <h1>{machine.name}</h1>
          <p className="mch-detail-summary">{machine.summary}</p>
          <div className="mch-detail-price">
            <small>{t('machinery.indicative')}</small>
            {price.hasOffer
              ? <div className="mch-price-row">
                  <s>{fmt(price.was)}</s>
                  <b>{fmt(price.now)}</b>
                  <span className="mch-save-chip">Save {fmt(price.saving)}</span>
                </div>
              : <b>{fmt(price.now)}</b>}
            {price.hasOffer && <em className="mch-offer-line">{describeOffer(offer)?.note}</em>}
          </div>
          <div className="mch-detail-meta">
            <span><Gauge/> {machine.year} · {usageOf(machine)}</span>
            <span><MapPin/> {machine.location}, {machine.origin}</span>
            <span><PackageCheck/> Sourced to order</span>
          </div>
          <table className="mch-detail-specs">
            <tbody>
              {[[t('machinery.year'), machine.year], [t('machinery.usage'), usageOf(machine)], [t('machinery.location'), `${machine.location}, ${machine.origin}`]]
                .concat(machine.specs)
                .map(([k, v]) => <tr key={k}><th>{k}</th><td>{v}</td></tr>)}
            </tbody>
          </table>
          <ul className="mch-detail-assurance">
            <li><ClipboardCheck/> Supplier vetted before the unit is offered — dealer and factory checks on file</li>
            <li><Camera/> Cold-start video, hour-meter close-up and full walkaround before you pay</li>
            <li><Ship/> Container, flat-rack or breakbulk freight quoted to your port</li>
            <li><Settings2/> Attachments and specifications can be changed to your requirement</li>
          </ul>
          <div className="mch-detail-actions">
            <button className="primary" type="button" onClick={onQuote}>Request a quotation <ArrowRight/></button>
            <button className="mch-chat" type="button" onClick={onChat} aria-label={`Ask about the ${machine.name} on WhatsApp`}><MessageCircle/></button>
          </div>
          <p className="mch-detail-note">
            Photos show the unit offered, not a library shot. The quotation confirms the final price, the specification
            and freight to your port; nothing is payable before you have seen the walkaround video.
          </p>
        </div>
      </div>

      {related.length > 0 && (
        <div className="mch-related">
          <div className="kicker">MORE {machine.type.toUpperCase()}</div>
          <h2>Other {machine.type.toLowerCase()} we can quote</h2>
          <div className="mch-related-grid">
            {related.map(m => {
              const pct = percentFor(offer, 'machine', {ref: m.ref, type: m.type});
              const p = priceWithOffer(listPriceUSD(m), pct);
              return <a key={m.id} className="mch-related-card" href={machineHref(m)}
                onClick={e => {
                  if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  navigate(machineHref(m));
                }}>
                {machineImages(m)[0] && <img loading="lazy" decoding="async" width="420" height="290" src={machineImages(m)[0]} alt={`${m.name} for export — ${m.ref}`}/>}
                <b>{m.name}</b>
                <small>{m.year} · {usageOf(m)} · {m.location}</small>
                {p.hasOffer ? <span className="mch-related-price"><s>{fmt(p.was)}</s> <b>{fmt(p.now)}</b></span> : <span className="mch-related-price"><b>{fmt(p.now)}</b></span>}
              </a>;
            })}
          </div>
        </div>
      )}
    </div>

    {zoom && photos.length > 0 && createPortal(
      <div className="mch-lightbox" role="dialog" aria-modal="true" aria-label={`${machine.name} photograph, photo ${shot + 1} of ${photos.length}`}
        onClick={() => setZoom(false)}
        onKeyDown={e => {
          if (e.key === 'ArrowLeft') { e.stopPropagation(); setShot(s => (s - 1 + photos.length) % photos.length); }
          if (e.key === 'ArrowRight') { e.stopPropagation(); setShot(s => (s + 1) % photos.length); }
        }}>
        <button className="mch-lightbox-x" type="button" onClick={() => setZoom(false)} aria-label="Close the photograph"><X/></button>
        {photos.length > 1 && <>
          <button className="mch-lightbox-prev" type="button" aria-label={`Previous photo (${(shot - 1 + photos.length) % photos.length + 1} of ${photos.length})`}
            onClick={e => { e.stopPropagation(); setShot(s => (s - 1 + photos.length) % photos.length); }}><ArrowLeft/></button>
          <button className="mch-lightbox-next" type="button" aria-label={`Next photo (${(shot + 1) % photos.length + 1} of ${photos.length})`}
            onClick={e => { e.stopPropagation(); setShot(s => (s + 1) % photos.length); }}><ArrowRight/></button>
        </>}
        <img className="mch-lightbox-img" width="1200" height="800" src={photos[shot]} alt={`${machine.name} enlarged — photo ${shot + 1} of ${photos.length}`} onClick={e => e.stopPropagation()}/>
        {photos.length > 1 && <span className="mch-lightbox-counter">{shot + 1} / {photos.length}</span>}
      </div>,
      document.body
    )}
  </section>;
}

function MachineCard({machine, onQuote, onChat, navigate, offer}) {
  const {fmt} = useCurrency();
  const {t} = useLang();
  const label = machine.type.endsWith('s') ? machine.type.slice(0, -1) : machine.type;
  const photos = machineImages(machine);
  const [shot, setShot] = useState(0);
  const percent = percentFor(offer, 'machine', {ref: machine.ref, type: machine.type});
  const price = priceWithOffer(listPriceUSD(machine), percent);
  const href = machineHref(machine);
  const open = () => navigate(href);
  // Leave modified clicks to the browser: Ctrl/Cmd/middle-click opens the
  // machine in a new tab, exactly like a car card. A plain click is ours.
  const openClick = e => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    open();
  };
  return <article className="mch-card">
    <div className="mch-photo">
      {/* A unit we have no photograph of yet says so. Pointing the card at
          another machine's photo would be a lie the buyer discovers at the
          port, so the gap is shown rather than papered over. */}
      {photos.length
        ? <a className="mch-photo-link" href={href} onClick={openClick}
            aria-label={`Open the ${machine.name} page — ${machine.ref}`}>
            <img loading="lazy" decoding="async" width="820" height="560" src={photos[shot]}
              alt={`${machine.name} ${label.toLowerCase()} ${shot ? `photo ${shot + 1} of ${photos.length}` : 'available for export'} — ${machine.ref}`}/>
          </a>
        : <button className="mch-nophoto" type="button" onClick={open}>
            <Camera/>
            <b>Photos on request</b>
            <span>We send photographs and a walkaround video of the unit before any payment.</span>
          </button>}
      <span className="mch-type">{label}</span>
      {price.hasOffer && <span className="mch-offer-flag"><Sparkles size={12}/> {price.percent}% off</span>}
      {/* The strip previews the walkaround here; the card's own page shows the
          same set large. */}
      {photos.length > 1 && <div className="mch-thumbs" role="group" aria-label={`${machine.name} photos`}>
        {photos.map((src, i) => <button key={src} type="button"
          className={i === shot ? 'active' : ''}
          onClick={() => setShot(i)}
          aria-label={`Show photo ${i + 1} of ${photos.length}`}>
          <img loading="lazy" decoding="async" width="120" height="82" src={src} alt=""/>
        </button>)}
      </div>}
      {photos.length > 0 && <button className="mch-expand" type="button" onClick={open}>
        <Images size={13}/> {photos.length} {t('machinery.photos')}
      </button>}
    </div>
    <div className="mch-info">
      <div className="mch-head">
        <b>{machine.name}</b>
        <small><MapPin/> {machine.location}, {machine.origin} · {t('machinery.ref')} {machine.ref}</small>
      </div>
      <p>{machine.summary}</p>
      <div className="mch-meta"><span><Gauge/> {machine.year} · {usageOf(machine)}</span>{machine.specs[0] && <span><Wrench/> {machine.specs[0][0]}: <b>{machine.specs[0][1]}</b></span>}</div>
      <ul className="mch-specs">{machine.specs.slice(1).map(([k, v]) => <li key={k}><small>{k}</small><b>{v}</b></li>)}</ul>
      <div className="mch-foot">
        <div>
          <small>{t('machinery.indicative')}</small>
          {price.hasOffer
            ? <span className="mch-price-row"><s>{fmt(price.was)}</s> <b>{fmt(price.now)}</b></span>
            : <b>{fmt(price.now)}</b>}
        </div>
        <div className="mch-actions">
          <a className="mch-view" href={href} onClick={openClick}>View machine <ArrowRight/></a>
          <button className="mch-chat" type="button" onClick={onChat} aria-label={`Ask about the ${machine.name} on WhatsApp`}><MessageCircle/></button>
        </div>
      </div>
    </div>
  </article>;
}

// Price bands mirror beforward's "Shop By Price" (fob_price_from/to): buyers
// think in bands, not in sliders, and a band is a link a crawler can follow.
const PRICE_BANDS = [
  ['Any', null, null],
  ['Under $30k', null, 30000],
  ['$30k – $50k', 30000, 50000],
  ['$50k – $80k', 50000, 80000],
  ['$80k+', 80000, null]
];

export function MachineryPage({navigate, openAuction, openChat, initialType, machineRef}) {
  const s = useSettings();
  const {t} = useLang();
  const offer = useOffer();
  // /machinery/excavators pre-selects the filter; "all" (plural, lower case)
  // and any unknown slug fall back to the full catalogue.
  const start = MACHINE_TYPES.find(t => t.toLowerCase() === String(initialType || '').toLowerCase()) || 'All';
  const [type, setType] = useState(start);
  // /machinery/<type> can be reached by an in-app link while the page is
  // already mounted (a related card, a footer link, Back). The prop changes —
  // so the filter has to follow it, or the URL says Loaders while the list
  // still shows Excavators.
  useEffect(() => { setType(start); }, [start]);
  // /machinery/excavators/AR7-MC-001 is one machine's own page. An unknown
  // reference is handled below: it says so and offers the desk, never renders
  // a machine that does not exist.
  const onMachinePage = MACHINE_TYPES.some(t => t.toLowerCase() === String(initialType || '').toLowerCase()) && !!machineRef;
  const machine = onMachinePage ? machineByRef(machineRef) : null;
  // Facets, all client-side: the catalogue is small enough to filter in the
  // browser, and a filter that costs a round trip is a filter nobody uses.
  const [make, setMake] = useState('All');
  const [band, setBand] = useState('Any');
  const [yearFrom, setYearFrom] = useState('Any');
  const [sort, setSort] = useState('Featured');
  // Redraw when the CRM's machines land, so the catalogue shows the live list.
  useMachineryVersion();

  const brands = [...new Set(MACHINES.map(m => m.brand))].sort();
  const years = [...new Set(MACHINES.map(m => m.year))].sort((a, b) => b - a);
  const [, lo, hi] = PRICE_BANDS.find(b => b[0] === band) || PRICE_BANDS[0];

  const list = useMemo(() => {
    let out = machinesByType(type);
    if (make !== 'All') out = out.filter(m => m.brand === make);
    if (lo != null) out = out.filter(m => listPriceUSD(m) >= lo);
    if (hi != null) out = out.filter(m => listPriceUSD(m) <= hi);
    if (yearFrom !== 'Any') out = out.filter(m => m.year >= Number(yearFrom));
    const by = {
      'Featured': null,
      'FOB price: low to high': (a, b) => listPriceUSD(a) - listPriceUSD(b),
      'FOB price: high to low': (a, b) => listPriceUSD(b) - listPriceUSD(a),
      'Newest first': (a, b) => b.year - a.year,
      'Lowest hours': (a, b) => (a.hours || 0) - (b.hours || 0)
    }[sort];
    return by ? [...out].sort(by) : out;
  }, [type, make, band, yearFrom, sort, lo, hi]);
  const counts = MACHINE_TYPES.map(t => [t, MACHINES.filter(m => m.type === t).length]);
  const filtersOn = make !== 'All' || band !== 'Any' || yearFrom !== 'Any';
  const typeHref = slug => '/machinery/' + String(slug).toLowerCase();

  if (onMachinePage) {
    if (machine) return <MachineDetailPage machine={machine} navigate={navigate} onQuote={openAuction} onChat={openChat}/>;
    return <section className="inner-page machinery-page mch-detail-page">
      <div className="shell page-content">
        <a className="back-btn" href={typeHref(initialType)}
          onClick={e => {
            if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
            e.preventDefault();
            navigate(typeHref(initialType));
          }}>
          <ArrowLeft size={14}/> Back to {start}
        </a>
        <div className="mch-empty">
          <h1>That machine is not on the site any more.</h1>
          <p>It may have been sold, or the link may be out of date. Tell us the model and we will find another unit
            like it — or browse what we can quote today.</p>
          <button className="primary" type="button" onClick={() => navigate('/machinery')}>Browse machinery <ArrowRight/></button>
          <button className="text-btn" type="button" onClick={openAuction}>Ask for this model</button>
        </div>
      </div>
    </section>;
  }

  return <section className="inner-page machinery-page">
    <div className="page-hero machinery-hero">
      {/* The yard itself, behind a scrim. Decorative, so it is a background on
          a flex item rather than an <img loading="lazy" decoding="async"> a crawler would count as content —
          the hero's job is to show a clean, current machine, not to describe
          one. See MACHINERY-SOURCES.md, "Photo standards". */}
      <div className="machinery-hero-bg" aria-hidden="true"/>
      <div className="shell">
        <div className="kicker">{t('machinery.kicker')}</div>
        {start === 'All'
          /* The headline states the scope of work, not a slogan: sourced to
             order from vetted Chinese suppliers, inspected, quoted to your
             port. "Ready to work" claimed stock we do not hold. */
          ? <h1>Machines sourced from China,<br/><em>quoted to your port.</em></h1>
          : <h1>{start === 'Trucks' ? 'Tipper trucks' : start}<br/><em>for export.</em></h1>}
        <p>{MACHINE_INTRO[start] || MACHINE_INTRO.All}</p>
        <div className="mch-hero-actions">
          <button className="gold-btn" type="button" onClick={openAuction}>Request a quotation <ArrowRight/></button>
          <a className="ghost-btn" href={telHref(s.contact_phone)}>Call the desk</a>
          <a className="ghost-btn" href={waLink(s.whatsapp_number, 'Hello AR7 Traders, I need a quotation for construction machinery.')} target="_blank" rel="noopener noreferrer"><MessageCircle/> WhatsApp</a>
        </div>
        <div className="mch-hero-stats">
          <span><b>Excavators</b> 1.5t – 40t</span>
          <span><b>Loaders</b> wheel &amp; backhoe</span>
          <span><b>Trucks</b> tippers &amp; tractor heads</span>
          <span><b>Cranes</b> truck &amp; rough terrain</span>
        </div>
      </div>
    </div>

    <div className="shell page-content">
      <div className="mch-trust">
        {TRUST.map(([I, title, body]) => <div key={title}><I/><b>{title}</b><span>{body}</span></div>)}
      </div>

      {offer && (
        <div className="mch-offer-bar" role="status">
          <Sparkles size={15}/>
          <span>
            <b>{describeOffer(offer).line}</b>{describeOffer(offer).untilLabel ? ` — ends ${describeOffer(offer).untilLabel}` : ''}
            {' '}<small>Applied to the prices below. Indicative FOB, confirmed with your quotation.</small>
          </span>
        </div>
      )}

      <div className="mch-toolbar">
        <div className="inv-chips" role="tablist" aria-label="Machine type">
          <div>
            {[['All', MACHINES.length], ...counts].map(([t, n]) => <button key={t} type="button" role="tab" aria-selected={type === t} className={type === t ? 'active' : ''} onClick={() => setType(t)}>{t} <i>{n}</i></button>)}
          </div>
        </div>
        <div className="mch-facets">
          <label>
            <span>Make</span>
            <select value={make} onChange={e => setMake(e.target.value)} aria-label="Filter by make">
              <option>All</option>
              {brands.map(b => <option key={b}>{b}</option>)}
            </select>
          </label>
          <label>
            <span>FOB price</span>
            <select value={band} onChange={e => setBand(e.target.value)} aria-label="Filter by FOB price band">
              {PRICE_BANDS.map(([label]) => <option key={label}>{label}</option>)}
            </select>
          </label>
          <label>
            <span>Year from</span>
            <select value={yearFrom} onChange={e => setYearFrom(e.target.value)} aria-label="Filter by model year">
              <option>Any</option>
              {years.map(y => <option key={y}>{y}</option>)}
            </select>
          </label>
          <label>
            <span>Sort</span>
            <select value={sort} onChange={e => setSort(e.target.value)} aria-label="Sort machines">
              {['Featured', 'FOB price: low to high', 'FOB price: high to low', 'Newest first', 'Lowest hours'].map(x => <option key={x}>{x}</option>)}
            </select>
          </label>
          {filtersOn && <button className="mch-clear" type="button" onClick={() => { setMake('All'); setBand('Any'); setYearFrom('Any'); }}>Clear filters</button>}
          <span className="mch-count"><b>{list.length}</b> {list.length === 1 ? 'machine' : 'machines'} match</span>
        </div>
        <p className="mch-note">{MACHINERY_NOTE}</p>
      </div>

      <div className="mch-grid">
        {list.map(m => <MachineCard key={m.id} machine={m} onQuote={openAuction} onChat={openChat} navigate={navigate} offer={offer}/>)}
      </div>
      {list.length === 0 && (
        <div className="mch-empty">
          <b>No machine matches those filters.</b>
          <p>The catalogue is what we can source this month, not everything we can get. Tell us the model and we will find the unit — used stock moves faster than any listing.</p>
          <button className="primary" type="button" onClick={openAuction}>Request a machine</button>
        </div>
      )}

      <div className="mch-band">
        <div>
          <div className="kicker">{t('machinery.cantSee')}</div>
          <h2>{t('machinery.tellUs')}</h2>
          <p>{t('machinery.tellUsBody')}</p>
        </div>
        <div className="mch-band-actions">
          <button className="primary" type="button" onClick={openAuction}>Request a machine <ArrowRight/></button>
          <button className="text-btn" type="button" onClick={() => navigate('contact')}>Contact the export desk</button>
        </div>
      </div>

      {/* The promise that matters most to a buyer who arrived for one machine:
          the catalogue is a sample, not the limit. Kept free of numbers we
          cannot evidence — no "10,000 units", no "5 years of importing" — and
          free of the word stock, because we do not hold these machines. */}
      <section className="mch-any" aria-labelledby="mch-any-title">
        <div className="mch-any-copy">
          <div className="kicker">IF YOU DON'T SEE IT, ASK FOR IT</div>
          <h2 id="mch-any-title">Tell us the machine. We'll find it — anywhere in China.</h2>
          <p>
            The machines on this page are the ones we can present today, not the limit of what we can get.
            Doosan, Sany, XCMG, LiuGong, SDLG, Shacman, Sinotruk, Zoomlion — and the models between them.
            Send us a make and model, a photo of a machine like the one you want, or the job it has to do,
            and our China desk goes to the factories and yards that build or hold it.
          </p>
          <p>
            Every unit is checked before it is offered to you: hours verified against the meter and the service
            record, structure and undercarriage inspected, and a cold-start video with a full walkaround sent
            before you pay anything. If a model only exists in a spec sheet, we will tell you that too.
          </p>
          <ul className="mch-any-list">
            <li><BadgeCheck/> <b>Quality checked before it is quoted</b><span>Inspection photos, hour-meter reading and a walkaround video — on every unit, before payment.</span></li>
            <li><Settings2/> <b>Specified the way you need it</b><span>Attachments, boom and arm lengths, tyres, buckets, guards and paint can be specified for your job and your market.</span></li>
            <li><Sparkles/> <b>Customised to your order</b><span>Tell us the working conditions — quarry, port, farm, mine, road project — and we match the configuration and quote it as one package.</span></li>
            <li><Ship/> <b>Shipped and documented</b><span>Container, flat-rack or breakbulk freight to your port with the export paperwork prepared before loading.</span></li>
            <li><Wrench/> <b>Parts and support after arrival</b><span>Filters, undercarriage and common spares sourced with the machine, plus operator and service manuals.</span></li>
          </ul>
        </div>
        <div className="mch-any-card">
          <h3>Ask for a machine</h3>
          <p>Two lines are enough — the model, or the work it has to do, and the port it ships to.</p>
          <button className="primary" type="button" onClick={openAuction}>Send us the model <ArrowRight/></button>
          <button className="text-btn" type="button" onClick={() => navigate('contact')}>
            <Search size={13}/> Or message the export desk
          </button>
          <div className="mch-any-samples" aria-label="Examples of machines we are asked for">
            <span>Komatsu PC200</span><span>XCMG XE215C</span><span>Sany SY215C</span><span>SDLG LG956</span>
            <span>Zoomlion QY25</span><span>Howo 371 tipper</span><span>Cat 320D2</span><span>Any 1.5t – 40t class</span>
          </div>
          <small className="mch-any-note">
            Sourced to order from vetted Chinese suppliers. We quote what exists and what it costs —
            we never invent availability.
          </small>
        </div>
      </section>

      <div className="mch-ship">
        <h3>How machinery reaches you</h3>
        <div className="mch-ship-grid">
          <div><span>01</span><b>Enquiry &amp; quotation</b><p>You send the model and destination; we reply with the unit, price and freight options.</p></div>
          <div><span>02</span><b>Inspection &amp; video</b><p>We visit the machine, verify hours and take photos and video before any payment.</p></div>
          <div><span>03</span><b>Loading &amp; documents</b><p>Flat-rack, container or breakbulk loading with export documents and loading photos.</p></div>
          <div><span>04</span><b>Arrival &amp; support</b><p>We share arrival documents and help with spare parts and manuals after delivery.</p></div>
        </div>
      </div>

      <MachineryFaq start={start}/>
    </div>
  </section>;
}
