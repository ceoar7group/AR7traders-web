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
