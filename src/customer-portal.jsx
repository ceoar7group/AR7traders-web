// Customer-facing account: sign in, sign up, forgot password, and the real
// order/ledger view fed by /api/my-account.
//
// Everything here is scoped to the signed-in customer by the API — the browser
// never gets to ask for someone else's records.
import React, {useEffect, useState} from 'react';
import {MessageCircle, Mail, LockKeyhole, ArrowRight, Check, LogIn, UserPlus,
                BadgeCheck, CarFront, Wallet, ArrowLeftRight, ShieldCheck, X,
        UserCog, KeyRound, BellRing, BellOff, Trash2, Search, Heart} from 'lucide-react';
import {supabase} from './supabase-client.js';
import { useCustomerSession } from './customer-session.jsx';
import {useSettings, waLink} from './site-settings.js';
import {useCurrency, CurrencySwitcher, BASE_CURRENCY} from './currency.jsx';
import {linkClick, inventoryHref} from './routing.js';
import {describeCriteria, criteriaHref} from './saved-search.js';
import './portal.css';
import { useLang } from './i18n.jsx';
import { validateLead } from './lead-validation.js';

const money = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n)||0);
const nice  = s => s ? new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(s)) : '—';
const title = s => (s||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());

/* ------------------------------------------------------------------ */
/*  The page                                                           */
/* ------------------------------------------------------------------ */
export function CustomerAccountPage({navigate}){
 const {session,ready,recovery,clearRecovery} = useCustomerSession();
 if(!ready) return <section className="account-page"><div className="account-loading"><i/><span>Loading your account…</span></div></section>;
 if(recovery) return <NewPasswordPanel onDone={clearRecovery}/>;
 if(session)  return <MyAccount session={session} navigate={navigate}/>;
 return <AccountGate navigate={navigate}/>;
}

/* ---- signed out: login / signup / forgot -------------------------- */
function AccountGate({navigate}){
 const [mode,setMode]=useState('login');
 const s=useSettings();
 const {t}=useLang();
 return <section className="account-page">
  <div className="account-visual">
   <img loading="lazy" decoding="async" src="/assets/japanese-car-auction-inspection-shipping-1.webp" alt="AR7 vehicle inspection in Japan" width="820" height="550"/>
   <div className="account-overlay">
    <img src="/assets/ar7-mark-128.webp" alt="AR7 Traders" loading="lazy" decoding="async" width="49" height="49"/>
    <div>
     <div className="kicker">{t('account.kicker')}</div>
     <h2>{t('account.h2a')}<br/>{t('account.h2b')}</h2>
     <ul>
      <li><Check/> {t('account.li1')}</li>
      <li><Check/> {t('account.li2')}</li>
      <li><Check/> {t('account.li3')}</li>
      <li><Check/> {t('account.li4')}</li>
     </ul>
    </div>
    <div className="account-testimonial">{t('account.quote')}<small>{t('account.quoteBy')}</small></div>
   </div>
  </div>
  <div className="account-form-wrap">
   <div className="account-tabs">
    <button className={mode==='signup'?'active':''} onClick={()=>setMode('signup')} type="button"><UserPlus/> {t('account.signup')}</button>
    <button className={mode!=='signup'?'active':''} onClick={()=>setMode('login')} type="button"><LogIn/> {t('account.login')}</button>
   </div>
   {mode==='login'  && <LoginForm onForgot={()=>setMode('forgot')}/>}
   {mode==='forgot' && <ForgotForm onBack={()=>setMode('login')}/>}
   {mode==='signup' && <SignupForm settings={s} onDone={()=>setMode('login')}/>}
  </div>
 </section>;
}

function LoginForm({onForgot}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState('');
 const {t}=useLang();
 const [busy,setBusy]=useState(false),[err,setErr]=useState('');
 async function submit(e){
  e.preventDefault();
  if(!supabase){setErr('Accounts are not connected yet. Please contact us and we will help directly.');return}
  setBusy(true);setErr('');
  const {error}=await supabase.auth.signInWithPassword({email,password});
  if(error) setErr(error.message==='Invalid login credentials'
    ? 'That email and password do not match. Try again, or use “Forgot password”.'
    : error.message);
  setBusy(false);
 }
 return <form onSubmit={submit}>
  <div className="kicker">{t('account.welcome')}</div>
  <h1>{t('account.loginH1')}</h1>
  <p>{t('account.loginP')}</p>
  {err && <div className="account-error">{err}</div>}
  <label>{t('account.email')}<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
  <label>{t('account.password')}<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
  <button className="primary wide" disabled={busy} type="submit">{busy?t('account.loggingIn'):t('account.login')} <ArrowRight/></button>
  <button type="button" className="link-btn" onClick={onForgot}>{t('account.forgot')}</button>
  <small className="demo-note"><LockKeyhole/> {t('account.secure')}</small>
 </form>;
}

function ForgotForm({onBack}){
 const [email,setEmail]=useState(''),[sent,setSent]=useState(false);
 const {t}=useLang();
 const [busy,setBusy]=useState(false),[err,setErr]=useState('');
 async function submit(e){
  e.preventDefault();
  if(!supabase){setErr('Password reset is not connected yet. Please contact us directly.');return}
  setBusy(true);setErr('');
  const {error}=await supabase.auth.resetPasswordForEmail(email,{
    redirectTo: location.origin + '/account'
  });
  if(error) setErr(error.message); else setSent(true);
  setBusy(false);
 }
 if(sent) return <div className="account-sent">
  <span><Mail/></span>
  <h1>{t('account.checkEmail')}</h1>
  <p>{t('account.sentA')} <b>{email}</b>. {t('account.sentB')}</p>
  <button className="outline-btn" onClick={onBack} type="button">{t('account.backLogin')}</button>
 </div>;
 return <form onSubmit={submit}>
  <div className="kicker">{t('account.helpK')}</div>
  <h1>{t('account.resetH1')}</h1>
  <p>{t('account.resetP')}</p>
  {err && <div className="account-error">{err}</div>}
  <label>{t('account.email')}<input required type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
  <button className="primary wide" disabled={busy} type="submit">{busy?t('account.sending'):t('account.resetBtn')} <ArrowRight/></button>
  <button type="button" className="link-btn" onClick={onBack}>{t('account.backLogin')}</button>
 </form>;
}

function SignupForm({settings,onDone}){
 const [busy,setBusy]=useState(false),[err,setErr]=useState(''),[done,setDone]=useState(false);
 const {t}=useLang();
 async function submit(e){
  e.preventDefault();
  const f=new FormData(e.target);
  const email=f.get('email'),password=f.get('password');
  const values=Object.fromEntries(f.entries());
  const errors=validateLead(values,{requireEmail:true});
  if(Object.keys(errors).length){setErr(errors[Object.keys(errors)[0]]);return}
  setBusy(true);setErr('');
  try{
   // Save the enquiry before claiming the desk has the buyer's details. A
   // failed lead write must not be hidden behind a successful account screen.
   const leadResponse=await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({name:values.name,email,phone:values.phone,
       country:values.country,vehicle_interest:values.vehicle||'',source:'Website signup'})});
   const leadResult=await leadResponse.json().catch(()=>({}));
   if(!leadResponse.ok||leadResult.ok!==true||!leadResult.id)throw new Error(leadResult.error||'We could not save your enquiry. Please try again or contact us directly.');
   if(supabase){
    const {error}=await supabase.auth.signUp({email,password,
      options:{data:{full_name:f.get('name'),account_type:'customer'},
               emailRedirectTo:location.origin+'/account'}});
    if(error) throw error;
   }
   setDone(true);
  }catch(e2){setErr(e2.message)}finally{setBusy(false)}
 }
 if(done) return <div className="account-sent">
  <span><BadgeCheck/></span>
  <h1>{t('account.doneH1')}</h1>
  <p>{t('account.doneP')}</p>
  <button className="primary" onClick={onDone} type="button">{t('account.goLogin')} <ArrowRight/></button>
 </div>;
 return <form onSubmit={submit}>
  <div className="kicker">{t('account.createK')}</div>
  <h1>{t('account.createH1')}</h1>
  <p>{t('account.createP')}</p>
  {err && <div className="account-error">{err}</div>}
  <label>{t('account.fullName')}<input name="name" required placeholder={t('account.phName')}/></label>
  <label>{t('account.email')}<input name="email" required type="email" placeholder="you@email.com"/></label>
  <div className="form-row">
   <label>{t('account.country')}<select name="country" defaultValue="Pakistan"><option>Pakistan</option><option>UAE</option><option>Kenya</option><option>United Kingdom</option><option>Tanzania</option><option>Other</option></select></label>
   <label>{t('account.phone')}<input name="phone" required type="tel" inputMode="tel" autoComplete="tel" maxLength={40} placeholder="+92 300 0000000"/></label>
  </div>
  <label>{t('account.password')}<input name="password" required type="password" minLength={8} placeholder={t('account.phPassword')}/></label>
  <label>{t('account.vehicle')}<input name="vehicle" placeholder={t('account.phVehicle')}/></label>
  <button className="primary wide" disabled={busy} type="submit">{busy?t('account.creating'):t('account.createBtn')} <ArrowRight/></button>
  <small className="demo-note"><ShieldCheck/> {t('account.privacy')} <a href={'mailto:'+settings.contact_email}>{settings.contact_email}</a></small>
 </form>;
}

function NewPasswordPanel({onDone}){
 const [busy,setBusy]=useState(false),[err,setErr]=useState(''),[ok,setOk]=useState(false);
 const {t}=useLang();
 async function submit(e){
  e.preventDefault();
  const p=new FormData(e.target).get('password');
  setBusy(true);setErr('');
  const {error}=await supabase.auth.updateUser({password:p});
  if(error) setErr(error.message); else {setOk(true);setTimeout(onDone,1600)}
  setBusy(false);
 }
 return <section className="account-page single">
  <div className="account-form-wrap">
   {ok ? <div className="account-sent"><span><Check/></span><h1>{t('account.changedH1')}</h1><p>{t('account.changedP')}</p></div>
   : <form onSubmit={submit}>
     <div className="kicker">{t('account.newK')}</div>
     <h1>{t('account.newH1')}</h1>
     <p>{t('account.newP')}</p>
     {err && <div className="account-error">{err}</div>}
     <label>{t('account.newLbl')}<input name="password" type="password" required minLength={8} autoComplete="new-password"/></label>
     <button className="primary wide" disabled={busy} type="submit">{busy?t('account.saving'):t('account.saveBtn')} <ArrowRight/></button>
    </form>}
  </div>
 </section>;
}

/* ---- signed in: the real account ---------------------------------- */
function MyAccount({session,navigate}){
  const [data,setData]=useState(null),[err,setErr]=useState('');
 const [panel,setPanel]=useState(null);   // 'profile' | 'password' | null
 const s=useSettings();
 const {fmt,display,isBase,rate}=useCurrency();
 async function load(){
  const r=await fetch('/api/my-account',{headers:{Authorization:'Bearer '+session.access_token}});
  const j=await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(j.error||'Could not load your account');
  setData(j);
 }
 useEffect(()=>{load().catch(e=>setErr(e.message))},[session.access_token]);

 async function signOut(){await supabase.auth.signOut()}

 if(err) return <section className="account-page single"><div className="account-form-wrap">
   <div className="account-sent"><span><X/></span><h1>Something went wrong.</h1><p>{err}</p>
   <button className="outline-btn" onClick={signOut} type="button">Sign out</button></div></div></section>;
 if(!data) return <section className="account-page"><div className="account-loading"><i/><span>Loading your orders…</span></div></section>;

 const name=data.customer?.name||session.user.email;
 const t=data.totals||{ordered:0,received:0,unapplied:0,due:0};

 return <section className="my-account">
  <div className="shell">
   <div className="ma-head">
    <div>
     <div className="kicker">YOUR AR7 ACCOUNT</div>
     <h1>Hello, <em>{String(name).split(' ')[0]}</em>.</h1>
     <p>{session.user.email}</p>
    </div>
        <div className="ma-head-actions">
     <CurrencySwitcher label="My account currency"/>
     <button className="outline-btn" onClick={()=>setPanel(panel==='profile'?null:'profile')} type="button"><UserCog/> Profile</button>
     <button className="outline-btn" onClick={()=>setPanel(panel==='password'?null:'password')} type="button"><KeyRound/> Password</button>
     <a className="outline-btn" href={waLink(s.whatsapp_number,'Hello AR7, I have a question about my order.')} target="_blank" rel="noopener noreferrer"><MessageCircle/> Ask a question</a>
     <button className="outline-btn" onClick={signOut} type="button">Sign out</button>
    </div>
   </div>

   {panel==='profile' && <ProfilePanel session={session} customer={data.customer}
     email={session.user.email} onClose={()=>setPanel(null)}
     onSaved={()=>load().catch(()=>{})}/>}
   {panel==='password' && <PasswordPanel onClose={()=>setPanel(null)}/>}

   <SavedSearches session={session} navigate={navigate}/>
   <SavedCars session={session} navigate={navigate}/>

   {!data.customer ? <div className="ma-empty">
     <span><CarFront/></span>
     <h2>Your account is ready.</h2>
     <p>{data.message||'As soon as our team links an order to you, it will appear here with every payment and the balance remaining.'}</p>
     <div><a className="primary" href="/inventory" onClick={linkClick('inventory',navigate)}>Browse inventory <ArrowRight/></a>
      <a className="outline-btn" href={'mailto:'+s.contact_email}><Mail/> {s.contact_email}</a></div>
    </div>
   : <>
    <div className="ma-kpis">
     {[['Total ordered',t.ordered,<CarFront/>],['Total received',t.received,<Wallet/>],
       ['Available credit',t.unapplied,<ArrowLeftRight/>],['Balance due',t.due,<BadgeCheck/>]]
      .map(([l,v,icon])=><article key={l} className={l==='Balance due'&&v>0?'due':''}>
        <i>{icon}</i><span>{l}</span><b>{fmt(v)}</b></article>)}
    </div>
    {!isBase && <p className="ma-note">
      <ShieldCheck/> Shown in {display} at 1 {BASE_CURRENCY} = {rate(display)} {display}. Your invoices are issued in {BASE_CURRENCY} or JPY — the {BASE_CURRENCY} figures your order is measured in never change.</p>}
    {Number(t.unapplied)>0 && <p className="ma-note">
      <ShieldCheck/> You have {fmt(t.unapplied)} received but not yet applied to a specific car. Tell us which order it should go against and our team will apply it.</p>}

    <h2 className="ma-title">Your vehicles</h2>
    {!data.orders?.length ? <p className="ma-muted">No orders yet.</p>
    : <div className="ma-orders">{data.orders.map(o=>{
       const pct=Number(o.amount)>0?Math.min(100,Math.round(Number(o.paid)/Number(o.amount)*100)):0;
       return <article key={o.id}>
        <header><b>{o.vehicle}</b><em className={'ma-status '+o.status}>{title(o.status)}</em></header>
        <small>Order {o.order_no}{o.stock_no?' · Stock '+o.stock_no:''} · {nice(o.created_at)}</small>
        <div className="ma-bar"><u style={{width:pct+'%'}}/></div>
        <dl>
         <div><dt>Price</dt><dd>{fmt(o.amount)}</dd></div>
         <div><dt>Paid</dt><dd>{fmt(o.paid)}</dd></div>
         <div><dt>Remaining</dt><dd className={Number(o.balance_due)>0?'owing':'clear'}>{fmt(o.balance_due)}</dd></div>
         <div><dt>Paid so far</dt><dd>{pct}%</dd></div>
        </dl>
       </article>})}</div>}

    <h2 className="ma-title">Payments received</h2>
    {!data.payments?.length ? <p className="ma-muted">No payments recorded yet.</p>
    : <div className="ma-table"><table>
       <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th>Amount</th><th>Applied</th><th>Available</th></tr></thead>
       <tbody>{data.payments.map(p=><tr key={p.id}>
        <td>{nice(p.received_at)}</td><td>{p.method}</td><td>{p.tt_number||'—'}</td>
        <td>{fmt(p.amount)}</td><td>{fmt(p.applied)}</td>
        <td className={Number(p.unapplied)>0?'credit':''}>{fmt(p.unapplied)}</td>
       </tr>)}</tbody></table></div>}
    <p className="ma-foot"><ShieldCheck/> Every payment we receive is listed here the day it clears. If something looks wrong, message us on WhatsApp or email {s.contact_email} and we will check it with you.</p>
   </>}
  </div>
 </section>;
}

/* ---- saved cars (favourites) --------------------------------------- */
// 2026-11-08: the hearts from the public site, synced to this account
// (saved_favourites, one row per user). Shown as quick links back into the
// inventory. Renders nothing while empty or if the table isn't provisioned —
// the account never blocks on it.
function SavedCars({session,navigate}){
 const [refs,setRefs]=useState(null);
 useEffect(()=>{let alive=true;
  fetch('/api/my-account?favourites=1',{headers:{Authorization:'Bearer '+session.access_token}})
   .then(r=>r.ok?r.json():null)
   .then(j=>{if(alive&&j&&Array.isArray(j.refs))setRefs(j.refs)})
   .catch(()=>{});
  return()=>{alive=false};
 },[session.access_token]);
 if(!refs||!refs.length)return null;
 return <div className="ma-alerts ma-favs">
  <h2 className="ma-title"><Heart/> Your saved cars</h2>
  <p className="ma-muted">Hearted on the website — they follow your account on any device.</p>
  <div className="ma-fav-chips">{refs.slice(0,30).map(ref=>{
    const href='/inventory/'+encodeURIComponent(ref);
    return <a key={ref} className="outline-btn" href={href} onClick={linkClick(href,navigate)}>{ref} <ArrowRight/></a>;
  })}</div>
 </div>;
}

/* ---- saved searches & stock alerts -------------------------------- */
// The buyer's standing orders: "tell me when a car like this lands". Rows
// live in Supabase (saved_searches), scoped server-side to this auth user;
// the nightly sweep (api/_stock-alerts.js) sends the e-mails. Here we list
// them, show how many matches are NEW since the search last looked, and let
// the buyer mute, delete or jump to the matching stock.
function SavedSearches({session,navigate}){
 const [rows,setRows]=useState(null),[err,setErr]=useState('');
 const auth={Authorization:'Bearer '+session.access_token};
 useEffect(()=>{let alive=true;
  (async()=>{
   try{
    const r=await fetch('/api/my-account?searches=1',{headers:auth});
    const j=await r.json().catch(()=>({}));
    if(!r.ok)throw new Error(j.error||'Could not load saved searches');
    if(alive)setRows(j.searches||[]);
   }catch(e){if(alive)setErr(e.message)}
  })();
  return()=>{alive=false};
 },[session.access_token]);

 async function toggle(s){
  setRows(v=>v.map(x=>x.id===s.id?{...x,email_alerts:!s.email_alerts}:x));
  await fetch('/api/my-account?searches=1',{method:'PATCH',
    headers:{...auth,'Content-Type':'application/json'},
    body:JSON.stringify({id:s.id,email_alerts:!s.email_alerts})}).catch(()=>{});
 }
 async function remove(s){
  setRows(v=>v.filter(x=>x.id!==s.id));
  await fetch('/api/my-account?searches=1&id='+encodeURIComponent(s.id),
    {method:'DELETE',headers:auth}).catch(()=>{});
 }
 function view(s){
  // Seeing the matches acknowledges them — the NEW badge resets server-side.
  fetch('/api/my-account?searches=1',{method:'PATCH',
    headers:{...auth,'Content-Type':'application/json'},
    body:JSON.stringify({id:s.id,ack:true})}).catch(()=>{});
  setRows(v=>v.map(x=>x.id===s.id?{...x,new_matches:0,new_refs:[]}:x));
 }

 if(err) return null; // the table may not be provisioned yet — never block the account
 return <div className="ma-alerts">
  <h2 className="ma-title"><BellRing/> Saved searches &amp; stock alerts</h2>
  {rows===null ? <p className="ma-muted">Loading your alerts…</p>
  : !rows.length ? <div className="ma-alerts-empty">
     <p>Save a search from the inventory page and we&rsquo;ll e-mail you the moment matching stock lands in Japan.</p>
     <a className="outline-btn" href="/inventory" onClick={linkClick('inventory',navigate)}><Search/> Browse inventory</a>
    </div>
  : <div className="ma-alert-grid">{rows.map(s=>{
     const href=criteriaHref(s.criteria,inventoryHref);
     return <article key={s.id} className={s.new_matches>0?'has-new':''}>
      <header>
       <b>{s.name}</b>
       {s.new_matches>0&&<em className="ma-new">{s.new_matches} NEW</em>}
      </header>
      <div className="ma-alert-chips">{describeCriteria(s.criteria).map(c=><span key={c}>{c}</span>)}</div>
      <small>{s.matches} matching {s.matches===1?'car':'cars'} in stock now
        {s.email_alerts?' · e-mail alerts on':' · e-mail alerts off'}</small>
      <div className="ma-alert-actions">
       <a className="outline-btn" href={href} onClick={e=>{view(s);linkClick(href,navigate)(e)}}>View matches <ArrowRight/></a>
       <button className="outline-btn" type="button" onClick={()=>toggle(s)}
         title={s.email_alerts?'Pause e-mail alerts':'Resume e-mail alerts'}>
        {s.email_alerts?<><BellOff/> Mute</>:<><BellRing/> Unmute</>}
       </button>
       <button className="outline-btn danger" type="button" onClick={()=>remove(s)}
         title="Delete this saved search"><Trash2/></button>
      </div>
     </article>;
    })}</div>}
 </div>;
}

const COUNTRIES=['Pakistan','UAE','Kenya','United Kingdom','Tanzania','Other'];

function ProfilePanel({session,customer,email,onClose,onSaved}){
 const [busy,setBusy]=useState(false),[err,setErr]=useState(''),[ok,setOk]=useState(false);
 const initial=customer||{};
 async function submit(e){
  e.preventDefault();
  const f=new FormData(e.currentTarget);
  setBusy(true);setErr('');
  try{
   const r=await fetch('/api/my-account',{method:'PATCH',
     headers:{'Content-Type':'application/json',Authorization:'Bearer '+session.access_token},
     body:JSON.stringify({name:f.get('name'),phone:f.get('phone'),country:f.get('country')})});
   const j=await r.json().catch(()=>({}));
   if(!r.ok) throw new Error(j.error||'Could not save your details');
   if(supabase) await supabase.auth.updateUser({data:{full_name:f.get('name')}});
   setOk(true);onSaved&&onSaved();
   setTimeout(()=>{setOk(false);onClose()},1400);
  }catch(e2){setErr(e2.message)}finally{setBusy(false)}
 }
 return <section className="ma-panel">
  <header><div><div className="kicker">YOUR DETAILS</div><h2>Edit your profile.</h2>
   <p>Our team uses these details for your export documents, so please keep them accurate.</p></div>
   <button type="button" className="ma-panel-x" onClick={onClose} aria-label="Close"><X/></button></header>
  {ok ? <div className="ma-saved"><Check/> Saved.</div>
  : <form onSubmit={submit}>
    {err && <div className="account-error">{err}</div>}
    <label>FULL NAME<input name="name" required minLength={2} defaultValue={initial.name||''} placeholder="Your full name"/></label>
    <div className="form-row">
     <label>EMAIL<input value={email} disabled title="Email is your login — message us if it needs to change"/></label>
     <label>WHATSAPP / PHONE<input name="phone" defaultValue={initial.phone||''} placeholder="+92 300 0000000"/></label>
    </div>
    <label>COUNTRY
     <select name="country" defaultValue={initial.country||'Pakistan'}>
      {COUNTRIES.map(c=><option key={c}>{c}</option>)}
     </select>
    </label>
    <footer><button type="button" className="outline-btn" onClick={onClose}>Cancel</button>
     <button className="primary" disabled={busy} type="submit">{busy?'Saving…':'Save changes'} <ArrowRight/></button></footer>
   </form>}
 </section>;
}

function PasswordPanel({onClose}){
 const [busy,setBusy]=useState(false),[err,setErr]=useState(''),[ok,setOk]=useState(false);
 async function submit(e){
  e.preventDefault();
  if(!supabase){setErr('Password changes are not connected yet. Please contact us directly.');return}
  const f=new FormData(e.currentTarget);
  const next=f.get('password'),confirm=f.get('confirm');
  if(next!==confirm){setErr('The two passwords do not match.');return}
  setBusy(true);setErr('');
  const {error}=await supabase.auth.updateUser({password:next});
  if(error){setErr(error.message);setBusy(false);return}
  setOk(true);setBusy(false);
  setTimeout(onClose,1600);
 }
 return <section className="ma-panel">
  <header><div><div className="kicker">SECURITY</div><h2>Change your password.</h2>
   <p>Use at least 8 characters. You stay signed in on this device.</p></div>
   <button type="button" className="ma-panel-x" onClick={onClose} aria-label="Close"><X/></button></header>
  {ok ? <div className="ma-saved"><Check/> Password updated.</div>
  : <form onSubmit={submit}>
    {err && <div className="account-error">{err}</div>}
    <label>NEW PASSWORD<input name="password" type="password" required minLength={8} autoComplete="new-password" placeholder="At least 8 characters"/></label>
    <label>CONFIRM NEW PASSWORD<input name="confirm" type="password" required minLength={8} autoComplete="new-password"/></label>
    <small className="demo-note"><LockKeyhole/> If you no longer know your current password, sign out and use "Forgot your password" on the login screen.</small>
    <footer><button type="button" className="outline-btn" onClick={onClose}>Cancel</button>
     <button className="primary" disabled={busy} type="submit">{busy?'Saving…':'Update password'} <ArrowRight/></button></footer>
   </form>}
 </section>;
}
