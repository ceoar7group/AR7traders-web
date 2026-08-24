import {createClient} from '@supabase/supabase-js';

const url=process.env.SUPABASE_URL||process.env.VITE_SUPABASE_URL;
const anon=process.env.SUPABASE_ANON_KEY||process.env.VITE_SUPABASE_ANON_KEY;
const service=process.env.SUPABASE_SERVICE_ROLE_KEY;

export function adminClient(){if(!url||!service)throw new Error('Supabase server environment is not configured');return createClient(url,service,{auth:{persistSession:false,autoRefreshToken:false}})}
export function authClient(){if(!url||!anon)throw new Error('Supabase authentication environment is not configured');return createClient(url,anon,{auth:{persistSession:false,autoRefreshToken:false}})}
export async function requireUser(req){const header=req.headers.authorization||'';const token=header.startsWith('Bearer ')?header.slice(7):'';if(!token)throw Object.assign(new Error('Unauthorized'),{status:401});const {data,error}=await authClient().auth.getUser(token);if(error||!data.user)throw Object.assign(new Error('Unauthorized'),{status:401});const db=adminClient();const {data:profile}=await db.from('profiles').select('id,full_name,role,active,email').eq('id',data.user.id).single();if(!profile?.active)throw Object.assign(new Error('Account is inactive'),{status:403});return {user:data.user,profile,db}}
export function send(res,status,data){res.status(status).setHeader('Content-Type','application/json');res.end(JSON.stringify(data))}
