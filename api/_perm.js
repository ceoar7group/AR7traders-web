import {adminClient} from './_supabase.js';

// Permissions live in the database (role_permissions), so you can change who
// can do what from the CRM without a code deploy.
let cache=null,cacheAt=0;
export async function permsFor(role){
  const db=adminClient();
  if(!cache||Date.now()-cacheAt>30000){
    const {data}=await db.from('role_permissions').select('role,permission,allowed');
    cache={};(data||[]).forEach(r=>{(cache[r.role]||(cache[r.role]={}))[r.permission]=r.allowed});
    cacheAt=Date.now();
  }
  return cache[role]||{};
}
export function clearPermCache(){cache=null}

export async function can(profile,permission){
  if(!profile)return false;
  if(profile.role==='admin')return true;      // admin always has everything
  const p=await permsFor(profile.role);
  return !!p[permission];
}
export async function requirePerm(profile,permission){
  if(!(await can(profile,permission)))
    throw Object.assign(new Error(`Your role (${profile.role}) is not allowed to do this`),{status:403});
}

// Every meaningful action gets written to the activity log.
export async function log(db,profile,action,entity_type,entity_id){
  try{
    await db.from('activities').insert({
      action, actor:profile?.full_name||profile?.email||'System',
      entity_type, entity_id:entity_id||null, created_by:profile?.id||null
    });
  }catch(e){console.error('activity log failed',e.message)}
}
