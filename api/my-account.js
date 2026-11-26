import {authClient,adminClient,send} from './_supabase.js';
import {loadPublicStock,evaluateSearch,nextSeenRefs,runAlertSweep} from './_stock-alerts.js';
import {normalizeCriteria,criteriaIsEmpty,defaultSearchName} from '../src/saved-search.js';
import {phoneError} from '../src/lead-validation.js';

// The signed-in CUSTOMER's own view: their orders, payments and balance —
// plus their saved searches / stock alerts (?searches) and the scheduled
// alert sweep (?alerts=run, key-guarded). The saved-search routes live on
// this function because the project sits at the Hobby plan's 12-function
// limit (scripts/function-count.test.mjs).
//
// Deliberately separate from the staff APIs - a customer can only ever
// see the record linked to their own auth user.
// `injected` ({db,user,stock,emailFn,now}) is a test hook; Vercel calls (req,res).
async function verifyUser(req,injected={}){
 if(injected.user)return injected.user;
 const header=req.headers.authorization||'';
 const token=header.startsWith('Bearer ')?header.slice(7):'';
 if(!token)return null;
 const ac=authClient();
 const {data:u,error}=await ac.auth.getUser(token);
 if(error||!u?.user)return null;
 return u.user;
}

export default async function handler(req,res,injected={}){
 // Account and tracking responses must never be cached across users.
 res.setHeader('Cache-Control','private, no-store');
 try{
  const query=req.query||{};

  // ---- Scheduled stock-alert sweep (no user token; same key contract as
  //      /api/goonet-sync, and triggered from the same nightly workflow) ----
  if(query.alerts==='run'){
   const expected=String(process.env.GOONET_SYNC_KEY||'');
   const key=String(query.key||'');
   if(!(expected&&key&&key===expected))return send(res,401,{error:'Missing or wrong sweep key'});
   const db=injected.db||adminClient();
   const result=await runAlertSweep(db,{stock:injected.stock,emailFn:injected.emailFn,now:injected.now});
   return send(res,200,result);
  }

  // ---- Public shipment tracking (2026-11) --------------------------------
  // A courier-style track-by-number box: no sign-in, the tracking number is
  // the whole key. Returns ONLY logistics fields — never the customer's
  // name, contact details or money. Vessel position itself is public AIS
  // data (the CRM links the same VesselFinder page).
  if('track' in query){
   const no=String(query.track||'').trim().toUpperCase();
   if(!/^[A-Z0-9-]{6,24}$/.test(no))
     return send(res,400,{error:'Enter the tracking number from your invoice, like AR7-260184'});
   const db=injected.db||adminClient();
   const {data:found,error}=await db.from('shipments')
     .select('tracking_no,vehicle,origin,destination,vessel,status,eta,progress')
     .ilike('tracking_no',no.replace(/[%_]/g,m=>'\\'+m)).limit(1);
   if(error)return send(res,500,{error:'Tracking is unavailable right now — please try again shortly'});
   const row=(found||[])[0];
   if(!row)return send(res,404,{error:'No shipment found for that tracking number. Check it against your invoice, or ask us on WhatsApp.'});
   // Shape the payload explicitly — belt and braces on top of the select()
   // column list, so a schema change can never leak a name or a note here.
   return send(res,200,{shipment:{
     tracking_no:row.tracking_no,vehicle:row.vehicle,origin:row.origin,
     destination:row.destination,vessel:row.vessel,status:row.status,
     eta:row.eta,progress:row.progress
   }});
  }

  const user=await verifyUser(req,injected);
  if(!user)return send(res,401,{error:'Please sign in'});

  // ---- Saved favourites (2026-11-08, scoped to the signed-in user) -------
  // One row per user holding the hearted stock references, so favourites
  // follow the customer across devices. GET returns the array; PUT replaces
  // it (last write wins — the client merges local + server before writing).
  if('favourites' in query){
   const db=injected.db||adminClient();
   if(req.method==='GET'){
    const {data:row}=await db.from('saved_favourites').select('*')
      .eq('auth_user_id',user.id).single();
    return send(res,200,{refs:Array.isArray(row?.refs)?row.refs:[]});
   }
   if(req.method==='PUT'){
    const refs=[...new Set((Array.isArray(req.body?.refs)?req.body.refs:[])
      .map(r=>String(r??'').trim()).filter(r=>r&&r.length<=64))].slice(0,200);
    const {data:existing}=await db.from('saved_favourites').select('id')
      .eq('auth_user_id',user.id).single();
    if(existing?.id){
     const {error}=await db.from('saved_favourites')
       .update({refs,updated_at:new Date().toISOString()})
       .eq('id',existing.id).eq('auth_user_id',user.id);
     if(error)return send(res,400,{error:error.message});
    }else{
     const {error}=await db.from('saved_favourites')
       .insert({auth_user_id:user.id,refs});
     if(error)return send(res,400,{error:error.message});
    }
    return send(res,200,{refs});
   }
   return send(res,405,{error:'Method not allowed'});
  }

  // ---- Saved searches / stock alerts (scoped to the signed-in user) ------
  if('searches' in query){
   const db=injected.db||adminClient();
   if(req.method==='GET'){
    const {data:rows,error}=await db.from('saved_searches').select('*')
      .eq('auth_user_id',user.id).order('created_at',{ascending:false});
    if(error)return send(res,400,{error:error.message});
    const stock=injected.stock||await loadPublicStock(db);
    return send(res,200,{searches:(rows||[]).map(r=>{
      const {matchRefs,newRefs}=evaluateSearch(r,stock);
      return {id:r.id,name:r.name,criteria:r.criteria,email_alerts:r.email_alerts,
        created_at:r.created_at,last_notified_at:r.last_notified_at,
        matches:matchRefs.length,new_matches:newRefs.length,new_refs:newRefs.slice(0,12)};
    })});
   }
   if(req.method==='POST'){
    const criteria=normalizeCriteria(req.body?.criteria);
    if(criteriaIsEmpty(criteria))
      return send(res,400,{error:'Pick at least one filter before saving — an alert for every car would ping on all new stock.'});
    const {count}=await db.from('saved_searches').select('id',{count:'exact',head:true})
      .eq('auth_user_id',user.id);
    if((count||0)>=10)return send(res,400,{error:'You already have 10 saved searches — delete one first.'});
    // Seed seen_refs with everything that matches TODAY: an alert is about
    // stock that arrives after you saved, not the cars already on screen.
    const stock=injected.stock||await loadPublicStock(db);
    const seed=evaluateSearch({criteria,seen_refs:[]},stock).matchRefs;
    const name=String(req.body?.name||'').trim().slice(0,60)||defaultSearchName(criteria);
    const {data:made,error}=await db.from('saved_searches').insert({
      auth_user_id:user.id,email:user.email||null,name,criteria,
      email_alerts:req.body?.email_alerts!==false,
      seen_refs:nextSeenRefs({seen_refs:[]},seed)
    }).select().single();
    if(error)return send(res,400,{error:error.message});
    return send(res,200,{search:{id:made.id,name:made.name,criteria:made.criteria,
      email_alerts:made.email_alerts,created_at:made.created_at,
      matches:seed.length,new_matches:0,new_refs:[]}});
   }
   if(req.method==='PATCH'){
    const id=String(req.body?.id||query.id||'');
    if(!id)return send(res,400,{error:'Which saved search?'});
    const patch={updated_at:new Date().toISOString()};
    if(typeof req.body?.email_alerts==='boolean')patch.email_alerts=req.body.email_alerts;
    if(req.body?.ack===true){
     const {data:row}=await db.from('saved_searches').select('*')
       .eq('id',id).eq('auth_user_id',user.id).single();
     if(!row)return send(res,404,{error:'Saved search not found'});
     const stock=injected.stock||await loadPublicStock(db);
     patch.seen_refs=nextSeenRefs(row,evaluateSearch(row,stock).matchRefs);
    }
    const {data:upd,error}=await db.from('saved_searches').update(patch)
      .eq('id',id).eq('auth_user_id',user.id).select().single();
    if(error)return send(res,400,{error:error.message});
    return send(res,200,{ok:true,search:{id:upd.id,email_alerts:upd.email_alerts}});
   }
   if(req.method==='DELETE'){
    const id=String(query.id||req.body?.id||'');
    if(!id)return send(res,400,{error:'Which saved search?'});
    const {error}=await db.from('saved_searches').delete()
      .eq('id',id).eq('auth_user_id',user.id);
    if(error)return send(res,400,{error:error.message});
    return send(res,200,{ok:true});
   }
   res.setHeader('Allow','GET, POST, PATCH, DELETE');
   return send(res,405,{error:'Method not allowed'});
  }

  if(req.method==='PATCH'){
   const db0=injected.db||adminClient();
   const name=String(req.body?.name??'').trim();
   const phone=req.body?.phone===undefined?undefined:String(req.body.phone).trim();
   const country=req.body?.country===undefined?undefined:String(req.body.country).trim();
   if(name!==''&&name.length<2)
     return send(res,400,{error:'Please enter your full name (at least 2 characters)'});
   if(name.length>120 || (phone?.length||0)>40 || (country?.length||0)>80)
     return send(res,400,{error:'Profile details are too long'});
   if('complete-profile' in query){
    const invalidPhone=phoneError(phone);
    if(name.length<2 || invalidPhone || !country)
     return send(res,400,{error:name.length<2?'Please enter your full name':invalidPhone||'Please enter your country'});
   }
   let {data:cust}=await db0.from('customers').select('*').eq('auth_user_id',user.id).single();
   const patch={updated_at:new Date().toISOString()};
   if(name!=='')patch.name=name;
   if(phone!==undefined)patch.phone=phone;
   if(country!==undefined)patch.country=country;
   if(!cust){
    if(name==='')return send(res,400,{error:'Please enter your name'});
    const {data:made,error:mErr}=await db0.from('customers').insert({
      ...patch, email:user.email, auth_user_id:user.id, portal_enabled:true
    }).select().single();
    if(mErr)return send(res,400,{error:mErr.message});
    cust=made;
   }else{
    const {data:upd,error:uErr}=await db0.from('customers')
      .update(patch).eq('id',cust.id).select().single();
    if(uErr)return send(res,400,{error:uErr.message});
    if(upd)cust=upd;else Object.assign(cust,patch);
   }
   try{
    await adminClient().auth.admin.updateUserById(user.id,{
      user_metadata:{...(user.user_metadata||{}),full_name:name||user.user_metadata?.full_name}
    });
   }catch(e){console.error('metadata sync skipped',e.message)}
   return send(res,200,{customer:{id:cust.id,name:cust.name,email:cust.email,
     phone:cust.phone||'',country:cust.country||''}});
  }

  const db=injected.db||adminClient();
  let {data:cust}=await db.from('customers').select('*').eq('auth_user_id',user.id).single();

  // An unlinked CRM customer may only be claimed by the confirmed owner of
  // exactly that email. Escape SQL LIKE wildcards, reject ambiguous duplicates,
  // and make the write conditional so concurrent claims cannot overwrite one
  // another. Never return a candidate if the link write failed.
  if(!cust && user.email_confirmed_at && typeof user.email === 'string' && user.email.trim()){
   const email=user.email.trim();
   const pattern=email.replace(/[\\%_]/g, c=>'\\'+c);
   const {data:byEmail,error:lookupError}=await db.from('customers').select('*')
     .ilike('email',pattern).is('auth_user_id',null).limit(2);
   if(!lookupError && byEmail?.length===1 && String(byEmail[0].email||'').trim().toLowerCase()===email.toLowerCase()){
    const {data:linked,error:linkError}=await db.from('customers')
      .update({auth_user_id:user.id,portal_enabled:true})
      .eq('id',byEmail[0].id).is('auth_user_id',null).select().single();
    if(!linkError && linked?.auth_user_id===user.id)cust=linked;
   }
  }

  if(!cust)return send(res,200,{customer:null,orders:[],payments:[],totals:null,shipments:[],
    message:'Your account is ready, but no vehicle order is linked to it yet. As soon as our team records your order it will appear here with every payment and the balance remaining.'});

  // Names are editable and not unique identifiers. Do not attach shipments by
  // name: the current schema has no trusted customer_id on shipments. Buyers
  // can still use the separate tracking-number lookup until staff can link
  // shipments to an immutable customer ID.
  const [o,p]=await Promise.all([
    db.from('order_balances').select('id,order_no,vehicle,status,stock_no,created_at,amount,paid,balance_due')
      .eq('customer_id',cust.id).order('created_at',{ascending:false}),
    db.from('payment_balances').select('id,amount,currency,amount_original,method,tt_number,received_at,applied,unapplied')
      .eq('customer_id',cust.id).order('received_at',{ascending:false})
  ]);
  const orderFields=['id','order_no','vehicle','status','stock_no','created_at','amount','paid','balance_due'];
  const orders=(o.data||[]).map(row=>Object.fromEntries(orderFields.map(key=>[key,row[key]])));
  const payments=p.data||[];
  const shipments=[];

  // Referral code (2026-11-18): every linked customer gets a share code the
  // first time they open their account. Generation retries on the unique
  // index; the whole block is fail-soft — a referral hiccup must NEVER block
  // the account view (and injected test dbs without update() stay valid).
  let referral=null;
  try{
   let code=(typeof cust.referral_code==='string'&&cust.referral_code.trim())?cust.referral_code.trim():null;
   if(!code){
    const ALPHA='ABCDEFGHJKMNPQRSTUVWXYZ23456789';
    for(let i=0;i<5&&!code;i++){
     const cand='AR7-'+Array.from({length:5},()=>ALPHA[Math.floor(Math.random()*ALPHA.length)]).join('');
     const {data:u,error:uerr}=await db.from('customers').update({referral_code:cand})
       .eq('id',cust.id).is('referral_code',null).select().single();
     if(!uerr&&u&&u.referral_code)code=u.referral_code;
    }
   }
   if(code){
    let uses=0;
    try{
     const {count}=await db.from('leads').select('id',{count:'exact',head:true}).eq('referral_code',code);
     uses=Number(count)||0;
    }catch{/* count is cosmetic */}
    referral={code,uses};
   }
  }catch{/* referral is a bonus, not a dependency */}

  return send(res,200,{
    customer:{id:cust.id,name:cust.name,email:cust.email,phone:cust.phone||'',country:cust.country},
    referral,
    shipments,
    orders,
    payments:payments.map(x=>({id:x.id,amount:x.amount,currency:x.currency||'USD',
      amount_original:x.amount_original??null,method:x.method,tt_number:x.tt_number,
      received_at:x.received_at,applied:x.applied,unapplied:x.unapplied})),
    totals:{
      ordered:orders.reduce((s,x)=>s+Number(x.amount||0),0),
      received:payments.reduce((s,x)=>s+Number(x.amount||0),0),
      unapplied:payments.reduce((s,x)=>s+Number(x.unapplied||0),0),
      due:orders.reduce((s,x)=>s+Number(x.balance_due||0),0)
    }
  });
 }catch(e){console.error(e);return send(res,500,{error:e.message||'Request failed'})}
}
