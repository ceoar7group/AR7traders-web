import assert from 'node:assert/strict';
import {customerLogin} from '../api/customer-admin.js';
const cust={auth_user_id:'c1',email:'customer@example.com'};
function db(staff=null,error=null){return {from(name){assert.equal(name,'profiles');return {select(){return {eq(key,id){assert.equal(key,'id');assert.equal(id,'c1');return {maybeSingle:async()=>({data:staff,error})}}}}}}}}
function admin(user,error=null){return {auth:{admin:{getUserById:async id=>({data:{user},error})}}}}
const user={id:'c1',email:'customer@example.com',email_confirmed_at:'now'};
assert.equal((await customerLogin(db(),admin(user),cust)).id,'c1');
await assert.rejects(customerLogin(db(),admin(user),{email:user.email}),/no linked/);
await assert.rejects(customerLogin(db({id:'c1'}),admin(user),cust),/Staff accounts/);
await assert.rejects(customerLogin(db(null,new Error('db')),admin(user),cust),/Could not verify/);
await assert.rejects(customerLogin(db(),admin({...user,email:'ceoar7grouplimited@gmail.com'}),cust),/does not match/);
await assert.rejects(customerLogin(db(),admin({...user,email_confirmed_at:null}),cust),/confirmed/);
await assert.rejects(customerLogin(db(),admin(null,new Error('missing')),cust),/confirmed/);
console.log('Customer login cannot target unlinked, unconfirmed, mismatched or staff accounts.');
// Exercise the endpoint, including denial before any Auth link is created.
const {default:handler}=await import('../api/customer-admin.js');
async function endpoint(customer,staff,authUser){
 let links=0;
 const database={from(name){
  if(name==='customers')return {select(){return {eq(){return {single:async()=>({data:customer,error:null})}}}}};
  if(name==='profiles')return {select(){return {eq(){return {maybeSingle:async()=>({data:staff,error:null})}}}}};
  if(name==='activities')return {insert:async()=>({error:null})};
  throw new Error(name);
 }};
 const auth={auth:{admin:{getUserById:async()=>({data:{user:authUser},error:null}),generateLink:async()=>{links++;return {data:{properties:{action_link:'test-link'}},error:null}}}}};
 const response={status(n){this.code=n;return this},setHeader(){return this},end(s){this.data=JSON.parse(s)}};
 const old=console.error;console.error=()=>{};
 try{await handler({method:'POST',query:{action:'login-as'},body:{customer_id:'customer'}},response,{getUser:async()=>({user:{id:'operator'},profile:{role:'admin'},db:database}),admin:auth})}finally{console.error=old}
 return {response,links};
}
let outcome=await endpoint({email:'ceoar7grouplimited@gmail.com'},null,null);
assert.equal(outcome.response.code,400);assert.equal(outcome.links,0);
outcome=await endpoint({auth_user_id:'c1',email:'ceoar7grouplimited@gmail.com'},{id:'c1'},{id:'c1',email:'ceoar7grouplimited@gmail.com',email_confirmed_at:'now'});
assert.equal(outcome.response.code,403);assert.equal(outcome.links,0);
outcome=await endpoint(cust,null,user);
assert.equal(outcome.response.code,200);assert.equal(outcome.links,1);
console.log('Customer login endpoint refuses CEO impersonation before creating a link.');
