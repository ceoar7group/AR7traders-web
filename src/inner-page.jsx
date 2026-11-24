// Inventory, vehicle detail, and static landing routes (/auction, /shipping,
// /about, /contact) — split from src/main.jsx so the home page never pays
// for inventory filtering, CIF math, lightbox zoom, or inner-route copy & CSS.
import React, {useEffect, useRef, useState, useReducer} from 'react';
import {createPortal} from 'react-dom';
import {
  ArrowLeftRight, ArrowRight, BadgeCheck, CalendarDays, CarFront, Check,
  ChevronLeft, ChevronRight, ClipboardCheck, Clock3, Fuel, Gauge, Gavel,
  Globe2, LayoutGrid, LayoutList, Mail, MapPin, Maximize2, MessageCircle,
  Phone, Play, Search, Send, ShieldCheck, Ship, X, ZoomIn, ZoomOut
} from 'lucide-react';
import './pages.css';
import './extra-pages.css';
import './detail-responsive.css';
import './inner-page.css';
import { WhatsAppIcon } from './brand-icons.jsx';
import { carAlt } from './car-alt.js';
import { useCurrency } from './currency.jsx';
import { useCustomerSession } from './customer-session.jsx';
import { DEST } from './destinations.js';
import { useLang } from './i18n.jsx';
import { hasRetried } from './image-fallback.js';
import { useStockDiscounts } from './offers.js';
import {
  carRef, findCar, hashFor, hrefFor, hrefFromTarget, inventoryHref,
  linkClick, rememberVehicle
} from './routing.js';
import { criteriaIsEmpty, defaultSearchName, describeCriteria } from './saved-search.js';
import { slugify, topVehicleModels } from './sitemap-helpers.js';
import { logoOnError } from './site-header.jsx';
import { telHref, useSettings, waLink } from './site-settings.js';
import { VehicleActions } from './vehicle-actions.jsx';
import {
  BRANDS, FounderStat, InteractiveGlobe, LOGO, PageLink,
  VehicleCard, VehiclePriceDisplay, carDiscountedUSD, cars, galleryFor,
  isContentHydrated, isShowroomCar, lazyRetry, onContentChange, priceOf,
  stockLabel, stockNo, useCarPrice, youtubeId
} from './main.jsx';
import { stockDiscountFor, priceWithOffer } from './offers.js';

const EnquiryForm = lazyRetry(() =>
  import('./enquiry-form.jsx').then(m => ({ default: m.EnquiryForm })), 'enquiry-form');

const kmNum = c => Number(String(c?.km || '').replace(/[^0-9]/g, '')) || 0;
const YEAR_MIN = {'2023+': 2023, '2020+': 2020, '2018+': 2018, '2015+': 2015};
const hasAuctionSheet = c => !!(c && (c.auction_sheet === true || c.auction_sheet === 'true' || (typeof c.auction_sheet === 'string' && c.auction_sheet.trim()) || (typeof c.sheet === 'string' && c.sheet.trim())));

const CIF_DEST_KEY = 'ar7-cif-dest';
const loadCifDest = () => { try { const v = localStorage.getItem(CIF_DEST_KEY) || ''; return DEST.some(x => x[1] === v) ? v : ''; } catch { return ''; } };
const saveCifDest = v => { try { v ? localStorage.setItem(CIF_DEST_KEY, v) : localStorage.removeItem(CIF_DEST_KEY); } catch {} };
const estimateFor = (c, dest, discounts) => {
  const d = DEST.find(x => x[1] === dest) || DEST[0];
  const offer = stockDiscountFor(discounts, 'car', carRef(c));
  const p = priceWithOffer(priceOf(c), offer?.percent || 0).now;
  const freight = Math.round(d[4] + p * 0.016);
  const docs = 350;
  const ins = Math.round(p * 0.016);
  return { d, freight, docs, ins, cif: p + freight + docs + ins, days: (d[2].match(/\d+/) || [19])[0] };
};

const Pager = ({page, total, onGo}) => {
  if (total <= 1) return null;
  const nums = [];
  const push = v => { if (v >= 1 && v <= total && !nums.includes(v)) nums.push(v); };
  push(1); push(total);
  for (let d = -1; d <= 1; d++) push(page + d);
  nums.sort((a, b) => a - b);
  const out = [];
  nums.forEach((v, i) => { if (i && v - nums[i - 1] > 1) out.push('…'); out.push(v); });
  return <nav className="inv-pager" aria-label="Inventory pages">
    <button disabled={page <= 1} onClick={() => onGo(page - 1)} type="button" aria-label="Previous page"><ChevronLeft/></button>
    {out.map((v, i) => v === '…'
      ? <span key={'e' + i} aria-hidden="true">…</span>
      : <button key={v} className={v === page ? 'active' : ''} onClick={() => onGo(v)} type="button" aria-current={v === page ? 'page' : undefined}>{v}</button>)}
    <button disabled={page >= total} onClick={() => onGo(page + 1)} type="button" aria-label="Next page"><ChevronRight/></button>
  </nav>;
};

function InvShowcase({picks, onOpen}) {
  const [idx, setIdx] = useState(0), [paused, setPaused] = useState(false);
  const n = picks.length;
  const dragRef = useRef(null), swipedRef = useRef(false);
  useEffect(() => {
    if (paused || n < 2) return;
    try { if (matchMedia('(prefers-reduced-motion: reduce)').matches) return; } catch {}
    const t = setInterval(() => setIdx(i => (i + 1) % n), 2500);
    return () => clearInterval(t);
  }, [paused, n]);
  if (!n) return null;
  const go = d => setIdx(i => (i + d + n) % n);
  const down = e => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    if (e.target.closest('.inv-stage-arrow,.inv-stage-dots')) return;
    dragRef.current = { x: e.clientX };
    setPaused(true);
  };
  const up = e => {
    const d = dragRef.current; dragRef.current = null;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (Math.abs(dx) > 40) { swipedRef.current = true; go(dx < 0 ? 1 : -1); }
  };
  const clickCapture = e => {
    if (swipedRef.current) { swipedRef.current = false; e.preventDefault(); e.stopPropagation(); }
  };
  return <div className="inv-stage" onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
    onPointerDown={down} onPointerUp={up} onPointerCancel={() => { dragRef.current = null; }} onClickCapture={clickCapture}>
    {picks.map((c, i) => {
      let off = (i - idx + n) % n; if (off > n / 2) off -= n;
      const a = Math.abs(off);
      return <button key={c.id} type="button" className={'inv-slide' + (off === 0 ? ' active' : '')}
        style={{ transform: `translateX(${off * 46}%) scale(${Math.max(1 - a * .16, .5)})`, opacity: a > 1 ? 0 : 1 - a * .25, zIndex: 10 - a, '--slide-dim': a ? Math.min(a * .3, .6) : 0, pointerEvents: a > 1 ? 'none' : 'auto', transition: a > 1 ? 'none' : undefined }}
        onClick={() => off === 0 ? onOpen(c) : setIdx(i)} tabIndex={a > 1 ? -1 : 0}>
        <img src={c.image} alt={carAlt(c)} loading={i < 3 ? 'eager' : 'lazy'} decoding="async" width="520" height="300"/>
        <span className="inv-slide-cap"><b>{c.make} {c.model}</b><small>{c.year} · {c.km} km</small></span>
      </button>;
    })}
    <button type="button" className="inv-stage-arrow prev" aria-label="Previous car" onClick={() => go(-1)}><ChevronLeft/></button>
    <button type="button" className="inv-stage-arrow next" aria-label="Next car" onClick={() => go(1)}><ChevronRight/></button>
    <div className="inv-stage-dots">{picks.map((c, i) => <i key={c.id} className={i === idx ? 'on' : ''} onClick={() => setIdx(i)} role="button" tabIndex={-1} aria-label={'Slide ' + (i + 1)}/>)}</div>
  </div>;
}

function SaveSearchBar({signedIn, session, criteria, matches, navigate, openAuction, fallbackInterest}) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [done, setDone] = useState(false), [err, setErr] = useState('');
  const [name, setName] = useState(''), [emailOn, setEmailOn] = useState(true);
  const empty = criteriaIsEmpty(criteria);
  async function save() {
    setBusy(true); setErr('');
    try {
      const r = await fetch('/api/my-account?searches=1', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + session.access_token },
        body: JSON.stringify({ name: name.trim(), criteria, email_alerts: emailOn })
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Could not save this search');
      setDone(true); setOpen(false);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  }
  return <div className="stock-alert-wrap">
    <div className="stock-alert-bar" role="region" aria-label="Stock alerts">
      <div className="stock-alert-copy"><b>Be first on new stock.</b><span>{done
        ? 'Saved — we will e-mail you the moment new matching stock lands in Japan.'
        : signedIn ? 'Save this search as a stock alert — we\u2019ll e-mail you the moment matching vehicles land in Japan.'
        : 'Tell us the car you\u2019re hunting — we\u2019ll alert you when matching vehicles land in Japan.'}</span></div>
      {done
        ? <a className="primary" href="/account" onClick={linkClick('account', navigate)}>Manage my alerts <ArrowRight/></a>
        : signedIn
        ? <button className="primary" type="button" aria-expanded={open} onClick={() => setOpen(v => !v)}>{open ? 'Close' : 'Save this search'} <ArrowRight/></button>
        : <div className="stock-alert-cta">
            <a className="primary" href="/account" onClick={linkClick('account', navigate)}>Sign in for e-mail alerts <ArrowRight/></a>
            <button className="outline-btn" type="button" onClick={() => openAuction({ kind: 'contact', vehicle_interest: fallbackInterest, message: 'Please alert me when matching stock arrives in Japan.' })}>Or message us</button>
          </div>}
    </div>
    {open && !done && <div className="save-search-panel">
      <div className="save-search-chips">{describeCriteria(criteria).map(c => <span key={c}>{c}</span>)}<em>{matches} matching now</em></div>
      {empty
        ? <p className="save-search-hint">Pick at least one filter above — a make, budget, year or mileage — so we know exactly what to watch for you.</p>
        : <>
            <div className="save-search-row">
              <label>ALERT NAME<input value={name} onChange={e => setName(e.target.value)} placeholder={defaultSearchName(criteria)} maxLength={60}/></label>
              <label className="save-search-check"><input type="checkbox" checked={emailOn} onChange={e => setEmailOn(e.target.checked)}/> E-mail me when new matching stock arrives</label>
            </div>
            {err && <p className="save-search-err">{err}</p>}
            <div className="save-search-actions">
              <button className="primary" disabled={busy} onClick={save} type="button">{busy ? 'Saving…' : 'Save alert'} <Check/></button>
              <button className="outline-btn" type="button" onClick={() => setOpen(false)}>Cancel</button>
            </div>
          </>}
    </div>}
  </div>;
}

function BuyerGuide({car, navigate}) {
  const sheet = hasAuctionSheet(car);
  const steps = [
    ['01', 'Enquire & confirm availability', 'Share your destination port and preferred currency. Our Japan desk confirms this vehicle is available and prepares a written quotation.'],
    ['02', 'Review condition records', sheet ? 'This listing includes a Japanese auction inspection sheet — we translate the grade, panel marks and inspector notes into plain English before you commit.' : 'Condition for this vehicle is reviewed from its photographs and dealer or export-yard inspection notes — ask our Japan team for the full condition summary before you commit.'],
    ['03', 'Receive your proforma invoice & pay', 'Your invoice itemizes the vehicle price, export preparation, ocean freight and marine insurance, settled by bank transfer (T/T) in USD or JPY.'],
    ['04', 'Export de-registration & vessel loading', 'We complete Japanese de-registration (Export Certificate), arrange any mandatory pre-shipment inspection for your market, and book RoRo or container space.'],
    ['05', 'Documents by courier & port clearance', 'Original Bill of Lading, Export Certificate and commercial invoice are sent by courier ahead of arrival so your local clearing agent can release the vehicle at port.']
  ];
  return <section className="buyer-guide" aria-label="How buying this vehicle works">
    <div className="buyer-guide-head">
      <div className="kicker">HOW BUYING THIS VEHICLE WORKS</div>
      <h2>From enquiry in Japan to clearance at your port.</h2>
      <p>Five clear stages from reservation to port release, with itemized paperwork at every step.</p>
    </div>
    <ol className="buyer-guide-steps">
      {steps.map(([num, title, desc]) => <li key={num} className="buyer-guide-step"><span>{num}</span><div><b>{title}</b><p>{desc}</p></div></li>)}
    </ol>
    <div className="buyer-guide-notes">
      <article className="buyer-guide-card">
        <div className="kicker">FOB VS CIF EXPLAINED</div>
        <h3>What the CIF estimate covers</h3>
        <p><b>FOB (Free on Board)</b> is the vehicle price in Japan. <b>CIF (Cost, Insurance &amp; Freight)</b> adds estimated sea freight to your destination port, export documentation and 1.6% marine transit insurance. The CIF box above is a planning estimate — our export desk issues a firm written quote for your sailing.</p>
      </article>
      <article className="buyer-guide-card">
        <div className="kicker">CONDITION TRANSPARENCY</div>
        <h3>{sheet ? 'Translated auction inspection sheet' : 'Inspection photos & condition records'}</h3>
        <p>{sheet ? 'Because this vehicle carries a Japanese auction sheet, our team provides an English translation of the inspector’s grade, panel diagram and handwritten notes alongside yard photos.' : 'Not every vehicle in Japan comes from an auction lane — dealer and showroom cars are documented through multi-angle photographs, chassis verification and export-yard inspection notes.'}</p>
      </article>
      <article className="buyer-guide-card">
        <div className="kicker">DESTINATION CUSTOMS</div>
        <h3>Import duty &amp; local clearance</h3>
        <p>Import duty, local taxes and registration fees are your own customs authority’s decision at the destination port and are never bundled into a Japan CIF invoice. Your licensed clearing agent calculates the exact payable duty against the original documents we courier to you.</p>
      </article>
    </div>
    <div className="buyer-guide-links">
      <PageLink className="outline-btn" to="howbuy" navigate={navigate}>Full step-by-step buying guide <ArrowRight/></PageLink>
      <PageLink className="outline-btn" to="shipping" navigate={navigate}>RoRo &amp; container shipping <ArrowRight/></PageLink>
      <PageLink className="outline-btn" to="faq" navigate={navigate}>Read the import FAQ <ArrowRight/></PageLink>
    </div>
  </section>;
}

const INVENTORY_SCROLL_KEY = 'ar7-inventory-scroll';

function VehicleLightbox({selected, detailImage, detailGallery, zoomLevel, setZoomLevel, setZoomOpen, stepGallery}) {
  const isZoomed = zoomLevel > 1;
  const idx = detailGallery.indexOf(detailImage) + 1;
  return createPortal(<div className="gallery-lightbox" role="dialog" aria-modal="true" aria-label={`${selected.make} ${selected.model} image viewer`} onClick={() => setZoomOpen(false)}>
    <div className="lightbox-stage" onClick={e => e.stopPropagation()}>
      <div className="lightbox-topbar">
        <span className="lightbox-title"><b>{selected.make} {selected.model}</b><small>{detailGallery.length > 1 ? `${idx} / ${detailGallery.length}` : ''}</small></span>
        <button className="lightbox-close" onClick={() => setZoomOpen(false)} aria-label="Close enlarged image" title="Close (Esc)" type="button"><X/></button>
      </div>
      <div className="lightbox-img-wrap">
        <img role="button" tabIndex={0} aria-label="Toggle zoom on this photo" onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setZoomLevel(z => z > 1 ? 1 : 2); } }} className={'lightbox-image ' + (isZoomed ? 'is-zoomed' : '')} width="620" height="400" src={detailImage} alt={`${selected.make} ${selected.model} enlarged`} style={{ transform: `scale(${zoomLevel})` }} onClick={e => { e.stopPropagation(); setZoomLevel(v => v > 1 ? 1 : 1.5); }} loading="lazy" decoding="async"/>
      </div>
      <div className="lightbox-bottom">
        <div className="lightbox-nav" role="group" aria-label="Image navigation">
          <button className="lightbox-arrow prev" onClick={() => stepGallery(-1)} disabled={detailGallery.length <= 1} aria-label="Previous image" title="Previous" type="button"><ChevronLeft/><span>Prev</span></button>
          <span className="lightbox-count">{detailGallery.length > 1 ? `${idx} / ${detailGallery.length}` : ''}</span>
          <button className="lightbox-arrow next" onClick={() => stepGallery(1)} disabled={detailGallery.length <= 1} aria-label="Next image" title="Next" type="button"><span>Next</span><ChevronRight/></button>
        </div>
        <div className="zoom-controls" role="group" aria-label="Image zoom controls">
          <button className="zoom-btn" onClick={() => setZoomLevel(v => Math.max(1, v - .25))} disabled={zoomLevel <= 1} aria-label="Zoom out" title="Zoom out" type="button"><ZoomOut/><span>Out</span></button>
          <button className="zoom-level" onClick={() => setZoomLevel(1)} disabled={zoomLevel === 1} aria-label="Reset zoom" title="Reset zoom" type="button"><strong>{Math.round(zoomLevel * 100)}%</strong><small>Reset</small></button>
          <button className="zoom-btn" onClick={() => setZoomLevel(v => Math.min(3.5, v + .25))} disabled={zoomLevel >= 3.5} aria-label="Zoom in" title="Zoom in" type="button"><ZoomIn/><span>In</span></button>
        </div>
      </div>
    </div>
  </div>, document.body);
}

function RecentlyViewed({onOpen}) {
  const [refs] = useState(() => { try { return JSON.parse(localStorage.getItem('ar7-recent-views') || '[]'); } catch { return []; } });
  const items = refs.map(r => findCar(cars, r)).filter(Boolean).slice(0, 6);
  if (items.length < 2) return null;
  return <div className="recent-strip" aria-label="Recently viewed vehicles">
    <span className="recent-strip-label"><Clock3/> Recently viewed</span>
    <div className="recent-strip-row">{items.map(c => <button key={c.id} type="button" onClick={() => onOpen(c)} title={`${c.year} ${c.make} ${c.model}`}>
      <img src={c.image} alt={carAlt(c)} width="72" height="48" loading="lazy" decoding="async"/>
      <span><b>{c.make} {c.model}</b><small>{c.year} · {c.price}</small></span>
    </button>)}</div>
  </div>;
}

function VideoWalkaround({car}) {
  const [playing, setPlaying] = useState(false);
  const id = youtubeId(car.video);
  if (!car.video) return null;
  if (!id) return <a className="video-walk-link" href={car.video} target="_blank" rel="noopener noreferrer"><Play/> Watch the video walkaround</a>;
  const label = `${car.year ? car.year + ' ' : ''}${car.make} ${car.model} video walkaround`;
  return <div className="video-walk">
    {playing
      ? <iframe src={`https://www.youtube-nocookie.com/embed/${id}?autoplay=1&rel=0`} title={label}
          allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen/>
      : <button onClick={() => setPlaying(true)} aria-label={`Play the ${label}`} type="button">
          <img loading="lazy" decoding="async" width="480" height="360" src={`https://i.ytimg.com/vi/${id}/hqdefault.jpg`} alt={label}/>
          <span className="video-walk-play"><Play/></span>
          <span className="video-walk-tag">VIDEO WALKAROUND</span>
        </button>}
  </div>;
}

function TrackShipment() {
  const [no, setNo] = useState('');
  const [state, setState] = useState({ phase: 'idle' });
  async function go(e) {
    e.preventDefault();
    const v = no.trim();
    if (!v) return;
    setState({ phase: 'loading' });
    try {
      const r = await fetch('/api/my-account?track=' + encodeURIComponent(v));
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error || 'Lookup failed — please try again');
      setState({ phase: 'done', sh: j.shipment });
    } catch (err) { setState({ phase: 'error', msg: err.message }); }
  }
  const sh = state.sh;
  const STEPS = [['booking', 'Booked'], ['loaded', 'Loaded'], ['at_sea', 'At sea'], ['arrived', 'Arrived']];
  const idx = sh ? Math.max(0, STEPS.findIndex(([k]) => k === sh.status)) : 0;
  return <div className="track-box">
    <div className="track-box-head"><Ship/><div><h3>Track your shipment</h3>
      <p>Enter the AR7 tracking number from your invoice — no sign-in needed.</p></div></div>
    <form onSubmit={go}>
      <input value={no} onChange={e => setNo(e.target.value)} placeholder="e.g. AR7-260184"
        aria-label="Tracking number" autoComplete="off"/>
      <button className="primary" disabled={state.phase === 'loading'} type="submit">
        {state.phase === 'loading' ? 'Searching…' : 'Track'}</button>
    </form>
    {state.phase === 'error' && <p className="track-box-error">{state.msg}</p>}
    {sh && <div className="track-box-result">
      <header><b>{sh.tracking_no}</b><em>{(sh.status || '').replaceAll('_', ' ').toUpperCase()}</em></header>
      <p>{sh.vehicle}{sh.origin ? ` · ${sh.origin} → ${sh.destination || 'destination port'}` : ''}</p>
      <div className="track-box-steps">{STEPS.map(([k, label], i) =>
        <span key={k} className={i <= idx ? 'done' : ''}><i/>{label}</span>)}</div>
      <small>
        {sh.eta ? `ETA ${new Intl.DateTimeFormat('en-GB', { day: '2-digit', month: 'short', year: 'numeric' }).format(new Date(sh.eta))}` : 'ETA to be confirmed'}
        {sh.vessel && <> · aboard <a href={'https://www.vesselfinder.com/vessels?name=' + encodeURIComponent(sh.vessel)} target="_blank" rel="noopener noreferrer">{sh.vessel} ↗</a> (live position)</>}
      </small>
    </div>}
  </div>;
}

function readStoredFilters() {
  try {
    const raw = sessionStorage.getItem('ar7-inv-filters');
    if (raw) {
      sessionStorage.removeItem('ar7-inv-filters');
      sessionStorage.removeItem('ar7-inv-q');
      const f = JSON.parse(raw);
      return f && typeof f === 'object' ? f : null;
    }
  } catch {}
  return null;
}

function mapPriceBand(minUsd, maxUsd) {
  if (maxUsd != null && minUsd == null && maxUsd <= 10000) return 'Under $10k';
  if (minUsd != null && maxUsd == null && minUsd >= 60000) return '$60k+';
  if (minUsd === 10000 && maxUsd === 20000) return '$10k – $20k';
  if (minUsd === 20000 && maxUsd === 35000) return '$20k – $35k';
  if (minUsd === 35000 && maxUsd === 60000) return '$35k – $60k';
  return null;
}

export function InnerPage({page, navigate, openAuction, openChat, favs, setFavs, vehicleId, initialMake, initialModel}) {
  const settings = useSettings();
  const discounts = useStockDiscounts();
  const price = useCarPrice(discounts);
  const {fmt} = useCurrency();
  const {t} = useLang();
  const cust = useCustomerSession();
  const signedIn = !!cust.session;
  const [, contentTick] = useReducer(x => x + 1, 0);
  useEffect(() => onContentChange(() => contentTick()), []);

  const [initialBundle] = useState(readStoredFilters);
  const [query, setQuery] = useState(() => {
    try {
      const u = new URLSearchParams(window.location.search).get('q');
      if (u && u.trim()) return u.trim().slice(0, 80);
      if (initialBundle && typeof initialBundle.q === 'string') return initialBundle.q;
      const v = sessionStorage.getItem('ar7-inv-q') || '';
      if (v) sessionStorage.removeItem('ar7-inv-q');
      return v;
    } catch { return ''; }
  });
  const [body, setBody] = useState(() => {
    try {
      if (initialBundle?.body) return initialBundle.body;
      const v = sessionStorage.getItem('ar7-inv-body') || 'All';
      if (v !== 'All') sessionStorage.removeItem('ar7-inv-body');
      return v;
    } catch { return 'All'; }
  });
  const [make, setMake] = useState(() => {
    try {
      const v = sessionStorage.getItem('ar7-inv-make');
      if (v) { sessionStorage.removeItem('ar7-inv-make'); return initialMake || v; }
      return initialMake || 'All';
    } catch { return initialMake || 'All'; }
  });
  const [fuel, setFuel] = useState(() => initialBundle?.fuel || 'All');
  const [priceF, setPriceF] = useState(() => {
    try {
      const mapped = initialBundle ? mapPriceBand(initialBundle.minUsd, initialBundle.maxUsd) : null;
      if (mapped) return mapped;
      const v = sessionStorage.getItem('ar7-inv-price') || 'Any';
      if (v !== 'Any') sessionStorage.removeItem('ar7-inv-price');
      return v;
    } catch { return 'Any'; }
  });
  const [yearF, setYearF] = useState(() => {
    const y = initialBundle?.minYear;
    if (y && YEAR_MIN[y + '+']) return y + '+';
    return 'Any';
  });
  const [kmF, setKmF] = useState('Any');
  const [sortF, setSortF] = useState('Featured');
  const [modelF, setModelF] = useState(() => {
    try {
      const v = sessionStorage.getItem('ar7-inv-model');
      if (v) { sessionStorage.removeItem('ar7-inv-model'); return v; }
      return 'All';
    } catch { return 'All'; }
  });
  const [trF, setTrF] = useState(() => initialBundle?.tr || 'All');
  const [steerF, setSteerF] = useState(() => initialBundle?.steer || 'All');
  const [extraF, setExtraF] = useState(() => ({
    minYear: initialBundle?.minYear && !YEAR_MIN[initialBundle.minYear + '+'] ? initialBundle.minYear : null,
    maxUsd: initialBundle?.maxUsd && !mapPriceBand(initialBundle.minUsd, initialBundle.maxUsd) ? initialBundle.maxUsd : null,
    minUsd: initialBundle?.minUsd && !mapPriceBand(initialBundle.minUsd, initialBundle.maxUsd) ? initialBundle.minUsd : null,
    drive: initialBundle?.drive || null
  }));
  const [galleryImage, setGalleryImage] = useState(null);
  const [zoomOpen, setZoomOpen] = useState(false);
  const [zoomLevel, setZoomLevel] = useState(1);
  const [destSel, setDestSel] = useState(() => loadCifDest() || DEST[0][1]);
  const [cifDest, setCifDest] = useState(loadCifDest);
  const [comp, setComp] = useState([]);
  const [showCmp, setShowCmp] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pageNo, setPageNo] = useState(1);
  const [showroomLimit, setShowroomLimit] = useState(6);
  const [perPage, setPerPage] = useState(() => { try { const v = Number(localStorage.getItem('ar7-inv-pp')); return [25, 50, 100].includes(v) ? v : 25; } catch { return 25; } });
  const [invView, setInvView] = useState(() => { try { return localStorage.getItem('ar7-inv-view') === 'list' ? 'list' : 'grid'; } catch { return 'grid'; } });

  useEffect(() => {
    const onApply = e => {
      const d = e?.detail;
      if (!d || typeof d !== 'object') return;
      try { sessionStorage.removeItem('ar7-inv-filters'); sessionStorage.removeItem('ar7-inv-q'); } catch {}
      setQuery(typeof d.q === 'string' ? d.q : '');
      setBody(d.body || 'All');
      setFuel(d.fuel || 'All');
      setMake('All');
      setModelF('All');
      setKmF('Any');
      setTrF(d.tr || 'All');
      setSteerF(d.steer || 'All');
      const mapped = mapPriceBand(d.minUsd, d.maxUsd);
      setPriceF(mapped || 'Any');
      const hasPresetYear = d.minYear && YEAR_MIN[d.minYear + '+'];
      setYearF(hasPresetYear ? d.minYear + '+' : 'Any');
      setExtraF({
        minYear: d.minYear && !hasPresetYear ? d.minYear : null,
        maxUsd: d.maxUsd && !mapped ? d.maxUsd : null,
        minUsd: d.minUsd && !mapped ? d.minUsd : null,
        drive: d.drive || null
      });
      setPageNo(1);
    };
    window.addEventListener('ar7-inv-apply', onApply);
    return () => window.removeEventListener('ar7-inv-apply', onApply);
  }, []);

  useEffect(() => { setPageNo(1); setShowroomLimit(6); }, [query, body, make, fuel, priceF, yearF, kmF, sortF, modelF, trF, steerF, extraF, initialModel]);
  useEffect(() => { if (!vehicleId) setMake(initialMake || 'All'); }, [initialMake, vehicleId]);

  const selected = page === 'inventory' && vehicleId ? findCar(cars, vehicleId) : null;
  useEffect(() => {
    if (!selected) return;
    try {
      const ref = carRef(selected);
      const prev = JSON.parse(localStorage.getItem('ar7-recent-views') || '[]');
      localStorage.setItem('ar7-recent-views', JSON.stringify([ref, ...prev.filter(r => r !== ref)].slice(0, 8)));
    } catch {}
  }, [selected]);

  const detailGallery = selected ? galleryFor(selected) : [];
  const detailImage = galleryImage || detailGallery[0];
  useEffect(() => { setGalleryImage(null); setZoomOpen(false); setZoomLevel(1); }, [vehicleId]);

  const openVehicle = car => {
    try { sessionStorage.setItem(INVENTORY_SCROLL_KEY, String(window.scrollY || window.pageYOffset || 0)); } catch {}
    navigate(`inventory?car=${carRef(car)}`, { scroll: false });
  };
  const backTarget = make && make !== 'All' ? inventoryHref(make) : 'inventory';
  const backToInventory = () => {
    let saved = 0;
    try { saved = Number(sessionStorage.getItem(INVENTORY_SCROLL_KEY) || 0); sessionStorage.removeItem(INVENTORY_SCROLL_KEY); } catch { saved = 0; }
    rememberVehicle(null);
    navigate(backTarget, { scroll: false });
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo(0, saved)));
  };
  const copyVehicleLink = async () => {
    const url = location.origin + hrefFor('inventory', carRef(selected)) + hashFor('inventory', carRef(selected));
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 1800); }
    catch { setCopied(false); }
  };

  useEffect(() => {
    if (!selected) return;
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
    window.scrollTo(0, 0);
  }, [selected]);

  const stepGalleryRef = useRef(null);
  useEffect(() => {
    if (!zoomOpen) return;
    const clampZoom = v => Math.round(v * 100) / 100;
    const onKey = e => {
      if (e.key === 'Escape') setZoomOpen(false);
      else if (e.key === 'ArrowLeft') { e.preventDefault(); if (stepGalleryRef.current) stepGalleryRef.current(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); if (stepGalleryRef.current) stepGalleryRef.current(1); }
      else if (e.key === '+' || e.key === '=') { e.preventDefault(); setZoomLevel(v => Math.min(2.5, clampZoom(v + .25))); }
      else if (e.key === '-' || e.key === '_') { e.preventDefault(); setZoomLevel(v => Math.max(1, clampZoom(v - .25))); }
      else if (e.key === '0') { e.preventDefault(); setZoomLevel(1); }
    };
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    window.addEventListener('keydown', onKey);
    return () => { document.body.style.overflow = previous; window.removeEventListener('keydown', onKey); };
  }, [zoomOpen]);

  useEffect(() => {
    if (!selected || zoomOpen) return;
    const onKey = e => {
      const el = e.target;
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey ||
          /^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(el?.tagName || '') || el?.isContentEditable) return;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        if (detailGallery.length < 2) return;
        e.preventDefault(); stepGalleryRef.current?.(e.key === 'ArrowLeft' ? -1 : 1);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [selected, zoomOpen, detailGallery.length]);

  const stepGallery = dir => {
    if (detailGallery.length < 2) return;
    const at = Math.max(0, detailGallery.indexOf(detailImage));
    setGalleryImage(detailGallery[(at + dir + detailGallery.length) % detailGallery.length]);
  };
  stepGalleryRef.current = stepGallery;

  if (page === 'inventory' && vehicleId && !selected) return <section className="inner-page detail-page"><div className="shell"><a className="back-btn" href={hrefFromTarget(backTarget)} onClick={linkClick(backTarget, backToInventory)}>← Back to inventory</a><div className="empty-state vehicle-missing">{isContentHydrated() ? <><Search/><h3>This vehicle is no longer listed</h3><p>It may have sold or the link is out of date. Browse current Japan stock instead.</p><PageLink className="primary" to={backTarget} navigate={backToInventory}>View inventory <ArrowRight/></PageLink></> : <><CarFront/><h3>Loading vehicle…</h3><p>Fetching the latest stock so we can open this car.</p></>}</div></div></section>;

  const selectedIndex = selected ? cars.findIndex(c => carRef(c) === carRef(selected)) : -1;
  const prevVehicle = selectedIndex > 0 ? cars[selectedIndex-1] : null;
  const nextVehicle = selectedIndex >= 0 && selectedIndex < cars.length-1 ? cars[selectedIndex+1] : null;
  const visitAdjacent = car => navigate(`inventory?car=${carRef(car)}`, {scroll:false});

  if (selected) return <section className="inner-page detail-page"><div className="shell"><a className="back-btn" href={hrefFromTarget(backTarget)} onClick={linkClick(backTarget, backToInventory)}>← Back to inventory</a><nav className="detail-vehicle-nav" aria-label="Browse vehicles in inventory"><button type="button" disabled={!prevVehicle} onClick={() => visitAdjacent(prevVehicle)}><ChevronLeft/> Previous vehicle</button><span>{selectedIndex+1} of {cars.length} in all inventory</span><button type="button" disabled={!nextVehicle} onClick={() => visitAdjacent(nextVehicle)}>Next vehicle <ChevronRight/></button></nav><div className="detail-grid"><div className="detail-gallery"><div className="detail-main-image"><img decoding="async" fetchPriority="high" width="620" height="400" src={detailImage} onError={e => { if (hasRetried(e.currentTarget)) return; if (detailImage !== selected.image) setGalleryImage(selected.image); }} alt={`${selected.make} ${selected.model} showroom view`} onClick={() => { setZoomLevel(1); setZoomOpen(true); }} loading="eager"/></div><div className="detail-gallery-toolbar">{detailGallery.length > 1 && <><button className="gallery-arrow prev" onClick={() => stepGallery(-1)} aria-label="Previous vehicle image" type="button"><ChevronLeft/></button><span className="gallery-count">{detailGallery.indexOf(detailImage) + 1} / {detailGallery.length}</span><button className="gallery-arrow next" onClick={() => stepGallery(1)} aria-label="Next vehicle image" type="button"><ChevronRight/></button></>}<button className="gallery-expand" onClick={() => { setZoomLevel(1); setZoomOpen(true); }} aria-label="Enlarge vehicle image" type="button"><Maximize2/> Enlarge</button></div><div className="detail-thumbs">{detailGallery.map((img, i) => <button className={detailImage === img ? 'active' : ''} onClick={() => setGalleryImage(img)} key={img + i} type="button"><img loading="lazy" decoding="async" width="164" height="110" src={img} onError={e => { if (hasRetried(e.currentTarget) || e.currentTarget.dataset.f) return; e.currentTarget.dataset.f = 1; e.currentTarget.src = selected.image; }} alt={`${selected.make} ${selected.model} photo ${i + 1}`}/><small>{i === 0 ? 'Main' : 'View ' + (i + 1)}</small></button>)}</div><VideoWalkaround car={selected}/>{hasAuctionSheet(selected) && <span className="sheet-tag"><ClipboardCheck/> Auction sheet included</span>}{zoomOpen && <VehicleLightbox selected={selected} detailImage={detailImage} detailGallery={detailGallery} zoomLevel={zoomLevel} setZoomLevel={setZoomLevel} setZoomOpen={setZoomOpen} stepGallery={stepGallery}/>}</div><div className="detail-info"><div className="kicker">VERIFIED JAPAN STOCK · <b style={{ color: 'var(--gold)' }}>{stockNo(selected)}</b></div><h1>{selected.make}<br/><em>{selected.model}</em></h1><div className="detail-price"><small>EXPORT PRICE (FOB)</small><VehiclePriceDisplay car={selected} discounts={discounts}/></div><div className="detail-specs"><span><CalendarDays/><b>{selected.year}</b><small>Year</small></span><span><Gauge/><b>{selected.km} km</b><small>Mileage</small></span><span><Fuel/><b>{selected.fuel}</b><small>Fuel</small></span><span><ArrowLeftRight/><b>{selected.tr}</b><small>Transmission</small></span>{selected.grade ? <span><BadgeCheck/><b>{selected.grade}</b><small>Grade</small></span> : <span><BadgeCheck/><b>{selected.drv || '2WD'}</b><small>Drive</small></span>}<span><Ship/><b>{selected.st}</b><small>Steering</small></span></div><div className="spec-table"><h4>Full specifications</h4>{[['Body type', selected.body], ['Engine', selected.eng], ['Transmission', selected.tr], ['Drive', selected.drv], ['Doors', selected.doors], ['Seats', selected.seats], ['Chassis no.', selected.chassis], ['Colour', selected.col], ['Interior', selected.int], ['Fuel', selected.fuel], ['Steering', selected.st], ['Auction venue', selected.ven], ['Location', selected.location + ', Japan'], ['Available', selected.arr], ['Stock no.', stockNo(selected)], ['Status', selected.status]].filter(x => x[1] != null && x[1] !== '').map(x => <span key={x[0]}><small>{x[0]}</small><b>{x[1]}</b></span>)}</div>{(selected.feats || []).length > 0 && <div className="feat-box"><h4>Equipment & features</h4><div className="feat-chips">{(selected.feats || []).map(f => <span key={f}><Check/> {f}</span>)}</div></div>}<div className="cif-box"><div className="kicker">INDICATIVE CIF ESTIMATE</div><select value={destSel} onChange={e => { setDestSel(e.target.value); saveCifDest(e.target.value); }}>{DEST.map(x => <option key={x[1]}>{x[1]}</option>)}</select>{(() => { const e = estimateFor(selected, destSel, discounts); return <div className="cif-rows"><span><small>FREIGHT (RoRo)</small><b>{fmt(e.freight)}</b></span><span><small>DOCS</small><b>{fmt(e.docs)}</b></span><span><small>INSURANCE 1.6%</small><b>{fmt(e.ins)}</b></span><span className="total"><small>CIF · ETA ±{e.days} DAYS</small><b>{fmt(e.cif)}</b></span></div>; })()}</div><div className="brand-brandlogo"><img loading="lazy" decoding="async" width="120" height="46" src={LOGO(selected.make)} alt={selected.make + ' logo'} onError={logoOnError}/><span>{selected.make} · sourced in Japan</span></div><VehicleActions car={selected} stockRef={stockNo(selected)} settings={settings} saved={favs.includes(selected.id)} copied={copied} onOffer={() => openAuction({ kind: 'vehicle-offer', vehicle_interest: `${selected.year} ${selected.make} ${selected.model} (${stockNo(selected)})`, stock_ref: stockNo(selected) })} onEnquire={() => openAuction({ kind: 'vehicle', vehicle_interest: `${selected.year} ${selected.make} ${selected.model} (${stockNo(selected)})`, stock_ref: stockNo(selected) })} onChat={openChat} onToggleSave={() => setFavs(v => v.includes(selected.id) ? v.filter(x => x !== selected.id) : [...v, selected.id])} onCopy={copyVehicleLink}/><div className="sheet-box"><ClipboardCheck/><div>{hasAuctionSheet(selected) ? <><b>Auction sheet verified</b><p>Original inspection report translated by our Japan team — grades, marks and repair history in plain English.</p></> : <><b>Condition &amp; documentation</b><p>Ask our Japan team for this vehicle&rsquo;s condition report and documentation before you commit.</p></>}</div></div></div></div><BuyerGuide car={selected} navigate={navigate}/>{(() => { const related = cars.filter(c => c && c.published !== false && carRef(c) !== carRef(selected) && (c.make === selected.make || c.body === selected.body)).sort((a, b) => Number(b.make === selected.make) - Number(a.make === selected.make)).slice(0, 3); return related.length ? <section className="related-stock" aria-label="Related vehicles"><div className="kicker">SIMILAR STOCK</div><h2>More vehicles to explore</h2><p className="related-stock-note">Other published vehicles from the same make or body type, currently listed in Japan.</p><div className="related-stock-grid">{related.map(c => <PageLink key={carRef(c)} className="related-stock-card" to={'/inventory/' + carRef(c)} navigate={navigate}><img loading="lazy" decoding="async" width="820" height="550" src={c.image || '/assets/ar7-mark-460.webp'} alt={carAlt(c)}/><b>{[c.year, c.make, c.model].filter(Boolean).join(' ')}</b><small>{carRef(c)}{c.status ? ' · ' + c.status : ''}</small></PageLink>)}</div><PageLink className="outline-btn" to={inventoryHref(selected.make)} navigate={navigate}>Browse all {selected.make} stock <ArrowRight/></PageLink></section> : null; })()}</div></section>;

  const makes = [...new Set(cars.map(c => c.make))].sort();
  const facetPool = cars.filter(c => make === 'All' || c.make === make);
  const facetCount = (field, value) => facetPool.filter(c => c[field] === value).length;
  const modelsForMake = [...new Set(facetPool.map(c => c.model))].sort();
  const transmissions = [...new Set(cars.map(c => c.tr).filter(Boolean))].sort();
  const steerings = [...new Set(cars.map(c => c.st).filter(Boolean))].sort();
  const PRICE_BANDS = [
    ['Any', null, null],
    ['Under $10k', null, 10000],
    ['$10k – $20k', 10000, 20000],
    ['$20k – $35k', 20000, 35000],
    ['$35k – $60k', 35000, 60000],
    ['$60k+', 60000, null]
  ];
  const KM_BANDS = [['Any', null], ['Under 30,000 km', 30000], ['Under 60,000 km', 60000], ['Under 100,000 km', 100000], ['Under 150,000 km', 150000]];
  const priceBand = PRICE_BANDS.find(b => b[0] === priceF) || PRICE_BANDS[0];
  const kmBand = KM_BANDS.find(b => b[0] === kmF) || KM_BANDS[0];
  const facetActive = [
    body !== 'All' && body,
    make !== 'All' && make,
    modelF !== 'All' && modelF,
    fuel !== 'All' && fuel,
    priceF !== 'Any' && priceF,
    yearF !== 'Any' && 'From ' + yearF,
    kmF !== 'Any' && kmF,
    trF !== 'All' && trF,
    steerF !== 'All' && steerF + ' hand drive',
    extraF.drive && extraF.drive,
    extraF.minYear && 'From ' + extraF.minYear,
    extraF.maxUsd && 'Under $' + extraF.maxUsd.toLocaleString('en-US'),
    extraF.minUsd && 'Over $' + extraF.minUsd.toLocaleString('en-US')
  ].filter(Boolean);
  const fuelOptions = [...new Set(cars.map(c => c.fuel).filter(Boolean))];
  const countBy = (field, value) => cars.filter(c => c[field] === value).length;

  const facets = [
    { k: 'Make', v: make, set: v => { setMake(v); setModelF('All'); navigate(inventoryHref(v), { scroll: false, replace: true }); }, o: [['All', 'All makes (' + cars.length + ')'], ...makes.map(m => [m, m + ' (' + countBy('make', m) + ')'])] },
    { k: 'Model', v: modelF, set: setModelF, dis: modelsForMake.length < 2, o: [['All', make === 'All' ? 'Any model' : 'All ' + make + ' models'], ...modelsForMake.map(md => [md, md + ' (' + facetCount('model', md) + ')'])] },
    { k: 'Body', v: ['Showroom', 'Japan Stock'].includes(body) ? 'All' : body, set: setBody, o: [['All', 'Any body'], ...['SUV', 'MPV', 'Sedan', 'Hatchback', 'Kei', 'Van', 'Luxury', 'Supercar', 'Hypercar'].filter(b => cars.some(c => c.body === b)).map(b => [b, b + ' (' + countBy('body', b) + ')'])] },
    { k: 'Price', v: priceF, set: setPriceF, o: PRICE_BANDS.map(([l]) => [l, l]) },
    { k: 'Year from', v: yearF, set: setYearF, o: [['Any', 'Any year'], ...Object.keys(YEAR_MIN).map(y => [y, y])] },
    { k: 'Mileage', v: kmF, set: setKmF, o: KM_BANDS.map(([l]) => [l, l]) },
    { k: 'Fuel', v: fuel, set: setFuel, o: [['All', 'Any fuel'], ...fuelOptions.map(f => [f, f + ' (' + countBy('fuel', f) + ')'])] },
    { k: 'Gearbox', v: trF, set: setTrF, o: [['All', 'Any gearbox'], ...transmissions.map(t2 => [t2, t2 + ' (' + countBy('tr', t2) + ')'])] },
    { k: 'Steering', v: steerF, set: setSteerF, o: [['All', 'Any steering'], ...steerings.map(t2 => [t2, t2 + ' hand (' + countBy('st', t2) + ')'])] },
    { k: 'Sort', v: sortF, set: setSortF, o: [['Featured', 'Featured'], ['Price: low to high', 'Price: low to high'], ['Price: high to low', 'Price: high to low'], ['Mileage: low to high', 'Mileage: low to high'], ['Mileage: high to low', 'Mileage: high to low'], ['Year: newest first', 'Year: newest first'], ['Year: oldest first', 'Year: oldest first']] }
  ];

  const clearFacets = () => {
    setBody('All');
    setMake('All');
    setModelF('All');
    setFuel('All');
    setPriceF('Any');
    setYearF('Any');
    setKmF('Any');
    setTrF('All');
    setSteerF('All');
    setExtraF({ minYear: null, maxUsd: null, minUsd: null, drive: null });
    setQuery('');
    if (initialMake && initialMake !== 'All') navigate('inventory', { scroll: false, replace: true });
  };

  const isShowroom = isShowroomCar;
  const list = cars.filter(c =>
    (c.make + ' ' + c.model + ' ' + c.location + ' ' + (c.stock_no || '') + ' ' + c.year).toLowerCase().includes(query.toLowerCase()) &&
    (body === 'All' || (body === 'Showroom' && isShowroom(c)) || (body === 'Japan Stock' && !isShowroom(c)) || c.body === body) &&
    (make === 'All' || c.make === make) &&
    (!initialModel || slugify(c.model) === slugify(initialModel) || slugify(c.model).startsWith(slugify(initialModel) + '-')) &&
    (modelF === 'All' || c.model === modelF) &&
    (fuel === 'All' || c.fuel === fuel) &&
    (trF === 'All' || c.tr === trF) &&
    (steerF === 'All' || c.st === steerF) &&
    (!extraF.drive || c.drv === extraF.drive) &&
    (priceBand[1] == null || carDiscountedUSD(c, discounts) >= priceBand[1]) &&
    (priceBand[2] == null || carDiscountedUSD(c, discounts) < priceBand[2]) &&
    (extraF.minUsd == null || carDiscountedUSD(c, discounts) >= extraF.minUsd) &&
    (extraF.maxUsd == null || carDiscountedUSD(c, discounts) <= extraF.maxUsd) &&
    (yearF === 'Any' || Number(c.year) >= YEAR_MIN[yearF]) &&
    (extraF.minYear == null || Number(c.year) >= extraF.minYear) &&
    (kmBand[1] == null || kmNum(c) <= kmBand[1])
  ).sort((a, b) => {
    const p = x => carDiscountedUSD(x, discounts);
    switch (sortF) {
      case 'Price: low to high': return p(a) - p(b);
      case 'Price: high to low': return p(b) - p(a);
      case 'Mileage: low to high': return kmNum(a) - kmNum(b);
      case 'Mileage: high to low': return kmNum(b) - kmNum(a);
      case 'Year: newest first':
      case 'Newest first': return b.year - a.year;
      case 'Year: oldest first': return a.year - b.year;
      default: {
        const as = isShowroom(a), bs = isShowroom(b);
        if (as !== bs) return as ? -1 : 1;
        return as ? a.id - b.id : b.id - a.id;
      }
    }
  });

  const showroomList = list.filter(isShowroom), japanList = list.filter(c => !isShowroom(c));
  const groupedView = body === 'All' && sortF === 'Featured';
  const pagedSource = groupedView ? japanList : list;
  const totalPages = Math.max(1, Math.ceil(pagedSource.length / perPage)), pageSafe = Math.min(pageNo, totalPages);
  const pageItems = pagedSource.slice((pageSafe - 1) * perPage, pageSafe * perPage);
  const pageShowroom = groupedView ? (pageSafe === 1 ? showroomList.slice(0, showroomLimit) : []) : pageItems.filter(isShowroom);
  const pageJapan = groupedView ? pageItems : pageItems.filter(c => !isShowroom(c));
  const goPage = v => { setPageNo(v); try { document.querySelector('.results-line').scrollIntoView({ behavior: 'smooth', block: 'start' }); } catch {} };
  const setPp = v => { setPerPage(v); setPageNo(1); try { localStorage.setItem('ar7-inv-pp', String(v)); } catch {} };
  const setView = v => { setInvView(v); try { localStorage.setItem('ar7-inv-view', v); } catch {} };
  const gridCls = 'car-grid full-grid' + (invView === 'list' ? ' list-view' : '');
  const cardsFor = items => items.map(c => <VehicleCard key={c.id} c={c} cifDest={cifDest} cif={cifDest ? estimateFor(c, cifDest, discounts) : null} onOpen={openVehicle} comp={comp.includes(c.id)} onCmp={x => { setComp(v => v.includes(x.id) ? v.filter(y => y !== x.id) : (v.length >= 3 ? v : v.concat(x.id))); }} onOffer={x => openAuction({ kind: 'contact', vehicle_interest: [x.year, x.make, x.model].filter(Boolean).join(' ') + ' (ref ' + carRef(x) + ')', message: 'I would like to make an offer on the ' + [x.year, x.make, x.model].filter(Boolean).join(' ') + ' (ref ' + carRef(x) + '). My offer is: ' })} discounts={discounts}/>);

  const landingMake = (initialMake && initialMake !== 'All') ? initialMake : null;
  const landingModel = (landingMake && initialModel) ? initialModel.replace(/\b\w/g, c => c.toUpperCase()) : null;

  if (page === 'inventory') return <section className="inner-page"><div className="page-hero mini inv-hero"><div className="shell inv-hero-grid"><div className="inv-hero-copy"><div className="kicker">{landingMake ? t('inv.kickerLanding') : t('inv.kicker')}</div><h1>{landingMake ? <>{landingMake}{landingModel ? ' ' + landingModel : ''}<br/><em>{t('inv.h1Landing')}</em></> : <>{t('inv.h1a')} <em>{t('inv.h1b')}</em></>}</h1><p>{landingMake ? `${list.length} ${landingModel || landingMake} ${list.length === 1 ? t('inv.vehicle') : t('inv.vehicles')} ${t('inv.landingNote')}` : `${list.length} ${t('inv.stockNote')}`}</p></div><InvShowcase picks={cars.filter(isShowroom).filter(c => c.image).slice(0, 8)} onOpen={openVehicle}/></div><div className="shell inv-brand-pulse" role="group" aria-label="Live stock by brand"><span className="inv-brand-label"><Gauge/>LIVE STOCK<em>BY BRAND</em></span><div className="inv-brand-chips"><button type="button" className={make === 'All' ? 'on' : ''} onClick={() => { setMake('All'); navigate('inventory', {scroll:false, replace:true}); }}><span>All brands</span><b>{cars.length}</b></button>{BRANDS().slice(0, 9).map(b => <button key={b.name} type="button" className={make === b.name ? 'on' : ''} onClick={() => { const next = make === b.name ? 'All' : b.name; setMake(next); navigate(inventoryHref(next), {scroll:false, replace:true}); }} title={'Show ' + b.name + ' stock'}><img loading="lazy" decoding="async" width="30" height="18" src={LOGO(b.name)} alt={b.name + ' logo'} onError={logoOnError}/><span>{b.name}</span><b>{b.count}</b></button>)}</div></div></div><div className="shell page-content"><RecentlyViewed onOpen={openVehicle}/><div className="inv-toolbar inv-toolbar-facets" role="search">
    <label className="inv-search"><Search/><input value={query} onChange={e => setQuery(e.target.value)} placeholder={t('inv.searchPlaceholder')} aria-label={t('inv.searchPlaceholder')}/></label>
    <div className="inv-facets">{facets.map(f => <label className="facet" key={f.k}><span>{f.k}</span><select value={f.v} onChange={e => f.set(e.target.value)} aria-label={f.k + ' filter'} disabled={f.dis}>{f.o.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select></label>)}</div>
    <div className="inv-facet-foot">
      <span className="facet-count"><b>{list.length}</b> {t('inv.matchCount', { total: cars.length })}</span>
      <label className="cif-dest-pick"><Ship/><span>CIF estimate to</span><select value={cifDest} onChange={e => { setCifDest(e.target.value); saveCifDest(e.target.value); if (e.target.value) setDestSel(e.target.value); }} aria-label="Show an indicative CIF estimate to a destination port on every vehicle card"><option value="">Off — FOB prices only</option>{DEST.map(x => <option key={x[1]} value={x[1]}>{x[0]} — {x[1].split(' / ')[0]}</option>)}</select></label>
      {facetActive.length > 0 && <div className="facet-active">{facetActive.map(f => <span key={f}>{f}</span>)}<button type="button" onClick={clearFacets}>{t('inv.clearAll')}</button></div>}
    </div>
  </div>
  {make !== 'All' && <div className="brand-context-card" aria-label={`${make} inventory context`}><img className="brand-context-logo" loading="lazy" decoding="async" width="88" height="54" src={LOGO(make)} alt={make + ' logo'} onError={logoOnError}/><div className="brand-context-copy"><div className="kicker">BROWSE {make.toUpperCase()} STOCK</div><h2>{make} vehicles from Japan</h2><p className="brand-context-count"><b>{list.length}</b> matching {make} {list.length === 1 ? 'vehicle' : 'vehicles'} currently listed.</p><p>We source {make} vehicles through Japanese auction and dealer/showroom listings. Auction-sourced vehicles may include translated auction sheets; dealer and showroom vehicles are described with the available yard inspection notes and photographs.</p><div className="brand-context-links"><PageLink className="outline-btn" to="inventory" navigate={navigate}>{t('inv.allInventory')} <ArrowRight/></PageLink><PageLink className="outline-btn" to="brands" navigate={navigate}>Explore brands <ArrowRight/></PageLink><PageLink className="outline-btn" to="howbuy" navigate={navigate}>How buying works <ArrowRight/></PageLink></div></div></div>}{landingMake && <nav className="landing-links" aria-label={'More ' + landingMake + ' export pages'}>{topVehicleModels(cars.filter(c => slugify(c.make) === slugify(landingMake)), 16).map(m => <PageLink key={m} to={inventoryHref(landingMake, m)} navigate={navigate}>{landingMake} {m}</PageLink>)}<PageLink to="inventory" navigate={navigate}>{t('inv.allInventory')}</PageLink></nav>}<div className="inv-chips"><div>{['All', 'Showroom', 'Japan Stock', 'Luxury', 'Supercar', 'Hypercar', 'SUV', 'MPV', 'Sedan', 'Hatchback', 'Kei', 'Van'].map(x => { const n = x === 'All' ? cars.length : (x === 'Showroom' ? cars.filter(isShowroom).length : (x === 'Japan Stock' ? cars.filter(c => !isShowroom(c)).length : cars.filter(c => c.body === x).length)); return <button key={x} onClick={() => setBody(x)} className={body === x ? 'active' : ''} type="button">{x} <i>{n}</i></button>; })}</div>{comp.length > 0 && <button className="cmp-open" onClick={() => setShowCmp(true)} type="button"><ArrowLeftRight/> Compare {comp.length}<small onClick={e => { e.stopPropagation(); setComp([]); setShowCmp(false); }}>{t('inv.compareClear')}</small></button>}</div><div className="results-line"><b>{list.length} {t('inv.vehicles')}</b><span>{t('inv.resultsNote', { showroom: showroomList.length, japan: japanList.length })}</span><label className="pp-select">Show <select value={perPage} onChange={e => setPp(Number(e.target.value))} aria-label="Vehicles per page">{[25, 50, 100].map(v => <option key={v} value={v}>{v}</option>)}</select> per page{totalPages > 1 && <em> · page {pageSafe} of {totalPages}</em>}</label><div className="view-toggle" role="group" aria-label="Layout"><button type="button" aria-pressed={invView === 'grid'} aria-label={t('inv.viewGrid')} title={t('inv.viewGrid')} onClick={() => setView('grid')}><LayoutGrid/></button><button type="button" aria-pressed={invView === 'list'} aria-label={t('inv.viewList')} title={t('inv.viewList')} onClick={() => setView('list')}><LayoutList/></button></div></div>{body === 'All' && sortF === 'Featured' ? <div className="inventory-groups">{pageShowroom.length > 0 && <section className="inventory-group showroom-group"><div className="inventory-group-head"><div><span>AR7 CURATED COLLECTION</span><h2>Showroom cars</h2></div><b>{showroomList.length} vehicles</b></div><div className={gridCls}>{cardsFor(pageShowroom)}</div>{showroomList.length > 6 && <div className="showroom-more"><button type="button" className="outline-btn" onClick={() => setShowroomLimit(v => v < showroomList.length ? Math.min(v + 6, showroomList.length) : 6)}>{showroomLimit < showroomList.length ? `View more showroom cars (${showroomList.length - pageShowroom.length} remaining)` : 'Show fewer showroom cars'}</button></div>}</section>}{pageJapan.length > 0 && <section className="inventory-group japan-group"><div className="inventory-group-head"><div><span>VERIFIED AUCTION & STOCK</span><h2>Japan inventory</h2></div><b>{japanList.length} vehicles</b></div><div className={gridCls}>{cardsFor(pageJapan)}</div></section>}</div> : <div className={gridCls}>{cardsFor(pageItems)}</div>}<Pager page={pageSafe} total={totalPages} onGo={goPage}/><SaveSearchBar signedIn={signedIn} session={cust.session} navigate={navigate} openAuction={openAuction} matches={list.length}
    criteria={{ q: query.trim() || null, make: make === 'All' ? null : make, model: modelF === 'All' ? null : modelF, body: ['All', 'Showroom', 'Japan Stock'].includes(body) ? null : body, fuel: fuel === 'All' ? null : fuel, tr: trF === 'All' ? null : trF, steer: steerF === 'All' ? null : steerF, price_min: priceBand[1] ?? extraF.minUsd, price_max: priceBand[2] ?? extraF.maxUsd, year_min: YEAR_MIN[yearF] || extraF.minYear || null, km_max: kmBand[1] }}
    fallbackInterest={(make !== 'All' || query.trim()) ? [make !== 'All' ? make : '', query.trim()].filter(Boolean).join(' ') + ' — stock alert' : 'Stock alerts signup'}/>{list.length === 0 && <div className="empty-state"><Search/><h3>{t('inv.noMatches')}</h3><p>{t('inv.noMatchesBody')}</p><button className="primary" onClick={openAuction} type="button">{t('inv.requestSearch')} <ArrowRight/></button></div>}</div>{comp.length > 0 && !showCmp && createPortal(<div className="cmp-tray" role="region" aria-label="Vehicle comparison tray"><span className="cmp-tray-cars">{comp.map(id => { const c = cars.find(x => x.id === id); return c ? <img key={id} src={c.image} alt={c.make + ' ' + c.model} width="54" height="36" loading="lazy" decoding="async"/> : null; })}</span><b>{comp.length} selected</b><button className="cmp-tray-open" onClick={() => setShowCmp(true)} type="button"><ArrowLeftRight/> Compare</button><button className="cmp-tray-clear" onClick={() => setComp([])} type="button" aria-label="Clear comparison"><X/></button></div>, document.body)}{showCmp && createPortal(<div className="cmp-backdrop" onClick={() => setShowCmp(false)}><div className="cmp-modal" onClick={e => e.stopPropagation()}><div className="cmp-head"><div><div className="kicker">COMPARE</div><h2>{comp.length} vehicles side by side</h2></div><button onClick={() => setShowCmp(false)} type="button"><X/></button></div><table><thead><tr><th></th>{comp.map(id => { const c = cars.find(x => x.id === id); return <th key={id}><img loading="lazy" decoding="async" width="820" height="550" src={c.image} alt={carAlt(c)}/><b>{c.make} {c.model}</b><button onClick={() => setComp(v => v.filter(y => y !== id))} type="button">Remove</button></th>; })}</tr></thead><tbody>{[['Price', price], ['Year', c => c.year], ['Mileage', c => c.km + ' km'], ['Fuel', c => c.fuel], ['Body', c => c.body], ['Transmission', c => c.tr], ['Drive', c => c.drv], ['Engine', c => c.eng], ['Seats', c => c.seats], ['Grade', c => c.grade], ['Steering', c => c.st], ['Status', c => c.status]].map(r => <tr key={r[0]}><th>{r[0]}</th>{comp.map(id => { const c = cars.find(x => x.id === id); return <td key={id}>{c ? r[1](c) : '—'}</td>; })}</tr>)}</tbody></table><div className="cmp-cta"><button className="primary" onClick={openAuction} type="button">Request quote for best match <ArrowRight/></button></div></div></div>, document.body)}</section>;

  const pages = {
    auction: { tag: t('page.auctionKicker'), title: <>{t('page.auctionH1a')}<br/><em>{t('page.auctionH1em')}</em></>, desc: t('page.auctionBody'), image: '/assets/japanese-car-auction-inspection-shipping-3.webp' },
    shipping: { tag: t('page.shippingKicker'), title: <>{t('page.shippingH1a')}<br/>{t('page.shippingH1b')} <em>{t('page.shippingH1em')}</em></>, desc: t('page.shippingBody'), image: '/assets/japanese-car-auction-inspection-shipping-1.webp' },
    about: { tag: t('page.aboutKicker'), title: <>{t('page.aboutH1a')}<br/>{t('page.aboutH1b')} <em>{t('page.aboutH1em')}</em></>, desc: t('page.aboutBody'), image: '/assets/japan-vehicle-export-port-aerial-1.jpg' },
    contact: { tag: t('page.contactKicker'), title: <>{t('page.contactH1a')}<br/><em>{t('page.contactH1em')}</em></>, desc: t('page.contactBody'), image: '/assets/japanese-car-auction-inspection-shipping-2.webp' }
  };
  const p = pages[page] || pages.about;
  const heroScene =
    page === 'auction' ? <div className="hero-scene hs-auction" aria-hidden="true"><span className="hs-sweep"/><span className="hs-chip hs-a1"><Gavel/> LIVE BID · ¥2,410,000</span><span className="hs-chip hs-a2">+¥30,000</span><span className="hs-chip hs-a3"><ClipboardCheck/> SHEET TRANSLATED · GRADE 4.5</span></div> :
    page === 'shipping' ? <div className="hero-scene hs-shipping" aria-hidden="true"><svg className="hs-route" viewBox="0 0 440 150" fill="none" preserveAspectRatio="none" aria-hidden="true" focusable="false"><path className="hs-route-line" d="M12 118 C 120 30, 300 150, 428 46"/></svg><span className="hs-ship"><Ship/></span><span className="hs-chip hs-s1">JAPAN · PORT OF YOKOHAMA</span><span className="hs-chip hs-s2">RoRo · DOCS · TRACKING</span></div> :
    page === 'about' ? <div className="hero-scene hs-about" aria-hidden="true"><span className="hs-ring hs-r1"/><span className="hs-ring hs-r2"/><span className="hs-chip hs-b1"><Globe2/> JAPAN <ArrowRight/> WORLDWIDE</span><span className="hs-chip hs-b2"><ShieldCheck/> VERIFIED EXPORT PARTNER</span></div> :
    page === 'contact' ? <div className="hero-scene hs-contact" aria-hidden="true"><span className="hs-pulse"><Phone/></span><span className="hs-chip hs-c1"><MessageCircle/> WHATSAPP · EMAIL · CALL</span><span className="hs-chip hs-c2"><Send/> JAPAN EXPORT DESK</span></div> : null;

  return <section className="inner-page"><div className={'page-hero split hero-' + page}><div className="shell"><div className="page-hero-copy"><div className="kicker">{p.tag}</div><h1>{p.title}</h1><p>{p.desc}</p>{page === 'contact' ? <a className="gold-btn" href="#contact-enquiry">{t('page.sendEnquiry')} <ArrowRight/></a> : <button className="gold-btn" onClick={() => openAuction({ kind: page === 'auction' ? 'auction' : 'contact' })} type="button">{t('page.getStarted')} <ArrowRight/></button>}</div><div className="page-hero-image"><img loading="lazy" decoding="async" width="820" height="550" src={p.image} alt={p.title || p.name || 'AR7 Traders vehicle export'}/>{heroScene}<div className="hero-orb in-page"><InteractiveGlobe lite cls="mini" onTap={() => navigate('world')}/></div><div className="corner-mark"><img width="128" height="79" src="/assets/ar7-mark-128.webp" srcSet="/assets/ar7-mark-128.webp 128w, /assets/ar7-mark-256.webp 256w" sizes="84px" alt="AR7 Traders" loading="lazy" decoding="async"/></div></div></div></div>
    <div className="shell page-content">{page === 'auction' ? <><div className="feature-intro"><h2>Auction access without the guesswork.</h2><p>Every listing comes with translation support, market guidance and complete cost visibility before you bid.</p></div><div className="feature-cards">{[['01', 'Browse live listings', 'Filter by make, year, mileage, grade and auction venue.'], ['02', 'Review with an expert', 'We translate the auction sheet and flag every detail.'], ['03', 'Set your bid limit', 'Know your landed estimate before bidding begins.'], ['04', 'Win & track', 'See results instantly and follow your car to port.']].map(x => <article key={x[1]}><span>{x[0]}</span><Gavel/><h3>{x[1]}</h3><p>{x[2]}</p></article>)}</div><div className="auction-demo"><div><span className="live-dot"/> AUCTION LOTS · SAMPLE</div>{cars.slice(0, 4).map(c => <section key={c.id}><img loading="lazy" decoding="async" width="820" height="550" src={c.image} alt={carAlt(c)}/><b>{c.make} {c.model}</b><small>{stockLabel(c)}{c.grade ? ' · Grade ' + c.grade : ''}</small><strong>{price(c)}</strong><PageLink className="lot-link" to={`inventory?car=${carRef(c)}`} navigate={navigate}>View vehicle</PageLink></section>)}</div></> :
      page === 'shipping' ? <><div className="feature-intro"><h2>One clear route. Complete support.</h2><p>From export certificate to customs-ready documents, our logistics desk handles the complexity.</p></div><div className="shipping-flow">{[['Japan yard', 'Inspection & preparation'], ['Export port', 'Customs & loading'], ['At sea', 'Live milestone tracking'], ['Your port', 'Documents & collection']].map((x, i) => <div key={x[0]}><span>0{i + 1}</span><Ship/><b>{x[0]}</b><small>{x[1]}</small></div>)}</div><TrackShipment/></> :
      page === 'about' ? <><div className="feature-intro"><h2>{t('about.h2')}</h2><p>{t('about.body')}</p></div><div className="story-grid"><img loading="lazy" decoding="async" width="480" height="480" src="/assets/ar7-emblem-480.webp" alt="AR7 Traders — global vehicle exporters emblem"/><div><FounderStat variant="about"/><p>{t('about.story')}</p></div></div></> :
      <div className="contact-grid"><div><h2>Let’s source your car.</h2><p>Contact our Japan export desk directly, or use the form to send one enquiry straight to our team.</p><a href={'mailto:' + settings.contact_email}><Mail/> {settings.contact_email}</a><a href={telHref(settings.contact_phone)}><Phone/> {settings.contact_phone}</a><a className="wa-link" href={waLink(settings.whatsapp_number, settings.whatsapp_message)} target="_blank" rel="noopener noreferrer"><WhatsAppIcon size={17}/> WhatsApp us</a><a href="/contact" onClick={linkClick('contact', navigate)}><MapPin/> {settings.contact_address}</a></div><React.Suspense fallback={<div className="enquiry-loading" role="status">Loading contact form…</div>}><EnquiryForm kind="contact"/></React.Suspense></div>}</div></section>;
}
