import {authClient,adminClient,send} from './_supabase.js';

// The signed-in CUSTOMER's own view: their orders, payments and balance.
// Deliberately separate from the staff APIs - a customer can only ever
// see the record linked to their own auth user.
export default async function handler(req,res){
 try{
  const header=req.headers.authorization||'';
  const token=header.startsWith('Bearer ')?header.slice(7):'';
  if(!token)return send(res,401,{error:'Please sign in'});
  const ac=authClient();
  const {data:u,error}=await ac.auth.getUser(token);
  if(error||!u.user)return send(res,401,{error:'Please sign in'});

  if(req.method==='PATCH'){
   const db0=adminClient();
   const name=String(req.body?.name??'').trim();
   const phone=req.body?.phone===undefined?undefined:String(req.body.phone).trim();
   const country=req.body?.country===undefined?undefined:String(req.body.country).trim();
   if(name!==''&&name.length<2)
     return send(res,400,{error:'Please enter your full name (at least 2 characters)'});
   let {data:cust}=await db0.from('customers').select('*').eq('auth_user_id',u.user.id).single();
   const patch={updated_at:new Date().toISOString()};
   if(name!=='')patch.name=name;
   if(phone!==undefined)patch.phone=phone;
   if(country!==undefined)patch.country=country;
   if(!cust){
    if(name==='')return send(res,400,{error:'Please enter your name'});
    const {data:made,error:mErr}=await db0.from('customers').insert({
      ...patch, email:u.user.email, auth_user_id:u.user.id, portal_enabled:true
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
    await adminClient().auth.admin.updateUserById(u.user.id,{
      user_metadata:{...(u.user.user_metadata||{}),full_name:name||u.user.user_metadata?.full_name}
    });
   }catch(e){console.error('metadata sync skipped',e.message)}
   return send(res,200,{customer:{id:cust.id,name:cust.name,email:cust.email,
     phone:cust.phone||'',country:cust.country||''}});
  }

  const db=adminClient();
  let {data:cust}=await db.from('customers').select('*').eq('auth_user_id',u.user.id).single();

  // Someone who signed up on the website arrives with no link yet. If we
  // already hold a customer record with the same email - because staff added
  // them after a phone call, say - adopt it so their orders appear straight
  // away instead of looking lost. Matching on a confirmed email is safe:
  // Supabase has already proven they control that address.
  if(!cust&&u.user.email){
   const {data:byEmail}=await db.from('customers').select('*')
     .ilike('email',u.user.email).is('auth_user_id',null).limit(1);
   if(byEmail&&byEmail[0]){
    const {data:linked}=await db.from('customers')
      .update({auth_user_id:u.user.id,portal_enabled:true})
      .eq('id',byEmail[0].id).select().single();
    cust=linked||byEmail[0];
   }
  }

  if(!cust)return send(res,200,{customer:null,orders:[],payments:[],totals:null,
    message:'Your account is ready, but no vehicle order is linked to it yet. As soon as our team records your order it will appear here with every payment and the balance remaining.'});

  const [o,p]=await Promise.all([
    db.from('order_balances').select('*').eq('customer_id',cust.id).order('created_at',{ascending:false}),
    db.from('payment_balances').select('*').eq('customer_id',cust.id).order('received_at',{ascending:false})
  ]);
  const orders=o.data||[],payments=p.data||[];
  return send(res,200,{
    customer:{id:cust.id,name:cust.name,email:cust.email,country:cust.country},
    orders,
    payments:payments.map(x=>({id:x.id,amount:x.amount,method:x.method,tt_number:x.tt_number,
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
