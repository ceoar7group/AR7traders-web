import {adminClient} from './_supabase.js';

// Permissions live in the database (role_permissions), so you can change who
// can do what from the CRM without a code deploy.
//
// DEFAULTS below is the same matrix as the seed in supabase/schema.sql. It is
// used ONLY when role_permissions holds no row for a (role, permission) pair —
// which is exactly the state of any database provisioned before a permission
// was introduced. Without it, adding a permission row to the code would
// silently strip that ability from every role except admin until somebody
// remembered to run the SQL. As soon as a row exists (seeded, or written by
// the Team screen) the database wins.
export const ROLES=['admin','manager','sales','accounts','viewer'];

export const PERMISSION_KEYS=[
  'leads.write','customers.write','vehicles.write','orders.write','payments.write',
  'quotes.write','shipments.write','tasks.write',
  'site.write','team.manage','approvals.decide','delete.direct',
  'customer.login_as','settings.write',
  'hr.view','hr.manage','payroll.view','payroll.manage'
];

// role -> { permission: allowed } for every permission this code knows about.
export const DEFAULTS={
  admin:{},                              // admin always has everything (see can)
  manager:{
    'leads.write':true,'customers.write':true,'vehicles.write':true,'orders.write':true,
    'payments.write':false,'site.write':true,'team.manage':false,'approvals.decide':true,
    'delete.direct':false,'customer.login_as':true,'settings.write':false,
    'quotes.write':true,'shipments.write':true,'tasks.write':true,
    'hr.view':true,'hr.manage':false,'payroll.view':false,'payroll.manage':false
  },
  sales:{
    'leads.write':true,'customers.write':true,'vehicles.write':false,'orders.write':true,
    'payments.write':false,'site.write':false,'team.manage':false,'approvals.decide':false,
    'delete.direct':false,'customer.login_as':false,'settings.write':false,
    'quotes.write':true,'shipments.write':false,'tasks.write':true,
    'hr.view':false,'hr.manage':false,'payroll.view':false,'payroll.manage':false
  },
  accounts:{
    'leads.write':false,'customers.write':true,'vehicles.write':false,'orders.write':true,
    'payments.write':true,'site.write':false,'team.manage':false,'approvals.decide':false,
    'delete.direct':false,'customer.login_as':false,'settings.write':false,
    'quotes.write':false,'shipments.write':true,'tasks.write':true,
    'hr.view':true,'hr.manage':false,'payroll.view':true,'payroll.manage':true
  },
  viewer:{}                              // read-only: no permission defaults on
};

let cache=null,cacheAt=0;
async function loadRows(){
  const db=adminClient();
  if(!cache||Date.now()-cacheAt>30000){
    const {data}=await db.from('role_permissions').select('role,permission,allowed');
    cache={};(data||[]).forEach(r=>{(cache[r.role]||(cache[r.role]={}))[r.permission]=r.allowed});
    cacheAt=Date.now();
  }
  return cache;
}

/** Effective permission map for one role: database rows over code defaults. */
export async function permsFor(role){
  const byRole=await loadRows();
  const stored=byRole[role]||{},base=DEFAULTS[role]||{};
  const out={};
  for(const k of PERMISSION_KEYS) out[k]=k in stored?!!stored[k]:!!base[k];
  return out;
}

/** The complete matrix, one row per role x permission, for the Team screen.
 *  Returning synthesized rows means the grid always shows every permission
 *  even on a database that predates it, so the boxes match what the API does. */
export async function matrixRows(){
  const byRole=await loadRows();
  const out=[];
  for(const role of ROLES)for(const permission of PERMISSION_KEYS){
    const stored=(byRole[role]||{})[permission];
    out.push({role,permission,
      allowed:role==='admin'?true:(stored!==undefined?!!stored:!!(DEFAULTS[role]||{})[permission])});
  }
  return out;
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
