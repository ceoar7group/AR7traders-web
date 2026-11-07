// Global search — the ⌘K / Ctrl+K overlay reachable from every page.
//
// LAZY CHUNK: main.jsx mounts the small trigger button; this module (and its
// CSS) loads the first time the overlay opens, so the first-load budgets
// (scripts/bundle-budget.test.mjs) are untouched.
//
// WHAT IT SEARCHES — everything the public site offers, in one box:
//   • vehicles (live `cars` array: showroom + Japan stock + imported dealers)
//   • machinery
//   • buyer guides (news articles)
//   • destination market pages, and the site's static pages
//
// SMART QUERY PARSING (deterministic, no AI): free text plus typed filters —
//   "toyota under 25k"      → make/model text + max USD price
//   "suv hybrid 4wd"        → body + fuel + drive filters
//   "land cruiser 2022"     → text + minimum year
//   "alto automatic lhd"    → text + transmission + steering
// Parsed filters are shown as chips above the results so the visitor can see
// exactly how the query was understood.
//
// Recent searches are stored in localStorage under 'ar7-recent-q' — a
// functional preference, documented in /cookies (src/legal.jsx STORAGE_ROWS).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, CarFront, Wrench, BookOpen, MapPin, FileText, Clock3, ArrowRight, Filter } from 'lucide-react';
import { cars } from './main.jsx';
import { MACHINES, machineImages, machineHref, listPriceUSD } from './machinery-data.js';
import { NEWS, articleSlug } from './news-data.js';
import { DEST, destinationHref } from './destinations.js';
import { carRef } from './routing.js';
import './global-search.css';

const RECENT_KEY = 'ar7-recent-q';
const readRecent = () => { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]').slice(0, 6); } catch { return []; } };
const pushRecent = q => {
  const v = String(q || '').trim(); if (v.length < 2) return;
  try { localStorage.setItem(RECENT_KEY, JSON.stringify([v, ...readRecent().filter(x => x.toLowerCase() !== v.toLowerCase())].slice(0, 6))); } catch { /* storage may be off */ }
};

const STATIC_PAGES = [
  ['inventory', 'Inventory', 'Browse every vehicle in stock'],
  ['machinery', 'Machinery & equipment', 'Excavators, loaders and plant from vetted suppliers'],
  ['auction', 'Auction access', 'Bid in Japanese auctions with our desk'],
  ['howbuy', 'How buying works', 'From enquiry to your port, step by step'],
  ['shipping', 'Shipping', 'RoRo and container schedules and ports'],
  ['destinations', 'Destinations', 'Import rules for your market'],
  ['brands', 'Brands', 'Stock by manufacturer'],
  ['news', 'Guides & news', 'Buyer guides written by the export desk'],
  ['reviews', 'Reviews', 'What buyers say about AR7'],
  ['faq', 'FAQ', 'Common questions, answered'],
  ['about', 'About AR7', 'Who we are, Japan to your port'],
  ['contact', 'Contact', 'Talk to the export desk'],
  ['account', 'My account', 'Sign in or create your account'],
  ['privacy', 'Privacy Policy', 'What we collect and your rights'],
  ['cookies', 'Cookie Policy', 'Every key this site stores, listed'],
  ['terms', 'Terms & Export Policy', 'Prices, ordering, shipping, export rules'],
];

// ---------------------------------------------------------------------------
// Query parsing. Every rule is visible in the chips row, so "smart" never
// means "mysterious".
const BODY_WORDS = { suv: 'SUV', sedan: 'Sedan', saloon: 'Sedan', mpv: 'MPV', van: 'Van', kei: 'Kei', hatchback: 'Hatchback', hatch: 'Hatchback', luxury: 'Luxury', supercar: 'Supercar', hypercar: 'Hypercar' };
const FUEL_WORDS = { hybrid: 'Hybrid', petrol: 'Petrol', gasoline: 'Petrol', diesel: 'Diesel', electric: 'Electric', ev: 'Electric' };

export function parseQuery(raw) {
  const q = String(raw || '').toLowerCase();
  const f = { text: [], maxUsd: null, minUsd: null, minYear: null, body: null, fuel: null, drive: null, tr: null, steer: null };
  let rest = q;
  // "under 25k" / "below $25,000" / "max 2m" — and "over/above/from 10k".
  rest = rest.replace(/\b(under|below|max|upto|up to|<)\s*\$?\s*([\d,.]+)\s*(k|m)?\b/g, (_, w, n, suffix) => {
    f.maxUsd = Math.round(parseFloat(n.replace(/,/g, '')) * (suffix === 'k' ? 1e3 : suffix === 'm' ? 1e6 : 1)); return ' ';
  });
  rest = rest.replace(/\b(over|above|from|min|>)\s*\$?\s*([\d,.]+)\s*(k|m)\b/g, (_, w, n, suffix) => {
    f.minUsd = Math.round(parseFloat(n.replace(/,/g, '')) * (suffix === 'k' ? 1e3 : 1e6)); return ' ';
  });
  rest = rest.replace(/\$\s*([\d,]{4,})/g, (_, n) => { f.maxUsd = f.maxUsd ?? Math.round(parseFloat(n.replace(/,/g, ''))); return ' '; });
  rest = rest.replace(/\b(4wd|awd)\b/g, () => { f.drive = '4WD'; return ' '; });
  rest = rest.replace(/\b2wd\b/g, () => { f.drive = '2WD'; return ' '; });
  rest = rest.replace(/\b(automatic|auto)\b/g, () => { f.tr = 'AT'; return ' '; });
  rest = rest.replace(/\bmanual\b/g, () => { f.tr = 'MT'; return ' '; });
  rest = rest.replace(/\b(rhd|right hand drive)\b/g, () => { f.steer = 'RHD'; return ' '; });
  rest = rest.replace(/\b(lhd|left hand drive)\b/g, () => { f.steer = 'LHD'; return ' '; });
  rest = rest.replace(/\b(19[89]\d|20[0-4]\d)\b/g, (_, y) => { f.minYear = Number(y); return ' '; });
  for (const token of rest.split(/[^a-z0-9]+/)) {
    if (!token) continue;
    if (BODY_WORDS[token]) { f.body = BODY_WORDS[token]; continue; }
    if (FUEL_WORDS[token]) { f.fuel = FUEL_WORDS[token]; continue; }
    f.text.push(token);
  }
  return f;
}

export function filterChips(f) {
  const chips = [];
  if (f.maxUsd) chips.push('under $' + f.maxUsd.toLocaleString('en-US'));
  if (f.minUsd) chips.push('over $' + f.minUsd.toLocaleString('en-US'));
  if (f.minYear) chips.push(f.minYear + ' or newer');
  if (f.body) chips.push(f.body);
  if (f.fuel) chips.push(f.fuel);
  if (f.drive) chips.push(f.drive);
  if (f.tr) chips.push(f.tr === 'AT' ? 'Automatic' : 'Manual');
  if (f.steer) chips.push(f.steer);
  return chips;
}

const usdOf = c => Number(String(c.price || '').replace(/[^0-9.]/g, '')) || null;

export function searchVehicles(f, limit = 6) {
  const out = [];
  for (const c of cars) {
    if (!c || c.published === false) continue;
    const hay = `${c.make} ${c.model} ${c.body || ''} ${c.location || ''} ${c.stock_no || ''} ${c.year}`.toLowerCase();
    if (!f.text.every(t => hay.includes(t))) continue;
    const usd = usdOf(c);
    if (f.maxUsd && usd && usd > f.maxUsd) continue;
    if (f.minUsd && usd && usd < f.minUsd) continue;
    if (f.minYear && Number(c.year) < f.minYear) continue;
    if (f.body && c.body !== f.body) continue;
    if (f.fuel && c.fuel !== f.fuel) continue;
    if (f.drive && c.drv !== f.drive) continue;
    if (f.tr && c.tr !== f.tr) continue;
    if (f.steer && c.st !== f.steer) continue;
    out.push(c);
  }
  return { total: out.length, items: out.slice(0, limit) };
}

function searchMachines(f, limit = 3) {
  if (!f.text.length && !f.maxUsd) return [];
  return MACHINES.filter(m => {
    if (m.photosPending || !machineImages(m).length) return false;
    const hay = `${m.brand || ''} ${m.model || ''} ${m.type || ''} machinery machine`.toLowerCase();
    if (!f.text.every(t => hay.includes(t))) return false;
    const usd = listPriceUSD(m);
    if (f.maxUsd && usd && usd > f.maxUsd) return false;
    return true;
  }).slice(0, limit);
}

function searchGuides(f, limit = 3) {
  if (!f.text.length) return [];
  return NEWS.filter(a => {
    const hay = `${a.title} ${a.excerpt || a.ex || ''} ${a.cat || ''}`.toLowerCase();
    return f.text.every(t => hay.includes(t));
  }).slice(0, limit);
}

function searchPlaces(f, limit = 4) {
  if (!f.text.length) return [];
  const dests = DEST.filter(d => `${d[0]} ${d[1]}`.toLowerCase().includes(f.text.join(' '))).slice(0, 2)
    .map(d => ({ kind: 'dest', label: `Import to ${d[0]}`, sub: `Market guide · ${d[1]}`, href: destinationHref(d[0]) }));
  const pages = STATIC_PAGES.filter(p => `${p[0]} ${p[1]} ${p[2]}`.toLowerCase().includes(f.text.join(' ')))
    .map(p => ({ kind: 'page', label: p[1], sub: p[2], href: '/' + p[0] }));
  return [...dests, ...pages].slice(0, limit);
}

const Hi = ({ text, terms }) => {
  const t = String(text);
  if (!terms.length) return t;
  const re = new RegExp('(' + terms.map(x => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') + ')', 'ig');
  return t.split(re).map((part, i) => re.test(part) ? <mark key={i}>{part}</mark> : part);
};

export default function GlobalSearch({ open, onClose, navigate }) {
  const [q, setQ] = useState('');
  const [sel, setSel] = useState(0);
  const [recent, setRecent] = useState(readRecent);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => { if (open) { setQ(''); setSel(0); setRecent(readRecent()); setTimeout(() => inputRef.current?.focus(), 30); } }, [open]);
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  const f = useMemo(() => parseQuery(q), [q]);
  const chips = filterChips(f);
  const hasQuery = q.trim().length >= 2;
  const vehicles = useMemo(() => hasQuery ? searchVehicles(f) : { total: 0, items: [] }, [f, hasQuery]);
  const machines = useMemo(() => hasQuery ? searchMachines(f) : [], [f, hasQuery]);
  const guides = useMemo(() => hasQuery ? searchGuides(f) : [], [f, hasQuery]);
  const places = useMemo(() => hasQuery ? searchPlaces(f) : [], [f, hasQuery]);

  // One flat list drives keyboard navigation across all groups.
  const flat = useMemo(() => {
    const rows = [];
    vehicles.items.forEach(c => rows.push({ kind: 'car', go: '/inventory/' + encodeURIComponent(carRef(c)), c }));
    machines.forEach(m => rows.push({ kind: 'machine', go: machineHref(m), m }));
    guides.forEach(a => rows.push({ kind: 'guide', go: '/news/' + articleSlug(a.title), a }));
    places.forEach(p => rows.push({ kind: p.kind, go: p.href, p }));
    return rows;
  }, [vehicles, machines, guides, places]);
  useEffect(() => { setSel(0); }, [q]);

  if (!open) return null;

  const go = href => {
    pushRecent(q);
    onClose();
    // Full hrefs ('/inventory/xyz', '/machinery/…', '/news/…') go through
    // parseNavTarget so routing, scroll and SEO behave exactly like a clicked
    // link (routing.js handles leading-slash targets as full paths).
    navigate(href.startsWith('/') ? href : '/' + href);
  };
  const goInventory = () => {
    pushRecent(q);
    try { sessionStorage.setItem('ar7-inv-q', f.text.join(' ')); } catch { /* storage may be off */ }
    onClose();
    navigate('inventory');
  };
  const onKey = e => {
    if (e.key === 'Escape') { e.preventDefault(); onClose(); }
    else if (e.key === 'ArrowDown') { e.preventDefault(); setSel(s => Math.min(s + 1, flat.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSel(s => Math.max(s - 1, 0)); }
    else if (e.key === 'Enter') {
      e.preventDefault();
      if (flat[sel]) go(flat[sel].go);
      else if (hasQuery) goInventory();
    }
  };
  // Keep the active row visible while arrowing through.
  const rowRef = el => { if (el && el.classList.contains('active')) el.scrollIntoView({ block: 'nearest' }); };

  let idx = -1;
  const overlay = (
    <div className="gs-backdrop" onMouseDown={onClose} role="dialog" aria-modal="true" aria-label="Search the site">
      <div className="gs-panel" onMouseDown={e => e.stopPropagation()}>
        <div className="gs-head">
          <Search aria-hidden="true" />
          <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} onKeyDown={onKey}
            placeholder="Search cars, machinery, guides… try “toyota under 25k 4wd”"
            aria-label="Search the site" role="combobox" aria-expanded={flat.length > 0} aria-autocomplete="list" />
          <kbd>ESC</kbd>
          <button type="button" className="gs-close" onClick={onClose} aria-label="Close search"><X /></button>
        </div>
        {chips.length > 0 && <div className="gs-filters" aria-label="Understood filters">{chips.map(c => <em key={c}><Filter size={11} /> {c}</em>)}</div>}
        {!hasQuery && recent.length > 0 && (
          <div className="gs-chips"><span><Clock3 size={12} /> RECENT</span>{recent.map(r => <button key={r} type="button" onClick={() => setQ(r)}>{r}</button>)}</div>
        )}
        {!hasQuery && (
          <div className="gs-chips"><span>TRY</span>{['Land Cruiser', 'suv hybrid under 25k', 'Supra', 'excavator', 'import to Kenya'].map(r => <button key={r} type="button" onClick={() => setQ(r)}>{r}</button>)}</div>
        )}
        <div className="gs-results" ref={listRef}>
          {hasQuery && vehicles.items.length > 0 && (
            <div className="gs-group">
              <b>VEHICLES <a href="/inventory" onClick={e => { e.preventDefault(); goInventory(); }}>{vehicles.total > vehicles.items.length ? `All ${vehicles.total} matches` : 'Open inventory'} →</a></b>
              {vehicles.items.map(c => { idx++; const i = idx; return (
                <button key={carRef(c)} ref={rowRef} type="button" className={'gs-item' + (sel === i ? ' active' : '')} onMouseEnter={() => setSel(i)} onClick={() => go('/inventory/' + encodeURIComponent(carRef(c)))}>
                  <img src={c.image} alt="" loading="lazy" decoding="async" width="62" height="42" />
                  <div><b><Hi text={`${c.year} ${c.make} ${c.model}`} terms={f.text} /></b><span className="gs-sub">{[c.km && c.km + ' km', c.fuel, c.body, c.location].filter(Boolean).join(' · ')}</span></div>
                  <strong>{c.price}</strong>
                </button>); })}
            </div>
          )}
          {machines.length > 0 && (
            <div className="gs-group">
              <b>MACHINERY</b>
              {machines.map(m => { idx++; const i = idx; return (
                <button key={m.ref || m.id} ref={rowRef} type="button" className={'gs-item' + (sel === i ? ' active' : '')} onMouseEnter={() => setSel(i)} onClick={() => go(machineHref(m))}>
                  <span className="gs-ico"><Wrench /></span>
                  <div><b><Hi text={[m.brand, m.model].filter(Boolean).join(' ')} terms={f.text} /></b><span className="gs-sub">{m.type}{m.year ? ' · ' + m.year : ''}</span></div>
                  {listPriceUSD(m) ? <strong>${Math.round(listPriceUSD(m)).toLocaleString('en-US')}</strong> : null}
                </button>); })}
            </div>
          )}
          {guides.length > 0 && (
            <div className="gs-group">
              <b>GUIDES</b>
              {guides.map(a => { idx++; const i = idx; const slug = articleSlug(a.title); return (
                <button key={slug} ref={rowRef} type="button" className={'gs-item' + (sel === i ? ' active' : '')} onMouseEnter={() => setSel(i)} onClick={() => go('/news/' + slug)}>
                  <span className="gs-ico"><BookOpen /></span>
                  <div><b><Hi text={a.title} terms={f.text} /></b><span className="gs-sub">{a.cat} · {a.min} min read</span></div>
                </button>); })}
            </div>
          )}
          {places.length > 0 && (
            <div className="gs-group">
              <b>PAGES & DESTINATIONS</b>
              {places.map(p => { idx++; const i = idx; return (
                <button key={p.href} ref={rowRef} type="button" className={'gs-item' + (sel === i ? ' active' : '')} onMouseEnter={() => setSel(i)} onClick={() => go(p.href)}>
                  <span className="gs-ico">{p.kind === 'dest' ? <MapPin /> : <FileText />}</span>
                  <div><b>{p.label}</b><span className="gs-sub">{p.sub}</span></div>
                </button>); })}
            </div>
          )}
          {hasQuery && flat.length === 0 && (
            <div className="gs-empty">
              <CarFront />
              <b>No matches for “{q.trim()}”</b>
              <p>We source to order from the Japanese auctions — <a href="/contact" onClick={e => { e.preventDefault(); go('/contact'); }}>tell the desk what you need</a>.</p>
            </div>
          )}
        </div>
        <div className="gs-foot">
          <span><kbd>↑</kbd><kbd>↓</kbd> navigate · <kbd>Enter</kbd> open</span>
          {hasQuery && <span><a href="/inventory" onClick={e => { e.preventDefault(); goInventory(); }} style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}>Search inventory for “{f.text.join(' ') || q.trim()}” <ArrowRight size={11} /></a></span>}
        </div>
      </div>
    </div>
  );
  return createPortal(overlay, document.body);
}
