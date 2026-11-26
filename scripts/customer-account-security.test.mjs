import assert from 'node:assert/strict';
import handler from '../api/my-account.js';

const confirmed = { id:'user-a', email:'buyer@example.com', email_confirmed_at:'2026-01-01T00:00:00Z' };
function database(initial, opts={}) {
  const customers=initial.map(r=>({...r}));
  const calls=[];
  return {customers,calls,from(table){
    let filters=[], update=null, one=false, count=null, pattern=null;
    const q={
      select(cols,options){if(options?.count) count=true;return q},
      eq(k,v){filters.push(r=>r[k]===v);return q},
      is(k,v){filters.push(r=>r[k]===v || (v===null && r[k]===undefined));return q},
      ilike(k,v){pattern=v;calls.push({table,pattern:v}); const exact=v.replace(/\\([\\%_])/g,'$1');filters.push(r=>String(r[k]??'').toLowerCase()===exact.toLowerCase());return q},
      limit(){return q},order(){return q},single(){one=true;return q},
      update(p){update=p;return q},
      then(resolve){
        if(table==='customers'){
          if(update?.auth_user_id && opts.race)customers[0].auth_user_id='other-user';
          let matches=customers.filter(r=>filters.every(f=>f(r)));
          if(update?.auth_user_id && opts.failLink)return resolve({data:null,error:{message:'write failed'}});
          if(update) matches.forEach(r=>Object.assign(r,update));
          return resolve({data:one ? matches[0]||null : matches, error:null});
        }
        if(table==='order_balances')return resolve({data:(opts.orders||[]).filter(r=>filters.every(f=>f(r))),error:null});
        if(table==='payment_balances')return resolve({data:(opts.payments||[]).filter(r=>filters.every(f=>f(r))),error:null});
        if(table==='shipments')throw Error('account must not access shipments by name');
        if(table==='leads')return resolve({count:count?0:null,data:[],error:null});
        throw Error('unexpected '+table);
      }
    };return q;
  }};
}
async function get(db,user){const res={statusCode:0,headers:{},status(n){this.statusCode=n;return this},setHeader(k,v){this.headers[k.toLowerCase()]=v;return this},end(s){this.body=JSON.parse(s)}};await handler({method:'GET',query:{},headers:{}},res,{db,user});return res;}
const candidate={id:'c1',name:'Alex',email:'buyer@example.com',auth_user_id:null,referral_code:'AR7-TEST1'};
let db=database([candidate]);
let res=await get(db,{...confirmed,email_confirmed_at:null});
assert.equal(res.headers['cache-control'],'private, no-store','account responses must not be cached across users');
assert.equal(res.body.customer,null,'unconfirmed email cannot claim record');
assert.equal(db.customers[0].auth_user_id,null);
db=database([candidate]);res=await get(db,confirmed);
assert.equal(res.body.customer.id,'c1');assert.equal(db.customers[0].auth_user_id,'user-a');
db=database([candidate],{failLink:true});res=await get(db,confirmed);
assert.equal(res.body.customer,null,'failed link cannot disclose candidate');
db=database([candidate],{race:true});res=await get(db,confirmed);
assert.equal(res.body.customer,null,'concurrent claim never leaks candidate');
assert.equal(db.customers[0].auth_user_id,'other-user','concurrent claim is never overwritten');
db=database([candidate,{...candidate,id:'c2'}]);res=await get(db,confirmed);
assert.equal(res.body.customer,null,'ambiguous email does not pick a customer');
assert.ok(db.customers.every(c=>c.auth_user_id===null));
db=database([{...candidate,email:'literal_1%test@example.com'}]);
res=await get(db,{...confirmed,email:'literal_1%test@example.com'});
assert.equal(res.body.customer.id,'c1');
assert.equal(db.calls[0].pattern,'literal\\_1\\%test@example.com','email LIKE wildcard characters are escaped');
db=database([{...candidate,auth_user_id:'user-a'}],{orders:[{id:'o1',customer_id:'c1',vehicle:'Toyota',amount:100,paid:30,balance_due:70,notes:'private staff note',employee_id:'staff'},{id:'o2',customer_id:'c2',amount:999}],payments:[{id:'p1',customer_id:'c1',amount:30,note:'private note'}]});
res=await get(db,confirmed);
assert.equal(res.body.orders.length,1);assert.equal(res.body.totals.due,70);
assert.ok(!('notes' in res.body.orders[0]) && !('employee_id' in res.body.orders[0]));
assert.ok(!('note' in res.body.payments[0]));
assert.deepEqual(res.body.shipments,[],'same-name shipments cannot be discovered from the account');
// Google profile completion must validate contact details and update only the
// authenticated customer's record. The auth identity is created by Supabase.
async function complete(db,user,body){
 const res={statusCode:0,headers:{},status(n){this.statusCode=n;return this},setHeader(k,v){this.headers[k.toLowerCase()]=v;return this},end(s){this.body=JSON.parse(s)}};
 const old=console.error;console.error=()=>{};
 try{await handler({method:'PATCH',query:{'complete-profile':'1'},headers:{},body},res,{db,user});}finally{console.error=old}
 return res;
}
db=database([{...candidate,auth_user_id:'user-a'},{...candidate,id:'c2',auth_user_id:'user-b'}]);
res=await complete(db,confirmed,{name:'Alex Buyer',phone:'abc',country:'Pakistan'});
assert.equal(res.statusCode,400);assert.equal(db.customers[0].phone,undefined);
res=await complete(db,confirmed,{name:'Alex Buyer',phone:'+92 300 1234567',country:''});
assert.equal(res.statusCode,400);
res=await complete(db,confirmed,{name:'Alex Buyer',phone:'+92 300 1234567',country:'Pakistan'});
assert.equal(res.statusCode,200);assert.equal(db.customers[0].phone,'+92 300 1234567');assert.equal(db.customers[1].phone,undefined);
res=await get(db,confirmed);assert.equal(res.body.customer.phone,'+92 300 1234567');
console.log('Customer account isolation: all assertions passed');
