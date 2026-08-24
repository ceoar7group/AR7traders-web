import {requireUser,send} from './_supabase.js';

const entities={leads:'leads',customers:'customers',vehicles:'vehicles',quotes:'quotes',shipments:'shipments',tasks:'tasks',activities:'activities'};
const allowed={
 leads:['name','email','phone','country','vehicle_interest','source','status','budget','assigned_to','next_follow_up'],
 customers:['name','email','phone','country','status','total_spend','vehicles_bought','notes'],
 vehicles:['stock_no','make','model','year','price','status','location','steering','colour','interior','notes'],
 quotes:['quote_no','customer_name','vehicle','amount','status','valid_until','notes'],
 shipments:['tracking_no','customer_name','vehicle','origin','destination','vessel','status','eta','progress','notes'],
 tasks:['title','owner','priority','status','due_date','notes'],activities:['action','actor','entity_type','entity_id']
};
const clean=(entity,body)=>Object.fromEntries((allowed[entity]||[]).filter(k=>body[k]!==undefined).map(k=>[k,body[k]]));

export default async function handler(req,res){
 try{
  const {user,profile,db}=await requireUser(req);const entity=String(req.query.entity||'');
  if(entity==='me')return send(res,200,profile);
  if(!entities[entity])return send(res,400,{error:'Unknown CRM entity'});
  if(req.method==='GET'){
   const {data,error}=await db.from(entities[entity]).select('*').order(entity==='tasks'?'due_date':'created_at',{ascending:false}).limit(500);if(error)throw error;return send(res,200,data||[])
  }
  if(req.method==='POST'){
   const payload={...clean(entity,req.body||{}),created_by:user.id};const {data,error}=await db.from(entities[entity]).insert(payload).select().single();if(error)throw error;
   await db.from('activities').insert({action:`Created ${entity.slice(0,-1)} record`,actor:profile.full_name,entity_type:entity.slice(0,-1),entity_id:data.id,created_by:user.id});return send(res,201,data)
  }
  if(req.method==='PATCH'){
   const id=req.body?.id;if(!id)return send(res,400,{error:'Record id is required'});const payload={...clean(entity,req.body),updated_at:new Date().toISOString()};const {data,error}=await db.from(entities[entity]).update(payload).eq('id',id).select().single();if(error)throw error;await db.from('activities').insert({action:`Updated ${entity.slice(0,-1)} record`,actor:profile.full_name,entity_type:entity.slice(0,-1),entity_id:id,created_by:user.id});return send(res,200,data)
  }
  if(req.method==='DELETE'){
   if(profile.role!=='admin')return send(res,403,{error:'Only administrators can delete records'});const id=req.query.id;if(!id)return send(res,400,{error:'Record id is required'});const {error}=await db.from(entities[entity]).delete().eq('id',id);if(error)throw error;return send(res,200,{ok:true})
  }
  return send(res,405,{error:'Method not allowed'})
 }catch(e){console.error(e);return send(res,e.status||500,{error:e.message||'CRM request failed'})}
}
