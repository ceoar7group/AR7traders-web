// ---------------------------------------------------------------------------
//  AR7 Traders — multi-currency engine
//
//  One shared module powers every price tag and ledger figure across the site:
//
//    • 11 currencies: JPY, USD, EUR, GBP, PKR, AUD, NZD, CAD, AED, SAR, KES
//    • USD is the BASE currency — every stored amount (orders, payments,
//      budgets, vehicle prices) stays in USD so all the ledger math keeps
//      working exactly as before. Foreign-currency figures are captured
//      alongside (original amount + rate) for display.
//    • Exchange rates live in site_settings (`exchange_rates`, JSON) and are
//      editable from CRM → Settings. Until the CRM saves real ones, sensible
//      defaults below keep the site working — the API is optional.
//    • A visitor's chosen display currency is remembered per browser.
//
//  Used by: the public website (vehicle pricing + calculators), the customer
//  portal (orders/payments), and the CRM (KPIs, ledgers, rate manager).
// ---------------------------------------------------------------------------
import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { Check, ChevronDown, Globe, Info, RotateCcw, Save, TrendingUp } from 'lucide-react';
import './currency.css';

export const BASE_CURRENCY = 'USD';

// decimals: 0 for the big-unit currencies (¥, ₨, KSh), 2 for the rest.
export const CURRENCIES = [
  { code: 'JPY', name: 'Japanese Yen',        symbol: '¥',    flag: '🇯🇵', decimals: 0, note: 'Auction & purchase currency' },
  { code: 'USD', name: 'US Dollar',           symbol: '$',    flag: '🇺🇸', decimals: 2, note: 'Base currency — invoicing & ledger' },
  { code: 'EUR', name: 'Euro',                symbol: '€',    flag: '🇪🇺', decimals: 2 },
  { code: 'GBP', name: 'British Pound',       symbol: '£',    flag: '🇬🇧', decimals: 2 },
  { code: 'PKR', name: 'Pakistani Rupee',     symbol: '₨',    flag: '🇵🇰', decimals: 0 },
  { code: 'AUD', name: 'Australian Dollar',   symbol: 'A$',   flag: '🇦🇺', decimals: 2 },
  { code: 'NZD', name: 'New Zealand Dollar',  symbol: 'NZ$',  flag: '🇳🇿', decimals: 2 },
  { code: 'CAD', name: 'Canadian Dollar',     symbol: 'C$',   flag: '🇨🇦', decimals: 2 },
  { code: 'AED', name: 'UAE Dirham',          symbol: 'AED',  flag: '🇦🇪', decimals: 2 },
  { code: 'SAR', name: 'Saudi Riyal',         symbol: 'SAR',  flag: '🇸🇦', decimals: 2 },
  { code: 'KES', name: 'Kenyan Shilling',     symbol: 'KSh',  flag: '🇰🇪', decimals: 0 }
];

export const CURRENCY_CODES = CURRENCIES.map(c => c.code);

// Indicative rates (units per 1 USD) — used until the CRM saves live ones.
export const DEFAULT_RATES = {
  USD: 1, JPY: 155, EUR: 0.92, GBP: 0.79, PKR: 278, AUD: 1.52,
  NZD: 1.66, CAD: 1.37, AED: 3.6725, SAR: 3.75, KES: 129
};

export const currencyOf = code => CURRENCIES.find(c => c.code === code) || CURRENCIES[1];

/* ------------------------------------------------------------------ */
/*  Pure helpers — safe outside React                                  */
/* ------------------------------------------------------------------ */

// Accept {JPY:155} or its JSON string; keeps only known codes with a
// positive finite number, always merging over the defaults.
export function normalizeRates(input) {
  let raw = input;
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { raw = null; }
  }
  const out = { ...DEFAULT_RATES };
  if (raw && typeof raw === 'object') {
    for (const c of CURRENCY_CODES) {
      const v = Number(raw[c]);
      if (v > 0 && Number.isFinite(v)) out[c] = v;
    }
  }
  return out;
}

export function convert(amountUsd, toCode, rates = DEFAULT_RATES) {
  const n = Number(amountUsd) || 0;
  const r = Number(rates?.[toCode]) || Number(DEFAULT_RATES[toCode]) || 1;
  return n * r;
}

export function convertFrom(amount, fromCode, rates = DEFAULT_RATES) {
  const n = Number(amount) || 0;
  const r = Number(rates?.[fromCode]) || Number(DEFAULT_RATES[fromCode]) || 1;
  return n / r;
}

// Code-style symbols (AED, SAR, KSh) read best with a space after them;
// true currency marks ($, ¥, £, A$…) hug the number.
const symbolText = cur => /^[A-Za-z]+$/.test(cur.symbol) ? cur.symbol + ' ' : cur.symbol;

export function formatMoney(amountUsd, code = BASE_CURRENCY, rates = DEFAULT_RATES) {
  const cur = currencyOf(code);
  const v = convert(amountUsd, code, rates);
  const hasFraction = Math.abs(v - Math.round(v)) > 0.0001 && cur.decimals > 0;
  const n = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: hasFraction ? Math.min(2, cur.decimals) : 0,
    maximumFractionDigits: cur.decimals
  }).format(v);
  return cur.symbolAfter ? `${n} ${cur.symbol}` : `${symbolText(cur)}${n}`;
}

export function formatInCurrency(amount, code) {
  // Format a value that is ALREADY in `code` units (no conversion).
  const cur = currencyOf(code);
  const v = Number(amount) || 0;
  const hasFraction = Math.abs(v - Math.round(v)) > 0.0001 && cur.decimals > 0;
  const n = new Intl.NumberFormat('en-US', {
    minimumFractionDigits: hasFraction ? Math.min(2, cur.decimals) : 0,
    maximumFractionDigits: cur.decimals
  }).format(v);
  return cur.symbolAfter ? `${n} ${cur.symbol}` : `${symbolText(cur)}${n}`;
}

// "$58,900" / "USD 58,900" / "58900" → 58900 (base-currency number).
export function parsePriceUsd(str) {
  const n = Number(String(str ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/* ------------------------------------------------------------------ */
/*  Rate store — localStorage cache + /api/settings, shared everywhere */
/* ------------------------------------------------------------------ */

const RATES_CACHE_KEY = 'ar7-exchange-rates';
const RATES_TS_KEY = 'ar7-exchange-rates-updated';
const rateListeners = new Set();
let currentRates = { ...DEFAULT_RATES };
let ratesUpdatedAt = null;
let ratesInflight = null;

// Module-level mirror so non-React code paths (CSV exports, plain helpers)
// always see the latest rates the providers have loaded.
export const getLiveRates = () => currentRates;
export const getRatesUpdatedAt = () => ratesUpdatedAt;

function cacheRates(rates, updatedAt) {
  currentRates = normalizeRates(rates);
  ratesUpdatedAt = updatedAt || null;
  try {
    localStorage.setItem(RATES_CACHE_KEY, JSON.stringify(currentRates));
    if (ratesUpdatedAt) localStorage.setItem(RATES_TS_KEY, ratesUpdatedAt);
  } catch { /* private browsing — memory only */ }
  rateListeners.forEach(fn => { try { fn(currentRates); } catch { } });
}

export function onRatesChange(fn) {
  rateListeners.add(fn);
  return () => rateListeners.delete(fn);
}

export async function refreshRates() {
  if (ratesInflight) return ratesInflight;
  ratesInflight = fetch('/api/settings')
    .then(r => (r.ok ? r.json() : {}))
    .catch(() => ({}))
    .then(data => {
      cacheRates(normalizeRates(data?.exchange_rates), data?.exchange_rates_updated || null);
      return currentRates;
    })
    .finally(() => { ratesInflight = null; });
  return ratesInflight;
}

export function saveRatesLocally(rates) {
  // DEMO mode / offline fallback — keeps the CRM rate manager usable with
  // no backend. Real deployments save through /api/settings.
  cacheRates(rates, new Date().toISOString());
}

function bootFromCache() {
  try {
    currentRates = normalizeRates(localStorage.getItem(RATES_CACHE_KEY));
    ratesUpdatedAt = localStorage.getItem(RATES_TS_KEY) || null;
  } catch { currentRates = { ...DEFAULT_RATES }; }
}
if (typeof window !== 'undefined') bootFromCache();

const validDisplay = code => (CURRENCY_CODES.includes(code) ? code : BASE_CURRENCY);

/* ------------------------------------------------------------------ */
/*  React context                                                      */
/* ------------------------------------------------------------------ */

const CurrencyCtx = createContext(null);

/**
 * displayKey: where the chosen display currency is remembered.
 * The public website and the CRM keep independent choices.
 */
export function CurrencyProvider({ children, displayKey = 'ar7-display-currency' }) {
  const [rates, setRates] = useState(currentRates);
  const [updatedAt, setUpdatedAt] = useState(ratesUpdatedAt);
  const [display, setDisplayState] = useState(() => {
    try { return validDisplay(localStorage.getItem(displayKey) || BASE_CURRENCY); }
    catch { return BASE_CURRENCY; }
  });

  useEffect(() => {
    const fn = () => { setRates(currentRates); setUpdatedAt(ratesUpdatedAt); };
    rateListeners.add(fn);
    refreshRates();
    return () => rateListeners.delete(fn);
  }, []);

  useEffect(() => {
    try { localStorage.setItem(displayKey, display); } catch { }
  }, [display, displayKey]);

  const value = useMemo(() => {
    const fmt = (amountUsd, code) => formatMoney(amountUsd, code || display, rates);
    const fmtIn = (amount, code) => formatInCurrency(amount, code || display);
    const toUsd = (amount, code) => convertFrom(amount, code || display, rates);
    return {
      rates, display, base: BASE_CURRENCY, updatedAt,
      setDisplay: c => setDisplayState(validDisplay(c)),
      currencies: CURRENCIES,
      fmt, fmtIn, toUsd,
      convert: (amountUsd, code) => convert(amountUsd, code || display, rates),
      isBase: display === BASE_CURRENCY,
      rate: code => Number(rates[code]) || 1
    };
  }, [rates, display, updatedAt]);

  return <CurrencyCtx.Provider value={value}>{children}</CurrencyCtx.Provider>;
}

export function useCurrency() {
  const ctx = useContext(CurrencyCtx);
  // A plain default keeps legacy call sites rendering (base USD, default
  // rates) even if a provider is missing up the tree.
  if (!ctx) {
    return {
      rates: DEFAULT_RATES, display: BASE_CURRENCY, base: BASE_CURRENCY, updatedAt: null,
      setDisplay: () => { }, currencies: CURRENCIES,
      fmt: n => formatMoney(n, BASE_CURRENCY, DEFAULT_RATES),
      fmtIn: (n, c) => formatInCurrency(n, c || BASE_CURRENCY),
      toUsd: (n, c) => convertFrom(n, c || BASE_CURRENCY, DEFAULT_RATES),
      convert: (n, c) => convert(n, c || BASE_CURRENCY, DEFAULT_RATES),
      isBase: true, rate: c => Number(DEFAULT_RATES[c]) || 1
    };
  }
  return ctx;
}

/* ------------------------------------------------------------------ */
/*  CurrencySwitcher — public website header                           */
/* ------------------------------------------------------------------ */

export function CurrencySwitcher({ label = 'Currency' }) {
  const { display, setDisplay, rates, fmt } = useCurrency();
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const cur = currencyOf(display);

  useEffect(() => {
    if (!open) return;
    const away = e => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    return () => document.removeEventListener('mousedown', away);
  }, [open]);

  return (
    <div className="ar7cur-switch" ref={box}>
      <button className="ar7cur-btn" onClick={() => setOpen(o => !o)}
        aria-haspopup="listbox" aria-expanded={open} title={`${label}: ${cur.name} — prices convert instantly`}>
        <span className="ar7cur-flag">{cur.flag}</span>
        <b>{cur.code}</b>
        <ChevronDown size={13} className={'ar7cur-chev' + (open ? ' up' : '')} />
      </button>
      {open && (
        <div className="ar7cur-menu" role="listbox">
          <div className="ar7cur-menu-head">
            <Globe size={13} />
            <span>Display prices in</span>
          </div>
          {CURRENCIES.map(c => (
            <button key={c.code} role="option" aria-selected={c.code === display}
              className={'ar7cur-opt' + (c.code === display ? ' on' : '')}
              onClick={() => { setDisplay(c.code); setOpen(false); }}>
              <span className="ar7cur-flag">{c.flag}</span>
              <span className="ar7cur-opt-name"><b>{c.code}</b><small>{c.name}</small></span>
              <span className="ar7cur-opt-sample">{fmt(10000, c.code)}</span>
              {c.code === display && <Check size={14} className="ar7cur-tick" />}
            </button>
          ))}
          <div className="ar7cur-menu-foot">
            <Info size={11} />
            <span>Converted at 1 USD = {new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(Number(rates[display]) || 1)} {display}. Quotes are always confirmed in USD or JPY.</span>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  CrmCurrencyPicker — compact pill for the CRM top bar               */
/* ------------------------------------------------------------------ */

export function CrmCurrencyPicker() {
  const { display, setDisplay } = useCurrency();
  return (
    <label className="ar7cur-crm-pill" title="Display currency for KPIs, ledgers and payroll">
      <Globe size={13} />
      <select value={display} onChange={e => setDisplay(e.target.value)} aria-label="Display currency">
        {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
      </select>
    </label>
  );
}

/* ------------------------------------------------------------------ */
/*  CurrencyAmount — entry field used by ledger forms                  */
/*  Lets staff type an amount in any currency; the base-currency       */
/*  equivalent is computed live with the current rate and both values  */
/*  are submitted together.                                            */
/* ------------------------------------------------------------------ */

export function CurrencyAmount({ name = 'amount', defaultAmount = '', defaultCurrency = BASE_CURRENCY, required = true, label = 'Amount' }) {
  const { rates, fmtIn, toUsd } = useCurrency();
  const [code, setCode] = useState(validDisplay(defaultCurrency));
  const [amount, setAmount] = useState(defaultAmount);
  const usd = toUsd(amount, code);
  return (
    <div className="ar7cur-amount">
      <label>{label}
        <div className="ar7cur-amount-row">
          <input
            name={name} type="number" min="0" step="any"
            value={amount} required={required}
            onChange={e => setAmount(e.target.value)}
            placeholder="0"
          />
          <select name={name + '_currency'} value={code} onChange={e => setCode(e.target.value)} aria-label="Currency">
            {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
          </select>
        </div>
        {code !== BASE_CURRENCY && Number(amount) > 0 && (
          <small className="ar7cur-conv">
            ≈ {fmtIn(usd, BASE_CURRENCY)} at 1 USD = {new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(Number(rates[code]) || 1)} {code}
            <input type="hidden" name={name + '_original'} value={amount} readOnly />
            <input type="hidden" name={name + '_fx_rate'} value={Number(rates[code]) || 1} readOnly />
            <input type="hidden" name={name + '_usd'} value={usd.toFixed(2)} readOnly />
          </small>
        )}
      </label>
    </div>
  );
}

/** Pull the multi-currency fields out of a FormData/entries object. */
export function readCurrencyAmount(entries, name = 'amount') {
  const amount = entries[name];
  const code = validDisplay(entries[name + '_currency'] || BASE_CURRENCY);
  const explicitUsd = entries[name + '_usd'];
  const original = entries[name + '_original'];
  const fx = entries[name + '_fx_rate'];
  const usd = explicitUsd !== undefined && explicitUsd !== ''
    ? Number(explicitUsd)
    : (code === BASE_CURRENCY ? Number(amount) : convertFrom(Number(amount), code, currentRates));
  return {
    amount: Number.isFinite(usd) ? usd : 0,
    currency: code,
    amount_original: code === BASE_CURRENCY ? null : (original !== undefined && original !== '' ? Number(original) : null),
    fx_rate: code === BASE_CURRENCY ? null : (fx !== undefined && fx !== '' ? Number(fx) : (Number(currentRates[code]) || null))
  };
}

/** Small badge showing a record's original entry currency, when it has one. */
export function CurrencyBadge({ record }) {
  const { fmtIn } = useCurrency();
  if (!record?.currency || record.currency === BASE_CURRENCY || !record.amount_original) return null;
  return (
    <span className="ar7cur-badge" title={`Entered as ${record.amount_original} ${record.currency}${record.fx_rate ? ` at 1 USD = ${record.fx_rate}` : ''}`}>
      {fmtIn(record.amount_original, record.currency)}
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  RateManager — CRM → Settings exchange rate editor                  */
/* ------------------------------------------------------------------ */

export function RateManager({ token, canEdit, notify }) {
  const { rates, updatedAt } = useCurrency();
  const [draft, setDraft] = useState(() => ({ ...rates }));
  const [busy, setBusy] = useState(false);
  const dirty = CURRENCY_CODES.some(c => Number(draft[c]) !== Number(rates[c]));

  useEffect(() => { if (!dirty) setDraft({ ...rates }); }, [rates]); // eslint-disable-line react-hooks/exhaustive-deps

  const setRate = (code, v) => setDraft(d => ({ ...d, [code]: v }));
  const resetDefaults = () => setDraft({ ...DEFAULT_RATES });

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    try {
      const clean = {};
      let ok = true;
      for (const c of CURRENCY_CODES) {
        const v = Number(draft[c]);
        if (!Number.isFinite(v) || v <= 0) { ok = false; break; }
        clean[c] = c === 'USD' ? 1 : v;
      }
      if (!ok) { notify('Every rate must be a positive number.'); return; }
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
        body: JSON.stringify({
          exchange_rates: JSON.stringify(clean),
          exchange_rates_updated: new Date().toISOString(),
          base_currency: BASE_CURRENCY
        })
      });
      if (!res.ok) {
        const msg = (await res.json().catch(() => ({}))).error || 'Could not save rates';
        const err = new Error(msg);
        err.status = res.status;
        throw err;
      }
      await refreshRates();
      notify('Exchange rates updated — the website, portal and CRM use them immediately.');
    } catch (err) {
      // A real permission failure must be surfaced, not papered over.
      if (err.status === 401 || err.status === 403) {
        notify(err.message);
      } else {
        // DEMO mode / no backend: keep the session consistent locally.
        saveRatesLocally(draft);
        notify('Rates saved locally (live API unavailable in this preview).');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="ar7cur-rates">
      <header className="ar7cur-rates-head">
        <div>
          <small>FOREIGN EXCHANGE</small>
          <h3>Exchange rate manager</h3>
          <p>Prices, KPIs and ledger totals convert with these rates. Base currency: <b>{BASE_CURRENCY}</b>{' '}
            {updatedAt ? <>· updated {new Date(updatedAt).toLocaleString()}</> : <>· using built-in indicative rates</>}
          </p>
        </div>
        {canEdit && dirty && <button type="button" className="ar7cur-reset" onClick={resetDefaults} title="Restore built-in indicative rates"><RotateCcw size={13} /> Reset</button>}
      </header>
      <form onSubmit={save}>
        <div className="ar7cur-rates-grid">
          <div className="ar7cur-rates-row base">
            <span className="ar7cur-rates-cur"><i>{currencyOf(BASE_CURRENCY).flag}</i><b>{BASE_CURRENCY}</b><small>{currencyOf(BASE_CURRENCY).name}</small></span>
            <span className="ar7cur-rates-fixed">1.00 <em>base</em></span>
            <span className="ar7cur-rates-note">All ledger amounts are stored in USD</span>
          </div>
          {CURRENCIES.filter(c => c.code !== BASE_CURRENCY).map(c => (
            <div key={c.code} className="ar7cur-rates-row">
              <span className="ar7cur-rates-cur"><i>{c.flag}</i><b>{c.code}</b><small>{c.name}</small></span>
              <span className="ar7cur-rates-input">
                <em>1 USD =</em>
                <input
                  type="number" step="any" min="0.0001"
                  value={draft[c.code] ?? ''} disabled={!canEdit}
                  onChange={e => setRate(c.code, e.target.value)}
                  aria-label={`Rate for ${c.code}`}
                />
                <b>{c.code}</b>
              </span>
              <span className="ar7cur-rates-note">
                {Number(draft[c.code]) > 0
                  ? <TrendingUp size={12} /> : null}
                $10,000 → {formatMoney(10000, c.code, normalizeRates(draft))}
              </span>
            </div>
          ))}
        </div>
        {canEdit ? (
          <footer className="ar7cur-rates-foot">
            <small><Info size={12} /> Rates are indicative for display. Invoices are confirmed in USD or JPY by the export desk.</small>
            <button className="save" disabled={busy || !dirty}><Save size={14} /> {busy ? 'Saving…' : 'Save rates'}</button>
          </footer>
        ) : (
          <p className="crm-hint ar7cur-rates-locked">Your role cannot edit exchange rates.</p>
        )}
      </form>
    </section>
  );
}
