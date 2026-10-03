import {adminClient,send} from './_supabase.js';
import {askLlm, llmConfigured} from '../scripts/goonet-core.mjs';

// guardian:public-endpoint — deliberate, and the only one on the site.
// Public enquiry endpoint — the only unauthenticated write on the site, so
// every field is length-capped and shape-checked before it reaches the
// database. Without a cap a single crafted POST could store a megabyte of
// text in leads.name, and a malformed email would land in the CRM looking
// real.
//
// Two request shapes, one function (the Vercel Hobby plan allows 12
// serverless functions — a separate chat function would be the 13th):
//   • plain lead   — the enquiry form (name/email/phone/country/interest)
//   • {action:'chat', message, history} — the on-site assistant widget.
//     With GEMINI_API_KEY (or OPENAI_API_KEY) the answer is grounded in the
//     LIVE site_listings + the contact settings; without a key a canned
//     playbook answers. Either way the widget always gets a 200 reply.
//
// Lead e-mail (optional): when RESEND_API_KEY + LEAD_NOTIFY_TO are set, each
// new lead also triggers a Resend e-mail. Fire-and-forget on purpose — the
// 201 goes out immediately and a mail failure can never block or fail the
// form.
const MAX={name:120,email:200,phone:40,country:80,vehicle_interest:180,message:2000,history_item:500};
const EMAIL_RE=/^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const cut=(v,max)=>String(v??'').trim().slice(0,max);

// Owner-confirmed defaults (src/site-settings.js PUBLIC_CONTACTS) — used only
// if the site_settings rows are missing, so the playbook always names a real
// inbox.
const FALLBACK_CONTACTS={contact_email:'ar7tradersinfo@gmail.com',whatsapp_number:'+447347132624'};

async function settingsFlat(db){
 try{
  const {data}=await db.from('site_settings').select('key,value');
  return Object.fromEntries((data||[]).map(r=>[r.key,r.value]));
 }catch(e){return {}}
}

// Live, published website stock — the ground truth the assistant may cite.
async function liveStock(db){
 try{
  const {data}=await db.from('site_listings').select('make,model,year,km,fuel,body,price,location,published,status').limit(40);
  return (data||[]).filter(r=>r.published!==false).slice(0,30)
   .map(r=>`${r.year||'?'} ${r.make||'?'} ${r.model||''} · ${r.km||'?'}km · ${r.price||'?'} · ${r.location||'Japan'}${r.status?' · '+r.status:''}`)
   .join('\n');
 }catch(e){return ''}
}

function assistantSystem(settings,stock){
 const email=settings.contact_email||FALLBACK_CONTACTS.contact_email;
 const wa=settings.whatsapp_number||FALLBACK_CONTACTS.whatsapp_number;
 return 'You are the on-site sales assistant for AR7 Traders, a Japanese vehicle exporter based in Tokyo. '
 +'Answer ONLY with the company details and the live stock list below. Be friendly and concise (under 120 words, plain text, no markdown). '
 +"Never invent cars, prices, or delivery dates — if the stock list does not cover the buyer's ask, say you will check with the team. "
 +'When the buyer needs a next step (quote, paperwork, shipping), include the contact details. '
 +'Company: email '+email+' · WhatsApp '+wa+'. '
 +'Live stock (one per line): '+(stock||'(no live stock loaded)');
}

// No LLM key (or the LLM call failed): a short, honest playbook that always
// ends with a real way to reach a human.
function playbook(message,settings){
 const s=String(message||'').toLowerCase();
 const email=settings.contact_email||FALLBACK_CONTACTS.contact_email;
 const wa=settings.whatsapp_number||FALLBACK_CONTACTS.whatsapp_number;
 if(/^(hi|hello|hey|good (morning|afternoon|evening))\b/.test(s))
  return "Hello! I'm the AR7 Traders assistant. I can tell you about our live Japan stock, shipping, and pricing — what can I help with?";
 if(/(price|cost|how much|quote|budget|deposit)/.test(s))
  return 'Our cars are listed with an export price from Japanese auctions and dealer stock. For a firm quote — including shipping to your port — email '+email+' or WhatsApp '+wa+' with the car you have in mind and the team will reply the same day.';
 if(/(ship|deliver|lead time|leadtime|how long|port|freight|customs)/.test(s))
  return 'We ship worldwide from Japanese ports; typical lead time is 4–8 weeks door-to-door depending on destination and customs. For a shipping quote to your port, email '+email+' or WhatsApp '+wa+'.';
 if(/(stock|available|in stock|vehicle|car|suv|sedan|mpv|hybrid|toyota|nissan|honda|mazda|suzuki|land cruiser|year|mileage)/.test(s))
  return "I keep a live list of Japan stock — the Japan dealer stock page shows what's available right now. Tell me the make, model and year you want and I'll flag it for the team, or email "+email+' / WhatsApp '+wa+' and we will start sourcing.';
 if(/(human|agent|person|talk|someone|email|whatsapp|contact)/.test(s))
  return 'Of course — email '+email+' or WhatsApp '+wa+' and a member of the team will take it from there.';
 return 'Thanks for your message! I can help with questions about our Japan stock, shipping, and pricing. For anything else, email '+email+' or WhatsApp '+wa+' — the team replies fast.';
}

async function chatReply({message,history,settings,db}){
 if(llmConfigured()){
  try{
   const stock=await liveStock(db);
   const r=await askLlm({
    system:assistantSystem(settings,stock),
    messages:[...history.map(h=>({role:h.role,content:h.content})),{role:'user',content:message}],
    json:false,maxTokens:400,timeoutMs:20000
   });
   if(r.text&&r.text.trim())return{reply:r.text.trim().slice(0,4000),source:'gemini'};
  }catch(e){console.error('chat LLM failed, falling back to playbook',e.message)}
 }
 return{reply:playbook(message,settings),source:'playbook'};
}

// Optional instant lead e-mail via Resend. Fire-and-forget: the caller never
// awaits this, so the 201 is never blocked or failed by the mail provider.
// Without RESEND_API_KEY or LEAD_NOTIFY_TO it is a silent no-op.
function notifyLead(lead){
 const key=String(process.env.RESEND_API_KEY||'').trim();
 const to=String(process.env.LEAD_NOTIFY_TO||'').trim();
 if(!key||!to)return;
 const from=String(process.env.LEAD_FROM||'').trim()||'AR7 Traders <onboarding@resend.dev>';
 const subject='New website lead: '+lead.name;
 const lines=[
  'Name: '+lead.name,
  lead.email?'Email: '+lead.email:null,
  lead.phone?'Phone: '+lead.phone:null,
  'Country: '+lead.country,
  lead.budget?('Budget: $'+lead.budget):null,
  'Looking for: '+lead.vehicle_interest,
  'Source: '+(lead.source||'Website')
 ].filter(Boolean).join('\n');
 fetch('https://api.resend.com/emails',{
  method:'POST',
  headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},
  body:JSON.stringify({from,to,subject,text:lines,html:'<pre style="font-family:inherit;white-space:pre-wrap">'+lines.replace(/</g,'&lt;')+'</pre>'})
 }).catch(e=>console.error('lead notify failed',e.message));
}

// `injected` ({db}) is a test hook; Vercel always calls (req, res).
export default async function handler(req,res,injected={}){
 if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
 try{
  const b=req.body||{};if(b.website)return send(res,200,{ok:true});
  const db=injected.db||adminClient();

  // ---- On-site assistant chat ---------------------------------------------
  if(b.action==='chat'){
   const message=cut(b.message,MAX.message);
   if(!message)return send(res,400,{error:'Message is required'});
   const history=Array.isArray(b.history)?b.history.slice(-8).map(h=>({
    role:h?.role==='assistant'?'assistant':'user',
    content:cut(String(h?.content||''),MAX.history_item)
   })).filter(h=>h.content):[];
   const settings=await settingsFlat(db);
   const {reply,source}=await chatReply({message,history,settings,db});
   return send(res,200,{ok:true,reply,source});
  }

  // ---- Enquiry form ---------------------------------------------------------
  const name=cut(b.name,MAX.name),email=cut(b.email,MAX.email),phone=cut(b.phone,MAX.phone);
  if(name.length<2||(!email&&!phone))return send(res,400,{error:'Name and email or phone are required'});
  if(email&&!EMAIL_RE.test(email))return send(res,400,{error:'Please enter a valid email address'});
  const budget=Number(b.budget);
  const safeBudget=Number.isFinite(budget)&&budget>0?budget:null;
  const payload={name,email:email||null,phone:phone||null,
   country:cut(b.country,MAX.country)||'Other',
   vehicle_interest:cut(b.vehicle_interest??b.vehicle,MAX.vehicle_interest)||'General enquiry',
   source:'Website',status:'new',budget:safeBudget};
  const {data,error}=await db.from('leads').insert(payload).select('id').single();if(error)throw error;
  await db.from('activities').insert({action:`New website lead: ${name}`,actor:'Website',entity_type:'lead',entity_id:data.id});
  notifyLead(payload); // fire-and-forget — the 201 below never waits for mail
  return send(res,201,{ok:true,id:data.id})
 }catch(e){console.error(e);return send(res,500,{error:'Unable to submit enquiry'})}
}
