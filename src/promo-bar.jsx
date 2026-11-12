// The promotion bar.
//
// Two independent sources, BOTH of which can be live at once:
//   • a campaign — the `promo` setting, published in the staff-only SEO desk,
//     falling back to /promo.json for a deployment without the settings API;
//   • selected-stock savings — the CRM's Price offers panel (or `npm run offer`),
//     which applies only to the exact vehicle or machine reference saved.
// They render as two rows of one bar, each dismissed on its own. The offer row
// used to be suppressed whenever a campaign was running, so a season-long
// campaign made the owner's freshly published discount look like it had never
// reached the site — see src/offers.js `barRows`.
// Deliberately small and dismissible: a promotion that cannot be closed is an
// advert, and this is a showroom.
//
// The bar disappears on its own when `until` passes, so a campaign can never
// outlive its end date just because nobody remembered to take it down. That is
// also why the date is checked here rather than trusted to the person who
// published it.

import React, { useEffect, useState } from 'react';
import { ArrowRight, Tag, X } from 'lucide-react';
import { hrefFromTarget, linkClick } from './routing.js';
import { useSettings } from './site-settings.js';
import { useStockDiscounts, barRows, campaignIsLive } from './offers.js';

const DISMISS_KEY = 'ar7-promo-dismissed';
const OFFER_DISMISS_KEY = 'ar7-price-offer-dismissed';
// Last measured bar height. The promo answer arrives over the network, and on
// every page view the bar used to mount AFTER first paint — pushing the nav,
// the hero and everything else down (PageSpeed CLS culprits `nav.shell` and
// `section.hero.shell`, 2026-11-07). Re-reserving the previous visit's height
// before first paint makes the bar appear in already-reserved space.
const HEIGHT_KEY = 'ar7-promo-h';

// The ribbon's top margin is --head-pad after the empty slot but --head-gap
// after the real bar (site-layout.css §8), so a reservation equal to the raw
// bar height still shifted the page by pad−gap when the bar mounted
// (2026-11-17, Lighthouse mobile CLS). Everything that reserves space now
// subtracts that difference; the stylesheet is loaded by the time React runs,
// so it is read live rather than mirroring breakpoints.
function marginDelta() {
  try {
    const cs = getComputedStyle(document.documentElement);
    const pad = parseFloat(cs.getPropertyValue('--head-pad')) || 0;
    const gap = parseFloat(cs.getPropertyValue('--head-gap')) || 0;
    const d = pad - gap;
    return Number.isFinite(d) && d >= 0 && d < 40 ? d : 0;
  } catch { return 0; }
}

export function PromoBar({ navigate }) {
  const [promo, setPromo] = useState(null);
  useState(() => {   // runs once, synchronously, before the browser paints
    try {
      const stored = localStorage.getItem(HEIGHT_KEY);
      if (stored != null) {
        // A previous visit measured the real bar (or confirmed '0' = no
        // campaign). Reserve exactly that; zero means reserve nothing.
        const h = parseInt(stored, 10);
        if (Number.isFinite(h) && h >= 0 && h < 200) {
          document.documentElement.style.setProperty('--promo-h', Math.max(h - marginDelta(), 0) + 'px');
          return;
        }
      }
      // FIRST visit: nothing is known yet, and this is the visit Lighthouse
      // and every new customer gets. A campaign is live far more often than
      // not, so reserve one typical row optimistically — when the promo
      // answers it lands in already-reserved space (CLS ≈ 0) instead of
      // pushing the nav and the hero down (the 2026-11 mobile CLS culprit).
      // If no campaign is live the slot collapses once, and '0' is stored so
      // the next visit reserves nothing.
      document.documentElement.style.setProperty('--promo-h', Math.max(47 - marginDelta(), 0) + 'px');
    } catch { /* private mode: first paint reserves nothing, as before */ }
  });
  const [hidden, setHidden] = useState(false);
  // True once either promo source has actually answered. Until then the
  // reserved `--promo-h` must not be zeroed, or the pre-paint reservation
  // collapses the moment React mounts — reintroducing the very shift it
  // exists to prevent.
  const [settled, setSettled] = useState(false);
  const [offerHidden, setOfferHidden] = useState(false);
  const settings = useSettings();
  const stockDiscounts = useStockDiscounts();

  // 1. The CRM-controlled setting wins when it parses.
  useEffect(() => {
    const raw = settings?.promo;
    if (!raw) return;
    try {
      const live = typeof raw === 'string' ? JSON.parse(raw) : raw;
      setPromo(live?.active ? live : null);
    } catch { setPromo(null); }
    setSettled(true);
  }, [settings?.promo]);

  // 2. The published file is the fallback, and what a static deploy shows.
  useEffect(() => {
    if (promo) return;                        // the live setting already answered
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/promo.json', { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!alive || !data?.active) return;
        if (settings?.promo) return;           // the API answered while we fetched
        // An expired campaign is not shown, and not shown to anybody: the
        // end date is the end date. `campaignIsLive` runs the same check here
        // and again at render time, so the file and the live setting cannot
        // disagree about what "until" means.
        if (!campaignIsLive(data)) return;
        setPromo(data);
      } catch { /* no promo file, or offline preview: show nothing */ }
      finally { if (alive) setSettled(true); }
    })();
    return () => { alive = false; };
  }, [promo, settings?.promo]);

  // Dismissal is remembered by campaign id and by the exact set of stock
  // discounts. A changed id becomes visible again; either row can be closed alone.
  const rows = barRows({promo, campaignDismissed: hidden, stockDiscounts});
  const currentStockRow = rows.offer;
  useEffect(() => {
    try {
      setHidden(!!promo?.id && localStorage.getItem(DISMISS_KEY) === promo.id);
      setOfferHidden(!!currentStockRow && localStorage.getItem(OFFER_DISMISS_KEY) === currentStockRow.id);
    } catch { setHidden(false); setOfferHidden(false); }
  }, [promo?.id, currentStockRow?.id]);

  // The campaign and stock-savings rows remain independent: launching a
  // campaign does not hide per-stock prices, and dismissing one leaves the other.
  const campaign = rows.campaign;
  const offerLine = offerHidden ? null : currentStockRow;

  // The header is `position: fixed; top: 0`, so the bar reserves its own height
  // as a CSS variable the header reads. Without this the bar would sit under
  // the nav on every page. It is measured after the rows are known, so a bar
  // carrying both a campaign and a price offer reserves both.
  useEffect(() => {
    const root = document.documentElement;
    if (campaign || offerLine) {
      const h = document.querySelector('.promo-bar')?.offsetHeight || 47;
      // --promo-h feeds --head-h, which assumes the no-bar margins; the bar
      // swaps the ribbon's pad margin for a gap margin, so the exact page
      // offset (and the exact slot height for the next paint) is h − delta.
      root.style.setProperty('--promo-h', Math.max(h - marginDelta(), 0) + 'px');
      try { localStorage.setItem(HEIGHT_KEY, String(h)); } catch { /* ignore */ }
    } else if (settled) {
      // Only a CONFIRMED "no campaign" clears the reservation; while the
      // answer is in flight the previous visit's height keeps holding the
      // nav in place (the empty .promo-slot below occupies it).
      // '0' is stored (not removed) so the next visit knows "no campaign"
      // and skips the optimistic first-visit reservation above.
      root.style.setProperty('--promo-h', '0px');
      try { localStorage.setItem(HEIGHT_KEY, '0'); } catch { /* ignore */ }
    }
    return () => root.style.setProperty('--promo-h', '0px');
  }, [promo?.id, hidden, currentStockRow?.id, offerHidden, campaign?.id, offerLine?.id, settled]);

  // While there is nothing to show, hold the previously reserved height open
  // instead of unmounting (2026-11-10, PageSpeed `nav.shell` CLS 0.053): the
  // bar sits ABOVE the ribbon and nav inside the fixed header, so on a repeat
  // visit `--promo-h` is restored before first paint but the nav still
  // started at the top and jumped down 45px when the answer arrived. An empty
  // slot of exactly `var(--promo-h)` keeps the ribbon and nav where the bar
  // will put them; for a first-time visitor the variable is 0px and the slot
  // reserves nothing, exactly as before.
  if (!campaign && !offerLine) return <div className="promo-slot" aria-hidden="true" style={{height: 'var(--promo-h, 0px)'}}/>;

  // Each row remembers its own dismissal, against its own id.
  const closeCampaign = () => {
    setHidden(true);
    try { localStorage.setItem(DISMISS_KEY, campaign.id); } catch { /* ignore */ }
  };
  const closeOffer = () => {
    setOfferHidden(true);
    try { localStorage.setItem(OFFER_DISMISS_KEY, offerLine.id); } catch { /* ignore */ }
  };
  const offerHref = offerLine?.href || '/inventory';

  return (
    <div className={'promo-bar' + (offerLine ? ' price-offer-bar' : '')} role="region"
      aria-label={campaign ? 'Current campaign and stock savings' : 'Selected stock savings'}>
      {campaign && (
        <div className="shell promo-bar-inner">
          <span className="promo-tag"><Tag size={13}/></span>
          <b>{campaign.headline}</b>
          <span className="promo-sub">{campaign.sub}</span>
          {campaign.discount ? <span className="promo-pill">{campaign.discount}% off margin</span> : null}
          {/* Same link contract as every other internal link on the site:
              a real href a crawler can follow, with client-side navigation on
              click when JS is running. */}
          <a className="promo-cta" href={hrefFromTarget(campaign.href)} onClick={linkClick(campaign.href, navigate)}>
            {campaign.cta || 'See more'} <ArrowRight size={14}/>
          </a>
          <button className="promo-x" type="button" onClick={closeCampaign} aria-label="Dismiss this offer"><X size={14}/></button>
        </div>
      )}
      {/* Itemized stock savings never claim that the whole catalogue is discounted. */}
      {offerLine && (
        <div className="shell promo-bar-inner promo-bar-offer">
          <span className="promo-tag"><Tag size={13}/></span>
          <b>{offerLine.line}</b>
          <span className="promo-sub">{offerLine.note}</span>
          <span className="promo-pill">{offerLine.label}</span>
          <a className="promo-cta" href={offerHref} onClick={linkClick(offerHref, navigate)}>
            See discounted stock <ArrowRight size={14}/>
          </a>
          <button className="promo-x" type="button" onClick={closeOffer} aria-label="Dismiss this stock-discount notice"><X size={14}/></button>
        </div>
      )}
    </div>
  );
}
