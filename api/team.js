import {requireUser,adminClient,send} from './_supabase.js';
import {requirePerm,log,clearPermCache,matrixRows,PERMISSION_KEYS} from './_perm.js';

const ROLES=['admin','manager','sales','accounts','viewer'];

// `injected` ({db, getUser, matrixRows}) is a test hook; Vercel always calls (req, res).
export default async function handler(req,res,injected={}){
 try{
  const auth=injected.getUser?await injected.getUser(req):await requireUser(req);
  const {user,profile}=auth;
  const db=injected.db||auth.db;
  const action=String(req.query.action||'members');

  // Anyone signed in may read the permission matrix (the UI greys out
  // buttons the user cannot use). Changing it needs team.manage.
  // matrixRows() returns the full grid — database rows over the code
  // defaults — so every permission is shown for every role even on a
  // database provisioned before that permission existed.
  if(action==='permissions'&&req.method==='GET'){
   const rows=injected.matrixRows?await injected.matrixRows():await matrixRows();
   return send(res,200,rows);
  }
  if(action==='me'&&req.method==='PATCH'){
   const {full_name,title,phone}=req.body||{};
   const patch={updated_at:new Date().toISOString()};
   if(full_name!==undefined){
    const fn=String(full_name).trim();
    if(fn.length<2)return send(res,400,{error:'Please enter your full name'});
    patch.full_name=fn;
   }
   if(title!==undefined)patch.title=String(title).trim();
   if(phone!==undefined)patch.phone=String(phone).trim();
   const {data,error}=await db.from('profiles').update(patch)
     .eq('id',user.id).select().single();
   if(error)throw error;
   await log(db,profile,'Updated their own profile','profiles',user.id);
   return send(res,200,data);
  }

  if(action==='me'&&req.method==='GET'){
   const {data,error}=await db.from('profiles').select('*').eq('id',user.id).single();
   if(error)throw error;return send(res,200,data);
  }
  if(action==='members'&&req.method==='GET'){
   await requirePerm(profile,'team.manage');
   const {data,error}=await db.from('profiles').select('*').order('created_at');
   if(error)throw error;return send(res,200,data||[]);
  }

  if(action==='invite'&&req.method==='POST'){
   await requirePerm(profile,'team.manage');
   const {email,full_name,role,password}=req.body||{};
   if(!email||!role)return send(res,400,{error:'Email and role are required'});
   if(!ROLES.includes(role))return send(res,400,{error:'Unknown role'});
   if(!password||String(password).length<8)
     return send(res,400,{error:'Set a starting password of at least 8 characters. The member can change it after signing in.'});
   const admin=adminClient();
   const {data:created,error:cErr}=await admin.auth.admin.createUser({
     email,password,email_confirm:true,
     user_metadata:{full_name:full_name||email.split('@')[0],account_type:'staff'}
   });
   if(cErr)return send(res,400,{error:cErr.message});
   // The signup trigger creates the profile; set the chosen role on top.
   await db.from('profiles').update({role,full_name:full_name||email.split('@')[0],email})
     .eq('id',created.user.id);
   await log(db,profile,`Added team member ${email} as ${role}`,'profiles',created.user.id);
   return send(res,201,{id:created.user.id,email,role});
  }

  if(action==='member'&&req.method==='PATCH'){
   await requirePerm(profile,'team.manage');
   const {id,role,active,full_name,title,phone}=req.body||{};
   if(!id)return send(res,400,{error:'Member id is required'});
   if(role&&!ROLES.includes(role))return send(res,400,{error:'Unknown role'});
   if(id===user.id&&role&&role!=='admin')
     return send(res,400,{error:'You cannot remove your own admin access — ask another admin to do it.'});
   if(id===user.id&&active===false)
     return send(res,400,{error:'You cannot deactivate your own account.'});
   const patch={updated_at:new Date().toISOString()};
   if(role!==undefined)patch.role=role;
   if(active!==undefined)patch.active=active;
   if(full_name!==undefined)patch.full_name=full_name;
   if(title!==undefined)patch.title=title;
   if(phone!==undefined)patch.phone=phone;
   const {data,error}=await db.from('profiles').update(patch).eq('id',id).select().single();
   if(error)throw error;
   await log(db,profile,`Updated team member ${data.email||id}`,'profiles',id);
   return send(res,200,data);
  }

  if(action==='set-permission'&&req.method==='POST'){
   await requirePerm(profile,'team.manage');
   const {role,permission,allowed}=req.body||{};
   if(role==='admin')return send(res,400,{error:'Admin permissions cannot be reduced.'});
   if(!ROLES.includes(role))return send(res,400,{error:'Unknown role'});
   // Only permissions this code understands may be written, so the table
   // cannot be used as arbitrary storage for keys nothing ever reads.
   if(!PERMISSION_KEYS.includes(permission))return send(res,400,{error:'Unknown permission'});
   const {error}=await db.from('role_permissions')
     .upsert({role,permission,allowed:!!allowed},{onConflict:'role,permission'});
   if(error)throw error;
   clearPermCache();
   await log(db,profile,`${allowed?'Granted':'Revoked'} ${permission} for ${role}`,'role_permissions',null);
   return send(res,200,{ok:true});
  }

  if(action==='reset-password'&&req.method==='POST'){
   await requirePerm(profile,'team.manage');
   const {id,password}=req.body||{};
   if(!id||!password||String(password).length<8)
     return send(res,400,{error:'A password of at least 8 characters is required'});
   const {error}=await adminClient().auth.admin.updateUserById(id,{password});
   if(error)return send(res,400,{error:error.message});
   await log(db,profile,'Reset a team member password','profiles',id);
   return send(res,200,{ok:true});
  }

  return send(res,405,{error:'Method not allowed'});
 }catch(e){console.error(e);return send(res,e.status||500,{error:e.message||'Team request failed'})}
}
