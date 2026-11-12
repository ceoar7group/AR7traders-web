// Static-content pages, split from main.jsx on 2026-11-11 (owner: continue
// the main-bundle code-split). ExtraPage (services/destinations picker/
// reviews/faq/portal demo), ExtraPages2 (brands/howbuy/tools/news) and the
// responsive DeviceStudio are reached by navigation, never by the first
// paint of the home page — so they live in their own lazy chunk, and the
// whole news/guides catalogue (news-data.js) leaves the first-load bundle
// with them. The shared building blocks (VehicleCard, PageLink, cars, …)
// stay in main.jsx and are imported back here; the circular import is safe
// because this module only ever loads AFTER main.jsx has fully evaluated.
import React, {useState} from 'react';
// Styles for these pages ride in this lazy chunk too (split from the eagerly
// imported extra-pages.css on 2026-11-12 — PSI flagged them as unused CSS on
// first paint; only .extra-head/.detail-gallery stay eager, see that file).
import './pages-static.css';
import { ArrowRight, ArrowUpRight, BadgeCheck, BadgePercent, BookOpen, Calculator, Check, ClipboardCheck, CreditCard, FileCheck, Gavel, Globe2, Landmark, Laptop, LockKeyhole, Monitor, Newspaper, Phone, ShieldCheck, Ship, Smartphone, Tablet } from 'lucide-react';
import { carAlt } from './car-alt.js';
import { useCurrency } from './currency.jsx';
import { DEST, destinationHref } from './destinations.js';
import { Flag } from './flag.jsx';
import { useLang } from './i18n.jsx';
import { MACHINES, MACHINE_TYPES } from './machinery-data.js';
import { articleBySlug, articleSlug, getNewsCategories, getPublishedNews } from './news-data.js';
import { inventoryHref, linkClick } from './routing.js';
import { FAQ_ITEMS, FAQ_TOPICS } from './seo.js';
import { logoOnError } from './site-header.jsx';
import { cars, HOWBUY, FOUNDER_CLAIM, BRANDS, BUILD_STAMP, InteractiveGlobe, LOGO, PageLink, RelatedMachines, RelatedStock, ReviewsShowcase, VehicleCard, useCarPrice, modelPick } from './main.jsx';

const DUTY={'Pakistan':48,'UAE':5,'Kenya':25,'United Kingdom':10,'New Zealand':10,'Tanzania':25,'Australia':15,'USA':3,'Uganda':40,'Zambia':35,'Zimbabwe':60,'Mozambique':35,'DR Congo':45,'Botswana':30,'Jamaica':50,'Trinidad & Tobago':45,'Guyana':60,'Fiji':32,'Papua New Guinea':40,'Sri Lanka':120,'Bangladesh':130,'Mongolia':20,'Ireland':35,'Cyprus':30,'Malta':30,'Oman':5,'Qatar':5};

const PAYMENTS=[['Bank transfer (T/T)','Direct USD or JPY transfer to our corporate account. Most common worldwide.',Landmark],['Card payment','Visa / Mastercard for smaller balances via secure gateway.',CreditCard],['PayPal','Convenient for deposits and smaller balances.',BadgePercent],['AR7 escrow','Funds released to us only when your vehicle is loaded and documents issued.',ShieldCheck]];

const FLAG={'Pakistan':'🇵🇰','UAE':'🇦🇪','Kenya':'🇰🇪','Tanzania':'🇹🇿','United Kingdom':'🇬🇧','New Zealand':'🇳🇿','Australia':'🇦🇺','USA':'🇺🇸','Uganda':'🇺🇬','Zambia':'🇿🇲','Zimbabwe':'🇿🇼','Mozambique':'🇲🇿','DR Congo':'🇨🇩','Botswana':'🇧🇼','Jamaica':'🇯🇲','Trinidad & Tobago':'🇹🇹','Guyana':'🇬🇾','Fiji':'🇫🇯','Papua New Guinea':'🇵🇬','Sri Lanka':'🇱🇰','Bangladesh':'🇧🇩','Mongolia':'🇲🇳','Ireland':'🇮🇪','Cyprus':'🇨🇾','Malta':'🇲🇹','Oman':'🇴🇲','Qatar':'🇶🇦','Japan':'🇯🇵','Other':'🌍'};

const FAQ_TOPIC_KEY = { 'Auctions & condition': 'faq.topicAuctions', 'Pricing & payment': 'faq.topicPricing', 'Shipping & documents': 'faq.topicShipping', 'Customs & arrival': 'faq.topicArrival' };

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

function DeviceStudio({navigate}){
 const [device,setDevice]=useState('laptop');
 const sizes={phone:[390,720],tablet:[768,720],laptop:[1100,700],desktop:[1360,720]}; const [w,h]=sizes[device];
 return <section className="device-page"><div className="page-orb-wrap studio-orb"><InteractiveGlobe lite cls="mini" onTap={()=>navigate('world')}/></div><div className="shell"><div className="device-head"><div><div className="kicker">RESPONSIVE VIEW STUDIO</div><h1>Test every <em>screen.</em></h1><p>Switch devices to preview the AR7 website at realistic viewport sizes.</p></div><div className="device-tabs"><button className={device==='phone'?'active':''} onClick={()=>setDevice('phone')} type="button"><Smartphone/>Phone</button><button className={device==='tablet'?'active':''} onClick={()=>setDevice('tablet')} type="button"><Tablet/>Tablet</button><button className={device==='laptop'?'active':''} onClick={()=>setDevice('laptop')} type="button"><Laptop/>Laptop</button><button className={device==='desktop'?'active':''} onClick={()=>setDevice('desktop')} type="button"><Monitor/>PC</button></div></div><div className={'device-frame '+device} style={{'--frame-w':w+'px','--frame-h':h+'px'}}><div className="camera-dot"/><iframe src={'/?embed=1'+BUILD_STAMP} title="AR7 responsive preview"/></div><div className="device-size">{w} × {h} px · interactive demo</div></div></section>
}

function ExtraPage({type,navigate,openAuction}){
 const {fmt}=useCurrency();
 const {t}=useLang();
 const [open,setOpen]=useState(0),[service,setService]=useState(0),[port,setPort]=useState(DEST[0][0]),[portalTab,setPortalTab]=useState('Shipments');
 const activeDest=DEST.find(x=>x[0]===port||x[1]===port||x[1].startsWith(port))||DEST[0];
 // The picker used to scroll to an inline guide; the guide is a page now, so
 // choosing a market simply sets which one the button opens.
 const selectDest=val=>setPort(val);
 const headers={
  services:[t('page.servicesKicker'),<>{t('page.servicesH1a')}<br/><em>{t('page.servicesH1b')}</em></>,t('page.servicesBody')],
  destinations:[t('page.destinationsKicker'),<>{t('page.destinationsH1a')}<br/><em>{t('page.destinationsH1b')}</em></>,t('page.destinationsBody')],
  reviews:[t('page.reviewsKicker'),<>{t('page.reviewsH1a')}<br/><em>{t('page.reviewsH1b')}</em></>,t('page.reviewsBody')],
  faq:[t('page.faqKicker'),<>{t('page.faqH1a')}<br/><em>{t('page.faqH1b')}</em></>,t('page.faqBody')],
  portal:[t('page.portalKicker'),<>{t('page.portalH1a')}<br/><em>{t('page.portalH1b')}</em></>,t('page.portalBody')]};
 const h=headers[type];
 const services=[['Auction sourcing','Live access to USS, TAA, JU, CAA and more.','100,000+ weekly listings'],['Dealer stock','Curated off-auction vehicles from trusted networks.','Fast purchase decisions'],['Inspection','Independent condition checks, photos and road tests.','Clear condition report'],['Export logistics','Booking, customs, insurance and documentation.','Destination markets worldwide'],['Parts sourcing','Optional OEM parts and accessories before shipment.','Consolidated shipping'],['Dealer programs','Volume sourcing and dedicated account support.','Wholesale pricing']];
 return <section className="inner-page extra-page"><div className="page-hero mini extra-head"><div className="page-orb-wrap"><InteractiveGlobe lite cls="mini" onTap={()=>navigate('world')}/></div><div className="shell"><div className="kicker">{h[0]}</div><h1>{h[1]}</h1><p>{h[2]}</p>{type==='portal'?<PageLink className="gold-btn" to="account" navigate={navigate}>{t('page.openAccount')} <ArrowRight/></PageLink>:<button className="gold-btn" onClick={openAuction} type="button">{t('page.talkTeam')} <ArrowRight/></button>}</div></div><div className="shell page-content">
 {type==='services'&&<><div className="service-layout"><div className="service-tabs">{services.map((x,i)=><button key={x[0]} className={service===i?'active':''} onClick={()=>setService(i)} type="button"><span>0{i+1}</span>{t('svc.'+(i+1)+'t')}<ArrowRight/></button>)}</div><div className="service-panel"><Gavel/><div className="kicker">{t('svc.panelKicker')} 0{service+1}</div><h2>{t('svc.'+(service+1)+'t')}</h2><p>{t('svc.'+(service+1)+'p')}</p><strong>{t('svc.'+(service+1)+'s')}</strong><ul><li><Check/> {t('svc.li1')}</li><li><Check/> {t('svc.li2')}</li><li><Check/> {t('svc.li3')}</li></ul><button className="primary" onClick={openAuction} type="button">{t('svc.request')}</button></div></div><RelatedStock navigate={navigate} kicker={t('rel.svcKicker')} note={t('rel.svcNote')}/><div className="demo-strip">{[1,2,3,4].map(i=><div key={i}><b>{t('svc.st'+i+'b')}</b><span>{t('svc.st'+i+'s')}</span></div>)}</div></>}
 {type==='destinations'&&<><RelatedStock navigate={navigate} limit={6} fill pick={modelPick(activeDest[3])||undefined} kicker={t('rel.destKicker')} note={t('rel.destNote',{m:activeDest[0]})}/><div className="destination-picker"><div><div className="kicker">{t('dest.pickKicker')}</div><h2>{t('dest.pickH2')}</h2></div><select value={activeDest[0]} onChange={e=>setPort(e.target.value)} aria-label="Select destination market">{DEST.map(x=><option key={x[0]} value={x[0]}>{FLAG[x[0]]} {x[0]} — {x[1].split(' / ')[0]}</option>)}</select><PageLink className="primary" to={destinationHref(activeDest[0])} navigate={navigate}>{t('dest.openGuide').replace('{m}',activeDest[0])} <ArrowRight/></PageLink></div>{/* 2026-10-08: the guide itself moved to the market's own URL. Rendering it
     here as well meant the same paragraphs lived on two URLs — duplicate copy
     for a crawler to choose between, and a hub that answered nothing a market
     page could not answer better. The hub now picks the market and opens it. */}
<p className="destination-hub-note"><ShieldCheck/> <span><b>{t('dest.hubNoteTitle')}</b> {t('dest.hubNoteBody')}</span></p><div className="destination-grid">{DEST.map(x=><article key={x[0]} className={activeDest[0]===x[0]?'active':''}><Globe2/><div className="kicker"><Flag c={x[0]} w={20} h={13}/> {x[0]}</div><h3>{x[1]}</h3><p><Ship/> {t('dest.transit')} <b>{x[2]}</b></p><small>{t('dest.popular')} {x[3]}</small><PageLink className="outline-btn" to={destinationHref(x[0])} navigate={navigate}>{t('dest.openGuide').replace('{m}',x[0])} <ArrowRight/></PageLink></article>)}</div></>}
 {type==='reviews'&&<React.Suspense fallback={<div className="empty-state route-fallback"><h3>Loading customer reviews…</h3></div>}><ReviewsShowcase navigate={navigate} openAuction={openAuction} founderClaim={FOUNDER_CLAIM}/></React.Suspense>}
 {type==='faq'&&<div className="faq-layout"><div><div className="kicker">{t('faq.kicker')}</div><h2>{t('faq.h2')}</h2><p>{t('faq.body')}</p><PageLink className="primary" to="contact" navigate={navigate}>{t('faq.ask')}</PageLink><RelatedStock navigate={navigate} limit={4} kicker={t('rel.faqKicker')} note={t('rel.faqNote')}/></div><div className="accordions">{FAQ_TOPICS.map(topic=><div className="faq-topic-group" key={topic}><h3 className="faq-topic-title">{FAQ_TOPIC_KEY[topic]?t(FAQ_TOPIC_KEY[topic]):topic}</h3>{FAQ_ITEMS.map((x,i)=>x[2]===topic?<article key={x[0]} className={open===i?'open':''}><button type="button" onClick={()=>setOpen(open===i?-1:i)}><span>{i<14?t('faq.q'+(i+1)):x[0]}</span><b>{open===i?'−':'+'}</b></button>{open===i&&<p>{i<14?t('faq.a'+(i+1)):x[1]}</p>}</article>:null)}</div>)}</div></div>}
 {type==='portal'&&<div className="portal-live-note"><ShieldCheck/><div><b>This is a preview of the dashboard.</b><span>Your own vehicles, every payment received and the balance remaining are waiting in your account.</span></div><PageLink className="primary" to="account" navigate={navigate}>Sign in <ArrowRight/></PageLink></div>}
 {type==='portal'&&<div className="portal-demo"><aside><img width="128" height="79" src="/assets/ar7-mark-128.webp" alt="AR7 Traders" loading="lazy" decoding="async"/>{['Shipments','Auctions','Documents','Payments'].map(x=><button key={x} className={portalTab===x?'active':''} onClick={()=>setPortalTab(x)} type="button">{x}</button>)}<small>SAMPLE ACCOUNT<br/><b>Imran Khan</b></small></aside><section className="portal-main" aria-label="Client portal preview"><header><div><small>CLIENT PORTAL / {portalTab.toUpperCase()}</small><h2>{portalTab}</h2></div><button onClick={openAuction} type="button">Contact agent</button></header>{portalTab==='Shipments'?<div className="portal-shipment"><div className="portal-car"><img loading="lazy" decoding="async" width="820" height="550" src={cars[0].image} alt={carAlt(cars[0])}/><span><small>AR7-260184</small><b>Toyota Land Cruiser ZX</b><em>Yokohama → Karachi</em></span><strong>IN TRANSIT</strong></div><div className="track-line">{['Purchased','Inspected','Loaded','At sea','Arrived'].map((x,i)=><span key={x} className={i<4?'done':''}><i/>{x}<small>{i<4?'Complete':'Sep 08'}</small></span>)}</div></div>:portalTab==='Auctions'?<div className="portal-list">{cars.slice(1,5).map(c=><VehicleCard key={c.id} c={c} discounts={discounts}/>)}</div>:portalTab==='Documents'?<div className="doc-list">{['Commercial invoice.pdf','Export certificate.pdf','Bill of lading.pdf','Inspection report.pdf'].map((x,i)=><button key={x} onClick={openAuction} type="button"><ClipboardCheck/><span><b>{x}</b><small>Updated Aug {12+i}, 2026 · PDF</small></span><ArrowUpRight/></button>)}</div>:<div className="payment-card"><BadgeCheck/><h3>Account up to date</h3><p>All sample invoices have been paid.</p><div><span>Vehicle payment<b>{fmt(58900)}</b></span><span>Freight & insurance<b>{fmt(2480)}</b></span><span>Balance due<b>{fmt(0)}</b></span></div></div>}</section></div>}
 </div></section>
}


function ExtraPages2({type,navigate,openAuction,articleSlug:activeSlug,discounts}){
 const price=useCarPrice(discounts);
 const {fmt,toUsd,display}=useCurrency();
 const {t}=useLang();
 const headers={
  brands:[t('page.brandsKicker'),<>{t('page.brandsH1a')}<br/><em>{t('page.brandsH1b')}</em></>,t('page.brandsBody')],
  howbuy:[t('page.howbuyKicker'),<>{t('page.howbuyH1a')}<br/><em>{t('page.howbuyH1b')}</em></>,t('page.howbuyBody')],
  tools:[t('page.toolsKicker'),<>{t('page.toolsH1a')}<br/><em>{t('page.toolsH1b')}</em></>,t('page.toolsBody')],
  news:[t('page.newsKicker'),<>{t('page.newsH1a')}<br/><em>{t('page.newsH1b')}</em></>,t('page.newsBody')]};
 const h=headers[type];
 const [shipDest,setShipDest]=useState('Karachi / Port Qasim'),[shipPrice,setShipPrice]=useState(25000),[shipMethod,setShipMethod]=useState('RoRo');
 const [dutyCountry,setDutyCountry]=useState('Pakistan'),[dutyPrice,setDutyPrice]=useState(25000);
 const [newsCat,setNewsCat]=useState('All');
 const news=getPublishedNews();
 const newsCategories=getNewsCategories();
 const article=type==='news'&&activeSlug?articleBySlug(activeSlug,news):null;
 const filteredNews=newsCat==='All'?news:news.filter(x=>x.cat===newsCat);
 return <section className="inner-page extra-page"><div className="page-hero mini extra-head"><div className="page-orb-wrap"><InteractiveGlobe lite cls="mini" onTap={()=>navigate('world')}/></div><div className="shell"><div className="kicker">{h[0]}</div><h1>{h[1]}</h1><p>{h[2]}</p>{type!=='news'&&<button className="gold-btn" onClick={openAuction} type="button">{t('page.talk')} <ArrowRight/></button>}</div></div><div className="shell page-content">
 {type==='brands'&&<><div className="brand-grid">{BRANDS().map(b=><article className="brand-card" key={b.name}><span className="brand-tile"><img loading="lazy" decoding="async" width="56" height="34" src={LOGO(b.name)} alt={b.name+" logo"} onError={logoOnError}/><small>{b.name}</small></span><div className="brand-body"><div><b>{t('brands.count',{n:b.count})}</b><span>{t('brands.nowInStock')}</span></div><div className="brand-models">{b.models.map(m=><a href={inventoryHref(b.name)} onClick={linkClick(inventoryHref(b.name),navigate)} key={m}>{m}</a>)}</div><PageLink className="outline-btn" to={inventoryHref(b.name)} navigate={navigate}>{t('brands.view',{b:b.name})} <ArrowRight/></PageLink></div></article>)}</div><RelatedStock navigate={navigate} limit={6} kicker={t('rel.brandKicker')} note={t('rel.brandNote')} pick={BRANDS().flatMap(b=>cars.filter(c=>c.make===b.name).slice(0,1))}/><div className="demo-strip">{BRANDS().length===0?null:[['12',t('brands.st1')],['30',t('brands.st2')],['100%',t('brands.st3')],['24h',t('brands.st4')]].map(x=><div key={x[0]}><b>{x[0]}</b><span>{x[1]}</span></div>)}</div></>}
 {type==='howbuy'&&<><div className="howbuy-flow">{HOWBUY.map((x,i)=><div className="hb-step" key={x[2]}><span>{x[2]}</span><div><b>{t('hb.s'+(i+1)+'t')}</b><p>{t('hb.s'+(i+1)+'p')}</p>{x[3]&&<p className="hb-what">{t('hb.s'+(i+1)+'w')}</p>}</div>{i<HOWBUY.length-1&&<ArrowRight className="hb-arrow"/>}</div>)}</div><div className="hb-timeline"><div className="kicker">{t('hb.tlKicker')}</div><h2>{t('hb.tlH2')}</h2><div className="hb-days">{[1,2,3,4,5,6].map(i=><span key={i}><b>{t('hb.d'+i)}</b><small>{t('hb.d'+i+'x')}</small></span>)}</div></div><div className="hb-pay"><div className="kicker">{t('hb.payKicker')}</div><h2>{t('hb.payH2')}</h2><div className="pay-grid">{PAYMENTS.map((x,i)=>{const PI=x[2];return <article key={x[0]}><PI/><b>{t('hb.pay'+(i+1)+'t')}</b><p>{t('hb.pay'+(i+1)+'p')}</p></article>})}</div></div><div className="hb-docs"><div className="kicker">{t('hb.docKicker')}</div><h2>{t('hb.docH2')}</h2><div className="doc-pills">{[1,2,3,4,5,6].map(i=><span key={i}><FileCheck/> {t('hb.doc'+i)}</span>)}</div></div><RelatedStock navigate={navigate} limit={3} kicker={t('rel.hbKicker')} note={t('rel.hbNote')}/></>}
 {type==='tools'&&<><div className="tools-grid"><article className="tool-card"><BookOpen/><div className="kicker">{t('tools.cifKicker')}</div><h2>{t('tools.cifH2')}</h2><label>{t('tools.lblPort')}<select value={shipDest} onChange={e=>setShipDest(e.target.value)}>{DEST.map(x=><option key={x[1]}>{x[1]}</option>)}</select></label><label>{t('tools.lblValue')} (FOB {display})<input type="number" value={shipPrice} onChange={e=>setShipPrice(Math.max(500,+e.target.value||0))}/></label><label>{t('tools.lblMethod')}<select value={shipMethod} onChange={e=>setShipMethod(e.target.value)}><option>RoRo</option><option>Container (+$2,000)</option></select></label><div className="calc-out">{(()=>{const v=toUsd(shipPrice);const freight=Math.round(v*0.016+(DEST.find(x=>x[1]===shipDest)||DEST[0])[4]+(shipMethod==='Container (+$2,000)'?2000:0));const docs=350+Math.round(v*0.016);return <><span><small>{t('tools.freight')}</small><b>{fmt(freight)}</b></span><span><small>{t('tools.docsIns')}</small><b>{fmt(docs)}</b></span><span className="total"><small>{t('tools.cifTotal')}</small><b>{fmt(v+freight+docs)}</b></span></>})()}</div><small className="demo-note"><LockKeyhole/> {t('tools.cifNote').replace('{c}',display)}</small></article><article className="tool-card"><Calculator/><div className="kicker">{t('tools.dutyKicker')}</div><h2>{t('tools.dutyH2')}</h2><label>{t('tools.lblCountry')}<select value={dutyCountry} onChange={e=>setDutyCountry(e.target.value)}>{Object.keys(DUTY).map(x=><option key={x}>{FLAG[x]} {x}</option>)}</select></label><label>{t('tools.lblValue')} ({display})<input type="number" value={dutyPrice} onChange={e=>setDutyPrice(Math.max(500,+e.target.value||0))}/></label><div className="calc-out"><span><small>{t('tools.dutyTax')}</small><b>{fmt(toUsd(dutyPrice)*DUTY[dutyCountry]/100)}</b></span><span className="total"><small>{t('tools.landed')}</small><b>{fmt(toUsd(dutyPrice)*(1+DUTY[dutyCountry]/100))}</b></span></div><p className="tool-note">{t('tools.dutyNote')}</p></article></div><RelatedStock navigate={navigate} limit={3} kicker={t('rel.toolsKicker')} note={t('rel.toolsNote')}/></>}
 {type==='news'&&<>{activeSlug&&!article&&<div className="empty-state article-missing"><Newspaper/><h3>Guide not found</h3><p>This buying guide link is out of date or does not exist. Browse our current Japan import guides instead.</p><PageLink className="primary" to="news" navigate={navigate}>All guides <ArrowRight/></PageLink></div>}
 {article&&<article className="news-article"><PageLink className="back-btn" to="news" navigate={navigate}>{t('news.back')}</PageLink><div className="kicker">{article.cat} · {article.date} · {article.min} {t('news.minRead')}</div><h2>{article.title}</h2><img loading="lazy" decoding="async" width="820" height="550" src={article.img} alt={article.title}/>{article.body.split('\n\n').map((x,i)=><p key={i}>{x}</p>)}<RelatedStock navigate={navigate} limit={3} kicker={t('rel.newsKicker')} note={t('rel.newsNote')} pick={stockNamedIn(article.title+' '+article.body)}/><RelatedMachines navigate={navigate} limit={3} kicker={t('rel.machKicker')} note={t('rel.machNote')} pick={machinesNamedIn(article.title+' '+article.body)}/><button className="primary" onClick={openAuction} type="button">{t('news.ask')} <ArrowRight/></button><footer className="news-article-footer"><div className="kicker">{t('news.keep')}</div><nav className="news-article-links" aria-label="Related import resources"><PageLink className="outline-btn" to="destinations" navigate={navigate}>{t('news.lnkDest')} <ArrowRight/></PageLink><PageLink className="outline-btn" to="shipping" navigate={navigate}>{t('news.lnkShip')} <ArrowRight/></PageLink><PageLink className="outline-btn" to="/machinery" navigate={navigate}>{t('news.lnkMach')} <ArrowRight/></PageLink><PageLink className="outline-btn" to="tools" navigate={navigate}>{t('news.lnkTools')} <ArrowRight/></PageLink><PageLink className="outline-btn" to="howbuy" navigate={navigate}>{t('news.lnkHowbuy')} <ArrowRight/></PageLink><PageLink className="outline-btn" to="faq" navigate={navigate}>{t('news.lnkFaq')} <ArrowRight/></PageLink></nav></footer></article>}
 {!activeSlug&&<><div className="news-filter-bar" role="tablist" aria-label="Filter guides by topic"><button type="button" className={newsCat==='All'?'active':''} onClick={()=>setNewsCat('All')}>{t('news.all')}</button>{newsCategories.map(cat=><button type="button" key={cat} className={newsCat===cat?'active':''} onClick={()=>setNewsCat(cat)}>{cat}</button>)}</div><div className="news-grid">{filteredNews.map(x=>{const slug=articleSlug(x.title);return <PageLink className="news-card" key={slug} to={'/news/'+slug} navigate={navigate}><img loading="lazy" decoding="async" width="820" height="550" src={x.img} alt={x.title||"AR7 Traders vehicle export"}/><div className="news-meta"><span>{x.cat}</span><small>{x.date} · {x.min} {t('news.min')}</small></div><h2>{x.title}</h2><p>{x.excerpt||x.ex}</p><b>{t('news.read')} <ArrowRight/></b></PageLink>;})}</div><RelatedStock navigate={navigate} limit={4} kicker={t('rel.stockNow')} note={t('rel.newsListNote')}/><RelatedMachines navigate={navigate} limit={3} kicker={t('rel.machAlsoKicker')} note={t('rel.machAlsoNote')}/></>}
 </>}</div></section>}

export { DeviceStudio, ExtraPage, ExtraPages2 };
