// Customer-facing account: sign in, sign up, forgot password, and the real
// order/ledger view fed by /api/my-account.
//
// Everything here is scoped to the signed-in customer by the API — the browser
// never gets to ask for someone else's records.
import React, {useEffect, useState} from 'react';
import {MessageCircle, Mail, LockKeyhole, ArrowRight, Check, LogIn, UserPlus,
                BadgeCheck, CarFront, Wallet, ArrowLeftRight, ShieldCheck, X,
        UserCog, KeyRound} from 'lucide-react';
import {supabase, hasSupabase} from './supabase-client.js';
import {useSettings, waLink} from './site-settings.js';
import {WhatsAppIcon} from './brand-icons.jsx';

const money = n => new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n)||0);
const nice  = s => s ? new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(s)) : '—';
const title = s => (s||'').replaceAll('_',' ').replace(/\b\w/g,c=>c.toUpperCase());

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
 return <section className="account-page">
  <div className="account-visual">
   <img loading="lazy" decoding="async" src="/assets/japanese-car-auction-inspection-shipping-1.jpg" alt="AR7 vehicle inspection in Japan"/>
   <div className="account-overlay">
    <img src="/assets/ar7-mark.png" alt="AR7 Traders"/>
    <div>
     <div className="kicker">AR7 BUYER ACCOUNT</div>
     <h2>Your direct line<br/>to Japan.</h2>
     <ul>
      <li><Check/> See every car you have ordered</li>
      <li><Check/> Track what is paid and what is due</li>
      <li><Check/> View each payment we have received</li>
      <li><Check/> Follow shipping and documents</li>
     </ul>
    </div>
    <div className="account-testimonial">“The portal made my first import clear from day one.”<small>AR7 BUYER · KARACHI</small></div>
   </div>
  </div>
  <div className="account-form-wrap">
   <div className="account-tabs">
    <button className={mode==='signup'?'active':''} onClick={()=>setMode('signup')}><UserPlus/> Sign up</button>
    <button className={mode!=='signup'?'active':''} onClick={()=>setMode('login')}><LogIn/> Log in</button>
   </div>
   {mode==='login'  && <LoginForm onForgot={()=>setMode('forgot')}/>}
   {mode==='forgot' && <ForgotForm onBack={()=>setMode('login')}/>}
   {mode==='signup' && <SignupForm settings={s} onDone={()=>setMode('login')}/>}
  </div>
 </section>;
}

function LoginForm({onForgot}){
 const [email,setEmail]=useState(''),[password,setPassword]=useState('');
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
  <div className="kicker">WELCOME BACK</div>
  <h1>Log in to your account.</h1>
  <p>See your orders, payments and balance in one place.</p>
  {err && <div className="account-error">{err}</div>}
  <label>EMAIL<input required type="email" autoComplete="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
  <label>PASSWORD<input required type="password" autoComplete="current-password" value={password} onChange={e=>setPassword(e.target.value)}/></label>
  <button className="primary wide" disabled={busy}>{busy?'Logging in…':'Log in'} <ArrowRight/></button>
  <button type="button" className="link-btn" onClick={onForgot}>Forgot your password?</button>
  <small className="demo-note"><LockKeyhole/> Your connection is encrypted and your password is never stored in readable form.</small>
 </form>;
}

function ForgotForm({onBack}){
 const [email,setEmail]=useState(''),[sent,setSent]=useState(false);
 const [busy,setBusy]=useState(false),[err,setErr]=useState('');
 async function submit(e){
  e.preventDefault();
  if(!supabase){setErr('Password reset is not connected yet. Please contact us directly.');return}
  setBusy(true);setErr('');
  const {error}=await supabase.auth.resetPasswordForEmail(email,{
    redirectTo: location.origin + location.pathname + '#account'
  });
  if(error) setErr(error.message); else setSent(true);
  setBusy(false);
 }
 if(sent) return <div className="account-sent">
  <span><Mail/></span>
  <h1>Check your email.</h1>
  <p>We have sent a reset link to <b>{email}</b>. Open it on this device and you can choose a new password straight away. The link expires in one hour.</p>
  <button className="outline-btn" onClick={onBack}>Back to login</button>
 </div>;
 return <form onSubmit={submit}>
  <div className="kicker">PASSWORD HELP</div>
  <h1>Reset your password.</h1>
  <p>Enter the email you use for AR7 and we will send you a link to set a new password.</p>
  {err && <div className="account-error">{err}</div>}
  <label>EMAIL<input required type="email" value={email} onChange={e=>setEmail(e.target.value)}/></label>
  <button className="primary wide" disabled={busy}>{busy?'Sending…':'Email me a reset link'} <ArrowRight/></button>
  <button type="button" className="link-btn" onClick={onBack}>Back to login</button>
 </form>;
}

function SignupForm({settings,onDone}){
 const [busy,setBusy]=useState(false),[err,setErr]=useState(''),[done,setDone]=useState(false);
 async function submit(e){
  e.preventDefault();
  const f=new FormData(e.target);
  const email=f.get('email'),password=f.get('password');
  setBusy(true);setErr('');
  try{
   // The enquiry reaches the sales team either way, so nobody is lost if
   // account creation is not switched on yet.
   await fetch('/api/leads',{method:'POST',headers:{'Content-Type':'application/json'},
     body:JSON.stringify({name:f.get('name'),email,phone:f.get('phone'),
       country:f.get('country'),vehicle_interest:f.get('vehicle')||'',source:'Website signup'})}).catch(()=>{});
   if(supabase){
    const {error}=await supabase.auth.signUp({email,password,
      options:{data:{full_name:f.get('name'),account_type:'customer'},
               emailRedirectTo:location.origin+location.pathname+'#account'}});
    if(error) throw error;
   }
   setDone(true);
  }catch(e2){setErr(e2.message)}finally{setBusy(false)}
 }
 if(done) return <div className="account-sent">
  <span><BadgeCheck/></span>
  <h1>You’re in.</h1>
  <p>If we asked you to confirm your email, open that message first. Our Japan desk has your details and will be in touch — you can also message us on WhatsApp any time.</p>
  <button className="primary" onClick={onDone}>Go to login <ArrowRight/></button>
 </div>;
 return <form onSubmit={submit}>
  <div className="kicker">CREATE ACCOUNT</div>
  <h1>Create your buyer profile.</h1>
  <p>Join buyers in 35+ countries. It takes less than a minute.</p>
  {err && <div className="account-error">{err}</div>}
  <label>FULL NAME<input name="name" required placeholder="Your name"/></label>
  <label>EMAIL<input name="email" required type="email" placeholder="you@email.com"/></label>
  <div className="form-row">
   <label>COUNTRY<select name="country" defaultValue="Pakistan"><option>Pakistan</option><option>UAE</option><option>Kenya</option><option>United Kingdom</option><option>Tanzania</option><option>Other</option></select></label>
   <label>WHATSAPP<input name="phone" placeholder="+92 300 0000000"/></label>
  </div>
  <label>PASSWORD<input name="password" required type="password" minLength={8} placeholder="At least 8 characters"/></label>
  <label>VEHICLE YOU WANT<input name="vehicle" placeholder="e.g. Toyota Land Cruiser 2022"/></label>
  <button className="primary wide" disabled={busy}>{busy?'Creating…':'Create account'} <ArrowRight/></button>
  <small className="demo-note"><ShieldCheck/> We only use your details to help you buy and ship a vehicle. Questions? <a href={'mailto:'+settings.contact_email}>{settings.contact_email}</a></small>
 </form>;
}

function NewPasswordPanel({onDone}){
 const [busy,setBusy]=useState(false),[err,setErr]=useState(''),[ok,setOk]=useState(false);
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
   {ok ? <div className="account-sent"><span><Check/></span><h1>Password changed.</h1><p>Taking you to your account…</p></div>
   : <form onSubmit={submit}>
     <div className="kicker">CHOOSE A NEW PASSWORD</div>
     <h1>Set your password.</h1>
     <p>Pick something only you know — at least 8 characters.</p>
     {err && <div className="account-error">{err}</div>}
     <label>NEW PASSWORD<input name="password" type="password" required minLength={8} autoComplete="new-password"/></label>
     <button className="primary wide" disabled={busy}>{busy?'Saving…':'Save new password'} <ArrowRight/></button>
    </form>}
  </div>
 </section>;
}

/* ---- signed in: the real account ---------------------------------- */
function MyAccount({session,navigate}){
  const [data,setData]=useState(null),[err,setErr]=useState('');
 const [panel,setPanel]=useState(null);   // 'profile' | 'password' | null
 const s=useSettings();
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
   <button className="outline-btn" onClick={signOut}>Sign out</button></div></div></section>;
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
     <button className="outline-btn" onClick={()=>setPanel(panel==='profile'?null:'profile')}><UserCog/> Profile</button>
     <button className="outline-btn" onClick={()=>setPanel(panel==='password'?null:'password')}><KeyRound/> Password</button>
     <a className="outline-btn" href={waLink(s.whatsapp_number,'Hello AR7, I have a question about my order.')} target="_blank" rel="noopener noreferrer"><MessageCircle/> Ask a question</a>
     <button className="outline-btn" onClick={signOut}>Sign out</button>
    </div>
   </div>

   {panel==='profile' && <ProfilePanel session={session} customer={data.customer}
     email={session.user.email} onClose={()=>setPanel(null)}
     onSaved={()=>load().catch(()=>{})}/>}
   {panel==='password' && <PasswordPanel onClose={()=>setPanel(null)}/>}

   {!data.customer ? <div className="ma-empty">
     <span><CarFront/></span>
     <h2>Your account is ready.</h2>
     <p>{data.message||'As soon as our team links an order to you, it will appear here with every payment and the balance remaining.'}</p>
     <div><button className="primary" onClick={()=>navigate('inventory')}>Browse inventory <ArrowRight/></button>
      <a className="outline-btn" href={'mailto:'+s.contact_email}><Mail/> {s.contact_email}</a></div>
    </div>
   : <>
    <div className="ma-kpis">
     {[['Total ordered',t.ordered,<CarFront/>],['Total received',t.received,<Wallet/>],
       ['Available credit',t.unapplied,<ArrowLeftRight/>],['Balance due',t.due,<BadgeCheck/>]]
      .map(([l,v,icon])=><article key={l} className={l==='Balance due'&&v>0?'due':''}>
        <i>{icon}</i><span>{l}</span><b>{money(v)}</b></article>)}
    </div>
    {Number(t.unapplied)>0 && <p className="ma-note">
      <ShieldCheck/> You have {money(t.unapplied)} received but not yet applied to a specific car. Tell us which order it should go against and our team will apply it.</p>}

    <h2 className="ma-title">Your vehicles</h2>
    {!data.orders?.length ? <p className="ma-muted">No orders yet.</p>
    : <div className="ma-orders">{data.orders.map(o=>{
       const pct=Number(o.amount)>0?Math.min(100,Math.round(Number(o.paid)/Number(o.amount)*100)):0;
       return <article key={o.id}>
        <header><b>{o.vehicle}</b><em className={'ma-status '+o.status}>{title(o.status)}</em></header>
        <small>Order {o.order_no}{o.stock_no?' · Stock '+o.stock_no:''} · {nice(o.created_at)}</small>
        <div className="ma-bar"><u style={{width:pct+'%'}}/></div>
        <dl>
         <div><dt>Price</dt><dd>{money(o.amount)}</dd></div>
         <div><dt>Paid</dt><dd>{money(o.paid)}</dd></div>
         <div><dt>Remaining</dt><dd className={Number(o.balance_due)>0?'owing':'clear'}>{money(o.balance_due)}</dd></div>
         <div><dt>Paid so far</dt><dd>{pct}%</dd></div>
        </dl>
       </article>})}</div>}

    <h2 className="ma-title">Payments received</h2>
    {!data.payments?.length ? <p className="ma-muted">No payments recorded yet.</p>
    : <div className="ma-table"><table>
       <thead><tr><th>Date</th><th>Method</th><th>Reference</th><th>Amount</th><th>Applied</th><th>Available</th></tr></thead>
       <tbody>{data.payments.map(p=><tr key={p.id}>
        <td>{nice(p.received_at)}</td><td>{p.method}</td><td>{p.tt_number||'—'}</td>
        <td>{money(p.amount)}</td><td>{money(p.applied)}</td>
        <td className={Number(p.unapplied)>0?'credit':''}>{money(p.unapplied)}</td>
       </tr>)}</tbody></table></div>}
    <p className="ma-foot"><ShieldCheck/> Every payment we receive is listed here the day it clears. If something looks wrong, message us on WhatsApp or email {s.contact_email} and we will check it the same day.</p>
   </>}
  </div>
 </section>;
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
     <button className="primary" disabled={busy}>{busy?'Saving…':'Save changes'} <ArrowRight/></button></footer>
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
     <button className="primary" disabled={busy}>{busy?'Saving…':'Update password'} <ArrowRight/></button></footer>
   </form>}
 </section>;
}
