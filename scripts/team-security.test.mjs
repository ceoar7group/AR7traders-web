// Non-destructive authorization checks against the real handler with a fake DB.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import team from '../api/team.js';
const CEO='ceoar7grouplimited@gmail.com';
const req=(action,method,body={})=>({query:{action},method,body,headers:{}});
function res(){return {statusCode:0,status(n){this.statusCode=n;return this},setHeader(){return this},end(s){this.body=JSON.parse(s)}}}
let writes=0;
const db={from(name){return {update(patch){writes++;return {eq(){return {select(){return {single:async()=>({data:{id:'target',email:'target@example.com',...patch},error:null})}}}}}},insert(){return Promise.resolve({error:null})}}}};
async function call(user,profile,request){let r=res();const old=console.error;console.error=()=>{};try {await team(request,r,{db,getUser:async()=>({user,profile,db})});} finally {console.error=old}return r}
const admin={id:'other',role:'admin',active:true,email:'other@example.com'};
const other={id:'other',email:'other@example.com',email_confirmed_at:'2026-01-01'};
for (const [action,method,body] of [['member','PATCH',{id:'target',role:'admin'}],['invite','POST',{email:'x@example.com',role:'admin',password:'password123'}],['set-permission','POST',{role:'sales',permission:'team.manage',allowed:true}],['reset-password','POST',{id:'target',password:'password123'}]]) {
 const before=writes;const r=await call(other,admin,req(action,method,body));assert.equal(r.statusCode,403,action);assert.equal(writes,before);
}
const ceo={id:'ceo',email:CEO,email_confirmed_at:'2026-01-01'};
const profile={id:'ceo',role:'admin',active:true,email:CEO};
assert.equal((await call({...ceo,email_confirmed_at:null},profile,req('member','PATCH',{id:'target',role:'admin'}))).statusCode,403);
assert.equal((await call(ceo,{...profile,role:'sales'},req('member','PATCH',{id:'target',role:'admin'}))).statusCode,403);
assert.equal((await call(ceo,profile,req('member','PATCH',{id:'target',role:'manager'}))).statusCode,200);
assert.equal((await call(other,admin,req('me','PATCH',{full_name:'Staff Name',role:'admin'}))).statusCode,200);
for(const file of ['supabase/schema.sql','supabase/SETUP-EVERYTHING.sql','supabase/MIGRATION-2026-11-profile-access.sql']) {
 const sql=readFileSync(file,'utf8');assert.match(sql,/revoke update on table public\.profiles from anon, authenticated/i);assert.doesNotMatch(sql,/create policy "staff update own profile"/i);
}
console.log('CEO-only team changes, safe own profile edits, and schema protections pass.');
