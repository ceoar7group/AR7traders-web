// The two pieces of the customer area that every page needs.
//
// Split out of customer-portal.jsx so the whole account UI (the page, the
// gate, the login/signup forms, the ledger) can be loaded on demand from the
// /account route while the floating WhatsApp button and the session hook stay
// in the always-loaded bundle — they render on first paint, on every page.
import React, {useEffect, useState} from 'react';
import {useSettings, waLink} from './site-settings.js';
import {WhatsAppIcon} from './brand-icons.jsx';

// 2026-11-08 Lighthouse round: this module is in the always-loaded bundle
// (main.jsx imports the session hook for the header), and it used to import
// supabase-client.js statically — which dragged the whole @supabase/supabase-js
// vendor chunk (~50 kB raw) into every visitor's first load just to ask
// "is someone signed in?". The client is now imported dynamically after
// mount, so the vendor code downloads off the critical path; the /account
// and /crm chunks keep their static imports and share the same module
// instance (one GoTrueClient, as before).
const SUPABASE_CONFIGURED =
  !!(import.meta.env.VITE_SUPABASE_URL && import.meta.env.VITE_SUPABASE_ANON_KEY);

/* ------------------------------------------------------------------ */
/*  Floating WhatsApp button — on every page, gently pulsing           */
/* ------------------------------------------------------------------ */
export function WhatsAppButton(){
 const s = useSettings();
 const [nudge,setNudge] = useState(false);
 useEffect(()=>{const t=setTimeout(()=>setNudge(true),2600);return()=>clearTimeout(t)},[]);
 if(!s.whatsapp_number) return null;
 return <a className={'wa-float'+(nudge?' nudge':'')}
   href={waLink(s.whatsapp_number, s.whatsapp_message)}
   target="_blank" rel="noopener noreferrer"
   aria-label="Chat with AR7 Traders on WhatsApp">
  <span className="wa-ring" aria-hidden="true"/>
  <span className="wa-ring two" aria-hidden="true"/>
  <WhatsAppIcon size={26}/>
  <b>Chat on WhatsApp</b>
 </a>;
}

/* ------------------------------------------------------------------ */
/*  Session hook                                                       */
/* ------------------------------------------------------------------ */
export function useCustomerSession(){
 const [session,setSession] = useState(null);
 const [ready,setReady] = useState(!SUPABASE_CONFIGURED);
 const [recovery,setRecovery] = useState(false);
 useEffect(()=>{
  if(!SUPABASE_CONFIGURED){setReady(true);return}
  let alive=true,subscription=null;
  import('./supabase-client.js').then(({supabase})=>{
   if(!alive||!supabase){setReady(true);return}
   supabase.auth.getSession().then(({data})=>{if(!alive)return;setSession(data.session);setReady(true)});
   const res = supabase.auth.onAuthStateChange((event,s)=>{
    if(!alive)return;
    setSession(s);
    if(event==='PASSWORD_RECOVERY') setRecovery(true);
   });
   subscription = res.data.subscription;
  }).catch(()=>{if(alive)setReady(true)});
  return ()=>{alive=false;if(subscription)subscription.unsubscribe()};
 },[]);
 return {session,ready,recovery,clearRecovery:()=>setRecovery(false)};
}
