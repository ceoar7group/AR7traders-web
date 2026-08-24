import {adminClient,send} from './_supabase.js';

export default async function handler(req,res){
 if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
 try{
  const b=req.body||{};if(b.website)return send(res,200,{ok:true});
  const name=String(b.name||'').trim(),email=String(b.email||'').trim(),phone=String(b.phone||'').trim();
  if(name.length<2||(!email&&!phone))return send(res,400,{error:'Name and email or phone are required'});
  const payload={name,email:email||null,phone:phone||null,country:String(b.country||'Other').slice(0,80),vehicle_interest:String(b.vehicle_interest||b.vehicle||'General enquiry').slice(0,180),source:'Website',status:'new',budget:Number(b.budget)||null};
  const db=adminClient();const {data,error}=await db.from('leads').insert(payload).select('id').single();if(error)throw error;
  await db.from('activities').insert({action:`New website lead: ${name}`,actor:'Website',entity_type:'lead',entity_id:data.id});return send(res,201,{ok:true,id:data.id})
 }catch(e){console.error(e);return send(res,500,{error:'Unable to submit enquiry'})}
}
