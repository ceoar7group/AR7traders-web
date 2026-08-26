import React, {useEffect, useRef, useState} from 'react';
import { Ship, ArrowRight, CarFront, Gavel, BadgeCheck } from 'lucide-react';

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

/* ---------- vector flag definitions ---------- */
const FLAGF = {
 'Pakistan': (w,h)=>[['r',0,0,w,h,'#fff'],['r',w*0.26,0,w*0.74,h,'#01411C'],['c',w*0.63,h*0.5,h*0.26,'#fff'],['c',w*0.6,h*0.5,h*0.2,'#01411C']],
 'UAE': (w,h)=>[['r',0,0,w,h,'#fff'],['r',0,0,w*0.27,h,'#C8102E'],['r',w*0.27,0,w*0.73,h/3,'#00732F'],['r',w*0.27,2*h/3,w*0.73,h/3,'#000']],
 'Kenya': (w,h)=>[['r',0,0,w,h,'#fff'],['r',0,0,w,h*0.2,'#000'],['r',0,h*0.2,w,h*0.07,'#fff'],['r',0,h*0.27,w,h*0.46,'#BE1E2D'],['r',0,h*0.73,w,h*0.07,'#fff'],['r',0,h*0.8,w,h*0.2,'#006600']],
 'Tanzania': (w,h)=>[['r',0,0,w,h,'#1EB53A'],['p',`0,${h} ${w},${h} 0,0`,'#00A3DD'],['r',-w*0.4,h*0.34,w*1.8,h*0.16,'#FCD116',31],['r',-w*0.4,h*0.5,w*1.8,h*0.16,'#000',31]],
 'United Kingdom': (w,h)=>[['r',0,0,w,h,'#012169'],['r',0,h*0.38,w,h*0.24,'#fff'],['r',w*0.38,0,w*0.24,h,'#fff'],['r',0,h*0.43,w,h*0.14,'#C8102E'],['r',w*0.43,0,w*0.14,h,'#C8102E']],
 'New Zealand': (w,h)=>[['r',0,0,w,h,'#012169'],['r',0,h*0.4,w,h*0.2,'#fff'],['r',w*0.4,0,w*0.2,h,'#fff'],['r',0,h*0.45,w,h*0.1,'#C8102E'],['r',w*0.45,0,w*0.1,h,'#C8102E'],['c',w*0.8,h*0.25,h*0.12,'#fff'],['c',w*0.58,h*0.55,h*0.09,'#fff'],['c',w*0.9,h*0.62,h*0.08,'#fff']],
 'Australia': (w,h)=>[['r',0,0,w,h,'#00247D'],['c',w*0.3,h*0.35,h*0.13,'#fff'],['c',w*0.5,h*0.6,h*0.11,'#fff'],['c',w*0.82,h*0.3,h*0.08,'#fff'],['c',w*0.9,h*0.55,h*0.08,'#fff'],['c',w*0.72,h*0.78,h*0.07,'#fff']],
 'USA': (w,h)=>{const s=[['r',0,0,w,h,'#fff']];for(let i=0;i<7;i++)s.push(['r',0,i*h/7,w,h/14,'#B22234']);s.push(['r',0,0,w*0.44,h*0.55,'#3C3B6E'],['c',w*0.1,h*0.15,h*0.05,'#fff'],['c',w*0.25,h*0.3,h*0.05,'#fff'],['c',w*0.1,h*0.45,h*0.05,'#fff'],['c',w*0.3,h*0.1,h*0.04,'#fff']);return s},
 'European Union': (w,h)=>{const s=[['r',0,0,w,h,'#003399']];for(let i=0;i<12;i++){const a=i*Math.PI/6;s.push(['c',w/2+Math.cos(a)*h*.27,h/2+Math.sin(a)*h*.27,h*.035,'#FFCC00'])}return s},
 'Canada': (w,h)=>[['r',0,0,w,h,'#fff'],['r',0,0,w*.24,h,'#D80621'],['r',w*.76,0,w*.24,h,'#D80621'],['p',`${w*.5},${h*.18} ${w*.57},${h*.43} ${w*.68},${h*.4} ${w*.59},${h*.56} ${w*.62},${h*.78} ${w*.5},${h*.66} ${w*.38},${h*.78} ${w*.41},${h*.56} ${w*.32},${h*.4} ${w*.43},${h*.43}`,'#D80621']],
 'Saudi Arabia': (w,h)=>[['r',0,0,w,h,'#006C35'],['r',w*.26,h*.68,w*.5,h*.07,'#fff'],['r',w*.7,h*.61,w*.04,h*.16,'#fff']],
 'Japan': (w,h)=>[['r',0,0,w,h,'#fff'],['c',w/2,h/2,h*0.31,'#BC002D']]
};

export function Flag({c,w=16,h=10,x=0,y=0}){
 const d=FLAGF[c];
 // A country added in the CRM may not have a hand-drawn vector flag yet.
 // Render a neutral plate with its initials rather than disappearing.
 if(!d) return <svg className="wflag" x={x} y={y} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
   <rect width={w} height={h} rx={Math.min(2,h*0.16)} fill="#123f2b" stroke="rgba(255,255,255,.55)" strokeWidth="1"/>
   <text x={w/2} y={h/2} textAnchor="middle" dominantBaseline="central"
         fill="#e5b553" style={{font:`700 ${Math.round(h*0.62)}px Manrope,sans-serif`}}>
     {(c||'?').trim().slice(0,2).toUpperCase()}
   </text>
 </svg>;
 return <svg className="wflag" x={x} y={y} width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
  <rect width={w} height={h} rx={Math.min(2,h*0.16)} fill="none" stroke="rgba(255,255,255,.55)" strokeWidth="1"/>
  {d(w,h).map((s,i)=>{if(s[0]==='r'){const rot=s[7]?`rotate(${s[7]} ${s[1]+s[3]/2} ${s[2]+s[4]/2})`:undefined;return <rect key={i} x={s[1]} y={s[2]} width={s[3]} height={s[4]} fill={s[5]} rx={s[6]||0} transform={rot}/>}
   if(s[0]==='c')return <circle key={i} cx={s[1]} cy={s[2]} r={s[3]} fill={s[4]}/>;
   return <polygon key={i} points={s[1]} fill={s[2]}/>})}
 </svg>}

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

const JPX = X(JP.lon), JPY = Y(JP.lat);
const arcFor = m => {
  const x = X(m.lon), y = Y(m.lat);
  const cx = ((JPX + x) / 2).toFixed(1);
  const cy = (Math.min(JPY, y) - 175).toFixed(1);
  return `M${JPX.toFixed(1)} ${JPY.toFixed(1)} Q${cx} ${cy} ${x.toFixed(1)} ${y.toFixed(1)}`;
};

function Seed({navigate}){
 const MARKETS = useMarkets();
 return <g className="wseg">
  <g className="wgrid">{Array.from({length:16},(_,i)=><line key={'v'+i} x1={i*62.5} y1="0" x2={i*62.5} y2="1000"/>)}</g>
  <g className="wgrid">{Array.from({length:8},(_,i)=><line key={'h'+i} x1="0" y1={125+i*93.75} x2="1000" y2={125+i*93.75}/>)}</g>
  <path className="wland" d={LAND_PATH}/>

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
 </g>}

export function BigNetworkGlobe({navigate,compact}){
 const ref=useRef(null);
 useEffect(()=>{
  const el=ref.current; if(!el)return;
  const st={rot:0,vel:0,drag:false,lx:0,ly:0,moved:false,sx:0,sy:0};
  let raf=0,prev=performance.now(),visible=true;
  const io=new IntersectionObserver(en=>{visible=en[0].isIntersecting},{threshold:0});
  io.observe(el);
  const loop=t=>{
   const dt=Math.min(t-prev,40);prev=t;
   if(visible&&!document.hidden){
    if(!st.drag){st.rot+=0.13*dt/16;st.rot+=st.vel*dt/16;st.vel*=Math.pow(0.92,dt/16);}
    const w=el.offsetWidth||1;
    while(st.rot<=-w)st.rot+=w;while(st.rot>0)st.rot-=w;
    el.style.setProperty('--rot',st.rot.toFixed(2)+'px');
   }
   raf=requestAnimationFrame(loop);
  };
  raf=requestAnimationFrame(loop);
  const dn=e=>{st.drag=true;st.moved=false;st.sx=e.clientX;st.sy=e.clientY;st.lx=e.clientX;st.ly=e.clientY;st.upx=e.clientX;st.upy=e.clientY;el.classList.add('dragging');if(el.setPointerCapture)try{el.setPointerCapture(e.pointerId)}catch(_){}}
  const mv=e=>{if(!st.drag)return;const dx=e.clientX-st.lx,dy=e.clientY-st.ly;st.lx=e.clientX;st.ly=e.clientY;st.upx=e.clientX;st.upy=e.clientY;st.rot+=dx;st.vel=dx*0.8;if(Math.abs(e.clientX-st.sx)+Math.abs(e.clientY-st.sy)>7)st.moved=true;}
  const up=()=>{st.drag=false;el.classList.remove('dragging');if(!st.moved&&st.upx!=null){const t=document.elementFromPoint(st.upx,st.upy);const g=t&&t.closest?t.closest('[data-goto]'):null;if(g&&navigate)navigate(g.getAttribute('data-goto'));}st.upx=st.upy=null}
  el.addEventListener('pointerdown',dn);
  window.addEventListener('pointermove',mv);
  window.addEventListener('pointerup',up);
  window.addEventListener('pointercancel',up);
  return()=>{cancelAnimationFrame(raf);io.disconnect();el.removeEventListener('pointerdown',dn);window.removeEventListener('pointermove',mv);window.removeEventListener('pointerup',up);window.removeEventListener('pointercancel',up)}
 },[navigate]);
 return <div className={'wglobe'+(compact?' compact':'')} ref={ref}>
  <div className="wglobe-glow"/>
  <div className="wsphere">
   <i className="wshade"/>
   <svg viewBox="0 0 3000 1000" preserveAspectRatio="none" aria-hidden="false">
    {[0,1,2].map(i=><g key={i} transform={`translate(${i*1000},0)`}><Seed navigate={navigate}/></g>)}
   </svg>
   <i className="wshine"/>
  </div>
  <span className="drag-hint"><i/> DRAG TO ROTATE · CLICK JAPAN FOR INVENTORY</span>
 </div>}

export function WorldPage({navigate}){
 const MARKETS = useMarkets();
 return <section className="inner-page world-page">
  <div className="shell world-hero">
   <div className="world-copy">
    <div className="kicker">AR7 GLOBAL EXPORT NETWORK</div>
    <h1>Where AR7<br/><em>ships.</em></h1>
    <p>Spin the globe. Every gold route is a live AR7 demo lane from Japan to the world's ports — <b>click Japan</b> to browse the inventory, or press any country to open its market guide.</p>
    <div className="world-cta"><button className="primary" onClick={()=>navigate('inventory')}>Browse inventory <ArrowRight/></button><button className="outline-btn" onClick={()=>navigate('destinations')}>Market guides</button></div>
    <div className="world-stats">
     {[['08','Live demo routes'],['35+','Markets served'],['24/7','Shipment tracking'],['100%','Auction-sourced']].map(x=><div key={x[0]}><b>{x[0]}</b><span>{x[1]}</span></div>)}
    </div>
   </div>
   <div className="hero-orb world-hero-orb"><svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg></div>
   <BigNetworkGlobe navigate={navigate}/>
  </div>
  <div className="shell">
   <div className="section-head"><div><div className="kicker">DEMO ROUTES</div><h2>From Japan to<br/><em>your port.</em></h2></div><p>Eight live demo lanes with estimated transit. Click any card to open that market's guide.</p></div>
   <div className="markets-grid">
    {MARKETS.map(m=><article key={m.name} onClick={()=>navigate('destinations')}>
     <span className="mkt-flag"><Flag c={m.name} w={36} h={23}/></span>
     <div className="kicker">{m.port}</div>
     <h3>{m.name}</h3>
     <p><Ship/> {m.transit} transit</p>
     <small>{m.models}</small>
     <button onClick={e=>{e.stopPropagation();navigate('destinations')}}>Market guide <ArrowRight/></button>
    </article>)}
   </div>
  </div>
  <div className="shell net-dash-wrap"><div className="section-head"><div><div className="kicker">LIVE NETWORK DATA</div><h2>Port to port,<br/><em>in real time.</em></h2></div><p>Demo operational data for the AR7 network — vessels, lanes and what our team handled this week.</p></div>
   <div className="net-grid">
    <div className="net-stats">{[[Ship,'14','Vessels at sea'],[CarFront,'96','Cars in transit'],[Gavel,'06','Weekly departures'],[BadgeCheck,'35+','Active ports']].map(x=>{const I=x[0];return <div key={x[2]}><i><I/></i><b>{x[1]}</b><span>{x[2]}</span></div>})}</div>
    <article className="net-panel">
     <h3>Demo sailing schedule</h3>
     <table><thead><tr><th>Vessel</th><th>Route</th><th>ETA</th><th>Status</th></tr></thead><tbody>
      {[['AR7 VALIANT','Yokohama → Karachi','Aug 29','At sea'],['GOLDEN PIONEER','Kobe → Jebel Ali','Sep 02','Loaded'],['PACIFIC TRADER','Nagoya → Mombasa','Sep 05','Loading'],['EVER GLORY','Tokyo → Southampton','Sep 11','Booking'],['MSC ARIA','Yokohama → Auckland','Sep 14','Booking'],['STELLAR LADY','Osaka → Sydney','Sep 18','Booking']].map(x=><tr key={x[0]}><td><b>{x[0]}</b></td><td>{x[1]}</td><td>{x[2]}</td><td><span className={"st "+x[3].toLowerCase().replace(' ','')}>{x[3]}</span></td></tr>)}
     </tbody></table>
    </article>
    <article className="net-panel">
     <h3>Live network feed <i className="live-dot"/></h3>
     <ul>{[['now','Lot 38214 won — Porsche 911 Turbo S'],['6m','Vessel departed Yokohama · AR7-260184'],['14m','Inspection photos uploaded — Bugatti Chiron'],['31m','Auction sheet translated — Rolls-Royce Ghost'],['1h','Freight booked Karachi · AR7-260191'],['2h','New lot — Ferrari F8 Tributo · USS Tokyo'],['3h','CIF quote sent — Cullinan to Jebel Ali'],['5h','Deposit received · UK buyer']].map(x=><li key={x[0]}><b>{x[0]}</b><span>{x[1]}</span></li>)}</ul>
    </article>
   </div>
  </div>
  <section className="cta shell section"><div className="cta-bg"/><div><div className="kicker">YOUR PORT IS ON THIS MAP</div><h2>Let's put your car<br/>on a <em>route.</em></h2><p>Tell us your market — we quote FOB, CIF and landed cost within 24 hours.</p></div><button className="gold-btn large" onClick={()=>navigate('contact')}>Start your import <ArrowRight/></button></section>
 </section>}
