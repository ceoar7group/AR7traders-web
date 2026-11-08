import React, {useEffect, useRef, useState} from 'react';
import { Ship, ArrowRight, CarFront, Gavel, BadgeCheck } from 'lucide-react';
import { linkClick } from './routing.js';
import { Flag } from './flag.jsx';
import { useLang } from './i18n.jsx'; // 2026-11-11: world screen translates
// 2026-11-10 (owner request: "redesign, completely free rotation, accurate
// countries"): the flat scrolling map strip is gone — globe3d.js renders a
// TRUE orthographic sphere from Natural Earth 110m geometry on canvas, and
// the chips/flags below are plain DOM positioned by the engine every frame.
// network.jsx stays a lazy chunk, so none of this touches first-load budget.
import { mountGlobe } from './globe3d.js';
import './network.css';
export { Flag };

/* ============================================================
   AR7 WORLD NETWORK — big TRUE-3D globe (2026-11-10 redesign)
   • orthographic canvas sphere: real country shapes, exact places
   • drag in ANY direction with inertia · live day & night
   • animated great-circle routes + ships on canvas
   • real SVG country flags + market chips as clickable DOM
   • tap Japan → inventory · China → machinery · market → guide
   ============================================================ */

const MARKETS = [
 {name:'Pakistan', port:'Karachi', lon:67, lat:24.9, transit:'18–24 days', models:'Land Cruiser · Vezel · Mira'},
 {name:'UAE', port:'Jebel Ali', lon:55.2, lat:25.0, transit:'18–22 days', models:'Lexus · Patrol · Alphard'},
 {name:'Kenya', port:'Mombasa', lon:39.7, lat:-4.0, transit:'24–30 days', models:'Harrier · Prado · Note'},
 {name:'Tanzania', port:'Dar es Salaam', lon:39.3, lat:-6.8, transit:'25–32 days', models:'RAV4 · Hiace · Vitz'},
 {name:'United Kingdom', port:'Southampton', lon:-1.4, lat:50.9, transit:'35–42 days', models:'Vellfire · Skyline · Jimny'},
 {name:'New Zealand', port:'Auckland', lon:174.8, lat:-36.8, transit:'20–26 days', models:'Prius · CX-5 · Forester'},
 {name:'Australia', port:'Sydney', lon:151.2, lat:-33.9, transit:'21–28 days', models:'Land Cruiser · Hiace'},
 {name:'USA', port:'Los Angeles', lon:-118.2, lat:34.0, transit:'28–36 days', models:'Kei trucks · 4Runner'},
 // 2026-11-14 (owner: "add more routes, like the Caribbean"): the three
 // Caribbean markets that already have full guides in destinations.js now
 // sail on the globe too — transit/models copied from those guides.
 {name:'Jamaica', port:'Kingston', lon:-76.8, lat:18.0, transit:'40–50 days', models:'Fielder · Axio · Probox'},
 {name:'Trinidad & Tobago', port:'Port of Spain', lon:-61.5, lat:10.7, transit:'42–52 days', models:'Aqua · Fielder · Raize'},
 {name:'Guyana', port:'Georgetown', lon:-58.2, lat:6.8, transit:'45–55 days', models:'Premio · Allion · Spacio'}
];
const JP = {lon:138, lat:36};
const CN = {lon:104, lat:35};

/* 2026-11-09 (owner request): country flags straight on the map. Every entry
   has a hand-drawn vector in flag.jsx; countries already carrying a full
   market chip are filtered out at render time so nothing doubles up. */
const FLAG_POINTS = [
 ['Pakistan',69,30],['UAE',54.3,23.9],['Saudi Arabia',45,24],['Qatar',51.2,25.3],['Oman',56,21],
 ['Kenya',37.8,0.4],['Tanzania',34.9,-6.4],['Uganda',32.3,1.3],['Zambia',27.8,-13.4],['Zimbabwe',29.9,-19],
 ['Mozambique',35.5,-17.8],['DR Congo',23.6,-2.9],['Botswana',24.7,-22.3],
 ['United Kingdom',-1.9,53.8],['Ireland',-8,53.2],['Germany',10.4,51.2],['France',2.2,46.6],
 ['Russia',96,61.5],['Turkey',35.2,39],['Cyprus',33.2,35.1],['Malta',14.4,35.9],
 ['Canada',-106,56],['USA',-100,39.8],['Jamaica',-77.3,18.1],['Guyana',-58.9,4.9],
 ['India',78.9,21.5],['Sri Lanka',80.8,7.9],['Bangladesh',90.4,23.7],['Mongolia',103,46.9],
 ['Australia',134,-25],['New Zealand',172.5,-42.5],['Fiji',178,-17.8],['Papua New Guinea',144,-6.5]
];

/* ---------------------------------------------------------------------------
   Live routes.
   MARKETS above is the built-in fallback so the globe is never empty if the
   API is unreachable or the database has not been provisioned yet. When the
   CRM has published shipping routes with map coordinates we swap them in.
   Kept as a module-level array with a subscriber set (same pattern as the
   car listings in main.jsx) so both the globe and the market cards redraw.
--------------------------------------------------------------------------- */
const marketListeners = new Set();
const onMarkets = fn => {marketListeners.add(fn); return () => marketListeners.delete(fn)};

function useMarkets(){
  const [, bump] = useState(0);
  useEffect(() => onMarkets(() => bump(n => n + 1)), []);
  return MARKETS;
}

async function hydrateMarkets(){
  try{
    const res = await fetch('/api/site-content?entity=routes');
    if(!res.ok) return;
    const rows = await res.json();
    if(!Array.isArray(rows) || !rows.length) return;
    const mapped = rows
      .filter(r => r.show_on_map !== false && r.lon != null && r.lat != null)
      .map(r => ({
        name:    r.country,
        port:    (r.port || '').split(' / ')[0],
        lon:     Number(r.lon),
        lat:     Number(r.lat),
        transit: r.transit || '',
        models:  r.popular || ''
      }))
      .filter(m => m.name && Number.isFinite(m.lon) && Number.isFinite(m.lat));
    if(!mapped.length) return;
    MARKETS.length = 0; MARKETS.push(...mapped);
    marketListeners.forEach(fn => {try{ fn() }catch{}});
  }catch{/* offline or not provisioned yet — keep the built-in markets */}
}
if(typeof window !== 'undefined') hydrateMarkets();

/* The engine positions ANY [data-lon][data-lat] child of the globe host —
   these helpers render the clickable overlay chips and flags. */
function goto(navigate,where){return e=>{e.preventDefault();if(navigate)navigate(where)}}

function OriginChip({navigate,to,lon,lat,flag,label,cls}){
 return <button type="button" className={'g3-origin '+cls} data-goto={to} data-lon={lon} data-lat={lat}
   onClick={goto(navigate,to)} aria-label={label}>
  <span className="g3-pulse" aria-hidden="true"/><span className="g3-pin" aria-hidden="true"/>
  <span className="g3-chip"><Flag c={flag} w={17} h={11}/>{label}</span>
 </button>}

export function BigNetworkGlobe({navigate,compact}){
 const ref=useRef(null);
 const apiRef=useRef(null); // the engine cleanup carries .flyTo
 const MARKETS=useMarkets();
 const marketKey=MARKETS.map(m=>m.name).join('|');
 useEffect(()=>{
  const el=ref.current; if(!el)return;
  // 2026-11-11 (owner: "do all the globe upgrades"): the big globe gets the
  // full feature set — starfield, drifting clouds, night city lights, country
  // hover tooltips + highlight, pinch/ctrl-wheel zoom, sun-side lighting.
  const api=mountGlobe(el,{
   night:true,borders:true,graticule:true,detail:1,
   stars:true,clouds:true,cities:true,names:true,zoom:true,
   origin:JP,
   routes:MARKETS.map(m=>({lon:m.lon,lat:m.lat}))
  });
  apiRef.current=api;
  return ()=>{apiRef.current=null;api()};
 },[marketKey]); // re-mount when the CRM swaps in live routes
 const fly=(lon,lat)=>()=>apiRef.current?.flyTo?.(lon,lat);
 const { t } = useLang();
 // 2026-11-14 (owner: "country shortcuts outside the globe, below it, as an
 // elegant rotating slide"): the fly-to buttons no longer float on the globe —
 // they live in a seamless marquee strip under it. The chip list is doubled so
 // the CSS animation can loop at -50% without a visible jump; the second copy
 // is aria-hidden and untabbable so screen readers and keyboards see each
 // market exactly once. Hover/focus pauses the ride (CSS).
 const flyChips=[{name:'Japan',lon:JP.lon,lat:JP.lat},...MARKETS.map(m=>({name:m.name,lon:m.lon,lat:m.lat}))];
 const chipLabel=n=>n==='United Kingdom'?'UK':n==='Trinidad & Tobago'?'Trinidad':n;
 return <div className={'wglobe-unit'+(compact?' compact':'')}>
 <div className={'wglobe'+(compact?' compact':'')} ref={ref}>
  <div className="wglobe-glow"/>
  <canvas className="g3-canvas" aria-hidden="true"/>
  <div className="g3-overlay">
   {FLAG_POINTS.filter(f=>!MARKETS.some(m=>m.name===f[0])).map(f=>
    <span key={'fp'+f[0]} className="g3-flag" data-lon={f[1]} data-lat={f[2]} title={f[0]}>
     <Flag c={f[0]} w={18} h={11}/>
    </span>)}
   {MARKETS.map(m=>
    <button type="button" key={m.name} className="g3-mkt" data-goto="destinations" data-lon={m.lon} data-lat={m.lat}
      onClick={goto(navigate,'destinations')} aria-label={m.name+' market guide'}>
     <i className="g3-dot" aria-hidden="true"/>
     <span className="g3-tag"><Flag c={m.name} w={13} h={8}/>{m.name}</span>
    </button>)}
   {/* 2026-11-14: shorter origin labels — the old "AR7 TRADERS · JAPAN"
       plates covered too much of the sphere (owner request). */}
   <OriginChip navigate={navigate} to="inventory" lon={JP.lon} lat={JP.lat} flag="Japan" label="AR7 · JAPAN" cls="jp"/>
   <OriginChip navigate={navigate} to="machinery" lon={CN.lon} lat={CN.lat} flag="China" label="AR7 · CHINA" cls="cn"/>
  </div>
  <span className="drag-hint"><i/> {t('world.dragHint')}</span>
 </div>
 {/* fly-to-market carousel: tap a flag and the camera glides to that country */}
 <div className="g3-fly" role="group" aria-label={t('world.flyTo')}>
  <div className="g3-fly-track">
   {[0,1].map(copy=>
    <div className="g3-fly-set" key={copy} aria-hidden={copy===1||undefined}>
     {flyChips.map(m=>
      <button type="button" key={'fly'+copy+m.name} onClick={fly(m.lon,m.lat)}
        aria-label={'Fly to '+m.name} tabIndex={copy===1?-1:undefined}>
       <Flag c={m.name} w={16} h={10}/><span>{chipLabel(m.name)}</span>
      </button>)}
    </div>)}
  </div>
 </div>
 </div>}

export function WorldPage({navigate}){
 const MARKETS = useMarkets();
 const { t } = useLang();
 return <section className="inner-page world-page">
  <div className="shell world-hero">
   <div className="world-copy">
    <div className="kicker">{t('world.kicker')}</div>
    <h1>{t('world.title')}<br/><em>{t('world.titleEm')}</em></h1>
    <p>{t('world.intro1')}<b>{t('world.introClick')}</b>{t('world.intro2')}</p>
    <div className="world-cta"><a className="primary" href="/inventory" onClick={linkClick('inventory',navigate)}>{t('world.browse')} <ArrowRight/></a><a className="outline-btn" href="/destinations" onClick={linkClick('destinations',navigate)}>{t('world.guides')}</a></div>
    <div className="world-stats">
     {[['27',t('world.guides')],['30+',t('world.statPorts')],['24/7',t('world.statPortal')],['100%',t('world.statCost')]].map(x=><div key={x[0]}><b>{x[0]}</b><span>{x[1]}</span></div>)}
    </div>
   </div>
   <div className="hero-orb world-hero-orb"><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>
   <BigNetworkGlobe navigate={navigate}/>
  </div>
  <div className="shell">
   <div className="section-head"><div><div className="kicker">{t('world.routesKicker')}</div><h2>{t('world.routesTitle')}<br/><em>{t('world.routesTitleEm')}</em></h2></div><p>{t('world.routesIntro')}</p></div>
   <div className="markets-grid">
    {MARKETS.map(m=><a className="mkt-card" key={m.name} href="/destinations" onClick={linkClick('destinations',navigate)}>
     <span className="mkt-flag"><Flag c={m.name} w={36} h={23}/></span>
     <div className="kicker">{m.port}</div>
     <h3>{m.name}</h3>
     <p><Ship/> {m.transit} {t('world.transit')}</p>
     <small>{m.models}</small>
     <span className="mkt-go">{t('world.marketGuide')} <ArrowRight/></span>
    </a>)}
   </div>
  </div>
  <div className="shell net-dash-wrap"><div className="section-head"><div><div className="kicker">NETWORK SNAPSHOT · SAMPLE</div><h2>Port to port,<br/><em>at a glance.</em></h2></div><p>Illustrative demo data for the AR7 network — vessels, lanes and milestones as the portal presents them.</p></div>
   <div className="net-grid">
    <div className="net-stats">{[[Ship,'RoRo','Sea freight'],[CarFront,'Docs','Handled end to end'],[Gavel,'Auction','+ dealer sourcing'],[BadgeCheck,'1','Accountable team']].map(x=>{const I=x[0];return <div key={x[2]}><i><I/></i><b>{x[1]}</b><span>{x[2]}</span></div>})}</div>
    <article className="net-panel">
     <h3>Sample sailing schedule</h3>
     <table><thead><tr><th>Vessel</th><th>Route</th><th>ETA</th><th>Status</th></tr></thead><tbody>
      {[['AR7 VALIANT','Yokohama → Karachi','Aug 29','At sea'],['GOLDEN PIONEER','Kobe → Jebel Ali','Sep 02','Loaded'],['PACIFIC TRADER','Nagoya → Mombasa','Sep 05','Loading'],['EVER GLORY','Tokyo → Southampton','Sep 11','Booking'],['MSC ARIA','Yokohama → Auckland','Sep 14','Booking'],['STELLAR LADY','Osaka → Sydney','Sep 18','Booking']].map(x=><tr key={x[0]}><td><b>{x[0]}</b></td><td>{x[1]}</td><td>{x[2]}</td><td><span className={"st "+x[3].toLowerCase().replace(' ','')}>{x[3]}</span></td></tr>)}
     </tbody></table>
    </article>
    <article className="net-panel">
     <h3>Sample activity feed <i className="live-dot"/></h3>
     <ul>{[['now','Lot 38214 won — Porsche 911 Carrera GTS'],['6m','Vessel departed Yokohama · AR7-260184'],['14m','Inspection photos uploaded — Ferrari 296 GTB'],['31m','Auction sheet translated — Toyota Century'],['1h','Freight booked Karachi · AR7-260191'],['2h','New lot — Lamborghini Huracan · USS Tokyo'],['3h','CIF quote sent — Lexus LX 600 to Jebel Ali'],['5h','Deposit received · UK buyer']].map(x=><li key={x[0]}><b>{x[0]}</b><span>{x[1]}</span></li>)}</ul>
    </article>
   </div>
  </div>
  <section className="cta shell section"><div className="cta-bg"/><div><div className="kicker">YOUR PORT IS ON THIS MAP</div><h2>Let's put your car<br/>on a <em>route.</em></h2><p>Tell us your market — we quote FOB, CIF and landed cost before you commit.</p></div><a className="gold-btn large" href="/contact" onClick={linkClick('contact',navigate)}>Start your import <ArrowRight/></a></section>
 </section>}
