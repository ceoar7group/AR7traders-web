// Quick-quote wizard — "three taps, one written quote".
//
// WHY THIS EXISTS (owner: "more clients"): the enquiry form asks a cold
// visitor for everything at once. This section asks three multiple-choice
// questions a buyer can answer without thinking — destination market, budget
// band, body type — then shows the LIVE cars in Japan that match (honest
// numbers from the same `cars` list the inventory renders, never an invented
// count; CLAIMS-POLICY.md) and finishes with the two lowest-friction exits:
// a two-field quote request into /api/leads, or a WhatsApp message with the
// three answers pre-filled.
//
// It is lazy-loaded (see DeferredQuickQuote in main.jsx) so none of this code
// or CSS rides the first-load budget; only the English i18n keys do.
import React, {useMemo, useState} from 'react';
import {ArrowRight, Check, Ship, MessageCircle, RotateCcw} from 'lucide-react';
import {DEST} from './destinations.js';
import {Flag} from './flag.jsx';
import {useLang} from './i18n.jsx';
import {CURRENCIES, convert, currencyOf, useCurrency} from './currency.jsx';
import {useSettings, waLink} from './site-settings.js';
import {validateLead} from './lead-validation.js';
import {linkClick} from './routing.js';
import {WhatsAppIcon} from './brand-icons.jsx';
import './quick-quote.css';

const priceOf = c => typeof c?.price === 'number' ? c.price : Number(String(c?.price ?? '').replace(/[^0-9.]/g, '')) || 0;
const refOf = c => String(c?.stock_no ?? c?.id ?? '').trim();

// [key, lowUSD, highUSD, English label for the staff-facing message]
const BUDGETS = [
  ['b1', 0, 5000, 'under $5,000'],
  ['b2', 5000, 10000, '$5,000-$10,000'],
  ['b3', 10000, 15000, '$10,000-$15,000'],
  ['b4', 15000, Infinity, '$15,000+'],
  ['bAny', 0, Infinity, 'budget open']
];
// Body chips match on the car's own `body` field (substring, case-blind), so
// the match count can never disagree with what /inventory would show.
const BODIES = ['SUV', 'Sedan', 'Hatchback', 'Van', 'Truck', 'Kei'];
const TOP_MARKETS = 8; // chips; every other market sits in the select below

// 2026-11-17 (owner: "ask the budget in the relevant currency, or let them
// select one"): picking a destination pre-selects that market's currency, and
// the budget step carries a selector for the rest. Only currencies the site's
// FX engine actually quotes (src/currency.jsx) are mapped — markets priced in
// an unquoted currency (Tanzania, Uganda…) stay on USD, the invoicing base.
const DEST_CURRENCY = {
  'Pakistan': 'PKR', 'UAE': 'AED', 'Kenya': 'KES', 'United Kingdom': 'GBP',
  'New Zealand': 'NZD', 'Australia': 'AUD', 'USA': 'USD',
  'Ireland': 'EUR', 'Cyprus': 'EUR', 'Malta': 'EUR'
};
// "₨ 1.4M", "£3.9K" — approximate by design (the quote itself is written in
// USD), so the figure is rounded and compact, never false-precise.
const compactMoney = (usd, code, rates) => {
  const cur = currencyOf(code);
  const v = convert(usd, code, rates);
  const n = new Intl.NumberFormat('en-US', {notation: 'compact', maximumFractionDigits: 1}).format(v);
  return cur.symbol + (/[A-Za-z]$/.test(cur.symbol) ? ' ' : '') + n;
};

export default function QuickQuoteSection({navigate, cars}) {
 const {t} = useLang();
 const s = useSettings();
 const {rates} = useCurrency();
 const [step, setStep] = useState(0);
 const [country, setCountry] = useState('');
 const [budget, setBudget] = useState('');
 const [body, setBody] = useState('');
 // '' = follow the destination's currency; a code = the visitor's own pick.
 const [curPick, setCurPick] = useState('');
 const curCode = curPick || DEST_CURRENCY[country] || 'USD';
 const [name, setName] = useState('');
 const [phone, setPhone] = useState('');
 const [busy, setBusy] = useState(false);
 const [done, setDone] = useState(false);
 const [err, setErr] = useState('');

 const dest = DEST.find(x => x[0] === country);
 const budgetRow = BUDGETS.find(b => b[0] === budget);
 const list = Array.isArray(cars) ? cars : [];

 const matches = useMemo(() => {
  if (!budgetRow) return [];
  const [, lo, hi] = budgetRow;
  return list.filter(c => {
   if (!c || c.published === false || !refOf(c)) return false;
   if (String(c.status || '').trim().toLowerCase() === 'sold') return false;
   if (budget !== 'bAny') { const p = priceOf(c); if (!(p >= lo && p < hi)) return false; }
   if (body && body !== 'any' && !String(c.body || '').toLowerCase().includes(body.toLowerCase())) return false;
   return true;
  });
 }, [list, budget, budgetRow, body]);

 const bodyEn = body === 'any' ? 'any body type' : body;
 // Staff see the USD band (the invoicing base) plus the buyer's own money so
 // the desk can reply in the currency the buyer was thinking in.
 const localBand = () => {
  if (!budgetRow || budgetRow[0] === 'bAny' || curCode === 'USD') return '';
  const [, lo, hi] = budgetRow;
  const span = hi === Infinity ? compactMoney(lo, curCode, rates) + '+'
   : lo === 0 ? 'under ' + compactMoney(hi, curCode, rates)
   : compactMoney(lo, curCode, rates) + '–' + compactMoney(hi, curCode, rates);
  return ' (≈ ' + span + ' ' + curCode + ')';
 };
 const budgetEn = budgetRow ? budgetRow[3] + localBand() : 'not set';
 const waMsg = 'Hello AR7! Quick quote request — destination: ' + (country || 'not set') +
  '; budget: ' + budgetEn + '; body type: ' + (bodyEn || 'not set') + '.';

 async function submit(e) {
  e.preventDefault();
  const values = {
   name, phone, country: country || 'Other',
   vehicle_interest: ('Quick quote: ' + (bodyEn || 'car') + ' · ' + (budgetRow ? budgetRow[3] : 'budget open')).slice(0, 180),
   message: 'Quick-quote wizard — destination: ' + (country || 'not set') + ', budget: ' +
    budgetEn + ', body type: ' + (bodyEn || 'not set') +
    '. Live matches shown at submit time: ' + matches.length + '.',
   website: ''
  };
  const errors = validateLead(values);
  if (errors.name || errors.phone) { setErr(errors.name || errors.phone); return; }
  setBusy(true); setErr('');
  try {
   const r = await fetch('/api/leads', {
    method: 'POST', headers: {'Content-Type': 'application/json'},
    body: JSON.stringify({...values, source: 'Website'})
   });
   const j = await r.json().catch(() => ({}));
   if (!r.ok) throw new Error(j.error || '');
   setDone(true);
  } catch (e2) { setErr(e2.message || t('qq.err')); }
  finally { setBusy(false); }
 }

 const reset = () => { setStep(0); setCountry(''); setBudget(''); setBody(''); setCurPick(''); setDone(false); setErr(''); };
 // A new destination re-derives the currency; an explicit pick only sticks
 // within the run it was made in.
 const pickCountry = v => { setCountry(v); setCurPick(''); setStep(1); };
 const pickBudget = v => { setBudget(v); setStep(2); };
 const pickBody = v => { setBody(v); setStep(3); };
 const crumbs = [
  country && {label: country, icon: <Flag c={country} w={18} h={12}/>, to: 0},
  budget && {label: t('qq.' + budget), to: 1},
  body && {label: body === 'any' ? t('qq.anyBody') : body, to: 2}
 ].filter(Boolean);

 return <section className="qq shell section" id="quick-quote" aria-label="Quick quote wizard">
  <div className="section-head"><div>
   <div className="kicker"><span className="live-dot"/> {t('qq.kicker')}</div>
   <h2>{t('qq.h2a')}<br/><em>{t('qq.h2em')}</em></h2>
  </div><p>{t('qq.body')}</p></div>

  <div className="qq-panel" data-step={step}>
   <div className="qq-steps" role="tablist" aria-label="Quote steps">
    {[t('qq.step1'), t('qq.step2'), t('qq.step3')].map((label, i) =>
     <button key={label} type="button" role="tab" aria-selected={step === i}
       className={'qq-step' + (step === i ? ' active' : '') + (i < step ? ' done' : '')}
       onClick={() => i <= step && setStep(i)} disabled={i > step && !(i === 1 && country) && !(i === 2 && budget)}>
      <span>{i < step ? <Check/> : i + 1}</span>{label}
     </button>)}
   </div>

   {crumbs.length > 0 && !done && <div className="qq-crumbs">
    {crumbs.map(c => <button key={c.label} type="button" onClick={() => setStep(c.to)}>{c.icon}{c.label}</button>)}
    <button type="button" className="qq-restart" onClick={reset}><RotateCcw/> {t('qq.restart')}</button>
   </div>}

   {step === 0 && <div className="qq-grid" role="group" aria-label={t('qq.step1')}>
    {DEST.slice(0, TOP_MARKETS).map(x =>
     <button key={x[0]} type="button" className={'qq-chip' + (country === x[0] ? ' active' : '')} onClick={() => pickCountry(x[0])}>
      <Flag c={x[0]} w={24} h={16}/><b>{x[0]}</b><small><Ship/> {x[2]}</small>
     </button>)}
    <label className="qq-more">
     {t('qq.more')}
     <select value={DEST.slice(TOP_MARKETS).some(x => x[0] === country) || country === 'Other' ? country : ''}
       onChange={e => e.target.value && pickCountry(e.target.value)}>
      <option value=""></option>
      {DEST.slice(TOP_MARKETS).map(x => <option key={x[0]} value={x[0]}>{x[0]} — {x[1].split(' / ')[0]}</option>)}
      <option value="Other">{t('qq.other')}</option>
     </select>
    </label>
   </div>}

   {step === 1 && <>
    {/* The bands stay USD underneath (the written quote is invoiced in USD);
        the chips LEAD with the buyer's money so the amounts mean something
        at a glance. Figures are compact and approximate by design. */}
    <label className="qq-cur">
     <span>{t('qq.showIn')}</span>
     <select value={curCode} onChange={e => setCurPick(e.target.value)} aria-label={t('qq.showIn')}>
      {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code} — {c.name}</option>)}
     </select>
    </label>
    <div className="qq-grid qq-budgets" role="group" aria-label={t('qq.step2')}>
     {BUDGETS.map(([k, lo, hi]) => {
      const local = curCode !== 'USD' && k !== 'bAny';
      const localLabel = !local ? null
       : hi === Infinity ? t('qq.xPlus', {x: compactMoney(lo, curCode, rates)})
       : lo === 0 ? t('qq.underX', {x: compactMoney(hi, curCode, rates)})
       : compactMoney(lo, curCode, rates) + '–' + compactMoney(hi, curCode, rates);
      return <button key={k} type="button" className={'qq-chip' + (budget === k ? ' active' : '')} onClick={() => pickBudget(k)}>
       <b>{local ? localLabel : t('qq.' + k)}</b>
       <small>{local ? t('qq.' + k) + ' · FOB' : 'FOB'}</small>
      </button>;
     })}
    </div>
   </>}

   {step === 2 && <div className="qq-grid qq-bodies" role="group" aria-label={t('qq.step3')}>
    {BODIES.map(b =>
     <button key={b} type="button" className={'qq-chip' + (body === b ? ' active' : '')} onClick={() => pickBody(b)}>
      <b>{b}</b>
     </button>)}
    <button type="button" className={'qq-chip' + (body === 'any' ? ' active' : '')} onClick={() => pickBody('any')}>
     <b>{t('qq.anyBody')}</b>
    </button>
   </div>}

   {step === 3 && !done && <div className="qq-final">
    <div className="qq-matches">
     {/* 2026-11-17 (owner screenshot): with 2 matches the line said "here are
         three" — the "three" phrasing only appears when more than three
         actually exist and the list below is a cut. */}
     <p className="qq-match-line">
      {matches.length === 0 ? t('qq.matchNone')
       : matches.length === 1 ? t('qq.matchOne')
       : matches.length <= 3 ? t('qq.matchFew', {n: matches.length})
       : t('qq.matchMany', {n: matches.length})}
     </p>
     {matches.length > 0 && <div className="qq-match-cards">
      {matches.slice(0, 3).map(c => {
       const href = '/inventory/' + encodeURIComponent(refOf(c));
       return <a key={refOf(c)} href={href} onClick={linkClick(href, navigate)}>
        {/* 330×220 (3:2) matches the rendered thumb. The old 820×550 hint was
            what the grid-stretch bug blew the cards up to — keep the reserve
            honest so no layout path can ever fall back to a 550px image. */}
        <img loading="lazy" decoding="async" width="330" height="220" src={c.image || '/assets/ar7-mark.png'}
          alt={[c.year, c.make, c.model].filter(Boolean).join(' ') + ' in Japan stock'}/>
        <b>{[c.make, c.model].filter(Boolean).join(' ')}</b>
        <small>{c.year ? c.year + ' · ' : ''}{refOf(c)}</small>
       </a>;
      })}
     </div>}
     {dest && <p className="qq-transit"><Ship/> {dest[1].split(' / ')[0]} · {dest[2]}</p>}
    </div>
    <form className="qq-form" onSubmit={submit}>
     {err && <div className="qq-error" role="alert">{err}</div>}
     <input aria-label={t('qq.name')} placeholder={t('qq.name')} value={name} onChange={e => setName(e.target.value)} maxLength={120}/>
     <input aria-label={t('qq.phone')} placeholder={t('qq.phone')} type="tel" inputMode="tel" value={phone} onChange={e => setPhone(e.target.value)} maxLength={40}/>
     <button className="primary" disabled={busy} type="submit">{busy ? t('qq.sending') : t('qq.send')} <ArrowRight/></button>
     <a className="qq-wa" href={waLink(s.whatsapp_number, waMsg)} target="_blank" rel="noopener noreferrer">
      <WhatsAppIcon size={16}/> {t('qq.wa')}
     </a>
    </form>
   </div>}

   {done && <div className="qq-done" role="status">
    <span><Check/></span>
    <h3>{t('qq.doneH')}</h3>
    <p>{t('qq.doneP')}</p>
    <div className="qq-done-actions">
     <a className="qq-wa" href={waLink(s.whatsapp_number, waMsg)} target="_blank" rel="noopener noreferrer"><MessageCircle/> WhatsApp</a>
     <button type="button" className="qq-restart" onClick={reset}><RotateCcw/> {t('qq.restart')}</button>
    </div>
   </div>}
  </div>
 </section>;
}
