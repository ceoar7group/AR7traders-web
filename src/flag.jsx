// Hand-drawn vector country flags.
//
// Extracted from network.jsx so the globe (network.jsx) can be loaded on demand
// while the flags stay in the always-loaded bundle: the header world-time
// ribbon, the CRM currency picker and the destinations pages all render flags
// on first paint, and none of them need the globe.
//
// A country added in the CRM may not have a hand-drawn flag yet — Flag renders
// a neutral plate with its initials rather than disappearing.
import React from 'react';

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
 'Japan': (w,h)=>[['r',0,0,w,h,'#fff'],['c',w/2,h/2,h*0.31,'#BC002D']],
 // 2026-11-08 market expansion — flags for the 19 new destination guides.
 // Same approximated vector style as above: recognisable at 16×10, not
 // heraldically exact.
 'Uganda': (w,h)=>[['r',0,0,w,h/6,'#000'],['r',0,h/6,w,h/6,'#FCDC04'],['r',0,2*h/6,w,h/6,'#D90000'],['r',0,3*h/6,w,h/6,'#000'],['r',0,4*h/6,w,h/6,'#FCDC04'],['r',0,5*h/6,w,h/6,'#D90000'],['c',w/2,h/2,h*0.18,'#fff']],
 'Zambia': (w,h)=>[['r',0,0,w,h,'#198A00'],['r',w*0.70,h*0.45,w*0.10,h*0.55,'#DE2010'],['r',w*0.80,h*0.45,w*0.10,h*0.55,'#000'],['r',w*0.90,h*0.45,w*0.10,h*0.55,'#EF7D00']],
 'Zimbabwe': (w,h)=>[['r',0,0,w,h/7,'#319208'],['r',0,h/7,w,h/7,'#FFD200'],['r',0,2*h/7,w,h/7,'#DE2010'],['r',0,3*h/7,w,h/7,'#000'],['r',0,4*h/7,w,h/7,'#DE2010'],['r',0,5*h/7,w,h/7,'#FFD200'],['r',0,6*h/7,w,h/7,'#319208'],['p',`0,0 ${w*0.38},${h/2} 0,${h}`,'#fff']],
 'Mozambique': (w,h)=>[['r',0,0,w,h*0.3,'#009A3A'],['r',0,h*0.3,w,h*0.06,'#fff'],['r',0,h*0.36,w,h*0.28,'#000'],['r',0,h*0.64,w,h*0.06,'#fff'],['r',0,h*0.7,w,h*0.3,'#FCE100'],['p',`0,0 ${w*0.42},${h/2} 0,${h}`,'#D21034'],['c',w*0.12,h/2,h*0.12,'#FCE100']],
 'DR Congo': (w,h)=>[['r',0,0,w,h,'#007FFF'],['r',-w*0.25,h*0.34,w*1.5,h*0.32,'#F7D618',0,31],['r',-w*0.25,h*0.4,w*1.5,h*0.2,'#CE1021',0,31],['c',w*0.14,h*0.2,h*0.11,'#F7D618']],
 'Botswana': (w,h)=>[['r',0,0,w,h,'#75AADB'],['r',0,h*0.36,w,h*0.28,'#fff'],['r',0,h*0.42,w,h*0.16,'#000']],
 'Jamaica': (w,h)=>[['r',0,0,w,h,'#009B3A'],['p',`0,0 ${w*0.42},${h/2} 0,${h}`,'#000'],['p',`${w},0 ${w*0.58},${h/2} ${w},${h}`,'#000'],['r',-w*0.25,h*0.42,w*1.5,h*0.16,'#FED100',0,31],['r',-w*0.25,h*0.42,w*1.5,h*0.16,'#FED100',0,-31]],
 'Trinidad & Tobago': (w,h)=>[['r',0,0,w,h,'#DA1A35'],['r',-w*0.3,h*0.3,w*1.1,h*0.4,'#fff',0,38],['r',-w*0.28,h*0.36,w*1.06,h*0.28,'#000',0,38]],
 'Guyana': (w,h)=>[['r',0,0,w,h,'#009E49'],['p',`0,0 ${w*0.96},${h/2} 0,${h}`,'#FCD116'],['p',`0,0 ${w*0.46},${h/2} 0,${h}`,'#CE1126']],
 'Fiji': (w,h)=>[['r',0,0,w,h,'#68BFE5'],['r',0,0,w*0.44,h*0.52,'#012169'],['r',0,h*0.2,w*0.44,h*0.12,'#fff'],['r',w*0.16,0,w*0.12,h*0.52,'#fff'],['r',0,h*0.23,w*0.44,h*0.06,'#C8102E'],['r',w*0.19,0,w*0.06,h*0.52,'#C8102E'],['c',w*0.74,h*0.55,h*0.16,'#fff']],
 'Papua New Guinea': (w,h)=>[['r',0,0,w,h,'#000'],['p',`0,0 ${w},0 ${w},${h}`,'#CE1126'],['c',w*0.3,h*0.62,h*0.05,'#fff'],['c',w*0.24,h*0.78,h*0.05,'#fff'],['c',w*0.36,h*0.78,h*0.05,'#fff'],['c',w*0.72,h*0.26,h*0.12,'#FCD116']],
 'Sri Lanka': (w,h)=>[['r',0,0,w,h,'#FFBE29'],['r',w*0.06,h*0.12,w*0.12,h*0.76,'#00534E'],['r',w*0.18,h*0.12,w*0.12,h*0.76,'#EB7400'],['r',w*0.36,h*0.12,w*0.58,h*0.76,'#8D153A'],['c',w*0.62,h*0.5,h*0.16,'#FFBE29']],
 'Bangladesh': (w,h)=>[['r',0,0,w,h,'#006A4E'],['c',w*0.45,h/2,h*0.28,'#F42A41']],
 'Mongolia': (w,h)=>[['r',0,0,w,h,'#C4272F'],['r',w/3,0,w/3,h,'#015197'],['r',w*0.1,h*0.3,w*0.13,h*0.4,'#F9CF02']],
 'Ireland': (w,h)=>[['r',0,0,w,h,'#fff'],['r',0,0,w/3,h,'#169B62'],['r',2*w/3,0,w/3,h,'#FF883E']],
 'Cyprus': (w,h)=>[['r',0,0,w,h,'#fff'],['r',w*0.3,h*0.26,w*0.4,h*0.2,'#D57800',2],['r',w*0.42,h*0.42,w*0.16,h*0.1,'#D57800'],['r',w*0.3,h*0.62,w*0.4,h*0.05,'#4E5B31'],['r',w*0.3,h*0.72,w*0.4,h*0.05,'#4E5B31']],
 'Malta': (w,h)=>[['r',0,0,w/2,h,'#fff'],['r',w/2,0,w/2,h,'#CF142B'],['r',w*0.06,h*0.1,w*0.1,h*0.22,'#9D9D9C']],
 'Oman': (w,h)=>[['r',0,0,w,h/3,'#fff'],['r',0,h/3,w,h/3,'#DB161B'],['r',0,2*h/3,w,h/3,'#008000'],['r',0,0,w*0.26,h,'#DB161B']],
 'Qatar': (w,h)=>[['r',0,0,w,h,'#8A1538'],['r',0,0,w*0.3,h,'#fff'],['p',`${w*0.3},0 ${w*0.38},${h*0.1} ${w*0.3},${h*0.2} ${w*0.38},${h*0.3} ${w*0.3},${h*0.4} ${w*0.38},${h*0.5} ${w*0.3},${h*0.6} ${w*0.38},${h*0.7} ${w*0.3},${h*0.8} ${w*0.38},${h*0.9} ${w*0.3},${h}`,'#fff']]
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
