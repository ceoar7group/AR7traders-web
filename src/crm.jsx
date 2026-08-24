import React,{useEffect,useMemo,useState} from 'react';
import {createClient} from '@supabase/supabase-js';
import {LayoutDashboard,Users,UserRound,CarFront,FileText,Ship,CheckSquare,Activity,LogOut,Search,Plus,Mail,MessageCircle,ChevronRight,Clock3,DollarSign,TrendingUp,BadgeCheck,X,Save,RefreshCw,Menu,ShieldCheck,Database} from 'lucide-react';
import './crm.css';

const SUPABASE_URL=import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY=import.meta.env.VITE_SUPABASE_ANON_KEY;
const DEMO=import.meta.env.VITE_CRM_DEMO==='true';
const supabase=SUPABASE_URL&&SUPABASE_ANON_KEY?createClient(SUPABASE_URL,SUPABASE_ANON_KEY):null;

const seed={
 leads:[
  {id:'l1',name:'Ahmed Khan',email:'ahmed@example.com',phone:'+92 300 1234567',country:'Pakistan',vehicle_interest:'Toyota Land Cruiser 2022+',source:'Website',status:'qualified',budget:65000,assigned_to:'Sara Malik',next_follow_up:'2026-08-25',created_at:'2026-08-23T08:30:00Z'},
  {id:'l2',name:'Daniel Mwangi',email:'daniel@example.com',phone:'+254 711 223344',country:'Kenya',vehicle_interest:'Lexus RX 450h',source:'WhatsApp',status:'new',budget:42000,assigned_to:'Omar Ali',next_follow_up:'2026-08-24',created_at:'2026-08-23T11:10:00Z'},
  {id:'l3',name:'James Wilson',email:'james@example.com',phone:'+44 7700 900123',country:'United Kingdom',vehicle_interest:'Audi R8 V10',source:'Referral',status:'proposal',budget:165000,assigned_to:'Sara Malik',next_follow_up:'2026-08-26',created_at:'2026-08-22T15:40:00Z'},
  {id:'l4',name:'Fatima Noor',email:'fatima@example.com',phone:'+971 50 1234567',country:'UAE',vehicle_interest:'Rolls-Royce Cullinan',source:'Website',status:'negotiation',budget:220000,assigned_to:'Omar Ali',next_follow_up:'2026-08-24',created_at:'2026-08-21T09:20:00Z'}
 ],
 customers:[
  {id:'c1',name:'Imran Khan',email:'imran@example.com',phone:'+92 333 7654321',country:'Pakistan',total_spend:128500,vehicles_bought:2,status:'active',created_at:'2026-05-10T09:00:00Z'},
  {id:'c2',name:'Mary Wanjiku',email:'mary@example.com',phone:'+254 722 445566',country:'Kenya',total_spend:43800,vehicles_bought:1,status:'active',created_at:'2026-06-18T09:00:00Z'},
  {id:'c3',name:'Oliver Brown',email:'oliver@example.com',phone:'+44 7911 123456',country:'United Kingdom',total_spend:189000,vehicles_bought:1,status:'vip',created_at:'2026-04-02T09:00:00Z'}
 ],
 vehicles:[
  {id:'v1',stock_no:'AR7-260184',make:'Audi',model:'R8 V10',year:2021,price:155000,status:'available',location:'Tokyo',steering:'RHD'},
  {id:'v2',stock_no:'AR7-260185',make:'Lexus',model:'LC 500',year:2021,price:95000,status:'reserved',location:'Yokohama',steering:'LHD'},
  {id:'v3',stock_no:'AR7-260186',make:'Rolls-Royce',model:'Ghost',year:2023,price:189000,status:'available',location:'Yokohama',steering:'RHD'},
  {id:'v4',stock_no:'AR7-260187',make:'Toyota',model:'Land Cruiser ZX',year:2022,price:58900,status:'in_transit',location:'Yokohama',steering:'RHD'}
 ],
 quotes:[
  {id:'q1',quote_no:'Q-2026-1042',customer_name:'Ahmed Khan',vehicle:'Toyota Land Cruiser ZX',amount:62750,status:'sent',valid_until:'2026-08-30',created_at:'2026-08-23T10:00:00Z'},
  {id:'q2',quote_no:'Q-2026-1041',customer_name:'James Wilson',vehicle:'Audi R8 V10',amount:161800,status:'accepted',valid_until:'2026-08-28',created_at:'2026-08-22T10:00:00Z'},
  {id:'q3',quote_no:'Q-2026-1039',customer_name:'Fatima Noor',vehicle:'Rolls-Royce Cullinan',amount:214500,status:'draft',valid_until:'2026-09-01',created_at:'2026-08-21T10:00:00Z'}
 ],
 shipments:[
  {id:'s1',tracking_no:'AR7-260184',customer_name:'Imran Khan',vehicle:'Toyota Land Cruiser ZX',origin:'Yokohama',destination:'Karachi',vessel:'AR7 Valiant',status:'at_sea',eta:'2026-09-08',progress:68},
  {id:'s2',tracking_no:'AR7-260191',customer_name:'Mary Wanjiku',vehicle:'Lexus RX 450h',origin:'Kobe',destination:'Mombasa',vessel:'Pacific Trader',status:'loaded',eta:'2026-09-16',progress:42},
  {id:'s3',tracking_no:'AR7-260198',customer_name:'Oliver Brown',vehicle:'Rolls-Royce Ghost',origin:'Tokyo',destination:'Southampton',vessel:'Ever Glory',status:'booking',eta:'2026-10-02',progress:18}
 ],
 tasks:[
  {id:'t1',title:'Follow up with Ahmed on Land Cruiser quote',owner:'Sara Malik',priority:'high',status:'open',due_date:'2026-08-24'},
  {id:'t2',title:'Upload translated auction sheet for Lot 38214',owner:'Omar Ali',priority:'medium',status:'in_progress',due_date:'2026-08-24'},
  {id:'t3',title:'Confirm Karachi vessel booking',owner:'Sara Malik',priority:'high',status:'open',due_date:'2026-08-25'},
  {id:'t4',title:'Send arrival documents to UK customer',owner:'Omar Ali',priority:'low',status:'done',due_date:'2026-08-23'}
 ],
 activities:[
  {id:'a1',action:'Quote Q-2026-1042 sent to Ahmed Khan',actor:'Sara Malik',entity_type:'quote',created_at:'2026-08-23T12:42:00Z'},
  {id:'a2',action:'New website lead received from Kenya',actor:'System',entity_type:'lead',created_at:'2026-08-23T11:10:00Z'},
  {id:'a3',action:'Shipment AR7-260184 milestone updated to At Sea',actor:'Omar Ali',entity_type:'shipment',created_at:'2026-08-23T09:18:00Z'},
  {id:'a4',action:'Audi R8 inventory record updated',actor:'Sara Malik',entity_type:'vehicle',created_at:'2026-08-23T08:33:00Z'}
 ]
};

const tabs=[
 ['dashboard','Overview',LayoutDashboard],['leads','Leads',Users],['customers','Customers',UserRound],['vehicles','Inventory',CarFront],['quotes','Quotes',FileText],['shipments','Shipments',Ship],['tasks','Tasks',CheckSquare],['activities','Activity',Activity]
];
const configs={
 leads:{title:'Sales leads',subtitle:'Capture, qualify and convert enquiries.',fields:[['name','Name'],['email','Email'],['phone','Phone'],['country','Country'],['vehicle_interest','Vehicle interest'],['source','Source'],['status','Status'],['budget','Budget','number'],['assigned_to','Assigned agent'],['next_follow_up','Next follow-up','date']]},
 customers:{title:'Customers',subtitle:'Buyer profiles and lifetime value.',fields:[['name','Name'],['email','Email'],['phone','Phone'],['country','Country'],['status','Status'],['total_spend','Total spend','number'],['vehicles_bought','Vehicles bought','number']]},
 vehicles:{title:'Vehicle inventory',subtitle:'Showroom, auction and Japan stock.',fields:[['stock_no','Stock no.'],['make','Make'],['model','Model'],['year','Year','number'],['price','Price','number'],['status','Status'],['location','Location'],['steering','Steering']]},
 quotes:{title:'Quotes',subtitle:'FOB, CIF and landed-cost proposals.',fields:[['quote_no','Quote no.'],['customer_name','Customer'],['vehicle','Vehicle'],['amount','Amount','number'],['status','Status'],['valid_until','Valid until','date']]},
 shipments:{title:'Shipments',subtitle:'Port-to-port delivery milestones.',fields:[['tracking_no','Tracking no.'],['customer_name','Customer'],['vehicle','Vehicle'],['origin','Origin'],['destination','Destination'],['vessel','Vessel'],['status','Status'],['eta','ETA','date'],['progress','Progress','number']]},
 tasks:{title:'Tasks',subtitle:'Follow-ups and operational work.',fields:[['title','Task'],['owner','Owner'],['priority','Priority'],['status','Status'],['due_date','Due date','date']]}
};
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n)||0);
const pretty=s=>(s||'').replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase());
const date=s=>s?new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(s)):'—';

function demoRead(entity){const k='ar7-crm-'+entity;const stored=localStorage.getItem(k);return stored?JSON.parse(stored):seed[entity]||[]}
function demoWrite(entity,rows){localStorage.setItem('ar7-crm-'+entity,JSON.stringify(rows))}

async function api(entity,token,options={}){
 const res=await fetch('/api/crm?entity='+encodeURIComponent(entity),{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(options.headers||{})}});
 if(!res.ok)throw new Error((await res.json().catch(()=>({}))).error||'Request failed');return res.json();
}

export default function CrmApp(){
 const [session,setSession]=useState(null),[profile,setProfile]=useState(null),[loading,setLoading]=useState(true),[tab,setTab]=useState('dashboard'),[rows,setRows]=useState({}),[query,setQuery]=useState(''),[editor,setEditor]=useState(null),[notice,setNotice]=useState(''),[mobile,setMobile]=useState(false);
 useEffect(()=>{
  if(DEMO){setSession({access_token:'demo',user:{email:'admin@ar7traders.com'}});setProfile({full_name:'Demo Administrator',role:'admin'});setLoading(false);return}
  if(!supabase){setLoading(false);return}
  supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_,s)=>setSession(s));return()=>subscription.unsubscribe()
 },[]);
 useEffect(()=>{if(!session)return;loadAll()},[session]);
 async function loadAll(){setLoading(true);try{if(DEMO){const out={};Object.keys(seed).forEach(k=>out[k]=demoRead(k));setRows(out)}else{const me=await api('me',session.access_token);setProfile(me);const entries=await Promise.all(Object.keys(seed).map(async k=>[k,await api(k,session.access_token)]));setRows(Object.fromEntries(entries))}}catch(e){setNotice(e.message)}finally{setLoading(false)}}
 async function save(entity,data){try{if(DEMO){const list=rows[entity]||[];const item={...data,id:data.id||crypto.randomUUID(),created_at:data.created_at||new Date().toISOString()};const next=data.id?list.map(x=>x.id===data.id?item:x):[item,...list];demoWrite(entity,next);setRows(v=>({...v,[entity]:next}))}else{const result=await api(entity,session.access_token,{method:data.id?'PATCH':'POST',body:JSON.stringify(data)});setRows(v=>({...v,[entity]:data.id?v[entity].map(x=>x.id===result.id?result:x):[result,...(v[entity]||[])]}))}setEditor(null);setNotice('Saved successfully')}catch(e){setNotice(e.message)}}
 async function signOut(){if(DEMO){location.hash='home';return}await supabase.auth.signOut();setSession(null)}
 if(loading&&!session)return <div className="crm-boot"><RefreshCw/><span>Loading AR7 CRM…</span></div>;
 if(!supabase&&!DEMO)return <CrmSetup/>;
 if(!session)return <CrmLogin/>;
 const current=configs[tab];const data=rows[tab]||[];const filtered=data.filter(x=>JSON.stringify(x).toLowerCase().includes(query.toLowerCase()));
 return <div className="crm-shell">
  <aside className={'crm-side '+(mobile?'open':'')}><div className="crm-brand"><img src="/assets/ar7-mark.png"/><div><b>AR7 CRM</b><small>COMMAND CENTER</small></div><button onClick={()=>setMobile(false)}><X/></button></div><nav>{tabs.map(([id,label,I])=><button key={id} className={tab===id?'active':''} onClick={()=>{setTab(id);setMobile(false);setQuery('')}}><I/><span>{label}</span>{id==='leads'&&<em>{(rows.leads||[]).filter(x=>x.status==='new').length}</em>}</button>)}</nav><div className="crm-user"><span>{(profile?.full_name||session.user?.email||'AR7').slice(0,2).toUpperCase()}</span><div><b>{profile?.full_name||session.user?.email}</b><small>{pretty(profile?.role||'admin')}</small></div><button onClick={signOut} title="Sign out"><LogOut/></button></div></aside>
  {mobile&&<div className="crm-side-shade" onClick={()=>setMobile(false)}/>}<main className="crm-main"><header className="crm-top"><button className="crm-menu" onClick={()=>setMobile(true)}><Menu/></button><div><small>AR7 TRADERS / {tab.toUpperCase()}</small><h1>{tab==='dashboard'?'Good evening, '+(profile?.full_name?.split(' ')[0]||'Team'):current?.title||'Activity log'}</h1></div><div className="crm-live"><i/> LIVE OPERATIONS</div><a className="crm-site" href="#home">View website <ChevronRight/></a></header>
  {notice&&<div className="crm-notice" onClick={()=>setNotice('')}>{notice}<X/></div>}
  {tab==='dashboard'?<Dashboard rows={rows} setTab={setTab}/>:tab==='activities'?<ActivityView rows={rows.activities||[]}/>:<><div className="crm-page-head"><div><p>{current.subtitle}</p></div><div className="crm-tools"><label><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={'Search '+tab}/></label><button onClick={loadAll}><RefreshCw/></button><button className="crm-add" onClick={()=>setEditor({entity:tab,data:{}})}><Plus/> Add {tab.slice(0,-1)}</button></div></div><EntityView entity={tab} rows={filtered} onEdit={data=>setEditor({entity:tab,data})}/></>}
  </main>{editor&&<Editor entity={editor.entity} data={editor.data} onClose={()=>setEditor(null)} onSave={x=>save(editor.entity,x)}/>}</div>
}

function CrmLogin(){const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);async function submit(e){e.preventDefault();setBusy(true);setError('');const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setError(error.message);setBusy(false)}return <div className="crm-login"><div className="crm-login-visual"><img src="/assets/ar7-logo.png"/><div><small>AR7 OPERATIONS</small><h1>Every lead.<br/>Every vehicle.<br/><em>One command center.</em></h1><p>Secure sales and export operations for the AR7 team.</p></div></div><form onSubmit={submit}><div className="crm-login-mark"><ShieldCheck/><span>AUTHORIZED TEAM ACCESS</span></div><h2>Welcome back.</h2><p>Sign in with your AR7 staff account.</p>{error&&<div className="crm-error">{error}</div>}<label>EMAIL<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>PASSWORD<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button disabled={busy}>{busy?'Signing in…':'Sign in securely'} <ChevronRight/></button><small>Protected by Supabase Auth · Admin and Sales roles</small></form></div>}
function CrmSetup(){return <div className="crm-setup"><Database/><span>SUPABASE CONNECTION REQUIRED</span><h1>CRM is ready to connect.</h1><p>Add the Supabase environment variables in Vercel to activate secure authentication and persistent records.</p><div><code>VITE_SUPABASE_URL</code><code>VITE_SUPABASE_ANON_KEY</code><code>SUPABASE_SERVICE_ROLE_KEY</code></div><a href="#home">Return to website</a></div>}

function Dashboard({rows,setTab}){const leads=rows.leads||[],quotes=rows.quotes||[],shipments=rows.shipments||[],tasks=rows.tasks||[];const pipeline=leads.reduce((a,x)=>a+(Number(x.budget)||0),0),won=quotes.filter(x=>x.status==='accepted').reduce((a,x)=>a+(Number(x.amount)||0),0);return <div className="crm-dashboard"><div className="crm-kpis">{[[Users,'Active leads',leads.length,'+12% this month'],[DollarSign,'Pipeline value',money(pipeline),'Across all open leads'],[TrendingUp,'Accepted quotes',money(won),quotes.filter(x=>x.status==='accepted').length+' converted'],[Ship,'Vehicles in transit',shipments.length,'Across '+new Set(shipments.map(x=>x.destination)).size+' destinations']].map(([I,l,v,s])=><article key={l}><i><I/></i><span>{l}</span><b>{v}</b><small>{s}</small></article>)}</div><div className="crm-dash-grid"><section className="crm-panel crm-pipeline"><div className="crm-panel-head"><div><small>SALES PIPELINE</small><h3>Lead stages</h3></div><button onClick={()=>setTab('leads')}>View all <ChevronRight/></button></div><div className="pipeline-bars">{['new','qualified','proposal','negotiation'].map(status=>{const list=leads.filter(x=>x.status===status);return <div key={status}><span><b>{pretty(status)}</b><em>{list.length}</em></span><i><u style={{width:Math.max(8,list.length/Math.max(1,leads.length)*100)+'%'}}/></i><small>{money(list.reduce((a,x)=>a+(Number(x.budget)||0),0))}</small></div>})}</div></section><section className="crm-panel"><div className="crm-panel-head"><div><small>FOLLOW UPS</small><h3>Today & upcoming</h3></div><button onClick={()=>setTab('tasks')}>Tasks <ChevronRight/></button></div><div className="crm-task-list">{tasks.slice(0,5).map(x=><div key={x.id}><i className={x.priority}/><span><b>{x.title}</b><small><Clock3/> {date(x.due_date)} · {x.owner}</small></span><em className={'crm-status '+x.status}>{pretty(x.status)}</em></div>)}</div></section><section className="crm-panel crm-span"><div className="crm-panel-head"><div><small>LIVE SHIPMENTS</small><h3>Vehicles in motion</h3></div><button onClick={()=>setTab('shipments')}>Operations <ChevronRight/></button></div><div className="crm-shipment-grid">{shipments.map(x=><article key={x.id}><span><b>{x.tracking_no}</b><em className={'crm-status '+x.status}>{pretty(x.status)}</em></span><h4>{x.vehicle}</h4><p>{x.origin} <i/> {x.destination}</p><div><u style={{width:x.progress+'%'}}/></div><small>{x.vessel} · ETA {date(x.eta)}</small></article>)}</div></section></div></div>}

function EntityView({entity,rows,onEdit}){if(!rows.length)return <div className="crm-empty"><Search/><h3>No records found</h3><p>Try another search or add a new record.</p></div>;if(entity==='leads')return <div className="crm-lead-grid">{rows.map(x=><article key={x.id}><div><span>{x.name.slice(0,2).toUpperCase()}</span><em className={'crm-status '+x.status}>{pretty(x.status)}</em></div><h3>{x.name}</h3><p>{x.vehicle_interest}</p><dl><div><dt>Market</dt><dd>{x.country}</dd></div><div><dt>Budget</dt><dd>{money(x.budget)}</dd></div><div><dt>Owner</dt><dd>{x.assigned_to}</dd></div><div><dt>Follow-up</dt><dd>{date(x.next_follow_up)}</dd></div></dl><footer><a href={'mailto:'+x.email}><Mail/></a><a href={'https://wa.me/'+(x.phone||'').replace(/\D/g,'')} target="_blank" rel="noreferrer"><MessageCircle/></a><button onClick={()=>onEdit(x)}>Open lead <ChevronRight/></button></footer></article>)}</div>;
 return <div className="crm-table-wrap"><table><thead><tr>{tableColumns(entity).map(x=><th key={x}>{pretty(x)}</th>)}<th/></tr></thead><tbody>{rows.map(row=><tr key={row.id}>{tableColumns(entity).map(k=><td key={k}>{renderCell(k,row[k])}</td>)}<td><button onClick={()=>onEdit(row)}>Edit</button></td></tr>)}</tbody></table></div>}
function tableColumns(e){return {customers:['name','country','status','total_spend','vehicles_bought'],vehicles:['stock_no','make','model','year','price','status','steering'],quotes:['quote_no','customer_name','vehicle','amount','status','valid_until'],shipments:['tracking_no','vehicle','destination','vessel','status','eta','progress'],tasks:['title','owner','priority','status','due_date']}[e]||[]}
function renderCell(k,v){if(['price','amount','total_spend'].includes(k))return money(v);if(['valid_until','eta','due_date'].includes(k))return date(v);if(['status','priority'].includes(k))return <em className={'crm-status '+v}>{pretty(v)}</em>;if(k==='progress')return <span className="table-progress"><i style={{width:v+'%'}}/><b>{v}%</b></span>;return v??'—'}
function ActivityView({rows}){return <div className="crm-activity"><div className="crm-page-head"><p>A complete audit trail across sales and operations.</p></div>{rows.map((x,i)=><article key={x.id}><i><Activity/></i><div><b>{x.action}</b><span>{x.actor} · {new Date(x.created_at).toLocaleString()}</span></div><em>{pretty(x.entity_type)}</em>{i<rows.length-1&&<u/>}</article>)}</div>}
function Editor({entity,data,onClose,onSave}){const cfg=configs[entity], [form,setForm]=useState({...data});return <div className="crm-modal-bg" onMouseDown={onClose}><form className="crm-editor" onMouseDown={e=>e.stopPropagation()} onSubmit={e=>{e.preventDefault();onSave(form)}}><header><div><small>{data.id?'EDIT RECORD':'NEW RECORD'}</small><h2>{data.id?'Update':'Add'} {entity.slice(0,-1)}</h2></div><button type="button" onClick={onClose}><X/></button></header><div className="crm-editor-fields">{cfg.fields.map(([key,label,type='text'])=><label key={key}>{label}<input type={type} value={form[key]??''} onChange={e=>setForm(v=>({...v,[key]:type==='number'?Number(e.target.value):e.target.value}))} required={['name','title','stock_no','quote_no','tracking_no'].includes(key)}/></label>)}</div><footer><button type="button" onClick={onClose}>Cancel</button><button className="save"><Save/> Save record</button></footer></form></div>}
