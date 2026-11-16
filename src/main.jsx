import React, {useEffect, useLayoutEffect, useRef, useState, useReducer} from 'react';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, Search, SlidersHorizontal, Heart, Gauge, CalendarDays, Fuel, Ship, Gavel, BadgeCheck, ClipboardCheck, MapPin, ChevronDown, ChevronLeft, ChevronRight, Check, Mail, Phone, Camera, MessageCircle, Send, ArrowRight, Globe2, LockKeyhole, Play, Clock3, Monitor, CarFront, LogIn, Plane, ArrowLeftRight, ShieldCheck, FileCheck, BadgePercent, Newspaper, Wrench, Sparkles} from 'lucide-react';
import './styles.css';
import './motion-account.css';
import './landing-v2.css';
import './expanded.css';
import './landing-anim.css';
// The globe is the single heaviest thing on the public site and it is never
// above the fold — the hero has its own lightweight visual and the header has
// the world-time ribbon. Loading network.jsx on demand keeps it out of the
// first paint. `Flag` moved to src/flag.jsx precisely so this module could go.
// Every deploy renames the hashed chunk files. A tab that loaded the site
// BEFORE a deploy then fails its dynamic import the first time the visitor
// opens a lazy feature — the enquiry dialog, the machinery page — and the
// click looks simply dead (the owner reported exactly that on the machinery
// "Request a quotation" button, hours after three production deploys). One
// reload fetches the fresh HTML with the new chunk names; the sessionStorage
// latch stops a genuinely broken network from looping the reload forever,
// and a successful load clears the latch for the next deploy.
export const lazyRetry = (load, name) => React.lazy(() => {
  const key = 'ar7-chunk-reload-' + name;
  return load().then(m => {
    try { sessionStorage.removeItem(key); } catch { /* storage may be off */ }
    return m;
  }).catch(err => {
    let latched = false;
    try {
      latched = sessionStorage.getItem(key) === '1';
      if (!latched) sessionStorage.setItem(key, '1');
    } catch { /* storage may be off */ }
    if (!latched && typeof window !== 'undefined') {
      window.location.reload();
      return new Promise(() => {}); // the reload is the resolution
    }
    throw err;
  });
});

const InnerPage = lazyRetry(() =>
  import('./inner-page.jsx').then(m => ({ default: m.InnerPage })), 'inner-page');

const Globe = lazyRetry(() =>
  import('./network.jsx').then(m => ({ default: m.WorldPage })), 'world');
const BigGlobe = lazyRetry(() =>
  import('./network.jsx').then(m => ({ default: m.BigNetworkGlobe })), 'globe');
// The CRM is only reached from the /crm route, so load it on demand
// instead of shipping it to every visitor.
const CrmApp = lazyRetry(() => import('./crm.jsx'), 'crm');
// Free browser-to-browser voice call room (/call/<room>) — shared by link
// from the Call Desk, never in the nav, noindex. Lazy: only call participants
// pay for the chunk.
const WebCallPage = lazyRetry(() => import('./webcall.jsx'), 'webcall');
// 2026-11-13 Lighthouse: the chat panel is interaction-only UI — nobody needs
// it during first paint, so its code leaves the boot bundle and mounts on the
// first idle moment (or instantly when something calls openChat first).
const ChatWidgetLazy = lazyRetry(() =>
  import('./ChatWidget.jsx').then(m => ({ default: m.ChatWidget })), 'chat');
// The customer account area is only reached from /account.
const CustomerAccount = lazyRetry(() =>
  import('./customer-portal.jsx').then(m => ({ default: m.CustomerAccountPage })), 'account');
// The /reviews showcase and its 12 buyer stories are only reached from /reviews.
export const ReviewsShowcase = lazyRetry(() => import('./reviews.jsx'), 'reviews');
// Legal pages (/privacy, /cookies, /terms) — policy text stays out of the
// first-load bundle.
const LegalPage = lazyRetry(() => import('./legal.jsx'), 'legal');
// The ⌘K global search overlay loads the first time it opens.
const GlobalSearch = lazyRetry(() => import('./global-search.jsx'), 'search');
// The machinery desk is its own page (and its own CSS chunk), reached from
// /machinery, the Inventory menu and the home teaser.
const MachineryPage = lazyRetry(() => import('./machinery.jsx').then(m => ({ default: m.MachineryPage })), 'machinery');
// The quick-quote wizard (and its CSS) loads only when the visitor scrolls
// near it on the home page — see DeferredQuickQuote.
const QuickQuote = lazyRetry(() => import('./quick-quote.jsx'), 'quickquote');
// Static-content pages (brands, how-to-buy, tools, news/guides, services,
// reviews, FAQ, the portal demo and the responsive studio) — one lazy chunk,
// so the news catalogue and the calculators stay out of the first load.
const ExtraPage = lazyRetry(() => import('./pages-static.jsx').then(m => ({ default: m.ExtraPage })), 'pages-static');
const ExtraPages2 = lazyRetry(() => import('./pages-static.jsx').then(m => ({ default: m.ExtraPages2 })), 'pages-static');
const DeviceStudio = lazyRetry(() => import('./pages-static.jsx').then(m => ({ default: m.DeviceStudio })), 'pages-static');
const EnquiryForm = lazyRetry(() => import('./enquiry-form.jsx').then(m => ({ default: m.EnquiryForm })), 'enquiry-form');
const EnquiryDialog = lazyRetry(() => import('./enquiry-form.jsx').then(m => ({ default: m.EnquiryDialog })), 'enquiry-dialog');
// 2026-10-08: the six market pages are a route-level screen like the machinery
// desk, so their markup stays out of the first-load bundle — a visitor on the
// home page never downloads a page about Mombasa.
const DestinationPage = lazyRetry(() => import('./destination-page.jsx').then(m => ({ default: m.DestinationPage })), 'destination');
import { WhatsAppButton, useCustomerSession } from './customer-session.jsx';
import { Flag } from './flag.jsx';
import { WhatsAppIcon } from './brand-icons.jsx';
import { referralCodeFrom } from './lead-validation.js';
import { englishCarFields } from './jp-display.js';
import { useSettings, telHref, waLink, FALLBACK } from './site-settings.js';
import { useSeo } from './seo.js';
import { DEST, destinationBySlug } from './destinations.js';
import { NEWS, setPublishedNews, subscribePublishedNews } from './news-data.js';
export { DEST, NEWS };
import { CurrencyProvider, useCurrency } from './currency.jsx';
import { LanguageProvider, useLang } from './i18n.jsx';
import { PromoBar } from './promo-bar.jsx';
import { SiteHeader, logoOnError } from './site-header.jsx';
import { parseRoute, parseNavTarget, hrefFor, hrefFromTarget, linkClick, findCar, carRef, writeLocation, inventoryHref, isReload, rememberVehicle } from './routing.js';
import { carAlt } from './car-alt.js';
import { slugify } from './sitemap-helpers.js';
import {showroomSrcSet, SHOWROOM_CARD_SIZES, SHOWROOM_HERO_SIZES} from './showroom-images.js';
import {observeVisibleCarousel} from './visible-carousel.js';
import { mapDealerRows, isImportedCar } from './japan-stock-map.js';
import { fetchDealerStock } from './dealer-feed.js';
import { MACHINES, MACHINE_TYPES, listPriceUSD, machineImages, machineByRef, machineHref, hydrateMachines, machineYearText, machineHours, machineLoc, machineBrandLockup } from './machinery-data.js';
import { useMachineryVersion } from './machinery-hydrate.jsx';
import { useStockDiscounts, stockDiscountFor, priceWithOffer } from './offers.js';
// A car uploaded before the 2026-10 WebP pass stores a `.jpg` photo path that
// no longer exists on disk. vercel.json rewrites those URLs and this retries
// them in the app; see src/image-fallback.js for the three layers.
import { installImageFallback } from './image-fallback.js';
installImageFallback();
import './currency.css';
import './currency-responsive.css';
import './performance.css';
// Loaded last: the single owner of the header bar and the hero-visual stacking
// that depends on the bar's height, at every width. See the file header.
import './site-layout.css';
import './i18n.css';

// ---------------------------------------------------------------------------
// Owner-directed experience claim (figure revised 1,200+ → 900+ on 2026-09-29;
// wording revised 2026-09-29 to owner-directed "cars sold, dozens of satisfied
// customers including car businesses" — see CLAIMS-POLICY.md §1). The figure
// counts vehicles the founder sold across his automotive career through
// various suppliers. The small-print qualifier line was removed from the site
// at the owner's direction on 2026-09-29. Never widen this into "buyers",
// "exports by AR7" or a rating beyond the owner-approved text.
//   unit   — shown bold beside the figure ("900+ cars sold")
//   detail — the supporting line; **phrases** are highlighted (presentation only)
// ---------------------------------------------------------------------------
export const FOUNDER_CLAIM = {
  figure: '900+',
  unit: 'cars sold',
  detail: 'Dozens of **satisfied customers**, including **car businesses**.'
};

// Founder stat, used in the home hero, the "Japan to everywhere" section and
// the About page. The first time the block scrolls into view the figure counts
// up from 0, the gold rule and label slide in, and when the count lands the
// gold "+" pops in with a glow and a one-off glint across the digits.
// Server render, no-JS and reduced-motion visitors get the finished figure
// straight away. The real figure is always in the DOM as visually hidden text
// (screen readers, crawlers); the rolling digits are aria-hidden. `delay`
// (ms from mount) lets the hero wait for its own entrance animation — it only
// applies when the block is already on screen at load.
const COUNT_MS=2000;
const countEase=t=>t>=1?1:1-Math.pow(2,-10*t); // easeOutExpo: quick rush, soft landing
export function FounderStat({variant,delay=0}){
 const {figure,unit,detail}=FOUNDER_CLAIM;
 const target=Number(figure.replace(/[^\d.]/g,''))||0;
 const plus=/\+\s*$/.test(figure);
 const ref=useRef(null);
 const [n,setN]=useState(target);
 const [phase,setPhase]=useState('static'); // static → armed → run → done
 // Layout effect: arming happens before the first paint, so the finished
 // number never flashes up before the count starts from 0.
 useLayoutEffect(()=>{
  const el=ref.current;
  if(!el||typeof IntersectionObserver!=='function'||window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)return;
  setN(0);setPhase('armed');
  const mounted=performance.now();let raf=0,timer=0,t0=-1;
  const tick=now=>{
   if(t0<0)t0=now;
   const p=Math.min((now-t0)/COUNT_MS,1);
   setN(Math.round(target*countEase(p)));
   if(p<1)raf=requestAnimationFrame(tick);else setPhase('done');
  };
  const io=new IntersectionObserver(entries=>{
   if(!entries.some(e=>e.isIntersecting))return;
   io.disconnect();
   timer=setTimeout(()=>{setPhase('run');raf=requestAnimationFrame(tick)},Math.max(120,delay-(performance.now()-mounted)));
  },{threshold:.35});
  io.observe(el);
  return()=>{io.disconnect();clearTimeout(timer);cancelAnimationFrame(raf)};
 },[target,delay]);
 const fmt=v=>v.toLocaleString('en-US');
 return <div ref={ref} className={`founder-stat founder-stat--${variant} is-${phase}`}>
  <b className="founder-stat-figure">
   <span className="sr-only">{figure}</span>
   <span className="founder-stat-count" aria-hidden="true"><span className="founder-stat-sizer">{fmt(target)}</span><span className="founder-stat-live">{fmt(n)}</span>{phase==='done'&&<span className="founder-stat-glint">{fmt(target)}</span>}</span>
   {plus&&<sup aria-hidden="true">+</sup>}
  </b>
  <i className="founder-stat-rule" aria-hidden="true"/>
  <span className="founder-stat-copy">
   <strong className="founder-stat-unit">{unit}</strong>
   <span className="founder-stat-label">{detail.split('**').map((s,i)=>i%2?<em key={i}>{s}</em>:s)}</span>
  </span>
 </div>;
}

// The 18 showroom cars are REAL hyper/luxury vehicles captured live from the
// dealer-stock exchange on 2026-11-05 (owner request: the showroom should be
// real luxury stock, like the demo supercars it replaces). Each entry carries
// its dealer stock code and a hotlinked gallery (first 12 photos bundled; the
// seed carries the full set) — refresh by re-parsing the exchange detail page.
export const cars = [
 {id:1, make:'Ferrari', model:'296 GTB Assetto Fiorano', year:2023, km:'1,750', fuel:'Plug-in hybrid', body:'Coupe', price:'$202,810', image:'https://picture1.goo-net.com/050/0508888/J/0508888A30261013W00302.jpg', grade:null, status:'New Arrival', location:'Chiba', tr:'AT', drv:'2WD', eng:'3,000cc', seats:2, col:'Rosso Red', st:'LHD', stock_no:'0508888A30261013W003', images:['https://picture1.goo-net.com/050/0508888/J/0508888A30261013W00302.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261013W00303.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261013W00304.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261013W00305.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261013W00306.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261013W00307.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261013W00308.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261013W00309.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261013W00310.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261013W00311.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261013W00312.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261013W00313.jpg']},
 {id:2, make:'Lamborghini', model:'Huracan', year:2021, km:'6,295', fuel:'Petrol', body:'Coupe', price:'$293,182', image:'https://picture1.goo-net.com/020/0201053/J/0201053A30261031W00105.jpg', grade:null, status:'In Stock', location:'Aichi', tr:'AT', drv:'2WD', eng:'5,200cc', seats:2, col:'Dark Green', st:'LHD', stock_no:'0201053A30261031W001', images:['https://picture1.goo-net.com/020/0201053/J/0201053A30261031W00105.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261031W00106.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261031W00108.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261031W00112.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261031W00116.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261031W00117.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261031W00118.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261031W00119.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261031W00120.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261031W00121.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261031W00122.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261031W00123.jpg']},
 {id:3, make:'McLaren', model:'720S', year:2018, km:'5,800', fuel:'Petrol', body:'Coupe', price:'$155,237', image:'https://picture1.goo-net.com/050/0508888/J/0508888A30261019W00302.jpg', grade:null, status:'In Stock', location:'Chiba', tr:'AT', drv:'2WD', eng:'4,000cc', seats:2, col:'Yellow Metallic', st:'RHD', stock_no:'0508888A30261019W003', images:['https://picture1.goo-net.com/050/0508888/J/0508888A30261019W00302.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261019W00303.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261019W00304.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261019W00305.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261019W00306.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261019W00307.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261019W00308.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261019W00309.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261019W00310.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261019W00311.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261019W00312.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261019W00313.jpg']},
 {id:4, make:'Porsche', model:'911 Carrera GTS', year:2024, km:'3,860', fuel:'Petrol', body:'Coupe', price:'$149,702', image:'https://picture1.goo-net.com/7000200160/30261023/J/70002001603026102300300.jpg', grade:null, status:'New Arrival', location:'Aichi', tr:'AT', drv:'2WD', eng:'3,000cc', seats:4, col:'Silver Metallic', st:'RHD', stock_no:'0200160A30261023W003', images:['https://picture1.goo-net.com/7000200160/30261023/J/70002001603026102300300.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261023W00301.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261023W00303.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261023W00304.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261023W00305.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261023W00306.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261023W00307.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261023W00308.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261023W00309.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261023W00310.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261023W00311.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261023W00312.jpg']},
 {id:5, make:'Bentley', model:'Continental GT Convertible', year:2021, km:'15,060', fuel:'Petrol', body:'Convertible', price:'$159,501', image:'https://picture1.goo-net.com/052/0520284/J/0520284A30260812W00202.jpg', grade:null, status:'In Stock', location:'Chiba', tr:'AT', drv:'4WD', eng:'6,000cc', seats:4, col:'White', st:'RHD', stock_no:'0520284A30260812W002', images:['https://picture1.goo-net.com/052/0520284/J/0520284A30260812W00202.jpg','https://picture1.goo-net.com/052/0520284/J/0520284A30260812W00203.jpg','https://picture1.goo-net.com/052/0520284/J/0520284A30260812W00204.jpg','https://picture1.goo-net.com/052/0520284/J/0520284A30260812W00205.jpg','https://picture1.goo-net.com/052/0520284/J/0520284A30260812W00206.jpg','https://picture1.goo-net.com/052/0520284/J/0520284A30260812W00207.jpg','https://picture1.goo-net.com/052/0520284/J/0520284A30260812W00208.jpg','https://picture1.goo-net.com/052/0520284/J/0520284A30260812W00209.jpg','https://picture1.goo-net.com/052/0520284/J/0520284A30260812W00210.jpg','https://picture1.goo-net.com/052/0520284/J/0520284A30260812W00211.jpg','https://picture1.goo-net.com/052/0520284/J/0520284A30260812W00212.jpg','https://picture1.goo-net.com/052/0520284/J/0520284A30260812W00213.jpg']},
 {id:6, make:'Aston Martin', model:'DB11', year:2020, km:'11,300', fuel:'Petrol', body:'Coupe', price:'$113,050', image:'https://picture1.goo-net.com/7009731113/30260816/J/70097311133026081600100.jpg', grade:null, status:'In Stock', location:'Hyogo', tr:'AT', drv:'2WD', eng:'5,200cc', seats:4, col:'Black Metallic', st:'RHD', stock_no:'9731113A30260816W001', images:['https://picture1.goo-net.com/7009731113/30260816/J/70097311133026081600100.jpg','https://picture1.goo-net.com/973/9731113/J/9731113A30260816W00101.jpg','https://picture1.goo-net.com/973/9731113/J/9731113A30260816W00102.jpg','https://picture1.goo-net.com/973/9731113/J/9731113A30260816W00103.jpg','https://picture1.goo-net.com/973/9731113/J/9731113A30260816W00104.jpg','https://picture1.goo-net.com/973/9731113/J/9731113A30260816W00105.jpg','https://picture1.goo-net.com/973/9731113/J/9731113A30260816W00106.jpg','https://picture1.goo-net.com/973/9731113/J/9731113A30260816W00107.jpg','https://picture1.goo-net.com/973/9731113/J/9731113A30260816W00108.jpg','https://picture1.goo-net.com/973/9731113/J/9731113A30260816W00109.jpg','https://picture1.goo-net.com/973/9731113/J/9731113A30260816W00110.jpg','https://picture1.goo-net.com/973/9731113/J/9731113A30260816W00111.jpg']},
 {id:7, make:'Lexus', model:'LC 500 Convertible', year:2021, km:'11,000', fuel:'Petrol', body:'Convertible', price:'$107,515', image:'https://picture1.goo-net.com/7000200160/30261016/J/70002001603026101600100.jpg', grade:null, status:'In Stock', location:'Aichi', tr:'AT', drv:'2WD', eng:'5,000cc', seats:4, col:'Pearl White', st:'RHD', stock_no:'0200160A30261016W001', images:['https://picture1.goo-net.com/7000200160/30261016/J/70002001603026101600100.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261016W00102.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261016W00103.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261016W00104.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261016W00105.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261016W00106.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261016W00107.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261016W00108.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261016W00109.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261016W00110.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261016W00111.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261016W00112.jpg']},
 {id:8, make:'Toyota', model:'Century', year:2022, km:'47,750', fuel:'Hybrid', body:'Sedan', price:'$117,837', image:'https://picture1.goo-net.com/050/0508888/J/0508888A30261103W00102.jpg', grade:null, status:'In Stock', location:'Chiba', tr:'AT', drv:'2WD', eng:'5,000cc', seats:5, col:'Black Metallic', st:'RHD', stock_no:'0508888A30261103W001', images:['https://picture1.goo-net.com/050/0508888/J/0508888A30261103W00102.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261103W00103.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261103W00104.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261103W00105.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261103W00106.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261103W00107.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261103W00108.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261103W00109.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261103W00110.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261103W00111.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261103W00112.jpg','https://picture1.goo-net.com/050/0508888/J/0508888A30261103W00113.jpg']},
 {id:9, make:'Lexus', model:'LX 600', year:2025, km:'4,887', fuel:'Petrol', body:'SUV', price:'$106,182', image:'https://picture1.goo-net.com/020/0201053/J/0201053A30261102W00207.jpg', grade:null, status:'New Arrival', location:'Aichi', tr:'AT', drv:'4WD', eng:'3,500cc', seats:null, col:'Black Metallic', st:'RHD', stock_no:'0201053A30261102W002', images:['https://picture1.goo-net.com/020/0201053/J/0201053A30261102W00207.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261102W00204.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261102W00205.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261102W00206.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261102W00214.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261102W00215.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261102W00216.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261102W00217.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261102W00218.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261102W00219.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261102W00220.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261102W00221.jpg']},
 {id:10, make:'Land Rover', model:'Defender 110 X-Dynamic HSE', year:2025, km:'20,087', fuel:'Hybrid', body:'SUV', price:'$74,827', image:'https://picture1.goo-net.com/071/0710232/J/0710232A30260926W00111.jpg', grade:null, status:'In Stock', location:'Hyogo', tr:'AT', drv:'4WD', eng:'3,000cc', seats:5, col:'Green', st:'RHD', stock_no:'0710232A30260926W001', images:['https://picture1.goo-net.com/071/0710232/J/0710232A30260926W00111.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260926W00101.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260926W00102.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260926W00103.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260926W00104.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260926W00105.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260926W00106.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260926W00107.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260926W00108.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260926W00109.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260926W00110.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260926W00112.jpg']},
 {id:11, make:'Audi', model:'R8 4.2 FSI Quattro', year:2013, km:'52,000', fuel:'Petrol', body:'Coupe', price:'$60,092', image:'https://picture1.goo-net.com/7009731113/30261103/J/70097311133026110300100.jpg', grade:null, status:'In Stock', location:'Hyogo', tr:'AT', drv:'4WD', eng:'4,200cc', seats:2, col:'Light Gray Metallic', st:'RHD', stock_no:'9731113A30261103W001', images:['https://picture1.goo-net.com/7009731113/30261103/J/70097311133026110300100.jpg','https://picture1.goo-net.com/973/9731113/J/9731113A30261103W00101.jpg','https://picture1.goo-net.com/973/9731113/J/9731113A30261103W00102.jpg','https://picture1.goo-net.com/973/9731113/J/9731113A30261103W00103.jpg','https://picture1.goo-net.com/973/9731113/J/9731113A30261103W00104.jpg','https://picture1.goo-net.com/973/9731113/J/9731113A30261103W00105.jpg','https://picture1.goo-net.com/973/9731113/J/9731113A30261103W00106.jpg','https://picture1.goo-net.com/973/9731113/J/9731113A30261103W00107.jpg','https://picture1.goo-net.com/973/9731113/J/9731113A30261103W00108.jpg','https://picture1.goo-net.com/973/9731113/J/9731113A30261103W00109.jpg','https://picture1.goo-net.com/973/9731113/J/9731113A30261103W00110.jpg','https://picture1.goo-net.com/973/9731113/J/9731113A30261103W00111.jpg']},
 {id:12, make:'Toyota', model:'Supra RZ-S', year:1997, km:'79,000', fuel:'Petrol', body:'Coupe', price:'$83,116', image:'https://picture1.goo-net.com/055/0551811/J/0551811A30261031W00137.jpg', grade:null, status:'In Stock', location:'Saitama', tr:'MT', drv:'2WD', eng:'3,000cc', seats:4, col:'White', st:'RHD', stock_no:'0551811A30261031W001', images:['https://picture1.goo-net.com/055/0551811/J/0551811A30261031W00137.jpg','https://picture1.goo-net.com/055/0551811/J/0551811A30261031W00106.jpg','https://picture1.goo-net.com/055/0551811/J/0551811A30261031W00107.jpg','https://picture1.goo-net.com/055/0551811/J/0551811A30261031W00108.jpg','https://picture1.goo-net.com/055/0551811/J/0551811A30261031W00109.jpg','https://picture1.goo-net.com/055/0551811/J/0551811A30261031W00110.jpg','https://picture1.goo-net.com/055/0551811/J/0551811A30261031W00111.jpg','https://picture1.goo-net.com/055/0551811/J/0551811A30261031W00112.jpg','https://picture1.goo-net.com/055/0551811/J/0551811A30261031W00113.jpg','https://picture1.goo-net.com/055/0551811/J/0551811A30261031W00114.jpg','https://picture1.goo-net.com/055/0551811/J/0551811A30261031W00115.jpg','https://picture1.goo-net.com/055/0551811/J/0551811A30261031W00116.jpg']},
 {id:13, make:'Lexus', model:'LC 500h L Package', year:2017, km:'24,000', fuel:'Hybrid', body:'Coupe', price:'$56,678', image:'https://picture1.goo-net.com/071/0710084/J/0710084A30261103W00137.jpg', grade:null, status:'In Stock', location:'Kyoto', tr:'AT', drv:'2WD', eng:'3,500cc', seats:4, col:'Red', st:'RHD', stock_no:'0710084A30261103W001', images:['https://picture1.goo-net.com/071/0710084/J/0710084A30261103W00137.jpg','https://picture1.goo-net.com/071/0710084/J/0710084A30261103W00104.jpg','https://picture1.goo-net.com/071/0710084/J/0710084A30261103W00105.jpg','https://picture1.goo-net.com/071/0710084/J/0710084A30261103W00106.jpg','https://picture1.goo-net.com/071/0710084/J/0710084A30261103W00107.jpg','https://picture1.goo-net.com/071/0710084/J/0710084A30261103W00108.jpg','https://picture1.goo-net.com/071/0710084/J/0710084A30261103W00109.jpg','https://picture1.goo-net.com/071/0710084/J/0710084A30261103W00110.jpg','https://picture1.goo-net.com/071/0710084/J/0710084A30261103W00111.jpg','https://picture1.goo-net.com/071/0710084/J/0710084A30261103W00112.jpg','https://picture1.goo-net.com/071/0710084/J/0710084A30261103W00113.jpg','https://picture1.goo-net.com/071/0710084/J/0710084A30261103W00114.jpg']},
 {id:14, make:'Porsche', model:'911 Carrera S', year:2020, km:'13,100', fuel:'Petrol', body:'Coupe', price:'$119,034', image:'https://picture1.goo-net.com/7000200160/30261018/J/70002001603026101800500.jpg', grade:null, status:'In Stock', location:'Aichi', tr:'AT', drv:'2WD', eng:'3,000cc', seats:4, col:'White Metallic', st:'LHD', stock_no:'0200160A30261018W005', images:['https://picture1.goo-net.com/7000200160/30261018/J/70002001603026101800500.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261018W00501.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261018W00503.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261018W00504.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261018W00505.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261018W00506.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261018W00507.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261018W00508.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261018W00509.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261018W00510.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261018W00511.jpg','https://picture1.goo-net.com/020/0200160/J/0200160A30261018W00512.jpg']},
 {id:15, make:'Porsche', model:'911 Carrera Cabriolet', year:2018, km:'72,100', fuel:'Petrol', body:'Convertible', price:'$71,439', image:'https://picture1.goo-net.com/050/0500520/J/0500520A30261101W00201.jpg', grade:null, status:'In Stock', location:'Tokyo', tr:'AT', drv:'4WD', eng:'3,000cc', seats:4, col:'Yellow', st:'RHD', stock_no:'0500520A30261101W002', images:['https://picture1.goo-net.com/050/0500520/J/0500520A30261101W00201.jpg','https://picture1.goo-net.com/050/0500520/J/0500520A30261101W00202.jpg','https://picture1.goo-net.com/050/0500520/J/0500520A30261101W00203.jpg','https://picture1.goo-net.com/050/0500520/J/0500520A30261101W00204.jpg','https://picture1.goo-net.com/050/0500520/J/0500520A30261101W00205.jpg','https://picture1.goo-net.com/050/0500520/J/0500520A30261101W00206.jpg','https://picture1.goo-net.com/050/0500520/J/0500520A30261101W00207.jpg','https://picture1.goo-net.com/050/0500520/J/0500520A30261101W00208.jpg','https://picture1.goo-net.com/050/0500520/J/0500520A30261101W00209.jpg','https://picture1.goo-net.com/050/0500520/J/0500520A30261101W00210.jpg','https://picture1.goo-net.com/050/0500520/J/0500520A30261101W00211.jpg','https://picture1.goo-net.com/050/0500520/J/0500520A30261101W00212.jpg']},
 {id:16, make:'BMW', model:'740i M Sport', year:2022, km:'60,200', fuel:'Petrol', body:'Sedan', price:'$31,518', image:'https://picture1.goo-net.com/055/0550871/J/0550871A30261027W00112.jpg', grade:null, status:'In Stock', location:'Kanagawa', tr:'AT', drv:'2WD', eng:'3,000cc', seats:5, col:'Black', st:'RHD', stock_no:'0550871A30261027W001', images:['https://picture1.goo-net.com/055/0550871/J/0550871A30261027W00112.jpg','https://picture1.goo-net.com/055/0550871/J/0550871A30261027W00109.jpg','https://picture1.goo-net.com/055/0550871/J/0550871A30261027W00110.jpg','https://picture1.goo-net.com/055/0550871/J/0550871A30261027W00111.jpg','https://picture1.goo-net.com/055/0550871/J/0550871A30261027W00113.jpg','https://picture1.goo-net.com/055/0550871/J/0550871A30261027W00114.jpg','https://picture1.goo-net.com/055/0550871/J/0550871A30261027W00115.jpg','https://picture1.goo-net.com/055/0550871/J/0550871A30261027W00116.jpg','https://picture1.goo-net.com/055/0550871/J/0550871A30261027W00117.jpg','https://picture1.goo-net.com/055/0550871/J/0550871A30261027W00118.jpg','https://picture1.goo-net.com/055/0550871/J/0550871A30261027W00119.jpg','https://picture1.goo-net.com/055/0550871/J/0550871A30261027W00120.jpg']},
 {id:17, make:'BMW', model:'X6 xDrive35d M Sport', year:2023, km:'17,500', fuel:'Hybrid', body:'SUV', price:'$63,532', image:'https://picture1.goo-net.com/020/0203361/J/0203361A20261022W00503.jpg', grade:null, status:'In Stock', location:'Aichi', tr:'AT', drv:'4WD', eng:'3,000cc', seats:5, col:'Black', st:'RHD', stock_no:'0203361A20261022W005', images:['https://picture1.goo-net.com/020/0203361/J/0203361A20261022W00503.jpg','https://picture1.goo-net.com/020/0203361/J/0203361A20261022W00502.jpg','https://picture1.goo-net.com/020/0203361/J/0203361A20261022W00507.jpg','https://picture1.goo-net.com/020/0203361/J/0203361A20261022W00508.jpg','https://picture1.goo-net.com/020/0203361/J/0203361A20261022W00509.jpg','https://picture1.goo-net.com/020/0203361/J/0203361A20261022W00510.jpg','https://picture1.goo-net.com/020/0203361/J/0203361A20261022W00511.jpg','https://picture1.goo-net.com/020/0203361/J/0203361A20261022W00512.jpg','https://picture1.goo-net.com/020/0203361/J/0203361A20261022W00513.jpg','https://picture1.goo-net.com/020/0203361/J/0203361A20261022W00514.jpg','https://picture1.goo-net.com/020/0203361/J/0203361A20261022W00515.jpg','https://picture1.goo-net.com/020/0203361/J/0203361A20261022W00516.jpg']},
 {id:18, make:'Ferrari', model:'360 Modena F1', year:2004, km:'12,246', fuel:'Petrol', body:'Coupe', price:'$107,474', image:'https://picture1.goo-net.com/020/0201053/J/0201053A30261101W00107.jpg', grade:null, status:'In Stock', location:'Aichi', tr:'AT', drv:'2WD', eng:'3,600cc', seats:2, col:'Red', st:'LHD', stock_no:'0201053A30261101W001', images:['https://picture1.goo-net.com/020/0201053/J/0201053A30261101W00107.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261101W00104.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261101W00105.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261101W00106.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261101W00111.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261101W00115.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261101W00116.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261101W00117.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261101W00118.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261101W00119.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261101W00120.jpg','https://picture1.goo-net.com/020/0201053/J/0201053A30261101W00121.jpg']},
 {id:43, make:'Toyota', model:'Harrier S', year:2023, km:'24,204', fuel:'Petrol', body:'SUV', price:'$21,000', image:'/assets/inventory/700071023230260801001.webp', grade:'4.5', status:'In Stock', location:'Hyogo', tr:'AT', drv:'2WD', eng:'2,000cc', seats:5, col:'Black', st:'RHD', stock_no:'0710232A30260801W001',images:['https://picture1.goo-net.com/7000710232/30260801/J/70007102323026080100100.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00101.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00102.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00103.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00104.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00105.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00106.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00107.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00108.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00109.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00110.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00111.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00112.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00113.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00114.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00115.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00116.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00117.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00118.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00119.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00120.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00121.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00122.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00123.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00124.jpg']}, {id:44, make:'Toyota', model:'Harrier Z Leather Package', year:2023, km:'14,000', fuel:'Petrol', body:'SUV', price:'$28,100', image:'/assets/inventory/988026080300208264002.webp', grade:'4.5', status:'In Stock', location:'Gifu', tr:'AT', drv:'2WD', eng:'2,000cc', seats:5, col:'Silver Metallic', st:'RHD', stock_no:'0208264A20260802D002',images:['https://picture1.goo-net.com/9880260803/00208264/J/98802608030020826400200.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00201.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00202.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00203.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00204.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00205.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00206.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00207.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00208.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00209.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00210.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00211.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00212.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00213.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00214.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00215.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00216.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00217.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00218.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00219.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00220.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00221.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00222.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00223.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00224.jpg']}, {id:45, make:'Toyota', model:'Alphard 2.5S C Package', year:2021, km:'56,661', fuel:'Petrol', body:'MPV', price:'$27,700', image:'/assets/inventory/700054141330260802005.webp', grade:'4.0', status:'In Stock', location:'Chiba', tr:'AT', drv:'2WD', eng:'2,500cc', seats:7, col:'Black', st:'RHD', stock_no:'0541413A30260802W005',images:['https://picture1.goo-net.com/7000541413/30260802/J/70005414133026080200500.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00501.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00502.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00503.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00504.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00505.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00506.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00507.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00508.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00509.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00510.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00511.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00512.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00513.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00514.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00515.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00516.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00517.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00518.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00519.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00520.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00521.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00522.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00523.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00524.jpg']}, {id:46, make:'Honda', model:'Vezel Hybrid Z Honda Sensing', year:2016, km:'46,353', fuel:'Hybrid', body:'SUV', price:'$21,100', image:'/assets/inventory/700056103730260717002.webp', grade:'4.5', status:'In Stock', location:'Chiba', tr:'AT', drv:'2WD', eng:'1,500cc', seats:5, col:'Pearl White', st:'RHD', stock_no:'0561037A30260717W002',images:['https://picture1.goo-net.com/7000561037/30260717/J/70005610373026071700200.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00201.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00202.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00203.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00204.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00205.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00206.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00207.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00208.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00209.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00210.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00211.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00212.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00213.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00214.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00215.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00216.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00217.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00218.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00219.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00220.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00221.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00222.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00223.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00224.jpg']}, {id:47, make:'Mazda', model:'CX-30 20S L Package', year:2021, km:'41,000', fuel:'Petrol', body:'SUV', price:'$14,100', image:'/assets/inventory/700100197430260726001.webp', grade:'4.0', status:'In Stock', location:'Hiroshima', tr:'AT', drv:'2WD', eng:'2,000cc', seats:5, col:'Gray Metallic', st:'RHD', stock_no:'1001974A30260726W001',images:['https://picture1.goo-net.com/7001001974/30260726/J/70010019743026072600100.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00101.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00102.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00103.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00104.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00105.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00106.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00107.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00108.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00109.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00110.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00111.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00112.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00113.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00114.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00115.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00116.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00117.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00118.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00119.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00120.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00121.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00122.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00123.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00124.jpg']}, {id:48, make:'Toyota', model:'Land Cruiser Prado TX', year:1996, km:'134,409', fuel:'Diesel', body:'SUV', price:'$16,600', image:'/assets/inventory/700052000730260404001.webp', grade:'4.0', status:'In Stock', location:'Gunma', tr:'AT', drv:'4WD', eng:'3,000cc TD', seats:5, col:'Blue', st:'RHD', stock_no:'0520007A30260404W001',images:['https://picture1.goo-net.com/7000520007/30260404/J/70005200073026040400100.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00101.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00102.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00103.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00104.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00105.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00106.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00107.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00108.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00109.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00110.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00111.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00112.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00113.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00114.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00115.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00116.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00117.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00118.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00119.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00120.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00121.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00122.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00123.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00124.jpg']},  {id:49, make:'Toyota', model:'Alphard 2.5S C Package', year:2018, km:'111,252', fuel:'Petrol', body:'MPV', price:'$25,600', image:'https://picture1.goo-net.com/7000541413/30260804/J/70005414133026080400300.jpg', grade:'4.0', status:'In Stock', location:'Chiba', tr:'AT', drv:'2WD', eng:'2,500cc', seats:7, col:'Pearl White', st:'RHD', stock_no:'0541413A30260804W003', images:['https://picture1.goo-net.com/7000541413/30260804/J/70005414133026080400300.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00301.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00302.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00303.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00304.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00305.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00306.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00307.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00308.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00309.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00310.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00311.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00312.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00313.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00314.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00315.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00316.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00317.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00318.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00319.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00320.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00321.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00322.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00323.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00324.jpg']}, {id:50, make:'Honda', model:'Vezel e:HEV Z', year:2026, km:'3', fuel:'Hybrid', body:'SUV', price:'$27,100', image:'https://picture1.goo-net.com/7000560922/30260625/J/70005609223026062500200.jpg', grade:'5.0', status:'In Stock', location:'Chiba', tr:'AT', drv:'2WD', eng:'1,500cc', seats:5, col:'Pearl White', st:'RHD', stock_no:'0560922A30260625W002', images:['https://picture1.goo-net.com/7000560922/30260625/J/70005609223026062500200.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00201.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00202.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00203.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00204.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00205.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00206.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00207.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00208.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00209.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00210.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00211.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00212.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00213.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00214.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00215.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00216.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00217.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00218.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00219.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00220.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00221.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00222.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00223.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00224.jpg']}, {id:51, make:'Mazda', model:'CX-60 XD S Package', year:2023, km:'23,000', fuel:'Diesel', body:'SUV', price:'$21,900', image:'https://picture1.goo-net.com/9880260307/00704244/J/98802603070070424400100.jpg', grade:'4.0', status:'In Stock', location:'Okinawa', tr:'AT', drv:'2WD', eng:'3,300cc D', seats:5, col:'Black M', st:'RHD', stock_no:'0704244A20260306D001', images:['https://picture1.goo-net.com/9880260307/00704244/J/98802603070070424400100.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00101.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00102.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00103.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00104.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00105.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00106.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00107.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00108.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00109.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00110.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00111.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00112.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00113.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00114.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00115.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00116.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00117.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00118.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00119.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00120.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00121.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00122.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00123.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00124.jpg']}, {id:52, make:'Toyota', model:'Sienta Hybrid Z', year:2026, km:'13', fuel:'Hybrid', body:'MPV', price:'$27,800', image:'https://picture1.goo-net.com/7000710232/30260818/J/70007102323026081800700.jpg', grade:'S', status:'In Stock', location:'Hyogo', tr:'AT', drv:'2WD', eng:'1,500cc', seats:7, col:'Gray', st:'RHD', stock_no:'0710232A30260818W007', images:['https://picture1.goo-net.com/7000710232/30260818/J/70007102323026081800700.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00701.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00702.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00703.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00704.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00705.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00706.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00707.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00708.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00709.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00710.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00711.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00712.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00713.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00714.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00715.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00716.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00717.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00718.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00719.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00720.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00721.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00722.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00723.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00724.jpg']}, {id:53, make:'Toyota', model:'Hiace Wagon GL', year:2026, km:'3', fuel:'Petrol', body:'Van', price:'$35,900', image:'https://picture1.goo-net.com/9750260811/01157270/J/97502608110115727000100.jpg', grade:'5.0', status:'In Stock', location:'Ishikawa', tr:'AT', drv:'4WD', eng:'2,700cc', seats:10, col:'White', st:'RHD', stock_no:'1157270A20260810G001', images:['https://picture1.goo-net.com/9750260811/01157270/J/97502608110115727000100.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00101.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00102.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00103.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00104.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00105.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00106.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00107.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00108.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00109.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00110.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00111.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00112.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00113.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00114.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00115.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00116.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00117.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00118.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00119.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00140.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00141.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00142.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00143.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00144.jpg']}, {id:54, make:'Toyota', model:'Hilux Z GR Sport', year:2023, km:'22,000', fuel:'Diesel', body:'Pickup', price:'$36,200', image:'https://picture1.goo-net.com/9750260818/00402076/J/97502608180040207600100.jpg', grade:'4.5', status:'In Stock', location:'Tochigi', tr:'AT', drv:'4WD', eng:'2,400cc D', seats:5, col:'White', st:'RHD', stock_no:'0402076A20260817G001', images:['https://picture1.goo-net.com/9750260818/00402076/J/97502608180040207600100.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00101.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00102.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00103.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00104.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00105.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00106.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00107.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00108.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00109.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00110.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00111.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00112.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00113.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00114.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00115.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00116.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00117.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00118.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00119.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00120.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00121.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00122.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00123.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00124.jpg']}, {id:55, make:'Daihatsu', model:'Taft X', year:2026, km:'13', fuel:'Petrol', body:'Kei', price:'$11,900', image:'https://picture1.goo-net.com/7001301077/30260820/J/70013010773026082000100.jpg', grade:'S', status:'In Stock', location:'Ehime', tr:'AT', drv:'2WD', eng:'660cc', seats:4, col:'Gray', st:'RHD', stock_no:'1301077A30260820W001', images:['https://picture1.goo-net.com/7001301077/30260820/J/70013010773026082000100.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00101.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00102.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00103.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00104.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00105.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00106.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00107.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00108.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00109.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00110.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00111.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00112.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00113.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00114.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00115.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00116.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00117.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00118.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00119.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00120.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00121.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00122.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00123.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00124.jpg']}, {id:56, make:'Toyota', model:'Crown Sports Z', year:2025, km:'7,000', fuel:'Hybrid', body:'SUV', price:'$38,800', image:'https://picture1.goo-net.com/7000206487/30260816/J/70002064873026081600300.jpg', grade:'5.0', status:'In Stock', location:'Aichi', tr:'AT', drv:'4WD', eng:'2,500cc', seats:5, col:'Black', st:'RHD', stock_no:'0206487A30260816W003', images:['https://picture1.goo-net.com/7000206487/30260816/J/70002064873026081600300.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00301.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00302.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00303.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00304.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00305.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00306.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00307.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00308.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00309.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00310.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00311.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00312.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00313.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00314.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00315.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00316.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00317.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00318.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00319.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00320.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00321.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00322.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00323.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00324.jpg']}, {id:57, make:'Toyota', model:'Alphard Z', year:2026, km:'101', fuel:'Hybrid', body:'MPV', price:'$42,100', image:'https://picture1.goo-net.com/7000200421/30260821/Q/70002004213026082100400.jpg', grade:'S', status:'New Arrival', location:'Aichi', tr:'AT', drv:'2WD', eng:'2,500cc', seats:7, col:'Black', st:'RHD', stock_no:'0200421A30260821W004', images:['https://picture1.goo-net.com/7000200421/30260821/Q/70002004213026082100400.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00401.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00402.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00403.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00404.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00405.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00406.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00407.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00408.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00409.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00410.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00411.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00412.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00413.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00414.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00415.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00416.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00417.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00418.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00419.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00420.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00421.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00422.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00423.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00424.jpg']}, {id:58, make:'Toyota', model:'Land Cruiser 250 VX', year:2024, km:'15,000', fuel:'Petrol', body:'SUV', price:'$38,700', image:'https://picture1.goo-net.com/7000207429/30260819/Q/70002074293026081900700.jpg', grade:'5.0', status:'In Stock', location:'Aichi', tr:'AT', drv:'4WD', eng:'2,700cc', seats:7, col:'Black', st:'RHD', stock_no:'0207429A30260819W007', images:['https://picture1.goo-net.com/7000207429/30260819/Q/70002074293026081900700.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00701.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00702.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00703.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00704.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00705.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00706.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00707.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00708.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00709.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00710.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00711.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00712.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00713.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00714.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00715.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00716.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00717.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00718.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00719.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00720.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00721.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00722.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00723.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00724.jpg']}, {id:59, make:'Toyota', model:'Prius S', year:2017, km:'81,000', fuel:'Hybrid', body:'Sedan', price:'$10,600', image:'https://picture1.goo-net.com/7001002180/30260730/Q/70010021803026073000200.jpg', grade:'4.0', status:'In Stock', location:'Okayama', tr:'AT', drv:'2WD', eng:'1,800cc', seats:5, col:'White', st:'RHD', stock_no:'1002180A30260730W002', images:['https://picture1.goo-net.com/7001002180/30260730/Q/70010021803026073000200.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00201.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00202.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00203.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00204.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00205.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00206.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00207.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00208.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00209.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00210.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00211.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00212.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00213.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00214.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00215.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00216.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00217.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00218.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00219.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00220.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00221.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00222.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00223.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00224.jpg']}];


// Round 22 (owner request): the indicative duty calculator now covers every
// market in DEST, not just the first six. Figures stay what tools.dutyNote
// says they are — indicative approximations of the combined duty+tax burden,
// used ONLY inside this calculator (CLAIMS-POLICY.md: no duty rate is quoted
// anywhere else on the site; the buyer's own customs authority decides).
export const priceOf=c=>typeof c?.price==='number'?c.price:Number(String(c?.price??'').replace(/[^0-9.]/g,''))||0;
const statusSlug=s=>String(s||'in-stock').replace(/\s+/g,'').toLowerCase();
// Vehicle prices are converted only after an item-specific discount is
// applied. A discount is always keyed by the same carRef used in public URLs.
export const carDiscountedUSD=(car,discounts)=>{
 const item=stockDiscountFor(discounts,'car',carRef(car));
 return priceWithOffer(priceOf(car),item?.percent||0).now;
};
export const useCarPrice=discounts=>{
 const {fmt,isBase}=useCurrency();
 return c=>{
  const item=stockDiscountFor(discounts,'car',carRef(c));
  const price=priceWithOffer(priceOf(c),item?.percent||0);
  return !price.hasOffer&&isBase&&typeof c?.price==='string'&&c.price.trim()?c.price:fmt(price.now);
 };
};

export function VehiclePriceDisplay({car,discounts,className=''}){
 const {fmt,isBase}=useCurrency();
 const discount=stockDiscountFor(discounts,'car',carRef(car));
 const price=priceWithOffer(priceOf(car),discount?.percent||0);
 if(!price.was)return <b className={className}>{car?.price||'Price on request'}</b>;
 const original=isBase&&typeof car?.price==='string'&&car.price.trim()?car.price:fmt(price.was);
 if(!price.hasOffer)return <b className={className}>{original}</b>;
 const badge=discount?.label?`${discount.label} · ${price.percent}% off`:`${price.percent}% off`;
 return <span className={'stock-price-display '+className} aria-label={`${badge}; now ${fmt(price.now)}, previously ${original}`}>
  <span className="stock-price-values"><s>{original}</s><b>{fmt(price.now)}</b></span>
  <em>{badge}</em>
  <small>{discount?.until?`Ends ${discount.until}. `:''}Indicative FOB; confirmed in your written quotation.</small>
 </span>;
}
export const stockNo=c=>c.stock_no||('AR7-'+(26000+c.id));
// Compact vehicle label for dashboards and auction previews. Uses the real
// lot number when the record carries one, otherwise the stock reference via
// the existing routing utilities — NEVER a fabricated 'LOT' + database id,
// which produced nonsense like 'LOT 51<uuid>08' for CRM rows with uuid ids.
export const stockLabel=c=>!c?'':(c.lot_no&&String(c.lot_no).trim()?`Lot ${String(c.lot_no).trim()}`:`Stock ${carRef(c)}`);
export const BRANDS=()=>{const m={};cars.forEach(c=>{(m[c.make]=m[c.make]||[]).push(c)});return Object.keys(m).sort((a,b)=>m[b].length-m[a].length).map(k=>({name:k,count:m[k].length,models:[...new Set(m[k].map(c=>c.model.split(' ')[0]))].slice(0,4)}))};
// 2026-11-07 (owner request): each "Every brand. Every budget." card carries a
// quiet slideshow of that brand's actual stock. Deliberately cheap: rotation
// only runs while the card is on screen (IntersectionObserver) and each photo
// is mounted only when its turn first comes, so an idle homepage downloads
// one image per card, not five. Honours prefers-reduced-motion.
function BudgetSlides({make}){
 const shots=React.useMemo(()=>cars.filter(c=>c.make===make&&c.image).slice(0,4),[make]);
 const [i,setI]=useState(0),[seen,setSeen]=useState(0),[vis,setVis]=useState(false);
 const ref=React.useRef(null);
 useEffect(()=>{
  const el=ref.current;
  if(!el||typeof IntersectionObserver==='undefined'){setVis(true);return}
  const io=new IntersectionObserver(es=>setVis(es.some(e=>e.isIntersecting)),{rootMargin:'60px'});
  io.observe(el);return()=>io.disconnect();
 },[]);
 useEffect(()=>{
  if(!vis||shots.length<2)return;
  try{if(matchMedia('(prefers-reduced-motion: reduce)').matches)return}catch{}
  const t=setInterval(()=>setI(v=>{const nx=(v+1)%shots.length;setSeen(s=>Math.max(s,nx));return nx}),2700);
  return()=>clearInterval(t);
 },[vis,shots.length]);
 if(!shots.length)return null;
 const cur=shots[i];
 return <div className="budget-shots" ref={ref} aria-hidden="true">
  {shots.map((c,k)=>k<=Math.max(seen,0)?<img key={c.id} className={k===i?'on':''} src={c.image} srcSet={showroomSrcSet(c.image)} sizes={showroomSrcSet(c.image) ? SHOWROOM_CARD_SIZES : undefined} alt="" loading="lazy" decoding="async" width="400" height="225"/>:null)}
  <span className="budget-shot-cap">{cur.model} · {cur.year}</span>
  {shots.length>1&&<span className="budget-shot-dots">{shots.map((c,k)=><i key={c.id} className={k===i?'on':''}/>)}</span>}
 </div>;
}
export const HOWBUY=[
 ['Tell us the car','Share make, model, year, budget and destination port. We shortlist stock and auction matches.','01','Our Japan export desk checks live auction schedules and dealer stock against your destination country’s age and compliance rules before sending you a shortlist.'],
 ['Get translated sheets','Full English summary of every auction sheet, with photos of flags and repair marks.','02','For auction lots, a Japan-based specialist translates the inspector’s handwritten notes, panel grades and interior marks into plain English; for dealer stock, we share the dealer condition notes and photo set.'],
 ['Set a bid limit','Agree a hard maximum before bidding — no surprises, no escalation.','03','You confirm a written maximum bid in JPY or USD together with an estimated CIF landed breakdown, and we lock that ceiling before the lot enters the lane.'],
 ['We bid for you','Our agents bid live at USS, TAA, JU, CAA and more; you follow in the portal.','04','Our bidding desk places live floor or terminal bids up to your agreed ceiling and shares the hammer result as soon as the lot closes.'],
 ['Inspect & prepare','Independent yard photos, underbody check, condition check against the auction sheet or dealer report, and pre-export preparation.','05','Once the vehicle reaches our Japan export yard, we photograph the exterior, interior and underbody, complete any mandatory pre-shipment inspection (such as QISJ, JEVIC or biosecurity cleaning), and prepare it for loading.'],
 ['Pay in stages','Deposit activates bidding; balance splits before and after shipment per your invoice.','06','You receive an itemized proforma invoice showing the vehicle price, export preparation, freight and marine insurance, settled by bank transfer (T/T) with every payment logged in your portal.'],
 ['Export paperwork','Invoice, export certificate, bill of lading, insurance — all handled by our desk.','07','We complete Japanese de-registration (Export Certificate / Yushutsu Massho), issue the Commercial Invoice and marine insurance certificate, and courier the Original Bill of Lading via DHL.'],
 ['Track to your port','Live milestones from Japan yard to your port, with customs-ready documents on arrival.','08','You track the vessel departure and estimated arrival in your account while your local clearing agent uses the couriered document pack to clear customs at your port.']
];

// Round 22: every DEST market has its emoji flag (used inside <option> rows,
// where SVG cannot render). SVG flags elsewhere come from src/flag.jsx.
export const LOGO=m=>'/assets/logos/'+m.toLowerCase()+'.png';
const CHASSIS={'Toyota':'6AA-TXUA85','Nissan':'6AA-SNE12','Honda':'6AA-RV5','Lexus':'GYL25','Suzuki':'CBA-ZC33S','Mazda':'3DA-KF2P','Mitsubishi':'DLA-GG2W','Subaru':'5AA-SKE','Daihatsu':'6BA-LA800','BMW':'WBA5F1','Mercedes-Benz':'205042','Audi':'F5DPBF','Rolls-Royce':'SCA6L','Bentley':'SCBGH','Lamborghini':'ZHW','Ferrari':'ZFF','Bugatti':'VF9','Porsche':'WP0','McLaren':'SBM'};
const DOORS={'SUV':5,'MPV':5,'Hatchback':5,'Sedan':4,'Van':4,'Kei':5};
const FEATPOOL=['Power steering','Air conditioner','Airbag','ABS','Navigation','Alloy wheels','Keyless entry','Backup camera','Cruise control','LED headlights','Roof rails','Rear spoiler','Massage seats','Bespoke Nappa leather','Carbon ceramic brakes','Launch control','Burmester sound','Panoramic roof','Rear entertainment','Air suspension','Night vision','Alcantara interior','21-inch alloys','Quad exhaust','Adaptive aerodynamics','Track telemetry'];
cars.forEach((c,i)=>{c.doors=DOORS[c.body]||4;c.chassis=(CHASSIS[c.make]||'6AA-0000')+'-'+(1200+i*7);c.int=c.id===11?'Black Fine Nappa Leather':c.id===12?'Toasted Caramel':['Gray','Black','Beige'][i%3];c.ven=['USS Tokyo','TAA Kinki','JU Aichi','CAA Chubu','HAA Kobe'][i%5];c.arr=new Date(2026,7,1+((i*3)%28)).toLocaleDateString('en-GB',{day:'2-digit',month:'short',year:'numeric'});c.feats=FEATPOOL.filter((f,k)=>((i*31+k*13)%11)<6).slice(0,6).concat(['New battery','Service records']);if(!c.stock_no)c.stock_no='AR7-'+(26000+c.id)});
// ---------------------------------------------------------------------------
// Live content hydration.
// The arrays above remain the built-in fallback so the site NEVER renders blank
// if the API is unreachable. When /api/site-content returns published rows the
// CRM has authored, we merge them into `cars` in place (same array identity,
// so every module-scope derivation above stays valid), then notify React.
// ---------------------------------------------------------------------------
const enrichCar=(c,i)=>{
 // CRM rows must show only what the CRM actually published. Doors follow the
 // body type (generic), but auction venue, arrival date, chassis, interior and
 // equipment are EVIDENCE — fabricating them for real inventory would be
 // inventing facts, so they stay absent when the data does not carry them.
 // Imported dealer rows arrive verbatim in Japanese (colour パールホワイト, prefecture
 // 愛知県) — translate the display fields faithfully or leave them unchanged
 // (src/jp-display.js), so an English page never shows katakana specs.
 c.doors=DOORS[c.body]||4;return applyShowroomHero(englishCarFields(c))};
// The showroom is the curated seed collection (bundle ids 1-18, extended as
// the seed grows). After hydration the DB rows carry uuid ids and honest body
// types, so membership is decided by stock number, captured here before the
// hydrate step replaces the array contents.
const SHOWROOM_STOCKS=new Set(cars.filter(c=>Number(c.id)<=18&&c.stock_no).map(c=>String(c.stock_no)));
export const isShowroomCar=c=>!!c&&!isImportedCar(c)&&(['Luxury','Supercar','Hypercar'].includes(c.body)||Number(c.id)<=12||SHOWROOM_STOCKS.has(String(c.stock_no||'')));
// 2026-11-08 owner audit: hero-06/10/12 + angle-09/16 were re-staged (garbled
// AR7 signage, and the LX600 rear was squeezed). /assets/* ships with a
// 1-year immutable Cache-Control, so the corrected files carry a -v2 name —
// NEVER overwrite a showroom file in place or cached visitors keep the old one.
// AR7-branded showroom heroes: studio scenes generated for the curated
// collection, keyed by stock number so they survive hydration. The hero leads
// the gallery; the real dealer photographs follow it unchanged.
// 2026-11-08 owner round 2: 11 showroom images rebuilt (Aston DB11, LX600,
// Defender, Century, LC500h, 740i x2, X6) via owner-approved car swaps inside
// the liked scenes; renamed with -v2/-v3 suffixes because /assets/* ships with
// 1y immutable cache headers.
const SHOWROOM_HEROES={
 '0508888A30261013W003':'/assets/showroom/hero-01.webp',
 '0201053A30261031W001':'/assets/showroom/hero-02-v2.webp',
 '0508888A30261019W003':'/assets/showroom/hero-03.webp',
 '0200160A30261023W003':'/assets/showroom/hero-04-v3.webp',
 '0520284A30260812W002':'/assets/showroom/hero-05.webp',
 '9731113A30260816W001':'/assets/showroom/hero-06-v3.webp',
 '0200160A30261016W001':'/assets/showroom/hero-07.webp',
 '0508888A30261103W001':'/assets/showroom/hero-08-v2.webp',
 '0201053A30261102W002':'/assets/showroom/hero-09-v2.webp',
 '0710232A30260926W001':'/assets/showroom/hero-10-v3.webp',
 '9731113A30261103W001':'/assets/showroom/hero-11.webp',
 '0551811A30261031W001':'/assets/showroom/hero-12-v2.webp',
 '0710084A30261103W001':'/assets/showroom/hero-13-v2.webp',
 '0200160A30261018W005':'/assets/showroom/hero-14-v3.webp',
 '0500520A30261101W002':'/assets/showroom/hero-15-v2.webp',
 '0550871A30261027W001':'/assets/showroom/hero-16-v4.webp',
 '0203361A20261022W005':'/assets/showroom/hero-17-v3.webp',
 '0201053A30261101W001':'/assets/showroom/hero-18.webp'
};
// Second showroom angle per car (rear/opposite three-quarter staged in a
// different area of the same venue). Slots in right after the hero; the real
// dealer photographs follow unchanged.
const SHOWROOM_ANGLES={
 '0508888A30261013W003':'/assets/showroom/angle-01.webp',
 '0201053A30261031W001':'/assets/showroom/angle-02.webp',
 '0508888A30261019W003':'/assets/showroom/angle-03.webp',
 '0200160A30261023W003':'/assets/showroom/angle-04.webp',
 '0520284A30260812W002':'/assets/showroom/angle-05.webp',
 '9731113A30260816W001':'/assets/showroom/angle-06-v2.webp',
 '0200160A30261016W001':'/assets/showroom/angle-07.webp',
 '0508888A30261103W001':'/assets/showroom/angle-08.webp',
 '0201053A30261102W002':'/assets/showroom/angle-09-v3.webp',
 '0710232A30260926W001':'/assets/showroom/angle-10-v2.webp',
 '9731113A30261103W001':'/assets/showroom/angle-11.webp',
 '0551811A30261031W001':'/assets/showroom/angle-12.webp',
 '0710084A30261103W001':'/assets/showroom/angle-13.webp',
 '0200160A30261018W005':'/assets/showroom/angle-14.webp',
 '0500520A30261101W002':'/assets/showroom/angle-15.webp',
 '0550871A30261027W001':'/assets/showroom/angle-16-v3.webp',
 '0201053A30261101W001':'/assets/showroom/angle-18.webp'
};
const applyShowroomHero=c=>{
 const key=String(c&&c.stock_no||'');
 const h=c&&SHOWROOM_HEROES[key];
 if(h){
  c.image=h;
  const a=SHOWROOM_ANGLES[key];
  if(Array.isArray(c.images)){
   const lead=a?[h,a]:[h];
   c.images=[...lead,...c.images.filter(u=>!lead.includes(u))];
  }
 }
 return c};
cars.forEach(applyShowroomHero);
const contentListeners=new Set();
let contentHydrated=false;
export const onContentChange=fn=>{contentListeners.add(fn);return()=>contentListeners.delete(fn)};
export const isContentHydrated=()=>contentHydrated;
// Re-render a component when the hydrated content lands (or changes).
function useContentVersion(){const [,bump]=useReducer(n=>n+1,0);useEffect(()=>onContentChange(bump),[]);}
const listingId=r=>{
 if(r?.id!=null&&String(r.id).trim()!=='')return r.id;
 const n=Number(r?.sort_order);
 return Number.isFinite(n)&&n>0?n:null;
};
async function hydrateSiteContent(){
 // Both sources hydrate together, in parallel, so the built-in fallback is
 // replaced in ONE step. Imported dealer cars are mapped into the same `cars`
 // array as the CRM's published listings — that is what gives them the full
 // inventory experience (search, compare, save, detail page, CIF estimate and
 // related stock). mapDealerRows drops cars already promoted to the website
 // (they are in site_listings) and cars the rotation system parked.
 const getJson=url=>fetch(url).then(r=>r.ok?r.json():null).catch(()=>null);
 // News is independent of stock and machinery: a slow inventory feed must not
 // strand the news page on its built-in fallback or hide an article deep link.
 getJson('/api/site-content?entity=articles').then(articles=>{
  if(Array.isArray(articles))setPublishedNews(articles);
 });
 try{
  // Machinery hydrates in the same parallel batch as the cars, so the
  // catalogue, the home teaser and the sitemap all agree on one snapshot.
  // A machine is never hidden behind a permission here: the API has already
  // filtered to published rows and stripped any photo without a rights basis,
  // so what lands is exactly what the public may see.
  const [rows,dealer,machines]=await Promise.all([
   getJson('/api/site-content?entity=listings'),
   fetchDealerStock().catch(()=>null),
   getJson('/api/site-content?machinery=list')
  ]);
  const mapped=[];
  if(Array.isArray(rows)&&rows.length){
   mapped.push(...rows.map((r,i)=>enrichCar({...r,id:listingId(r)??(i+1),image:r.image||'/assets/ar7-mark-460.webp'},i)));
  }
  if(Array.isArray(dealer)&&dealer.length){
   mapped.push(...mapDealerRows(dealer).map((c,i)=>enrichCar({...c,image:c.image||'/assets/ar7-mark-460.webp'},i)));
  }
  if(mapped.length){
   warmImageOrigins(mapped);
   cars.length=0;cars.push(...mapped);
   // Refresh the "last live stock" snapshot (see the boot step below): capped
   // and trimmed so it fits comfortably in localStorage.
   try{localStorage.setItem('ar7-live-cars',JSON.stringify(mapped.slice(0,80).map(c=>({...c,images:Array.isArray(c.images)?c.images.slice(0,1):c.images}))))}catch{/* quota or storage off */}
  }
  // Empty or failed → the built-in MACHINES fallback stands. The page must
  // never go blank because an API call was slow or the table is unprovisioned.
  hydrateMachines(machines);
 }catch{/* offline or not provisioned yet — keep built-in content */}
 contentHydrated=true;
 contentListeners.forEach(fn=>{try{fn()}catch{}});
}
// 2026-11-08 Lighthouse round: the live stock photos live on an external CDN.
// 2026-11-10: downgraded from rel=preconnect to rel=dns-prefetch — the home
// hero now paints local /assets slides first, so Lighthouse flagged the full
// preconnect as "unused" (an idle TLS socket costs the first paint). DNS
// resolution alone is nearly free and still removes the lookup from the
// first CDN image request. The origin is read out of the stock data itself
// (never hard-coded), capped at two hosts; local /assets fallbacks skipped.
const warmedOrigins=new Set();
function warmImageOrigins(list){
 if(typeof document==='undefined'||!document.head)return;
 for(const c of list){
  if(warmedOrigins.size>=2)break;
  const src=c&&c.image;
  if(!src||!/^https?:\/\//i.test(src))continue;
  try{
   const origin=new URL(src).origin;
   if(warmedOrigins.has(origin))continue;
   warmedOrigins.add(origin);
   const l=document.createElement('link');
   l.rel='dns-prefetch';l.href=origin;
   document.head.appendChild(l);
  }catch{/* malformed URL — skip */}
 }
}
// 2026-11-09 (owner): a car removed in the CRM must never resurface on the
// website. The last successful live snapshot is cached in localStorage and
// replaces the built-in showcase seed BEFORE first paint on return visits, so
// the only cars on screen are the ones that were live most recently;
// hydrateSiteContent() then refreshes both the page and the snapshot.
if(typeof window!=='undefined'){
 try{
  const snap=JSON.parse(localStorage.getItem('ar7-live-cars')||'null');
  if(Array.isArray(snap)&&snap.length){warmImageOrigins(snap);cars.length=0;cars.push(...snap.map((r,i)=>enrichCar(r,i)));}
 }catch{/* storage may be off */}
 hydrateSiteContent();
}

// Model-keyed legacy galleries retired: every curated car now carries its own
// verified photo set, so an id collision could never show the wrong vehicle.
const VEHICLE_GALLERIES={};
// Never mix photographs from different vehicles. Uses custom vehicle photo gallery
// configured via CRM when present, otherwise verified model galleries or cover image.
export const galleryFor=c=>{
 if(Array.isArray(c.images)&&c.images.length)return c.images;
 if(typeof c.images==='string'&&c.images.trim()){
  try{
   const p=JSON.parse(c.images);
   if(Array.isArray(p)&&p.length)return p;
  }catch{
   const s=c.images.split(',').map(x=>x.trim()).filter(Boolean);
   if(s.length)return s;
  }
 }
 return VEHICLE_GALLERIES[c.id]||(c.image?[c.image]:['/assets/ar7-mark-460.webp']);
};

// Real anchor for in-app pages. Renders a true href (so the browser's
// right-click / Ctrl+click "open in new tab" works everywhere) but keeps
// single-page-app navigation for plain left-clicks via linkClick.
// 2026-11-11 (owner: "proceed to the next upgrades of translations"): the
// card badges keep their English values in DATA (status drives filters and
// CSS slugs) and translate only at DISPLAY time through this map.
const STATUS_LABEL_KEY = { 'in stock': 'card.statusInStock', auction: 'card.statusAuction', 'new arrival': 'card.statusNew', sold: 'card.statusSold' };
// 2026-11-12 (next translation round): FAQ topics keep their English values in
// seo.js (they drive grouping and the FAQPage JSON-LD, which stays in the
// site's default language) and translate only at display time.
const statusLabel = (t, s) => { const k = STATUS_LABEL_KEY[String(s || 'In Stock').trim().toLowerCase()]; return k ? t(k) : (s || 'In Stock'); };

export function PageLink({to, navigate, opts, className, children, ...rest}) {
  return <a href={hrefFromTarget(to)} className={className} onClick={linkClick(to, navigate, opts)} {...rest}>{children}</a>;
}

// Hero search console (owner direction 2026-11-18: "replace Body with Models
// in the hero search, make the bar thinner, keep mobile/tablet sharp").
// The second select now lists real MODELS and follows the chosen make, so a
// buyer's very first click can land on /inventory already filtered to e.g.
// Toyota + Alphard. Handover still goes through sessionStorage: the inventory
// screen consumes ar7-inv-q / ar7-inv-make / ar7-inv-model on mount (and
// ar7-inv-body / ar7-inv-price from the home "shop by" rails, 2026-11-03).
function HeroSearch({t,navigate}){
 const [hsMake,setHsMake]=useState('All');
 const models=React.useMemo(()=>{
  const pool=hsMake==='All'?cars:cars.filter(c=>c.make===hsMake);
  const n=new Map();
  for(const c of pool){if(!c||!c.model)continue;n.set(c.model,(n.get(c.model)||0)+1)}
  return [...n.entries()].sort((a,b)=>b[1]-a[1]).slice(0,14).map(x=>x[0]);
 },[hsMake]);
 return <form className="hero-search" role="search" onSubmit={e=>{e.preventDefault();const f=e.currentTarget.elements;const v=(f.hq?.value||'').trim();try{sessionStorage.setItem('ar7-inv-q',v);if(hsMake!=='All')sessionStorage.setItem('ar7-inv-make',hsMake);if(f.hmd&&f.hmd.value!=='All')sessionStorage.setItem('ar7-inv-model',f.hmd.value)}catch{/* storage may be off */}navigate('inventory')}}>
  <div className="hs-query"><Search aria-hidden="true"/><input name="hq" placeholder={t('hero.searchPlaceholder')} aria-label={t('hero.searchPlaceholder')} autoComplete="off"/></div>
  <div className="hs-filters">
   <label className="hs-field"><span>Make</span><select name="hm" value={hsMake} onChange={e=>setHsMake(e.target.value)} aria-label="Make"><option value="All">All makes</option>{BRANDS().slice(0,12).map(b=><option key={b.name} value={b.name}>{b.name}</option>)}</select></label>
   <label className="hs-field"><span>Model</span><select name="hmd" defaultValue="All" key={hsMake} aria-label="Model"><option value="All">{hsMake==='All'?'Any model':'All '+hsMake}</option>{models.map(m=><option key={m} value={m}>{m}</option>)}</select></label>
   <button type="submit">{t('hero.searchBtn')} <ArrowRight/></button>
  </div>
 </form>;
}

// Card redesign (owner direction 2026-11-08): the lower half of every stock
// card is now a proper action zone — spec pills, a framed price plate, and
// direct WhatsApp / Make-an-offer buttons so a buyer can start negotiating
// from the grid without hunting for the contact page. WhatsApp opens a chat
// pre-filled with the exact car; the offer button opens the enquiry modal
// with the car and an offer prompt already typed in.
export function VehicleCard({c,onOpen,comp,onCmp,onOffer,discounts,cif,cifDest}){
 const s=useSettings();
 const {t}=useLang();
 const {fmt}=useCurrency();
 const href=hrefFor('inventory',carRef(c));
 const carLabel=[c.year,c.make,c.model].filter(Boolean).join(' ');
 const waMsg=`Hello AR7, I'm interested in the ${carLabel} (ref ${carRef(c)}) on your website. Is it still available?`;
 return <a className="car-card page-car" href={href} onClick={onOpen?linkClick(`inventory?car=${carRef(c)}`,()=>onOpen(c)):undefined}>
 <div className="car-image"><img loading="lazy" decoding="async" width="820" height="550" src={c.image} srcSet={showroomSrcSet(c.image)} sizes={showroomSrcSet(c.image) ? SHOWROOM_CARD_SIZES : undefined} alt={carAlt(c)}/><span className={'status '+statusSlug(c.status)}>{statusLabel(t,c.status)}</span>{c.grade?<span className="grade">{t('card.grade')} <b>{c.grade}</b></span>:null}</div>
 <div className="car-info"><div className="car-head"><img loading="lazy" decoding="async" width="64" height="40" src={LOGO(c.make)} alt="" onError={logoOnError}/><div className="car-head-txt"><span className="make">{c.make}</span><h3>{c.model}</h3></div></div><div className="specs"><span><CalendarDays/> {c.year}</span><span><Gauge/> {c.km} km</span><span><Fuel/> {c.fuel}</span>{c.tr?<span><ArrowLeftRight/> {c.tr}</span>:null}</div><div className="car-bottom"><div><small>{t('card.priceFrom')}</small><VehiclePriceDisplay car={c} discounts={discounts}/></div></div>
 {cif&&cifDest&&<div className="card-cif"><Ship/><span><small>CIF {cifDest.split(' / ')[0]} · ETA ±{cif.days} days</small><b>≈ {fmt(cif.cif)}</b></span><em>excl. import duty</em></div>}
 <div className="card-actions">
  <button type="button" className="card-wa" aria-label={'WhatsApp us about the '+carLabel} onClick={e=>{e.preventDefault();e.stopPropagation();window.open(waLink(s.whatsapp_number,waMsg),'_blank','noopener')}}><WhatsAppIcon size={14}/> WhatsApp</button>
  {/* WCAG 2.5.3: the aria-label must START with the visible text ("Make
      offer" / "Compare" / "Added") so voice-control users can say what they
      see; the vehicle name follows for screen-reader context. */}
  {onOffer&&<button type="button" className="card-offer" aria-label={'Make offer on the '+carLabel} onClick={e=>{e.preventDefault();e.stopPropagation();onOffer(c)}}><BadgePercent/> Make offer</button>}
  {onCmp&&<button type="button" className={"cmp-chip "+(comp?'on':'')} aria-pressed={!!comp} aria-label={comp?('Added — remove '+(c.make||'')+' '+(c.model||'')+' from the comparison'):('Compare '+(c.make||'')+' '+(c.model||''))} onClick={e=>{e.preventDefault();e.stopPropagation();onCmp(c)}}><ArrowLeftRight/>{comp?<><Check/> Added</>:'Compare'}</button>}
 </div>
 <div className="loc"><MapPin/> {c.location}, Japan</div></div>
 </a>}

// Internal links into live stock. The guide, brand and news pages used to end
// at a "talk to our team" modal with no route through to an actual car, which
// left whole sections of the site with no link to the inventory detail pages a
// crawler has to reach. Every link below points at a car taken from the same
// `cars` array the /inventory grid renders, so the destination always exists
// — and if there is no stock at all the block renders nothing rather than a
// dead link.
// 2026-11-14 (owner: "suggest cars from Japan stock, not only the showroom"):
// the pool used to be taken in raw array order, and the showroom cars sit at
// the head of `cars` — so every 3-card strip was showroom-only. Now the two
// stock groups are interleaved (showroom, Japan, showroom, Japan…) so Japan
// auction/dealer stock always gets seats, and `fill` tops a thin match list
// up to `limit` with further Japan-stock cars instead of rendering short.
export function RelatedStock({navigate,pick,limit=3,kicker,note,fill=false}){
 const {t}=useLang();
 const all=Array.isArray(pick)?pick:(typeof pick==='function'?cars.filter(pick):cars);
 const pool=all.filter(c=>c&&carRef(c));
 const sr=pool.filter(isShowroomCar),jp=pool.filter(c=>!isShowroomCar(c));
 const shown=[];
 for(let i=0;shown.length<limit&&(i<sr.length||i<jp.length);i++){
  if(i<sr.length&&shown.length<limit)shown.push(sr[i]);
  if(i<jp.length&&shown.length<limit)shown.push(jp[i]);
 }
 if(fill&&shown.length<limit){
  const have=new Set(shown.map(c=>c.id));
  for(const c of [...cars.filter(c=>!isShowroomCar(c)),...cars]){
   if(shown.length>=limit)break;
   if(!c||!carRef(c)||have.has(c.id))continue;
   shown.push(c);have.add(c.id);
  }
 }
 if(!shown.length)return null;
 return <aside className="related-stock">
  <div className="kicker">{kicker||t('rel.stockNow')}</div>
  {note&&<p className="related-stock-note">{note}</p>}
  <div className="related-stock-grid">{shown.map(c=><PageLink key={c.id} className="related-stock-card" to={'/inventory/'+encodeURIComponent(carRef(c))} navigate={navigate}>
   <img loading="lazy" decoding="async" width="820" height="550" src={c.image||'/assets/ar7-mark-460.webp'} alt={carAlt(c)}/>
   <b>{c.make} {c.model}</b><small>{c.year?`${c.year} · `:''}{carRef(c)}</small>
  </PageLink>)}</div>
  <PageLink className="outline-btn" to="inventory" navigate={navigate}>{t('rel.browseAll')} <ArrowRight/></PageLink>
 </aside>;
}

// The cars a piece of copy actually names. Matching the article's own words
// keeps the link genuinely relevant, needs no extra field to keep in sync, and
// works for database-sourced articles as well as the demo set.
// Turn a guide's "popular models" line ('Harrier · Prado · Note') into a
// matcher over the live stock — first word of each model, met in model OR make.
export function modelPick(models){
 const keys=String(models||'').toLowerCase().split('\u00b7').map(x=>x.trim().split(' ')[0]).filter(k=>k.length>2);
 if(!keys.length)return null;
 return c=>keys.some(k=>String(c.model||'').toLowerCase().includes(k)||String(c.make||'').toLowerCase().includes(k));
}


// Internal links from the guides into the machinery catalogue — the machinery
// type pages used to be reachable only from the nav and the home teaser, so
// the blog never passed them any link equity. Machines the article actually
// names come first (a RoRo guide that mentions a tipper links to trucks); the
// rest is filled one-per-type so every article carries real machinery links.
export function RelatedMachines({navigate,pick,limit=3,kicker,note}){
 const {t}=useLang();
 const all=Array.isArray(pick)?pick:MACHINES;
 const shown=all.filter(m=>m&&!m.photosPending&&machineImages(m).length).slice(0,limit);
 if(!shown.length)return null;
 return <aside className="related-stock related-machines">
  <div className="kicker">{kicker||t('rel.machKicker')}</div>
  {note&&<p className="related-stock-note">{note}</p>}
  <div className="related-stock-grid">{shown.map(m=><PageLink key={m.id} className="related-stock-card" to={machineHref(m)} navigate={navigate}>
   <img loading="lazy" decoding="async" width="820" height="550" src={machineImages(m)[0]} alt={`${m.name} for export from China`}/>
   <b>{m.name}</b><small>{machineYearText(m)} · ${listPriceUSD(m).toLocaleString('en-US')} FOB · {m.type}</small>
  </PageLink>)}</div>
  <PageLink className="outline-btn" to="/machinery" navigate={navigate}>{t('rel.browseAllMach')} <ArrowRight/></PageLink>
 </aside>;
}

// The hero slide rotates a sample of the WHOLE live stock: cars from the
// showroom and Japan inventory, and the machines on the China desk. Cars are
// spaced evenly across the list so the sample covers every part of it rather
// than the first few rows; one machine per type is woven in after every second
// car, so the hero shows the full scope of what AR7 sells — a car wall was the
// reason the machinery desk went unnoticed from the home page.
const heroSlides=(fmtPrice)=>{
 const pool=cars.filter(Boolean);
 // 2026-11-16 (owner: "add more showroom cars in those slides"): the staged
 // showroom flagships (Ferrari, Lamborghini, McLaren, Bentley…) are the best
 // photography the site owns, but even spacing across the whole pool surfaced
 // only one or two of them. Now every flagship with a showroom scene leads
 // the car list (up to 8, spaced across the flagship set), and the evenly
 // spaced sample of regular stock follows — same weave, bigger show.
 const isShowroom=x=>String(x.image||'').includes('/assets/showroom/');
 const flags=pool.filter(isShowroom);
 const rest=pool.filter(x=>!isShowroom(x));
 const pickSpread=(list,n)=>{
  const out=[];const step=list.length/Math.max(n,1);
  for(let i=0;i<n;i++){const x=list[Math.floor(i*step)];if(x)out.push(x);}
  return out;
 };
 // 2026-11-17 (owner): the opening tableau is fixed — Ferrari 296 in the
 // CENTRE, McLaren 720S peeking in on the right, Lamborghini Huracán on the
 // left. slides[0] is the centre card, slides[1] its right neighbour, and the
 // LAST slide wraps around to sit on the left — so the Lamborghini is pushed
 // to the very end of the rotation below.
 const findFlag=sig=>flags.find(x=>(x.make+' '+x.model).toLowerCase().includes(sig));
 const ferrari=findFlag('296')||findFlag('ferrari');
 const mclaren=findFlag('mclaren');
 const lambo=findFlag('lamborghini');
 const lead=[ferrari,mclaren].filter(Boolean);
 const mids=flags.filter(x=>!lead.includes(x)&&x!==lambo);
 const flagsOrdered=[...lead,...pickSpread(mids,Math.min(Math.max(8-lead.length-(lambo?1:0),0),mids.length))];
 const chosen=[...flagsOrdered,...pickSpread(rest,Math.min(6,rest.length))];
 const toSlide=x=>{
  const ref=carRef(x);
  return {kind:'car',id:'c'+ref,image:x.image,alt:carAlt(x),href:hrefFor('inventory',ref),
   tag:(x.status||'In stock').toUpperCase(),title:x.make+' '+x.model,
   meta:[x.year, x.grade?`Grade ${x.grade}`:null, fmtPrice(x)].filter(Boolean).join(' · ')};
 };
 const carsOut=chosen.map(toSlide);
 // One machine per type, and only a machine that actually has a photograph —
 // the hero must never show the "photos on request" panel.
 const machinesOut=[];
 for(const t of MACHINE_TYPES){
  const m=MACHINES.find(x=>x.type===t&&!x.photosPending&&machineImages(x).length);
  if(!m)continue;
  machinesOut.push({kind:'machine',id:'m'+m.id,image:machineImages(m)[0],
   alt:`${m.name} machinery from China`,
   href:'/machinery',tag:'MACHINERY · CHINA',title:m.name,
   // 2026-10-08: a hydrated machine may state no year and no hour meter (the
   // importer stores null rather than inventing either), so the meta line is
   // built from the parts that exist — `null.toLocaleString()` is a crash and
   // "null · 0 h" would be a lie on the hero of all places.
   meta:[machineYearText(m, ''), machineHours(m) != null ? `${machineHours(m).toLocaleString('en-US')} h` : 'Hours on request',
     `$${listPriceUSD(m).toLocaleString('en-US')} FOB`].filter(Boolean).join(' · ')});
 }
 // Weave: two cars, then a machine.
 const woven=[];
 for(let ci=0,mi=0;ci<carsOut.length||mi<machinesOut.length;){
  for(let k=0;k<2&&ci<carsOut.length;k++)woven.push(carsOut[ci++]);
  if(mi<machinesOut.length)woven.push(machinesOut[mi++]);
 }
 // The Lamborghini goes LAST so it wraps around to the centre card's left on
 // first paint (owner tableau, see above).
 if(lambo)woven.push(toSlide(lambo));
 return woven;
};
// Illustrative calendar of the auction houses AR7 bids at and the shipping
// lanes it books. The venues, ports and transit times are the real ones; the
// live-looking countdown and progress are decorative, so both cards carry a
// visible "demo" tag (see scripts/pages-render.test.jsx).
const heroAuctions=[
 {name:'USS Tokyo',city:'Tokyo',seconds:2*3600+14*60+38},
 {name:'JU Aichi',city:'Nagoya',seconds:5*3600+48*60+12},
 {name:'TAA Kinki',city:'Osaka',seconds:8*3600+32*60+44},
 {name:'CAA Chubu',city:'Gifu',seconds:12*3600+5*60+27},
 {name:'HAA Kobe',city:'Kobe',seconds:20*3600+18*60+9},
 {name:'USS Nagoya',city:'Nagoya',seconds:26*3600+42*60+51},
 {name:'TAA Yokohama',city:'Yokohama',seconds:31*3600+9*60+33},
 {name:'IAA Osaka',city:'Osaka',seconds:38*3600+27*60+16},
 {name:'ZIP Osaka',city:'Osaka',seconds:45*3600+53*60+2},
 {name:'NAA Narita',city:'Narita',seconds:52*3600+11*60+45}
];
const heroRoutes=[
 {from:'Yokohama',to:'Karachi',progress:64,eta:'16 days',status:'Vessel departed'},
 {from:'Kobe',to:'Jebel Ali',progress:47,eta:'18 days',status:'Crossing East China Sea'},
 {from:'Shanghai',to:'Karachi',progress:58,eta:'12 days',status:'LHD cars · South China Sea'},
 {from:'Qingdao',to:'Mombasa',progress:27,eta:'22 days',status:'Machinery · Departed China'},
 {from:'Nagoya',to:'Mombasa',progress:31,eta:'24 days',status:'Departed Japan'},
 {from:'Tokyo',to:'Southampton',progress:78,eta:'9 days',status:'Entering Mediterranean'},
 {from:'Osaka',to:'Auckland',progress:55,eta:'13 days',status:'Pacific passage'},
 {from:'Yokohama',to:'Port Qasim',progress:22,eta:'19 days',status:'Loading at berth'},
 {from:'Kobe',to:'Durban',progress:41,eta:'27 days',status:'Indian Ocean crossing'},
 {from:'Nagoya',to:'Colombo',progress:69,eta:'11 days',status:'Approaching Colombo'},
 {from:'Tokyo',to:'Dar es Salaam',progress:36,eta:'26 days',status:'East of Singapore'},
 {from:'Osaka',to:'Felixstowe',progress:52,eta:'21 days',status:'Passing Suez'}
];
const formatCountdown=seconds=>{const s=Math.max(0,Math.floor(seconds));const d=Math.floor(s/86400),h=Math.floor(s%86400/3600),m=Math.floor(s%3600/60),x=s%60;return (d?d+'d ':'')+[h,m,x].map(n=>String(n).padStart(2,'0')).join(':')};

// 2026-11-09 (owner request, round 3): the shipping-lane strip and the
// next-auction chip leave the full-bleed stage and dock as compact chips
// directly under the hero search console — "merge it with the search
// console area… use less space". Self-contained: own pause-aware clock, so
// HeroVisual no longer carries auction/route state it does not render.
function HeroFactsRow(){
 const wrap=useRef(null);
 const countdownRef=useRef(null);
 const auctionEnds=useRef(heroAuctions.map(a=>Date.now()+a.seconds*1000));
 const secRef=useRef(0);
 const [routeIdx,setRouteIdx]=useState(0);
 const [auctionIdx,setAuctionIdx]=useState(0);
 useEffect(()=>{
  const el=wrap.current,query=window.matchMedia('(prefers-reduced-motion: reduce)');let timer;
  const tick=()=>{
   if(!el||query.matches||document.hidden||el.matches(':hover,:focus-within'))return;
   const s=++secRef.current;
   const nextR=Math.floor(s/5.6)%heroRoutes.length;
   const nextA=Math.floor(s/4.6)%heroAuctions.length;
   setRouteIdx(v=>v===nextR?v:nextR);
   setAuctionIdx(v=>v===nextA?v:nextA);
   if(countdownRef.current){
    const rem=(auctionEnds.current[nextA]-Date.now())/1000;
    const txt=formatCountdown(rem);
    if(countdownRef.current.textContent!==txt)countdownRef.current.textContent=txt;
   }
  };
  const io=new IntersectionObserver(([entry])=>entry.isIntersecting?timer=setInterval(tick,1000):clearInterval(timer));
  io.observe(el);
  return()=>{clearInterval(timer);io.disconnect()}
 },[]);
 const auction=heroAuctions[auctionIdx];
 const route=heroRoutes[routeIdx];
 const remaining=(auctionEnds.current[auctionIdx]-Date.now())/1000;
 return <div className="hero-facts" ref={wrap}>
  <div className="route-strip"><div className="rotating-card-copy" key={routeIdx}>
   <span className="facts-head"><Globe2/><span className="card-kicker">Shipping lane · {routeIdx+1}/{heroRoutes.length}</span></span>
   <b className="card-title route-lane">{route.from}<ArrowRight className="lane-arrow"/>{route.to}</b>
   <span className="progress" style={{'--route-progress':route.progress+'%'}}><span/><Ship className="route-ship"/></span>
   <small className="card-meta route-status">{route.status}</small>
   <i className="lane-eta"><Clock3/> ETA {route.eta}</i>
  </div></div>
  <div className="auction-chip"><div className="rotating-card-copy" key={auctionIdx}>
   <span className="facts-head"><i className="card-live"/><span className="card-kicker">Next auction · {auction.city}</span></span>
   <b className="card-title">{auction.name}</b>
   <small className="card-meta card-countdown"><Clock3/><span ref={countdownRef}>{formatCountdown(remaining)}</span></small>
  </div></div>
 </div>}

function HeroVisual({navigate,discounts,topBar,bottomBar}){
 const wrap=useRef(null);
 const price=useCarPrice(discounts);
 const [manualIdx,setManualIdx]=useState(0);
 const [autoIdx,setAutoIdx]=useState(0);
 useEffect(()=>{
  const el=wrap.current,query=window.matchMedia('(prefers-reduced-motion: reduce)');let timer;
  const tick=()=>{if(el&&!query.matches&&!document.hidden&&!el.matches(':hover,:focus-within'))setAutoIdx(v=>v+1)};
  const io=new IntersectionObserver(([entry])=>entry.isIntersecting?timer=setInterval(tick,3200):clearInterval(timer));
  io.observe(el);
  return()=>{clearInterval(timer);io.disconnect()}
 },[]);
 const slides=heroSlides(price);
 const moveSlide=delta=>setManualIdx(v=>(v+delta+slides.length)%slides.length);
 const activeIndex=(manualIdx+autoIdx)%slides.length;
 const c=slides[activeIndex]||slides[0];
 // 2026-11-08 (owner request): the flat cross-fade photo card is retired — the
 // home hero now runs the same 3D showroom stage as the inventory hero, which
 // the owner judged "more modern and premium". Slides keep real hrefs: the
 // CENTRE card is a true link to its vehicle/machinery page, side cards rotate
 // themselves to centre first. Drag/swipe matches InvShowcase, and a real drag
 // must never fire the slide's click underneath it.
 const total=slides.length;
 const jumpTo=i=>moveSlide(((i-activeIndex)%total+total)%total);
 const dragRef=useRef(null),swipedRef=useRef(false);
 const dragDown=e=>{if(e.pointerType==='mouse'&&e.button!==0)return;if(e.target.closest('.car-dots,.car-counter'))return;dragRef.current={x:e.clientX}};
 const dragUp=e=>{const d=dragRef.current;dragRef.current=null;if(!d)return;const dx=e.clientX-d.x;if(Math.abs(dx)>40){swipedRef.current=true;moveSlide(dx<0?1:-1)}};
 const dragClick=e=>{if(swipedRef.current){swipedRef.current=false;e.preventDefault();e.stopPropagation()}};
 if(!c)return null;
 return <div className="hero-visual" ref={wrap}>
   {/* The rotating card is a link preview, not a document section, but it does show
       real headings for each vehicle — so the hero gets its own screen-reader heading
       and the heading order stays h1 → h2 → h3 for anyone navigating by headings. */}
   <h2 className="sr-only">Japan &amp; China cars, heavy machinery</h2>
  {/* 2026-11-10 hero v3: slim search console at the top of the stage. */}
  {topBar?<div className="stage-top">{topBar}</div>:null}
  <div className={'hero-card car-main hero-stage'+(c.kind==='machine'?' is-machine':'')}
   onPointerDown={dragDown} onPointerUp={dragUp} onPointerCancel={()=>{dragRef.current=null}} onClickCapture={dragClick}>
   {slides.map((x,i)=>{
     let off=(i-activeIndex+total)%total;if(off>total/2)off-=total;
     const a=Math.abs(off);
     // 2026-11-07 PageSpeed carried over: local showroom shots keep their 760w
     // srcset variant. Far slides (a>2) mount as empty dark cards — they are
     // invisible (opacity 0) and mounting all 11 photographs at once would
     // wreck the hero's LCP; each slide loads one rotation step before it can
     // become visible. Fit rules (2026-11-08, owner round 2): CAR slides crop
     // with the window biased below centre so the selling dealer's signage
     // above the car is cut away; MACHINE slides keep blur-fill contain so a
     // tall machine is never cropped. See .hero-slide/.is-machine CSS.
     const responsive=showroomSrcSet(x.image);
     return <a key={x.id} href={x.href}
      className={'hero-slide'+(off===0?' active':'')+(x.kind==='machine'?' is-machine':'')}
      style={{transform:`translateX(${off*56}%) scale(${Math.max(1-a*.14,.5)})`,opacity:a>1?0:1-a*.22,zIndex:10-a,'--slide-dim':a?Math.min(a*.35,.55):0,pointerEvents:a>1?'none':'auto',transition:a>1?'none':undefined}}
      tabIndex={a>1?-1:0} aria-hidden={a>1||undefined}
      onClick={e=>{if(off!==0){e.preventDefault();jumpTo(i)}else linkClick(x.href,navigate)(e)}}>
      {/* No aria-label (WCAG 2.5.3): the visible caption + image alt name
          this slide; an aria-label that differs breaks voice control. */}
      {/* The blurred backdrop never needs the 1268w file (blur(22px) erases
          the detail) — and on phones the 760w variant is the SAME file the
          <img> srcset picks, so the two paint from one preloaded fetch
          instead of double-downloading (2026-11-10: PageSpeed's LCP element
          was this span, undiscovered because it pulled the full-size URL the
          preload never requested). */}
      {/* 2026-11-13: cars render WITHOUT the blurred backdrop — their cover-fit
          img hides every pixel of it, yet its blur(22px) stopped the compositor
          from GPU-animating the slide (LH "non-composited animations"). Only
          contain-fit machine slides, where the backdrop is visible, keep it —
          and local machinery photos use the build-time .blurbg.webp variant
          (scripts/blur-backdrops.mjs) so no live filter remains in the hero;
          the CSS blur survives purely as the fallback for non-local images. */}
      {a<=2&&x.kind==='machine'&&(()=>{const pre=/^\/assets\/machinery\/.+\.webp$/.test(x.image||'');return <span className={'hero-slide-bg'+(pre?' preblur':'')} style={{backgroundImage:`url("${pre?x.image.replace(/\.webp$/,'.blurbg.webp'):x.image}")`}} aria-hidden="true"/>})()}
      {a<=2&&<img src={x.image} width="820" height="550"
        srcSet={responsive} sizes={responsive ? SHOWROOM_HERO_SIZES : undefined}
        alt={x.alt} loading={a<=1?'eager':'lazy'} fetchPriority={off===0?'high':'low'} decoding="async"/>}
      <span className="hero-slide-cap"><span className="hero-slide-tag">{x.tag}</span><b>{x.title}</b><small>{x.meta}</small></span>
     </a>;
   })}
   <div className="car-dots">{slides.map((x,i)=><i key={x.id} className={(x.kind==='machine'?'machine ':'')+(i===activeIndex?'active':'')} onClick={()=>jumpTo(i)} role="button" tabIndex={-1} aria-label={'Show slide '+(i+1)}/>)}</div>
   {/* 2026-11-19 (owner, phone cleanup): the pill's "· rotating stock" tail
       is wrapped so phones can keep just the compact "4/18" (CSS hides the
       tail ≤560px — the photo stays uncovered). */}
   <div className="car-counter">{c.kind==='machine'?<Wrench/>:<CarFront/>} <span className="car-counter-num">{activeIndex+1}/{total}</span><span className="car-counter-tail"> · {c.kind==='machine'?'China machinery desk':'rotating stock'}</span></div>
  </div>
  <div className="hero-carousel-controls">
   <button type="button" onClick={()=>moveSlide(-1)} aria-label="Prev"><ChevronLeft/></button>
   <button type="button" onClick={()=>moveSlide(1)} aria-label="Next"><ChevronRight/></button>
  </div>
  {/* 2026-11-19 (owner: the phone photo was "very much covered"): on phones
      the caption leaves the photograph entirely and renders HERE, as its own
      row on the deep-green band right under the slides. Desktop keeps the
      in-photo caption; CSS shows exactly one of the two per tier. */}
  <a className="stage-cap" href={c.href} onClick={e=>linkClick(c.href,navigate)(e)} aria-hidden="true" tabIndex={-1}>
   <span className="hero-slide-tag">{c.tag}</span>
   <b>{c.title}</b>
   <small>{c.meta}</small>
  </a>
  {/* 2026-11-10 hero v3 (owner direction): ONE horizontal band under the
      slideshow — the CTA buttons ride alongside the shipping-lane strip and
      the next-auction chip. Everything stays in normal flow; nothing is
      ever layered on the photographs. */}
  {bottomBar?<div className="stage-foot">{bottomBar}</div>:null}
 </div>}

// 2026-11-10 (owner request: "redesign the globes — completely free rotation,
// smoother, countries accurate and in the right place"): the orb globes now
// share the TRUE orthographic 3D engine in src/globe3d.js. It is imported
// dynamically so the engine + Natural Earth geometry live in a lazy chunk and
// never weigh on first load; until it lands the styled sphere shell renders
// on its own. Drags freely on both axes, taps still open the world page.
export function InteractiveGlobe({compact,lite,cls,onTap}){
 const ref=useRef(null);
 const {t}=useLang();
 useEffect(()=>{
  let alive=true,cleanup=null,idle=0,io=null;
  // 2026-11-08 Lighthouse round: the engine chunk (globe3d + Natural Earth
  // geometry) used to be imported the moment this component mounted — on the
  // home page that evaluated ~10s of CPU (throttled trace) during first load
  // for a globe the visitor hadn't even scrolled to. Now the import waits
  // until the host is within 320px of the viewport, and then for an idle
  // slot, so hydration and the LCP never compete with it. The styled shell
  // (sphere, orbits, halo) renders instantly either way.
  const start=()=>{
   const go=()=>{import('./globe3d.js').then(m=>{
    if(!alive||!ref.current)return;
    cleanup=m.mountGlobe(ref.current,mountOpts);
   }).catch(()=>{/* offline chunk load — the styled shell still shows */})};
   if(typeof requestIdleCallback==='function')idle=requestIdleCallback(go,{timeout:2500});
   else idle=setTimeout(go,300);
  };
  const el=ref.current;
  if(!el){return()=>{alive=false};}
  const mountOpts={
    night:false,
    borders:!lite,
    detail:lite?0:1,
    // 2026-11-16 Lighthouse round 2: decorative orbs (the nav orb mounts on
    // EVERY page, inside the viewport) paint one static frame and only start
    // spinning on the visitor's first gesture — a 60fps nav ornament was
    // ~12s of attributed main-thread work in a throttled trace. The engine
    // also frame-skips to idleFps while nobody interacts (see globe3d.js).
    sleep:!!lite,
    autoRotate:lite?0.07:0.055,
    markers:false,
    // 2026-11-11 upgrades: the showcase globe gets clouds, sun-side lighting,
    // country hover tooltips and zoom; the mini orbs (lite) stay featherweight
    clouds:!lite,
    names:!lite,
    zoom:!lite,
    // a touch of motion on the showcase globe: three sample export lanes
    routes:lite?[]:[{lon:55.2,lat:25},{lon:39.7,lat:-4},{lon:-1.4,lat:50.9}]
  };
  if(typeof IntersectionObserver!=='function'){start();}
  else{
   io=new IntersectionObserver(entries=>{
    if(entries.some(e=>e.isIntersecting)){io.disconnect();io=null;start();}
   },{rootMargin:'320px 0px'});
   io.observe(el);
  }
  return()=>{
   alive=false;
   if(io)io.disconnect();
   if(idle){if(typeof cancelIdleCallback==='function')cancelIdleCallback(idle);else clearTimeout(idle);}
   if(cleanup)cleanup();
  };
 },[lite]);
 return <div className={'iglobe'+(compact?' compact':'')+(lite?' lite':'')+(cls?' '+cls:'')} ref={ref}
   onClick={onTap?()=>onTap():undefined}>
  <div className="iglobe-halo"/><div className="iglobe-sphere">
   <div className="iglobe-face"><canvas className="g3-canvas" aria-hidden="true"/><i className="iglobe-shine"/></div>
   <i className="iglobe-sheen"/>
  </div>
  <div className="orbit-ring o1"><span className="orbiter"><i className="orb-badge ship"><Ship/></i></span></div>
  <div className="orbit-ring o2"><span className="orbiter"><i className="orb-badge car"><CarFront/></i></span></div>
  <div className="orbit-ring o3"><span className="orbiter"><i className="orb-badge car alt"><CarFront/></i></span></div>
  {!lite&&<span className="iglobe-plane"><Plane/></span>}
  <span className="drag-hint"><i/> {t('world.dragSmall')}</span>
 </div>}

function MotionShowcase({navigate}){const {t}=useLang();return <section className="motion-showcase"><div className="shell motion-grid"><div className="motion-copy"><div className="kicker">{t('home.motionKicker')}</div><h2>{t('home.motionH2a')}<br/><em>{t('home.motionH2b')}</em></h2><p>{t('home.motionBody')}</p><div className="motion-metrics"><span><b>Major</b> {t('home.motionAuctions')}</span><span><b>RoRo +</b> {t('home.motionShipping')}</span><span><b>1</b> {t('home.motionTeam')}</span></div><div className="globe-legend"><span><i className="lg car"/> {t('home.legendRoute')}</span><span><i className="lg ship"/> {t('home.legendVessel')}</span><span><i className="lg pin"/> {t('home.legendPorts')}</span></div></div><div className="globe-scene"><div className="globe-wrap"><InteractiveGlobe onTap={()=>navigate('world')}/><div className="float-label japan"><small>{t('home.originLabel')}</small><b>Yokohama, Japan</b></div><div className="float-label shipment"><small>{t('home.sampleShipment')}</small><b>AR7-260184</b></div></div></div></div><div className="vehicle-track"><div className="track-streaks"/><div className="road-lines"/><div className="moving-plane"><Plane/></div><div className="moving-car convoy"><CarFront/></div><div className="moving-car"><CarFront/><span>{t('home.trackWon')}</span></div><div className="moving-ship"><Ship/><span>{t('home.trackBooked')}</span></div><p>USS TOKYO <i/> INSPECTION YARD <i/> YOKOHAMA PORT <i/> WORLDWIDE</p></div></section>}


function readRoute(loc=typeof location==='undefined'?{}:location,opts){
 const route=parseRoute(loc,opts);
 // The former standalone /seo URL must pass through the CRM's staff login.
 // The desk is now only a CRM tab; no public route can mount it unauthenticated.
 return route.page==='seo'?{...route,page:'crm'}:route;
}

// Video walkarounds (2026-11-18). Exported here so src/inner-page.jsx and the
// tests share the URL parser without pulling all of InnerPage into entry JS.
export function youtubeId(url){
 const m=String(url||'').trim().match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:[^#\s]*&)?v=|shorts\/|embed\/|live\/))([A-Za-z0-9_-]{11})(?:[?&#]|$)/);
 return m?m[1]:null;
}

const WORLD_CLOCKS=[
 {code:'JP',country:'Japan',city:'Tokyo',zone:'Asia/Tokyo'},
 {code:'PK',country:'Pakistan',city:'Karachi',zone:'Asia/Karachi'},
 {code:'AE',country:'UAE',city:'Dubai',zone:'Asia/Dubai'},
 {code:'GB',country:'United Kingdom',city:'London',zone:'Europe/London'},
 {code:'KE',country:'Kenya',city:'Nairobi',zone:'Africa/Nairobi'},
 {code:'US',country:'USA',city:'New York',zone:'America/New_York'},
 {code:'US',country:'USA',city:'Los Angeles',zone:'America/Los_Angeles'},
 {code:'AU',country:'Australia',city:'Sydney',zone:'Australia/Sydney'},
 {code:'NZ',country:'New Zealand',city:'Auckland',zone:'Pacific/Auckland'}
].map(x=>({...x,formatter:new Intl.DateTimeFormat('en-GB',{timeZone:x.zone,hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false,timeZoneName:'short'})}));

// The device studio embeds the site in an iframe. Browsers happily reuse a
// cached copy of that document, which is how the studio once showed a header
// three edits old. In dev every load gets a fresh stamp; in a build the build
// id does the job, and vite.preview serves HTML with no-store.
export const BUILD_STAMP=(()=>{
 try{ if(import.meta.env?.DEV) return '&b='+Date.now(); }catch{ }
 // In a build the entry bundle name carries a content hash that changes on
 // every build — use it. (The meta build-id is a fixed release label, so a
 // cached iframe document survived builds and the studio showed an old page.)
 try{
  const srcs=[...document.querySelectorAll('script[src]')].map(s=>s.getAttribute('src')||'');
  const hit=srcs.map(s=>s.match(/(?:^|\/)assets\/index-([\w-]+)\.js/)).find(Boolean);
  if(hit) return '&b='+hit[1];
 }catch{ }
 try{ const id=document.querySelector('meta[name="build-id"]')?.content||''; return id?'&b='+encodeURIComponent(id):''; }catch{ }
 return '';
})();

function DeferredBigGlobe({navigate,compact}){
 const host=useRef(null);
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  const el=host.current;
  if(!el)return;
  if(typeof IntersectionObserver!=='function'){setReady(true);return;}
  const io=new IntersectionObserver(entries=>{
   if(entries.some(e=>e.isIntersecting)){
    setReady(true);
    io.disconnect();
   }
  },{rootMargin:'280px 0px'});
  io.observe(el);
  return()=>io.disconnect();
 },[]);
 return <div ref={host} className="globe-lazy world-globe-deferred">
  {ready&&<React.Suspense fallback={<div className="globe-lazy" aria-hidden="true"/>}><BigGlobe navigate={navigate} compact={compact}/></React.Suspense>}
 </div>;
}

// Same deferred-mount pattern as DeferredBigGlobe: the quick-quote wizard
// chunk only downloads once the visitor scrolls within 280px of the section.
function DeferredQuickQuote({navigate,cars}){
 const host=useRef(null);
 const [ready,setReady]=useState(false);
 useEffect(()=>{
  const el=host.current;
  if(!el)return;
  if(typeof IntersectionObserver!=='function'){setReady(true);return;}
  const io=new IntersectionObserver(entries=>{
   if(entries.some(e=>e.isIntersecting)){
    setReady(true);
    io.disconnect();
   }
  },{rootMargin:'280px 0px'});
  io.observe(el);
  return()=>io.disconnect();
 },[]);
 return <div ref={host} className="qq-lazy">
  {ready&&<React.Suspense fallback={<div className="qq-lazy" aria-hidden="true"/>}><QuickQuote navigate={navigate} cars={cars}/></React.Suspense>}
 </div>;
}

const worldClockTime=(c,now)=>c.formatter.formatToParts(now).filter(p=>['hour','minute','second','literal'].includes(p.type)).map(p=>p.value).join('');
function WorldTimeRibbon(){
 // 2026-11-13 (perf round): this ribbon used to rebuild all 18 React items
 // every second. Lighthouse attributed the page's recurring layout shifts —
 // the CLS that also fails the Agentic Browsing audit — plus a slice of
 // main-thread work and forced reflow to that tick. The structure now
 // renders exactly once; the interval writes each clock's text straight
 // into its <strong> node. With tabular-nums and the fixed min-width in
 // .world-time-item>strong, a tick can never move a sibling again.
 const rootRef=useRef(null);
 useEffect(()=>{
  const cells=rootRef.current?Array.from(rootRef.current.querySelectorAll('strong[data-wt]')):[];
  const paint=()=>{const now=new Date();for(const el of cells){const c=WORLD_CLOCKS[+el.dataset.wt];if(!c)continue;const t=worldClockTime(c,now);if(el.textContent!==t)el.textContent=t}};
  let tick=0;
  const start=()=>{if(!tick&&!document.hidden){paint();tick=setInterval(paint,1000)}};
  const stop=()=>{if(tick){clearInterval(tick);tick=0}};
  const onVisibility=()=>document.hidden?stop():start();
  start();
  document.addEventListener('visibilitychange',onVisibility);
  return()=>{stop();document.removeEventListener('visibilitychange',onVisibility)};
 },[]);
 const track=React.useMemo(()=>{
  const now=new Date();
  const group=(copy,hidden=false)=><div className="world-time-group" aria-hidden={hidden||undefined} key={copy}>{WORLD_CLOCKS.map((c,i)=>{const zone=c.formatter.formatToParts(now).find(p=>p.type==='timeZoneName')?.value||'';return <span className="world-time-item" key={copy+c.city}><span className="world-time-flag"><Flag c={c.country} w={18} h={12}/></span><i>{c.code}</i><b>{c.city}</b><strong data-wt={i}>{worldClockTime(c,now)}</strong><small>{zone}</small></span>})}</div>;
  return <>{group('a')}{group('b',true)}</>;
 },[]);
 return <div className="world-time-ribbon" aria-label="Live international times" ref={rootRef}><div className="world-time-label"><Globe2/><span>WORLD TIME</span><i/></div><div className="world-time-viewport"><div className="world-time-track">{track}</div></div></div>
}

/* Cookie / storage notice. The site sets no advertising cookies (Vercel Web
   Analytics is cookieless), so this is an honest informational notice — not a
   consent wall — linking to the full key-by-key list on /cookies. It renders
   only after mount so prerendered HTML and the first paint never carry it. */
function CookieNotice({navigate}){
 const [show,setShow]=useState(false);
 useEffect(()=>{try{if(localStorage.getItem('ar7-consent-v1')!=='1')setShow(true)}catch{/* storage off: nothing to remember, keep quiet */}},[]);
 if(!show)return null;
 const dismiss=()=>{try{localStorage.setItem('ar7-consent-v1','1')}catch{}setShow(false);};
 return <div className="cookie-note" role="region" aria-label="Cookies and storage notice">
  <LockKeyhole aria-hidden="true"/>
  <p><b>No ad tracking here.</b> This site stores only functional preferences (language, currency, saved cars) on your device and uses cookieless analytics. <a href="/cookies" onClick={e=>{dismiss();linkClick('cookies',navigate)(e);}}>See the full list</a>.</p>
  <button type="button" className="primary compact" onClick={dismiss}>Got it</button>
 </div>;
}

export function App(){
 const [contentVersion,forceContent]=useReducer(x=>x+1,0);
 const settings=useSettings();
 // Redraw when the CRM's machines replace the built-in list, so the home
 // teaser and the machinery page show the live catalogue, not the fallback.
 useMachineryVersion();
 // `t` is used by the six screens a buyer meets first (hero, inventory toolbar,
 // enquiry form, contact block, footer and the machinery desk) so the page a
 // visitor lands on reads in their language, not only the machinery pages.
 const {t}=useLang();
 const {session:customerSession}=useCustomerSession();
 const signedIn=!!customerSession;
 // The on-site assistant owns its own open/closed state; pages open it through
 // this ref (the vehicle page's "Chat Now"), so toggling it never re-renders App.
 const chatRef=useRef(null);
 // Chat mounts lazily: on the first idle moment for everyone, or immediately
 // when an "open chat" affordance is used before idle fires. The pending flag
 // bridges the gap between "user clicked" and "lazy chunk mounted".
 const [chatOn,setChatOn]=useState(false);
 const chatPendingRef=useRef(false);
 useEffect(()=>{
  const arm=()=>setChatOn(true);
  const t=setTimeout(arm,3000);
  const id=typeof requestIdleCallback==='function'?requestIdleCallback(arm,{timeout:5000}):null;
  return ()=>{clearTimeout(t);if(id!=null&&typeof cancelIdleCallback==='function')cancelIdleCallback(id)};
 },[]);
 const openChatNow=()=>{if(chatRef.current)chatRef.current.open();else{chatPendingRef.current=true;setChatOn(true)}};
 const chatRefCb=el=>{chatRef.current=el;if(el&&chatPendingRef.current){chatPendingRef.current=false;el.open()}};
 const [initialRoute]=useState(()=>readRoute(typeof location==='undefined'?{}:location,{restoreOnReload:isReload()}));
 // The machinery part of the route (/machinery/<type>/<REF>) has to be state,
 // like carId: reading it once at mount meant a click on a machine rewrote the
 // URL to /machinery and showed the catalogue instead of the machine.
 const [machineRoute,setMachineRoute]=useState({type:initialRoute.machineType||null,ref:initialRoute.machineRef||null});
 // The market in the URL (/destinations/kenya) is state for the same reason:
 // reading it once at mount meant a click on a market rewrote the address bar
 // to /destinations and showed the hub instead of the page that was asked for.
 const [destRoute,setDestRoute]=useState(initialRoute.destSlug||null);
 // ⌘K / Ctrl+K global search. The overlay itself is a lazy chunk; `/` also
 // opens it when the visitor is not typing in a field.
 const [searchOpen,setSearchOpen]=useState(false);
 useEffect(()=>{
  const onKey=e=>{
   if((e.ctrlKey||e.metaKey)&&String(e.key).toLowerCase()==='k'){e.preventDefault();setSearchOpen(v=>!v);return;}
   if(e.key==='/'&&!e.ctrlKey&&!e.metaKey&&!e.altKey){
    const t=e.target,tag=(t&&t.tagName||'').toLowerCase();
    if(tag!=='input'&&tag!=='textarea'&&tag!=='select'&&!(t&&t.isContentEditable)){e.preventDefault();setSearchOpen(true);}
   }
  };
  window.addEventListener('keydown',onKey);
  return()=>window.removeEventListener('keydown',onKey);
 },[]);
 // 2026-11-08 (owner request): a third public theme — "blue & gold" (deep
 // navy + champagne gold) — joins light and dark. The header button cycles
 // light → dark → blue; legacy localStorage values ('light'/'dark') read
 // unchanged, so nobody's saved preference is lost.
 const [theme,setTheme]=useState(()=>{try{const t=localStorage.getItem('ar7-theme');return t==='dark'||t==='blue'?'dark':'light'}catch{return 'light'}}), [menu,setMenu]=useState(false), [filter,setFilter]=useState('All'), [enquiry,setEnquiry]=useState(null), [favs,setFavs]=useState(()=>{try{return JSON.parse(localStorage.getItem('ar7-favs')||'[]')}catch{return []}}), [page,setPage]=useState(initialRoute.page), [vehicleId,setVehicleId]=useState(initialRoute.carId), [makeFilter,setMakeFilter]=useState(initialRoute.make), [modelFilter,setModelFilter]=useState(initialRoute.model);
 // 2026-11-19 (owner): the Blue & Gold theme is retired — two palettes only.
 // Legacy localStorage values 'blue'/'blue-day' map to dark/light on boot.
 const dark=theme==='dark';
 const cycleTheme=()=>setTheme(t=>t==='light'?'dark':'light');
 // 2026-11-09: landing hero layout — the owner chose option C (the full-bleed
 // inventory-style opening). Options A and B are kept as pure-CSS variants in
 // landing-v2.css so the layout can be flipped later without a rebuild:
 // open any page with ?hv=a or ?hv=b to preview them again.
 const hv=(()=>{try{const q=new URLSearchParams(window.location.search).get('hv');return q==='a'||q==='b'?q:'c'}catch{return 'c'}})();
 useEffect(()=>{ document.documentElement.dataset.theme=theme; try{localStorage.setItem('ar7-theme',theme)}catch{} },[theme]);
 // 2026-11-19 (owner: "the whole web on mobile looks tilted on one side"):
 // 100vw disagrees with the real layout width whenever a classic scrollbar
 // is shown, so the full-bleed hero band drifted sideways leaving a white
 // strip. Publish the TRUE layout width as --vpw and keep it fresh — the
 // ResizeObserver even catches the scrollbar appearing (no resize event).
 // Referral codes (2026-11-18): a share link looks like /?ref=AR7-7KQ2M.
 // Remember the code so the enquiry form pre-fills it — whichever page the
 // visitor eventually enquires from. Normalisation and validation live in
 // lead-validation.js; junk is simply not stored.
 useEffect(()=>{try{
  const ref=referralCodeFrom(new URLSearchParams(window.location.search).get('ref'));
  if(ref)localStorage.setItem('ar7-ref',ref);
 }catch{/* storage may be off */}},[]);
 // Perf (2026-11-18 Lighthouse: network dependency tree / image delivery):
 // open the TLS connection to whichever CDN hosts the live stock photos while
 // the first paint is still settling. The origin is DERIVED from the stock
 // data at runtime — the public shell and copy never name the source
 // (standing rule, pinned by the ui-audit index.html tests).
 useEffect(()=>{try{
  const seen=new Set();
  for(const c of cars){
   const src=c&&c.image;
   if(!src||!/^https:\/\//.test(src))continue;
   const origin=new URL(src).origin;
   if(seen.has(origin))continue;
   seen.add(origin);
   // 2026-11-11 PSI: dns-prefetch, not preconnect — the home hero paints
   // local /assets slides, so a full TLS socket to the stock CDN sat idle
   // and Lighthouse flagged it. Name resolution alone is nearly free.
   const l=document.createElement('link');l.rel='dns-prefetch';l.href=origin;document.head.appendChild(l);
   if(seen.size>=2)break;
  }
 }catch{/* hints only */}},[]);
 useEffect(()=>{
  const set=()=>document.documentElement.style.setProperty('--vpw',document.documentElement.clientWidth+'px');
  set();
  window.addEventListener('resize',set);
  let ro;
  if(typeof ResizeObserver!=='undefined'){ro=new ResizeObserver(set);ro.observe(document.documentElement);}
  return ()=>{window.removeEventListener('resize',set);if(ro)ro.disconnect();};
 },[]);
 useEffect(()=>{ try{localStorage.setItem('ar7-favs',JSON.stringify(favs))}catch{} },[favs]);
 // 2026-11-08: favourites follow the signed-in customer across devices.
 // Pull the server copy once per sign-in (and again when stock hydrates, so
 // refs can be mapped to live cars), merge it into the local hearts, then
 // push changes back debounced. Server refs that do not match any currently
 // listed car are preserved on write, so a favourite survives a re-import.
 const favSync=useRef({server:null});
 const [favTick,setFavTick]=useState(0);
 useEffect(()=>onContentChange(()=>setFavTick(t=>t+1)),[]);
 useEffect(()=>{
  if(!customerSession){favSync.current.server=null;return}
  let dead=false;
  fetch('/api/my-account?favourites=1',{headers:{Authorization:'Bearer '+customerSession.access_token}})
   .then(r=>r.ok?r.json():null)
   .then(j=>{
    if(dead||!j||!Array.isArray(j.refs))return;
    favSync.current.server=j.refs;
    const byRef=new Map(cars.map(c=>[carRef(c),c.id]));
    const ids=j.refs.map(r=>byRef.get(r)).filter(x=>x!=null);
    if(ids.length)setFavs(v=>{const merged=[...new Set([...v,...ids])];return merged.length===v.length?v:merged});
   }).catch(()=>{});
  return()=>{dead=true};
 },[customerSession,favTick]);
 useEffect(()=>{
  if(!customerSession||favSync.current.server===null)return;
  const t=setTimeout(()=>{
   const server=favSync.current.server||[];
   const byId=new Map(cars.map(c=>[c.id,carRef(c)]));
   const known=new Set(cars.map(c=>carRef(c)));
   const localRefs=favs.map(id=>byId.get(id)).filter(Boolean);
   const keep=server.filter(r=>!known.has(r));
   const refs=[...new Set([...localRefs,...keep])];
   if(refs.slice().sort().join()===server.slice().sort().join())return;
   fetch('/api/my-account?favourites=1',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer '+customerSession.access_token},body:JSON.stringify({refs})})
    .then(r=>r.ok?r.json():null)
    .then(j=>{if(j&&Array.isArray(j.refs))favSync.current.server=j.refs})
    .catch(()=>{});
  },800);
  return()=>clearTimeout(t);
 },[favs,customerSession,favTick]);
  const machineOnRoute = page === 'machinery' && machineRoute.ref ? machineByRef(machineRoute.ref) : null;
 const destOnRoute = page === 'destinations' && destRoute ? destinationBySlug(destRoute) : null;
  // One published discount setting feeds cards, detail pages and JSON-LD.
  const liveDiscounts = useStockDiscounts();
  const price = useCarPrice(liveDiscounts);
  const vehicleOnRoute = page === 'inventory' ? findCar(cars, vehicleId) : undefined;
  const vehicleDiscount = vehicleOnRoute ? stockDiscountFor(liveDiscounts, 'car', carRef(vehicleOnRoute)) : null;
  const machineDiscount = machineOnRoute ? stockDiscountFor(liveDiscounts, 'machine', machineOnRoute.ref) : null;
  const machineOfferPercent = machineDiscount?.percent || 0;
  useSeo(page, vehicleId, vehicleOnRoute,
    { vehicleMissing: page === 'inventory' && vehicleId != null && String(vehicleId) !== '' && !vehicleOnRoute && isContentHydrated(), make: makeFilter, model: modelFilter, destination: destOnRoute, destSlug: page === 'destinations' ? destRoute : null, machineType: machineRoute.type, machineRef: machineRoute.ref, machine: machineOnRoute, machineOfferPercent, machineOfferUntil: machineDiscount?.until || null, vehicleOfferPercent: vehicleDiscount?.percent || 0, vehicleOfferUntil: vehicleDiscount?.until || null, vehicleCount: makeFilter ? cars.filter(c => slugify(c.make) === slugify(makeFilter) && (!modelFilter || slugify(c.model) === slugify(modelFilter) || slugify(c.model).startsWith(slugify(modelFilter) + '-'))).length : cars.length });
  useEffect(()=>onContentChange(forceContent),[]);
  useEffect(()=>subscribePublishedNews(forceContent),[]);
  // /japan-stock is retired: the route already resolves to the inventory page
  // (routing.js PAGE_REDIRECTS) and vercel.json answers fresh loads with a 308.
  // Clean the address bar too, so a client-side landing never shows a URL that
  // disagrees with the canonical /inventory the page declares.
  useEffect(()=>{try{if(/^\/japan-stock\/?$/.test(location.pathname))history.replaceState(history.state,'','/inventory')}catch{}},[]);
 useEffect(()=>{
  let t=0,last=-1;
  const fn=()=>{
   if(t)return;
   t=requestAnimationFrame(()=>{
    t=0;
    const y=window.scrollY||0;
    if(y!==last){last=y;document.documentElement.style.setProperty('--scroll',y+'px');}
   });
  };
  window.addEventListener('scroll',fn,{passive:true});
  return()=>{window.removeEventListener('scroll',fn);if(t)cancelAnimationFrame(t)};
 },[]);
 useEffect(()=>{
  const apply=(opts={restoreOnReload:false})=>{const route=readRoute(typeof location==='undefined'?{}:location,opts);rememberVehicle(route.page==='inventory'?route.carId:null);setPage(route.page);setVehicleId(route.carId);setMakeFilter(route.make);setModelFilter(route.model);setMachineRoute({type:route.machineType||null,ref:route.machineRef||null});setDestRoute(route.destSlug||null);setMenu(false)};
  const route=readRoute(typeof location==='undefined'?{}:location,{restoreOnReload:isReload()});
  writeLocation(route.page,route.carId,{replace:true,make:route.make,model:route.model,machineType:route.machineType,machineRef:route.machineRef,destSlug:route.destSlug});
  setPage(route.page);setVehicleId(route.carId);setMakeFilter(route.make);setModelFilter(route.model);
  setMachineRoute({type:route.machineType||null,ref:route.machineRef||null});setDestRoute(route.destSlug||null);
  const onPop=()=>apply({restoreOnReload:false});
  const onHash=()=>{if(!location.hash)return;const next=readRoute(typeof location==='undefined'?{}:location,{restoreOnReload:false});writeLocation(next.page,next.carId,{replace:true,make:next.make,model:next.model,machineType:next.machineType,machineRef:next.machineRef,destSlug:next.destSlug});setPage(next.page);setVehicleId(next.carId);setMachineRoute({type:next.machineType||null,ref:next.machineRef||null});setDestRoute(next.destSlug||null);setMakeFilter(next.make);setModelFilter(next.model);setMenu(false)};
  addEventListener('popstate',onPop);
  addEventListener('hashchange',onHash);
  return()=>{removeEventListener('popstate',onPop);removeEventListener('hashchange',onHash)};
 },[]);
 // Home inventory is a running slide: six visible slots that keep advancing
 // through the whole filtered stock (paused on hover / reduced motion), so the
 // landing page shows far more of the inventory than one static screenful.
 const [homeOff,setHomeOff]=useState(0);
 const homeHover=useRef(false);
 const homeInventoryRef=useRef(null);
 const homeFiltered=(filter==='All'?cars:cars.filter(c=>c.status===filter)).filter(c=>c&&carRef(c));
 const HOME_N=6;
 const homeLen=homeFiltered.length;
 const shown=homeLen?Array.from({length:Math.min(HOME_N,homeLen)},(_,i)=>homeFiltered[(homeOff+i)%homeLen]):[];
 useEffect(()=>{
  const el=homeInventoryRef.current;
  if(page!=='home'||!el||typeof window==='undefined')return;
  if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  return observeVisibleCarousel(el,()=>{if(!document.hidden&&!homeHover.current&&!homeInventoryRef.current?.matches(':focus-within'))setHomeOff(v=>v+3)});
 },[page]);
 const homePages=Math.max(1,Math.ceil(homeLen/HOME_N));
 const homePage=homeLen?Math.floor((homeOff%homeLen)/HOME_N)%homePages:0;
 const {fmt}=useCurrency();
 const currentBrands=React.useMemo(()=>BRANDS(),[contentVersion]);
 const brandBudgets=React.useMemo(()=>currentBrands.slice(0,8).map(b=>{
  const bc=cars.filter(c=>c.make===b.name);
  const ps=bc.map(c=>carDiscountedUSD(c,liveDiscounts)).filter(v=>v>0);
  const ys=bc.map(c=>parseInt(c.year,10)||0).filter(Boolean);
  return {...b,lo:ps.length?Math.min(...ps):0,hi:ps.length?Math.max(...ps):0,
   y0:ys.length?Math.min(...ys):0,y1:ys.length?Math.max(...ys):0};
 }),[currentBrands,liveDiscounts,contentVersion]);
 const budgetBands=[['Under $15k','Kei cars, hatchbacks & first imports'],['$15k–$30k','Hybrids, family SUVs & sedans'],['$30k–$60k','Late-model premium & vans'],['$60k+','Luxury & super sport']];
 const navigate=(p,{scroll=true,replace=false}={})=>{
  const route=parseNavTarget(p);
  writeLocation(route.page,route.carId,{replace,make:route.make,model:route.model,machineType:route.machineType,machineRef:route.machineRef,destSlug:route.destSlug});
  setPage(route.page);setVehicleId(route.carId);setMakeFilter(route.make);setModelFilter(route.model);
  setMachineRoute({type:route.machineType||null,ref:route.machineRef||null});setDestRoute(route.destSlug||null);setMenu(false);
  if(scroll) scrollTo({top:0,behavior:'smooth'});
 };
 const openEnquiry=(context={})=>{const safe=context&&typeof context==='object'&&!('nativeEvent' in context)?context:{};setEnquiry({kind:'contact',...safe});};
 if(page==='crm')return <React.Suspense fallback={<div className="empty-state route-fallback"><Monitor/><h3>Loading the CRM…</h3><p>Fetching your workspace.</p></div>}><CrmApp/></React.Suspense>;
 if(page==='call')return <React.Suspense fallback={<div className="empty-state route-fallback"><h3>Opening the call room…</h3></div>}><WebCallPage room={vehicleId||''}/></React.Suspense>;
 return <div className="site">
  {/* 2026-11-08 audit: keyboard/screen-reader users get a skip link past the
      header + promo bar straight to the page content (WCAG 2.4.1). Plain
      anchor to the in-page #main landmark — no router involvement. */}
  <a className="skip-link" href="#main">Skip to content</a>
  <div className="grain"/><SiteHeader page={page} vehicleId={vehicleId} makeFilter={makeFilter} brands={currentBrands} vehicleCount={cars.length}
    menu={menu} setMenu={setMenu} dark={dark} setDark={cycleTheme} theme={theme} setTheme={setTheme} signedIn={signedIn} navigate={navigate} logoFor={LOGO}
    promo={<PromoBar navigate={navigate}/>} onOpenSearch={()=>setSearchOpen(true)}
    ribbon={<WorldTimeRibbon/>} orb={<InteractiveGlobe lite cls="mini" onTap={()=>navigate('world')}/>}/>

  <main id="main" className={'page page-' + page}>
   {page==='home'?<>
   <section className="hero shell" id="home" data-hv={hv}>
    <div className="hero-copy reveal">
      <div className="eyebrow"><span className="live-dot"/> {t('hero.eyebrow')}</div>
      <h1>{t('hero.h1a')}<br/><em>{t('hero.h1b')}</em></h1>
      <p>{t('hero.lead')} <b>{t('hero.leadEm')}</b>.</p>
      <FounderStat variant="hero" delay={900}/>
    </div>
    {/* 2026-11-10 hero v3 (owner direction): the search console moves to the
        TOP of the stage — a slim full-width bar just under the header, above
        the car slideshow, recoloured to sit on the deep-green band. The CTA
        row (real anchors — Ctrl/Cmd-click and crawlers still work) and the
        shipping-lane/auction chips share ONE horizontal band under the
        slideshow. hero-copy keeps only the headline story + founder proof.
        Quick search still hands over through sessionStorage; the inventory
        screen picks it up on mount, same as always. */}
    <HeroVisual navigate={navigate} discounts={liveDiscounts}
      topBar={
       <HeroSearch t={t} navigate={navigate}/>}
      bottomBar={<>
       <div className="hero-cta"><PageLink className="primary" to="inventory" navigate={navigate}>{t('hero.explore')} <ArrowRight/></PageLink><PageLink className="ghost-btn" to="machinery" navigate={navigate}>{t('hero.browseMachinery')} <Wrench/></PageLink><button className="text-btn" onClick={()=>setEnquiry({kind:'auction'})} type="button"><span><Play fill="currentColor"/></span> {t('hero.howBidding')}</button></div>
       <HeroFactsRow/>
      </>}/>
    <div className="scroll-cue"><span>{t('hero.scrollCue')}</span><ChevronDown/></div>
   </section>


   {/* 2026-11-10 round 5 (owner: the marquee ran with a gap). The loop
       animates translateX(-50%), so the strip must be two IDENTICAL halves —
       the old 6+3 arrangement left the second half short and a blank window
       scrolled past every cycle. Fifteen real auction venues, doubled, and
       styles.css slows the clock to 48s so the longer strip glides at the
       same speed. */}
   <section className="ticker" aria-label="Japanese auction venues AR7 bids at"><div>{(()=>{const v=['USS TOKYO','USS NAGOYA','USS YOKOHAMA','USS OSAKA','TAA KINKI','TAA YOKOHAMA','CAA CHUBU','CAA TOKYO','HAA KOBE','JU AICHI','JU GIFU','LAA KANSAI','ARAI OYAMA','MIRIVE OSAKA','BAYAUC'];return v.concat(v)})().map((x,i)=><span key={i}><i/> {x}</span>)}</div></section>

   <MotionShowcase navigate={navigate}/>

   <section className="inventory shell section" id="inventory" ref={homeInventoryRef} onMouseEnter={()=>{homeHover.current=true}} onMouseLeave={()=>{homeHover.current=false}}>
    <div className="section-head"><div><div className="kicker">{t('home.stockKicker')}</div><h2>{t('home.stockH2a')}<br/><em>{t('home.stockH2b')}</em></h2></div><p>{t('home.stockBody')}</p></div>
    <div className="inventory-tools"><div className="filters">{['All','In Stock','Auction','New Arrival'].map(f=><button className={filter===f?'active':''} onClick={()=>setFilter(f)} key={f} type="button">{f==='All'?t('home.filterAll'):statusLabel(t,f)}</button>)}</div><PageLink className="search-btn" to="inventory" navigate={navigate}><Search/> {t('home.searchVehicles')} <SlidersHorizontal/></PageLink></div>
    <div className="car-grid">{shown.map((c,i)=>{
      const ref=carRef(c), href=hrefFor('inventory',ref);
      const label=[c.year,c.make,c.model].filter(Boolean).join(' ');
      const waMsg=`Hello AR7, I'm interested in the ${label} (ref ${ref}) on your website. Is it still available?`;
      return <article className="car-card home-car-card" key={c.id} style={{'--delay':i*80+'ms'}}>
      <a className="home-car-cover-link" href={href} aria-label={`View details for ${label} — ${ref}`} onClick={linkClick(`inventory?car=${ref}`,navigate)}/>
      <div className="car-image"><img loading="lazy" decoding="async" width="820" height="550" src={c.image} srcSet={showroomSrcSet(c.image)} sizes={showroomSrcSet(c.image) ? SHOWROOM_CARD_SIZES : undefined} alt={carAlt(c)}/><span className={'status '+statusSlug(c.status)}>{statusLabel(t,c.status)}</span><button type="button" aria-label={t('card.fav')} aria-pressed={favs.includes(c.id)} className={favs.includes(c.id)?'fav active':'fav'} onClick={()=>setFavs(v=>v.includes(c.id)?v.filter(x=>x!==c.id):[...v,c.id])}><Heart fill={favs.includes(c.id)?'currentColor':'none'}/></button>{c.grade?<span className="grade">{t('card.grade')} <b>{c.grade}</b></span>:null}</div>
      <div className="car-info"><div className="car-head"><img loading="lazy" decoding="async" width="64" height="40" src={LOGO(c.make)} alt="" onError={logoOnError}/><div className="car-head-txt"><span className="make">{c.make}</span><h3>{c.model}</h3></div></div><div className="specs"><span><CalendarDays/> {c.year}</span><span><Gauge/> {c.km} km</span><span><Fuel/> {c.fuel}</span>{c.tr?<span><ArrowLeftRight/> {c.tr}</span>:null}</div><div className="car-bottom"><div><small>{t('card.priceFrom')}</small><VehiclePriceDisplay car={c} discounts={liveDiscounts}/></div></div>
      <div className="card-actions">
        <a className="card-wa" href={waLink(settings.whatsapp_number,waMsg)} target="_blank" rel="noopener noreferrer" aria-label={`WhatsApp us about the ${label}`}><WhatsAppIcon size={14}/> WhatsApp</a>
        <button type="button" className="card-offer" aria-label={`Make offer on the ${label}`} onClick={()=>openEnquiry({kind:'vehicle-offer',vehicle_interest:`${label} (${ref})`,stock_ref:ref})}><BadgePercent/> Make offer</button>
        <PageLink className="cmp-chip home-car-details" to={href} navigate={navigate} aria-label={`${t('home.mchDetails')} for ${label} — ${ref}`}>{t('home.mchDetails')} <ArrowRight/></PageLink>
      </div>
      <div className="loc"><MapPin/> {c.location}, Japan</div></div>
    </article>})}</div>
    {/* 2026-11-17 (Lighthouse touch targets): the pager used to render one
        6px-tall pill PER PAGE — with a full catalogue that was ~38 slivers no
        finger can hit. It is now a prev/next pager with 44px targets and a
        "page / of" readout; the strip of pills stays as a passive progress
        bar on wide screens only (aria-hidden, not clickable). */}
    <div className="home-carousel-dots" aria-label="Inventory slide pages">
     <button type="button" className="home-page-btn" aria-label="Previous stock page" onClick={()=>setHomeOff(((homePage-1+homePages)%homePages)*HOME_N)}><ChevronLeft/></button>
     <span className="home-page-count" aria-live="polite"><b>{homePage+1}</b> / {homePages}</span>
     <button type="button" className="home-page-btn" aria-label="Next stock page" onClick={()=>setHomeOff(((homePage+1)%homePages)*HOME_N)}><ChevronRight/></button>
    </div>
    <PageLink className="outline-btn" to="inventory" navigate={navigate}>{t('home.viewAll')} <ArrowRight/></PageLink>
   </section>

   {/* 2026-11-03 (owner request, competitor reference screenshots): compact
       "shop by" rails — make, body type and price — kept in AR7's own green/
       gold theme rather than the competitor's navy. Counts are computed from
       the live published list so they can never lie; every row lands on the
       inventory with that filter pre-applied (make via the /cars/<make> URL,
       body and price via the same sessionStorage handshake the hero search
       already uses — the inventory consumes ar7-inv-body / ar7-inv-price on
       mount). */}
   <section className="shop-by shell section" aria-label="Shop by make, body type and price">
    <div className="section-head"><div><div className="kicker">{t('home.shopKicker')}</div><h2>{t('home.shopH2a')}<br/><em>{t('home.shopH2b')}</em></h2></div><p>{t('home.shopBody')}</p></div>
    <div className="shop-by-grid">
     <div className="shop-col">
      <div className="shop-col-head"><CarFront/> {t('home.shopByMake')}</div>
      <div className="shop-col-rows">{currentBrands.slice(0,8).map(b=><PageLink key={b.name} className="shop-row" to={inventoryHref(b.name)} navigate={navigate}><img loading="lazy" decoding="async" width="34" height="20" src={LOGO(b.name)} alt="" onError={logoOnError}/><span>{b.name}</span><b>{b.count}</b></PageLink>)}</div>
      <PageLink className="shop-col-all" to="inventory" navigate={navigate}>{t('home.shopAll')} <ArrowRight/></PageLink>
     </div>
     <div className="shop-col">
      <div className="shop-col-head"><Gauge/> {t('home.shopByType')}</div>
      <div className="shop-col-rows">{(()=>{const m={};cars.forEach(c=>{if(c.body)m[c.body]=(m[c.body]||0)+1});return Object.keys(m).sort((a,b)=>m[b]-m[a]).slice(0,8).map(bt=><button key={bt} type="button" className="shop-row" onClick={()=>{try{sessionStorage.setItem('ar7-inv-body',bt)}catch{/* storage may be off */}navigate('inventory')}}><i className="shop-body-ic"><CarFront/></i><span>{bt}</span><b>{m[bt]}</b></button>)})()}</div>
      <PageLink className="shop-col-all" to="inventory" navigate={navigate}>{t('home.shopAll')} <ArrowRight/></PageLink>
     </div>
     <div className="shop-col">
      <div className="shop-col-head"><BadgePercent/> {t('home.shopByPrice')}</div>
      {/* Labels must match the inventory's PRICE_BANDS exactly — that is the
          contract that lets the preset survive the navigation. */}
      <div className="shop-col-rows shop-price-rows">{[['Under $10k',null,10000],['$10k – $20k',10000,20000],['$20k – $35k',20000,35000],['$35k – $60k',35000,60000],['$60k+',60000,null]].map(([label,lo,hi])=>{const n=cars.filter(c=>{const p=carDiscountedUSD(c,liveDiscounts);return (lo==null||p>=lo)&&(hi==null||p<hi)}).length;return n?<button key={label} type="button" className="shop-row" onClick={()=>{try{sessionStorage.setItem('ar7-inv-price',label)}catch{/* storage may be off */}navigate('inventory')}}><i className="shop-body-ic gold"><BadgePercent/></i><span>{label}</span><b>{n}</b></button>:null})}</div>
      <PageLink className="shop-col-all" to="inventory" navigate={navigate}>{t('home.shopAll')} <ArrowRight/></PageLink>
     </div>
    </div>
   </section>

   {/* 2026-11-08: recently-sold proof strip. Renders ONLY when the CRM has
       published listings marked "Sold" — no sold cars, no section, so the
       strip can never show invented sales. Marking a car Sold in the CRM
       lights it up here on the next hydration. */}
   {(()=>{
    const sold=cars.filter(c=>c&&c.published!==false&&String(c.status||'').trim().toLowerCase()==='sold').slice(0,6);
    return sold.length?<section className="sold-strip shell section" aria-label="Recently sold vehicles">
     <div className="section-head"><div><div className="kicker">{t('home.soldKicker')}</div><h2>{t('home.soldH2a')}<br/><em>{t('home.soldH2b')}</em></h2></div><p>{t('home.soldBody')}</p></div>
     <div className="sold-grid">{sold.map(c=><div className="sold-card" key={c.id}>
      <img loading="lazy" decoding="async" width="820" height="550" src={c.image||'/assets/ar7-mark-460.webp'} alt={carAlt(c)}/>
      <span className="sold-flag">{t('card.statusSold').toUpperCase()}</span>
      <b>{[c.year,c.make,c.model].filter(Boolean).join(' ')}</b>
      <small>{stockNo(c)}{c.location?' · '+c.location+', Japan':''}</small>
     </div>)}</div>
     <button className="outline-btn" onClick={()=>openEnquiry({kind:'vehicle',message:'I saw the recently sold cars — please source a similar one for me.'})} type="button">{t('home.soldCta')} <ArrowRight/></button>
    </section>:null})()}

   {/* Quick-quote wizard: three taps (market → budget → body) to a written
       quote. Match counts come straight from the live `cars` list, so the
       section never claims stock it doesn't have. */}
   <DeferredQuickQuote navigate={navigate} cars={cars}/>

   <section className="mch-teaser shell section" id="machinery">
    <div className="mch-teaser-head">
     <div><div className="kicker">{t('home.mchKicker')}</div><h2>{t('home.mchH2a')}<br/><em>{t('home.mchH2b')}</em></h2></div>
     <p>{t('home.mchBody')}</p>
    </div>
    {/* One machine per type, and only ones we actually have a photograph of —
        the teaser is the first thing a visitor sees, so it never opens with a
        placeholder. Prices come from listPriceUSD() so the home page and the
        machinery page can never disagree. */}
    <div className="mch-teaser-grid">{MACHINES.filter(m=>!m.photosPending).filter((m,i,a)=>a.findIndex(x=>x.type===m.type)===i).slice(0,3).map(m=>{const lockup=machineBrandLockup(m);const hrs=machineHours(m);const usage=hrs==null?(m.type==='Trucks'?'km on request':'hours on request'):(m.type==='Trucks'?`${hrs.toLocaleString('en-US')} km`:`${hrs.toLocaleString('en-US')} h`);const offer=stockDiscountFor(liveDiscounts,'machine',m.ref);const p=priceWithOffer(listPriceUSD(m),offer?.percent||0);const href=machineHref(m);return <article className="mch-card" key={m.id}>
      <div className="mch-photo"><PageLink className="mch-photo-link" to={href} navigate={navigate} aria-label={`Open the ${m.name} page — ${m.ref}`}><img loading="lazy" decoding="async" width="820" height="560" src={machineImages(m)[0]} alt={`${m.name} for export — ${m.ref}`}/></PageLink><span className="mch-type">{lockup.label}</span>{machineImages(m).length>1&&<span className="mch-shotcount">{machineImages(m).length} photos</span>}{offer?<span className="mch-offer-flag"><Sparkles size={12}/> {offer.percent}% off</span>:null}</div>
      <div className="mch-info">
        <div className="car-head"><span className="mch-brand-mark" aria-hidden="true">{lockup.code||<Wrench size={15}/>}</span><div className="car-head-txt"><span className="make">{lockup.eyebrow}</span><PageLink className="mch-title-link" to={href} navigate={navigate}><h3 className="mch-title">{m.name}</h3></PageLink></div></div>
        <div className="mch-meta"><span><Gauge/> {machineYearText(m)} · {usage}</span>{m.specs?.[0]?<span><Wrench/> {m.specs[0][0]}: <b>{m.specs[0][1]}</b></span>:null}</div>
        <p>{m.summary}</p>
        <div className="car-bottom mch-ledger"><div><small>{t('machinery.indicative')}</small>{p.hasOffer?<span className="mch-price-row"><s>{fmt(p.was)}</s> <b>{fmt(p.now)}</b></span>:<b>{fmt(p.now)}</b>}</div></div>
        <div className="card-actions">
          <button type="button" className="card-wa" aria-label={`WhatsApp us about the ${m.name}`} onClick={()=>{if(typeof window!=='undefined')window.open(waLink(settings.whatsapp_number,`Hello AR7, I'm interested in the ${m.name} (ref ${m.ref}) on your website. Is it still available?`),'_blank','noopener')}}><WhatsAppIcon size={14}/> WhatsApp</button>
          <button type="button" className="card-offer" aria-label={`Make offer on the ${m.name}`} onClick={()=>openEnquiry({kind:'machinery-offer',vehicle_interest:`${m.name} (${m.ref})`,stock_ref:m.ref})}><BadgePercent/> Make offer</button>
          <PageLink className="cmp-chip mch-view" to={href} navigate={navigate} aria-label={`${t('home.mchDetails')} for ${m.name} — ${m.ref}`}>{t('home.mchDetails')} <ArrowRight/></PageLink>
        </div>
        <div className="loc"><MapPin/> {machineLoc(m)} · {t('machinery.ref')} {m.ref}</div>
      </div>
    </article>})}</div>
    <div className="mch-teaser-foot"><PageLink className="primary" to="machinery" navigate={navigate}>{t('home.mchBrowseAll')} <ArrowRight/></PageLink><button className="ghost-btn" type="button" onClick={()=>setEnquiry({kind:'vehicle',vehicle_interest:'Left-hand-drive car from China',message:'I am looking for a left-hand-drive car from your China desk. '})}>{t('home.mchRequestLhd')} <ArrowRight/></button><p className="mch-teaser-note">{t('machinery.note')}</p></div>
   </section>

   <section className="world section"><div className="world-map"><DeferredBigGlobe navigate={navigate} compact/></div><div className="world-content shell"><div className="kicker">{t('home.worldKicker')}</div><h2>{t('home.worldH2a')} <em>{t('home.worldH2em')}</em></h2><p>{t('home.worldBody')}</p><FounderStat variant="world"/><PageLink className="primary" to="destinations" navigate={navigate}>{t('home.worldExplore')} <ArrowRight/></PageLink></div></section>

   <section className="brand-budgets shell section" id="budgets">
    <div className="section-head"><div><div className="kicker">{t('home.budgetKicker')}</div><h2>{t('home.budgetH2a')}<br/><em>{t('home.budgetH2b')}</em></h2></div><p>{t('home.budgetBody')}</p></div>
    <div className="budget-grid">{brandBudgets.map(b=><a key={b.name} className="budget-card" href={inventoryHref(b.name)} onClick={linkClick(inventoryHref(b.name),navigate)}><div className="budget-head"><img loading="lazy" decoding="async" width="44" height="26" src={LOGO(b.name)} alt="" onError={logoOnError}/><b>{b.name}</b><span>{b.count} {b.count===1?t('home.budgetCar'):t('home.budgetCars')}</span></div><BudgetSlides make={b.name}/><div className="budget-models">{b.models.map(m=><span key={m}>{m}</span>)}</div><div className="budget-range"><small>{t('home.budgetRange')}</small><b>{b.lo?fmt(Math.round(b.lo/100)*100)+' – '+fmt(Math.round(b.hi/100)*100):t('home.budgetOnRequest')}</b>{b.y0?<span className="budget-years">{b.y0===b.y1?b.y0:b.y0+' – '+b.y1} · {t('home.budgetReady')}</span>:null}</div><span className="budget-cta">{t('home.budgetBrowse',{make:b.name})} <ArrowRight/></span></a>)}</div>
    <div className="budget-bands">{budgetBands.map(x=><div key={x[0]}><b>{x[0]}</b><span>{x[1]}</span></div>)}</div>
   </section>

   <section className="process section" id="process"><div className="shell">
    <div className="section-head light"><div><div className="kicker">{t('home.processKicker')}</div><h2>{t('home.processH2a')}<br/>{t('home.processH2b')} <em>{t('home.processH2em')}</em></h2></div><p>{t('home.processBody')}</p></div>
    <div className="flow-line"><span/></div>
    <div className="steps">
     {[{n:'01',icon:<Search/>,t:t('home.step1t'),p:t('home.step1p')},{n:'02',icon:<Gavel/>,t:t('home.step2t'),p:t('home.step2p')},{n:'03',icon:<ClipboardCheck/>,t:t('home.step3t'),p:t('home.step3p')},{n:'04',icon:<Ship/>,t:t('home.step4t'),p:t('home.step4p')}].map((s,i)=><div className="step" key={s.n}><div className="step-top"><span>{s.n}</span><i>{s.icon}</i></div><h3>{s.t}</h3><p>{s.p}</p>{i<3&&<ArrowRight className="step-arrow"/>}</div>)}
    </div>
    <div className="process-cta"><span><LockKeyhole/> {t('home.processPortal')}</span><button className="gold-btn" onClick={()=>openEnquiry()} type="button">{t('home.processStart')} <ArrowUpRight/></button></div>
   </div></section>

   <section className="auction-preview section shell" id="about">
    <div className="dash-wrap">
      <div className="dash-copy"><div className="kicker">{t('home.auctionKicker')}</div><h2>{t('home.auctionH2a')}<br/>{t('home.auctionH2b')} <em>{t('home.auctionH2em')}</em></h2><p>{t('home.auctionBody')}</p><ul><li><Check/> {t('home.auctionLi1')}</li><li><Check/> {t('home.auctionLi2')}</li><li><Check/> {t('home.auctionLi3')}</li></ul><button className="primary" onClick={()=>setEnquiry({kind:'auction'})} type="button">{t('home.auctionCta')} <ArrowRight/></button></div>
      <a className="dashboard" href="/portal" onClick={linkClick('portal',navigate)} title="Open the client portal preview"><span className="dash-demo-chip">PREVIEW</span><div className="dash-nav"><img width="128" height="53" src="/assets/ar7-mark-128.webp" alt="AR7 Traders" loading="lazy" decoding="async"/><span/><span/><span/></div><div className="dash-title"><div><small>GOOD MORNING, IMRAN</small><b>Auction workspace</b></div><div className="dash-search"><Search/> Search lot or chassis</div></div><div className="dash-stats"><div><i className="green"/><span>Live now<b>12 auctions</b></span></div><div><Gavel/><span>Your bids<b>04 active</b></span></div><div><BadgeCheck/><span>Won this month<b>07 vehicles</b></span></div></div><div className="dash-cars">{cars.slice(0,3).map(c=><div key={c.id}><img loading="lazy" decoding="async" width="820" height="550" src={c.image} srcSet={showroomSrcSet(c.image)} sizes={showroomSrcSet(c.image) ? SHOWROOM_CARD_SIZES : undefined} alt={carAlt(c)}/><span><small>{stockLabel(c)}</small><b>{c.make} {c.model.split(' ')[0]}</b><em>{c.grade?'Grade '+c.grade:(c.st||'RHD')}</em></span><strong>{price(c)}</strong></div>)}</div></a>
    </div>
   </section>

   <section className="cta shell section"><div className="cta-bg"/><div><div className="kicker">{t('home.ctaKicker')}</div><h2>{t('home.ctaH2a')}<br/>{t('home.ctaH2b')} <em>{t('home.ctaH2em')}</em></h2><p>{t('home.ctaBody')}</p></div><button className="gold-btn large" onClick={()=>openEnquiry()} type="button">{t('home.ctaBtn')} <ArrowUpRight/></button></section>
   </>:page==='world'?<React.Suspense fallback={<div className="empty-state route-fallback"><Globe2/><h3>Loading the network…</h3></div>}><Globe navigate={navigate}/></React.Suspense>:page==='account'?<React.Suspense fallback={<div className="empty-state route-fallback"><LogIn/><h3>Loading your account…</h3></div>}><CustomerAccount navigate={navigate}/></React.Suspense>:page==='studio'?<React.Suspense fallback={<div className="empty-state route-fallback"><Monitor/><h3>Loading the studio…</h3></div>}><DeviceStudio navigate={navigate}/></React.Suspense>:page==='machinery'?<React.Suspense fallback={<div className="empty-state route-fallback"><Wrench/><h3>Loading the machinery desk…</h3></div>}><MachineryPage navigate={navigate} initialType={machineRoute.type} machineRef={machineRoute.ref} openAuction={ctx=>openEnquiry({kind:'machinery',...(ctx&&typeof ctx==='object'&&!('nativeEvent' in ctx)?ctx:{})})} openChat={openChatNow}/></React.Suspense>:page==='destinations'&&destRoute?<React.Suspense fallback={<div className="empty-state route-fallback"><Globe2/><h3>Loading the market guide…</h3></div>}><DestinationPage dest={destinationBySlug(destRoute)} destSlug={destRoute} navigate={navigate} openAuction={openEnquiry} Link={PageLink} Related={RelatedStock} Flag={Flag}/></React.Suspense>:['privacy','cookies','terms'].includes(page)?<React.Suspense fallback={<div className="empty-state route-fallback"><LockKeyhole/><h3>Loading the policy…</h3></div>}><LegalPage type={page} navigate={navigate}/></React.Suspense>:['services','destinations','reviews','faq','portal'].includes(page)?<React.Suspense fallback={<div className="empty-state route-fallback"><Globe2/><h3>Loading the page…</h3></div>}><ExtraPage type={page} navigate={navigate} openAuction={openEnquiry} discounts={liveDiscounts}/></React.Suspense>:['brands','howbuy','tools','news'].includes(page)?<React.Suspense fallback={<div className="empty-state route-fallback"><Newspaper/><h3>Loading the page…</h3></div>}><ExtraPages2 type={page} navigate={navigate} openAuction={openEnquiry} articleSlug={page==='news'?vehicleId:null} discounts={liveDiscounts}/></React.Suspense>:<React.Suspense fallback={<div className="empty-state route-fallback"><CarFront/><h3>Loading page…</h3></div>}><InnerPage page={page} navigate={navigate} vehicleId={vehicleId} initialMake={makeFilter} initialModel={modelFilter} openAuction={openEnquiry} openChat={openChatNow} favs={favs} setFavs={setFavs}/></React.Suspense>}
  </main>

  <footer className="site-footer">
   <div className="shell footer-news">
    <div className="footer-news-copy"><div className="kicker">{t('footer.newsKicker')}</div><h2>{t('footer.newsH2a')}<br/><em>{t('footer.newsH2b')}</em></h2><p>{t('footer.newsBody')}</p></div>
    <form className="footer-news-form" onSubmit={e=>{e.preventDefault();const v=(e.currentTarget.elements.email?.value||'').trim();if(v)openEnquiry({kind:'contact',email:v,vehicle_interest:'Stock alerts signup',message:'Please add me to your stock alerts list for new Japan stock.'});}}>
     <label className="footer-news-field"><Mail/><input name="email" type="email" required placeholder={t('footer.newsPlaceholder')} aria-label={t('footer.newsPlaceholder')}/></label>
     <button className="footer-news-btn" type="submit"><Send/> {t('footer.subscribe')}</button>
    </form>
   </div>
   <div className="shell footer-grid">
    <div className="footer-brand">
     <a className="footer-logo" href="/" onClick={linkClick('home',navigate)}><span className="footer-crest"><span><img width="548" height="589" src="/assets/ar7-footer-emblem.webp" alt="AR7 Traders — Global Vehicle Exporters" loading="lazy" decoding="async"/></span></span></a>
     <p>{t('footer.tagline')}</p>
     <div className="footer-trust"><span><ShieldCheck/> {t('footer.trustSecure')}</span><span><FileCheck/> {t('footer.trustSheets')}</span><span><Ship/> {t('footer.trustDelivery')}</span></div>
     <div className="socials"><a href="/inventory" onClick={linkClick('inventory',navigate)} title="Vehicle gallery"><Camera/></a><a href="/reviews" onClick={linkClick('reviews',navigate)} title="Customer stories"><MessageCircle/></a><a href="/contact" onClick={linkClick('contact',navigate)} title="Contact AR7"><Send/></a><a className="wa-link" href={waLink(settings.whatsapp_number,settings.whatsapp_message)} target="_blank" rel="noopener noreferrer" title="WhatsApp AR7"><WhatsAppIcon size={15}/></a></div>
    </div>
    <div><b>{t('footer.explore')}</b><a href="/inventory" onClick={linkClick('inventory',navigate)}>{t('footer.inventory')}<ArrowUpRight/></a><a href="/auction" onClick={linkClick('auction',navigate)}>{t('footer.auction')}<ArrowUpRight/></a><a href="/machinery" onClick={linkClick('machinery',navigate)}>{t('footer.machinery')}<ArrowUpRight/></a><a href="/services" onClick={linkClick('services',navigate)}>{t('footer.services')}<ArrowUpRight/></a><a href="/brands" onClick={linkClick('brands',navigate)}>{t('footer.brands')}<ArrowUpRight/></a><a href="/destinations" onClick={linkClick('destinations',navigate)}>{t('footer.destinations')}<ArrowUpRight/></a><a href="/tools" onClick={linkClick('tools',navigate)}>{t('footer.tools')}<ArrowUpRight/></a><a href="/world" onClick={linkClick('world',navigate)}>{t('footer.world')}<ArrowUpRight/></a></div>
    <div><b>{t('footer.company')}</b><a href="/howbuy" onClick={linkClick('howbuy',navigate)}>{t('footer.howToBuy')}<ArrowUpRight/></a><a href="/news" onClick={linkClick('news',navigate)}>{t('footer.news')}<ArrowUpRight/></a><a href="/about" onClick={linkClick('about',navigate)}>{t('footer.about')}<ArrowUpRight/></a><a href="/reviews" onClick={linkClick('reviews',navigate)}>{t('footer.reviews')}<ArrowUpRight/></a><a href="/faq" onClick={linkClick('faq',navigate)}>{t('footer.faq')}<ArrowUpRight/></a>{signedIn&&<a href="/account" onClick={linkClick('account',navigate)}>{t('footer.myAccount')}<ArrowUpRight/></a>}<a href="/portal" onClick={linkClick('portal',navigate)}>{t('footer.portal')}<ArrowUpRight/></a><a href="/crm" onClick={linkClick('crm',navigate)}>{t('footer.crm')}<ArrowUpRight/></a>{!signedIn&&<a href="/account" onClick={linkClick('account',navigate)}>{t('footer.signUp')}<ArrowUpRight/></a>}</div>
    <div><b>{t('contact.getInTouch')}</b><a href={'mailto:'+settings.contact_email}><Mail/> {settings.contact_email}</a><a href={telHref(settings.contact_phone)}><Phone/> {settings.contact_phone}</a><a className="wa-link" href={waLink(settings.whatsapp_number,settings.whatsapp_message)} target="_blank" rel="noopener noreferrer"><WhatsAppIcon size={15}/> {t('contact.whatsapp')}</a><a href="/contact" onClick={linkClick('contact',navigate)}><MapPin/> {settings.contact_address}</a>
     <div className="footer-hours"><Clock3/><span><b>{t('contact.hours')}</b><small>{t('contact.hoursValue')}</small></span></div>
     <button className="footer-top-btn" onClick={()=>window.scrollTo({top:0,behavior:'smooth'})} type="button">{t('footer.backToTop')} <ArrowUpRight/></button>
    </div>
   </div>
   <div className="shell footer-bottom"><span>{t('footer.copyright',{year:new Date().getFullYear()})}</span><span><a href="/privacy" onClick={linkClick('privacy',navigate)}>{t('footer.privacy')}</a> · <a href="/cookies" onClick={linkClick('cookies',navigate)}>Cookies</a> · <a href="/terms" onClick={linkClick('terms',navigate)}>{t('footer.terms')}</a> · <a href="/terms" onClick={linkClick('terms',navigate)}>{t('footer.exportPolicy')}</a></span><div className="footer-badges"><span><BadgeCheck/> {t('footer.verifiedStock')}</span><span><LockKeyhole/> {t('footer.trustSecure')}</span></div><b>AR7TRADERS.COM</b></div>
  </footer>

  <WhatsAppButton/>

  {/* 2026-11-07 (owner request): a search button in the same floating stack
      as WhatsApp and the chat — opens the same Ctrl+K overlay as the header. */}
  <button type="button" className="search-float" onClick={()=>setSearchOpen(true)}
    aria-label="Search cars, machinery and guides" title="Search (Ctrl+K)"><Search/></button>

  {chatOn&&<React.Suspense fallback={null}><ChatWidgetLazy ref={chatRefCb}/></React.Suspense>}

  <CookieNotice navigate={navigate}/>

  {searchOpen&&<React.Suspense fallback={null}><GlobalSearch open={searchOpen} onClose={()=>setSearchOpen(false)} navigate={navigate}/></React.Suspense>}

  {enquiry&&<React.Suspense fallback={<div className="modal-backdrop"><div className="modal enquiry-loading" role="status">Loading enquiry form…</div></div>}><EnquiryDialog context={enquiry} onClose={()=>setEnquiry(null)}/></React.Suspense>}
 </div>
}
/* One automatic reload per retryable render failure, ever — recorded in
   sessionStorage when available and in the URL otherwise, because embedded
   previews often block storage entirely (and an unrecordable guard would
   reload forever). */
const RETRY_FLAG='ar7-retried';
let retriedThisLoad=false;
function alreadyRetried(){
 if(retriedThisLoad)return true;
 try{ if(sessionStorage.getItem(RETRY_FLAG))return true; }catch{ }
 try{ if(new URLSearchParams(location.search).has(RETRY_FLAG))return true; }catch{ }
 return false;
}
/* Records the retry. Returns true when storage kept the note (a plain reload
   then suffices); false means it could not, so the caller navigates to a URL
   that carries the note instead. */
function markRetried(){
 retriedThisLoad=true;
 try{ sessionStorage.setItem(RETRY_FLAG,'1'); return true; }catch{ return false; }
}
function retryHref(){
 try{ const u=new URL(location.href); u.searchParams.set(RETRY_FLAG,'1'); return u.toString(); }
 catch{ return location.href; }
}
/* True in the dev server (and when a visitor adds ?debug=1), so a white-screen
   report can name the error instead of only offering a reload. Wrapped in a
   function because `import.meta.env` is not defined by every bundler used in
   the test suites. */
function showErrorDetail(){
 try{ if(import.meta.env?.DEV) return true; }catch{ }
 try{ return typeof location!=='undefined'&&/[?&]debug=1/.test(location.search); }catch{ return false; }
}
class BootErrorBoundary extends React.Component{
 constructor(props){super(props);this.state={error:null}}
 static getDerivedStateFromError(error){return {error}}
 componentDidCatch(error,info){
  const message=String(error?.message||error||'');
  const componentStack=String(info?.componentStack||'');
  // Leave a breadcrumb that survives the remount, so a reloaded page can be
  // diagnosed from the console (or by reading window.__ar7LastError).
  try{ window.__ar7LastError={message,stack:String(error?.stack||''),componentStack,time:new Date().toISOString()}; }catch{ }
  console.error('AR7 failed to render',error,info);
  // Dev only: hand the report to the dev server (src/dev-api-mock.js logs it),
  // so a crash inside a preview pane we cannot open a console in is still
  // visible in the terminal that serves the page.
  if(showErrorDetail())try{
   fetch('/api/__client-error',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({message,stack:String(error?.stack||''),componentStack,url:location.href,w:innerWidth,h:innerHeight,time:new Date().toISOString()})}).catch(()=>{});
  }catch{ }
  // Two failures are worth exactly one silent reload: a module that failed to
  // arrive (flaky network, or a dev server restarted while the tab sat open),
  // and a hook running with no React dispatcher ("Cannot read properties of
  // null (reading 'useState')") — the signature of a dev server whose module
  // graph split React in two, which a fresh load always repairs. The 15s guard
  // stops any reload loop; if the error is real, the card below says so.
  const RETRYABLE=/dynamically imported module|Importing a module script|Loading chunk|preload|Invalid hook call|Cannot read properties of (null|undefined) \(reading 'use[A-Z]/i;
  if(RETRYABLE.test(message)&&!alreadyRetried()){
   if(markRetried())location.reload();else location.replace(retryHref());
   return;
  }
 }
 render(){
  if(!this.state.error) return this.props.children;
  const componentStack=showErrorDetail()?String(typeof window!=='undefined'&&window.__ar7LastError?.componentStack||'').split('\n').filter(Boolean).slice(0,5).join('\n'):'';
  const detail=showErrorDetail()?[String(this.state.error?.message||this.state.error||'unknown error').slice(0,400),componentStack].filter(Boolean).join('\n\n'):'';
  return <div style={{minHeight:'100vh',display:'grid',placeItems:'center',padding:'32px 20px',background:'#f5f6f2',color:'#102018',fontFamily:'Manrope,system-ui,sans-serif',textAlign:'center'}}>
   <div style={{maxWidth:showErrorDetail()?620:460}}>
    <img src="/assets/ar7-mark-128.webp" alt="AR7 Traders" width="56" height="56" style={{borderRadius:12}} loading="lazy" decoding="async"/>
    <h1 style={{fontSize:28,letterSpacing:'-0.04em',margin:'18px 0 10px'}}>AR7 Traders</h1>
    <p style={{color:'#66736c',lineHeight:1.6,margin:'0 0 22px'}}>The page failed to load. Refresh, or email <a href={'mailto:'+FALLBACK.contact_email} style={{color:'#043f28'}}>{FALLBACK.contact_email}</a>.</p>
    <button type="button" onClick={()=>location.reload()} style={{border:0,background:'#043f28',color:'#fff',borderRadius:12,height:48,padding:'0 20px',fontWeight:700,cursor:'pointer'}}>Refresh the page</button>
    {detail&&<pre style={{margin:'22px 0 0',padding:'14px 16px',background:'#fff',border:'1px solid #dce2dc',borderRadius:12,color:'#7a2f2f',font:'12px/1.5 ui-monospace,SFMono-Regular,Menlo,monospace',textAlign:'left',whiteSpace:'pre-wrap',overflowWrap:'anywhere'}}>{detail}</pre>}
   </div>
  </div>;
 }
}

const rootEl=document.getElementById('root');
if(rootEl){
 if(window.__ar7BootFallbackTimer)window.clearTimeout(window.__ar7BootFallbackTimer);
 createRoot(rootEl).render(<BootErrorBoundary><LanguageProvider><CurrencyProvider><App/></CurrencyProvider></LanguageProvider></BootErrorBoundary>);
}
