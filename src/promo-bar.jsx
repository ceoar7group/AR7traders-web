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

export function PromoBar({ navigate }) {
  const [promo, setPromo] = useState(null);
  const [hidden, setHidden] = useState(false);
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
      const h = document.querySelector('.promo-bar')?.offsetHeight || 44;
      root.style.setProperty('--promo-h', h + 'px');
    } else {
      root.style.setProperty('--promo-h', '0px');
    }
    return () => root.style.setProperty('--promo-h', '0px');
  }, [promo?.id, hidden, currentStockRow?.id, offerHidden, campaign?.id, offerLine?.id]);

  if (!campaign && !offerLine) return null;

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
