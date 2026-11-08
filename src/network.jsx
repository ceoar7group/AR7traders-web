import React, {useEffect, useRef, useState} from 'react';
import { Ship, ArrowRight, CarFront, Gavel, BadgeCheck } from 'lucide-react';
import { linkClick } from './routing.js';
import { Flag } from './flag.jsx';
// 2026-11-09 (owner request: "more realistic map"): the real world — Natural
// Earth 110m land + country borders, pre-projected to this file's own
// equirectangular space by scripts/build-world-land.mjs. network.jsx is a
// lazy chunk, so the map data never touches the first-load budget.
import { WORLD_LAND_PATH, WORLD_BORDER_PATH } from './world-land.js';
import './network.css';
export { Flag };

/* ============================================================
   AR7 WORLD NETWORK — big realistic globe
   • real SVG country flags (render on every OS — no emoji fonts)
   • landmasses from lon/lat, markers, animated routes + ships
   • happy-customer markers with flag bubbles
   • drag 360° / tap Japan → inventory / tap country → destinations
   • rAF loop pauses when off-screen (performance)
   ============================================================ */

const X = lon => (lon + 180) / 360 * 1000;
const Y = lat => 125 + (90 - lat) / 180 * 750;
const XY = (lon, lat) => [X(lon).toFixed(1), Y(lat).toFixed(1)];

const MARKETS = [
 {name:'Pakistan', port:'Karachi', lon:67, lat:24.9, transit:'18–24 days', models:'Land Cruiser · Vezel · Mira'},
 {name:'UAE', port:'Jebel Ali', lon:55.2, lat:25.0, transit:'18–22 days', models:'Lexus · Patrol · Alphard'},
 {name:'Kenya', port:'Mombasa', lon:39.7, lat:-4.0, transit:'24–30 days', models:'Harrier · Prado · Note'},
 {name:'Tanzania', port:'Dar es Salaam', lon:39.3, lat:-6.8, transit:'25–32 days', models:'RAV4 · Hiace · Vitz'},
 {name:'United Kingdom', port:'Southampton', lon:-1.4, lat:50.9, transit:'35–42 days', models:'Vellfire · Skyline · Jimny'},
 {name:'New Zealand', port:'Auckland', lon:174.8, lat:-36.8, transit:'20–26 days', models:'Prius · CX-5 · Forester'},
 {name:'Australia', port:'Sydney', lon:151.2, lat:-33.9, transit:'21–28 days', models:'Land Cruiser · Hiace'},
 {name:'USA', port:'Los Angeles', lon:-118.2, lat:34.0, transit:'28–36 days', models:'Kei trucks · 4Runner'}
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

/* ---------- landmasses ---------- */
const LANDS = [
 [[-168,68],[-145,71],[-125,72],[-105,70],[-85,66],[-65,62],[-52,55],[-58,48],[-70,44],[-80,40],[-90,38],[-97,34],[-106,28],[-116,26],[-110,22],[-100,19],[-92,16],[-86,11],[-80,8],[-78,12],[-84,18],[-92,24],[-100,26],[-108,30],[-118,33],[-126,38],[-135,46],[-148,54],[-160,62]],
 [[-52,82],[-38,84],[-28,80],[-24,72],[-30,64],[-42,62],[-50,68],[-54,76]],
 [[-78,8],[-70,12],[-60,10],[-52,4],[-44,-2],[-36,-8],[-34,-15],[-38,-23],[-44,-32],[-52,-40],[-58,-48],[-64,-55],[-68,-54],[-70,-46],[-72,-36],[-74,-25],[-76,-14],[-78,-2]],
 [[-8,32],[2,35],[12,37],[22,36],[30,32],[38,28],[45,20],[50,12],[51,4],[48,-4],[43,-12],[38,-20],[32,-28],[25,-34],[20,-34],[16,-27],[12,-18],[9,-8],[6,2],[2,10],[-5,16],[-12,22],[-16,28]],
 [[-9,40],[-9,42],[0,46],[8,48],[14,50],[20,52],[24,52],[30,56],[36,60],[45,66],[60,70],[80,72],[100,74],[120,72],[140,70],[160,66],[175,64],[178,58],[170,52],[158,48],[146,44],[136,40],[128,36],[122,30],[116,22],[110,12],[104,4],[98,-2],[92,-6],[84,-4],[78,0],[72,6],[68,12],[66,18],[70,24],[74,30],[72,34],[66,32],[60,28],[54,24],[48,20],[42,18],[36,20],[30,24],[24,28],[18,30],[10,32],[0,36],[-9,40]],
 [[-4,54],[-1,55],[1,53],[-1,51],[-4,52]],
 [[43,-16],[47,-14],[50,-18],[48,-24],[44,-22]],
 [[139,42],[141,40],[142,37],[141,34],[139,32],[137,33],[138,36],[140,38]],
 [[143,44],[145,43],[145,45],[143,46]],
 [[95,2],[102,0],[108,-2],[114,-4],[120,-5],[126,-3],[120,-2],[112,-1],[104,-1],[98,1]],
 [[120,14],[124,12],[126,16],[123,20],[120,18]],
 [[114,-22],[122,-18],[132,-14],[142,-12],[150,-20],[153,-28],[150,-36],[142,-38],[132,-36],[122,-32],[115,-28]],
 [[173,-35],[176,-37],[178,-41],[175,-45],[172,-41]]
];
const LAND_PATH = LANDS.map(p => 'M' + p.map(([lo,la]) => XY(lo, la).join(' ')).join(' L ') + ' Z').join(' ');
void LAND_PATH; // superseded by WORLD_LAND_PATH; kept as an offline-readable reference of the coordinate system

/* ---------------------------------------------------------------------------
   2026-11-09: live day & night. The terminator is computed from the real
   current time — solar declination from the day of the year, subsolar
   longitude from UTC — and drawn as a translucent night polygon that tiles
   with the map strip. Refreshed every 10 minutes while mounted, so the globe
   always shows where on the network it is night RIGHT NOW.
--------------------------------------------------------------------------- */
const RAD = Math.PI / 180;
function nightPathNow(){
  const now = new Date();
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const doy = (now.getTime() - start) / 86400000;
  const decl = -23.44 * Math.cos(RAD * 360 / 365 * (doy + 10)); // solar declination, deg
  const utcH = now.getUTCHours() + now.getUTCMinutes() / 60;
  const sunLon = 180 - utcH * 15; // subsolar longitude, deg
  const tanD = Math.tan(decl * RAD);
  if (Math.abs(tanD) < 1e-4) return ''; // equinox minute — skip rather than divide by ~0
  const pts = [];
  for (let x = 0; x <= 1000; x += 20){
    const lon = x / 1000 * 360 - 180;
    const H = (lon - sunLon) * RAD;
    const phi = Math.atan(-Math.cos(H) / tanD) / RAD; // terminator latitude
    pts.push(x.toFixed(0) + ' ' + Y(phi).toFixed(1));
  }
  const poleY = decl > 0 ? Y(-90).toFixed(1) : Y(90).toFixed(1); // dark pole edge
  return 'M' + pts.join('L') + 'L1000 ' + poleY + 'L0 ' + poleY + 'Z';
}
function useNightPath(){
  const [d, setD] = useState(nightPathNow);
  useEffect(() => {
    const id = setInterval(() => setD(nightPathNow()), 10 * 60 * 1000);
    return () => clearInterval(id);
  }, []);
  return d;
}

const JPX = X(JP.lon), JPY = Y(JP.lat);
const arcFor = m => {
  const x = X(m.lon), y = Y(m.lat);
  const cx = ((JPX + x) / 2).toFixed(1);
  const cy = (Math.min(JPY, y) - 175).toFixed(1);
  return `M${JPX.toFixed(1)} ${JPY.toFixed(1)} Q${cx} ${cy} ${x.toFixed(1)} ${y.toFixed(1)}`;
};

function Seed({navigate}){
 const MARKETS = useMarkets();
 const night = useNightPath();
 return <g className="wseg">
  <g className="wgrid">{Array.from({length:16},(_,i)=><line key={'v'+i} x1={i*62.5} y1="0" x2={i*62.5} y2="1000"/>)}</g>
  <g className="wgrid">{Array.from({length:8},(_,i)=><line key={'h'+i} x1="0" y1={125+i*93.75} x2="1000" y2={125+i*93.75}/>)}</g>
  <path className="wland" d={WORLD_LAND_PATH}/>
  <path className="wborder" d={WORLD_BORDER_PATH}/>
  {night && <path className="wnight" d={night}/>}
  {FLAG_POINTS.filter(f=>!MARKETS.some(m=>m.name===f[0])).map(f=>{const [x,y]=XY(f[1],f[2]);
   return <g key={'fp'+f[0]} className="wflagpt" transform={`translate(${x},${y})`}>
    <title>{f[0]}</title>
    <rect className="wflag-frame" x="-11" y="-7.5" width="22" height="15" rx="3"/>
    <Flag c={f[0]} w={18} h={11} x={-9} y={-5.5}/>
   </g>})}

  {MARKETS.map((m,i)=>{const d=arcFor(m);
   return <g key={'r'+m.name}>
    <path className="warc" d={d} style={{animationDelay:(i*0.27)+'s'}}/>
    <g className="wship"><animateMotion dur={(15+i*2.1)+'s'} begin={(-i*3.4)+'s'} repeatCount="indefinite" path={d} rotate="auto"/><g transform="scale(1.55)"><path className="whull" d="M-8 0 L-3.4 -3 L3.4 -3 L8 0 L3.4 3.4 L-3.4 3.4 Z"/><rect className="wdeck" x="-2.6" y="-6.2" width="5.2" height="3.4"/><rect className="wdeck" x="-1" y="-2.2" width="1.8" height="1.4"/></g></g>
   </g>})}
  {MARKETS.map(m=>{const [x,y]=XY(m.lon,m.lat);const w=Math.max(70,m.name.length*6.8+34);
   return <g key={m.name} className="wmkt" data-goto="destinations" transform={`translate(${x},${y})`}>
    <circle className="wmkt-hit" r="38" fill="transparent"/><circle className="wmkt-ring" r="15"/><circle className="wmkt-dot" r="6.5"/>
    <g transform={`translate(11,-13.5)`}><rect className="wmkt-chip" rx="9" width={w} height="26"/><Flag c={m.name} w={12} h={8} x={7} y={9}/><text className="wmkt-txt" x="25" y="17.5">{m.name}</text></g>
   </g>})}
  {MARKETS.map((m,i)=>{const [hx,hy]=XY(m.lon,m.lat);
   return <g key={'h'+m.name} transform={`translate(${Math.max(58,Math.min(942,hx))},${Math.max(168,Math.min(882,hy))})`}>
    <g className="whappy" style={{animationDelay:(i*0.45)+'s'}}>
     <circle className="wh-ring" r="17"/><circle className="wh-face" r="13"/><text className="wh-emoji" textAnchor="middle" dy="4.5">😊</text>
     <g className="wh-bub" transform="translate(-8,-42)"><rect className="wh-bub-bg" rx="9" width={64+m.name.length*6.2+16} height="21"/><Flag c={m.name} w={12} h={8} x={8} y={6.5}/><text className="wh-bub-txt" x="26" y="14.5">{m.name}</text></g>
     <text className="wh-stars" textAnchor="middle" y="30">★★★★★</text>
    </g>
   </g>})}
  {MARKETS.slice(0,3).map((m,i)=>{const d=arcFor(m);return <g key={'pl'+m.name} className="wplane"><animateMotion dur={(14+i*2.5)+'s'} begin={(-i*5)+'s'} repeatCount="indefinite" path={d} rotate="auto"/><g transform="scale(1.35)"><path className="wp-con" d="M-32 0 h20"/><path className="wp-jet" d="M-8 0 L6 -5 L6 -2.2 L16 -2.8 L16 2.8 L6 2.2 L6 5 Z"/></g></g>})}
  {MARKETS.slice(2,6).map((m,i)=>{const d=arcFor(m);return <g key={'cc'+m.name} className="wcar"><animateMotion dur={(11+i*2.4)+'s'} begin={(-i*2.3)+'s'} repeatCount="indefinite" path={d} rotate="auto"/><g transform="scale(1.5)"><rect x="-6" y="-3" width="12" height="6" rx="2" fill="#e5b553"/><rect x="-2.9" y="-2.3" width="5.2" height="2.3" rx="1" fill="#0d2c1e"/><circle cx="-3.4" cy="3.4" r="1.3" fill="#101d14"/><circle cx="3.4" cy="3.4" r="1.3" fill="#101d14"/></g></g>})}
  <g className="wjp" data-goto="inventory" transform={`translate(${JPX},${JPY})`}>
   <circle className="wjp-hit" r="44" fill="transparent"/><circle className="wjp-p1" r="10"/><circle className="wjp-p2" r="10"/><circle className="wjp-dot" r="8.5"/>
   <g transform="translate(-104,-62)"><rect className="wjp-chip" rx="13" width="208" height="44"/><Flag c="Japan" w={17} h={11} x={13} y={16.5}/><text className="wjp-txt" x="116" y="28">AR7 TRADERS · JAPAN</text></g>
   <path className="wjp-pointer" d="M-7 -16 l-6 12 h12 z"/>
  </g>
  {/* 2026-11-09: China is an AR7 origin too (LHD cars + machinery) — it gets
      its own labelled chip, tapping through to the machinery desk. */}
  <g className="wjp wcn" data-goto="machinery" transform={`translate(${X(CN.lon).toFixed(1)},${Y(CN.lat).toFixed(1)})`}>
   <circle className="wjp-hit" r="40" fill="transparent"/><circle className="wjp-p1" r="9"/><circle className="wjp-p2" r="9"/><circle className="wjp-dot" r="7.5"/>
   <g transform="translate(-98,-58)"><rect className="wjp-chip" rx="12" width="196" height="40"/><Flag c="China" w={16} h={10} x={12} y={15}/><text className="wjp-txt" x="106" y="25.5">AR7 · CHINA DESK</text></g>
  </g>
 </g>}

export function BigNetworkGlobe({navigate,compact}){
 const ref=useRef(null);
 useEffect(()=>{
  const el=ref.current; if(!el)return;
  // 2026-11-09 (owner): the globe now pans vertically as well — st.lat slides
  // the oversized map strip up/down (clamped to its 15% overhang each side)
  // while st.rot keeps the endless 360 spin, so a drag in ANY direction moves
  // the world the way a real globe would.
  const st={rot:0,vel:0,lat:0,vlat:0,drag:false,lx:0,ly:0,moved:false,sx:0,sy:0,upx:null,upy:null};
  let raf=0,prev=performance.now(),visible=false,destroyed=false;
  const motionQuery=typeof window!=='undefined'&&window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reduced=!!motionQuery?.matches;
  const schedule=()=>{
   if(!raf&&!destroyed&&visible&&!document.hidden&&(!reduced||st.drag))raf=requestAnimationFrame(loop);
  };
  const apply=()=>{
   const w=el.offsetWidth||1;
   while(st.rot<=-w)st.rot+=w;while(st.rot>0)st.rot-=w;
   const maxLat=(el.offsetHeight||1)*0.15; // the svg strip is 130% tall
   st.lat=Math.max(-maxLat,Math.min(maxLat,st.lat));
   el.style.setProperty('--rot',st.rot.toFixed(2)+'px');
   el.style.setProperty('--lat',st.lat.toFixed(2)+'px');
  };
  const loop=t=>{
   raf=0;
   if(destroyed||!visible||document.hidden)return;
   const dt=Math.min(t-prev,40);prev=t;
   if(!st.drag&&!reduced){st.rot+=0.13*dt/16;st.rot+=st.vel*dt/16;st.vel*=Math.pow(0.92,dt/16);st.lat+=st.vlat*dt/16;st.vlat*=Math.pow(0.9,dt/16);}
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
  const onVisibility=()=>{
   if(document.hidden&&raf){cancelAnimationFrame(raf);raf=0;}
   else{prev=performance.now();schedule();}
  };
  const onMotion=e=>{reduced=!!e.matches;if(!reduced)schedule();};
  document.addEventListener('visibilitychange',onVisibility);
  if(motionQuery?.addEventListener)motionQuery.addEventListener('change',onMotion);
  else motionQuery?.addListener?.(onMotion);
  const dn=e=>{st.drag=true;st.moved=false;st.sx=e.clientX;st.sy=e.clientY;st.lx=e.clientX;st.ly=e.clientY;st.upx=e.clientX;st.upy=e.clientY;el.classList.add('dragging');schedule();if(el.setPointerCapture)try{el.setPointerCapture(e.pointerId)}catch(_){} };
  const mv=e=>{if(!st.drag)return;const dx=e.clientX-st.lx,dy=e.clientY-st.ly;st.lx=e.clientX;st.ly=e.clientY;st.upx=e.clientX;st.upy=e.clientY;st.rot+=dx;st.vel=dx*0.82;st.lat+=dy*0.62;st.vlat=dy*0.5;if(Math.abs(e.clientX-st.sx)+Math.abs(e.clientY-st.sy)>7)st.moved=true;apply();schedule();};
  const up=()=>{if(!st.drag)return;st.drag=false;el.classList.remove('dragging');if(!st.moved&&st.upx!=null){const target=document.elementFromPoint(st.upx,st.upy);const g=target&&target.closest?target.closest('[data-goto]'):null;if(g&&navigate)navigate(g.getAttribute('data-goto'));}st.upx=st.upy=null;schedule();};
  el.addEventListener('pointerdown',dn);
  window.addEventListener('pointermove',mv,{passive:true});
  window.addEventListener('pointerup',up);
  window.addEventListener('pointercancel',up);
  return()=>{destroyed=true;if(raf)cancelAnimationFrame(raf);io?.disconnect();document.removeEventListener('visibilitychange',onVisibility);if(motionQuery?.removeEventListener)motionQuery.removeEventListener('change',onMotion);else motionQuery?.removeListener?.(onMotion);el.removeEventListener('pointerdown',dn);window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up)}
 },[navigate]);
 return <div className={'wglobe'+(compact?' compact':'')} ref={ref}>
  <div className="wglobe-glow"/>
  <div className="wsphere">
   <i className="wshade"/>
   <svg viewBox="0 0 3000 1000" preserveAspectRatio="none" aria-hidden="true">
    <defs>
     <linearGradient id="wlg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stopColor="#f0c060"/><stop offset=".55" stopColor="#dca23a"/><stop offset="1" stopColor="#b9821f"/>
     </linearGradient>
    </defs>
    {[0,1,2].map(i=><g key={i} transform={`translate(${i*1000},0)`}><Seed navigate={navigate}/></g>)}
   </svg>
   <i className="wshine"/>
  </div>
  <span className="drag-hint"><i/> DRAG ANY DIRECTION · LIVE DAY &amp; NIGHT · TAP JAPAN OR CHINA</span>
 </div>}

export function WorldPage({navigate}){
 const MARKETS = useMarkets();
 return <section className="inner-page world-page">
  <div className="shell world-hero">
   <div className="world-copy">
    <div className="kicker">AR7 GLOBAL EXPORT NETWORK</div>
    <h1>Where AR7<br/><em>ships.</em></h1>
    <p>Spin the globe. Every gold route is a sample AR7 lane from Japan to the world's ports — <b>click Japan</b> to browse the inventory, or press any country to open its market guide.</p>
    <div className="world-cta"><a className="primary" href="/inventory" onClick={linkClick('inventory',navigate)}>Browse inventory <ArrowRight/></a><a className="outline-btn" href="/destinations" onClick={linkClick('destinations',navigate)}>Market guides</a></div>
    <div className="world-stats">
     {[['27','Market guides'],['30+','Ports of discharge'],['24/7','Portal access'],['100%','Cost transparency']].map(x=><div key={x[0]}><b>{x[0]}</b><span>{x[1]}</span></div>)}
    </div>
   </div>
   <div className="hero-orb world-hero-orb"><svg aria-hidden="true" width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>
   <BigNetworkGlobe navigate={navigate}/>
  </div>
  <div className="shell">
   <div className="section-head"><div><div className="kicker">FEATURED ROUTES</div><h2>From Japan to<br/><em>your port.</em></h2></div><p>Eight featured lanes with estimated transit — 27 market guides in total. Click any card to open that market's guide.</p></div>
   <div className="markets-grid">
    {MARKETS.map(m=><a className="mkt-card" key={m.name} href="/destinations" onClick={linkClick('destinations',navigate)}>
     <span className="mkt-flag"><Flag c={m.name} w={36} h={23}/></span>
     <div className="kicker">{m.port}</div>
     <h3>{m.name}</h3>
     <p><Ship/> {m.transit} transit</p>
     <small>{m.models}</small>
     <span className="mkt-go">Market guide <ArrowRight/></span>
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
