// Site header: brand block, primary nav, the Brands dropdown, the More
// dropdown and the action buttons.
//
// It lives in its own module (rather than inline in main.jsx) so the nav can be
// rendered and asserted on its own — see scripts/header-render.test.jsx.
import React, {useEffect, useRef, useState} from 'react';
import {
  ArrowUpRight, Sun, Moon, Menu, X, ChevronDown, MessageCircle, Monitor,
  UserPlus, UserCog, LogIn, CarFront, Globe2, Layers, Gavel, Calculator,
  Wrench, Ship, MapPin, BookOpen, Newspaper, ClipboardCheck, BadgeCheck, Landmark, Mail
} from 'lucide-react';
import { CurrencyDropdown } from './currency.jsx';
import { linkClick, hrefFor, inventoryHref } from './routing.js';

// ---------------------------------------------------------------------------
// Header dropdown — one implementation behind BOTH the Brands menu and the More
// menu, so they open, close, animate and collapse on mobile identically.
// Click-driven (not hover): a hover menu closes while the pointer is still
// travelling towards it, which made the old header feel broken on trackpads.
// Closes on: outside pointerdown, Escape, or any navigation (`routeKey`).
// `children` may be a function receiving `close()`.
// ---------------------------------------------------------------------------
// A make added in the CRM may have no logo file yet; fall back to the AR7 mark
// instead of showing a broken image. Guarded so a missing fallback cannot loop.
export const logoOnError = (e) => {
  const el = e?.currentTarget;
  if (!el || el.dataset.logoFb) return;
  el.dataset.logoFb = '1';
  el.src = '/assets/ar7-mark.png';
  el.alt = el.alt || 'AR7 Traders';
};

export function NavDropdown({label, panel, className, routeKey, children}) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  // Any navigation closes the panel — including a click on the page we are
  // already on, where the route itself would not change.
  useEffect(() => { setOpen(false); }, [routeKey]);
  return <div className={'nav-drop ' + (className || '') + (open ? ' open' : '')} ref={ref}>
    <button className="nav-drop-btn" type="button" aria-expanded={open} aria-haspopup="true"
      onClick={e => { e.preventDefault(); setOpen(v => !v); }}>{label} <ChevronDown className="more-chev"/></button>
    <div className={'nav-drop-panel ' + (panel || '')} role="menu">
      {typeof children === 'function' ? children(() => setOpen(false)) : children}
    </div>
  </div>;
}

// The More menu. Kept as data so the panel's two-column shape stays even:
// add or remove entries in PAIRS.
export const MORE_LINKS = [
  [Globe2, 'World network', 'world'],
  [CarFront, 'Inventory', 'inventory'],
  [Layers, 'Japan dealer stock', 'japan-stock'],
  [Gavel, 'Live auctions', 'auction'],
  [Calculator, 'Calculators', 'tools'],
  [Wrench, 'Services', 'services'],
  [Ship, 'Shipping', 'shipping'],
  [MapPin, 'Destinations', 'destinations'],
  [BookOpen, 'How to buy', 'howbuy'],
  [Newspaper, 'News & guides', 'news'],
  [MessageCircle, 'Reviews', 'reviews'],
  [ClipboardCheck, 'Help & FAQ', 'faq'],
  [BadgeCheck, 'About AR7', 'about'],
  [LogIn, 'Client portal', 'portal'],
  [Landmark, 'Staff CRM', 'crm'],
  [Mail, 'Contact us', 'contact']
];

export function SiteHeader({
  page, vehicleId = null, makeFilter = null, brands = [], vehicleCount = 0,
  menu = false, setMenu = () => {}, dark = false, setDark = () => {},
  signedIn = false, navigate = () => {}, logoFor = () => '', ribbon = null, orb = null
}) {
  return <header className="nav-wrap">{ribbon}<nav className="nav shell">
    <div className="brand-group">
      <a className="brand" href="/" onClick={linkClick('home', navigate)} aria-label="AR7 home"><img src="/assets/ar7-mark.png" alt="AR7 Traders"/><span><b>AR7</b> <strong>TRADERS</strong><small>GLOBAL VEHICLE EXPORTERS</small></span></a>
      <div className="nav-orb" title="AR7 360° world network — click to explore">{orb}</div>
    </div>
    <div className={'navlinks ' + (menu ? 'open' : '')}>
      <a className={page === 'inventory' && !vehicleId ? ' current' : ''} href="/inventory" onClick={linkClick('inventory', navigate)}>Inventory</a>
      <a className={page === 'japan-stock' ? ' current' : ''} href="/japan-stock" onClick={linkClick('japan-stock', navigate)}>Japan dealer stock</a>
      <a className={page === 'auction' ? ' current' : ''} href="/auction" onClick={linkClick('auction', navigate)}>Auction access</a>
      <NavDropdown className="nav-brands" panel="brands-panel" routeKey={page + '/' + (makeFilter || '')} label="Brands">
        {close => <>
          <div className="brands-panel-head"><b>Brands in inventory</b><span>{brands.length} makes · {vehicleCount} vehicles live</span></div>
          <div className="brands-grid">{brands.map(b => <a key={b.name} className={makeFilter === b.name ? ' current' : ''} href={inventoryHref(b.name)} onClick={e => { close(); linkClick(inventoryHref(b.name), navigate)(e); }}><img loading="lazy" decoding="async" width="30" height="19" src={logoFor(b.name)} alt="" onError={logoOnError}/><span>{b.name}</span><b>{b.count}</b></a>)}</div>
          <div className="brands-panel-foot">
            <a href="/brands" onClick={e => { close(); linkClick('brands', navigate)(e); }}><Layers/> All brands &amp; models <ArrowUpRight/></a>
            <a href="/inventory" onClick={e => { close(); linkClick('inventory', navigate)(e); }}><CarFront/> Full inventory <ArrowUpRight/></a>
          </div>
        </>}
      </NavDropdown>
      <NavDropdown className="nav-more" panel="more-panel" routeKey={page} label="More">
        {close => MORE_LINKS.map(x => {
          const I = x[0];
          return <a key={x[2]} href={hrefFor(x[2])} onClick={e => { close(); linkClick(x[2], navigate)(e); }}><i><I/></i><span>{x[1]}</span></a>;
        })}
      </NavDropdown>
      <a className={'auction-link' + (page === 'contact' ? ' current' : '')} href="/contact" onClick={linkClick('contact', navigate)}><MessageCircle size={15}/> Contact</a>
    </div>
    <div className="nav-actions">
      <CurrencyDropdown/>
      <a className="icon-btn studio-btn" href="/studio" onClick={linkClick('studio', navigate)} aria-label="Preview device modes" title="Phone, tablet, laptop & PC preview"><Monitor/></a>
      <button className="icon-btn" onClick={() => setDark(!dark)} aria-label="Toggle theme">{dark ? <Sun/> : <Moon/>}</button>
      <a className="icon-btn portal-btn" href="/account" onClick={linkClick('account', navigate)} aria-label="Sign in to your account" title="Sign in to your account"><LogIn/></a>
      <a className="primary compact" href="/account" onClick={linkClick('account', navigate)}>{signedIn ? <>My account <UserCog/></> : <>Sign up <UserPlus/></>}</a>
      <button className="menu-btn" onClick={() => setMenu(!menu)} aria-label="Open menu">{menu ? <X/> : <Menu/>}</button>
    </div>
  </nav></header>;
}
