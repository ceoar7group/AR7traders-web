import {adminClient,send} from './_supabase.js';

// Public enquiry form — the only unauthenticated write on the site, so every
// field is length-capped and shape-checked before it reaches the database.
// Without a cap a single crafted POST could store a megabyte of text in
// leads.name, and a malformed email would land in the CRM looking real.
const MAX={name:120,email:200,phone:40,country:80,vehicle_interest:180};
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cut=(v,max)=>String(v??'').trim().slice(0,max);

// `injected` ({db}) is a test hook; Vercel always calls (req, res).
export default async function handler(req,res,injected={}){
 if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
 try{
  const b=req.body||{};if(b.website)return send(res,200,{ok:true});
  const name=cut(b.name,MAX.name),email=cut(b.email,MAX.email),phone=cut(b.phone,MAX.phone);
  if(name.length<2||(!email&&!phone))return send(res,400,{error:'Name and email or phone are required'});
  if(email&&!EMAIL_RE.test(email))return send(res,400,{error:'Please enter a valid email address'});
  const budget=Number(b.budget);
  const safeBudget=Number.isFinite(budget)&&budget>0?budget:null;
  const payload={name,email:email||null,phone:phone||null,
   country:cut(b.country,MAX.country)||'Other',
   vehicle_interest:cut(b.vehicle_interest??b.vehicle,MAX.vehicle_interest)||'General enquiry',
   source:'Website',status:'new',budget:safeBudget};
  const db=injected.db||adminClient();const {data,error}=await db.from('leads').insert(payload).select('id').single();if(error)throw error;
  await db.from('activities').insert({action:`New website lead: ${name}`,actor:'Website',entity_type:'lead',entity_id:data.id});return send(res,201,{ok:true,id:data.id})
 }catch(e){console.error(e);return send(res,500,{error:'Unable to submit enquiry'})}
}
