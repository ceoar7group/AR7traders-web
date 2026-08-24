import {requireUser,send} from './_supabase.js';
import {requirePerm,log} from './_perm.js';

// People, performance and payroll.
//
// Performance figures are never accepted from the browser - they are read
// from the `employee_performance` view, which derives them from real orders
// and leads. That way nobody can type in their own numbers.

const DEPTS=['Sales','Operations','Accounts','Logistics','Management','Support'];
const TYPES=['full_time','part_time','contract','intern'];
const STATUSES=['active','on_leave','left'];

const num=v=>{const n=Number(v);return Number.isFinite(n)?n:0};
const monthStart=v=>{
  const d=v?new Date(v):new Date();
  if(isNaN(d))return null;
  return new Date(Date.UTC(d.getUTCFullYear(),d.getUTCMonth(),1)).toISOString().slice(0,10);
};

export default async function handler(req,res){
 try{
  const {profile,db}=await requireUser(req);
  const action=String(req.query.action||'overview');

  /* ---------------- read ---------------- */

  // Everything the People screen needs in one round trip.
  if(action==='overview'&&req.method==='GET'){
   await requirePerm(profile,'hr.view');
   const [emp,perf,pay]=await Promise.all([
     db.from('employees').select('*').order('status').order('full_name'),
     db.from('employee_performance').select('*'),
     db.from('payroll_view').select('*').order('period_month',{ascending:false}).limit(300)
   ]);
   if(emp.error)throw emp.error;
   const perfBy={};(perf.data||[]).forEach(p=>{perfBy[p.employee_id]=p});
   return send(res,200,{
     employees:(emp.data||[]).map(e=>({...e,performance:perfBy[e.id]||null})),
     payroll:pay.data||[],
     can:{manage:await safe(profile,'hr.manage'),payroll:await safe(profile,'payroll.manage'),
          payroll_view:await safe(profile,'payroll.view')}
   });
  }

  // One person, with their month-by-month trend.
  if(action==='employee'&&req.method==='GET'){
   await requirePerm(profile,'hr.view');
   const id=req.query.id;
   if(!id)return send(res,400,{error:'Which employee?'});
   const [e,p,m,o,pay]=await Promise.all([
     db.from('employees').select('*').eq('id',id).single(),
     db.from('employee_performance').select('*').eq('employee_id',id).single(),
     db.from('employee_month_performance').select('*').eq('employee_id',id).order('period_month',{ascending:false}).limit(12),
     db.from('orders').select('id,order_no,vehicle,amount,status,created_at').eq('employee_id',id).order('created_at',{ascending:false}).limit(50),
     db.from('payroll_view').select('*').eq('employee_id',id).order('period_month',{ascending:false}).limit(24)
   ]);
   if(!e.data)return send(res,404,{error:'Employee not found'});
   return send(res,200,{employee:e.data,performance:p.data||null,months:m.data||[],
                        orders:o.data||[],payroll:pay.data||[]});
  }

  /* ---------------- people ---------------- */

  if(action==='save-employee'&&(req.method==='POST'||req.method==='PATCH')){
   await requirePerm(profile,'hr.manage');
   const b=req.body||{};
   if(!b.full_name)return send(res,400,{error:'A name is required'});
   if(b.department&&!DEPTS.includes(b.department))return send(res,400,{error:'Unknown department'});
   if(b.employment_type&&!TYPES.includes(b.employment_type))return send(res,400,{error:'Unknown employment type'});
   if(b.status&&!STATUSES.includes(b.status))return send(res,400,{error:'Unknown status'});
   const pct=num(b.commission_pct);
   if(pct<0||pct>100)return send(res,400,{error:'Commission must be between 0 and 100 percent'});

   const row={
     full_name:b.full_name,email:b.email||null,phone:b.phone||null,
     job_title:b.job_title||null,department:b.department||'Sales',
     employment_type:b.employment_type||'full_time',status:b.status||'active',
     joined_on:b.joined_on||null,left_on:b.left_on||null,
     base_salary:num(b.base_salary),commission_pct:pct,
     bank_details:b.bank_details||null,notes:b.notes||null,
     profile_id:b.profile_id||null,updated_at:new Date().toISOString()
   };
   if(!row.joined_on)delete row.joined_on;

   if(b.id){
    const {data,error}=await db.from('employees').update(row).eq('id',b.id).select().single();
    if(error)return send(res,400,{error:error.message});
    await log(db,profile,`Updated employee ${row.full_name}`,'employees',b.id);
    return send(res,200,data);
   }
   row.created_by=profile.id;
   const {data,error}=await db.from('employees').insert(row).select().single();
   if(error)return send(res,400,{error:error.message});
   await log(db,profile,`Added employee ${row.full_name}`,'employees',data.id);
   return send(res,200,data);
  }

  // Link an employee to their CRM login, so a staff account and a personnel
  // record are the same person.
  if(action==='link-profile'&&req.method==='POST'){
   await requirePerm(profile,'hr.manage');
   const {id,profile_id}=req.body||{};
   const {error}=await db.from('employees').update({profile_id:profile_id||null}).eq('id',id);
   if(error)return send(res,400,{error:error.message});
   await log(db,profile,'Linked an employee to a CRM login','employees',id);
   return send(res,200,{ok:true});
  }

  // Credit a sale to somebody. This is what drives the performance numbers.
  if(action==='assign-order'&&req.method==='POST'){
   await requirePerm(profile,'hr.manage');
   const {order_id,employee_id}=req.body||{};
   if(!order_id)return send(res,400,{error:'Which order?'});
   const {error}=await db.from('orders').update({employee_id:employee_id||null}).eq('id',order_id);
   if(error)return send(res,400,{error:error.message});
   await log(db,profile,'Changed who is credited for an order','orders',order_id);
   return send(res,200,{ok:true});
  }

  /* ---------------- payroll ---------------- */

  if(action==='payroll'&&req.method==='GET'){
   await requirePerm(profile,'payroll.view');
   const month=monthStart(req.query.month);
   let q=db.from('payroll_view').select('*').order('full_name');
   if(month)q=q.eq('period_month',month);
   const {data,error}=await q;
   if(error)throw error;return send(res,200,data||[]);
  }

  // Build the month's payslips from live figures. Existing rows are left
  // alone - a draft someone has already adjusted is not overwritten, and a
  // paid one cannot be. Safe to press twice.
  if(action==='prepare-payroll'&&req.method==='POST'){
   await requirePerm(profile,'payroll.manage');
   const month=monthStart((req.body||{}).month);
   if(!month)return send(res,400,{error:'Which month?'});

   const [{data:staff},{data:existing},{data:months}]=await Promise.all([
     db.from('employees').select('*').eq('status','active'),
     db.from('payroll_runs').select('employee_id').eq('period_month',month),
     db.from('employee_month_performance').select('*').eq('period_month',month)
   ]);
   const already=new Set((existing||[]).map(r=>r.employee_id));
   const commBy={};(months||[]).forEach(m=>{commBy[m.employee_id]=Number(m.commission_earned||0)});

   const rows=(staff||[]).filter(e=>!already.has(e.id)).map(e=>({
     employee_id:e.id,period_month:month,
     base_salary:Number(e.base_salary||0),
     commission:Number((commBy[e.id]||0).toFixed(2)),
     bonus:0,deductions:0,currency:e.currency||'USD',
     status:'draft',created_by:profile.id
   }));
   if(!rows.length)return send(res,200,{created:0,skipped:already.size,
     message:already.size?'Every active employee already has a payslip for this month.':'There are no active employees to pay.'});

   const {data,error}=await db.from('payroll_runs').insert(rows).select();
   if(error)return send(res,400,{error:error.message});
   await log(db,profile,`Prepared ${data.length} payslip(s) for ${month.slice(0,7)}`,'payroll_runs',null);
   return send(res,200,{created:data.length,skipped:already.size});
  }

  if(action==='save-payslip'&&(req.method==='POST'||req.method==='PATCH')){
   await requirePerm(profile,'payroll.manage');
   const b=req.body||{};
   if(!b.id)return send(res,400,{error:'Which payslip?'});
   if(num(b.deductions)<0)return send(res,400,{error:'Deductions cannot be negative'});
   const patch={
     base_salary:num(b.base_salary),commission:num(b.commission),
     bonus:num(b.bonus),deductions:num(b.deductions),
     note:b.note||null,updated_at:new Date().toISOString()
   };
   const {data,error}=await db.from('payroll_runs').update(patch).eq('id',b.id).select().single();
   // The database refuses to change a paid payslip; surface that plainly.
   if(error)return send(res,400,{error:error.message});
   await log(db,profile,'Adjusted a payslip','payroll_runs',b.id);
   return send(res,200,data);
  }

  if(action==='set-payslip-status'&&req.method==='POST'){
   await requirePerm(profile,'payroll.manage');
   const {id,status,method,reference}=req.body||{};
   if(!['draft','approved','paid'].includes(status))return send(res,400,{error:'Unknown status'});
   const patch={status,updated_at:new Date().toISOString()};
   if(status==='approved')patch.approved_by=profile.id;
   if(status==='paid'){patch.paid_on=new Date().toISOString().slice(0,10);
     patch.method=method||'Bank transfer';patch.reference=reference||null}
   const {data,error}=await db.from('payroll_runs').update(patch).eq('id',id).select().single();
   if(error)return send(res,400,{error:error.message});
   await log(db,profile,`Marked a payslip ${status}`,'payroll_runs',id);
   return send(res,200,data);
  }

  return send(res,404,{error:'Unknown action'});
 }catch(e){
  console.error(e);
  return send(res,e.status||500,{error:e.message||'Request failed'});
 }
}

// `can` throws on refusal; here we only want a boolean for the UI.
async function safe(profile,perm){
  try{await requirePerm(profile,perm);return true}catch{return false}
}
