import React,{useEffect,useState} from 'react';
import {LayoutDashboard,Users,UserRound,Wallet,CarFront,FileText,Ship,CheckSquare,Globe,Newspaper,ShieldAlert,UserCog,Briefcase,Settings,Activity,LogOut,Search,Plus,Mail,MessageCircle,ChevronRight,Clock3,DollarSign,TrendingUp,X,Save,RefreshCw,Menu,ShieldCheck,Database,Trash2,KeyRound,LogIn,ArrowLeft,Check,Ban,Send,Link2,Phone} from 'lucide-react';
import {supabase} from './supabase-client.js';
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
 routes:{title:'Shipping routes',subtitle:'Destinations and freight rates used by the shipping 
