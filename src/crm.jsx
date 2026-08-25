import React,{useEffect,useMemo,useState} from 'react';
import {supabase} from './supabase-client.js';
import {LayoutDashboard,Users,UserRound,CarFront,FileText,Ship,CheckSquare,Activity,LogOut,Search,Plus,Mail,MessageCircle,ChevronRight,Clock3,DollarSign,TrendingUp,BadgeCheck,X,Save,RefreshCw,Menu,ShieldCheck,Database,Trash2,Globe,Newspaper,UserCog,ShieldAlert,Wallet,Settings,KeyRound,LogIn,ArrowLeft,Check,Ban,Send,Link2,Phone,Briefcase} from 'lucide-react';
import siteSeed from './site-content.seed.json';
import './crm.css';

const DEMO=import.meta.env.VITE_CRM_DEMO==='true';

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
 ['dashboard','Overview',LayoutDashboard],['leads','Leads',Users],['customers','Customers',UserRound],
 ['accounts','Customer accounts',Wallet],
 ['vehicles','Inventory',CarFront],['quotes','Quotes',FileText],['shipments','Shipments',Ship],['tasks','Tasks',CheckSquare],
 ['listings','Website cars',Globe],['routes','Shipping routes',Ship],['articles','News & guides',Newspaper],
 ['approvals','Approvals',ShieldAlert],['team','Team & permissions',UserCog],['people','People & payroll',Briefcase],['settings','Website settings',Settings],
 ['activities','Activity log',Activity]
];
const PERM_LABELS={'leads.write':'Add / edit leads','customers.write':'Add / edit customers','vehicles.write':'Add / edit inventory','orders.write':'Add / edit orders','payments.write':'Record & apply payments','site.write':'Edit the public website','team.manage':'Manage team members','approvals.decide':'Approve or reject requests','delete.direct':'Delete without approval','customer.login_as':'Open a customer account','settings.write':'Change website settings','hr.view':'View staff & performance','hr.manage':'Add / edit staff records','payroll.view':'View salaries & payslips','payroll.manage':'Run payroll & mark paid'};
const ROLE_LIST=['admin','manager','sales','accounts','viewer'];
// Sections that publish to the live public website (vs. internal CRM records).
const SITE_ENTITIES=['listings','routes','articles'];
const configs={
 leads:{title:'Sales leads',subtitle:'Capture, qualify and convert enquiries.',fields:[['name','Name'],['email','Email'],['phone','Phone'],['country','Country'],['vehicle_interest','Vehicle interest'],['source','Source'],['status','Status'],['budget','Budget','number'],['assigned_to','Assigned agent'],['next_follow_up','Next follow-up','date']]},
 customers:{title:'Customers',subtitle:'Buyer profiles and lifetime value.',fields:[['name','Name'],['email','Email'],['phone','Phone'],['country','Country'],['status','Status'],['total_spend','Total spend','number'],['vehicles_bought','Vehicles bought','number']]},
 vehicles:{title:'Vehicle inventory',subtitle:'Showroom, auction and Japan stock.',fields:[['stock_no','Stock no.'],['make','Make'],['model','Model'],['year','Year','number'],['price','Price','number'],['status','Status'],['location','Location'],['steering','Steering']]},
 quotes:{title:'Quotes',subtitle:'FOB, CIF and landed-cost proposals.',fields:[['quote_no','Quote no.'],['customer_name','Customer'],['vehicle','Vehicle'],['amount','Amount','number'],['status','Status'],['valid_until','Valid until','date']]},
 shipments:{title:'Shipments',subtitle:'Port-to-port delivery milestones.',fields:[['tracking_no','Tracking no.'],['customer_name','Customer'],['vehicle','Vehicle'],['origin','Origin'],['destination','Destination'],['vessel','Vessel'],['status','Status'],['eta','ETA','date'],['progress','Progress','number']]},
 listings:{title:'Website cars',subtitle:'Live inventory shown to visitors on the public website.',fields:[['stock_no','Stock no.'],['make','Make'],['model','Model'],['year','Year','number'],['price','Price (e.g. $189,000)'],['km','Mileage'],['fuel','Fuel'],['body','Body type'],['grade','Auction grade'],['status','Status'],['location','Location'],['image','Image path'],['tr','Transmission'],['drv','Drivetrain'],['eng','Engine'],['seats','Seats','number'],['col','Colour'],['st','Steering'],['sort_order','Sort order','number']]},
 routes:{title:'Shipping routes',subtitle:'Destinations and freight rates used by the shipping calculator.',fields:[['country','Country'],['port','Port'],['transit','Transit time'],['popular','Popular models'],['freight_base','Base freight (USD)','number'],['duty_pct','Import duty %','number'],['lon','Map longitude (-180 to 180)','number'],['lat','Map latitude (-90 to 90)','number'],['sort_order','Sort order','number']]},
 articles:{title:'News & guides',subtitle:'Articles published on the website.',fields:[['title','Headline'],['category','Category'],['date','Date'],['read_min','Read minutes','number'],['image','Image path'],['excerpt','Excerpt'],['body','Body text'],['sort_order','Sort order','number']]},
 tasks:{title:'Tasks',subtitle:'Follow-ups and operational work.',fields:[['title','Task'],['owner','Owner'],['priority','Priority'],['status','Status'],['due_date','Due date','date']]}
};
const money=n=>new Intl.NumberFormat('en-US',{style:'currency',currency:'USD',maximumFractionDigits:0}).format(Number(n)||0);
const pretty=s=>(s||'').replaceAll('_',' ').replace(/\b\w/g,x=>x.toUpperCase());
const date=s=>s?new Intl.DateTimeFormat('en-GB',{day:'2-digit',month:'short',year:'numeric'}).format(new Date(s)):'—';

// Website-content sections seed from the real live-site data, CRM sections from `seed`.
function baseData(entity){return SITE_ENTITIES.includes(entity)?(siteSeed[entity]||[]):(seed[entity]||[])}
function demoRead(entity){const k='ar7-crm-'+entity;const stored=localStorage.getItem(k);return stored?JSON.parse(stored):baseData(entity)}
function demoWrite(entity,rows){localStorage.setItem('ar7-crm-'+entity,JSON.stringify(rows))}

async function api(entity,token,options={}){
 const {id,...init}=options;
 // Website-content sections live behind /api/site-content; CRM records behind /api/crm.
 const base=SITE_ENTITIES.includes(entity)?'/api/site-content':'/api/crm';
 const url=base+'?entity='+encodeURIComponent(entity)+(id?'&id='+encodeURIComponent(id):'')+(SITE_ENTITIES.includes(entity)?'&all=1':'');
 const res=await fetch(url,{...init,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(init.headers||{})}});
 if(!res.ok)throw new Error((await res.json().catch(()=>({}))).error||'Request failed');return res.json();
}

async function call(path,token,options={}){
 const res=await fetch(path,{...options,headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{}),...(options.headers||{})}});
 const body=await res.json().catch(()=>({}));
 if(!res.ok)throw new Error(body.error||'Request failed');
 return body;
}

export default function CrmApp(){
 const [session,setSession]=useState(null),[profile,setProfile]=useState(null),[loading,setLoading]=useState(true),[tab,setTab]=useState('dashboard'),[rows,setRows]=useState({}),[query,setQuery]=useState(''),[who,setWho]=useState(null),[editor,setEditor]=useState(null),[notice,setNotice]=useState(''),[mobile,setMobile]=useState(false),[perms,setPerms]=useState([]),[openCustomer,setOpenCustomer]=useState(null);
 useEffect(()=>{
  if(DEMO){setSession({access_token:'demo',user:{email:'admin@ar7traders.com'}});setProfile({full_name:'Demo Administrator',role:'admin'});setLoading(false);return}
  if(!supabase){setLoading(false);return}
  supabase.auth.getSession().then(({data})=>{setSession(data.session);setLoading(false)});
  const {data:{subscription}}=supabase.auth.onAuthStateChange((_,s)=>setSession(s));return()=>subscription.unsubscribe()
 },[]);
 useEffect(()=>{if(!session)return;loadAll()},[session]);
 async function loadAll(){setLoading(true);const keys=[...Object.keys(seed),...SITE_ENTITIES];try{if(DEMO){const out={};keys.forEach(k=>out[k]=demoRead(k));setRows(out)}else{const me=await api('me',session.access_token);setProfile(me);try{setPerms(await call('/api/team?action=permissions',session.access_token))}catch{}const entries=await Promise.all(keys.map(async k=>{try{return [k,await api(k,session.access_token)]}catch{return [k,[]]}}));setRows(Object.fromEntries(entries))}}catch(e){setNotice(e.message)}finally{setLoading(false)}}
 async function save(entity,data){try{if(DEMO){const list=rows[entity]||[];const item={...data,id:data.id||crypto.randomUUID(),created_at:data.created_at||new Date().toISOString()};const next=data.id?list.map(x=>x.id===data.id?item:x):[item,...list];demoWrite(entity,next);setRows(v=>({...v,[entity]:next}))}else{const result=await api(entity,session.access_token,{method:data.id?'PATCH':'POST',body:JSON.stringify(data)});setRows(v=>({...v,[entity]:data.id?v[entity].map(x=>x.id===result.id?result:x):[result,...(v[entity]||[])]}))}setEditor(null);setNotice('Saved successfully')}catch(e){setNotice(e.message)}}
 async function remove(entity,row){
  if(!row?.id)return;
  const label=row.name||row.title||row.stock_no||row.quote_no||row.tracking_no||'this record';
  const direct=(profile?.role||'')==='admin'||hasPerm(perms,profile?.role,'delete.direct');
  if(!confirm(direct?`Delete ${label}? This cannot be undone.`
    :`Request approval to delete ${label}? An administrator must approve it.`))return;
  try{
   if(DEMO){const next=(rows[entity]||[]).filter(x=>x.id!==row.id);demoWrite(entity,next);setRows(v=>({...v,[entity]:next}))}
   else{
    const r=await api(entity,session.access_token,{method:'DELETE',id:row.id});
    if(r&&r.pending){setEditor(null);setNotice('Sent to an administrator for approval.');return}
    setRows(v=>({...v,[entity]:(v[entity]||[]).filter(x=>x.id!==row.id)}))
   }
   setEditor(null);setNotice('Record deleted')
  }catch(e){setNotice(e.message)}
 }
 async function signOut(){if(DEMO){location.hash='home';return}await supabase.auth.signOut();setSession(null)}
 if(loading&&!session)return <div className="crm-boot"><RefreshCw/><span>Loading AR7 CRM…</span></div>;
 if(!supabase&&!DEMO)return <CrmSetup/>;
 if(!session)return <CrmLogin/>;
 const canDelete=(profile?.role||'')!=='viewer';
 const SPECIAL={dashboard:'Dashboard',activities:'Activity log',team:'Team & permissions',approvals:'Approvals',settings:'Website contact details',accounts:'Customer accounts',people:'People & payroll'};
 const current=configs[tab];
 const heading=tab==='dashboard'?'Good day, '+(profile?.full_name?.split(' ')[0]||'Team'):(SPECIAL[tab]||current?.title||'');
 const data=rows[tab]||[];const filtered=data.filter(x=>JSON.stringify(x).toLowerCase().includes(query.toLowerCase()));
 return <div className="crm-shell">
  <aside className={'crm-side '+(mobile?'open':'')}><div className="crm-brand"><img src="/assets/ar7-mark.png"/><div><b>AR7 CRM</b><small>COMMAND CENTER</small></div><button onClick={()=>setMobile(false)}><X/></button></div><nav>{tabs.map(([id,label,I])=><button key={id} className={tab===id?'active':''} onClick={()=>{setTab(id);setMobile(false);setQuery('')}}><I/><span>{label}</span>{id==='leads'&&<em>{(rows.leads||[]).filter(x=>x.status==='new').length}</em>}</button>)}</nav><div className="crm-user"><button className="crm-user-open" onClick={()=>setWho({self:true})} title="Edit your profile"><span>{(profile?.full_name||session.user?.email||'AR7').slice(0,2).toUpperCase()}</span><div><b>{profile?.full_name||session.user?.email}</b><small>{pretty(profile?.role||'admin')}</small></div><UserCog size={15}/></button><button className="crm-user-out" onClick={signOut} title="Sign out" aria-label="Sign out"><LogOut/></button></div></aside>
  {mobile&&<div className="crm-side-shade" onClick={()=>setMobile(false)}/>}<main className="crm-main"><header className="crm-top"><button className="crm-menu" onClick={()=>setMobile(true)}><Menu/></button><div><small>AR7 TRADERS / {tab.toUpperCase()}</small><h1>{heading}</h1></div><div className="crm-live"><i/> LIVE OPERATIONS</div><a className="crm-site" href="#home">View website <ChevronRight/></a></header>
  {notice&&<div className="crm-notice" onClick={()=>setNotice('')}>{notice}<X/></div>}
  {tab==='dashboard'?<Dashboard rows={rows} setTab={setTab}/>
   :tab==='activities'?<ActivityView rows={rows.activities||[]}/>
   :tab==='team'?<TeamView token={session.access_token} profile={profile} perms={perms} setPerms={setPerms} notify={setNotice} onEdit={m=>setWho({member:m})}/>
   :tab==='approvals'?<ApprovalsView token={session.access_token} profile={profile} perms={perms} notify={setNotice} onChange={loadAll}/>
   :tab==='people'?<PeopleView token={session.access_token} profile={profile} perms={perms} notify={setNotice}/>
   :tab==='settings'?<SettingsView token={session.access_token} profile={profile} perms={perms} notify={setNotice}/>
   :tab==='accounts'?(openCustomer
       ? <CustomerAccount token={session.access_token} profile={profile} perms={perms} customerId={openCustomer} onBack={()=>setOpenCustomer(null)} notify={setNotice} listings={rows.listings||[]}/>
       : <AccountsList customers={rows.customers||[]} onOpen={setOpenCustomer}/>)
   :<><div className="crm-page-head"><div><p>{current.subtitle}</p></div><div className="crm-tools"><label><Search/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={'Search '+tab}/></label><button onClick={loadAll}><RefreshCw/></button><button className="crm-add" onClick={()=>setEditor({entity:tab,data:{}})}><Plus/> Add {tab.slice(0,-1)}</button></div></div><EntityView entity={tab} rows={filtered} onEdit={data=>setEditor({entity:tab,data})} onDelete={canDelete?row=>remove(tab,row):null}/></>}
  </main>{who&&<ProfileModal who={who} token={session.access_token} profile={profile} perms={perms} notify={setNotice} onClose={()=>setWho(null)} onChanged={loadAll}/>}{editor&&<Editor entity={editor.entity} data={editor.data} onClose={()=>setEditor(null)} onSave={x=>save(editor.entity,x)} onDelete={canDelete&&editor.data?.id?()=>remove(editor.entity,editor.data):null}/>}</div>
}

function CrmLogin(){const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[error,setError]=useState(''),[busy,setBusy]=useState(false);async function submit(e){e.preventDefault();setBusy(true);setError('');const {error}=await supabase.auth.signInWithPassword({email,password});if(error)setError(error.message);setBusy(false)}return <div className="crm-login"><div className="crm-login-visual"><img src="/assets/ar7-logo.png"/><div><small>AR7 OPERATIONS</small><h1>Every lead.<br/>Every vehicle.<br/><em>One command center.</em></h1><p>Secure sales and export operations for the AR7 team.</p></div></div><form onSubmit={submit}><div className="crm-login-mark"><ShieldCheck/><span>AUTHORIZED TEAM ACCESS</span></div><h2>Welcome back.</h2><p>Sign in with your AR7 staff account.</p>{error&&<div className="crm-error">{error}</div>}<label>EMAIL<input type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label>PASSWORD<input type="password" value={password} onChange={e=>setPassword(e.target.value)} required/></label><button disabled={busy}>{busy?'Signing in…':'Sign in securely'} <ChevronRight/></button><small>Protected by Supabase Auth · Admin and Sales roles</small></form></div>}
function CrmSetup(){return <div className="crm-setup"><Database/><span>SUPABASE CONNECTION REQUIRED</span><h1>CRM is ready to connect.</h1><p>Add the Supabase environment variables in Vercel to activate secure authentication and persistent records.</p><div><code>VITE_SUPABASE_URL</code><code>VITE_SUPABASE_ANON_KEY</code><code>SUPABASE_SERVICE_ROLE_KEY</code></div><a href="#home">Return to website</a></div>}

function Dashboard({rows,setTab}){const leads=rows.leads||[],quotes=rows.quotes||[],shipments=rows.shipments||[],tasks=rows.tasks||[];const pipeline=leads.reduce((a,x)=>a+(Number(x.budget)||0),0),won=quotes.filter(x=>x.status==='accepted').reduce((a,x)=>a+(Number(x.amount)||0),0);return <div className="crm-dashboard"><div className="crm-kpis">{[[Users,'Active leads',leads.length,'+12% this month'],[DollarSign,'Pipeline value',money(pipeline),'Across all open leads'],[TrendingUp,'Accepted quotes',money(won),quotes.filter(x=>x.status==='accepted').length+' converted'],[Ship,'Vehicles in transit',shipments.length,'Across '+new Set(shipments.map(x=>x.destination)).size+' destinations']].map(([I,l,v,s])=><article key={l}><i><I/></i><span>{l}</span><b>{v}</b><small>{s}</small></article>)}</div><div className="crm-dash-grid"><section className="crm-panel crm-pipeline"><div className="crm-panel-head"><div><small>SALES PIPELINE</small><h3>Lead stages</h3></div><button onClick={()=>setTab('leads')}>View all <ChevronRight/></button></div><div className="pipeline-bars">{['new','qualified','proposal','negotiation'].map(status=>{const list=leads.filter(x=>x.status===status);return <div key={status}><span><b>{pretty(status)}</b><em>{list.length}</em></span><i><u style={{width:Math.max(8,list.length/Math.max(1,leads.length)*100)+'%'}}/></i><small>{money(list.reduce((a,x)=>a+(Number(x.budget)||0),0))}</small></div>})}</div></section><section className="crm-panel"><div className="crm-panel-head"><div><small>FOLLOW UPS</small><h3>Today & upcoming</h3></div><button onClick={()=>setTab('tasks')}>Tasks <ChevronRight/></button></div><div className="crm-task-list">{tasks.slice(0,5).map(x=><div key={x.id}><i className={x.priority}/><span><b>{x.title}</b><small><Clock3/> {date(x.due_date)} · {x.owner}</small></span><em className={'crm-status '+x.status}>{pretty(x.status)}</em></div>)}</div></section><section className="crm-panel crm-span"><div className="crm-panel-head"><div><small>LIVE SHIPMENTS</small><h3>Vehicles in motion</h3></div><button onClick={()=>setTab('shipments')}>Operations <ChevronRight/></button></div><div className="crm-shipment-grid">{shipments.map(x=><article key={x.id}><span><b>{x.tracking_no}</b><em className={'crm-status '+x.status}>{pretty(x.status)}</em></span><h4>{x.vehicle}</h4><p>{x.origin} <i/> {x.destination}</p><div><u style={{width:x.progress+'%'}}/></div><small>{x.vessel} · ETA {date(x.eta)}</small></article>)}</div></section></div></div>}

function EntityView({entity,rows,onEdit,onDelete}){if(!rows.length)return <div className="crm-empty"><Search/><h3>No records found</h3><p>Try another search or add a new record.</p></div>;if(entity==='leads')return <div className="crm-lead-grid">{rows.map(x=><article key={x.id}><div><span>{(x.name||'?').slice(0,2).toUpperCase()}</span><em className={'crm-status '+x.status}>{pretty(x.status)}</em></div><h3>{x.name}</h3><p>{x.vehicle_interest}</p><dl><div><dt>Market</dt><dd>{x.country}</dd></div><div><dt>Budget</dt><dd>{money(x.budget)}</dd></div><div><dt>Owner</dt><dd>{x.assigned_to}</dd></div><div><dt>Follow-up</dt><dd>{date(x.next_follow_up)}</dd></div></dl><footer><a href={'mailto:'+x.email}><Mail/></a><a href={'https://wa.me/'+(x.phone||'').replace(/\D/g,'')} target="_blank" rel="noreferrer"><MessageCircle/></a><button onClick={()=>onEdit(x)}>Open lead <ChevronRight/></button>{onDelete&&<button className="crm-del" title="Delete lead" onClick={()=>onDelete(x)}><Trash2/></button>}</footer></article>)}</div>;
 return <div className="crm-table-wrap"><table><thead><tr>{tableColumns(entity).map(x=><th key={x}>{pretty(x)}</th>)}<th/></tr></thead><tbody>{rows.map(row=><tr key={row.id}>{tableColumns(entity).map(k=><td key={k}>{renderCell(k,row[k])}</td>)}    <td className="crm-row-actions"><button onClick={()=>onEdit(row)}>Edit</button>{onDelete&&<button className="crm-del" title="Delete record" onClick={()=>onDelete(row)}><Trash2/></button>}</td></tr>)}</tbody></table></div>}
function tableColumns(e){return {listings:['stock_no','make','model','year','price','status','location'],routes:['country','port','transit','freight_base','duty_pct'],articles:['title','category','date','read_min'],customers:['name','country','status','total_spend','vehicles_bought'],vehicles:['stock_no','make','model','year','price','status','steering'],quotes:['quote_no','customer_name','vehicle','amount','status','valid_until'],shipments:['tracking_no','vehicle','destination','vessel','status','eta','progress'],tasks:['title','owner','priority','status','due_date']}[e]||[]}
function renderCell(k,v){if(['price','amount','total_spend'].includes(k))return money(v);if(['valid_until','eta','due_date'].includes(k))return date(v);if(['status','priority'].includes(k))return <em className={'crm-status '+v}>{pretty(v)}</em>;if(k==='progress')return <span className="table-progress"><i style={{width:v+'%'}}/><b>{v}%</b></span>;return v??'—'}
function ActivityView({rows}){return <div className="crm-activity"><div className="crm-page-head"><p>A complete audit trail across sales and operations.</p></div>{rows.map((x,i)=><article key={x.id}><i><Activity/></i><div><b>{x.action}</b><span>{x.actor} · {new Date(x.created_at).toLocaleString()}</span></div><em>{pretty(x.entity_type)}</em>{i<rows.length-1&&<u/>}</article>)}</div>}
function Editor({entity,data,onClose,onSave,onDelete}){const cfg=configs[entity], [form,setForm]=useState({...data});return <div className="crm-modal-bg" onMouseDown={onClose}><form className="crm-editor" onMouseDown={e=>e.stopPropagation()} onSubmit={e=>{e.preventDefault();onSave(form)}}><header><div><small>{data.id?'EDIT RECORD':'NEW RECORD'}</small><h2>{data.id?'Update':'Add'} {entity.slice(0,-1)}</h2></div><button type="button" onClick={onClose}><X/></button></header><div className="crm-editor-fields">{cfg.fields.map(([key,label,type='text'])=><label key={key}>{label}<input type={type} value={form[key]??''} onChange={e=>setForm(v=>({...v,[key]:type==='number'?Number(e.target.value):e.target.value}))} required={['name','title','stock_no','quote_no','tracking_no'].includes(key)}/></label>)}</div><footer>{onDelete&&<button type="button" className="crm-del-text" onClick={onDelete}><Trash2/> Delete</button>}<button type="button" onClick={onClose}>Cancel</button><button className="save"><Save/> Save record</button></footer></form></div>}

// ---------------------------------------------------------------------
//  Permissions helper
// ---------------------------------------------------------------------
function hasPerm(perms,role,permission){
 if(role==='admin')return true;
 const row=(perms||[]).find(p=>p.role===role&&p.permission===permission);
 return !!row?.allowed;
}

// ---------------------------------------------------------------------
//  Team & permissions
// ---------------------------------------------------------------------
function ProfileModal({who,token,profile,perms,notify,onClose,onChanged}){
 const self=!!who.self;
 const m=who.member||{};
 const manage=hasPerm(perms,profile?.role,'team.manage');
 const [busy,setBusy]=useState(false),[err,setErr]=useState(''),[ok,setOk]=useState('');
 const [pw,setPw]=useState(''),[pw2,setPw2]=useState('');
 const canEditOther=!self&&manage;
 if(!self&&!canEditOther) return null;

 async function saveDetails(e){
  e.preventDefault();
  const f=new FormData(e.currentTarget);
  const body={full_name:f.get('full_name'),title:f.get('title'),phone:f.get('phone')};
  setBusy(true);setErr('');
  try{
   if(self){
    await call('/api/team?action=me',token,{method:'PATCH',body:JSON.stringify(body)});
    if(supabase&&!DEMO) await supabase.auth.updateUser({data:{full_name:body.full_name}});
   }else{
    await call('/api/team?action=member',token,{method:'PATCH',
      body:JSON.stringify({id:m.id,...body,role:f.get('role'),active:f.get('active')==='on'})});
   }
   setOk('Details saved');notify('Profile updated');onChanged&&onChanged();
  }catch(e2){setErr(e2.message)}finally{setBusy(false)}
 }

 async function savePassword(e){
  e.preventDefault();
  if(pw.length<8){setErr('Password must be at least 8 characters');return}
  if(pw!==pw2){setErr('The two passwords do not match');return}
  setBusy(true);setErr('');
  try{
   if(self){
    if(!supabase||DEMO) throw new Error('Password changes are not available in demo mode');
    const {error}=await supabase.auth.updateUser({password:pw});
    if(error) throw error;
   }else{
    await call('/api/team?action=reset-password',token,{method:'POST',
      body:JSON.stringify({id:m.id,password:pw})});
   }
   setPw('');setPw2('');setOk(self?'Your password has been changed':'Password reset — pass it to them directly, never by email');
  }catch(e2){setErr(e2.message)}finally{setBusy(false)}
 }

 const initials=(self?(profile?.full_name||'AR7'):(m.full_name||'AR7')).slice(0,2).toUpperCase();
 const role=self?(profile?.role||'sales'):(m.role||'sales');

 return <div className="crm-modal-bg" onClick={onClose}><div className="crm-editor crm-profile" onClick={e=>e.stopPropagation()}>
  <header><div><small>{self?'YOUR PROFILE':'TEAM MEMBER'}</small>
    <h2>{self?'My profile':(m.full_name||'Edit member')}</h2></div>
   <button type="button" onClick={onClose} aria-label="Close"><X/></button></header>
  <div className="crm-profile-id"><span>{initials}</span>
   <div><b>{self?(profile?.full_name||'—'):(m.full_name||'—')}</b>
    <small>{pretty(role)}{!self&&m.email?' · '+m.email:''}</small></div></div>
  {ok&&<div className="crm-ok"><Check/> {ok}</div>}
  {err&&<div className="crm-error">{err}</div>}
  <form onSubmit={saveDetails} className="crm-profile-form">
   <div className="crm-editor-fields two">
    <label>Full name<input name="full_name" required minLength={2}
      defaultValue={self?(profile?.full_name||''):(m.full_name||'')}/></label>
    <label>Job title<input name="title" placeholder="e.g. Sales manager"
      defaultValue={self?(profile?.title||''):(m.title||'')}/></label>
    <label>Phone<input name="phone" placeholder="+81 90 0000 0000"
      defaultValue={self?(profile?.phone||''):(m.phone||'')}/></label>
    <label>Email<input value={self?'':(m.email||'')} disabled
      title="Email is the login and can only be changed by adding a new account"/></label>
   </div>
   {canEditOther&&<div className="crm-editor-fields two">
    <label>Role
     <select name="role" defaultValue={m.role||'sales'} disabled={m.id===profile.id}>
      {ROLE_LIST.map(r=><option key={r} value={r}>{pretty(r)}</option>)}</select></label>
    <label className="crm-check"><input type="checkbox" name="active" defaultChecked={m.active!==false}
      disabled={m.id===profile.id}/> Account is active</label>
   </div>}
   <footer><button type="button" className="crm-ghost" onClick={onClose}>Cancel</button>
    <button className="save" disabled={busy}>{busy?'Saving…':<><Save/> Save details</>}</button></footer>
  </form>
  <form onSubmit={savePassword} className="crm-profile-form crm-profile-pw">
   <div className="crm-profile-pw-head"><KeyRound size={16}/>
    <b>{self?'Change my password':'Reset their password'}</b></div>
   <div className="crm-editor-fields two">
    <label>New password<input type="password" minLength={8} autoComplete="new-password"
      value={pw} onChange={e=>setPw(e.target.value)} placeholder="At least 8 characters"/></label>
    <label>Confirm password<input type="password" minLength={8} autoComplete="new-password"
      value={pw2} onChange={e=>setPw2(e.target.value)}/></label>
   </div>
   <footer><button className="save" disabled={busy}>{busy?'Saving…':'Update password'}</button></footer>
  </form>
 </div></div>;
}  
function TeamView({token,profile,perms,setPerms,notify,onEdit}){
 const [members,setMembers]=useState([]),[busy,setBusy]=useState(false),[adding,setAdding]=useState(false),[pw,setPw]=useState(null);
 const manage=hasPerm(perms,profile?.role,'team.manage');
 async function load(){try{setMembers(await call('/api/team?action=members',token))}catch(e){notify(e.message)}}
 useEffect(()=>{if(manage)load()},[manage]);
 async function invite(e){
  e.preventDefault();const f=new FormData(e.target);setBusy(true);
  try{
   await call('/api/team?action=invite',token,{method:'POST',body:JSON.stringify({
     email:f.get('email'),full_name:f.get('full_name'),role:f.get('role'),password:f.get('password')})});
   notify('Team member added');setAdding(false);load();
  }catch(err){notify(err.message)}finally{setBusy(false)}
 }
 async function update(id,patch){
  try{await call('/api/team?action=member',token,{method:'PATCH',body:JSON.stringify({id,...patch})});load();notify('Updated')}
  catch(e){notify(e.message)}
 }
 async function toggle(role,permission,allowed){
  try{
   await call('/api/team?action=set-permission',token,{method:'POST',body:JSON.stringify({role,permission,allowed})});
   setPerms(await call('/api/team?action=permissions',token));
  }catch(e){notify(e.message)}
 }
 async function resetPw(e){
  e.preventDefault();const f=new FormData(e.target);setBusy(true);
  try{await call('/api/team?action=reset-password',token,{method:'POST',body:JSON.stringify({id:pw.id,password:f.get('password')})});
   notify('Password updated — give it to them directly, not by email.');setPw(null)}
  catch(err){notify(err.message)}finally{setBusy(false)}
 }
 if(!manage)return <div className="crm-empty"><ShieldAlert/><h3>Not available for your role</h3><p>Only administrators can manage the team.</p></div>;
 return <div className="crm-team">
  <div className="crm-page-head"><div><p>Add colleagues, set what each role may do, and reset passwords.</p></div>
   <div className="crm-tools"><button className="crm-add" onClick={()=>setAdding(true)}><Plus/> Add member</button></div></div>

  <div className="crm-table-wrap"><table><thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th/></tr></thead><tbody>
   {members.map(m=><tr key={m.id}>
    <td>{m.full_name}</td><td>{m.email||'—'}</td>
    <td><select value={m.role} disabled={m.id===profile.id} onChange={e=>update(m.id,{role:e.target.value})}>
      {ROLE_LIST.map(r=><option key={r} value={r}>{pretty(r)}</option>)}</select></td>
    <td><em className={'crm-status '+(m.active?'active':'inactive')}>{m.active?'Active':'Disabled'}</em></td>
    <td className="crm-row-actions">
     <button onClick={()=>onEdit(m)}><UserCog size={14}/> Edit</button>
     <button onClick={()=>setPw(m)}><KeyRound size={14}/> Password</button>
     {m.id!==profile.id&&<button className={m.active?'crm-del':''} onClick={()=>update(m.id,{active:!m.active})}>
       {m.active?'Disable':'Enable'}</button>}
    </td></tr>)}
  </tbody></table></div>

  <div className="crm-perm-block">
   <h3>What each role can do</h3>
   <p>Tick a box to allow it. Changes apply immediately — no redeploy needed. Administrators always have everything.</p>
   <div className="crm-table-wrap"><table className="perm-table"><thead><tr><th>Permission</th>
     {ROLE_LIST.map(r=><th key={r}>{pretty(r)}</th>)}</tr></thead><tbody>
    {Object.entries(PERM_LABELS).map(([key,label])=><tr key={key}><td>{label}</td>
     {ROLE_LIST.map(r=><td key={r} className="perm-cell">
       <input type="checkbox" disabled={r==='admin'} checked={r==='admin'?true:hasPerm(perms,r,key)}
         onChange={e=>toggle(r,key,e.target.checked)}/></td>)}
    </tr>)}
   </tbody></table></div>
  </div>

  {adding&&<div className="crm-modal-bg" onMouseDown={()=>setAdding(false)}>
   <form className="crm-editor" onMouseDown={e=>e.stopPropagation()} onSubmit={invite}>
    <header><div><small>NEW TEAM MEMBER</small><h2>Add colleague</h2></div><button type="button" onClick={()=>setAdding(false)}><X/></button></header>
    <div className="crm-editor-fields">
     <label>Full name<input name="full_name" required/></label>
     <label>Email<input name="email" type="email" required/></label>
     <label>Role<select name="role" defaultValue="sales">{ROLE_LIST.map(r=><option key={r} value={r}>{pretty(r)}</option>)}</select></label>
     <label>Starting password<input name="password" minLength={8} required placeholder="At least 8 characters"/></label>
    </div>
    <p className="crm-hint">Give this password to them in person or by a message they can delete — not by email. They can change it after signing in.</p>
    <footer><button type="button" onClick={()=>setAdding(false)}>Cancel</button><button className="save" disabled={busy}><Save/> {busy?'Adding…':'Add member'}</button></footer>
   </form></div>}

  {pw&&<div className="crm-modal-bg" onMouseDown={()=>setPw(null)}>
   <form className="crm-editor" onMouseDown={e=>e.stopPropagation()} onSubmit={resetPw}>
    <header><div><small>RESET PASSWORD</small><h2>{pw.full_name}</h2></div><button type="button" onClick={()=>setPw(null)}><X/></button></header>
    <div className="crm-editor-fields"><label>New password<input name="password" minLength={8} required/></label></div>
    <p className="crm-hint">Existing passwords cannot be displayed — they are stored scrambled and cannot be unscrambled. You can only set a new one.</p>
    <footer><button type="button" onClick={()=>setPw(null)}>Cancel</button><button className="save" disabled={busy}><Save/> Set password</button></footer>
   </form></div>}
 </div>;
}

// ---------------------------------------------------------------------
//  People — staff records, performance and payroll
// ---------------------------------------------------------------------
const DEPTS=['Sales','Operations','Accounts','Logistics','Management','Support'];
const EMP_TYPES=[['full_time','Full time'],['part_time','Part time'],['contract','Contract'],['intern','Intern']];
const EMP_STATUS=[['active','Active'],['on_leave','On leave'],['left','Left']];
const monthKey=d=>{const x=d?new Date(d):new Date();return new Date(Date.UTC(x.getUTCFullYear(),x.getUTCMonth(),1)).toISOString().slice(0,10)};
const monthName=d=>d?new Date(d).toLocaleDateString('en-GB',{month:'long',year:'numeric',timeZone:'UTC'}):'—';

function PeopleView({token,profile,perms,notify}){
 const [data,setData]=useState(null),[busy,setBusy]=useState(false);
 const [edit,setEdit]=useState(null),[open,setOpen]=useState(null),[view,setView]=useState('people');
 const [month,setMonth]=useState(monthKey());
 const canView=hasPerm(perms,profile?.role,'hr.view');
 const manage=hasPerm(perms,profile?.role,'hr.manage');
 const payMan=hasPerm(perms,profile?.role,'payroll.manage');
 const payView=hasPerm(perms,profile?.role,'payroll.view');

 async function load(){try{setData(await call('/api/hr?action=overview',token))}catch(e){notify(e.message)}}
 useEffect(()=>{if(canView)load()},[canView]);

 async function saveEmp(e){
  e.preventDefault();const f=new FormData(e.target);const b=Object.fromEntries(f);setBusy(true);
  try{await call('/api/hr?action=save-employee',token,{method:'POST',body:JSON.stringify({...b,id:edit?.id})});
   notify('Saved');setEdit(null);load()}
  catch(err){notify(err.message)}finally{setBusy(false)}
 }
 async function prepare(){
  if(!confirm('Prepare payslips for '+monthName(month)+'?\n\nSalary and commission are filled in from live figures. Anything already prepared is left untouched.'))return;
  setBusy(true);
  try{const r=await call('/api/hr?action=prepare-payroll',token,{method:'POST',body:JSON.stringify({month})});
   notify(r.message||`${r.created} payslip(s) prepared${r.skipped?`, ${r.skipped} already existed`:''}`);load()}
  catch(e){notify(e.message)}finally{setBusy(false)}
 }
 async function setStatus(id,status){
  const ref=status==='paid'?prompt('Payment reference (optional) — e.g. TT number'):null;
  if(status==='paid'&&ref===null)return;
  try{await call('/api/hr?action=set-payslip-status',token,{method:'POST',body:JSON.stringify({id,status,reference:ref})});
   notify('Payslip '+status);load()}catch(e){notify(e.message)}
 }
 async function savePayslip(e,row){
  e.preventDefault();const f=new FormData(e.target);
  try{await call('/api/hr?action=save-payslip',token,{method:'POST',body:JSON.stringify({id:row.id,
    base_salary:f.get('base_salary'),commission:f.get('commission'),bonus:f.get('bonus'),deductions:f.get('deductions'),note:f.get('note')})});
   notify('Payslip updated');setOpen(null);load()}catch(err){notify(err.message)}
 }

 if(!canView)return <div className="crm-empty"><ShieldAlert/><h3>Not available for your role</h3><p>Ask an administrator for the “View staff records” permission.</p></div>;
 if(!data)return <div className="crm-empty"><RefreshCw/><h3>Loading…</h3></div>;

 const staff=data.employees||[];
 const slips=(data.payroll||[]).filter(p=>p.period_month===month);
 const totals=slips.reduce((a,p)=>({net:a.net+Number(p.net_pay||0),count:a.count+1}),{net:0,count:0});
 const active=staff.filter(s=>s.status==='active');
 const teamRevenue=staff.reduce((a,s)=>a+Number(s.performance?.orders_value||0),0);
 const teamComm=staff.reduce((a,s)=>a+Number(s.performance?.commission_earned||0),0);

 return <div className="crm-people">
  <div className="crm-page-head">
   <div><p>Staff records, measured performance and monthly payroll.</p></div>
   <div className="crm-tools">
    <div className="crm-seg">
     <button className={view==='people'?'on':''} onClick={()=>setView('people')}>People</button>
     <button className={view==='performance'?'on':''} onClick={()=>setView('performance')}>Performance</button>
     {payView&&<button className={view==='payroll'?'on':''} onClick={()=>setView('payroll')}>Payroll</button>}
    </div>
    <button onClick={load}><RefreshCw/></button>
    {manage&&<button className="crm-add" onClick={()=>setEdit({})}><Plus/> Add person</button>}
   </div>
  </div>

  <div className="crm-kpis compact">
   {[[Users,'Team members',active.length,staff.length-active.length+' inactive'],
     [DollarSign,'Payroll this month',money(active.reduce((a,s)=>a+Number(s.base_salary||0),0)),'Base salaries'],
     [TrendingUp,'Sales credited',money(teamRevenue),'All time'],
     [Wallet,'Commission earned',money(teamComm),'On credited sales']]
    .map(([I,l,v,s])=><article key={l}><i><I/></i><span>{l}</span><b>{v}</b><small>{s}</small></article>)}
  </div>

  {view==='people'&&<div className="crm-table-wrap"><table>
   <thead><tr><th>Name</th><th>Role</th><th>Department</th><th>Type</th><th>Salary / mo</th><th>Comm.</th><th>Status</th><th/></tr></thead>
   <tbody>{staff.map(e=><tr key={e.id}>
    <td><b>{e.full_name}</b>{e.email&&<><br/><small className="crm-dim">{e.email}</small></>}</td>
    <td>{e.job_title||'—'}</td><td>{e.department}</td>
    <td>{(EMP_TYPES.find(t=>t[0]===e.employment_type)||[])[1]||e.employment_type}</td>
    <td>{money(e.base_salary)}</td><td>{Number(e.commission_pct||0)}%</td>
    <td><em className={'crm-status '+(e.status==='active'?'active':e.status==='left'?'inactive':'pending')}>
      {(EMP_STATUS.find(s=>s[0]===e.status)||[])[1]||e.status}</em></td>
    <td className="crm-row-actions">{manage&&<button onClick={()=>setEdit(e)}>Edit</button>}</td>
   </tr>)}
   {!staff.length&&<tr><td colSpan={8} className="crm-dim">Nobody added yet. Press “Add person” to start.</td></tr>}
   </tbody></table></div>}

  {view==='performance'&&<div className="crm-perf">
   {!staff.length&&<div className="crm-empty"><TrendingUp/><h3>No staff yet</h3><p>Add people first, then credit orders to them.</p></div>}
   {staff.map(e=>{const p=e.performance||{};const val=Number(p.orders_value||0);
    const share=teamRevenue?Math.round(val/teamRevenue*100):0;
    return <article key={e.id} className="perf-card">
     <header><div><b>{e.full_name}</b><small>{e.job_title||e.department}</small></div>
      <em>{money(val)}</em></header>
     <div className="perf-bar"><u style={{width:Math.max(2,share)+'%'}}/></div>
     <div className="perf-stats">
      <span><b>{p.orders_count||0}</b><small>Orders</small></span>
      <span><b>{p.orders_completed||0}</b><small>Completed</small></span>
      <span><b>{money(p.revenue_delivered)}</b><small>Delivered</small></span>
      <span><b>{money(p.commission_earned)}</b><small>Commission</small></span>
      <span><b>{p.leads_active||0}</b><small>Live leads</small></span>
      <span><b>{share}%</b><small>Of team sales</small></span>
     </div>
    </article>})}
   <p className="crm-hint">These figures are calculated from real orders and leads credited to each person — they cannot be typed in or edited. Credit a sale by setting the salesperson on an order.</p>
  </div>}

  {view==='payroll'&&payView&&<div className="crm-payroll">
   <div className="payroll-bar">
    <label>Month<input type="month" value={month.slice(0,7)} onChange={e=>setMonth(monthKey(e.target.value+'-01'))}/></label>
    <div className="payroll-total"><small>Net payable</small><b>{money(totals.net)}</b><em>{totals.count} payslip(s)</em></div>
    {payMan&&<button className="crm-add" disabled={busy} onClick={prepare}><Plus/> Prepare {monthName(month).split(' ')[0]}</button>}
   </div>
   <div className="crm-table-wrap"><table>
    <thead><tr><th>Name</th><th>Base</th><th>Commission</th><th>Bonus</th><th>Deductions</th><th>Net pay</th><th>Status</th><th/></tr></thead>
    <tbody>{slips.map(p=><tr key={p.id}>
     <td><b>{p.full_name}</b><br/><small className="crm-dim">{p.job_title||p.department}</small></td>
     <td>{money(p.base_salary)}</td><td>{money(p.commission)}</td><td>{money(p.bonus)}</td>
     <td>{Number(p.deductions)?'−'+money(p.deductions):'—'}</td>
     <td><b>{money(p.net_pay)}</b></td>
     <td><em className={'crm-status '+(p.status==='paid'?'active':p.status==='approved'?'pending':'')}>{pretty(p.status)}</em>
       {p.paid_on&&<><br/><small className="crm-dim">{date(p.paid_on)}{p.reference?' · '+p.reference:''}</small></>}</td>
     <td className="crm-row-actions">
      {payMan&&p.status!=='paid'&&<button onClick={()=>setOpen(p)}>Adjust</button>}
      {payMan&&p.status==='draft'&&<button onClick={()=>setStatus(p.id,'approved')}><Check size={14}/> Approve</button>}
      {payMan&&p.status==='approved'&&<button onClick={()=>setStatus(p.id,'paid')}><Wallet size={14}/> Mark paid</button>}
     </td></tr>)}
     {!slips.length&&<tr><td colSpan={8} className="crm-dim">
       No payslips for {monthName(month)}.{payMan?' Press “Prepare” to build them from live salary and commission figures.':''}</td></tr>}
    </tbody></table></div>
   <p className="crm-hint">Commission is filled in from orders credited to each person that month. Once a payslip is marked paid its figures are locked — correct a mistake with a bonus or deduction next month, so the record of what was actually paid stays honest.</p>
  </div>}

  {edit&&<div className="crm-modal-bg" onMouseDown={()=>setEdit(null)}>
   <form className="crm-editor wide" onMouseDown={e=>e.stopPropagation()} onSubmit={saveEmp}>
    <header><div><small>{edit.id?'EDIT PERSON':'NEW PERSON'}</small><h2>{edit.full_name||'Add a team member'}</h2></div>
     <button type="button" onClick={()=>setEdit(null)}><X/></button></header>
    <div className="crm-editor-fields two">
     <label>Full name<input name="full_name" defaultValue={edit.full_name||''} required/></label>
     <label>Job title<input name="job_title" defaultValue={edit.job_title||''} placeholder="Senior Sales Executive"/></label>
     <label>Email<input name="email" type="email" defaultValue={edit.email||''}/></label>
     <label>Phone<input name="phone" defaultValue={edit.phone||''}/></label>
     <label>Department<select name="department" defaultValue={edit.department||'Sales'}>{DEPTS.map(d=><option key={d}>{d}</option>)}</select></label>
     <label>Employment type<select name="employment_type" defaultValue={edit.employment_type||'full_time'}>
       {EMP_TYPES.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
     <label>Monthly salary<input name="base_salary" type="number" step="0.01" min="0" defaultValue={edit.base_salary||0}/></label>
     <label>Commission %<input name="commission_pct" type="number" step="0.1" min="0" max="100" defaultValue={edit.commission_pct||0}/></label>
     <label>Joined on<input name="joined_on" type="date" defaultValue={(edit.joined_on||'').slice(0,10)}/></label>
     <label>Status<select name="status" defaultValue={edit.status||'active'}>
       {EMP_STATUS.map(([v,l])=><option key={v} value={v}>{l}</option>)}</select></label>
     <label className="span2">Bank details<input name="bank_details" defaultValue={edit.bank_details||''} placeholder="Account or IBAN for salary transfer"/></label>
     <label className="span2">Notes<textarea name="notes" rows={2} defaultValue={edit.notes||''}/></label>
    </div>
    <p className="crm-hint">Commission % applies to the value of orders credited to this person. Leave it at 0 for salaried roles.</p>
    <footer><button type="button" onClick={()=>setEdit(null)}>Cancel</button>
     <button className="save" disabled={busy}><Save/> {busy?'Saving…':'Save person'}</button></footer>
   </form></div>}

  {open&&<div className="crm-modal-bg" onMouseDown={()=>setOpen(null)}>
   <form className="crm-editor" onMouseDown={e=>e.stopPropagation()} onSubmit={e=>savePayslip(e,open)}>
    <header><div><small>ADJUST PAYSLIP · {monthName(open.period_month)}</small><h2>{open.full_name}</h2></div>
     <button type="button" onClick={()=>setOpen(null)}><X/></button></header>
    <div className="crm-editor-fields two">
     <label>Base salary<input name="base_salary" type="number" step="0.01" defaultValue={open.base_salary}/></label>
     <label>Commission<input name="commission" type="number" step="0.01" defaultValue={open.commission}/></label>
     <label>Bonus<input name="bonus" type="number" step="0.01" defaultValue={open.bonus}/></label>
     <label>Deductions<input name="deductions" type="number" step="0.01" min="0" defaultValue={open.deductions}/></label>
     <label className="span2">Note<input name="note" defaultValue={open.note||''} placeholder="Reason for a bonus or deduction"/></label>
    </div>
    <p className="crm-hint">Net pay is worked out for you: base + commission + bonus − deductions.</p>
    <footer><button type="button" onClick={()=>setOpen(null)}>Cancel</button>
     <button className="save"><Save/> Save payslip</button></footer>
   </form></div>}
 </div>;
}

// ---------------------------------------------------------------------
//  Approvals
// ---------------------------------------------------------------------
function ApprovalsView({token,profile,perms,notify,onChange}){
 const [list,setList]=useState([]),[filter,setFilter]=useState('pending'),[busy,setBusy]=useState('');
 const decide=hasPerm(perms,profile?.role,'approvals.decide');
 async function load(){try{setList(await call('/api/approvals'+(filter?'?status='+filter:''),token))}catch(e){notify(e.message)}}
 useEffect(()=>{load()},[filter]);
 async function act(id,decision){
  setBusy(id);
  try{await call('/api/approvals?decide=1',token,{method:'POST',body:JSON.stringify({id,decision})});
   notify(decision==='approved'?'Approved and applied':'Rejected');load();onChange&&onChange()}
  catch(e){notify(e.message)}finally{setBusy('')}
 }
 return <div className="crm-approvals">
  <div className="crm-page-head"><div><p>Deletions and sensitive changes wait here until an administrator approves them.</p></div>
   <div className="crm-tools"><label className="crm-filter">
    <select value={filter} onChange={e=>setFilter(e.target.value)}>
     <option value="pending">Pending</option><option value="applied">Approved</option>
     <option value="rejected">Rejected</option><option value="">All</option>
    </select></label><button onClick={load}><RefreshCw/></button></div></div>
  {!list.length?<div className="crm-empty"><Check/><h3>Nothing waiting</h3><p>No {filter||''} requests.</p></div>
   :<div className="crm-approval-list">{list.map(a=><article key={a.id} className={'approval '+a.status}>
    <div className="approval-main">
     <em className={'crm-status '+a.status}>{pretty(a.status)}</em>
     <b>{pretty(a.kind)} · {a.entity_label||pretty(a.entity_type)}</b>
     <small>Asked by {a.requested_by_name} · {new Date(a.created_at).toLocaleString()}</small>
     {a.reason&&<p className="approval-reason">“{a.reason}”</p>}
     {a.decided_by_name&&<small className="approval-decided">{pretty(a.status)} by {a.decided_by_name}</small>}
    </div>
    {a.status==='pending'&&decide&&<div className="approval-actions">
     <button className="save" disabled={busy===a.id} onClick={()=>act(a.id,'approved')}><Check/> Approve</button>
     <button className="crm-del" disabled={busy===a.id} onClick={()=>act(a.id,'rejected')}><Ban/> Reject</button>
    </div>}
    {a.status==='pending'&&!decide&&<span className="approval-wait"><Clock3/> Waiting for an administrator</span>}
   </article>)}</div>}
 </div>;
}

// ---------------------------------------------------------------------
//  Website settings (contact details + WhatsApp)
// ---------------------------------------------------------------------
function SettingsView({token,profile,perms,notify}){
 const [form,setForm]=useState(null),[busy,setBusy]=useState(false);
 const canEdit=hasPerm(perms,profile?.role,'settings.write');
 useEffect(()=>{fetch('/api/settings').then(r=>r.json()).then(setForm).catch(()=>setForm({}))},[]);
 if(!form)return <div className="crm-boot"><RefreshCw/><span>Loading settings…</span></div>;
 const fields=[
  ['contact_email','Contact email','The address shown on the website and where enquiries go'],
  ['contact_phone','Phone number','Shown on the contact page and in the footer'],
  ['contact_address','Address','Shown on the contact page'],
  ['whatsapp_number','WhatsApp number','The number behind the floating WhatsApp button. Digits and + only'],
  ['whatsapp_message','WhatsApp greeting','Pre-filled message when someone taps the button'],
  ['enquiry_inbox','Enquiry inbox','Where website enquiry emails are delivered']
 ];
 async function save(e){
  e.preventDefault();setBusy(true);
  try{await call('/api/settings',token,{method:'PATCH',body:JSON.stringify(form)});
   notify('Website updated. Visitors see the change straight away.')}
  catch(err){notify(err.message)}finally{setBusy(false)}
 }
 return <div className="crm-settings">
  <div className="crm-page-head"><div><p>These appear on the public website. Changes go live immediately.</p></div></div>
  <form className="crm-settings-form" onSubmit={save}>
   <div className="crm-editor-fields">
    {fields.map(([k,label,hint])=><label key={k}>{label}
     <input value={form[k]??''} disabled={!canEdit} onChange={e=>setForm(v=>({...v,[k]:e.target.value}))}/>
     <small>{hint}</small></label>)}
    <p className="crm-hint"><Phone size={13}/> The WhatsApp button floats on every page of the website and gently pulses so visitors notice it. Change the number here and it updates everywhere at once.</p>
   </div>
   {canEdit?<footer><button className="save" disabled={busy}><Save/> {busy?'Saving…':'Save changes'}</button></footer>
    :<p className="crm-hint"><ShieldAlert size={13}/> Your role cannot change these settings.</p>}
  </form>
 </div>;
}

// ---------------------------------------------------------------------
//  Customer accounts — orders, payments, ledger, portal login
// ---------------------------------------------------------------------
function AccountsList({customers,onOpen}){
 const [q,setQ]=useState('');
 const list=customers.filter(c=>JSON.stringify(c).toLowerCase().includes(q.toLowerCase()));
 return <div className="crm-accounts">
  <div className="crm-page-head"><div><p>Open a customer to manage their orders, payments and website login.</p></div>
   <div className="crm-tools"><label><Search/><input value={q} onChange={e=>setQ(e.target.value)} placeholder="Search customers"/></label></div></div>
  {!list.length?<div className="crm-empty"><UserRound/><h3>No customers yet</h3><p>Add one in the Customers section first.</p></div>
  :<div className="crm-account-grid">{list.map(c=><article key={c.id} onClick={()=>onOpen(c.id)}>
    <span className="acc-avatar">{(c.name||'?').slice(0,2).toUpperCase()}</span>
    <h3>{c.name}</h3><p>{c.email||'No email'}</p>
    <dl><div><dt>Country</dt><dd>{c.country||'—'}</dd></div>
        <div><dt>Portal</dt><dd>{c.portal_enabled?'Active':'Not set up'}</dd></div></dl>
    <button>Open account <ChevronRight/></button>
   </article>)}</div>}
 </div>;
}

function CustomerAccount({token,profile,perms,customerId,onBack,notify,listings}){
 const [d,setD]=useState(null),[busy,setBusy]=useState(false),[modal,setModal]=useState(null);
 const canOrder=hasPerm(perms,profile?.role,'orders.write');
 const canPay=hasPerm(perms,profile?.role,'payments.write');
 const canLoginAs=hasPerm(perms,profile?.role,'customer.login_as');
 const canCust=hasPerm(perms,profile?.role,'customers.write');
 async function load(){try{setD(await call('/api/customer-admin?action=dashboard&id='+customerId,token))}catch(e){notify(e.message)}}
 useEffect(()=>{load()},[customerId]);
 async function post(action,body,method='POST'){
  setBusy(true);
  try{const r=await call('/api/customer-admin?action='+action,token,{method,body:JSON.stringify(body)});
   await load();setModal(null);return r}
  catch(e){notify(e.message);throw e}
  finally{setBusy(false)}
 }
 async function loginAs(){
  try{const r=await post('login-as',{customer_id:customerId});
   if(r.url){window.open(r.url,'_blank','noopener');notify('Opened their account in a new tab.')}
   else notify('Could not create the link.')}
  catch{}
 }
 if(!d)return <div className="crm-boot"><RefreshCw/><span>Loading account…</span></div>;
 const {customer,orders,payments,allocations,totals,login}=d;
 const unapplied=payments.filter(p=>Number(p.unapplied)>0);
 return <div className="crm-customer">
  <button className="back-btn" onClick={onBack}><ArrowLeft size={15}/> All customers</button>
  <div className="cust-head">
   <div><span className="acc-avatar big">{(customer.name||'?').slice(0,2).toUpperCase()}</span>
    <div><h2>{customer.name}</h2><p>{customer.email||'No email'} · {customer.country||'—'}</p></div></div>
   <div className="cust-head-actions">
    {canOrder&&<button className="crm-add" onClick={()=>setModal({t:'order'})}><Plus/> Add order</button>}
    {canOrder&&<button onClick={()=>setModal({t:'import'})}><Globe size={15}/> Import from website</button>}
    {canPay&&<button onClick={()=>setModal({t:'payment'})}><Wallet size={15}/> Record payment</button>}
   </div>
  </div>

  <div className="cust-kpis">
   {[['Ordered',totals.ordered],['Received',totals.received],['Unapplied funds',totals.unapplied],['Balance due',totals.due]]
     .map(([l,v])=><article key={l} className={l==='Unapplied funds'&&v>0?'highlight':''}><span>{l}</span><b>{money(v)}</b></article>)}
  </div>

  <section className="cust-panel">
   <h3>Website login</h3>
   {login?<div className="login-box">
     <div><small>LOGIN ID (EMAIL)</small><b>{login.email}</b></div>
     <div><small>LAST SIGNED IN</small><b>{login.last_sign_in_at?new Date(login.last_sign_in_at).toLocaleString():'Never'}</b></div>
     <div className="login-actions">
      {canLoginAs&&<button onClick={loginAs}><LogIn size={14}/> Open their account</button>}
      {canCust&&<button onClick={()=>setModal({t:'setpw'})}><KeyRound size={14}/> Set new password</button>}
      {canCust&&<button onClick={()=>post('send-reset',{customer_id:customerId}).then(()=>notify('Reset email sent to '+login.email)).catch(()=>{})}><Send size={14}/> Email reset link</button>}
     </div>
     <p className="crm-hint"><ShieldCheck size={13}/> Their password cannot be shown. Passwords are stored scrambled and even we cannot read them — that is what stops a leak from exposing your customers. Use “Set new password” if they are locked out, or “Open their account” to see exactly what they see.</p>
   </div>
   :<div className="login-box empty"><p>No website login yet.</p>
     {canCust&&<button className="crm-add" onClick={()=>setModal({t:'portal'})}><Plus/> Create login</button>}</div>}
  </section>

  <section className="cust-panel">
   <h3>Orders</h3>
   {!orders.length?<p className="muted">No orders yet.</p>
   :<div className="crm-table-wrap"><table><thead><tr><th>Order</th><th>Vehicle</th><th>Source</th><th>Amount</th><th>Paid</th><th>Balance</th><th>Status</th></tr></thead>
    <tbody>{orders.map(o=><tr key={o.id}>
     <td>{o.order_no}</td><td>{o.vehicle}</td>
     <td><em className="crm-status">{o.source==='website'?'Website':'Manual'}</em></td>
     <td>{money(o.amount)}</td><td>{money(o.paid)}</td>
     <td className={Number(o.balance_due)>0?'due':'clear'}>{money(o.balance_due)}</td>
     <td><em className={'crm-status '+o.status}>{pretty(o.status)}</em></td>
    </tr>)}</tbody></table></div>}
  </section>

  <section className="cust-panel">
   <h3>Payments received</h3>
   <p className="muted small">Money sits as unapplied funds until you apply it to an order. A car can be paid across as many payments as needed.</p>
   {!payments.length?<p className="muted">No payments recorded.</p>
   :<div className="ledger-list">{payments.map(p=><article key={p.id}>
     <div className="ledger-main">
      <b>{money(p.amount)} <small>{p.method}{p.tt_number?' · '+p.tt_number:''}</small></b>
      <small>{date(p.received_at)}{p.bank?' · '+p.bank:''}</small>
      <div className="ledger-split">
       <span>Applied {money(p.applied)}</span>
       <span className={Number(p.unapplied)>0?'unapplied':''}>Unapplied {money(p.unapplied)}</span>
      </div>
      {allocations.filter(a=>a.payment_id===p.id).map(a=>{
        const ord=orders.find(o=>o.id===a.order_id);
        return <div className="alloc-row" key={a.id}>
         <span><Link2 size={12}/> {money(a.amount)} → {ord?ord.order_no+' · '+ord.vehicle:'order'}</span>
         {canPay&&<button className="crm-del" title="Return to unapplied funds"
           onClick={()=>post('unallocate&id='+a.id,{},'DELETE')}><X size={12}/></button>}
        </div>})}
     </div>
     {canPay&&Number(p.unapplied)>0&&orders.some(o=>Number(o.balance_due)>0)&&
       <button className="save" onClick={()=>setModal({t:'apply',payment:p})}>Apply funds</button>}
    </article>)}</div>}
  </section>

  {modal&&<CustomerModal modal={modal} customer={customer} orders={orders} listings={listings}
    unapplied={unapplied} busy={busy} onClose={()=>setModal(null)} post={post} notify={notify}/>}
 </div>;
}

function CustomerModal({modal,customer,orders,listings,busy,onClose,post,notify}){
 const t=modal.t;
 const wrap=(title,sub,body,submit)=><div className="crm-modal-bg" onMouseDown={onClose}>
  <form className="crm-editor" onMouseDown={e=>e.stopPropagation()} onSubmit={submit}>
   <header><div><small>{sub}</small><h2>{title}</h2></div><button type="button" onClick={onClose}><X/></button></header>
   {body}
   <footer><button type="button" onClick={onClose}>Cancel</button><button className="save" disabled={busy}><Save/> {busy?'Saving…':'Save'}</button></footer>
  </form></div>;

 if(t==='order')return wrap('Add order','NEW ORDER',
  <div className="crm-editor-fields">
   <label>Vehicle<input name="vehicle" required placeholder="e.g. 2022 Toyota Land Cruiser ZX"/></label>
   <label>Amount (USD)<input name="amount" type="number" min="0" step="1" required/></label>
   <label>Stock no. (optional)<input name="stock_no"/></label>
   <label>Status<select name="status" defaultValue="pending">
     {['pending','confirmed','paid','shipped','delivered'].map(s=><option key={s} value={s}>{pretty(s)}</option>)}</select></label>
   <label>Notes<input name="notes"/></label>
  </div>,
  e=>{e.preventDefault();const f=new FormData(e.target);
   post('order',{customer_id:customer.id,vehicle:f.get('vehicle'),amount:f.get('amount'),
     stock_no:f.get('stock_no'),status:f.get('status'),notes:f.get('notes')})
     .then(()=>notify('Order added')).catch(()=>{})});

 if(t==='import')return wrap('Import from website','PICK A LISTED CAR',
  <div className="crm-editor-fields">
   <label>Website car<select name="listing_id" required defaultValue="">
    <option value="" disabled>Choose a car…</option>
    {listings.map(l=><option key={l.id} value={l.id}>
      {[l.year,l.make,l.model].filter(Boolean).join(' ')} — {l.price} ({l.stock_no})</option>)}
   </select></label>
   <p className="crm-hint">Price and details are copied from the website listing. You can edit the order afterwards.</p>
  </div>,
  e=>{e.preventDefault();const f=new FormData(e.target);
   post('import-listing',{customer_id:customer.id,listing_id:f.get('listing_id')})
    .then(()=>notify('Car imported into an order')).catch(()=>{})});

 if(t==='payment')return wrap('Record payment','MONEY RECEIVED',
  <div className="crm-editor-fields">
   <label>Amount (USD)<input name="amount" type="number" min="1" step="1" required/></label>
   <label>Method<select name="method" defaultValue="TT">{['TT','Cash','Card','Cheque','Other'].map(m=><option key={m}>{m}</option>)}</select></label>
   <label>TT / reference number<input name="tt_number" placeholder="e.g. TT-40219"/></label>
   <label>Bank<input name="bank"/></label>
   <label>Date received<input name="received_at" type="date" defaultValue={new Date().toISOString().slice(0,10)}/></label>
   <label>Note<input name="note"/></label>
   <p className="crm-hint">This is recorded as unapplied funds. You choose which order to apply it to next.</p>
  </div>,
  e=>{e.preventDefault();const f=new FormData(e.target);
   post('payment',{customer_id:customer.id,amount:f.get('amount'),method:f.get('method'),
     tt_number:f.get('tt_number'),bank:f.get('bank'),received_at:f.get('received_at'),note:f.get('note')})
    .then(()=>notify('Payment recorded as unapplied funds')).catch(()=>{})});

 if(t==='apply'){
  const p=modal.payment,open=orders.filter(o=>Number(o.balance_due)>0);
  return wrap('Apply funds','UNAPPLIED '+money(p.unapplied),
   <div className="crm-editor-fields">
    <label>Apply to order<select name="order_id" required defaultValue="">
     <option value="" disabled>Choose an order…</option>
     {open.map(o=><option key={o.id} value={o.id}>{o.order_no} · {o.vehicle} — due {money(o.balance_due)}</option>)}
    </select></label>
    <label>Amount<input name="amount" type="number" min="1" step="1" max={p.unapplied}
      defaultValue={Math.min(Number(p.unapplied),Number(open[0]?.balance_due||p.unapplied))} required/></label>
    <p className="crm-hint">You can split one payment across several orders, or leave part of it unapplied.</p>
   </div>,
   e=>{e.preventDefault();const f=new FormData(e.target);
    post('allocate',{payment_id:p.id,order_id:f.get('order_id'),amount:f.get('amount')})
     .then(()=>notify('Funds applied')).catch(()=>{})});
 }

 if(t==='portal')return wrap('Create website login','CUSTOMER PORTAL',
  <div className="crm-editor-fields">
   <label>Email (their login ID)<input name="email" type="email" required defaultValue={customer.email||''}/></label>
   <label>Starting password<input name="password" minLength={8} required placeholder="At least 8 characters"/></label>
   <p className="crm-hint">Send this to them however you normally talk to them, and ask them to change it after the first sign-in. They can also reset it themselves with “Forgot password” on the website.</p>
  </div>,
  e=>{e.preventDefault();const f=new FormData(e.target);
   post('create-portal',{customer_id:customer.id,email:f.get('email'),password:f.get('password')})
    .then(()=>notify('Website login created')).catch(()=>{})});

 if(t==='setpw')return wrap('Set new password','CUSTOMER LOGIN',
  <div className="crm-editor-fields">
   <label>New password<input name="password" minLength={8} required/></label>
   <p className="crm-hint">The old password cannot be recovered or displayed — only replaced.</p>
  </div>,
  e=>{e.preventDefault();const f=new FormData(e.target);
   post('set-customer-password',{customer_id:customer.id,password:f.get('password')})
    .then(()=>notify('Password changed')).catch(()=>{})});

 return null;
}
