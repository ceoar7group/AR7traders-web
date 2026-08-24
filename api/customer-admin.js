import {requireUser,adminClient,send} from './_supabase.js';
import {requirePerm,log} from './_perm.js';

const SITE_URL=process.env.SITE_URL||process.env.VITE_SITE_URL||'';

export default async function handler(req,res){
 try{
  const {user,profile,db}=await requireUser(req);
  const action=String(req.query.action||'');
  const admin=adminClient();

  // ---- Full customer dashboard: orders, payments, ledger -------------
  if(action==='dashboard'&&req.method==='GET'){
   const id=req.query.id;if(!id)return send(res,400,{error:'Customer id is required'});
   const [c,o,p,a]=await Promise.all([
     db.from('customers').select('*').eq('id',id).single(),
     db.from('order_balances').select('*').eq('customer_id',id).order('created_at',{ascending:false}),
     db.from('payment_balances').select('*').eq('customer_id',id).order('received_at',{ascending:false}),
     db.from('payment_allocations').select('*')
   ]);
   if(c.error)return send(res,404,{error:'Customer not found'});
   const orders=o.data||[],payments=p.data||[];
   const allocs=(a.data||[]).filter(x=>payments.some(y=>y.id===x.payment_id));
   const totals={
     ordered:orders.reduce((s,x)=>s+Number(x.amount||0),0),
     received:payments.reduce((s,x)=>s+Number(x.amount||0),0),
     applied:payments.reduce((s,x)=>s+Number(x.applied||0),0),
     unapplied:payments.reduce((s,x)=>s+Number(x.unapplied||0),0),
     due:orders.reduce((s,x)=>s+Number(x.balance_due||0),0)
   };
   // auth details we CAN legitimately show
   let login=null;
   if(c.data.auth_user_id){
     const {data:au}=await admin.auth.admin.getUserById(c.data.auth_user_id);
     if(au?.user)login={
       email:au.user.email,
       last_sign_in_at:au.user.last_sign_in_at,
       created_at:au.user.created_at,
       confirmed:!!au.user.email_confirmed_at
     };
   }
   return send(res,200,{customer:c.data,orders,payments,allocations:allocs,totals,login});
  }

  // ---- Orders ---------------------------------------------------------
  if(action==='order'&&req.method==='POST'){
   await requirePerm(profile,'orders.write');
   const b=req.body||{};
   if(!b.customer_id||!b.vehicle)return send(res,400,{error:'Customer and vehicle are required'});
   const {data:no}=await db.rpc('ar7_next_order_no');
   const row={
     order_no:b.order_no||no||('AR7-O-'+Date.now()),
     customer_id:b.customer_id,source:b.source==='website'?'website':'manual',
     listing_id:b.listing_id||null,make:b.make||null,model:b.model||null,
     year:b.year?Number(b.year):null,stock_no:b.stock_no||null,
     vehicle:b.vehicle,amount:Number(b.amount)||0,
     status:b.status||'pending',notes:b.notes||null,created_by:user.id
   };
   const {data,error}=await db.from('orders').insert(row).select().single();
   if(error)throw error;
   await log(db,profile,`Added order ${data.order_no} (${data.vehicle})`,'orders',data.id);
   return send(res,201,data);
  }
  if(action==='order'&&req.method==='PATCH'){
   await requirePerm(profile,'orders.write');
   const b=req.body||{};if(!b.id)return send(res,400,{error:'Order id is required'});
   const patch={updated_at:new Date().toISOString()};
   ['vehicle','amount','status','notes','make','model','year','stock_no'].forEach(k=>{
     if(b[k]!==undefined)patch[k]=k==='amount'||k==='year'?Number(b[k]):b[k]});
   const {data,error}=await db.from('orders').update(patch).eq('id',b.id).select().single();
   if(error)throw error;
   await log(db,profile,`Updated order ${data.order_no}`,'orders',data.id);
   return send(res,200,data);
  }

  // Import a car straight from the website catalogue into an order.
  if(action==='import-listing'&&req.method==='POST'){
   await requirePerm(profile,'orders.write');
   const {customer_id,listing_id}=req.body||{};
   if(!customer_id||!listing_id)return send(res,400,{error:'Customer and website car are required'});
   const {data:l,error:lErr}=await db.from('site_listings').select('*').eq('id',listing_id).single();
   if(lErr||!l)return send(res,404,{error:'That website car was not found'});
   const amount=Number(String(l.price??'').replace(/[^0-9.]/g,''))||0;
   const {data:no}=await db.rpc('ar7_next_order_no');
   const {data,error}=await db.from('orders').insert({
     order_no:no||('AR7-O-'+Date.now()),customer_id,source:'website',listing_id,
     make:l.make,model:l.model,year:l.year,stock_no:l.stock_no,
     vehicle:[l.year,l.make,l.model].filter(Boolean).join(' '),
     amount,created_by:user.id
   }).select().single();
   if(error)throw error;
   await log(db,profile,`Imported ${data.vehicle} from the website into order ${data.order_no}`,'orders',data.id);
   return send(res,201,data);
  }

  // ---- Payments and allocation ---------------------------------------
  if(action==='payment'&&req.method==='POST'){
   await requirePerm(profile,'payments.write');
   const b=req.body||{};
   if(!b.customer_id||!(Number(b.amount)>0))
     return send(res,400,{error:'Customer and a positive amount are required'});
   const {data,error}=await db.from('payments').insert({
     customer_id:b.customer_id,amount:Number(b.amount),method:b.method||'TT',
     tt_number:b.tt_number||null,bank:b.bank||null,
     received_at:b.received_at||new Date().toISOString().slice(0,10),
     note:b.note||null,created_by:user.id
   }).select().single();
   if(error)throw error;
   await log(db,profile,`Recorded ${b.method||'TT'} of ${Number(b.amount).toLocaleString()} ${data.tt_number?'('+data.tt_number+')':''}`.trim(),'payments',data.id);
   return send(res,201,data);
  }

  if(action==='allocate'&&req.method==='POST'){
   await requirePerm(profile,'payments.write');
   const {payment_id,order_id,amount}=req.body||{};
   if(!payment_id||!order_id||!(Number(amount)>0))
     return send(res,400,{error:'Payment, order and a positive amount are required'});
   const {data,error}=await db.from('payment_allocations')
     .insert({payment_id,order_id,amount:Number(amount),created_by:user.id}).select().single();
   // The database trigger blocks over-allocation; surface it in plain words.
   if(error)return send(res,400,{error:error.message.includes('Allocation exceeds')
      ? 'That is more than the unapplied balance on this payment.' : error.message});
   await log(db,profile,`Applied ${Number(amount).toLocaleString()} to an order`,'orders',order_id);
   return send(res,200,data);
  }

  if(action==='unallocate'&&req.method==='DELETE'){
   await requirePerm(profile,'payments.write');
   const id=req.query.id;if(!id)return send(res,400,{error:'Allocation id is required'});
   const {error}=await db.from('payment_allocations').delete().eq('id',id);
   if(error)throw error;
   await log(db,profile,'Returned an applied amount to unapplied funds','payments',null);
   return send(res,200,{ok:true});
  }

  // ---- Portal account management --------------------------------------
  if(action==='create-portal'&&req.method==='POST'){
   await requirePerm(profile,'customers.write');
   const {customer_id,email,password}=req.body||{};
   if(!customer_id||!email)return send(res,400,{error:'Customer and email are required'});
   if(!password||String(password).length<8)
     return send(res,400,{error:'A starting password of at least 8 characters is required'});
   const {data:cust}=await db.from('customers').select('*').eq('id',customer_id).single();
   if(!cust)return send(res,404,{error:'Customer not found'});
   const {data:created,error:cErr}=await admin.auth.admin.createUser({
     email,password,email_confirm:true,
     user_metadata:{full_name:cust.name,account_type:'customer'}
   });
   if(cErr)return send(res,400,{error:cErr.message});
   await db.from('customers').update({auth_user_id:created.user.id,portal_enabled:true,email})
     .eq('id',customer_id);
   await log(db,profile,`Created website login for ${cust.name}`,'customers',customer_id);
   return send(res,201,{email,user_id:created.user.id});
  }

  if(action==='set-customer-password'&&req.method==='POST'){
   await requirePerm(profile,'customers.write');
   const {customer_id,password}=req.body||{};
   if(!customer_id||!password||String(password).length<8)
     return send(res,400,{error:'A password of at least 8 characters is required'});
   const {data:cust}=await db.from('customers').select('*').eq('id',customer_id).single();
   if(!cust?.auth_user_id)return send(res,400,{error:'This customer has no website login yet'});
   const {error}=await admin.auth.admin.updateUserById(cust.auth_user_id,{password});
   if(error)return send(res,400,{error:error.message});
   await log(db,profile,`Set a new website password for ${cust.name}`,'customers',customer_id);
   return send(res,200,{ok:true});
  }

  // Send the customer a reset email (they choose their own password).
  if(action==='send-reset'&&req.method==='POST'){
   await requirePerm(profile,'customers.write');
   const {customer_id}=req.body||{};
   const {data:cust}=await db.from('customers').select('*').eq('id',customer_id).single();
   if(!cust?.email)return send(res,400,{error:'This customer has no email address'});
   const {error}=await admin.auth.resetPasswordForEmail(cust.email,
     SITE_URL?{redirectTo:SITE_URL.replace(/\/$/,'')+'/#account'}:undefined);
   if(error)return send(res,400,{error:error.message});
   await log(db,profile,`Sent a password reset email to ${cust.name}`,'customers',customer_id);
   return send(res,200,{ok:true,sent_to:cust.email});
  }

  // "Log in as" — a one-time link, so no password is ever needed or shown.
  if(action==='login-as'&&req.method==='POST'){
   await requirePerm(profile,'customer.login_as');
   const {customer_id}=req.body||{};
   const {data:cust}=await db.from('customers').select('*').eq('id',customer_id).single();
   if(!cust?.email)return send(res,400,{error:'This customer has no website login'});
   const {data,error}=await admin.auth.admin.generateLink({type:'magiclink',email:cust.email});
   if(error)return send(res,400,{error:error.message});
   await log(db,profile,`Opened ${cust.name}'s website account`,'customers',customer_id);
   return send(res,200,{url:data?.properties?.action_link||null});
  }

  return send(res,405,{error:'Unknown action'});
 }catch(e){console.error(e);return send(res,e.status||500,{error:e.message||'Request failed'})}
}
