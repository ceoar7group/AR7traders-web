// The two pieces of the customer area that every page needs.
//
// Split out of customer-portal.jsx so the whole account UI (the page, the
// gate, the login/signup forms, the ledger) can be loaded on demand from the
// /account route while the floating WhatsApp button and the session hook stay
// in the always-loaded bundle — they render on first paint, on every page.
import React, {useEffect, useState} from 'react';
import {useSettings, waLink} from './site-settings.js';
import {WhatsAppIcon} from './brand-icons.jsx';
import {supabase, hasSupabase} from './supabase-client.js';

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
 const [ready,setReady] = useState(!hasSupabase);
 const [recovery,setRecovery] = useState(false);
 useEffect(()=>{
  if(!supabase){setReady(true);return}
  supabase.auth.getSession().then(({data})=>{setSession(data.session);setReady(true)});
  const {data:{subscription}} = supabase.auth.onAuthStateChange((event,s)=>{
    setSession(s);
    if(event==='PASSWORD_RECOVERY') setRecovery(true);
  });
  return ()=>subscription.unsubscribe();
 },[]);
 return {session,ready,recovery,clearRecovery:()=>setRecovery(false)};
}
