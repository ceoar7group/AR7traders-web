import React, {useEffect, useLayoutEffect, useRef, useState, useReducer} from 'react';
import { createPortal } from 'react-dom';
import { createRoot } from 'react-dom/client';
import { ArrowUpRight, X, Search, SlidersHorizontal, Heart, Gauge, CalendarDays, Fuel, Ship, Gavel, BadgeCheck, ClipboardCheck, MapPin, ChevronDown, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, Maximize2, Check, Mail, Phone, Camera, MessageCircle, Send, ArrowRight, Globe2, LockKeyhole, Play, Clock3, Monitor, Tablet, Smartphone, Laptop, CarFront, LogIn, Plane, ArrowLeftRight, Calculator, CreditCard, ShieldCheck, FileCheck, BadgePercent, Newspaper, BookOpen, Landmark, Wrench} from 'lucide-react';
import './styles.css';
import './pages.css';
import './extra-pages.css';
import './motion-account.css';
import './landing-v2.css';
import './expanded.css';
import './detail-responsive.css';
// The globe is the single heaviest thing on the public site and it is never
// above the fold — the hero has its own lightweight visual and the header has
// the world-time ribbon. Loading network.jsx on demand keeps it out of the
// first paint. `Flag` moved to src/flag.jsx precisely so this module could go.
const Globe = React.lazy(() =>
  import('./network.jsx').then(m => ({ default: m.WorldPage })));
const BigGlobe = React.lazy(() =>
  import('./network.jsx').then(m => ({ default: m.BigNetworkGlobe })));
// The CRM is only reached from the /crm route, so load it on demand
// instead of shipping it to every visitor.
const CrmApp = React.lazy(() => import('./crm.jsx'));
// The customer account area is only reached from /account.
const CustomerAccount = React.lazy(() =>
  import('./customer-portal.jsx').then(m => ({ default: m.CustomerAccountPage })));
// The /reviews showcase and its 12 buyer stories are only reached from /reviews.
const ReviewsShowcase = React.lazy(() => import('./reviews.jsx'));
// The machinery desk is its own page (and its own CSS chunk), reached from
// /machinery, the Inventory menu and the home teaser.
const MachineryPage = React.lazy(() => import('./machinery.jsx').then(m => ({ default: m.MachineryPage })));
import { WhatsAppButton, useCustomerSession } from './customer-session.jsx';
import { Flag } from './flag.jsx';
import { ChatWidget } from './ChatWidget.jsx';
import { VehicleActions } from './vehicle-actions.jsx';
import { WhatsAppIcon } from './brand-icons.jsx';
import { useSettings, telHref, waLink, FALLBACK } from './site-settings.js';
import { useSeo, FAQ_ITEMS, FAQ_TOPICS } from './seo.js';
import { DEST } from './destinations.js';
import { NEWS, articleSlug, articleBySlug, getPublishedNews, getNewsCategories, setPublishedNews, subscribePublishedNews } from './news-data.js';
export { DEST, NEWS };
import { CurrencyProvider, useCurrency } from './currency.jsx';
import { LanguageProvider, useLang } from './i18n.jsx';
import { PromoBar } from './promo-bar.jsx';
import { SiteHeader, logoOnError } from './site-header.jsx';
import { parseRoute, parseNavTarget, hrefFor, hrefFromTarget, hashFor, linkClick, findCar, carRef, writeLocation, inventoryHref, isReload, rememberVehicle } from './routing.js';
import { carAlt } from './car-alt.js';
import { mapDealerRows, isImportedCar } from './japan-stock-map.js';
import { MACHINES, MACHINE_TYPES, MACHINERY_NOTE, listPriceUSD, machineImages, machineByRef, machineHref, hydrateMachines } from './machinery-data.js';
import { useMachineryVersion } from './machinery-hydrate.jsx';
import { useStockDiscounts, stockDiscountFor, priceWithOffer } from './offers.js';
// A car uploaded before the 2026-10 WebP pass stores a `.jpg` photo path that
// no longer exists on disk. vercel.json rewrites those URLs and this retries
// them in the app; see src/image-fallback.js for the three layers.
import { installImageFallback, hasRetried } from './image-fallback.js';
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
function FounderStat({variant,delay=0}){
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

export const cars = [ {id:1, make:'Rolls-Royce', model:'Ghost', year:2023, km:'4,200', fuel:'Petrol', body:'Luxury', price:'$189,000', image:'/assets/lux/rolls-royce-ghost.webp', grade:'5.0', status:'In Stock', location:'Yokohama', tr:'AT', drv:'AWD', eng:'6,750cc', seats:5, col:'Two-tone', st:'RHD'},
 {id:2, make:'Rolls-Royce', model:'Cullinan', year:2022, km:'9,800', fuel:'Petrol', body:'Luxury', price:'$205,000', image:'/assets/lux/rolls-royce-cullinan.webp', grade:'5.0', status:'In Stock', location:'Tokyo', tr:'AT', drv:'AWD', eng:'6,750cc', seats:5, col:'Purple', st:'RHD'},
 {id:3, make:'Bentley', model:'Continental GT', year:2022, km:'7,600', fuel:'Petrol', body:'Luxury', price:'$168,000', image:'/assets/lux/bentley-continental-gt.webp', grade:'5.0', status:'Auction', location:'USS Tokyo', tr:'DCT', drv:'AWD', eng:'6,000cc', seats:4, col:'White', st:'RHD'},
 {id:4, make:'Mercedes-Benz', model:'AMG GT 63', year:2021, km:'12,300', fuel:'Petrol', body:'Luxury', price:'$142,000', image:'/assets/lux/mercedes-amg-gt.webp', grade:'4.5', status:'In Stock', location:'Osaka', tr:'DCT', drv:'AWD', eng:'4,000cc', seats:4, col:'Silver', st:'LHD'},
 {id:5, make:'BMW', model:'M8 Competition', year:2021, km:'15,200', fuel:'Petrol', body:'Luxury', price:'$118,000', image:'/assets/lux/bmw-m8-competition.webp', grade:'4.5', status:'New Arrival', location:'Nagoya', tr:'DCT', drv:'AWD', eng:'4,400cc', seats:4, col:'Black', st:'RHD'},
 {id:6, make:'Lamborghini', model:'Huracan EVO', year:2020, km:'8,400', fuel:'Petrol', body:'Supercar', price:'$245,000', image:'/assets/lux/lamborghini-huracan.webp', grade:'5.0', status:'Auction', location:'CAA Chubu', tr:'DCT', drv:'AWD', eng:'5,200cc', seats:2, col:'Orange', st:'RHD'},
 {id:7, make:'Ferrari', model:'F8 Tributo', year:2020, km:'6,900', fuel:'Petrol', body:'Supercar', price:'$265,000', image:'/assets/lux/ferrari-f8-tributo.webp', grade:'5.0', status:'In Stock', location:'Yokohama', tr:'DCT', drv:'RWD', eng:'3,900cc', seats:2, col:'Red', st:'RHD'},
 {id:8, make:'Bugatti', model:'Chiron', year:2019, km:'2,100', fuel:'Petrol', body:'Hypercar', price:'$2,850,000', image:'/assets/lux/bugatti-chiron.webp', grade:'5.0', status:'Auction', location:'USS Tokyo', tr:'DCT', drv:'AWD', eng:'8,000cc', seats:2, col:'Blue', st:'RHD'},
 {id:9, make:'Porsche', model:'911 Turbo S', year:2022, km:'5,300', fuel:'Petrol', body:'Supercar', price:'$205,000', image:'/assets/lux/porsche-911-turbo-s.webp', grade:'5.0', status:'In Stock', location:'Kobe', tr:'DCT', drv:'AWD', eng:'3,800cc', seats:4, col:'Silver', st:'RHD'},
 {id:10, make:'McLaren', model:'720S', year:2021, km:'7,100', fuel:'Petrol', body:'Supercar', price:'$235,000', image:'/assets/lux/mclaren-720s.webp', grade:'4.5', status:'Auction', location:'JU Aichi', tr:'DCT', drv:'RWD', eng:'4,000cc', seats:2, col:'Orange', st:'RHD'},
 {id:11, make:'Audi', model:'R8 V10', year:2021, km:'9,300', fuel:'Petrol', body:'Supercar', price:'$155,000', image:'/assets/gallery/audi-r8-v10-01.webp', grade:'4.5', status:'New Arrival', location:'Tokyo', tr:'DCT', drv:'AWD', eng:'5,200cc', seats:2, col:'Ascari Blue Metallic', st:'RHD'},
 {id:12, make:'Lexus', model:'LC 500', year:2021, km:'11,200', fuel:'Petrol', body:'Luxury', price:'$95,000', image:'/assets/gallery/lexus-lc-500-01.webp', grade:'4.5', status:'In Stock', location:'Yokohama', tr:'AT', drv:'RWD', eng:'5,000cc', seats:4, col:'Champagne Metallic', st:'LHD'},
 {id:43, make:'Toyota', model:'Harrier S', year:2023, km:'24,204', fuel:'Petrol', body:'SUV', price:'$21,000', image:'/assets/inventory/700071023230260801001.webp', grade:'4.5', status:'In Stock', location:'Hyogo', tr:'AT', drv:'2WD', eng:'2,000cc', seats:5, col:'Black', st:'RHD', stock_no:'0710232A30260801W001',images:['https://picture1.goo-net.com/7000710232/30260801/J/70007102323026080100100.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00101.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00102.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00103.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00104.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00105.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00106.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00107.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00108.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00109.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00110.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00111.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00112.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00113.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00114.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00115.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00116.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00117.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00118.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00119.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00120.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00121.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00122.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00123.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260801W00124.jpg']}, {id:44, make:'Toyota', model:'Harrier Z Leather Package', year:2023, km:'14,000', fuel:'Petrol', body:'SUV', price:'$28,100', image:'/assets/inventory/988026080300208264002.webp', grade:'4.5', status:'In Stock', location:'Gifu', tr:'AT', drv:'2WD', eng:'2,000cc', seats:5, col:'Silver Metallic', st:'RHD', stock_no:'0208264A20260802D002',images:['https://picture1.goo-net.com/9880260803/00208264/J/98802608030020826400200.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00201.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00202.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00203.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00204.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00205.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00206.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00207.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00208.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00209.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00210.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00211.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00212.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00213.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00214.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00215.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00216.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00217.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00218.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00219.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00220.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00221.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00222.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00223.jpg','https://picture1.goo-net.com/020/0208264/J/0208264A20260802D00224.jpg']}, {id:45, make:'Toyota', model:'Alphard 2.5S C Package', year:2021, km:'56,661', fuel:'Petrol', body:'MPV', price:'$27,700', image:'/assets/inventory/700054141330260802005.webp', grade:'4.0', status:'In Stock', location:'Chiba', tr:'AT', drv:'2WD', eng:'2,500cc', seats:7, col:'Black', st:'RHD', stock_no:'0541413A30260802W005',images:['https://picture1.goo-net.com/7000541413/30260802/J/70005414133026080200500.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00501.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00502.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00503.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00504.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00505.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00506.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00507.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00508.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00509.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00510.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00511.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00512.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00513.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00514.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00515.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00516.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00517.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00518.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00519.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00520.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00521.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00522.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00523.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260802W00524.jpg']}, {id:46, make:'Honda', model:'Vezel Hybrid Z Honda Sensing', year:2016, km:'46,353', fuel:'Hybrid', body:'SUV', price:'$21,100', image:'/assets/inventory/700056103730260717002.webp', grade:'4.5', status:'In Stock', location:'Chiba', tr:'AT', drv:'2WD', eng:'1,500cc', seats:5, col:'Pearl White', st:'RHD', stock_no:'0561037A30260717W002',images:['https://picture1.goo-net.com/7000561037/30260717/J/70005610373026071700200.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00201.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00202.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00203.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00204.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00205.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00206.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00207.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00208.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00209.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00210.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00211.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00212.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00213.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00214.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00215.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00216.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00217.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00218.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00219.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00220.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00221.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00222.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00223.jpg','https://picture1.goo-net.com/056/0561037/J/0561037A30260717W00224.jpg']}, {id:47, make:'Mazda', model:'CX-30 20S L Package', year:2021, km:'41,000', fuel:'Petrol', body:'SUV', price:'$14,100', image:'/assets/inventory/700100197430260726001.webp', grade:'4.0', status:'In Stock', location:'Hiroshima', tr:'AT', drv:'2WD', eng:'2,000cc', seats:5, col:'Gray Metallic', st:'RHD', stock_no:'1001974A30260726W001',images:['https://picture1.goo-net.com/7001001974/30260726/J/70010019743026072600100.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00101.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00102.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00103.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00104.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00105.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00106.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00107.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00108.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00109.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00110.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00111.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00112.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00113.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00114.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00115.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00116.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00117.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00118.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00119.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00120.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00121.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00122.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00123.jpg','https://picture1.goo-net.com/100/1001974/J/1001974A30260726W00124.jpg']}, {id:48, make:'Toyota', model:'Land Cruiser Prado TX', year:1996, km:'134,409', fuel:'Diesel', body:'SUV', price:'$16,600', image:'/assets/inventory/700052000730260404001.webp', grade:'4.0', status:'In Stock', location:'Gunma', tr:'AT', drv:'4WD', eng:'3,000cc TD', seats:5, col:'Blue', st:'RHD', stock_no:'0520007A30260404W001',images:['https://picture1.goo-net.com/7000520007/30260404/J/70005200073026040400100.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00101.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00102.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00103.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00104.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00105.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00106.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00107.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00108.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00109.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00110.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00111.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00112.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00113.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00114.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00115.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00116.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00117.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00118.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00119.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00120.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00121.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00122.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00123.jpg','https://picture1.goo-net.com/052/0520007/J/0520007A30260404W00124.jpg']},  {id:49, make:'Toyota', model:'Alphard 2.5S C Package', year:2018, km:'111,252', fuel:'Petrol', body:'MPV', price:'$25,600', image:'https://picture1.goo-net.com/7000541413/30260804/J/70005414133026080400300.jpg', grade:'4.0', status:'In Stock', location:'Chiba', tr:'AT', drv:'2WD', eng:'2,500cc', seats:7, col:'Pearl White', st:'RHD', stock_no:'0541413A30260804W003', images:['https://picture1.goo-net.com/7000541413/30260804/J/70005414133026080400300.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00301.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00302.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00303.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00304.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00305.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00306.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00307.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00308.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00309.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00310.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00311.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00312.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00313.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00314.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00315.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00316.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00317.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00318.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00319.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00320.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00321.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00322.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00323.jpg','https://picture1.goo-net.com/054/0541413/J/0541413A30260804W00324.jpg']}, {id:50, make:'Honda', model:'Vezel e:HEV Z', year:2026, km:'3', fuel:'Hybrid', body:'SUV', price:'$27,100', image:'https://picture1.goo-net.com/7000560922/30260625/J/70005609223026062500200.jpg', grade:'5.0', status:'In Stock', location:'Chiba', tr:'AT', drv:'2WD', eng:'1,500cc', seats:5, col:'Pearl White', st:'RHD', stock_no:'0560922A30260625W002', images:['https://picture1.goo-net.com/7000560922/30260625/J/70005609223026062500200.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00201.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00202.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00203.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00204.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00205.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00206.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00207.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00208.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00209.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00210.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00211.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00212.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00213.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00214.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00215.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00216.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00217.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00218.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00219.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00220.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00221.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00222.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00223.jpg','https://picture1.goo-net.com/056/0560922/J/0560922A30260625W00224.jpg']}, {id:51, make:'Mazda', model:'CX-60 XD S Package', year:2023, km:'23,000', fuel:'Diesel', body:'SUV', price:'$21,900', image:'https://picture1.goo-net.com/9880260307/00704244/J/98802603070070424400100.jpg', grade:'4.0', status:'In Stock', location:'Okinawa', tr:'AT', drv:'2WD', eng:'3,300cc D', seats:5, col:'Black M', st:'RHD', stock_no:'0704244A20260306D001', images:['https://picture1.goo-net.com/9880260307/00704244/J/98802603070070424400100.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00101.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00102.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00103.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00104.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00105.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00106.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00107.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00108.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00109.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00110.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00111.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00112.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00113.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00114.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00115.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00116.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00117.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00118.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00119.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00120.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00121.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00122.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00123.jpg','https://picture1.goo-net.com/070/0704244/J/0704244A20260306D00124.jpg']}, {id:52, make:'Toyota', model:'Sienta Hybrid Z', year:2026, km:'13', fuel:'Hybrid', body:'MPV', price:'$27,800', image:'https://picture1.goo-net.com/7000710232/30260818/J/70007102323026081800700.jpg', grade:'S', status:'In Stock', location:'Hyogo', tr:'AT', drv:'2WD', eng:'1,500cc', seats:7, col:'Gray', st:'RHD', stock_no:'0710232A30260818W007', images:['https://picture1.goo-net.com/7000710232/30260818/J/70007102323026081800700.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00701.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00702.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00703.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00704.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00705.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00706.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00707.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00708.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00709.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00710.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00711.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00712.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00713.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00714.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00715.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00716.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00717.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00718.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00719.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00720.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00721.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00722.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00723.jpg','https://picture1.goo-net.com/071/0710232/J/0710232A30260818W00724.jpg']}, {id:53, make:'Toyota', model:'Hiace Wagon GL', year:2026, km:'3', fuel:'Petrol', body:'Van', price:'$35,900', image:'https://picture1.goo-net.com/9750260811/01157270/J/97502608110115727000100.jpg', grade:'5.0', status:'In Stock', location:'Ishikawa', tr:'AT', drv:'4WD', eng:'2,700cc', seats:10, col:'White', st:'RHD', stock_no:'1157270A20260810G001', images:['https://picture1.goo-net.com/9750260811/01157270/J/97502608110115727000100.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00101.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00102.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00103.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00104.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00105.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00106.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00107.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00108.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00109.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00110.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00111.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00112.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00113.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00114.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00115.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00116.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00117.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00118.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00119.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00140.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00141.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00142.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00143.jpg','https://picture1.goo-net.com/115/1157270/J/1157270A20260810G00144.jpg']}, {id:54, make:'Toyota', model:'Hilux Z GR Sport', year:2023, km:'22,000', fuel:'Diesel', body:'Pickup', price:'$36,200', image:'https://picture1.goo-net.com/9750260818/00402076/J/97502608180040207600100.jpg', grade:'4.5', status:'In Stock', location:'Tochigi', tr:'AT', drv:'4WD', eng:'2,400cc D', seats:5, col:'White', st:'RHD', stock_no:'0402076A20260817G001', images:['https://picture1.goo-net.com/9750260818/00402076/J/97502608180040207600100.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00101.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00102.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00103.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00104.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00105.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00106.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00107.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00108.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00109.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00110.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00111.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00112.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00113.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00114.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00115.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00116.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00117.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00118.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00119.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00120.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00121.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00122.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00123.jpg','https://picture1.goo-net.com/040/0402076/J/0402076A20260817G00124.jpg']}, {id:55, make:'Daihatsu', model:'Taft X', year:2026, km:'13', fuel:'Petrol', body:'Kei', price:'$11,900', image:'https://picture1.goo-net.com/7001301077/30260820/J/70013010773026082000100.jpg', grade:'S', status:'In Stock', location:'Ehime', tr:'AT', drv:'2WD', eng:'660cc', seats:4, col:'Gray', st:'RHD', stock_no:'1301077A30260820W001', images:['https://picture1.goo-net.com/7001301077/30260820/J/70013010773026082000100.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00101.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00102.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00103.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00104.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00105.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00106.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00107.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00108.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00109.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00110.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00111.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00112.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00113.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00114.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00115.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00116.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00117.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00118.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00119.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00120.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00121.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00122.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00123.jpg','https://picture1.goo-net.com/130/1301077/J/1301077A30260820W00124.jpg']}, {id:56, make:'Toyota', model:'Crown Sports Z', year:2025, km:'7,000', fuel:'Hybrid', body:'SUV', price:'$38,800', image:'https://picture1.goo-net.com/7000206487/30260816/J/70002064873026081600300.jpg', grade:'5.0', status:'In Stock', location:'Aichi', tr:'AT', drv:'4WD', eng:'2,500cc', seats:5, col:'Black', st:'RHD', stock_no:'0206487A30260816W003', images:['https://picture1.goo-net.com/7000206487/30260816/J/70002064873026081600300.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00301.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00302.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00303.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00304.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00305.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00306.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00307.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00308.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00309.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00310.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00311.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00312.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00313.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00314.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00315.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00316.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00317.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00318.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00319.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00320.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00321.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00322.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00323.jpg','https://picture1.goo-net.com/020/0206487/Q/0206487A30260816W00324.jpg']}, {id:57, make:'Toyota', model:'Alphard Z', year:2026, km:'101', fuel:'Hybrid', body:'MPV', price:'$42,100', image:'https://picture1.goo-net.com/7000200421/30260821/Q/70002004213026082100400.jpg', grade:'S', status:'New Arrival', location:'Aichi', tr:'AT', drv:'2WD', eng:'2,500cc', seats:7, col:'Black', st:'RHD', stock_no:'0200421A30260821W004', images:['https://picture1.goo-net.com/7000200421/30260821/Q/70002004213026082100400.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00401.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00402.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00403.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00404.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00405.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00406.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00407.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00408.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00409.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00410.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00411.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00412.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00413.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00414.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00415.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00416.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00417.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00418.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00419.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00420.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00421.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00422.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00423.jpg','https://picture1.goo-net.com/020/0200421/Q/0200421A30260821W00424.jpg']}, {id:58, make:'Toyota', model:'Land Cruiser 250 VX', year:2024, km:'15,000', fuel:'Petrol', body:'SUV', price:'$38,700', image:'https://picture1.goo-net.com/7000207429/30260819/Q/70002074293026081900700.jpg', grade:'5.0', status:'In Stock', location:'Aichi', tr:'AT', drv:'4WD', eng:'2,700cc', seats:7, col:'Black', st:'RHD', stock_no:'0207429A30260819W007', images:['https://picture1.goo-net.com/7000207429/30260819/Q/70002074293026081900700.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00701.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00702.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00703.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00704.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00705.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00706.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00707.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00708.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00709.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00710.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00711.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00712.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00713.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00714.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00715.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00716.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00717.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00718.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00719.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00720.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00721.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00722.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00723.jpg','https://picture1.goo-net.com/020/0207429/Q/0207429A30260819W00724.jpg']}, {id:59, make:'Toyota', model:'Prius S', year:2017, km:'81,000', fuel:'Hybrid', body:'Sedan', price:'$10,600', image:'https://picture1.goo-net.com/7001002180/30260730/Q/70010021803026073000200.jpg', grade:'4.0', status:'In Stock', location:'Okayama', tr:'AT', drv:'2WD', eng:'1,800cc', seats:5, col:'White', st:'RHD', stock_no:'1002180A30260730W002', images:['https://picture1.goo-net.com/7001002180/30260730/Q/70010021803026073000200.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00201.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00202.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00203.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00204.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00205.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00206.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00207.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00208.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00209.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00210.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00211.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00212.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00213.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00214.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00215.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00216.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00217.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00218.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00219.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00220.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00221.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00222.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00223.jpg','https://picture1.goo-net.com/100/1002180/Q/1002180A30260730W00224.jpg']}];


const DUTY={'Pakistan':48,'UAE':5,'Kenya':25,'United Kingdom':10,'New Zealand':10,'Tanzania':25};
const priceOf=c=>typeof c?.price==='number'?c.price:Number(String(c?.price??'').replace(/[^0-9.]/g,''))||0;
const kmNum=c=>Number(String(c?.km||'').replace(/[^0-9]/g,''))||0;
// Export-market style filters (modelled on Japanese exporter search bars):
// model year and odometer ceilings, on top of make/price/body/fuel.
const YEAR_MIN={'2023+':2023,'2020+':2020,'2018+':2018,'2015+':2015};
const statusSlug=s=>String(s||'in-stock').replace(/\s+/g,'').toLowerCase();
// Vehicle prices are converted only after an item-specific discount is
// applied. A discount is always keyed by the same carRef used in public URLs.
const carDiscountedUSD=(car,discounts)=>{
 const item=stockDiscountFor(discounts,'car',carRef(car));
 return priceWithOffer(priceOf(car),item?.percent||0).now;
};
const useCarPrice=discounts=>{
 const {fmt,isBase}=useCurrency();
 return c=>{
  const item=stockDiscountFor(discounts,'car',carRef(c));
  const price=priceWithOffer(priceOf(c),item?.percent||0);
  return !price.hasOffer&&isBase&&typeof c?.price==='string'&&c.price.trim()?c.price:fmt(price.now);
 };
};

function VehiclePriceDisplay({car,discounts,className=''}){
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
const stockNo=c=>c.stock_no||('AR7-'+(26000+c.id));
// "Auction sheet" badges may only appear when the vehicle record actually
// carries sheet evidence (auction_sheet / sheet fields, settable from the
// CRM). Nothing in today's data contract does, so the badge is absent until
// real evidence exists — it must never be applied universally.
const hasAuctionSheet=c=>!!(c&&(c.auction_sheet===true||c.auction_sheet==='true'||(typeof c.auction_sheet==='string'&&c.auction_sheet.trim())||(typeof c.sheet==='string'&&c.sheet.trim())));
// Compact vehicle label for dashboards and auction previews. Uses the real
// lot number when the record carries one, otherwise the stock reference via
// the existing routing utilities — NEVER a fabricated 'LOT' + database id,
// which produced nonsense like 'LOT 51<uuid>08' for CRM rows with uuid ids.
export const stockLabel=c=>!c?'':(c.lot_no&&String(c.lot_no).trim()?`Lot ${String(c.lot_no).trim()}`:`Stock ${carRef(c)}`);
const estimateFor=(c,dest,discounts)=>{const d=DEST.find(x=>x[1]===dest)||DEST[0];const offer=stockDiscountFor(discounts,'car',carRef(c));const p=priceWithOffer(priceOf(c),offer?.percent||0).now;const freight=Math.round(d[4]+p*0.016);const docs=350;const ins=Math.round(p*0.016);return{d,freight,docs,ins,cif:p+freight+docs+ins,days:(d[2].match(/\d+/)||[19])[0]}};
const BRANDS=()=>{const m={};cars.forEach(c=>{(m[c.make]=m[c.make]||[]).push(c)});return Object.keys(m).sort((a,b)=>m[b].length-m[a].length).map(k=>({name:k,count:m[k].length,models:[...new Set(m[k].map(c=>c.model.split(' ')[0]))].slice(0,4)}))};
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
const PAYMENTS=[['Bank transfer (T/T)','Direct USD or JPY transfer to our corporate account. Most common worldwide.',Landmark],['Card payment','Visa / Mastercard for smaller balances via secure gateway.',CreditCard],['PayPal','Convenient for demo and small-vehicle purchases.',BadgePercent],['AR7 escrow','Funds released to us only when your vehicle is loaded and documents issued.',ShieldCheck]];

const FLAG={'Pakistan':'🇵🇰','UAE':'🇦🇪','Kenya':'🇰🇪','Tanzania':'🇹🇿','United Kingdom':'🇬🇧','New Zealand':'🇳🇿','Australia':'🇦🇺','USA':'🇺🇸','Other':'🌍'};
const LOGO=m=>'/assets/logos/'+m.toLowerCase()+'.png';
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
 c.doors=DOORS[c.body]||4;return c};
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
 try{
  // Machinery hydrates in the same parallel batch as the cars, so the
  // catalogue, the home teaser and the sitemap all agree on one snapshot.
  // A machine is never hidden behind a permission here: the API has already
  // filtered to published rows and stripped any photo without a rights basis,
  // so what lands is exactly what the public may see.
  const [rows,dealer,machines,articles]=await Promise.all([
   getJson('/api/site-content?entity=listings'),
   getJson('/api/goonet-stock'),
   getJson('/api/site-content?machinery=list'),
   getJson('/api/site-content?entity=articles')
  ]);
  const mapped=[];
  if(Array.isArray(rows)&&rows.length){
   mapped.push(...rows.map((r,i)=>enrichCar({...r,id:listingId(r)??(i+1),image:r.image||'/assets/ar7-mark.png'},i)));
  }
  if(Array.isArray(dealer)&&dealer.length){
   mapped.push(...mapDealerRows(dealer).map((c,i)=>enrichCar({...c,image:c.image||'/assets/ar7-mark.png'},i)));
  }
  if(mapped.length){cars.length=0;cars.push(...mapped);}
  // Empty or failed → the built-in MACHINES fallback stands. The page must
  // never go blank because an API call was slow or the table is unprovisioned.
  hydrateMachines(machines);
  if(Array.isArray(articles))setPublishedNews(articles);
 }catch{/* offline or not provisioned yet — keep built-in content */}
 contentHydrated=true;
 contentListeners.forEach(fn=>{try{fn()}catch{}});
}
if(typeof window!=='undefined')hydrateSiteContent();

const VEHICLE_GALLERIES={
 11:[1,2,3,4,5].map(n=>`/assets/gallery/audi-r8-v10-${String(n).padStart(2,'0')}.webp`),
 12:[1,2,3,4,5].map(n=>`/assets/gallery/lexus-lc-500-${String(n).padStart(2,'0')}.webp`)
};
// Never mix photographs from different vehicles. Uses custom vehicle photo gallery
// configured via CRM when present, otherwise verified model galleries or cover image.
const galleryFor=c=>{
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
 return VEHICLE_GALLERIES[c.id]||(c.image?[c.image]:['/assets/ar7-mark.png']);
};

// Real anchor for in-app pages. Renders a true href (so the browser's
// right-click / Ctrl+click "open in new tab" works everywhere) but keeps
// single-page-app navigation for plain left-clicks via linkClick.
function PageLink({to, navigate, opts, className, children, ...rest}) {
  return <a href={hrefFromTarget(to)} className={className} onClick={linkClick(to, navigate, opts)} {...rest}>{children}</a>;
}

function VehicleCard({c,onOpen,comp,onCmp,discounts}){
 const href=hrefFor('inventory',carRef(c));
 return <a className="car-card page-car" href={href} onClick={onOpen?linkClick(`inventory?car=${carRef(c)}`,()=>onOpen(c)):undefined}>
 <div className="car-image"><img loading="lazy" decoding="async" width="820" height="550" src={c.image} alt={carAlt(c)}/><span className={'status '+statusSlug(c.status)}>{c.status||'In Stock'}</span><span className="grade">Grade <b>{c.grade}</b></span></div>
 <div className="car-info"><div className="make"><img loading="lazy" decoding="async" width="34" height="22" src={LOGO(c.make)} alt="" onError={logoOnError}/>{c.make}</div><h3>{c.model}</h3><div className="specs"><span><CalendarDays/> {c.year}</span><span><Gauge/> {c.km} km</span><span><Fuel/> {c.fuel}</span><span><ArrowLeftRight/> {c.tr}</span></div><div className="car-bottom"><div><small>EXPORT PRICE FROM</small><VehiclePriceDisplay car={c} discounts={discounts}/></div><button type="button" className={"cmp-chip "+(comp?'on':'')} aria-pressed={!!comp} aria-label={(comp?'Remove ':'Add ')+(c.make||'')+' '+(c.model||'')+(comp?' from':' to')+' the comparison'} onClick={e=>{e.preventDefault();e.stopPropagation();onCmp&&onCmp(c)}}><ArrowLeftRight/>{comp?'Added':'Compare'}</button><span className="card-open"><ArrowUpRight/></span></div><div className="loc"><MapPin/> {c.location}, Japan</div></div>
 </a>}

// Internal links into live stock. The guide, brand and news pages used to end
// at a "talk to our team" modal with no route through to an actual car, which
// left whole sections of the site with no link to the inventory detail pages a
// crawler has to reach. Every link below points at a car taken from the same
// `cars` array the /inventory grid renders, so the destination always exists
// — and if there is no stock at all the block renders nothing rather than a
// dead link.
function RelatedStock({navigate,pick,limit=3,kicker='IN STOCK NOW',note}){
 const all=Array.isArray(pick)?pick:(typeof pick==='function'?cars.filter(pick):cars);
 const shown=all.filter(c=>c&&carRef(c)).slice(0,limit);
 if(!shown.length)return null;
 return <aside className="related-stock">
  <div className="kicker">{kicker}</div>
  {note&&<p className="related-stock-note">{note}</p>}
  <div className="related-stock-grid">{shown.map(c=><PageLink key={c.id} className="related-stock-card" to={'/inventory/'+encodeURIComponent(carRef(c))} navigate={navigate}>
   <img loading="lazy" decoding="async" width="820" height="550" src={c.image||'/assets/ar7-mark.png'} alt={carAlt(c)}/>
   <b>{c.make} {c.model}</b><small>{c.year?`${c.year} · `:''}{carRef(c)}</small>
  </PageLink>)}</div>
  <PageLink className="outline-btn" to="inventory" navigate={navigate}>Browse all stock <ArrowRight/></PageLink>
 </aside>;
}

// The cars a piece of copy actually names. Matching the article's own words
// keeps the link genuinely relevant, needs no extra field to keep in sync, and
// works for database-sourced articles as well as the demo set.
function stockNamedIn(text,limit=3){
 const t=String(text||'').toLowerCase();
 if(!t)return [];
 const seen=new Set();const out=[];
 for(const c of cars){
  const make=String(c.make||'').toLowerCase();
  const model=String(c.model||'').toLowerCase().split(' ')[0];
  if(seen.has(make))continue;
  if((make.length>2&&t.includes(make))||(model.length>2&&t.includes(model))){
   seen.add(make);out.push(c);
   if(out.length>=limit)break;
  }
 }
 return out;
}

// Internal links from the guides into the machinery catalogue — the machinery
// type pages used to be reachable only from the nav and the home teaser, so
// the blog never passed them any link equity. Machines the article actually
// names come first (a RoRo guide that mentions a tipper links to trucks); the
// rest is filled one-per-type so every article carries real machinery links.
function machinesNamedIn(text,limit=3){
 const t=String(text||'').toLowerCase();
 const named=t?MACHINES.filter(m=>{
  const words=(m.name+' '+m.brand).toLowerCase().split(/[^a-z0-9]+/).filter(w=>w.length>2);
  return words.some(w=>t.includes(w));
 }):[];
 const out=[...named];
 for(const t2 of MACHINE_TYPES){
  if(out.length>=limit)break;
  const m=MACHINES.find(x=>x.type===t2&&!out.includes(x));
  if(m)out.push(m);
 }
 return out.slice(0,limit);
}
function RelatedMachines({navigate,pick,limit=3,kicker='MACHINERY FROM OUR CHINA DESK',note}){
 const all=Array.isArray(pick)?pick:MACHINES;
 const shown=all.filter(m=>m&&!m.photosPending&&machineImages(m).length).slice(0,limit);
 if(!shown.length)return null;
 return <aside className="related-stock related-machines">
  <div className="kicker">{kicker}</div>
  {note&&<p className="related-stock-note">{note}</p>}
  <div className="related-stock-grid">{shown.map(m=><PageLink key={m.id} className="related-stock-card" to={machineHref(m)} navigate={navigate}>
   <img loading="lazy" decoding="async" width="820" height="550" src={machineImages(m)[0]} alt={`${m.name} for export from China`}/>
   <b>{m.name}</b><small>{m.year} · ${listPriceUSD(m).toLocaleString('en-US')} FOB · {m.type}</small>
  </PageLink>)}</div>
  <PageLink className="outline-btn" to="/machinery" navigate={navigate}>Browse all machinery <ArrowRight/></PageLink>
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
 const want=Math.min(8,pool.length);
 const step=pool.length/Math.max(want,1);
 const carsOut=[];
 for(let i=0;i<want;i++){
  const x=pool[Math.floor(i*step)];if(!x)continue;
  const ref=carRef(x);
  carsOut.push({kind:'car',id:'c'+ref,image:x.image,alt:carAlt(x),href:hrefFor('inventory',ref),
   tag:(x.status||'In stock').toUpperCase(),title:x.make+' '+x.model,
   meta:`${x.year} · Grade ${x.grade} · ${fmtPrice(x)}`});
 }
 // One machine per type, and only a machine that actually has a photograph —
 // the hero must never show the "photos on request" panel.
 const machinesOut=[];
 for(const t of MACHINE_TYPES){
  const m=MACHINES.find(x=>x.type===t&&!x.photosPending&&machineImages(x).length);
  if(!m)continue;
  machinesOut.push({kind:'machine',id:'m'+m.id,image:machineImages(m)[0],
   alt:`${m.name} machinery from China`,
   href:'/machinery',tag:'MACHINERY · CHINA',title:m.name,
   meta:`${m.year} · ${m.hours.toLocaleString('en-US')} h · $${listPriceUSD(m).toLocaleString('en-US')} FOB`});
 }
 // Weave: two cars, then a machine.
 const woven=[];
 for(let ci=0,mi=0;ci<carsOut.length||mi<machinesOut.length;){
  for(let k=0;k<2&&ci<carsOut.length;k++)woven.push(carsOut[ci++]);
  if(mi<machinesOut.length)woven.push(machinesOut[mi++]);
 }
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

function HeroVisual({navigate,discounts}){
 const wrap=useRef(null);
 const price=useCarPrice(discounts);
 const auctionEnds=useRef(heroAuctions.map(a=>Date.now()+a.seconds*1000));
 const [manualIdx,setManualIdx]=useState(0);
 const [elapsed,setElapsed]=useState(0);
 useEffect(()=>{
  const el=wrap.current,query=window.matchMedia('(prefers-reduced-motion: reduce)');let timer;
  const tick=()=>{if(el&&!query.matches&&!document.hidden&&!el.matches(':hover,:focus-within'))setElapsed(v=>v+1)};
  const io=new IntersectionObserver(([entry])=>entry.isIntersecting?timer=setInterval(tick,1000):clearInterval(timer));
  io.observe(el);
  return()=>{clearInterval(timer);io.disconnect()}
 },[]);
 const onMove=e=>{const el=wrap.current;if(!el)return;const r=el.getBoundingClientRect();const mx=((e.clientX-r.left)/r.width-.5).toFixed(3),my=((e.clientY-r.top)/r.height-.5).toFixed(3);el.style.setProperty('--mx',mx);el.style.setProperty('--my',my)};
 const onLeave=()=>{const el=wrap.current;if(!el)return;el.style.setProperty('--mx','0');el.style.setProperty('--my','0')};
 const slides=heroSlides(price);
 const moveSlide=delta=>setManualIdx(v=>(v+delta+slides.length)%slides.length);
 const activeIndex=(manualIdx+Math.floor(elapsed/3.2))%slides.length;
 const auctionIdx=Math.floor(elapsed/4.6)%heroAuctions.length;
 const routeIdx=Math.floor(elapsed/5.6)%heroRoutes.length;
 const c=slides[activeIndex]||slides[0];
 const heroImages=c ? [c, slides[(activeIndex+1)%slides.length]]
  .filter((x,i,a)=>x && a.findIndex(y=>y?.id===x.id)===i) : [];
 const auction=heroAuctions[auctionIdx];
 const route=heroRoutes[routeIdx];
 const remaining=(auctionEnds.current[auctionIdx]-Date.now())/1000;
 if(!c)return null;
 return <div className="hero-visual" ref={wrap} onMouseMove={onMove} onMouseLeave={onLeave}>
   {/* The rotating card is a link preview, not a document section, but it does show
       real headings for each vehicle — so the hero gets its own screen-reader heading
       and the heading order stays h1 → h2 → h3 for anyone navigating by headings. */}
   <h2 className="sr-only">Japan cars, China machinery</h2>
  <i className="spark s1"/><i className="spark s2"/><i className="spark s3"/><i className="spark s4"/><i className="spark s5"/><i className="spark s6"/>
  <a className={'hero-card car-main'+(c.kind==='machine'?' is-machine':'')} href={c.href} onClick={linkClick(c.href,navigate)}>
   <div className="hero-stack">{heroImages.map((x,n)=><img key={x.id} className={n===0?'active':''} width="820" height="550" src={x.image} alt={x.alt} loading={n===0?'eager':'lazy'} fetchPriority={n===0?'high':'low'} decoding="async"/>)}</div>
   <div className="image-shade"/>
   <div className="car-float-title" key={activeIndex}>
    <span>{c.tag}</span><h3>{c.title}</h3><p>{c.meta}</p>
   </div>
   <div className="car-dots">{slides.map((x,n)=><i key={x.id} className={(x.kind==='machine'?'machine ':'')+(n===activeIndex?'active':'')}/>)}</div>
   <div className="car-counter">{c.kind==='machine'?<Wrench/>:<CarFront/>} {activeIndex+1}/{slides.length} · {c.kind==='machine'?'China machinery desk':'rotating stock'}</div>
  </a>
  <div className="hero-carousel-controls">
   <button type="button" onClick={()=>moveSlide(-1)} aria-label="Prev"><ChevronLeft/></button>
   <button type="button" onClick={()=>moveSlide(1)} aria-label="Next"><ChevronRight/></button>
  </div>
  <div className="floating-card auction-card" aria-hidden="true"><Gavel/><div className="rotating-card-copy" key={auctionIdx}>
   <span className="card-kicker"><i className="card-live"/>Auction · {auction.city}</span>
   <b className="card-title">{auction.name}</b>
   <small className="card-meta card-countdown"><Clock3/> Starts in {formatCountdown(remaining)}</small>
   <div className="card-foot"><div className="card-rotation-dots">{heroAuctions.map((_,n)=><i key={n} className={n===auctionIdx?'active':''}/>)}</div><i className="card-demo">demo</i></div>
  </div></div>
  <div className="floating-card route-card" aria-hidden="true"><div className="rotating-card-copy" key={routeIdx}>
   <div className="route-head"><Globe2/><span className="card-kicker">Shipping lane · {routeIdx+1}/{heroRoutes.length}</span></div>
   <div className="route-lane-row">
    <b className="card-title route-lane">{route.from}<ArrowRight className="lane-arrow"/>{route.to}</b>
    <i className="lane-eta">{route.eta}</i>
   </div>
   <div className="progress" style={{'--route-progress':route.progress+'%'}}><span><Ship className="route-ship"/></span></div>
   <small className="card-meta route-status"><Ship/> {route.status}</small>
   <div className="card-foot"><div className="card-rotation-dots route-dots">{heroRoutes.map((_,n)=><i key={n} className={n===routeIdx?'active':''}/>)}</div><i className="card-demo">demo</i></div>
  </div></div>
  <div className="floating-badge" aria-hidden="true"><BadgeCheck/><span><b>Auction sheets translated</b><small>Grade, marks and repair history in plain English.</small></span></div>
 </div>}

const globeSeg=(s)=><div className="imap" key={s}>
  <span className="land l1"/><span className="land l2"/><span className="land l3"/><span className="land l4"/><span className="land l5"/>
  <svg className="iglobe-routes" viewBox="0 0 360 360" preserveAspectRatio="none" fill="none" aria-hidden="true"><path className="arc a1" d="M-20 128 Q150 14 380 118"/><path className="arc a2" d="M-20 224 Q165 326 380 208"/><path className="arc a3" d="M60 62 Q200 208 340 58"/></svg>
  <span className="imover m1"><CarFront/></span><span className="imover m2"><Ship/></span><span className="imover m3"><CarFront/></span>
 </div>;

function InteractiveGlobe({compact,lite,cls,onTap}){
 const ref=useRef(null);
 useEffect(()=>{
  const el=ref.current; if(!el)return;
  // Drag state. `x` spins the map strip horizontally (seamless, so the visitor
  // can keep spinning forever); `lat` slides the same strip up and down so the
  // globe can be dragged in ANY direction like a real one. `lat` is clamped to
  // half the strip's overhang, which is what stops the strip from running out
  // and exposing an empty edge — the sliver that used to look like a "white
  // part" on the header globe.
  const st={x:0,lat:0,vel:0,drag:false,lx:0,ly:0,tilt:0,moved:false,sx:0,sy:0,faceW:0,faceH:0,maxLat:0};
  let raf=0,prev=performance.now(),visible=false,destroyed=false;
  const motionQuery=typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reduced=!!motionQuery?.matches;
  // Geometry is measured once (and again on resize) instead of reading
  // offsetWidth inside the animation frame, which forced a layout on every tick.
  const measure=()=>{
   const face=el.querySelector('.iglobe-face'),maps=el.querySelector('.iglobe-maps');
   if(!face)return;
   st.faceW=face.offsetWidth||el.offsetWidth||1;
   st.faceH=face.offsetHeight||st.faceW;
   const mapsH=maps?maps.offsetHeight:st.faceH;
   st.maxLat=Math.max(0,(mapsH-st.faceH)/2);
  };
  const apply=()=>{
   if(!st.faceW)measure();
   const w=st.faceW||1;
   while(st.x<=-w)st.x+=w; while(st.x>0)st.x-=w;
   st.lat=Math.max(-st.maxLat,Math.min(st.maxLat,st.lat));
   el.style.setProperty('--rot',st.x.toFixed(2)+'px');
   el.style.setProperty('--lat',st.lat.toFixed(2)+'px');
   el.style.setProperty('--tilt',st.tilt.toFixed(2)+'deg');
  };
  const schedule=()=>{
   if(!raf&&!destroyed&&visible&&!document.hidden&&(!reduced||st.drag))raf=requestAnimationFrame(loop);
  };
  const loop=t=>{
   raf=0;
   if(destroyed||!visible||document.hidden)return;
   const dt=Math.min(t-prev,40);prev=t;
   if(!st.drag&&!reduced){
    st.x+=0.10*dt/16;
    st.x+=st.vel*dt/16;st.vel*=Math.pow(0.93,dt/16);
    st.tilt+=(0-st.tilt)*0.045*dt/16;
   }
   apply();
   schedule();
  };
  const onVisible=en=>{
   visible=!!en[0]?.isIntersecting;
   if(visible){prev=performance.now();schedule();}
   else if(raf){cancelAnimationFrame(raf);raf=0;}
  };
  const io=typeof IntersectionObserver==='function'?new IntersectionObserver(onVisible,{threshold:0}):null;
  if(io)io.observe(el);else{visible=true;schedule();}
  // Re-measure when the button or globe changes size (responsive breakpoints,
  // iframe previews in the device studio) so the drag limits stay correct.
  const ro=typeof ResizeObserver==='function'?new ResizeObserver(()=>{measure();apply()}):null;
  if(ro)ro.observe(el);
  const onVisibility=()=>{
   if(document.hidden&&raf){cancelAnimationFrame(raf);raf=0;}
   else{prev=performance.now();schedule();}
  };
  const onMotion=e=>{reduced=!!e.matches;if(!reduced)schedule();};
  document.addEventListener('visibilitychange',onVisibility);
  if(motionQuery?.addEventListener)motionQuery.addEventListener('change',onMotion);
  else motionQuery?.addListener?.(onMotion);
  const dn=e=>{st.drag=true;st.moved=false;st.sx=e.clientX;st.sy=e.clientY;st.lx=e.clientX;st.ly=e.clientY;el.classList.add('dragging');schedule();if(el.setPointerCapture)try{el.setPointerCapture(e.pointerId)}catch(_){} };
  const mv=e=>{if(!st.drag)return;const dx=e.clientX-st.lx,dy=e.clientY-st.ly;st.lx=e.clientX;st.ly=e.clientY;st.x+=dx;st.lat+=dy*0.62;st.vel=dx*0.82;st.tilt=Math.max(-14,Math.min(14,st.tilt-dy*0.12));if(Math.abs(e.clientX-st.sx)+Math.abs(e.clientY-st.sy)>7)st.moved=true;apply();schedule();};
  const up=()=>{if(!st.drag)return;st.drag=false;el.classList.remove('dragging');if(!st.moved&&onTap)onTap();schedule();};
  el.addEventListener('pointerdown',dn);
  window.addEventListener('pointermove',mv,{passive:true});
  window.addEventListener('pointerup',up);
  window.addEventListener('pointercancel',up);
  return()=>{destroyed=true;if(raf)cancelAnimationFrame(raf);io?.disconnect();ro?.disconnect();document.removeEventListener('visibilitychange',onVisibility);if(motionQuery?.removeEventListener)motionQuery.removeEventListener('change',onMotion);else motionQuery?.removeListener?.(onMotion);el.removeEventListener('pointerdown',dn);window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up)}
 },[]);
 return <div className={'iglobe'+(compact?' compact':'')+(lite?' lite':'')+(cls?' '+cls:'')} ref={ref}>
  <div className="iglobe-halo"/><div className="iglobe-sphere">
   <i className="graticule g1"/><i className="graticule g2"/><i className="graticule g3"/><i className="graticule g4"/><i className="graticule g5"/>
   <div className="iglobe-face">
    <div className="iglobe-maps">{[0,1,2].map(globeSeg)}</div>
    <i className="iglobe-shine"/>
    <span className="iglobe-pin p1"/><span className="iglobe-pin p2"/><span className="iglobe-pin p3"/>
   </div>
   <i className="iglobe-sheen"/>
  </div>
  <div className="orbit-ring o1"><span className="orbiter"><i className="orb-badge ship"><Ship/></i></span></div>
  <div className="orbit-ring o2"><span className="orbiter"><i className="orb-badge car"><CarFront/></i></span></div>
  <div className="orbit-ring o3"><span className="orbiter"><i className="orb-badge car alt"><CarFront/></i></span></div>
  {!lite&&<span className="iglobe-plane"><Plane/></span>}
  <span className="drag-hint"><i/> DRAG TO ROTATE · CLICK TO EXPLORE</span>
 </div>}

function MotionShowcase({navigate}){return <section className="motion-showcase"><div className="shell motion-grid"><div className="motion-copy"><div className="kicker">THE AR7 GLOBAL SUPPLY NETWORK</div><h2>Cars in motion.<br/><em>Trade without borders.</em></h2><p>Watch the demo route from auction floor to destination port. Every vehicle, document and milestone stays visible.</p><div className="motion-metrics"><span><b>Major</b> Japanese auction houses</span><span><b>RoRo +</b> Container shipping</span><span><b>1</b> Accountable team</span></div><div className="globe-legend"><span><i className="lg car"/> Sample route</span><span><i className="lg ship"/> Demo vessel</span><span><i className="lg pin"/> Destination ports</span></div></div><div className="globe-scene"><div className="globe-wrap"><InteractiveGlobe onTap={()=>navigate('world')}/><div className="float-label japan"><small>ORIGIN</small><b>Yokohama, Japan</b></div><div className="float-label shipment"><small>SAMPLE SHIPMENT</small><b>AR7-260184</b></div></div></div></div><div className="vehicle-track"><div className="track-streaks"/><div className="road-lines"/><div className="moving-plane"><Plane/></div><div className="moving-car convoy"><CarFront/></div><div className="moving-car"><CarFront/><span>AUCTION WON</span></div><div className="moving-ship"><Ship/><span>VESSEL BOOKED</span></div><p>USS TOKYO <i/> INSPECTION YARD <i/> YOKOHAMA PORT <i/> WORLDWIDE</p></div></section>}

function DeviceStudio({navigate}){
 const [device,setDevice]=useState('laptop');
 const sizes={phone:[390,720],tablet:[768,720],laptop:[1100,700],desktop:[1360,720]}; const [w,h]=sizes[device];
 return <section className="device-page"><div className="page-orb-wrap studio-orb"><InteractiveGlobe lite cls="mini" onTap={()=>navigate('world')}/></div><div className="shell"><div className="device-head"><div><div className="kicker">RESPONSIVE VIEW STUDIO</div><h1>Test every <em>screen.</em></h1><p>Switch devices to preview the AR7 website at realistic viewport sizes.</p></div><div className="device-tabs"><button className={device==='phone'?'active':''} onClick={()=>setDevice('phone')} type="button"><Smartphone/>Phone</button><button className={device==='tablet'?'active':''} onClick={()=>setDevice('tablet')} type="button"><Tablet/>Tablet</button><button className={device==='laptop'?'active':''} onClick={()=>setDevice('laptop')} type="button"><Laptop/>Laptop</button><button className={device==='desktop'?'active':''} onClick={()=>setDevice('desktop')} type="button"><Monitor/>PC</button></div></div><div className={'device-frame '+device} style={{'--frame-w':w+'px','--frame-h':h+'px'}}><div className="camera-dot"/><iframe src={'/?embed=1'+BUILD_STAMP} title="AR7 responsive preview"/></div><div className="device-size">{w} × {h} px · interactive demo</div></div></section>
}

function ExtraPage({type,navigate,openAuction}){
 const {fmt}=useCurrency();
 const [open,setOpen]=useState(0),[service,setService]=useState(0),[port,setPort]=useState(DEST[0][0]),[portalTab,setPortalTab]=useState('Shipments');
 const destGuideRef=useRef(null);
 const activeDest=DEST.find(x=>x[0]===port||x[1]===port||x[1].startsWith(port))||DEST[0];
 const selectDest=val=>{
  setPort(val);
  if(destGuideRef.current?.scrollIntoView){
   try{destGuideRef.current.scrollIntoView({behavior:'smooth',block:'nearest'});}catch{}
  }
 };
 const headers={
  services:['WHAT WE DO',<>Complete vehicle<br/><em>sourcing solutions.</em></>,'Auction bidding, dealer sourcing, inspection, logistics and export paperwork—managed by one accountable team.'],
  destinations:['WORLDWIDE EXPORT',<>Routes built for<br/><em>your market.</em></>,'Destination guides, estimated transit windows and popular vehicles for every region we serve.'],
  reviews:['CUSTOMER STORIES & IMPORT REVIEWS',<>Real reviews,<br/><em>global buyers.</em></>,'Verified import stories from private buyers and car businesses — translated auction sheets, USS Tokyo bidding, Goo-net dealer stock and RoRo or container shipping to your port.'],
  faq:['HELP CENTER',<>Clear answers.<br/><em>Confident buying.</em></>,'Everything you need to know about Japanese auctions, payment, inspection and international shipping.'],
  portal:['CLIENT PORTAL DEMO',<>Every update.<br/><em>One dashboard.</em></>,'Explore a working demo of the AR7 customer portal for bids, payments, documents and shipments.']};
 const h=headers[type];
 const services=[['Auction sourcing','Live access to USS, TAA, JU, CAA and more.','100,000+ weekly listings'],['Dealer stock','Curated off-auction vehicles from trusted networks.','Fast purchase decisions'],['Inspection','Independent condition checks, photos and road tests.','Clear condition report'],['Export logistics','Booking, customs, insurance and documentation.','Destination markets worldwide'],['Parts sourcing','Optional OEM parts and accessories before shipment.','Consolidated shipping'],['Dealer programs','Volume sourcing and dedicated account support.','Wholesale pricing']];
 return <section className="inner-page extra-page"><div className="page-hero mini extra-head"><div className="page-orb-wrap"><InteractiveGlobe lite cls="mini" onTap={()=>navigate('world')}/></div><div className="shell"><div className="kicker">{h[0]}</div><h1>{h[1]}</h1><p>{h[2]}</p>{type==='portal'?<PageLink className="gold-btn" to="account" navigate={navigate}>Open my real account <ArrowRight/></PageLink>:<button className="gold-btn" onClick={openAuction} type="button">Talk to our team <ArrowRight/></button>}</div></div><div className="shell page-content">
 {type==='services'&&<><div className="service-layout"><div className="service-tabs">{services.map((x,i)=><button key={x[0]} className={service===i?'active':''} onClick={()=>setService(i)} type="button"><span>0{i+1}</span>{x[0]}<ArrowRight/></button>)}</div><div className="service-panel"><Gavel/><div className="kicker">AR7 SERVICE 0{service+1}</div><h2>{services[service][0]}</h2><p>{services[service][1]}</p><strong>{services[service][2]}</strong><ul><li><Check/> Dedicated Japan-based specialist</li><li><Check/> Transparent itemized quotation</li><li><Check/> Photo and status updates</li></ul><button className="primary" onClick={openAuction} type="button">Request this service</button></div></div><RelatedStock navigate={navigate} kicker="AVAILABLE FOR THIS SERVICE" note="Stock currently listed in our Japan inventory."/><div className="demo-strip">{[['Japan-wide','Auction sourcing'],['Personal','One point of contact'],['100%','Cost transparency'],['1 team','End-to-end support']].map(x=><div key={x[1]}><b>{x[0]}</b><span>{x[1]}</span></div>)}</div></>}
 {type==='destinations'&&<><RelatedStock navigate={navigate} limit={6} kicker="POPULAR IN THIS MARKET" note="Stock already in Japan and ready to quote for your route."/><div className="destination-picker"><div><div className="kicker">DEMO ROUTE CALCULATOR</div><h2>Where are we shipping?</h2></div><select value={activeDest[0]} onChange={e=>setPort(e.target.value)} aria-label="Select destination market">{DEST.map(x=><option key={x[0]} value={x[0]}>{FLAG[x[0]]} {x[0]} — {x[1].split(' / ')[0]}</option>)}</select><button className="primary" onClick={openAuction} type="button">Get shipping quote</button></div><section className="destination-guide" ref={destGuideRef} aria-label={`${activeDest[0]} market guide`}><div className="destination-guide-head"><div><div className="kicker">{FLAG[activeDest[0]]} DESTINATION GUIDE · {activeDest[0].toUpperCase()}</div><h2>{activeDest[0]} — <em>{activeDest[1]}</em></h2><p className="destination-guide-meta"><Ship/> Planning transit estimate: <b>{activeDest[2]}</b> (vessel schedules and transshipment vary) · Popular models: <b>{activeDest[3]}</b></p></div><button type="button" className="primary" onClick={openAuction}>Quote for {activeDest[1].split(' / ')[0]} <ArrowRight/></button></div><div className="destination-guide-cols"><article className="destination-guide-card"><div className="kicker">BEFORE DEPARTURE</div><h3>What to expect in Japan</h3><p>{activeDest[5]}</p></article><article className="destination-guide-card"><div className="kicker">PORT CLEARANCE</div><h3>On arrival at {activeDest[1]}</h3><p>{activeDest[6]}</p></article></div><p className="destination-guide-note"><ShieldCheck/> <span><b>Customs &amp; import duty:</b> Import duty, local taxes and registration charges are always determined by your own country’s customs authority at the port of entry — we prepare the full export document pack your clearing agent needs.</span></p></section><div className="destination-grid">{DEST.map(x=><article key={x[0]} className={activeDest[0]===x[0]?'active':''}><Globe2/><div className="kicker">{FLAG[x[0]]} {x[0]}</div><h3>{x[1]}</h3><p><Ship/> Estimated transit (planning figure): <b>{x[2]}</b></p><small>POPULAR: {x[3]}</small><button type="button" onClick={()=>selectDest(x[0])}>{activeDest[0]===x[0]?'Viewing market guide':'View market guide'} <ArrowRight/></button></article>)}</div></>}
 {type==='reviews'&&<React.Suspense fallback={<div className="empty-state"><h3>Loading customer reviews…</h3></div>}><ReviewsShowcase navigate={navigate} openAuction={openAuction} founderClaim={FOUNDER_CLAIM}/></React.Suspense>}
 {type==='faq'&&<div className="faq-layout"><div><div className="kicker">POPULAR QUESTIONS</div><h2>Buying from Japan, explained.</h2><p>Practical answers on Japanese auctions, dealer stock, pricing, shipping and port clearance — grouped by topic.</p><PageLink className="primary" to="contact" navigate={navigate}>Ask another question</PageLink><RelatedStock navigate={navigate} limit={4} kicker="ANSWERING YOUR QUESTION WITH REAL STOCK" note="Cars already in Japan that match what buyers ask us most."/></div><div className="accordions">{FAQ_TOPICS.map(topic=><div className="faq-topic-group" key={topic}><h3 className="faq-topic-title">{topic}</h3>{FAQ_ITEMS.map((x,i)=>x[2]===topic?<article key={x[0]} className={open===i?'open':''}><button type="button" onClick={()=>setOpen(open===i?-1:i)}><span>{x[0]}</span><b>{open===i?'−':'+'}</b></button>{open===i&&<p>{x[1]}</p>}</article>:null)}</div>)}</div></div>}
 {type==='portal'&&<div className="portal-live-note"><ShieldCheck/><div><b>This is a preview of the dashboard.</b><span>Your own vehicles, every payment received and the balance remaining are waiting in your account.</span></div><PageLink className="primary" to="account" navigate={navigate}>Sign in <ArrowRight/></PageLink></div>}
 {type==='portal'&&<div className="portal-demo"><aside><img width="460" height="285" src="/assets/ar7-mark.png" alt="AR7 Traders" loading="lazy" decoding="async"/>{['Shipments','Auctions','Documents','Payments'].map(x=><button key={x} className={portalTab===x?'active':''} onClick={()=>setPortalTab(x)} type="button">{x}</button>)}<small>DEMO ACCOUNT<br/><b>Imran Khan</b></small></aside><section className="portal-main" aria-label="Client portal demo"><header><div><small>CLIENT PORTAL / {portalTab.toUpperCase()}</small><h2>{portalTab}</h2></div><button onClick={openAuction} type="button">Contact agent</button></header>{portalTab==='Shipments'?<div className="portal-shipment"><div className="portal-car"><img loading="lazy" decoding="async" width="820" height="550" src={cars[0].image} alt={carAlt(cars[0])}/><span><small>AR7-260184</small><b>Toyota Land Cruiser ZX</b><em>Yokohama → Karachi</em></span><strong>IN TRANSIT</strong></div><div className="track-line">{['Purchased','Inspected','Loaded','At sea','Arrived'].map((x,i)=><span key={x} className={i<4?'done':''}><i/>{x}<small>{i<4?'Complete':'Sep 08'}</small></span>)}</div></div>:portalTab==='Auctions'?<div className="portal-list">{cars.slice(1,5).map(c=><VehicleCard key={c.id} c={c} discounts={discounts}/>)}</div>:portalTab==='Documents'?<div className="doc-list">{['Commercial invoice.pdf','Export certificate.pdf','Bill of lading.pdf','Inspection report.pdf'].map((x,i)=><button key={x} onClick={openAuction} type="button"><ClipboardCheck/><span><b>{x}</b><small>Updated Aug {12+i}, 2026 · PDF</small></span><ArrowUpRight/></button>)}</div>:<div className="payment-card"><BadgeCheck/><h3>Account up to date</h3><p>All demo invoices have been paid.</p><div><span>Vehicle payment<b>{fmt(58900)}</b></span><span>Freight & insurance<b>{fmt(2480)}</b></span><span>Balance due<b>{fmt(0)}</b></span></div></div>}</section></div>}
 </div></section>
}


function ExtraPages2({type,navigate,openAuction,articleSlug:activeSlug,discounts}){
 const price=useCarPrice(discounts);
 const {fmt,toUsd,display}=useCurrency();
 const headers={
  brands:['BROWSE BY BRAND',<>Every brand.<br/><em>One doorway.</em></>,'Jump straight to the make you want — inventory, popular models and market notes for each brand.'],
  howbuy:['HOW IT WORKS',<>From Tokyo auction<br/><em>to your garage.</em></>,'The complete AR7 purchase flow — bidding, inspection, payment, paperwork and shipping, step by step.'],
  tools:['CALCULATORS',<>Know your numbers<br/><em>before you buy.</em></>,'Estimate freight, CIF cost and import duty to your port with our demo calculators.'],
  news:['AR7 NEWS & GUIDES',<>Market insight.<br/><em>Buying confidence.</em></>,'Auction analysis, buying guides and logistics explainers from our Japan team.']};
 const h=headers[type];
 const [shipDest,setShipDest]=useState('Karachi / Port Qasim'),[shipPrice,setShipPrice]=useState(25000),[shipMethod,setShipMethod]=useState('RoRo');
 const [dutyCountry,setDutyCountry]=useState('Pakistan'),[dutyPrice,setDutyPrice]=useState(25000);
 const [newsCat,setNewsCat]=useState('All');
 const news=getPublishedNews();
 const newsCategories=getNewsCategories();
 const article=type==='news'&&activeSlug?articleBySlug(activeSlug,news):null;
 const filteredNews=newsCat==='All'?news:news.filter(x=>x.cat===newsCat);
 return <section className="inner-page extra-page"><div className="page-hero mini extra-head"><div className="page-orb-wrap"><InteractiveGlobe lite cls="mini" onTap={()=>navigate('world')}/></div><div className="shell"><div className="kicker">{h[0]}</div><h1>{h[1]}</h1><p>{h[2]}</p>{type!=='news'&&<button className="gold-btn" onClick={openAuction} type="button">Talk to our team <ArrowRight/></button>}</div></div><div className="shell page-content">
 {type==='brands'&&<><div className="brand-grid">{BRANDS().map(b=><article className="brand-card" key={b.name}><span className="brand-tile"><img loading="lazy" decoding="async" width="56" height="34" src={LOGO(b.name)} alt={b.name+" logo"} onError={logoOnError}/><small>{b.name}</small></span><div className="brand-body"><div><b>{b.count} vehicles</b><span>now in stock</span></div><div className="brand-models">{b.models.map(m=><a href={inventoryHref(b.name)} onClick={linkClick(inventoryHref(b.name),navigate)} key={m}>{m}</a>)}</div><PageLink className="outline-btn" to={inventoryHref(b.name)} navigate={navigate}>View {b.name} stock <ArrowRight/></PageLink></div></article>)}</div><RelatedStock navigate={navigate} limit={6} kicker="IN STOCK BY BRAND" note="One live car from each make we currently have in Japan." pick={BRANDS().flatMap(b=>cars.filter(c=>c.make===b.name).slice(0,1))}/><div className="demo-strip">{BRANDS().length===0?null:[['12','Brands catalogued'],['30','Vehicles in stock'],['100%','Auction-sourced'],['24h','New stock update']].map(x=><div key={x[0]}><b>{x[0]}</b><span>{x[1]}</span></div>)}</div></>}
 {type==='howbuy'&&<><div className="howbuy-flow">{HOWBUY.map((x,i)=><div className="hb-step" key={x[2]}><span>{x[2]}</span><div><b>{x[0]}</b><p>{x[1]}</p>{x[3]&&<p className="hb-what">{x[3]}</p>}</div>{i<HOWBUY.length-1&&<ArrowRight className="hb-arrow"/>}</div>)}</div><div className="hb-timeline"><div className="kicker">DEMO TIMELINE</div><h2>Typical days from bid to delivery.</h2><div className="hb-days">{[['Day 1','Deposit & bid'],['Day 2','Auction result'],['Day 3–6','Inspection & payment'],['Day 7','Vessel booking'],['Day 18–42','Transit to your port'],['Arrival','Customs & collection']].map(x=><span key={x[0]}><b>{x[0]}</b><small>{x[1]}</small></span>)}</div></div><div className="hb-pay"><div className="kicker">PAYMENT OPTIONS</div><h2>Pay the way your market prefers.</h2><div className="pay-grid">{PAYMENTS.map(x=>{const PI=x[2];return <article key={x[0]}><PI/><b>{x[0]}</b><p>{x[1]}</p></article>})}</div></div><div className="hb-docs"><div className="kicker">WITH EVERY SHIPMENT</div><h2>Documents we prepare for you.</h2><div className="doc-pills">{['Commercial invoice','Export certificate','Certificate of origin','Bill of lading','Insurance certificate','Sales contract'].map(x=><span key={x}><FileCheck/> {x}</span>)}</div></div><RelatedStock navigate={navigate} limit={3} kicker="READY FOR THE NEXT STEP" note="Cars our desk can start bidding on as soon as you set a limit."/></>}
 {type==='tools'&&<><div className="tools-grid"><article className="tool-card"><BookOpen/><div className="kicker">DEMO CIF CALCULATOR</div><h2>Shipping cost to your port</h2><label>DESTINATION PORT<select value={shipDest} onChange={e=>setShipDest(e.target.value)}>{DEST.map(x=><option key={x[1]}>{x[1]}</option>)}</select></label><label>VEHICLE VALUE (FOB {display})<input type="number" value={shipPrice} onChange={e=>setShipPrice(Math.max(500,+e.target.value||0))}/></label><label>SHIPPING METHOD<select value={shipMethod} onChange={e=>setShipMethod(e.target.value)}><option>RoRo</option><option>Container (+$2,000)</option></select></label><div className="calc-out">{(()=>{const v=toUsd(shipPrice);const freight=Math.round(v*0.016+(DEST.find(x=>x[1]===shipDest)||DEST[0])[4]+(shipMethod==='Container (+$2,000)'?2000:0));const docs=350+Math.round(v*0.016);return <><span><small>FREIGHT</small><b>{fmt(freight)}</b></span><span><small>DOCS &amp; INSURANCE</small><b>{fmt(docs)}</b></span><span className="total"><small>EST. CIF TOTAL</small><b>{fmt(v+freight+docs)}</b></span></>})()}</div><small className="demo-note"><LockKeyhole/> Demo estimate in {display} — final quote issued by our export desk.</small></article><article className="tool-card"><Calculator/><div className="kicker">DEMO DUTY CALCULATOR</div><h2>Import duty &amp; taxes</h2><label>DESTINATION COUNTRY<select value={dutyCountry} onChange={e=>setDutyCountry(e.target.value)}>{Object.keys(DUTY).map(x=><option key={x}>{FLAG[x]} {x}</option>)}</select></label><label>VEHICLE VALUE ({display})<input type="number" value={dutyPrice} onChange={e=>setDutyPrice(Math.max(500,+e.target.value||0))}/></label><div className="calc-out"><span><small>EST. DUTY + TAX</small><b>{fmt(toUsd(dutyPrice)*DUTY[dutyCountry]/100)}</b></span><span className="total"><small>LANDED ESTIMATE (CIF + DUTY)</small><b>{fmt(toUsd(dutyPrice)*(1+DUTY[dutyCountry]/100))}</b></span></div><p className="tool-note">Percentages are demo approximations of common applied rates. Local registration fees and port charges vary — our team prepares the exact landed costing for your port.</p></article></div><RelatedStock navigate={navigate} limit={3} kicker="PRICED WITH REAL STOCK" note="Use these numbers against a car currently listed in Japan."/></>}
 {type==='news'&&<>{activeSlug&&!article&&<div className="empty-state article-missing"><Newspaper/><h3>Guide not found</h3><p>This buying guide link is out of date or does not exist. Browse our current Japan import guides instead.</p><PageLink className="primary" to="news" navigate={navigate}>All guides <ArrowRight/></PageLink></div>}
 {article&&<article className="news-article"><PageLink className="back-btn" to="news" navigate={navigate}>← All guides</PageLink><div className="kicker">{article.cat} · {article.date} · {article.min} min read</div><h2>{article.title}</h2><img loading="lazy" decoding="async" width="820" height="550" src={article.img} alt={article.title}/>{article.body.split('\n\n').map((x,i)=><p key={i}>{x}</p>)}<RelatedStock navigate={navigate} limit={3} kicker="STOCK RELATED TO THIS GUIDE" note="Cars in our Japan inventory that match what this article covers." pick={stockNamedIn(article.title+' '+article.body)}/><RelatedMachines navigate={navigate} limit={3} kicker="MACHINERY FROM OUR CHINA DESK" note="Excavators, loaders, tippers and cranes sourced to order — quoted FOB with freight to your port." pick={machinesNamedIn(article.title+' '+article.body)}/><button className="primary" onClick={openAuction} type="button">Ask our team about this <ArrowRight/></button><footer className="news-article-footer"><div className="kicker">KEEP PLANNING YOUR IMPORT</div><nav className="news-article-links" aria-label="Related import resources"><PageLink className="outline-btn" to="destinations" navigate={navigate}>Shipping destinations <ArrowRight/></PageLink><PageLink className="outline-btn" to="shipping" navigate={navigate}>RoRo &amp; container shipping <ArrowRight/></PageLink><PageLink className="outline-btn" to="/machinery" navigate={navigate}>Construction machinery <ArrowRight/></PageLink><PageLink className="outline-btn" to="tools" navigate={navigate}>Estimate import costs <ArrowRight/></PageLink><PageLink className="outline-btn" to="howbuy" navigate={navigate}>How to buy from Japan <ArrowRight/></PageLink><PageLink className="outline-btn" to="faq" navigate={navigate}>Import questions <ArrowRight/></PageLink></nav></footer></article>}
 {!activeSlug&&<><div className="news-filter-bar" role="tablist" aria-label="Filter guides by topic"><button type="button" className={newsCat==='All'?'active':''} onClick={()=>setNewsCat('All')}>All guides</button>{newsCategories.map(cat=><button type="button" key={cat} className={newsCat===cat?'active':''} onClick={()=>setNewsCat(cat)}>{cat}</button>)}</div><div className="news-grid">{filteredNews.map(x=>{const slug=articleSlug(x.title);return <PageLink className="news-card" key={slug} to={'/news/'+slug} navigate={navigate}><img loading="lazy" decoding="async" width="820" height="550" src={x.img} alt={x.title||"AR7 Traders vehicle export"}/><div className="news-meta"><span>{x.cat}</span><small>{x.date} · {x.min} min</small></div><h2>{x.title}</h2><p>{x.excerpt||x.ex}</p><b>Read article <ArrowRight/></b></PageLink>;})}</div><RelatedStock navigate={navigate} limit={4} kicker="IN STOCK NOW" note="Cars already in Japan — the stock our guides are written about."/><RelatedMachines navigate={navigate} limit={3} kicker="ALSO SOURCED TO ORDER" note="Construction machinery from our vetted Chinese suppliers."/></>}
 </>}</div></section>}

function readRoute(loc=typeof location==='undefined'?{}:location,opts){
 const route=parseRoute(loc,opts);
 // The former standalone /seo URL must pass through the CRM's staff login.
 // The desk is now only a CRM tab; no public route can mount it unauthenticated.
 return route.page==='seo'?{...route,page:'crm'}:route;
}

function BuyerGuide({car,navigate}){
 const sheet=hasAuctionSheet(car);
 const steps=[
  ['01','Enquire & confirm availability','Share your destination port and preferred currency. Our Japan desk confirms this vehicle is available and prepares a written quotation.'],
  ['02','Review condition records',sheet?'This listing includes a Japanese auction inspection sheet — we translate the grade, panel marks and inspector notes into plain English before you commit.':'Condition for this vehicle is reviewed from its photographs and dealer or export-yard inspection notes — ask our Japan team for the full condition summary before you commit.'],
  ['03','Receive your proforma invoice & pay','Your invoice itemizes the vehicle price, export preparation, ocean freight and marine insurance, settled by bank transfer (T/T) in USD or JPY.'],
  ['04','Export de-registration & vessel loading','We complete Japanese de-registration (Export Certificate), arrange any mandatory pre-shipment inspection for your market, and book RoRo or container space.'],
  ['05','Documents by courier & port clearance','Original Bill of Lading, Export Certificate and commercial invoice are sent by courier ahead of arrival so your local clearing agent can release the vehicle at port.']
 ];
 return <section className="buyer-guide" aria-label="How buying this vehicle works">
  <div className="buyer-guide-head">
   <div className="kicker">HOW BUYING THIS VEHICLE WORKS</div>
   <h2>From enquiry in Japan to clearance at your port.</h2>
   <p>Five clear stages from reservation to port release, with itemized paperwork at every step.</p>
  </div>
  <ol className="buyer-guide-steps">
   {steps.map(([num,title,desc])=><li key={num} className="buyer-guide-step"><span>{num}</span><div><b>{title}</b><p>{desc}</p></div></li>)}
  </ol>
  <div className="buyer-guide-notes">
   <article className="buyer-guide-card">
    <div className="kicker">FOB VS CIF EXPLAINED</div>
    <h3>What the CIF estimate covers</h3>
    <p><b>FOB (Free on Board)</b> is the vehicle price in Japan. <b>CIF (Cost, Insurance &amp; Freight)</b> adds estimated sea freight to your destination port, export documentation and 1.6% marine transit insurance. The CIF box above is a planning estimate — our export desk issues a firm written quote for your sailing.</p>
   </article>
   <article className="buyer-guide-card">
    <div className="kicker">CONDITION TRANSPARENCY</div>
    <h3>{sheet?'Translated auction inspection sheet':'Inspection photos & condition records'}</h3>
    <p>{sheet?'Because this vehicle carries a Japanese auction sheet, our team provides an English translation of the inspector’s grade, panel diagram and handwritten notes alongside yard photos.':'Not every vehicle in Japan comes from an auction lane — dealer and showroom cars are documented through multi-angle photographs, chassis verification and export-yard inspection notes.'}</p>
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

const INVENTORY_SCROLL_KEY='ar7-inventory-scroll';

function VehicleLightbox({selected,detailImage,detailGallery,zoomLevel,setZoomLevel,setZoomOpen,stepGallery}){
 const isZoomed=zoomLevel>1;
 const idx=detailGallery.indexOf(detailImage)+1;
 // Every control lives OUTSIDE the picture area: close in the top bar,
 // prev/next + zoom in the bottom bar — the image itself stays clean.
 return createPortal(<div className="gallery-lightbox" role="dialog" aria-modal="true" aria-label={`${selected.make} ${selected.model} image viewer`} onClick={()=>setZoomOpen(false)}>
  <div className="lightbox-stage" onClick={e=>e.stopPropagation()}>
   <div className="lightbox-topbar">
    <span className="lightbox-title"><b>{selected.make} {selected.model}</b><small>{detailGallery.length>1?`${idx} / ${detailGallery.length}`:''}</small></span>
    <button className="lightbox-close" onClick={()=>setZoomOpen(false)} aria-label="Close enlarged image" title="Close (Esc)" type="button"><X/></button>
   </div>
   <div className="lightbox-img-wrap">
    <img role="button" tabIndex={0} aria-label="Toggle zoom on this photo" onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setZoomLevel(z=>z>1?1:2)}}} className={'lightbox-image '+(isZoomed?'is-zoomed':'')} width="620" height="400" src={detailImage} alt={`${selected.make} ${selected.model} enlarged`} style={{transform:`scale(${zoomLevel})`}} onClick={e=>{e.stopPropagation();setZoomLevel(v=>v>1?1:1.5)}} loading="lazy" decoding="async"/>
   </div>
   <div className="lightbox-bottom">
    <div className="lightbox-nav" role="group" aria-label="Image navigation">
     <button className="lightbox-arrow prev" onClick={()=>stepGallery(-1)} disabled={detailGallery.length<=1} aria-label="Previous image" title="Previous" type="button"><ChevronLeft/><span>Prev</span></button>
     <span className="lightbox-count">{detailGallery.length>1?`${idx} / ${detailGallery.length}`:''}</span>
     <button className="lightbox-arrow next" onClick={()=>stepGallery(1)} disabled={detailGallery.length<=1} aria-label="Next image" title="Next" type="button"><span>Next</span><ChevronRight/></button>
    </div>
    <div className="zoom-controls" role="group" aria-label="Image zoom controls">
     <button className="zoom-btn" onClick={()=>setZoomLevel(v=>Math.max(1,v-.25))} disabled={zoomLevel<=1} aria-label="Zoom out" title="Zoom out" type="button"><ZoomOut/><span>Out</span></button>
     <button className="zoom-level" onClick={()=>setZoomLevel(1)} disabled={zoomLevel===1} aria-label="Reset zoom" title="Reset zoom" type="button"><strong>{Math.round(zoomLevel*100)}%</strong><small>Reset</small></button>
     <button className="zoom-btn" onClick={()=>setZoomLevel(v=>Math.min(3.5,v+.25))} disabled={zoomLevel>=3.5} aria-label="Zoom in" title="Zoom in" type="button"><ZoomIn/><span>In</span></button>
    </div>
   </div>
  </div>
 </div>,document.body);
}

// ---------------------------------------------------------------------------
// Japan dealer stock — the page fed by the Goo-net importer (/api/goonet-stock).
// Shows only quality-gated, currently-available dealer cars; cars delisted on
// Goo-net disappear automatically. Photo galleries open in a clean modal whose
// controls sit outside the picture area.
// ---------------------------------------------------------------------------
function JapanStockPage({navigate, openAuction, discounts}){
 // Same hydrated content as the inventory (hydrateSiteContent fetches the
 // published listings AND the dealer stock in parallel), so the page shows
 // exactly the imported cars the rest of the site does — and re-renders when
 // hydration lands instead of running its own one-shot request.
 useContentVersion();
 const rows=cars.filter(isImportedCar);
 const loading=!isContentHydrated();
 const [query,setQuery]=useState('');
 const [make,setMake]=useState('All');
 const [body,setBody]=useState('All');
 const [openCar,setOpenCar]=useState(null);
 const [galleryIdx,setGalleryIdx]=useState(0);
 const makes=[...new Set(rows.map(r=>r.make).filter(Boolean))].sort();
 const bodies=[...new Set(rows.map(r=>r.body).filter(Boolean))].sort();
 const list=rows.filter(r=>{
  const hay=(r.make+' '+r.model+' '+(r.stock_no||'')+' '+r.year).toLowerCase();
  const q=query.trim().toLowerCase();
  return (!q||hay.includes(q))&&(make==='All'||r.make===make)&&(body==='All'||r.body===body);
 });
 const gallery=openCar?((Array.isArray(openCar.images)&&openCar.images.length)?openCar.images:[openCar.image].filter(Boolean)):[];
 const cur=gallery[Math.min(galleryIdx,gallery.length-1)]||openCar?.image;
 const stepG=d=>{setGalleryIdx(i=>Math.max(0,Math.min(gallery.length-1,i+d)))};
 const closeG=()=>{setOpenCar(null);setGalleryIdx(0)};
 return <>
  <section className="inner-page japan-stock-page">
   <div className="page-hero mini"><div className="page-orb-wrap"><InteractiveGlobe lite cls="mini" onTap={()=>navigate('world')}/></div><div className="shell"><div className="kicker">LIVE JAPAN DEALER STOCK</div><h1>Japan <em>dealer stock.</em></h1><p>{loading?'Checking the latest dealer listings…':`${rows.length} quality-gated dealer cars · sourced from Japan's dealer network, refreshed continuously.`}</p></div></div>
   <div className="shell page-content">
    <div className="inv-toolbar">
     <label className="inv-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="Search make, model or stock no."/></label>
     <select value={make} onChange={e=>setMake(e.target.value)} aria-label="Filter by brand"><option>All</option>{makes.map(m=><option key={m}>{m}</option>)}</select>
     <select value={body} onChange={e=>setBody(e.target.value)} aria-label="Filter dealer stock by body type"><option>All</option>{bodies.map(b=><option key={b}>{b}</option>)}</select>
    </div>
    <div className="results-line"><b>{list.length} vehicles</b><span>verified photos · auction-sheet quality · updated by the AR7 importer</span></div>
    {loading?<div className="empty-state"><CarFront/><h2>Loading dealer stock…</h2><p>Fetching the latest dealer listings from Japan.</p></div>:
     list.length===0?<div className="empty-state"><Search/><h2>No dealer cars match</h2><p>New dealer stock arrives all the time — try another filter or ask our team.</p><button className="primary" onClick={openAuction} type="button">Request a search <ArrowRight/></button></div>:
     <div className="car-grid full-grid jstock-grid">{list.map(r=>{
      const photos=r.images||(r.image?[r.image]:[]);
      return <article className="car-card page-car jstock-card" key={r.id||r.stock_no}>
       <div className="car-image" role="button" tabIndex={0} aria-label={`Open photos of ${carAlt(r)}`} onClick={()=>{setGalleryIdx(0);setOpenCar(r)}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();setGalleryIdx(0);setOpenCar(r)}}}>
        <img loading="lazy" decoding="async" width="820" height="550" src={r.image||photos[0]||'/assets/ar7-mark.png'} alt={carAlt(r)}/>
        <span className="status New Arrival">{r.status||'New Arrival'}</span>
        {r.grade&&<span className="grade">Grade <b>{r.grade}</b></span>}
        {photos.length>0&&<span className="photo-count"><Camera/> {photos.length}</span>}
       </div>
       <div className="car-info">
        <div className="make">{r.make}</div><h3>{r.model}</h3>
        <div className="specs"><span><CalendarDays/> {r.year||'—'}</span><span><Gauge/> {r.km?r.km+' km':'—'}</span>{r.fuel&&<span><Fuel/> {r.fuel}</span>}{r.tr&&<span><ArrowLeftRight/> {r.tr}</span>}</div>
        <div className="car-bottom"><div><small>DEALER PRICE</small><VehiclePriceDisplay car={r} discounts={discounts}/></div><button type="button" className="card-open" onClick={()=>{setGalleryIdx(0);setOpenCar(r)}}>Photos <ArrowUpRight/></button></div>
        <div className="loc"><MapPin/> {r.location?r.location+', Japan':'Japan'}</div>
        <div className="jstock-actions">
         <button className="primary" onClick={openAuction} type="button">Enquire <ArrowRight/></button>
        </div>
       </div>
      </article>;
     })}</div>}
   </div>
  </section>
  {openCar&&createPortal(<div className="gallery-lightbox jstock-lightbox" role="dialog" aria-modal="true" onClick={closeG}>
   <div className="lightbox-stage" onClick={e=>e.stopPropagation()}>
    <div className="lightbox-topbar">
     <span className="lightbox-title"><b>{openCar.make} {openCar.model}</b><small>{openCar.stock_no||''}</small></span>
     <button className="lightbox-close" onClick={closeG} aria-label="Close" type="button"><X/></button>
    </div>
    <div className="lightbox-img-wrap"><img className="lightbox-image" width="620" height="400" src={cur} alt={`${openCar.make} ${openCar.model}`} onError={e=>{if(hasRetried(e.currentTarget))return;if(e.currentTarget.src!==(openCar.image||''))e.currentTarget.src=openCar.image||'/assets/ar7-mark.png'}} loading="lazy" decoding="async"/></div>
    <div className="lightbox-bottom">
     <div className="lightbox-nav">
      <button className="lightbox-arrow prev" onClick={()=>stepG(-1)} disabled={gallery.length<=1} aria-label="Previous photo" type="button"><ChevronLeft/><span>Prev</span></button>
      <span className="lightbox-count">{gallery.length>1?`${galleryIdx+1} / ${gallery.length}`:''}</span>
      <button className="lightbox-arrow next" onClick={()=>stepG(1)} disabled={gallery.length<=1} aria-label="Next photo" type="button"><span>Next</span><ChevronRight/></button>
     </div>
     <div className="jstock-actions lightbox-cta">
      <button className="primary" onClick={()=>{closeG();openAuction()}} type="button">Enquire now <ArrowRight/></button>
     </div>
    </div>
   </div>
  </div>,document.body)}
 </>;
}

// NOTE: no early returns above the hooks below. InnerPage is reused for many
// pages, so returning before the hook list runs changes the hook count between
// renders and React flags it ("Expected static flag was missing"). Page
// selection happens in App's ternary, which swaps component types instead.
function InnerPage({page,navigate,openAuction,openChat,favs,setFavs,vehicleId,initialMake,initialModel}){
 const settings=useSettings();
 const discounts=useStockDiscounts();
 const price=useCarPrice(discounts);
 const {fmt}=useCurrency();
 // The inventory toolbar and the vehicle detail page are among the six
 // screens a buyer meets first, so they read their copy through `t` too.
 const {t}=useLang();
 const cust=useCustomerSession();
 const signedIn=!!cust.session;
 const [,contentTick]=useReducer(x=>x+1,0);
 useEffect(()=>onContentChange(()=>contentTick()),[]);
 const [query,setQuery]=useState(''),[body,setBody]=useState('All'),[make,setMake]=useState(initialMake||'All'),[fuel,setFuel]=useState('All'),[priceF,setPriceF]=useState('Any'),[yearF,setYearF]=useState('Any'),[kmF,setKmF]=useState('Any'),[sortF,setSortF]=useState('Featured'),[modelF,setModelF]=useState('All'),[trF,setTrF]=useState('All'),[steerF,setSteerF]=useState('All'),[galleryImage,setGalleryImage]=useState(null),[zoomOpen,setZoomOpen]=useState(false),[zoomLevel,setZoomLevel]=useState(1),[destSel,setDestSel]=useState(DEST[0][1]),[comp,setComp]=useState([]),[showCmp,setShowCmp]=useState(false),[copied,setCopied]=useState(false);
 // The header's Brands dropdown drives this filter through the URL, so the
 // select must follow the route (and stay put when changed by hand or while
 // inspecting a vehicle from a filtered list).
 useEffect(()=>{ if(!vehicleId) setMake(initialMake||'All'); },[initialMake,vehicleId]);
 // A model landing page (/cars/toyota/land-cruiser) always starts from "All"
 // makes so the make dropdown never reads "All" while the grid is filtered.
 useEffect(()=>{ if(initialModel) setMake('All'); },[initialModel]);
 const selected=page==='inventory'&&vehicleId?findCar(cars,vehicleId):null;
 const detailGallery=selected?galleryFor(selected):[];
 const detailImage=galleryImage||detailGallery[0];
 useEffect(()=>{ setGalleryImage(null); setZoomOpen(false); setZoomLevel(1); },[vehicleId]);
 const openVehicle=car=>{
  try{sessionStorage.setItem(INVENTORY_SCROLL_KEY,String(window.scrollY||window.pageYOffset||0));}catch{ }
  navigate(`inventory?car=${carRef(car)}`,{scroll:false});
 };
 const backTarget=make&&make!=='All'?inventoryHref(make):'inventory';
 const backToInventory=()=>{
  let saved=0;
  try{ saved=Number(sessionStorage.getItem(INVENTORY_SCROLL_KEY)||0); sessionStorage.removeItem(INVENTORY_SCROLL_KEY); }catch{ saved=0; }
  rememberVehicle(null);
  navigate(backTarget,{scroll:false});
  requestAnimationFrame(()=>requestAnimationFrame(()=>window.scrollTo(0,saved)));
 };
 const copyVehicleLink=async()=>{
  const url=location.origin+hrefFor('inventory',carRef(selected))+hashFor('inventory',carRef(selected));
  try{await navigator.clipboard.writeText(url);setCopied(true);setTimeout(()=>setCopied(false),1800)}
  catch{setCopied(false)}
 };
 // Card clicks can originate deep down the inventory page. Move the newly
 // rendered detail view to the top rather than leaving the user at the old
 // card's (often footer-side) scroll position.
 useEffect(()=>{
  if(!selected)return;
  // CSS scroll-behavior can make even an "auto" scroll animate. Set both
  // scrolling roots explicitly so the detail page always starts at the top.
  document.documentElement.scrollTop=0;
  document.body.scrollTop=0;
  window.scrollTo(0,0);
 },[selected]);
 const stepGalleryRef=useRef(null);
 useEffect(()=>{
  if(!zoomOpen)return;
  const clampZoom=v=>Math.round(v*100)/100;
  const onKey=e=>{
   if(e.key==='Escape')setZoomOpen(false);
   else if(e.key==='ArrowLeft'){e.preventDefault();if(stepGalleryRef.current)stepGalleryRef.current(-1)}
   else if(e.key==='ArrowRight'){e.preventDefault();if(stepGalleryRef.current)stepGalleryRef.current(1)}
   else if(e.key==='+'||e.key==='='){e.preventDefault();setZoomLevel(v=>Math.min(2.5,clampZoom(v+.25)))}
   else if(e.key==='-'||e.key==='_'){e.preventDefault();setZoomLevel(v=>Math.max(1,clampZoom(v-.25)))}
   else if(e.key==='0'){e.preventDefault();setZoomLevel(1)}
  };
  const previous=document.body.style.overflow;
  document.body.style.overflow='hidden';
  window.addEventListener('keydown',onKey);
  return()=>{document.body.style.overflow=previous;window.removeEventListener('keydown',onKey)};
 },[zoomOpen]);
 const stepGallery=dir=>{if(detailGallery.length<2)return;const at=Math.max(0,detailGallery.indexOf(detailImage));setGalleryImage(detailGallery[(at+dir+detailGallery.length)%detailGallery.length])};
 stepGalleryRef.current=stepGallery;
 if(page==='inventory'&&vehicleId&&!selected)return <section className="inner-page detail-page"><div className="shell"><a className="back-btn" href={hrefFromTarget(backTarget)} onClick={linkClick(backTarget,backToInventory)}>← Back to inventory</a><div className="empty-state vehicle-missing">{isContentHydrated()?<><Search/><h3>This vehicle is no longer listed</h3><p>It may have sold or the link is out of date. Browse current Japan stock instead.</p><PageLink className="primary" to={backTarget} navigate={backToInventory}>View inventory <ArrowRight/></PageLink></>:<><CarFront/><h3>Loading vehicle…</h3><p>Fetching the latest stock so we can open this car.</p></>}</div></div></section>;
 if(selected)return <section className="inner-page detail-page"><div className="shell"><a className="back-btn" href={hrefFromTarget(backTarget)} onClick={linkClick(backTarget,backToInventory)}>← Back to inventory</a><div className="detail-grid"><div className="detail-gallery"><div className="detail-main-image"><img decoding="async" fetchPriority="high" width="620" height="400" src={detailImage} onError={e=>{if(hasRetried(e.currentTarget))return;if(detailImage!==selected.image)setGalleryImage(selected.image)}} alt={`${selected.make} ${selected.model} showroom view`} onClick={()=>{setZoomLevel(1);setZoomOpen(true)}} loading="eager"/></div><div className="detail-gallery-toolbar">{detailGallery.length>1&&<><button className="gallery-arrow prev" onClick={()=>stepGallery(-1)} aria-label="Previous vehicle image" type="button"><ChevronLeft/></button><span className="gallery-count">{detailGallery.indexOf(detailImage)+1} / {detailGallery.length}</span><button className="gallery-arrow next" onClick={()=>stepGallery(1)} aria-label="Next vehicle image" type="button"><ChevronRight/></button></>}<button className="gallery-expand" onClick={()=>{setZoomLevel(1);setZoomOpen(true)}} aria-label="Enlarge vehicle image" type="button"><Maximize2/> Enlarge</button></div><div className="detail-thumbs">{detailGallery.map((img,i)=><button className={detailImage===img?'active':''} onClick={()=>setGalleryImage(img)} key={img+i} type="button"><img loading="lazy" decoding="async" width="164" height="110" src={img} onError={e=>{if(hasRetried(e.currentTarget)||e.currentTarget.dataset.f)return;e.currentTarget.dataset.f=1;e.currentTarget.src=selected.image}} alt={`${selected.make} ${selected.model} photo ${i+1}`}/><small>{i===0?'Main':'View '+(i+1)}</small></button>)}</div>{hasAuctionSheet(selected)&&<span className="sheet-tag"><ClipboardCheck/> Auction sheet included</span>}{zoomOpen&&<VehicleLightbox selected={selected} detailImage={detailImage} detailGallery={detailGallery} zoomLevel={zoomLevel} setZoomLevel={setZoomLevel} setZoomOpen={setZoomOpen} stepGallery={stepGallery}/>}</div><div className="detail-info"><div className="kicker">VERIFIED JAPAN STOCK · <b style={{color:'var(--gold)'}}>{stockNo(selected)}</b></div><h1>{selected.make}<br/><em>{selected.model}</em></h1><div className="detail-price"><small>EXPORT PRICE (FOB)</small><VehiclePriceDisplay car={selected} discounts={discounts}/></div><div className="detail-specs"><span><CalendarDays/><b>{selected.year}</b><small>Year</small></span><span><Gauge/><b>{selected.km} km</b><small>Mileage</small></span><span><Fuel/><b>{selected.fuel}</b><small>Fuel</small></span><span><ArrowLeftRight/><b>{selected.tr}</b><small>Transmission</small></span><span><BadgeCheck/><b>{selected.grade}</b><small>Grade</small></span><span><Ship/><b>{selected.st}</b><small>Steering</small></span></div><div className="spec-table"><h4>Full specifications</h4>{[['Body type',selected.body],['Engine',selected.eng],['Transmission',selected.tr],['Drive',selected.drv],['Doors',selected.doors],['Seats',selected.seats],['Chassis no.',selected.chassis],['Colour',selected.col],['Interior',selected.int],['Fuel',selected.fuel],['Steering',selected.st],['Auction venue',selected.ven],['Location',selected.location+', Japan'],['Available',selected.arr],['Stock no.',stockNo(selected)],['Status',selected.status]].filter(x=>x[1]!=null&&x[1]!=='').map(x=><span key={x[0]}><small>{x[0]}</small><b>{x[1]}</b></span>)}</div>{(selected.feats||[]).length>0&&<div className="feat-box"><h4>Equipment & features</h4><div className="feat-chips">{(selected.feats||[]).map(f=><span key={f}><Check/> {f}</span>)}</div></div>}<div className="cif-box"><div className="kicker">DEMO CIF ESTIMATE</div><select value={destSel} onChange={e=>setDestSel(e.target.value)}>{DEST.map(x=><option key={x[1]}>{x[1]}</option>)}</select>{(()=>{const e=estimateFor(selected,destSel,discounts);return <div className="cif-rows"><span><small>FREIGHT (RoRo)</small><b>{fmt(e.freight)}</b></span><span><small>DOCS</small><b>{fmt(e.docs)}</b></span><span><small>INSURANCE 1.6%</small><b>{fmt(e.ins)}</b></span><span className="total"><small>CIF · ETA ±{e.days} DAYS</small><b>{fmt(e.cif)}</b></span></div>})()}</div><div className="brand-brandlogo"><img loading="lazy" decoding="async" width="120" height="46" src={LOGO(selected.make)} alt={selected.make+" logo"} onError={logoOnError}/><span>{selected.make} · sourced in Japan</span></div><VehicleActions car={selected} stockRef={stockNo(selected)} settings={settings} saved={favs.includes(selected.id)} copied={copied} onEnquire={openAuction} onChat={openChat} onToggleSave={()=>setFavs(v=>v.includes(selected.id)?v.filter(x=>x!==selected.id):[...v,selected.id])} onCopy={copyVehicleLink}/><div className="sheet-box"><ClipboardCheck/><div>{hasAuctionSheet(selected)?<><b>Auction sheet verified</b><p>Original inspection report translated by our Japan team — grades, marks and repair history in plain English.</p></>:<><b>Condition &amp; documentation</b><p>Ask our Japan team for this vehicle&rsquo;s condition report and documentation before you commit.</p></>}</div></div></div></div><BuyerGuide car={selected} navigate={navigate}/>{(()=>{const related=cars.filter(c=>c&&c.published!==false&&carRef(c)!==carRef(selected)&&(c.make===selected.make||c.body===selected.body)).sort((a,b)=>Number(b.make===selected.make)-Number(a.make===selected.make)).slice(0,3);return related.length?<section className="related-stock" aria-label="Related vehicles"><div className="kicker">SIMILAR STOCK</div><h2>More vehicles to explore</h2><p className="related-stock-note">Other published vehicles from the same make or body type, currently listed in Japan.</p><div className="related-stock-grid">{related.map(c=><PageLink key={carRef(c)} className="related-stock-card" to={'/inventory/'+carRef(c)} navigate={navigate}><img loading="lazy" decoding="async" width="820" height="550" src={c.image||'/assets/ar7-mark.png'} alt={carAlt(c)}/><b>{[c.year,c.make,c.model].filter(Boolean).join(' ')}</b><small>{carRef(c)}{c.status?' · '+c.status:''}</small></PageLink>)}</div><PageLink className="outline-btn" to={inventoryHref(selected.make)} navigate={navigate}>Browse all {selected.make} stock <ArrowRight/></PageLink></section>:null})()}</div></section>;
if(['services','destinations','reviews','faq','portal'].includes(page))return <ExtraPage type={page} navigate={navigate} openAuction={openAuction}/>;
 if(['brands','howbuy','tools','news'].includes(page))return <ExtraPages2 type={page} navigate={navigate} openAuction={openAuction} articleSlug={page==='news'?vehicleId:null} discounts={discounts}/>;
 const makes=[...new Set(cars.map(c=>c.make))].sort();
 // ── Facets, in the shape beforward's stock list offers ─────────────────────
 // Every option is derived from the live list, so a filter can never offer a
 // value that returns nothing. Counts sit beside each option for the same
 // reason they sit beside beforward's makes: a buyer should see the size of a
 // result before committing to it. Client-side by design (SEO.md §3d) — the
 // catalogue is small and twenty filter URLs should not enter the index.
 const facetPool = cars.filter(c => make==='All' || c.make===make);
 const facetCount = (field,value) => facetPool.filter(c=>c[field]===value).length;
 const modelsForMake = [...new Set(facetPool.map(c=>c.model))].sort();
 const transmissions = [...new Set(cars.map(c=>c.tr).filter(Boolean))].sort();
 const steerings = [...new Set(cars.map(c=>c.st).filter(Boolean))].sort();
 const PRICE_BANDS = [
   ['Any', null, null],
   ['Under $10k', null, 10000],
   ['$10k – $20k', 10000, 20000],
   ['$20k – $35k', 20000, 35000],
   ['$35k – $60k', 35000, 60000],
   ['$60k+', 60000, null]
 ];
 const KM_BANDS = [['Any', null], ['Under 30,000 km', 30000], ['Under 60,000 km', 60000], ['Under 100,000 km', 100000], ['Under 150,000 km', 150000]];
 const priceBand = PRICE_BANDS.find(b=>b[0]===priceF) || PRICE_BANDS[0];
 const kmBand = KM_BANDS.find(b=>b[0]===kmF) || KM_BANDS[0];
 const facetActive = [body!=='All'&&body, make!=='All'&&make, modelF!=='All'&&modelF, fuel!=='All'&&fuel, priceF!=='Any'&&priceF, yearF!=='Any'&&'From '+yearF, kmF!=='Any'&&kmF, trF!=='All'&&trF, steerF!=='All'&&steerF+' hand drive'].filter(Boolean);
 const fuelOptions = [...new Set(cars.map(c=>c.fuel).filter(Boolean))];
 const countBy = (field,value) => cars.filter(c=>c[field]===value).length;
 // beforward annotates every option with its count; so do we, so a shopper can
 // see the size of a result before clicking into it.
 const facets = [
  {k:'Make',v:make,set:v=>{setMake(v);setModelF('All');navigate(inventoryHref(v),{scroll:false,replace:true})},o:[['All','All makes ('+cars.length+')'],...makes.map(m=>[m,m+' ('+countBy('make',m)+')'])]},
  {k:'Model',v:modelF,set:setModelF,dis:modelsForMake.length<2,o:[['All',make==='All'?'Any model':'All '+make+' models'],...modelsForMake.map(md=>[md,md+' ('+facetCount('model',md)+')'])]},
  {k:'Body',v:['Showroom','Japan Stock'].includes(body)?'All':body,set:setBody,o:[['All','Any body'],...['SUV','MPV','Sedan','Hatchback','Kei','Van','Luxury','Supercar','Hypercar'].filter(b=>cars.some(c=>c.body===b)).map(b=>[b,b+' ('+countBy('body',b)+')'])]},
  {k:'Price',v:priceF,set:setPriceF,o:PRICE_BANDS.map(([l])=>[l,l])},
  {k:'Year from',v:yearF,set:setYearF,o:[['Any','Any year'],...Object.keys(YEAR_MIN).map(y=>[y,y])]},
  {k:'Mileage',v:kmF,set:setKmF,o:KM_BANDS.map(([l])=>[l,l])},
  {k:'Fuel',v:fuel,set:setFuel,o:[['All','Any fuel'],...fuelOptions.map(f=>[f,f+' ('+countBy('fuel',f)+')'])]},
  {k:'Gearbox',v:trF,set:setTrF,o:[['All','Any gearbox'],...transmissions.map(t=>[t,t+' ('+countBy('tr',t)+')'])]},
  {k:'Steering',v:steerF,set:setSteerF,o:[['All','Any steering'],...steerings.map(t=>[t,t+' hand ('+countBy('st',t)+')'])]},
  {k:'Sort',v:sortF,set:setSortF,o:[['Featured','Featured'],['Price: low to high','Price: low to high'],['Price: high to low','Price: high to low'],['Mileage: low to high','Mileage: low to high'],['Mileage: high to low','Mileage: high to low'],['Year: newest first','Year: newest first'],['Year: oldest first','Year: oldest first']]}
 ];
 const clearFacets = () => { setBody('All'); setModelF('All'); setFuel('All'); setPriceF('Any'); setYearF('Any'); setKmF('Any'); setTrF('All'); setSteerF('All'); setQuery(''); };
 // Imported dealer cars are Japanese stock, never showroom cars — even a
 // Lamborghini from the importer belongs in the Japan inventory group.
 const isShowroom=c=>!isImportedCar(c)&&(['Luxury','Supercar','Hypercar'].includes(c.body)||Number(c.id)<=12);
 const list=cars.filter(c=>(c.make+' '+c.model+' '+c.location+' '+(c.stock_no||'')+' '+c.year).toLowerCase().includes(query.toLowerCase())&&(body==='All'||(body==='Showroom'&&isShowroom(c))||(body==='Japan Stock'&&!isShowroom(c))||c.body===body)&&(make==='All'||c.make===make)&&(!initialModel||(c.make+' '+c.model+' '+(c.body||'')).toLowerCase().includes(initialModel))&&(modelF==='All'||c.model===modelF)&&(fuel==='All'||c.fuel===fuel)&&(trF==='All'||c.tr===trF)&&(steerF==='All'||c.st===steerF)&&(priceBand[1]==null||carDiscountedUSD(c,discounts)>=priceBand[1])&&(priceBand[2]==null||carDiscountedUSD(c,discounts)<priceBand[2])&&(yearF==='Any'||Number(c.year)>=YEAR_MIN[yearF])&&(kmBand[1]==null||kmNum(c)<=kmBand[1])).sort((a,b)=>{const p=x=>carDiscountedUSD(x,discounts);switch(sortF){case 'Price: low to high':return p(a)-p(b);case 'Price: high to low':return p(b)-p(a);case 'Mileage: low to high':return kmNum(a)-kmNum(b);case 'Mileage: high to low':return kmNum(b)-kmNum(a);case 'Year: newest first':case 'Newest first':return b.year-a.year;case 'Year: oldest first':return a.year-b.year;default:{const as=isShowroom(a),bs=isShowroom(b);if(as!==bs)return as?-1:1;return as?a.id-b.id:b.id-a.id}}});
 const showroomList=list.filter(isShowroom),japanList=list.filter(c=>!isShowroom(c));
 const cardsFor=items=>items.map(c=><VehicleCard key={c.id} c={c} onOpen={openVehicle} comp={comp.includes(c.id)} onCmp={x=>{setComp(v=>v.includes(x.id)?v.filter(y=>y!==x.id):(v.length>=3?v:v.concat(x.id)))}} discounts={discounts}/>);
// /cars/toyota/land-cruiser renders the same list view, but titles and
// filters itself as a make/model landing page.
const landingMake = (initialMake&&initialMake!=='All')?initialMake:null;
const landingModel = (landingMake&&initialModel)?initialModel.replace(/\b\w/g,c=>c.toUpperCase()):null;
if(page==='inventory')return <section className="inner-page"><div className="page-hero mini"><div className="page-orb-wrap"><InteractiveGlobe lite cls="mini" onTap={()=>navigate('world')}/></div><div className="shell"><div className="kicker">{landingMake?t('inv.kickerLanding'):t('inv.kicker')}</div><h1>{landingMake?<>{landingMake}{landingModel?' '+landingModel:''}<br/><em>{t('inv.h1Landing')}</em></>:<>{t('inv.h1a')} <em>{t('inv.h1b')}</em></>}</h1><p>{landingMake?`${list.length} ${landingModel||landingMake} ${list.length===1?t('inv.vehicle'):t('inv.vehicles')} ${t('inv.landingNote')}`:`${list.length} ${t('inv.stockNote')}`}</p></div></div><div className="shell page-content"><div className="inv-toolbar inv-toolbar-facets" role="search">
 <label className="inv-search"><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={t('inv.searchPlaceholder')} aria-label={t('inv.searchPlaceholder')}/></label>
 <div className="inv-facets">{facets.map(f=><label className="facet" key={f.k}><span>{f.k}</span><select value={f.v} onChange={e=>f.set(e.target.value)} aria-label={f.k+' filter'} disabled={f.dis}>{f.o.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>)}</div>
 <div className="inv-facet-foot">
  <span className="facet-count"><b>{list.length}</b> {t('inv.matchCount',{total:cars.length})}</span>
  {facetActive.length>0&&<div className="facet-active">{facetActive.map(f=><span key={f}>{f}</span>)}<button type="button" onClick={clearFacets}>{t('inv.clearAll')}</button></div>}
 </div>
</div>
{make!=='All'&&<div className="brand-context-card" aria-label={`${make} inventory context`}><img className="brand-context-logo" loading="lazy" decoding="async" width="88" height="54" src={LOGO(make)} alt={make+" logo"} onError={logoOnError}/><div className="brand-context-copy"><div className="kicker">BROWSE {make.toUpperCase()} STOCK</div><h2>{make} vehicles from Japan</h2><p className="brand-context-count"><b>{list.length}</b> matching {make} {list.length===1?'vehicle':'vehicles'} currently listed.</p><p>We source {make} vehicles through Japanese auction and dealer/showroom listings. Auction-sourced vehicles may include translated auction sheets; dealer and showroom vehicles are described with the available yard inspection notes and photographs.</p><div className="brand-context-links"><PageLink className="outline-btn" to="inventory" navigate={navigate}>{t('inv.allInventory')} <ArrowRight/></PageLink><PageLink className="outline-btn" to="brands" navigate={navigate}>Explore brands <ArrowRight/></PageLink><PageLink className="outline-btn" to="howbuy" navigate={navigate}>How buying works <ArrowRight/></PageLink></div></div></div>}{landingMake&&<nav className="landing-links" aria-label={'More '+landingMake+' export pages'}>{[...new Set(cars.filter(c=>c.make===landingMake).map(c=>c.model))].slice(0,10).map(m=><PageLink key={m} to={inventoryHref(landingMake,m)} navigate={navigate}>{landingMake} {m}</PageLink>)}<PageLink to="inventory" navigate={navigate}>{t('inv.allInventory')}</PageLink></nav>}<div className="logo-strip">{BRANDS().map(b=><a key={b.name} className={make===b.name?' current':''} href={inventoryHref(b.name)} onClick={linkClick(inventoryHref(b.name),navigate)} title={'Show '+b.name+' stock'}><img loading="lazy" decoding="async" width="44" height="26" src={LOGO(b.name)} alt={b.name+" logo"} onError={logoOnError}/><span>{b.name}</span><b>{b.count}</b></a>)}</div><div className="inv-chips"><div>{['All','Showroom','Japan Stock','Luxury','Supercar','Hypercar','SUV','MPV','Sedan','Hatchback','Kei','Van'].map(x=>{const n=x==='All'?cars.length:(x==='Showroom'?cars.filter(isShowroom).length:(x==='Japan Stock'?cars.filter(c=>!isShowroom(c)).length:cars.filter(c=>c.body===x).length));return <button key={x} onClick={()=>setBody(x)} className={body===x?'active':''} type="button">{x} <i>{n}</i></button>})}</div>{comp.length>0&&<button className="cmp-open" onClick={()=>setShowCmp(true)} type="button"><ArrowLeftRight/> Compare {comp.length}<small onClick={e=>{e.stopPropagation();setComp([]);setShowCmp(false)}}>{t('inv.compareClear')}</small></button>}</div><div className="results-line"><b>{list.length} {t('inv.vehicles')}</b><span>{t('inv.resultsNote',{showroom:showroomList.length,japan:japanList.length})}</span></div>{body==='All'&&sortF==='Featured'?<div className="inventory-groups">{showroomList.length>0&&<section className="inventory-group showroom-group"><div className="inventory-group-head"><div><span>AR7 CURATED COLLECTION</span><h2>Showroom cars</h2></div><b>{showroomList.length} vehicles</b></div><div className="car-grid full-grid">{cardsFor(showroomList)}</div></section>}{japanList.length>0&&<section className="inventory-group japan-group"><div className="inventory-group-head"><div><span>VERIFIED AUCTION & STOCK</span><h2>Japan inventory</h2></div><b>{japanList.length} vehicles</b></div><div className="car-grid full-grid">{cardsFor(japanList)}</div></section>}</div>:<div className="car-grid full-grid">{cardsFor(list)}</div>}{list.length===0&&<div className="empty-state"><Search/><h3>{t('inv.noMatches')}</h3><p>{t('inv.noMatchesBody')}</p><button className="primary" onClick={openAuction} type="button">{t('inv.requestSearch')} <ArrowRight/></button></div>}</div>{showCmp&&createPortal(<div className="cmp-backdrop" onClick={()=>setShowCmp(false)}><div className="cmp-modal" onClick={e=>e.stopPropagation()}><div className="cmp-head"><div><div className="kicker">COMPARE</div><h2>{comp.length} vehicles side by side</h2></div><button onClick={()=>setShowCmp(false)} type="button"><X/></button></div><table><thead><tr><th></th>{comp.map(id=>{const c=cars.find(x=>x.id===id);return <th key={id}><img loading="lazy" decoding="async" width="820" height="550" src={c.image} alt={carAlt(c)}/><b>{c.make} {c.model}</b><button onClick={()=>setComp(v=>v.filter(y=>y!==id))} type="button">Remove</button></th>})}</tr></thead><tbody>{[['Price',price],['Year',c=>c.year],['Mileage',c=>c.km+' km'],['Fuel',c=>c.fuel],['Body',c=>c.body],['Transmission',c=>c.tr],['Drive',c=>c.drv],['Engine',c=>c.eng],['Seats',c=>c.seats],['Grade',c=>c.grade],['Steering',c=>c.st],['Status',c=>c.status]].map(r=><tr key={r[0]}><th>{r[0]}</th>{comp.map(id=>{const c=cars.find(x=>x.id===id);return <td key={id}>{c?r[1](c):'—'}</td>})}</tr>)}</tbody></table><div className="cmp-cta"><button className="primary" onClick={openAuction} type="button">Request quote for best match <ArrowRight/></button></div></div></div>, document.body)}</section>;
 const pages={
 auction:{tag:'LIVE AUCTION ACCESS',title:<>Bid in Japan.<br/><em>From anywhere.</em></>,desc:'Your direct window into 100,000+ vehicles every week, with translated sheets and an expert beside you.',image:'/assets/japanese-car-auction-inspection-shipping-3.webp'},
 shipping:{tag:'GLOBAL LOGISTICS',title:<>From Japan<br/>to your <em>port.</em></>,desc:'Reliable RoRo and container shipping with documentation, insurance and live milestone updates.',image:'/assets/japanese-car-auction-inspection-shipping-1.webp'},
 about:{tag:'ABOUT AR7 TRADERS',title:<>Your team<br/>on the ground <em>in Japan.</em></>,desc:'We are vehicle sourcing specialists built around transparency, quality and long-term customer relationships.',image:'/assets/japanese-car-auction-inspection-shipping-5.webp'},
 contact:{tag:'TALK TO OUR TEAM',title:<>Start your<br/><em>car journey.</em></>,desc:'Tell us your market, budget and preferred vehicle. Our Japan export desk will reply with suitable options.',image:'/assets/japanese-car-auction-inspection-shipping-2.webp'}
 };
 const p=pages[page]||pages.about;
 return <section className="inner-page"><div className="page-hero split"><div className="shell"><div className="page-hero-copy"><div className="kicker">{p.tag}</div><h1>{p.title}</h1><p>{p.desc}</p><button className="gold-btn" onClick={openAuction} type="button">{page==='contact'?'Send an enquiry':'Get started'} <ArrowRight/></button></div><div className="page-hero-image"><img loading="lazy" decoding="async" width="820" height="550" src={p.image} alt={p.title||p.name||"AR7 Traders vehicle export"}/><div className="hero-orb in-page"><InteractiveGlobe lite cls="mini" onTap={()=>navigate('world')}/></div><div className="corner-mark"><img width="460" height="285" src="/assets/ar7-mark.png" alt="AR7 Traders" loading="lazy" decoding="async"/></div></div></div></div>
 <div className="shell page-content">{page==='auction'?<><div className="feature-intro"><h2>Auction access without the guesswork.</h2><p>Every listing comes with translation support, market guidance and complete cost visibility before you bid.</p></div><div className="feature-cards">{[['01','Browse live listings','Filter by make, year, mileage, grade and auction venue.'],['02','Review with an expert','We translate the auction sheet and flag every detail.'],['03','Set your bid limit','Know your landed estimate before bidding begins.'],['04','Win & track','See results instantly and follow your car to port.']].map(x=><article key={x[1]}><span>{x[0]}</span><Gavel/><h3>{x[1]}</h3><p>{x[2]}</p></article>)}</div><div className="auction-demo"><div><span className="live-dot"/> AUCTION LOTS · SAMPLE</div>{cars.slice(0,4).map(c=><section key={c.id}><img loading="lazy" decoding="async" width="820" height="550" src={c.image} alt={carAlt(c)}/><b>{c.make} {c.model}</b><small>{stockLabel(c)} · Grade {c.grade}</small><strong>{price(c)}</strong><PageLink className="lot-link" to={`inventory?car=${carRef(c)}`} navigate={navigate}>View vehicle</PageLink></section>)}</div></>:
 page==='shipping'?<><div className="feature-intro"><h2>One clear route. Complete support.</h2><p>From export certificate to customs-ready documents, our logistics desk handles the complexity.</p></div><div className="shipping-flow">{[['Japan yard','Inspection & preparation'],['Export port','Customs & loading'],['At sea','Live milestone tracking'],['Your port','Documents & collection']].map((x,i)=><div key={x[0]}><span>0{i+1}</span><Ship/><b>{x[0]}</b><small>{x[1]}</small></div>)}</div></>:
 page==='about'?<><div className="feature-intro"><h2>Built to be your trusted partner.</h2><p>AR7 Traders connects buyers worldwide to the depth and quality of the Japanese vehicle market.</p></div><div className="story-grid"><img loading="lazy" decoding="async" width="88" height="88" src="/assets/ar7-logo-circle.png" alt="AR7 Traders emblem"/><div><FounderStat variant="about"/><p>Our team sources through major Japanese auction houses and trusted dealer networks. Every vehicle is selected with careful inspection, clear communication and full cost transparency.</p></div></div></>:
 <div className="contact-grid"><div><h2>Let’s source your car.</h2><p>Use the access form or contact our Japan export desk directly.</p><a href={'mailto:'+settings.contact_email}><Mail/> {settings.contact_email}</a><a href={telHref(settings.contact_phone)}><Phone/> {settings.contact_phone}</a><a className="wa-link" href={waLink(settings.whatsapp_number,settings.whatsapp_message)} target="_blank" rel="noopener noreferrer"><WhatsAppIcon size={17}/> WhatsApp us</a><a href="/contact" onClick={linkClick('contact',navigate)}><MapPin/> {settings.contact_address}</a></div><form onSubmit={e=>{e.preventDefault();openAuction()}}><input placeholder="Your name" required/><input placeholder="Email address" type="email" required/><input placeholder="Destination country"/><textarea placeholder="Which vehicle are you looking for?"/><button className="primary" type="submit">Send request <ArrowRight/></button></form></div>}</div></section>
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
const BUILD_STAMP=(()=>{
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

function WorldTimeRibbon(){
 const [now,setNow]=useState(()=>new Date());
 useEffect(()=>{
  let tick=0;
  const start=()=>{if(!tick&&!document.hidden)tick=setInterval(()=>setNow(new Date()),1000)};
  const stop=()=>{if(tick){clearInterval(tick);tick=0}};
  const onVisibility=()=>document.hidden?stop():start();
  start();
  document.addEventListener('visibilitychange',onVisibility);
  return()=>{stop();document.removeEventListener('visibilitychange',onVisibility)};
 },[]);
 const group=(copy,hidden=false)=><div className="world-time-group" aria-hidden={hidden||undefined} key={copy}>{WORLD_CLOCKS.map(c=>{const parts=c.formatter.formatToParts(now),time=parts.filter(p=>['hour','minute','second','literal'].includes(p.type)).map(p=>p.value).join(''),zone=parts.find(p=>p.type==='timeZoneName')?.value||'';return <span className="world-time-item" key={copy+c.city}><span className="world-time-flag"><Flag c={c.country} w={18} h={12}/></span><i>{c.code}</i><b>{c.city}</b><strong>{time}</strong><small>{zone}</small></span>})}</div>;
 return <div className="world-time-ribbon" aria-label="Live international times"><div className="world-time-label"><Globe2/><span>WORLD TIME</span><i/></div><div className="world-time-viewport"><div className="world-time-track">{group('a')}{group('b',true)}</div></div></div>
}

export function App(){
 const [,forceContent]=useReducer(x=>x+1,0);
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
 const [initialRoute]=useState(()=>readRoute(typeof location==='undefined'?{}:location,{restoreOnReload:isReload()}));
 // The machinery part of the route (/machinery/<type>/<REF>) has to be state,
 // like carId: reading it once at mount meant a click on a machine rewrote the
 // URL to /machinery and showed the catalogue instead of the machine.
 const [machineRoute,setMachineRoute]=useState({type:initialRoute.machineType||null,ref:initialRoute.machineRef||null});
 const [dark,setDark]=useState(()=>{try{return localStorage.getItem('ar7-theme')==='dark'}catch{return false}}), [menu,setMenu]=useState(false), [filter,setFilter]=useState('All'), [modal,setModal]=useState(false), [favs,setFavs]=useState(()=>{try{return JSON.parse(localStorage.getItem('ar7-favs')||'[]')}catch{return []}}), [sent,setSent]=useState(false), [leadSending,setLeadSending]=useState(false), [leadError,setLeadError]=useState(''), [page,setPage]=useState(initialRoute.page), [vehicleId,setVehicleId]=useState(initialRoute.carId), [makeFilter,setMakeFilter]=useState(initialRoute.make), [modelFilter,setModelFilter]=useState(initialRoute.model);
 useEffect(()=>{ document.documentElement.dataset.theme=dark?'dark':'light'; try{localStorage.setItem('ar7-theme',dark?'dark':'light')}catch{} },[dark]);
 useEffect(()=>{ try{localStorage.setItem('ar7-favs',JSON.stringify(favs))}catch{} },[favs]);
  const machineOnRoute = page === 'machinery' && machineRoute.ref ? machineByRef(machineRoute.ref) : null;
  // One published discount setting feeds cards, detail pages and JSON-LD.
  const liveDiscounts = useStockDiscounts();
  const price = useCarPrice(liveDiscounts);
  const vehicleOnRoute = page === 'inventory' ? findCar(cars, vehicleId) : undefined;
  const vehicleDiscount = vehicleOnRoute ? stockDiscountFor(liveDiscounts, 'car', carRef(vehicleOnRoute)) : null;
  const machineDiscount = machineOnRoute ? stockDiscountFor(liveDiscounts, 'machine', machineOnRoute.ref) : null;
  const machineOfferPercent = machineDiscount?.percent || 0;
  useSeo(page, vehicleId, vehicleOnRoute,
    { vehicleMissing: page === 'inventory' && vehicleId != null && String(vehicleId) !== '' && !vehicleOnRoute && isContentHydrated(), make: makeFilter, model: modelFilter, machineType: machineRoute.type, machineRef: machineRoute.ref, machine: machineOnRoute, machineOfferPercent, machineOfferUntil: machineDiscount?.until || null, vehicleOfferPercent: vehicleDiscount?.percent || 0, vehicleOfferUntil: vehicleDiscount?.until || null, vehicleCount: cars.length });
  useEffect(()=>onContentChange(forceContent),[]);
  useEffect(()=>subscribePublishedNews(forceContent),[]);
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
  const apply=(opts={restoreOnReload:false})=>{const route=readRoute(typeof location==='undefined'?{}:location,opts);rememberVehicle(route.page==='inventory'?route.carId:null);setPage(route.page);setVehicleId(route.carId);setMakeFilter(route.make);setModelFilter(route.model);setMachineRoute({type:route.machineType||null,ref:route.machineRef||null});setMenu(false)};
  const route=readRoute(typeof location==='undefined'?{}:location,{restoreOnReload:isReload()});
  writeLocation(route.page,route.carId,{replace:true,make:route.make,machineType:route.machineType,machineRef:route.machineRef});
  setPage(route.page);setVehicleId(route.carId);setMakeFilter(route.make);setModelFilter(route.model);
  setMachineRoute({type:route.machineType||null,ref:route.machineRef||null});
  const onPop=()=>apply({restoreOnReload:false});
  const onHash=()=>{if(!location.hash)return;const next=readRoute(typeof location==='undefined'?{}:location,{restoreOnReload:false});writeLocation(next.page,next.carId,{replace:true,make:next.make,machineType:next.machineType,machineRef:next.machineRef});setPage(next.page);setVehicleId(next.carId);setMachineRoute({type:next.machineType||null,ref:next.machineRef||null});setMakeFilter(next.make);setModelFilter(next.model);setMenu(false)};
  addEventListener('popstate',onPop);
  addEventListener('hashchange',onHash);
  return()=>{removeEventListener('popstate',onPop);removeEventListener('hashchange',onHash)};
 },[]);
 // Home inventory is a running slide: six visible slots that keep advancing
 // through the whole filtered stock (paused on hover / reduced motion), so the
 // landing page shows far more of the inventory than one static screenful.
 const [homeOff,setHomeOff]=useState(0);
 const homeHover=useRef(false);
 const homeFiltered=(filter==='All'?cars:cars.filter(c=>c.status===filter)).filter(c=>c&&carRef(c));
 const HOME_N=6;
 const homeLen=homeFiltered.length;
 const shown=homeLen?Array.from({length:Math.min(HOME_N,homeLen)},(_,i)=>homeFiltered[(homeOff+i)%homeLen]):[];
 useEffect(()=>{
  if(typeof window==='undefined')return;
  if(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches)return;
  const t=setInterval(()=>{if(!document.hidden&&!homeHover.current)setHomeOff(v=>v+3)},5200);
  return()=>clearInterval(t);
 },[]);
 const homePages=Math.max(1,Math.ceil(homeLen/HOME_N));
 const homePage=homeLen?Math.floor((homeOff%homeLen)/HOME_N)%homePages:0;
 const {fmt}=useCurrency();
 const brandBudgets=BRANDS().slice(0,8).map(b=>{
  const bc=cars.filter(c=>c.make===b.name);
  const ps=bc.map(c=>carDiscountedUSD(c,liveDiscounts)).filter(v=>v>0);
  return {...b,lo:ps.length?Math.min(...ps):0,hi:ps.length?Math.max(...ps):0};
 });
 const budgetBands=[['Under $15k','Kei cars, hatchbacks & first imports'],['$15k–$30k','Hybrids, family SUVs & sedans'],['$30k–$60k','Late-model premium & vans'],['$60k+','Luxury & super sport']];
 const navigate=(p,{scroll=true,replace=false}={})=>{
  const route=parseNavTarget(p);
  writeLocation(route.page,route.carId,{replace,make:route.make,machineType:route.machineType,machineRef:route.machineRef});
  setPage(route.page);setVehicleId(route.carId);setMakeFilter(route.make);setModelFilter(route.model);
  setMachineRoute({type:route.machineType||null,ref:route.machineRef||null});setMenu(false);
  if(scroll) scrollTo({top:0,behavior:'smooth'});
 };
 const go=(id)=>{if(page!=='home'){navigate('home');setTimeout(()=>document.getElementById(id)?.scrollIntoView({behavior:'smooth'}),100)}else document.getElementById(id)?.scrollIntoView({behavior:'smooth'});setMenu(false)};
 const submitLead=async e=>{e.preventDefault();setLeadSending(true);setLeadError('');const f=new FormData(e.currentTarget),payload=Object.fromEntries(f.entries());try{const r=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});if(!r.ok)throw new Error((await r.json().catch(()=>({}))).error||'Unable to send request');setSent(true);e.currentTarget.reset()}catch(err){setLeadError(err.message)}finally{setLeadSending(false)}};
 if(page==='crm')return <React.Suspense fallback={<div className="empty-state"><Monitor/><h3>Loading the CRM…</h3><p>Fetching your workspace.</p></div>}><CrmApp/></React.Suspense>;
 return <div className="site"><PromoBar navigate={navigate}/>
  <div className="grain"/><SiteHeader page={page} vehicleId={vehicleId} makeFilter={makeFilter} brands={BRANDS()} vehicleCount={cars.length}
    menu={menu} setMenu={setMenu} dark={dark} setDark={setDark} signedIn={signedIn} navigate={navigate} logoFor={LOGO}
    ribbon={<WorldTimeRibbon/>} orb={<InteractiveGlobe lite cls="mini" onTap={()=>navigate('world')}/>}/>

  <main>
   {page==='home'?<>
   <section className="hero shell" id="home">
    <div className="hero-copy reveal">
      <div className="eyebrow"><span className="live-dot"/> {t('hero.eyebrow')}</div>
      <h1>{t('hero.h1a')}<br/><em>{t('hero.h1b')}</em></h1>
      <p>{t('hero.lead')} <b>{t('hero.leadEm')}</b>.</p>
      <div className="hero-cta"><button className="primary" onClick={()=>go('inventory')} type="button">{t('hero.explore')} <ArrowRight/></button><PageLink className="ghost-btn" to="machinery" navigate={navigate}>{t('hero.browseMachinery')} <Wrench/></PageLink></div>
      <div className="hero-quick"><button className="text-btn" onClick={()=>setModal(true)} type="button"><span><Play fill="currentColor"/></span> {t('hero.howBidding')}</button></div>
      <FounderStat variant="hero" delay={900}/>
    </div>
    <HeroVisual navigate={navigate} discounts={liveDiscounts}/>
    <div className="scroll-cue"><span>{t('hero.scrollCue')}</span><ChevronDown/></div>
   </section>

   <section className="ticker"><div>{['USS TOKYO','JU AICHI','TAA KINKI','CAA CHUBU','HAA KOBE','ARAI AUTO'].concat(['USS TOKYO','JU AICHI','TAA KINKI']).map((x,i)=><span key={i}><i/> {x}</span>)}</div></section>

   <MotionShowcase navigate={navigate}/>

   <section className="inventory shell section" id="inventory" onMouseEnter={()=>{homeHover.current=true}} onMouseLeave={()=>{homeHover.current=false}}>
    <div className="section-head"><div><div className="kicker">LUXURY & SUPER SPORT</div><h2>Treasures in the<br/><em>showroom.</em></h2></div><p>Rolls-Royce to Bugatti — plus verified Japan stock for every market. The slide keeps running through live stock.</p></div>
    <div className="inventory-tools"><div className="filters">{['All','In Stock','Auction','New Arrival'].map(f=><button className={filter===f?'active':''} onClick={()=>setFilter(f)} key={f} type="button">{f}</button>)}</div><PageLink className="search-btn" to="inventory" navigate={navigate}><Search/> Search vehicles <SlidersHorizontal/></PageLink></div>
    <div className="car-grid">{shown.map((c,i)=><a className="car-card" key={c.id} style={{'--delay':i*80+'ms'}} href={hrefFor('inventory',carRef(c))} onClick={linkClick(`inventory?car=${carRef(c)}`,navigate)}>
      <div className="car-image"><img loading="lazy" decoding="async" width="820" height="550" src={c.image} alt={carAlt(c)}/><span className={'status '+statusSlug(c.status)}>{c.status||'In Stock'}</span><span role="button" tabIndex={0} className={favs.includes(c.id)?'fav active':'fav'} onClick={e=>{e.preventDefault();e.stopPropagation();setFavs(v=>v.includes(c.id)?v.filter(x=>x!==c.id):[...v,c.id])}} onKeyDown={e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();e.stopPropagation();setFavs(v=>v.includes(c.id)?v.filter(x=>x!==c.id):[...v,c.id])}}}><Heart fill={favs.includes(c.id)?'currentColor':'none'}/></span><span className="grade">Grade <b>{c.grade}</b></span></div>
      <div className="car-info"><div className="make"><img loading="lazy" decoding="async" width="34" height="22" src={LOGO(c.make)} alt="" onError={logoOnError}/>{c.make}</div><h3>{c.model}</h3><div className="specs"><span><CalendarDays/> {c.year}</span><span><Gauge/> {c.km} km</span><span><Fuel/> {c.fuel}</span><span><ArrowLeftRight/> {c.tr}</span></div><div className="car-bottom"><div><small>EXPORT PRICE FROM</small><VehiclePriceDisplay car={c} discounts={liveDiscounts}/></div><span className="card-open" aria-hidden="true"><ArrowUpRight/></span></div><div className="loc"><MapPin/> {c.location}, Japan</div></div>
    </a>)}</div>
    <div className="home-carousel-dots" aria-label="Inventory slide pages">{Array.from({length:homePages},(_,i)=><button key={i} type="button" className={i===homePage?'active':''} aria-label={'Show stock page '+(i+1)} onClick={()=>setHomeOff(i*HOME_N)}/>)}</div>
    <PageLink className="outline-btn" to="inventory" navigate={navigate}>View complete inventory <ArrowRight/></PageLink>
   </section>

   <section className="mch-teaser shell section" id="machinery">
    <div className="mch-teaser-head">
     <div><div className="kicker">CHINA MACHINERY · NEW DESK</div><h2>Excavators, loaders<br/><em>&amp; trucks.</em></h2></div>
     <p>Heavy equipment sourced to order from vetted Chinese suppliers — the same inspection, documentation and shipping desk that moves our cars.</p>
    </div>
    {/* One machine per type, and only ones we actually have a photograph of —
        the teaser is the first thing a visitor sees, so it never opens with a
        placeholder. Prices come from listPriceUSD() so the home page and the
        machinery page can never disagree. */}
    <div className="mch-teaser-grid">{MACHINES.filter(m=>!m.photosPending).filter((m,i,a)=>a.findIndex(x=>x.type===m.type)===i).slice(0,3).map(m=><article className="mch-card" key={m.id}>
      <div className="mch-photo"><img loading="lazy" decoding="async" width="820" height="560" src={machineImages(m)[0]} alt={`${m.name} for export — ${m.ref}`}/><span className="mch-type">{m.type.replace(/s$/,'')}</span>{machineImages(m).length>1&&<span className="mch-shotcount">{machineImages(m).length} photos</span>}{(()=>{const offer=stockDiscountFor(liveDiscounts,'machine',m.ref);return offer?<span className="mch-offer-flag"><Sparkles size={12}/> {offer.percent}% off</span>:null})()}</div>
      <div className="mch-info">
        <div className="mch-head"><b>{m.name}</b><small><MapPin/> {m.location}, {m.origin}</small></div>
        <p>{m.summary}</p>
        <div className="mch-foot"><div><small>INDICATIVE FOB</small>{(()=>{const offer=stockDiscountFor(liveDiscounts,'machine',m.ref);const p=priceWithOffer(listPriceUSD(m),offer?.percent||0);return p.hasOffer?<span className="mch-price-row"><s>{fmt(p.was)}</s> <b>{fmt(p.now)}</b></span>:<b>{fmt(p.now)}</b>})()}</div><PageLink className="mch-teaser-link" to={machineHref(m)} navigate={navigate}>Details <ArrowRight/></PageLink></div>
      </div>
    </article>)}</div>
    <div className="mch-teaser-foot"><PageLink className="primary" to="machinery" navigate={navigate}>Browse all machinery <ArrowRight/></PageLink><p className="mch-teaser-note">{MACHINERY_NOTE}</p></div>
   </section>

   <section className="world section"><div className="world-map"><DeferredBigGlobe navigate={navigate} compact/></div><div className="world-content shell"><div className="kicker">GLOBAL REACH, LOCAL CARE</div><h2>Japan to <em>everywhere.</em></h2><p>We ship through trusted carriers to ports worldwide. Spin the globe — tap Japan to browse stock, or any country for its market guide.</p><FounderStat variant="world"/><PageLink className="primary" to="destinations" navigate={navigate}>Explore destinations <ArrowRight/></PageLink></div></section>

   <section className="brand-budgets shell section" id="budgets">
    <div className="section-head"><div><div className="kicker">BROWSE BY MAKE & BUDGET</div><h2>Every brand.<br/><em>Every budget.</em></h2></div><p>Popular Japanese models with live export price ranges — tap a make to open its stock.</p></div>
    <div className="budget-grid">{brandBudgets.map(b=><a key={b.name} className="budget-card" href={inventoryHref(b.name)} onClick={linkClick(inventoryHref(b.name),navigate)}><div className="budget-head"><img loading="lazy" decoding="async" width="44" height="26" src={LOGO(b.name)} alt="" onError={logoOnError}/><b>{b.name}</b><span>{b.count} {b.count===1?'car':'cars'}</span></div><div className="budget-models">{b.models.map(m=><span key={m}>{m}</span>)}</div><div className="budget-range"><small>EXPORT PRICE RANGE</small><b>{b.lo?fmt(Math.round(b.lo/100)*100)+' – '+fmt(Math.round(b.hi/100)*100):'On request'}</b></div></a>)}</div>
    <div className="budget-bands">{budgetBands.map(x=><div key={x[0]}><b>{x[0]}</b><span>{x[1]}</span></div>)}</div>
   </section>

   <section className="process section" id="process"><div className="shell">
    <div className="section-head light"><div><div className="kicker">YOUR JOURNEY, SIMPLIFIED</div><h2>From auction floor<br/>to your <em>door.</em></h2></div><p>A transparent, four-step flow. You stay informed from the first bid to final delivery.</p></div>
    <div className="flow-line"><span/></div>
    <div className="steps">
     {[{n:'01',icon:<Search/>,t:'Tell us what you want',p:'Share your make, model, budget and destination. We shortlist the best matches.'},{n:'02',icon:<Gavel/>,t:'Bid with confidence',p:'Get live auction access, translated sheets, expert advice and a clear bidding limit.'},{n:'03',icon:<ClipboardCheck/>,t:'Inspect & prepare',p:'We verify, photograph, service and prepare your vehicle for international shipment.'},{n:'04',icon:<Ship/>,t:'Track to your port',p:'Follow your car with live shipment updates until it safely reaches your destination.'}].map((s,i)=><div className="step" key={s.n}><div className="step-top"><span>{s.n}</span><i>{s.icon}</i></div><h3>{s.t}</h3><p>{s.p}</p>{i<3&&<ArrowRight className="step-arrow"/>}</div>)}
    </div>
    <div className="process-cta"><span><LockKeyhole/> Secure client portal included</span><button className="gold-btn" onClick={()=>setModal(true)} type="button">Start sourcing <ArrowUpRight/></button></div>
   </div></section>

   <section className="auction-preview section shell" id="about">
    <div className="dash-wrap">
      <div className="dash-copy"><div className="kicker">AUCTION ACCESS</div><h2>The auction room,<br/>in your <em>pocket.</em></h2><p>Browse 100,000+ weekly listings from Japan's top auction houses. View translated inspection sheets, place bids, and track results—all in one place.</p><ul><li><Check/> Real-time vehicle listings</li><li><Check/> Translated auction sheets</li><li><Check/> Expert bid recommendations</li></ul><button className="primary" onClick={()=>setModal(true)} type="button">Request free access <ArrowRight/></button></div>
      <a className="dashboard" href="/portal" onClick={linkClick('portal',navigate)} title="Open client portal demo"><span className="dash-demo-chip">DEMO</span><div className="dash-nav"><img width="460" height="285" src="/assets/ar7-mark.png" alt="AR7 Traders" loading="lazy" decoding="async"/><span/><span/><span/></div><div className="dash-title"><div><small>GOOD MORNING, IMRAN</small><b>Auction workspace</b></div><div className="dash-search"><Search/> Search lot or chassis</div></div><div className="dash-stats"><div><i className="green"/><span>Live now<b>12 auctions</b></span></div><div><Gavel/><span>Your bids<b>04 active</b></span></div><div><BadgeCheck/><span>Won this month<b>07 vehicles</b></span></div></div><div className="dash-cars">{cars.slice(0,3).map(c=><div key={c.id}><img loading="lazy" decoding="async" width="820" height="550" src={c.image} alt={carAlt(c)}/><span><small>{stockLabel(c)}</small><b>{c.make} {c.model.split(' ')[0]}</b><em>Grade {c.grade}</em></span><strong>{price(c)}</strong></div>)}</div></a>
    </div>
   </section>

   <section className="cta shell section"><div className="cta-bg"/><div><div className="kicker">READY WHEN YOU ARE</div><h2>Let’s find your<br/>next <em>vehicle.</em></h2><p>Tell us what you’re looking for. Our Japan team will reply with suitable options.</p></div><button className="gold-btn large" onClick={()=>setModal(true)} type="button">Start your search <ArrowUpRight/></button></section>
   </>:page==='world'?<React.Suspense fallback={<div className="empty-state"><Globe2/><h3>Loading the network…</h3></div>}><Globe navigate={navigate}/></React.Suspense>:page==='account'?<React.Suspense fallback={<div className="empty-state"><LogIn/><h3>Loading your account…</h3></div>}><CustomerAccount navigate={navigate}/></React.Suspense>:page==='studio'?<DeviceStudio navigate={navigate}/>:page==='machinery'? <React.Suspense fallback={<div className="empty-state"><Wrench/><h3>Loading the machinery desk…</h3></div>}><MachineryPage navigate={navigate} initialType={machineRoute.type} machineRef={machineRoute.ref} openAuction={()=>setModal(true)} openChat={()=>chatRef.current?.open()}/></React.Suspense>:page==='japan-stock'?<JapanStockPage navigate={navigate} openAuction={()=>setModal(true)} discounts={liveDiscounts}/>:<InnerPage page={page} navigate={navigate} vehicleId={vehicleId} initialMake={makeFilter} initialModel={modelFilter} openAuction={()=>setModal(true)} openChat={()=>chatRef.current?.open()} favs={favs} setFavs={setFavs}/>}
  </main>

  <footer className="site-footer">
   <div className="shell footer-news">
    <div className="footer-news-copy"><div className="kicker">{t('footer.newsKicker')}</div><h2>{t('footer.newsH2a')}<br/><em>{t('footer.newsH2b')}</em></h2><p>{t('footer.newsBody')}</p></div>
    <form className="footer-news-form" onSubmit={e=>{e.preventDefault();const v=e.currentTarget.email.value.trim();if(v)location.href='mailto:'+settings.contact_email+'?subject='+encodeURIComponent('Stock alerts signup')+'&body='+encodeURIComponent('Please add '+v+' to your stock alerts list.');}}>
     <label className="footer-news-field"><Mail/><input name="email" type="email" required placeholder={t('footer.newsPlaceholder')} aria-label={t('footer.newsPlaceholder')}/></label>
     <button className="footer-news-btn" type="submit"><Send/> {t('footer.subscribe')}</button>
    </form>
   </div>
   <div className="shell footer-grid">
    <div className="footer-brand">
     <div className="footer-logo"><img width="150" height="150" src="/assets/ar7-logo.png" alt="AR7 Traders" loading="lazy" decoding="async"/></div>
     <p>{t('footer.tagline')}</p>
     <div className="footer-trust"><span><ShieldCheck/> {t('footer.trustSecure')}</span><span><FileCheck/> {t('footer.trustSheets')}</span><span><Ship/> {t('footer.trustDelivery')}</span></div>
     <div className="socials"><a href="/inventory" onClick={linkClick('inventory',navigate)} title="Vehicle gallery"><Camera/></a><a href="/reviews" onClick={linkClick('reviews',navigate)} title="Customer stories"><MessageCircle/></a><a href="/contact" onClick={linkClick('contact',navigate)} title="Contact AR7"><Send/></a><a className="wa-link" href={waLink(settings.whatsapp_number,settings.whatsapp_message)} target="_blank" rel="noopener noreferrer" title="WhatsApp AR7"><WhatsAppIcon size={15}/></a></div>
    </div>
    <div><b>{t('footer.explore')}</b><a href="/inventory" onClick={linkClick('inventory',navigate)}>{t('footer.inventory')}<ArrowUpRight/></a><a href="/japan-stock" onClick={linkClick('japan-stock',navigate)}>{t('footer.japanStock')}<ArrowUpRight/></a><a href="/auction" onClick={linkClick('auction',navigate)}>{t('footer.auction')}<ArrowUpRight/></a><a href="/machinery" onClick={linkClick('machinery',navigate)}>{t('footer.machinery')}<ArrowUpRight/></a><a href="/services" onClick={linkClick('services',navigate)}>{t('footer.services')}<ArrowUpRight/></a><a href="/brands" onClick={linkClick('brands',navigate)}>{t('footer.brands')}<ArrowUpRight/></a><a href="/destinations" onClick={linkClick('destinations',navigate)}>{t('footer.destinations')}<ArrowUpRight/></a><a href="/tools" onClick={linkClick('tools',navigate)}>{t('footer.tools')}<ArrowUpRight/></a><a href="/world" onClick={linkClick('world',navigate)}>{t('footer.world')}<ArrowUpRight/></a></div>
    <div><b>{t('footer.company')}</b><a href="/howbuy" onClick={linkClick('howbuy',navigate)}>{t('footer.howToBuy')}<ArrowUpRight/></a><a href="/news" onClick={linkClick('news',navigate)}>{t('footer.news')}<ArrowUpRight/></a><a href="/about" onClick={linkClick('about',navigate)}>{t('footer.about')}<ArrowUpRight/></a><a href="/reviews" onClick={linkClick('reviews',navigate)}>{t('footer.reviews')}<ArrowUpRight/></a><a href="/faq" onClick={linkClick('faq',navigate)}>{t('footer.faq')}<ArrowUpRight/></a>{signedIn&&<a href="/account" onClick={linkClick('account',navigate)}>{t('footer.myAccount')}<ArrowUpRight/></a>}<a href="/portal" onClick={linkClick('portal',navigate)}>{t('footer.portal')}<ArrowUpRight/></a><a href="/crm" onClick={linkClick('crm',navigate)}>{t('footer.crm')}<ArrowUpRight/></a>{!signedIn&&<a href="/account" onClick={linkClick('account',navigate)}>{t('footer.signUp')}<ArrowUpRight/></a>}</div>
    <div><b>{t('contact.getInTouch')}</b><a href={'mailto:'+settings.contact_email}><Mail/> {settings.contact_email}</a><a href={telHref(settings.contact_phone)}><Phone/> {settings.contact_phone}</a><a className="wa-link" href={waLink(settings.whatsapp_number,settings.whatsapp_message)} target="_blank" rel="noopener noreferrer"><WhatsAppIcon size={15}/> {t('contact.whatsapp')}</a><a href="/contact" onClick={linkClick('contact',navigate)}><MapPin/> {settings.contact_address}</a>
     <div className="footer-hours"><Clock3/><span><b>{t('contact.hours')}</b><small>{t('contact.hoursValue')}</small></span></div>
     <button className="footer-top-btn" onClick={()=>window.scrollTo({top:0,behavior:'smooth'})} type="button">{t('footer.backToTop')} <ArrowUpRight/></button>
    </div>
   </div>
   <div className="shell footer-bottom"><span>{t('footer.copyright',{year:new Date().getFullYear()})}</span><span><a href="/faq" onClick={linkClick('faq',navigate)}>{t('footer.privacy')}</a> · <a href="/faq" onClick={linkClick('faq',navigate)}>{t('footer.terms')}</a> · <a href="/faq" onClick={linkClick('faq',navigate)}>{t('footer.exportPolicy')}</a></span><div className="footer-badges"><span><BadgeCheck/> {t('footer.verifiedStock')}</span><span><LockKeyhole/> {t('footer.trustSecure')}</span></div><b>AR7TRADERS.COM</b></div>
  </footer>

  <WhatsAppButton/>

  <ChatWidget ref={chatRef}/>

  {modal&&<div className="modal-backdrop" onMouseDown={()=>setModal(false)}><div className="modal" onMouseDown={e=>e.stopPropagation()}><button className="modal-x" onClick={()=>setModal(false)} type="button" aria-label={t('common.close')}><X/></button>{sent?<div className="success"><span><Check/></span><h2>{t('enq.successTitle')}</h2><p>{t('enq.successBody')}</p><button className="primary" onClick={()=>{setSent(false);setModal(false)}} type="button">{t('enq.backToSite')}</button></div>:<><div className="kicker">{t('enq.kicker')}</div><h2>{t('enq.h2')}</h2><p>{t('enq.body')}</p><form onSubmit={submitLead}>{leadError&&<div className="form-api-error">{leadError}</div>}<input name="website" tabIndex="-1" autoComplete="off" style={{display:'none'}}/><label>{t('enq.yourName')}<input name="name" required placeholder={t('enq.namePlaceholder')}/></label><div className="form-row"><label>{t('enq.email')}<input name="email" required type="email" placeholder="you@email.com"/></label><label>{t('enq.destination')}<select name="country"><option>Pakistan</option><option>UAE</option><option>United Kingdom</option><option>Kenya</option><option>Other</option></select></label></div><label>{t('enq.vehicle')}<input name="vehicle_interest" placeholder={t('enq.vehiclePlaceholder')}/></label><button className="primary" type="submit" disabled={leadSending}>{leadSending?t('enq.sending'):t('enq.submit')} <ArrowRight/></button><small><LockKeyhole/> {t('enq.privacy')}</small></form></>}</div></div>}
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
    <img src="/assets/ar7-mark.png" alt="AR7 Traders" width="56" height="56" style={{borderRadius:12}} loading="lazy" decoding="async"/>
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
