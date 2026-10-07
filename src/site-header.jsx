// Site header: brand block, primary nav, the Brands dropdown, the More
// dropdown and the action buttons.
//
// It lives in its own module (rather than inline in main.jsx) so the nav can be
// rendered and asserted on its own — see scripts/header-render.test.jsx.
import React, {useEffect, useLayoutEffect, useRef, useState} from 'react';
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
  [LogIn, 'Client portal', 'portal']
];

/* ---------------------------------------------------------------------------
   The header's own geometry — measured, never guessed.

   One element (`.nav-wrap` in src/site-layout.css) owns the whole top block:
   the promo bar, the World Time ribbon and the navigation row. Whatever those
   three rows add up to is written to `--head-h` on <html>, and the page
   reserves exactly that once (`main { padding-top: var(--head-h) }`). No page
   carries its own hard-coded header offset any more — the old 122/140/142/
   158/160px values were what left a blank band under the bar and let the hero
   run under the ticker.
   --------------------------------------------------------------------------- */
function useHeaderMetrics(ref, { hold, menu, routeKey }) {
  const [away, setAway] = useState(false);

  // --- measured height -----------------------------------------------------
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof window === 'undefined') return;
    const root = document.documentElement;
    let last = -1;
    const write = () => {
      const h = Math.round(el.getBoundingClientRect().height);
      // A zero height means the element is not laid out yet (first paint,
      // print, a browser that has the bar hidden) — keep the CSS fallback.
      if (!h || h === last) return;
      last = h;
      root.style.setProperty('--head-h', h + 'px');
    };
    write();
    let ro = null;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(write);
      ro.observe(el);
    }
    window.addEventListener('resize', write);
    window.addEventListener('orientationchange', write);
    // Web fonts land after first paint and can change the bar's height.
    document.fonts?.ready?.then(write).catch(() => {});
    return () => {
      window.removeEventListener('resize', write);
      window.removeEventListener('orientationchange', write);
      ro?.disconnect();
      root.style.removeProperty('--head-h');
    };
  }, [ref]);

  // --- visibility: pinned over the hero, scrolling away after it ------------
  //
  // The requirement is deliberately NOT "fixed on every section": the bar is
  // pinned only while the hero block still reads as the top of the page, then
  // leaves with it, so it can never sit over the inventory grid, the ticker,
  // the 900+ statistic or the footer. Pages without a hero region (portal, CRM,
  // admin) keep the bar — there is nothing below the fold it would cover.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!hold) { setAway(false); return; }
    const el = ref.current;
    let target = null;
    let lead = null;
    // Resolved on every pass, not once: /machinery and the other heavy routes
    // are lazy chunks, so on a cold load (or a refresh on a deep URL) the hero
    // is not in the document yet when this effect first runs. A fixed lookup
    // here left those pages with a permanently pinned bar sitting over their
    // own headline.
    const resolve = () => {
      const next = document.querySelector('[data-header-hold], .page-hero, .hero');
      if (!next || next === target) return;
      target = next;
      // The first thing a visitor reads in the hero block. The bar must be gone
      // before that line can slide under it — the headline, the CTA row, the
      // 900+ figure and the ticker all sit below it, so one boundary covers them.
      lead = target.querySelector('.eyebrow, .kicker, .hero-copy, .page-hero-copy') || target;
    };
    let raf = 0;
    let last = null;
    const update = () => {
      raf = 0;
      resolve();
      if (!target) { setAway(false); return; }
      const headH = Math.max(48, Math.round(el?.getBoundingClientRect().height || 0));
      const leadTop = lead.getBoundingClientRect().top + window.scrollY;
      // Two boundaries, whichever comes first:
      //   1. the hero's first line of copy, held 8px clear of the bar's lower
      //      edge — so nothing the visitor is reading is ever covered;
      //   2. the hero's own end, for a hero with no copy above the fold.
      const heroBottom = target.getBoundingClientRect().bottom + window.scrollY;
      const leaveAt = Math.max(0, Math.min(leadTop - headH - 8, heroBottom - headH));
      // Hysteresis so a trackpad nudge at the boundary cannot make the bar
      // flicker in and out. It is capped at half the boundary distance so the
      // return threshold can never reach 0 — scrolling back to the very top
      // must always bring the bar home.
      const backAt = Math.max(0, leaveAt - Math.min(24, leaveAt / 2));
      // The top of the document always shows the bar. A hero whose copy starts
      // only a few pixels below it yields a boundary of ~20px, and without this
      // guard a refresh at the top (or a lazy route that mounts its hero after
      // the first measurement) could park the bar in the tucked-away state on a
      // page the visitor has not scrolled at all.
      const next = window.scrollY > 0 && window.scrollY >= (last ? backAt : leaveAt);
      if (next !== last) { last = next; setAway(next); }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    // The lazy route chunk mounts its hero after this effect has run, and a
    // refresh on a deep URL never fires a scroll — so watch the DOM itself
    // (throttled through the same animation frame) and pick the hero up as
    // soon as it appears.
    let mo = null;
    if (typeof MutationObserver === 'function') {
      mo = new MutationObserver(onScroll);
      mo.observe(document.body, { childList: true, subtree: true });
    }
    return () => {
      cancelAnimationFrame(raf);
      mo?.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  }, [ref, hold, menu, routeKey]);

  return away;
}

export function SiteHeader({
  page, vehicleId = null, makeFilter = null, brands = [], vehicleCount = 0,
  menu = false, setMenu = () => {}, dark = false, setDark = () => {},
  signedIn = false, navigate = () => {}, logoFor = () => '', ribbon = null, orb = null,
  promo = null, hold = true
}) {
  const headRef = useRef(null);
  const routeKey = [page, vehicleId || '', makeFilter || ''].join('/');
  const away = useHeaderMetrics(headRef, { hold, menu, routeKey });
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
  return <header className={'nav-wrap' + (away ? ' is-away' : '')} ref={headRef}>
    {promo}
    {ribbon}
    <nav className="nav shell">
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
