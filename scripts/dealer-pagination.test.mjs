import assert from 'node:assert/strict';
import handler from '../api/goonet-stock.js';
import {readAllDealerPages, DEALER_PAGE_SIZE, DEALER_MAX_PAGES} from '../api/_dealer-pages.js';
import {fetchDealerStock} from '../src/dealer-feed.js';

const seed = Array.from({length:1201}, (_,i) => ({id:String(i).padStart(5,'0'), imported_at:'2026-11-01', available:true, stock_no:'JP-'+i}));
seed.push({id:'unavailable',available:false});
function dbFor(rows, failAt = -1) {
  return {from(name) {
    assert.equal(name, 'japan_dealer_stock');
    let filters=[], orders=[], start=0, end=Infinity;
    const q={select(){return q}, eq(k,v){filters.push(r=>r[k]===v);return q},
      order(k,opts){orders.push([k,opts]);return q}, limit(n){end=n-1;return q},
      range(a,b){start=a;end=b;return q},
      then(resolve){
        if(start===failAt)return resolve({data:null,error:{message:'page failed'}});
        let data=rows.filter(r=>filters.every(f=>f(r))).slice().sort((a,b)=>{
          for(const [k,o] of orders){let n=String(a[k]??'').localeCompare(String(b[k]??'')); if(n)return o.ascending===false?-n:n;}return 0;
        });
        return resolve({data:data.slice(start,end+1),error:null});
      }};return q;
  }};
}
function response(){return {statusCode:0,headers:{},status(n){this.statusCode=n;return this},setHeader(k,v){this.headers[k.toLowerCase()]=v;return this},end(s){this.body=JSON.parse(s)}};}
async function request(query, db=dbFor(seed)){const res=response();await handler({method:'GET',query},res,{db});return res;}
const legacy=await request({});
assert.equal(legacy.body.length,1000,'legacy API remains an array capped at 1000');
const first=await request({page:'0'}), third=await request({page:'2'});
assert.equal(first.body.length,500);assert.equal(third.body.length,201);
assert.equal(first.headers['cache-control'],'no-store');
assert.equal((await request({page:'-1'})).statusCode,400);
assert.equal((await request({page:'1e2'})).statusCode,400);
assert.equal((await request({page:'21'})).statusCode,400);
assert.equal((await request({page:'1'},dbFor(seed,500))).statusCode,500);
const all=await readAllDealerPages(dbFor(seed));
assert.equal(all.length,1201);
assert.equal(new Set(all.map(r=>r.id)).size,1201,'no duplicates at page boundaries');
assert.deepEqual(all.slice(1000),third.body);
await assert.rejects(readAllDealerPages(dbFor(seed,500)), /page failed/);
const fetcher=async url=>{const page=new URL(url,'https://example.com').searchParams.get('page');const r=await request({page});return {ok:r.statusCode===200,json:async()=>r.body}};
assert.deepEqual(await fetchDealerStock(fetcher),all,'browser hydrates every page');
await assert.rejects(fetchDealerStock(async url => url.endsWith('page=1') ? {ok:false} : fetcher(url)),/unavailable/);
const over=Array.from({length:DEALER_PAGE_SIZE*(DEALER_MAX_PAGES+1)},(_,i)=>({id:String(i).padStart(6,'0'),available:true}));
await assert.rejects(readAllDealerPages(dbFor(over)),/limit/);
await assert.rejects(fetchDealerStock(async()=>({ok:true,json:async()=>over.slice(0,DEALER_PAGE_SIZE)})),/limit/);
console.log('Dealer pagination: all assertions passed');
