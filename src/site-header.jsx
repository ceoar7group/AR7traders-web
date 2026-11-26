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
import { LanguageSwitcher, useLang } from './i18n.jsx';
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
  el.src = '/assets/ar7-mark-460.webp';
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
// 2026-11-11 (owner: "translations not fully working"): every label carries
// its i18n key as the 4th element; outside the LanguageProvider (tests, CRM)
// t() falls back to the English label, so nothing changes for those callers.
const INVENTORY_LINKS = [
  [CarFront, 'All Inventory', 'inventory', 'nav.allInventory'],
  [Wrench, 'Machinery & equipment', 'machinery', 'nav.machineryEquip']
];

// More dropdown items - organized and duplicates removed.
// The grid supports an unpaired final item; do not add filler navigation links.
// 2026-11-18 (owner, mobile cleanup): Brands and Auction access fold into
// this menu — "Live auctions" was already here, "All brands" joins it, and
// the standalone bar links went away. The grid supports an unpaired final
// item, so the odd count is fine.
export const MORE_LINKS = [
  [Globe2, 'World network', 'world', 'nav.world'],
  [Layers, 'All brands', 'brands', 'nav.allBrands'],
  [Gavel, 'Live auctions', 'auction', 'nav.liveAuctions'],
  [Calculator, 'Calculators', 'tools', 'nav.calculators'],
  [Wrench, 'Services', 'services', 'nav.services'],
  [Ship, 'Shipping', 'shipping', 'nav.shipping'],
  [MapPin, 'Destinations', 'destinations', 'nav.destinations'],
  [BookOpen, 'How to buy', 'howbuy', 'nav.howToBuy'],
  [Newspaper, 'News & guides', 'news', 'nav.news'],
  [MessageCircle, 'Reviews', 'reviews', 'nav.reviews'],
  [ClipboardCheck, 'Help & FAQ', 'faq', 'nav.faq'],
  [BadgeCheck, 'About AR7', 'about', 'nav.about'],
  [LogIn, 'Client portal', 'portal', 'nav.portal']
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
    // 2026-11-16 Lighthouse round 2 (forced reflow): the old update() read
    // THREE getBoundingClientRect()s on every scroll frame and after every
    // DOM mutation — and the home page mutates constantly (the 1s auction
    // countdown, the rotating hero slides), so each React commit was chased
    // by a synchronous layout. The geometry is now measured only when it can
    // actually change (hero found, viewport resized, page height changed) and
    // cached; the scroll path compares window.scrollY against two numbers.
    let bounds = null;   // { leaveAt, backAt } in document pixels
    let dirty = true;    // geometry must be re-read on the next frame
    const measureBounds = () => {
      dirty = false;
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
      bounds = { leaveAt, backAt };
      // A real hero measured with a real boundary: the DOM watcher's one job
      // (catching a lazy route's hero mounting late) is done.
      if (mo && leaveAt > 0) { mo.disconnect(); mo = null; }
    };
    const update = () => {
      raf = 0;
      const had = target;
      resolve();
      if (!target) { setAway(false); return; }
      if (dirty || !bounds || target !== had) measureBounds();
      // The top of the document always shows the bar. A hero whose copy starts
      // only a few pixels below it yields a boundary of ~20px, and without this
      // guard a refresh at the top (or a lazy route that mounts its hero after
      // the first measurement) could park the bar in the tucked-away state on a
      // page the visitor has not scrolled at all.
      const next = window.scrollY > 0 && window.scrollY >= (last ? bounds.backAt : bounds.leaveAt);
      if (next !== last) { last = next; setAway(next); }
    };
    const onScroll = () => { if (!raf) raf = requestAnimationFrame(update); };
    const onDirty = () => { dirty = true; onScroll(); };
    // Declared before the first update() call — measureBounds() retires `mo`.
    let mo = null;
    let bodyRo = null;
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onDirty);
    // The lazy route chunk mounts its hero after this effect has run, and a
    // refresh on a deep URL never fires a scroll — so watch the DOM itself
    // (throttled through the same animation frame) and pick the hero up as
    // soon as it appears. Disconnected after the first successful measure.
    if (typeof MutationObserver === 'function') {
      mo = new MutationObserver(onDirty);
      mo.observe(document.body, { childList: true, subtree: true });
    }
    // Anything that changes the page's height above the hero (the promo bar
    // collapsing, a font swapping in) shifts the boundary — a ResizeObserver
    // on <body> re-measures exactly then, instead of on every mutation.
    if (typeof ResizeObserver === 'function') {
      bodyRo = new ResizeObserver(onDirty);
      bodyRo.observe(document.body);
    }
    return () => {
      cancelAnimationFrame(raf);
      mo?.disconnect();
      bodyRo?.disconnect();
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onDirty);
    };
  }, [ref, hold, menu, routeKey]);

  return away;
}

export function SiteHeader({
  page, vehicleId = null, makeFilter = null, brands = [], vehicleCount = 0,
  menu = false, setMenu = () => {}, dark = false, setDark = () => {},
  theme = null, setTheme = null,
  signedIn = false, navigate = () => {}, logoFor = () => '', ribbon = null, orb = null,
  promo = null, hold = true, onOpenSearch = null
}) {
  const headRef = useRef(null);
  const { t } = useLang(); // English fallback outside the provider
  // 2026-11-19 (owner): the Blue & Gold palette is retired — one day/night
  // switch remains. When only the legacy setDark boolean is supplied (older
  // callers, tests) it still works through it.
  const mode = theme || (dark ? 'dark' : 'light');
  const pick = next => { if (setTheme) setTheme(next); else setDark(next !== 'light'); };
  const isNight = mode === 'dark';
  const dayNightIcon = isNight ? <Sun/> : <Moon/>;
  const dayNightLabel = isNight ? t('nav.dayMode') : t('nav.nightMode');
  const toggleDayNight = () => pick(isNight ? 'light' : 'dark');
  // 2026-11-08: while the burger menu is open the page behind it must not
  // scroll — the panel has its own scroller and a dimmed backdrop, so a
  // moving page underneath reads as a glitch on phones and tablets.
  useEffect(() => {
    if (typeof document === 'undefined' || !menu) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [menu]);
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
      {/* 2026-11-07: width/height were the literal strings "None" (invalid HTML,
    no reserved box) and the 460px source PNG was 17KB for a 49px slot —
    both flagged by PageSpeed. The 128px webp is 3KB. */}
      {/* No aria-label here: the visible text ("AR7 TRADERS — GLOBAL VEHICLE
          EXPORTERS") IS the accessible name, which is what WCAG 2.5.3
          (label-in-name) requires — an aria-label that differs from the
          visible text breaks voice-control users who say what they see. */}
      <a className="brand" href="/" onClick={linkClick('home', navigate)}><img src="/assets/ar7-mark-128.webp" alt="" loading="lazy" decoding="async" width="56" height="56"/><span><b>AR7</b> <strong>TRADERS</strong><small>GLOBAL VEHICLE EXPORTERS</small></span></a>
      <div className="nav-orb" title="AR7 360° world network — click to explore">{orb}</div>
    </div>
    <div id="ar7-public-menu" className={'navlinks ' + (menu ? 'open' : '')}>
      {/* 2026-11-09 (owner screenshot): the dimmed backdrop behind the open
          burger sheet also dimmed the nav bar, so the X in the bar looked
          missing. The sheet now carries its own labelled close row (phones &
          tablets only — hidden on desktop by CSS), and the bar's actions are
          raised above the backdrop in site-layout.css. */}
      <div className="panel-head-row" aria-hidden={!menu}>
        <b>{t('nav.menu')}</b>
        <button type="button" className="panel-close" onClick={() => setMenu(false)} aria-label="Close menu"><X/></button>
      </div>
      <NavDropdown className="nav-inventory" panel="inventory-panel" routeKey={routeKey} label={t('nav.inventory')}>
        {close => INVENTORY_LINKS.map(x => {
          const I = x[0];
          return <a key={x[2]} href={hrefFor(x[2])} onClick={e => { close(); linkClick(x[2], navigate)(e); }}><i><I/></i><span>{x[3] ? t(x[3]) : x[1]}</span></a>;
        })}
      </NavDropdown>
      {/* 2026-11-18 (owner, mobile cleanup): the standalone "Auction access"
          bar link is gone — the More menu's "Live auctions" entry is the one
          auction door now, which keeps the bar and the burger panel short. */}
      <NavDropdown className="nav-brands" panel="brands-panel" routeKey={routeKey} label={t('nav.brands')}>
        {close => <>
          <div className="brands-panel-head"><b>{t('nav.brandsInInventory')}</b><span>{brands.length} makes · {vehicleCount} vehicles live</span></div>
          <div className="brands-grid">{brands.map(b => <a key={b.name} className={makeFilter === b.name ? ' current' : ''} href={inventoryHref(b.name)} onClick={e => { close(); linkClick(inventoryHref(b.name), navigate)(e); }}><img loading="lazy" decoding="async" width="30" height="19" src={logoFor(b.name)} alt="" onError={logoOnError}/><span>{b.name}</span><b>{b.count}</b></a>)}</div>
          <div className="brands-panel-foot">
            <a href="/brands" onClick={e => { close(); linkClick('brands', navigate)(e); }}><Layers/> {t('nav.allBrands')} <ArrowUpRight/></a>
            <a href="/inventory" onClick={e => { close(); linkClick('inventory', navigate)(e); }}><CarFront/> {t('nav.fullInventory')} <ArrowUpRight/></a>
          </div>
        </>}
      </NavDropdown>
      <NavDropdown className="nav-more nav-tier-full" panel="more-panel" routeKey={routeKey} label={t('nav.more')}>
        {close => MORE_LINKS.map(x => {
          const I = x[0];
          return <a key={x[2]} href={hrefFor(x[2])} onClick={e => { close(); linkClick(x[2], navigate)(e); }}><i><I/></i><span>{x[3] ? t(x[3]) : x[1]}</span></a>;
        })}
      </NavDropdown>
      <a className={'auction-link' + (page === 'contact' ? ' current' : '')} href="/contact" onClick={linkClick('contact', navigate)}><MessageCircle size={15}/>{' ' + t('nav.contact')}</a>
      {/* Only rendered inside the burger panel (≤899px, src/site-layout.css):
          the labelled account button and theme switch stay reachable on phones
          even when the bar's icon row runs out of room. */}
      <div className="nav-panel-actions">
        <a className="primary compact" href="/account" onClick={linkClick('account', navigate)}><LogIn/>{signedIn ? t('nav.myAccount') : t('nav.signIn')}</a>
        <button type="button" className="panel-theme" onClick={toggleDayNight} aria-pressed={isNight}>{dayNightIcon}{dayNightLabel}</button>
      </div>
    </div>
    <div className="nav-actions">
      {/* Global search (⌘K). One pill above 1100px, a plain icon below it —
          the overlay itself is a lazy chunk mounted by main.jsx. */}
      {/* 2026-11-07 redesign (owner request): the wide "Search … Ctrl K" pill
          took the room of two buttons. Now a compact gold icon button at every
          width; Ctrl+K still works and the title still advertises it. */}
      {onOpenSearch && <button type="button" className="nav-search" onClick={onOpenSearch} aria-label="Search the site" title="Search cars, machinery and guides (Ctrl+K)">
        <Search/>
      </button>}
      <LanguageSwitcher/>
          <CurrencyDropdown/>
      <a className="icon-btn studio-btn" href="/studio" onClick={linkClick('studio', navigate)} aria-label="Preview device modes" title="Phone, tablet, laptop & PC preview"><Monitor/></a>
      <button type="button" className="icon-btn" onClick={toggleDayNight} aria-label="Toggle theme" aria-pressed={isNight} title={'Switch to ' + dayNightLabel.toLowerCase()}>{dayNightIcon}</button>
      <a className="icon-btn portal-btn" href="/account" onClick={linkClick('account', navigate)} aria-label="Sign in to your account" title="Sign in to your account"><LogIn/></a>
      <a className="primary compact" href="/account" onClick={linkClick('account', navigate)}>{signedIn ? <>{t('nav.myAccount')} <UserCog/></> : <>{t('nav.signUp')} <UserPlus/></>}</a>
      <button type="button" className="menu-btn" onClick={() => setMenu(!menu)} aria-expanded={menu} aria-controls="ar7-public-menu" aria-label={menu ? 'Close menu' : 'Open menu'}>{menu ? <X/> : <Menu/>}</button>
    </div>
  </nav></header>;
}
