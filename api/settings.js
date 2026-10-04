import {requireUser,adminClient,send} from './_supabase.js';
import {requirePerm,log} from './_perm.js';
import {validateStockDiscounts} from '../src/stock-discounts.js';

// Site settings API.
//
// GET  (no auth)    → PUBLIC allowlist only: the contact fields the website
//                     renders and the exchange-rate block the currency picker
//                     reads. Nothing else — operational settings (importer
//                     tuning, run timestamps, internal defaults) must never be
//                     readable anonymously.
// GET  (Bearer)     → full settings, for signed-in staff (the CRM forms).
//                     Authenticated responses are private and never cached.
// PATCH (Bearer)    → admin-checked settings.write + key/value validation.
//
// `injected` ({db, getUser}) is a test hook; Vercel always calls (req, res).

// Exactly what an anonymous visitor may read. Keep in sync with the CRM's
// public "Website settings" fields and src/site-settings.js FALLBACK.
const PUBLIC_KEYS = [
  'contact_email', 'contact_phone', 'contact_address',
  'whatsapp_number', 'whatsapp_message', 'enquiry_inbox',
  'exchange_rates', 'exchange_rates_updated',
  // The live campaign, as a JSON string published from the staff-only SEO desk
  // (or by the existing campaign automation). Public on purpose:
  // it is the banner every visitor sees. Shape and bounds are validated below,
  // so this key can only ever hold a promotion — never arbitrary content.
  'promo',
  // Individual, public stock prices. Each entry is keyed by car:REF or
  // machine:REF; there is deliberately no catalogue-wide price discount.
  'stock_discounts'
];

// Every key the CRM or the importer may write. Unknown keys are rejected so
// the table cannot be used as an arbitrary storage channel.
const WRITABLE_KEYS = new Set([
  ...PUBLIC_KEYS.filter(k => k !== 'exchange_rates_updated'),
  'base_currency', 'default_customer_currency', 'exchange_rates_updated',
  'promo', 'stock_discounts',
  'goonet_search_url', 'goonet_min_photos', 'goonet_min_year',
  'goonet_max_new_per_run', 'goonet_max_delist_per_run',
  'goonet_weekly_delist_limit', 'goonet_weekly_promote_limit',
  'goonet_jpy_usd_rate', 'goonet_bookmark_page', 'goonet_auto_promote',
  'goonet_last_run_at', 'goonet_last_weekly_delist', 'goonet_last_weekly_promote'
]);

// Per-key value caps. exchange_rates is a JSON blob; everything else is short.
const MAX_VALUE = { exchange_rates: 8000, goonet_search_url: 500, promo: 1200, stock_discounts: 32000 };

// Campaign copy is public, and an optional owner-confirmed margin promotion
// must be honored in quotations. Itemized reductions shown on stock prices are
// separately keyed by car:REF or machine:REF in stock_discounts.
function validPromo(raw) {
  let promo;
  try { promo = JSON.parse(raw); } catch { return 'promo must be valid JSON'; }
  if (!promo || typeof promo !== 'object' || Array.isArray(promo)) return 'promo must be an object';
  if (typeof promo.active !== 'boolean') return 'promo.active must be true or false';
  if (!promo.active) return null;                       // an inactive promo needs nothing else
  for (const field of ['headline', 'cta', 'href']) {
    if (!promo[field] || typeof promo[field] !== 'string') return `promo.${field} is required`;
  }
  if (promo.headline.length > 90) return 'promo.headline is too long (max 90 characters)';
  if (promo.sub && String(promo.sub).length > 220) return 'promo.sub is too long (max 220 characters)';
  if (!/^\//.test(promo.href) || /\/\//.test(promo.href)) return 'promo.href must be an internal path (start with /)';
  if (promo.discount != null) {
    const d = Number(promo.discount);
    if (!Number.isFinite(d) || d <= 0 || d > 40) return 'promo.discount must be between 1 and 40';
  }
  if (promo.until != null) {
    const until = String(promo.until);
    const date = /^\d{4}-\d{2}-\d{2}$/.test(until) ? new Date(`${until}T00:00:00.000Z`) : null;
    if (!date || !Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== until)
      return 'promo.until must be a real YYYY-MM-DD date';
  }
  return null;
}

function validate(key, value) {
  if (!WRITABLE_KEYS.has(key)) return `Unknown setting key "${key}"`;
  if (value !== null && typeof value === 'object') return `Value for "${key}" must be a string`;
  const s = String(value ?? '');
  const max = MAX_VALUE[key] || 300;
  if (s.length > max) return `Value for "${key}" is too long (max ${max} characters)`;
  if ((key === 'contact_email' || key === 'enquiry_inbox') && s && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) {
    return `"${key}" must be a valid email address`;
  }
  if (key === 'promo' && s) return validPromo(s);
  if (key === 'stock_discounts') {
    const checked = validateStockDiscounts(s);
    return checked.ok ? null : checked.error;
  }
  return null; // valid
}

export default async function handler(req,res,injected={}){
 try{
  if(req.method==='GET'){
   const db=injected.db||adminClient();
   const {data,error}=await db.from('site_settings').select('key,value,label').order('key');
   if(error)throw error;
   const rows=data||[];
   const all=Object.fromEntries(rows.map(r=>[r.key,r.value]));
   const authHeader=req.headers.authorization||'';
   if(authHeader.startsWith('Bearer ')){
    // Authenticated read (CRM settings + importer forms). A bad token is a
    // real 401 so the CRM can re-auth, never a silent downgrade to public.
    const getUser=injected.getUser||requireUser;
    const {profile}=await getUser(req);
    res.setHeader('Cache-Control','private, no-store');
    return send(res,200,all);
   }
   const pub={};
   for(const k of PUBLIC_KEYS) if(all[k]!=null&&all[k]!=='') pub[k]=all[k];
   res.setHeader('Cache-Control','public, max-age=60, s-maxage=300');
   return send(res,200,pub);
  }
  if(req.method==='PATCH'){
   // Tests inject {db, getUser}; production uses requireUser, which returns
   // the profile and an admin-scoped database client.
   const useInjected=!!(injected.db&&injected.getUser);
   const {profile,db}=useInjected
     ?{profile:(await injected.getUser(req)).profile,db:injected.db}
     :await (injected.getUser||requireUser)(req);
   if(injected.permsFor){
    // Test hook: same rule as requirePerm, resolved against an injected
    // permission table instead of the live role_permissions rows.
    const allowed=profile?.role==='admin'||!!(await injected.permsFor(profile?.role))['settings.write'];
    if(!allowed)return send(res,403,{error:`Your role (${profile?.role}) is not allowed to do this`});
   }else{
    await requirePerm(profile,'settings.write');
   }
   const updates=req.body||{};
   const keys=Object.keys(updates);
   if(!keys.length)return send(res,400,{error:'Nothing to update'});
   // Validate every key and value BEFORE touching the database.
   const problems=keys.map(k=>validate(k,updates[k])).filter(Boolean);
   if(problems.length)return send(res,400,{error:'Invalid settings: '+problems.join('; ')});
   for(const k of keys){
    // Upsert so newly introduced operational settings (for example the
    // customer default currency) also work on databases provisioned before
    // that key was added to the seed script.
    const {error}=await db.from('site_settings').upsert({
      key:k,value:String(updates[k]??''),updated_at:new Date().toISOString()
    },{onConflict:'key'});
    if(error)throw error;
   }
   await log(db,profile,`Updated website contact settings (${keys.join(', ')})`,'site_settings',null);
   return send(res,200,{ok:true});
  }
  return send(res,405,{error:'Method not allowed'});
 }catch(e){console.error(e);return send(res,e.status||500,{error:e.message||'Settings request failed'})}
}
