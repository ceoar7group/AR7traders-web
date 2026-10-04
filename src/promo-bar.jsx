// The promotion bar.
//
// Two independent sources, BOTH of which can be live at once:
//   • a campaign — the `promo` setting, which the CRM's Promotions panel (or
//     `npm run promo:publish`) writes, falling back to /promo.json, the file
//     the agent writes into public/ for a deployment with no API;
//   • a price offer — the CRM's Price offers panel (or `npm run offer`), which
//     is the discount actually applied to every listed price.
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
import { useOffer, barRows, campaignIsLive } from './offers.js';

const DISMISS_KEY = 'ar7-promo-dismissed';
const OFFER_DISMISS_KEY = 'ar7-price-offer-dismissed';

export function PromoBar({ navigate }) {
  const [promo, setPromo] = useState(null);
  const [hidden, setHidden] = useState(false);
  const [offerHidden, setOfferHidden] = useState(false);
  const settings = useSettings();
  const offer = useOffer();

  // 1. The CRM-controlled setting wins when it parses.
  useEffect(() => {
    const raw = settings?.promo;
    if (!raw) return;
    try {
      const live = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (live?.active) setPromo(live);
    } catch { /* a malformed setting falls through to the file */ }
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

  // A dismissal is remembered against the campaign's own id, whichever source
  // published it — the setting and the file are the same campaign, and one
  // "close" has to mean one close. (The setting path used to ignore the stored
  // dismissal, so a dismissed campaign reappeared on the next page load.)
  useEffect(() => {
    if (!promo?.id) return;
    try { if (localStorage.getItem(DISMISS_KEY) === promo.id) setHidden(true); } catch { /* ignore */ }
  }, [promo?.id]);

  // A dismissed price offer stays dismissed for that offer only — a new
  // percentage is news again.
  useEffect(() => {
    if (!offer) return;
    try { if (localStorage.getItem(OFFER_DISMISS_KEY) === offer.id) setOfferHidden(true); } catch { /* ignore */ }
  }, [offer?.id]);

  // Both sources, filtered by liveness and by what the visitor has dismissed.
  // They render as two rows of ONE bar: a campaign running for a season must
  // not hide a discount the owner has just published, and dismissing one must
  // not take the other down with it.
  const rows = barRows({promo, campaignDismissed: hidden, offer, offerDismissed: offerHidden});
  const campaign = rows.campaign;
  const offerLine = rows.offer;

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
  }, [promo, hidden, offer, offerHidden, campaign, offerLine]);

  if (!campaign && !offerLine) return null;

  // Each row remembers its own dismissal, against its own id.
  const closeCampaign = () => {
    setHidden(true);
    try { localStorage.setItem(DISMISS_KEY, campaign.id); } catch { /* ignore */ }
  };
  const closeOffer = () => {
    setOfferHidden(true);
    try { localStorage.setItem(OFFER_DISMISS_KEY, offer.id); } catch { /* ignore */ }
  };
  const offerHref = offer?.scope === 'cars' ? '/inventory' : '/machinery';

  return (
    <div className={'promo-bar' + (offerLine ? ' price-offer-bar' : '')} role="region"
      aria-label={campaign ? 'Current offer' : 'Price offer'}>
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
      {/* The price offer is the owner's own pricing decision, it is applied on
          the cards and the machine pages, and this row is how a visitor who
          never reaches /machinery hears about it. It shares the bar with a
          campaign rather than being replaced by it, and it is dismissed on its
          own — that is the fix for "I published a discount and nothing showed". */}
      {offerLine && (
        <div className="shell promo-bar-inner promo-bar-offer">
          <span className="promo-tag"><Tag size={13}/></span>
          <b>{offerLine.line}</b>
          <span className="promo-sub">{offerLine.untilLabel ? `Ends ${offerLine.untilLabel}. ` : ''}Indicative FOB price, confirmed with your quotation.</span>
          <span className="promo-pill">{offer.percent}% off</span>
          <a className="promo-cta" href={offerHref} onClick={linkClick(offerHref, navigate)}>
            See the price <ArrowRight size={14}/>
          </a>
          <button className="promo-x" type="button" onClick={closeOffer} aria-label="Dismiss this price offer"><X size={14}/></button>
        </div>
      )}
    </div>
  );
}
