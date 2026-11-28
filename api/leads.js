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

// Instant lead e-mail.
//
// 2026-11-25 (owner: "can you do lead emails with my current email?"). Two
// things were wrong with the old version, both silent:
//   • the recipient came ONLY from the LEAD_NOTIFY_TO env var, so the address
//     the owner edits in CRM → Settings ("Enquiry inbox") was ignored — changing
//     it there did nothing;
//   • when Resend refused (an unverified sender, a wrong key) the failure was
//     a console line nobody reads, and the form still looked fine.
//
// Recipients now resolve in the order the owner expects: the CRM's enquiry
// inbox, then LEAD_NOTIFY_TO, then the public contact address, then the
// built-in fallback — comma-separated lists allowed, invalid addresses dropped.
// The sender is LEAD_FROM when set (a verified domain address), otherwise
// Resend's onboarding sender, whose restriction is explained in the returned
// hint instead of being left as a mystery 403.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_RECIPIENTS = 5;

/** Who receives the lead email. Pure and exported so the contract is testable. */
export function leadRecipients(settings = {}, env = process.env) {
  const seen = new Set();
  const out = [];
  const add = value => String(value || '')
    .split(/[,;]+/)
    .map(part => part.trim().toLowerCase())
    .filter(part => EMAIL_RE.test(part))
    .forEach(part => { if (!seen.has(part)) { seen.add(part); out.push(part); } });
  add(settings.enquiry_inbox);
  add(env.LEAD_NOTIFY_TO);
  add(settings.contact_email);
  // The built-in address is a last resort ONLY: adding it to every send would
  // quietly mail a second inbox the owner never asked for.
  if (!out.length) add(FALLBACK_CONTACTS.contact_email);
  return out.slice(0, MAX_RECIPIENTS);
}

/** The From: line. A verified domain address is what actually delivers. */
export function leadSender(env = process.env) {
  const from = String(env.LEAD_FROM || '').trim();
  return from || 'AR7 Traders <onboarding@resend.dev>';
}

/** Which providers have a key. Resend first, Brevo second — both free plans. */
export function leadProviders(env = process.env) {
  const list = [];
  if (String(env.RESEND_API_KEY || '').trim()) list.push('resend');
  if (String(env.BREVO_API_KEY || '').trim()) list.push('brevo');
  return list;
}

async function postJson(url, headers, payload, { fetch: fetchImpl, timeout }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(payload),
      signal: controller.signal
    });
    return { ok: !!response.ok, status: Number(response.status) || 0 };
  } catch (error) {
    return { ok: false, status: 0, code: error?.name === 'AbortError' ? 'TIMEOUT' : 'NETWORK' };
  } finally {
    clearTimeout(timer);
  }
}

/** Send one message through one provider. Returns {ok, status, code}. */
async function sendVia(provider, { env, from, to, subject, text, html, fetch: fetchImpl, timeout = 4000 }) {
  if (provider === 'brevo') {
    const payload = {
      sender: { name: 'AR7 Traders', email: (from.match(/<([^>]+)>/)?.[1] || from).trim() },
      to: to.map(email => ({ email })),
      subject, textContent: text, htmlContent: html
    };
    const out = await postJson('https://api.brevo.com/v3/smtp/email', { 'api-key': String(env.BREVO_API_KEY).trim() }, payload, { fetch: fetchImpl, timeout });
    return { ...out, provider };
  }
  const payload = { from, to, subject, text, html };
  const out = await postJson('https://api.resend.com/emails', { Authorization: 'Bearer ' + String(env.RESEND_API_KEY).trim() }, payload, { fetch: fetchImpl, timeout });
  return { ...out, provider: 'resend' };
}

const FAILURE_HINTS = {
  resend: status => status === 403
    ? 'Resend refused the sender. onboarding@resend.dev can only deliver to the Resend account owner — verify ar7traders.com at resend.com/domains and set LEAD_FROM to an address on it (e.g. leads@ar7traders.com).'
    : (status === 401 ? 'The Resend API key was rejected — create a new key and update RESEND_API_KEY.'
      : (status === 422 ? 'Resend rejected the message (422) — usually an unverified sender or an address it will not deliver to.'
        : 'Resend returned ' + status + '.')),
  brevo: status => status === 401
    ? 'The Brevo API key was rejected — update BREVO_API_KEY.'
    : (status === 400 ? 'Brevo rejected the sender — verify the sender address in Brevo → Senders & IPs.'
      : 'Brevo returned ' + status + '.')
};

/**
 * Send one lead email. Never throws and never blocks the enquiry: the lead is
 * already saved before this runs, and a mail outage must not fail a submission.
 *
 * Two recipients and one free provider with a sender restriction is a normal
 * situation (owner's case, 2026-11-25): Resend will refuse an address that is
 * not the account owner. So a refused batch is retried ONE RECIPIENT AT A TIME —
 * the inbox the provider accepts still gets the lead, and the caller is told
 * exactly which address was refused and why, instead of losing the whole email.
 */
export async function notifyLead(lead, {
  settings = null, env = process.env, fetch: fetchImpl = globalThis.fetch
} = {}) {
  const to = leadRecipients(settings || {}, env);
  const from = leadSender(env);
  const providers = leadProviders(env);
  if (!providers.length) {
    return { status: 'not-configured', to, from, code: 'NO_KEY', delivered: [], refused: [],
      hint: 'No email provider key is set. Add RESEND_API_KEY in Vercel (free plan: 3,000 emails/month) — leads are still saved either way.' };
  }
  if (!to.length) {
    return { status: 'not-configured', to: [], from, code: 'NO_RECIPIENT', delivered: [], refused: [],
      hint: 'No valid recipient address. Set CRM → Settings → Enquiry inbox to the address that should receive leads.' };
  }
  if (typeof fetchImpl !== 'function') {
    return { status: 'failed', to, from, code: 'NO_FETCH', delivered: [], refused: to,
      hint: 'This runtime cannot make outbound requests.' };
  }
  const subject = 'New website lead: ' + lead.name;
  const lines = [
    'Name: ' + lead.name,
    lead.email ? 'Email: ' + lead.email : null,
    'Phone: ' + lead.phone,
    'Country: ' + lead.country,
    lead.budget ? ('Budget: $' + lead.budget) : null,
    'Looking for: ' + lead.vehicle_interest,
    lead.notes ? lead.notes : null,
    isTestLead(lead) ? 'This is the settings test button. It is not a customer enquiry.' : null,
    'Source: ' + (lead.source || 'Website')
  ].filter(Boolean).join('\n');
  const html = '<pre style="font-family:inherit;white-space:pre-wrap">' + lines.replace(/</g, '&lt;') + '</pre>';
  const base = { env, from, subject, text: lines, html, fetch: fetchImpl };

  let lastFailure = null;
  for (const provider of providers) {
    const batch = await sendVia(provider, { ...base, to });
    if (batch.ok) return { status: 'sent', to, from, provider, code: null, delivered: to, refused: [], hint: null };
    lastFailure = batch;

    // One bad address must not cost the other inbox its copy.
    if (to.length > 1) {
      const delivered = [];
      const refused = [];
      for (const address of to) {
        const single = await sendVia(provider, { ...base, to: [address], timeout: 2500 });
        if (single.ok) delivered.push(address); else refused.push(address);
        if (!single.ok) lastFailure = single;
      }
      if (delivered.length) {
        return {
          status: refused.length ? 'partial' : 'sent', to, from, provider,
          code: refused.length ? 'HTTP_' + (lastFailure.status || 0) : null,
          delivered, refused,
          hint: refused.length
            ? 'Delivered to ' + delivered.join(', ') + '. ' + refused.join(', ') + ' was refused (' + (lastFailure.code || 'HTTP_' + lastFailure.status) + '). ' + FAILURE_HINTS[provider](lastFailure.status)
            : null
        };
      }
    }
  }

  const status = lastFailure?.status || 0;
  const code = lastFailure?.code || ('HTTP_' + status);
  console.error('lead notification failed', { stage: 'notify', code });
  return {
    status: 'failed', to, from, provider: providers[0], code, delivered: [], refused: to,
    hint: (FAILURE_HINTS[providers[0]] || (() => 'The provider returned ' + status + '.'))(status)
      || (code === 'NETWORK' ? 'The email provider could not be reached. The lead is saved; check the Vercel function log.' : 'The email provider refused the message.')
  };
}

const isTestLead = lead => /settings test/i.test(String(lead?.source || '')) || /test lead/i.test(String(lead?.name || ''));

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
  // The email is a convenience on top of a saved lead: its outcome is reported
  // to the caller but never changes the 201.
  const notify = injected.notify === false
    ? { status: 'not-configured', to: [], code: 'SKIPPED', hint: null }
    : await notifyLead(payload, { settings: await settingsFlat(db), env: injected.env || process.env, fetch: injected.fetch });
  if (notify.status === 'failed') logLeadFailure('notify', { code: notify.code });
  return send(res,201,{ok:true,id:data.id,notification:notify.status})
 }catch(e){
  logLeadFailure('request',e);
  const failure=publicFailure(e);
  return send(res,failure.status,{error:failure.error})
 }
}
