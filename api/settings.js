import {requireUser,adminClient,send} from './_supabase.js';
import {requirePerm,log} from './_perm.js';

// Public read (the website needs the phone/email/WhatsApp number),
// admin-only write.
export default async function handler(req,res){
 try{
  if(req.method==='GET'){
   const {data,error}=await adminClient().from('site_settings').select('key,value,label').order('key');
   if(error)throw error;
   res.setHeader('Cache-Control','public, max-age=60, s-maxage=300');
   return send(res,200,Object.fromEntries((data||[]).map(r=>[r.key,r.value])));
  }
  if(req.method==='PATCH'){
   const {profile,db}=await requireUser(req);
   await requirePerm(profile,'settings.write');
   const updates=req.body||{};
   const keys=Object.keys(updates);
   if(!keys.length)return send(res,400,{error:'Nothing to update'});
   for(const k of keys){
    const {error}=await db.from('site_settings')
      .update({value:String(updates[k]??''),updated_at:new Date().toISOString()}).eq('key',k);
    if(error)throw error;
   }
   await log(db,profile,`Updated website contact settings (${keys.join(', ')})`,'site_settings',null);
   return send(res,200,{ok:true});
  }
  return send(res,405,{error:'Method not allowed'});
 }catch(e){console.error(e);return send(res,e.status||500,{error:e.message||'Settings request failed'})}
}
