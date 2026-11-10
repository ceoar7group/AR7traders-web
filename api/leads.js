import {adminClient,send} from './_supabase.js';
import {askLlm, llmConfigured} from '../scripts/goonet-core.mjs';
import {validateLead, leadFromRequest} from '../src/lead-validation.js';

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
const MAX={message:2000,history_item:500};
const cut=(v,max)=>String(v??'').trim().slice(0,max);

// Privacy-safe diagnostics: never log the request body, validation values,
// Supabase error details, or a provider response. Only a fixed stage and a
// standard error code reach the server log.
function logLeadFailure(stage,error){
 const raw=String(error?.code||'');
 const code=/^[A-Z0-9_]{1,32}$/.test(raw)?raw:'UNKNOWN';
 console.error('lead submission failed',{stage,code});
}
function publicFailure(error){
 const code=String(error?.code||'');
 const configured=/environment is not configured/i.test(String(error?.message||''));
 const unavailable=configured||['PGRST205','PGRST204','42P01','42703','42501','08006','08001','57014'].includes(code);
 return {status:unavailable?503:500,error:unavailable
  ?'The enquiry service is temporarily unavailable. Please try again or contact us directly.'
  :'Your enquiry could not be saved. Please try again or contact us directly.'};
}

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
  }catch(e){console.error('chat LLM failed, falling back to playbook',{state:String(e?.state||'error').slice(0,40)})}
 }
 return{reply:playbook(message,settings),source:'playbook'};
}

// Optional instant lead e-mail via Resend. The lead is already persisted
// before this runs. We await a bounded attempt (serverless can freeze a
// fire-and-forget promise after the response), but a mail outage never turns a
// saved enquiry into a failed submission. No personal detail is logged.
async function notifyLead(lead){
 const key=String(process.env.RESEND_API_KEY||'').trim();
 const to=String(process.env.LEAD_NOTIFY_TO||'').trim();
 if(!key||!to)return 'not-configured';
 const from=String(process.env.LEAD_FROM||'').trim()||'AR7 Traders <onboarding@resend.dev>';
 const subject='New website lead: '+lead.name;
 const lines=[
  'Name: '+lead.name,
  lead.email?'Email: '+lead.email:null,
  'Phone: '+lead.phone,
  'Country: '+lead.country,
  lead.budget?('Budget: $'+lead.budget):null,
  'Looking for: '+lead.vehicle_interest,
  lead.notes?lead.notes:null,
  'Source: '+(lead.source||'Website')
 ].filter(Boolean).join('\n');
 const controller=new AbortController();
 const timer=setTimeout(()=>controller.abort(),3000);
 try{
  const response=await fetch('https://api.resend.com/emails',{
   method:'POST',
   headers:{'Content-Type':'application/json',Authorization:'Bearer '+key},
   body:JSON.stringify({from,to,subject,text:lines,html:'<pre style="font-family:inherit;white-space:pre-wrap">'+lines.replace(/</g,'&lt;')+'</pre>'}),
   signal:controller.signal
  });
  if(!response.ok){console.error('lead notification failed',{stage:'notify',code:'HTTP_'+response.status});return 'failed';}
  return 'sent';
 }catch(error){
  console.error('lead notification failed',{stage:'notify',code:error?.name==='AbortError'?'TIMEOUT':'NETWORK'});
  return 'failed';
 }finally{clearTimeout(timer);}
}

// `injected` ({db}) is a test hook; Vercel always calls (req, res).
export default async function handler(req,res,injected={}){
 // WhatsApp Cloud API webhook rides this public function (?wa=webhook) — the
 // Hobby plan's 12-function cap rules out a 13th file, and this is already
 // the site's one public endpoint. GET is Meta's verify handshake, so it must
 // be accepted before the POST-only guard below.
 if(String(req.query?.wa||'')==='webhook'){
  const {waWebhook}=injected.waWebhook?{waWebhook:injected.waWebhook}:await import('./_wa.js');
  const db=injected.db||adminClient();
  return waWebhook(req,res,{db,env:injected.env||process.env,send});
 }
 if(req.method!=='POST')return send(res,405,{error:'Method not allowed'});
 try{
  let b=req.body||{};
  if(typeof b==='string'){try{b=JSON.parse(b||'{}')}catch{return send(res,400,{error:'Invalid request body'})}}
  if(!b||typeof b!=='object'||Array.isArray(b))return send(res,400,{error:'Invalid request body'});
  // A filled honeypot is not a persisted enquiry. Never answer with a fake
  // success that a browser could render as "sent".
  if(b.website)return send(res,400,{error:'Your enquiry could not be submitted. Please try again or contact us directly.'});

  // ---- On-site assistant chat ---------------------------------------------
  if(b.action==='chat'){
   const db=injected.db||adminClient();
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
  // Phone is mandatory for every public lead, including auction/vehicle/
  // machinery dialogs and account signup. Email stays optional at the API
  // boundary for phone-first buyers, but must be valid when supplied.
  const errors=validateLead(b);
  if(Object.keys(errors).length){
   const field=Object.keys(errors)[0];
   return send(res,400,{error:errors[field],field});
  }
  const payload=leadFromRequest(b);
  const db=injected.db||adminClient();
  const {data,error}=await db.from('leads').insert(payload).select('id').single();
  if(error){logLeadFailure('lead-insert',error);const failure=publicFailure(error);return send(res,failure.status,{error:failure.error})}
  if(!data?.id){logLeadFailure('lead-insert',{code:'NO_ID'});return send(res,500,{error:'Your enquiry could not be saved. Please try again or contact us directly.'})}
  // The activity row is an audit convenience, not the lead itself. If it
  // fails, the persisted lead still counts and the buyer gets an honest 201.
  try{
   const {error:activityError}=await db.from('activities').insert({action:'New website enquiry',actor:'Website',entity_type:'lead',entity_id:data.id});
   if(activityError)logLeadFailure('activity-insert',activityError);
  }catch(error){logLeadFailure('activity-insert',error)}
  const notification=injected.notify===false?'not-configured':await notifyLead(payload);
  return send(res,201,{ok:true,id:data.id,notification})
 }catch(e){
  logLeadFailure('request',e);
  const failure=publicFailure(e);
  return send(res,failure.status,{error:failure.error})
 }
}
