import {requireUser,send} from './_supabase.js';
import {requirePerm,can,log} from './_perm.js';

// Tables an approval may act on. Anything not listed cannot be touched,
// so a crafted request can't delete from an arbitrary table.
const TABLES={
  leads:'leads',customers:'customers',vehicles:'vehicles',quotes:'quotes',
  shipments:'shipments',tasks:'tasks',orders:'orders',
  site_listings:'site_listings',site_routes:'site_routes',site_articles:'site_articles'
};

export default async function handler(req,res){
 try{
  const {user,profile,db}=await requireUser(req);

  if(req.method==='GET'){
   const status=req.query.status;
   let q=db.from('approval_requests').select('*').order('created_at',{ascending:false}).limit(300);
   if(status)q=q.eq('status',status);
   const {data,error}=await q;if(error)throw error;
   return send(res,200,data||[]);
  }

  // Raise a request (any signed-in staff member may ask).
  if(req.method==='POST'&&!req.query.decide){
   const {kind,entity_type,entity_id,entity_label,payload,reason}=req.body||{};
   if(!kind||!entity_type)return send(res,400,{error:'kind and entity_type are required'});
   const {data,error}=await db.from('approval_requests').insert({
     kind,entity_type,entity_id:entity_id||null,entity_label:entity_label||null,
     payload:payload||{},reason:reason||null,
     requested_by:user.id,requested_by_name:profile.full_name||profile.email
   }).select().single();
   if(error)throw error;
   await log(db,profile,`Requested approval to ${kind} ${entity_label||entity_type}`,entity_type,entity_id||null);
   return send(res,201,data);
  }

  // Approve or reject.
  if(req.method==='POST'&&req.query.decide){
   await requirePerm(profile,'approvals.decide');
   const {id,decision,note}=req.body||{};
   if(!id||!['approved','rejected'].includes(decision))
     return send(res,400,{error:'A decision of approved or rejected is required'});

   const {data:reqRow,error:rErr}=await db.from('approval_requests').select('*').eq('id',id).single();
   if(rErr||!reqRow)return send(res,404,{error:'Approval request not found'});
   if(reqRow.status!=='pending')return send(res,400,{error:'That request has already been decided'});
   if(reqRow.requested_by===user.id&&profile.role!=='admin')
     return send(res,403,{error:'You cannot approve your own request'});

   let finalStatus=decision;
   if(decision==='approved'){
    const table=TABLES[reqRow.entity_type];
    if(!table)return send(res,400,{error:'Unknown record type on this request'});
    if(reqRow.kind==='delete'){
     if(!reqRow.entity_id)return send(res,400,{error:'This request has no record attached'});
     const {error}=await db.from(table).delete().eq('id',reqRow.entity_id);
     if(error)throw error;
     finalStatus='applied';
    }else if(reqRow.kind==='price_change'||reqRow.kind==='update'){
     if(!reqRow.entity_id)return send(res,400,{error:'This request has no record attached'});
     const {error}=await db.from(table).update(reqRow.payload||{}).eq('id',reqRow.entity_id);
     if(error)throw error;
     finalStatus='applied';
    }
   }

   const {data,error}=await db.from('approval_requests').update({
     status:finalStatus,decided_by:user.id,
     decided_by_name:profile.full_name||profile.email,
     decision_note:note||null,decided_at:new Date().toISOString()
   }).eq('id',id).select().single();
   if(error)throw error;
   await log(db,profile,
     `${decision==='approved'?'Approved':'Rejected'} ${reqRow.kind} of ${reqRow.entity_label||reqRow.entity_type}`,
     reqRow.entity_type,reqRow.entity_id);
   return send(res,200,data);
  }

  return send(res,405,{error:'Method not allowed'});
 }catch(e){console.error(e);return send(res,e.status||500,{error:e.message||'Approval request failed'})}
}
