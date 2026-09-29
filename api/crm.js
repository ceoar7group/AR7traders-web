import {requireUser,send} from './_supabase.js';
import {can,log,requirePerm} from './_perm.js';
import {CRM_COLUMNS} from './_columns.js';

// Core CRM records.
//
//   GET     any signed-in member may read (the CRM screens are read-only views).
//   POST    requires the entity's write permission.
//   PATCH   requires the entity's write permission.
//   DELETE  requires the entity's write permission, then either deletes
//           (delete.direct) or raises an approval request.
//
// Every role in the Team & permissions grid has a box for each write
// permission. Before this was enforced the API accepted writes from ANY
// authenticated member — a Viewer, whose every box is unticked, could still
// create and edit leads, customers and inventory by calling /api/crm
// directly. The grid now means what it says.
//
// `activities` is deliberately read-only: it is the audit trail, and the
// server writes to it itself. Staff cannot add, edit or delete entries
// (WHATS-NEW.md §2).
const entities={leads:'leads',customers:'customers',vehicles:'vehicles',quotes:'quotes',shipments:'shipments',tasks:'tasks',activities:'activities'};
const WRITE_PERM={
  leads:'leads.write',customers:'customers.write',vehicles:'vehicles.write',
  quotes:'quotes.write',shipments:'shipments.write',tasks:'tasks.write'
};
const READ_ONLY=['activities'];
// Writable columns live in api/_columns.js so the approval flow filters
// against exactly the same lists these endpoints do.
const allowed=CRM_COLUMNS;
const clean=(entity,body)=>Object.fromEntries((allowed[entity]||[]).filter(k=>body[k]!==undefined).map(k=>[k,body[k]]));

// Test hook: same rule as requirePerm, resolved against an injected permission
// table instead of the live role_permissions rows.
async function assertPerm(profile,permission,injected){
  if(injected.permsFor){
    const allowedHere=profile?.role==='admin'||!!(await injected.permsFor(profile?.role))[permission];
    if(!allowedHere)throw Object.assign(new Error(`Your role (${profile.role}) is not allowed to do this`),{status:403});
    return;
  }
  await requirePerm(profile,permission);
}

// `injected` ({db, getUser, permsFor}) is a test hook; Vercel always calls (req, res).
export default async function handler(req,res,injected={}){
 try{
  const auth=injected.getUser?await injected.getUser(req):await requireUser(req);
  const {user,profile}=auth;
  const db=injected.db||auth.db;
  const entity=String(req.query.entity||'');
  if(entity==='me')return send(res,200,profile);
  if(!entities[entity])return send(res,400,{error:'Unknown CRM entity'});
  if(req.method==='GET'){
   const {data,error}=await db.from(entities[entity]).select('*').order(entity==='tasks'?'due_date':'created_at',{ascending:false}).limit(500);if(error)throw error;return send(res,200,data||[])
  }
  // The audit trail is written by the server, never by the browser.
  if(READ_ONLY.includes(entity))
   return send(res,403,{error:`The activity log is read-only — entries are recorded automatically.`});
  await assertPerm(profile,WRITE_PERM[entity],injected);
  if(req.method==='POST'){
   const payload={...clean(entity,req.body||{}),created_by:user.id};const {data,error}=await db.from(entities[entity]).insert(payload).select().single();if(error)throw error;
   await db.from('activities').insert({action:`Created ${entity.slice(0,-1)} record`,actor:profile.full_name,entity_type:entity.slice(0,-1),entity_id:data.id,created_by:user.id});return send(res,201,data)
  }
  if(req.method==='PATCH'){
   const id=req.body?.id;if(!id)return send(res,400,{error:'Record id is required'});const payload={...clean(entity,req.body),updated_at:new Date().toISOString()};const {data,error}=await db.from(entities[entity]).update(payload).eq('id',id).select().single();if(error)throw error;await db.from('activities').insert({action:`Updated ${entity.slice(0,-1)} record`,actor:profile.full_name,entity_type:entity.slice(0,-1),entity_id:id,created_by:user.id});return send(res,200,data)
  }
  if(req.method==='DELETE'){
   const id=req.query.id;if(!id)return send(res,400,{error:'Record id is required'});
   const {data:row}=await db.from(entities[entity]).select('*').eq('id',id).single();
   const label=row?.name||row?.title||row?.stock_no||row?.quote_no||row?.tracking_no||entity;
   // Staff without direct-delete rights raise an approval request instead
   // of being refused outright, so the work still moves.
   const direct=injected.permsFor
     ?(profile?.role==='admin'||!!(await injected.permsFor(profile?.role))['delete.direct'])
     :await can(profile,'delete.direct');
   if(!direct){
    const {data:ar,error:aErr}=await db.from('approval_requests').insert({
      kind:'delete',entity_type:entity,entity_id:id,entity_label:label,
      reason:req.query.reason||null,requested_by:user.id,
      requested_by_name:profile.full_name||profile.email
    }).select().single();
    if(aErr)throw aErr;
    await log(db,profile,`Requested approval to delete ${label}`,entity,id);
    return send(res,202,{pending:true,approval_id:ar.id,
      message:'Sent to an administrator for approval.'})
   }
   const {error}=await db.from(entities[entity]).delete().eq('id',id);if(error)throw error;
   await log(db,profile,`Deleted ${label}`,entity,id);
   return send(res,200,{ok:true})
  }
  return send(res,405,{error:'Method not allowed'})
 }catch(e){console.error(e);return send(res,e.status||500,{error:e.message||'CRM request failed'})}
}
