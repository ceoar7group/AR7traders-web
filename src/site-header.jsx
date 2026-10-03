// Site header: brand block, primary nav, the Brands dropdown, the More
// dropdown and the action buttons.
//
// It lives in its own module (rather than inline in main.jsx) so the nav can be
// rendered and asserted on its own — see scripts/header-render.test.jsx.
import React, {useEffect, useRef, useState} from 'react';
import {
  ArrowUpRight, Sun, Moon, Menu, X, ChevronDown, MessageCircle, Monitor,
  UserPlus, UserCog, LogIn, CarFront, Globe2, Layers, Gavel, Calculator,
  Wrench, Ship, MapPin, BookOpen, Newspaper, ClipboardCheck, BadgeCheck, Landmark, Mail, Search
} from 'lucide-react';
import { CurrencyDropdown } from './currency.jsx';
import { LanguageSwitcher } from './i18n.jsx';
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
  const close = () => {
    setOpen(false);
    if (
      typeof document !== 'undefined' &&
      ref.current &&
      document.activeElement &&
      ref.current.contains(document.activeElement) &&
      typeof document.activeElement.blur === 'function'
    ) {
      document.activeElement.blur();
    }
  };
  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') close(); };
    document.addEventListener('pointerdown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('pointerdown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);
  // Any navigation closes the panel — including a click on the page we are
  // already on, where the route itself would not change.
  useEffect(() => { close(); }, [routeKey]);
  return <div className={'nav-drop ' + (className || '') + (open ? ' open' : '')} ref={ref}>
    <button className="nav-drop-btn" type="button" aria-expanded={open} aria-haspopup="true"
      onClick={e => { e.preventDefault(); setOpen(v => !v); }}>{label} <ChevronDown className="more-chev"/></button>
    <div className={'nav-drop-panel ' + (panel || '')} role="menu">
      {typeof children === 'function' ? children(close) : children}
    </div>
  </div>;
}

// Inventory dropdown items
const INVENTORY_LINKS = [
  [CarFront, 'All Inventory', 'inventory'],
  [Wrench, 'Machinery & equipment', 'machinery'],
  [Layers, 'Japan dealer stock', 'japan-stock']
];

// More dropdown items - organized and duplicates removed.
// The grid supports an unpaired final item; do not add filler navigation links.
export const MORE_LINKS = [
  [Globe2, 'World network', 'world'],
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
  [Search, 'SEO desk', 'seo']
];

export function SiteHeader({
  page, vehicleId = null, makeFilter = null, brands = [], vehicleCount = 0,
  menu = false, setMenu = () => {}, dark = false, setDark = () => {},
  signedIn = false, navigate = () => {}, logoFor = () => '', ribbon = null, orb = null
}) {
  const routeKey = [page, vehicleId || '', makeFilter || ''].join('/');
  // The bar is one line at every width (see src/site-layout.css). Above 900px
  // it carries the whole menu; between 640px and 899px only the three quick
  // links stay out and `.nav-tier-full` items move into the burger panel. If a
  // visitor opens that panel and then widens the window past the tier, close
  // it: the burger disappears there and an invisible open panel would be
  // impossible to shut.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onResize = () => { if (window.innerWidth > 899 && menu) setMenu(false); };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [menu, setMenu]);
  return <header className="nav-wrap">{ribbon}<nav className="nav shell">
    <div className="brand-group">
      <a className="brand" href="/" onClick={linkClick('home', navigate)} aria-label="AR7 home"><img src="/assets/ar7-mark.png" alt="AR7 Traders" loading="lazy" decoding="async" width="None" height="None"/><span><b>AR7</b> <strong>TRADERS</strong><small>GLOBAL VEHICLE EXPORTERS</small></span></a>
      <div className="nav-orb" title="AR7 360° world network — click to explore">{orb}</div>
    </div>
    <div id="ar7-public-menu" className={'navlinks ' + (menu ? 'open' : '')}>
      <NavDropdown className="nav-inventory" panel="inventory-panel" routeKey={routeKey} label="Inventory">
        {close => INVENTORY_LINKS.map(x => {
          const I = x[0];
          return <a key={x[2]} href={hrefFor(x[2])} onClick={e => { close(); linkClick(x[2], navigate)(e); }}><i><I/></i><span>{x[1]}</span></a>;
        })}
      </NavDropdown>
      <a className={'nav-tier-full' + (page === 'auction' ? ' current' : '')} href="/auction" onClick={linkClick('auction', navigate)}>Auction access</a>
      <NavDropdown className="nav-brands" panel="brands-panel" routeKey={routeKey} label="Brands">
        {close => <>
          <div className="brands-panel-head"><b>Brands in inventory</b><span>{brands.length} makes · {vehicleCount} vehicles live</span></div>
          <div className="brands-grid">{brands.map(b => <a key={b.name} className={makeFilter === b.name ? ' current' : ''} href={inventoryHref(b.name)} onClick={e => { close(); linkClick(inventoryHref(b.name), navigate)(e); }}><img loading="lazy" decoding="async" width="30" height="19" src={logoFor(b.name)} alt="" onError={logoOnError}/><span>{b.name}</span><b>{b.count}</b></a>)}</div>
          <div className="brands-panel-foot">
            <a href="/brands" onClick={e => { close(); linkClick('brands', navigate)(e); }}><Layers/> All brands &amp; models <ArrowUpRight/></a>
            <a href="/inventory" onClick={e => { close(); linkClick('inventory', navigate)(e); }}><CarFront/> Full inventory <ArrowUpRight/></a>
          </div>
        </>}
      </NavDropdown>
      <NavDropdown className="nav-more nav-tier-full" panel="more-panel" routeKey={routeKey} label="More">
        {close => MORE_LINKS.map(x => {
          const I = x[0];
          return <a key={x[2]} href={hrefFor(x[2])} onClick={e => { close(); linkClick(x[2], navigate)(e); }}><i><I/></i><span>{x[1]}</span></a>;
        })}
      </NavDropdown>
      <a className={'auction-link' + (page === 'contact' ? ' current' : '')} href="/contact" onClick={linkClick('contact', navigate)}><MessageCircle size={15}/> Contact</a>
      {/* Only rendered inside the burger panel (≤899px, src/site-layout.css):
          the labelled account button and theme switch stay reachable on phones
          even when the bar's icon row runs out of room. */}
      <div className="nav-panel-actions">
        <a className="primary compact" href="/account" onClick={linkClick('account', navigate)}><LogIn/>{signedIn ? 'My account' : 'Sign in'}</a>
        <button type="button" className="panel-theme" onClick={() => setDark(!dark)} aria-pressed={dark}>{dark ? <Sun/> : <Moon/>}{dark ? 'Light mode' : 'Dark mode'}</button>
      </div>
    </div>
    <div className="nav-actions">
      <LanguageSwitcher/>
          <CurrencyDropdown/>
      <a className="icon-btn studio-btn" href="/studio" onClick={linkClick('studio', navigate)} aria-label="Preview device modes" title="Phone, tablet, laptop & PC preview"><Monitor/></a>
      <button type="button" className="icon-btn" onClick={() => setDark(!dark)} aria-label="Toggle theme">{dark ? <Sun/> : <Moon/>}</button>
      <a className="icon-btn portal-btn" href="/account" onClick={linkClick('account', navigate)} aria-label="Sign in to your account" title="Sign in to your account"><LogIn/></a>
      <a className="primary compact" href="/account" onClick={linkClick('account', navigate)}>{signedIn ? <>My account <UserCog/></> : <>Sign up <UserPlus/></>}</a>
      <button type="button" className="menu-btn" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-controls="ar7-public-menu" aria-label={menu ? 'Close menu' : 'Open menu'}>{menu ? <X/> : <Menu/>}</button>
    </div>
  </nav></header>;
}
