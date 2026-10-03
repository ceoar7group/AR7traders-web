// The promotion bar.
//
// Three sources, in order:
//   0. a live price offer (the CRM's Price offers panel, or `npm run offer`),
//      which is a pricing decision rather than a campaign — it is what the
//      whole site is charging, so it outranks nothing but appears when no
//      campaign is running;
//   1./2. the campaign below.
//   1. the `promo` setting, which the CRM's Promotions panel (or
//      `npm run promo:publish`) writes — staff can change the campaign and it
//      is live on the next page load, no deploy;
//   2. /promo.json, the file the agent writes into public/, which is what the
//      site shows when the API is unreachable.
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
import { useOffer, describeOffer } from './offers.js';

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
        // end date is the end date.
        if (data.until && new Date(data.until + 'T23:59:59') < new Date()) return;
        try {
          if (localStorage.getItem(DISMISS_KEY) === data.id) return;
        } catch { /* private mode: show it, do not remember the dismissal */ }
        setPromo(data);
      } catch { /* no promo file, or offline preview: show nothing */ }
    })();
    return () => { alive = false; };
  }, [promo, settings?.promo]);

  // A dismissed price offer stays dismissed for that offer only — a new
  // percentage is news again.
  useEffect(() => {
    if (!offer) return;
    try { if (localStorage.getItem(OFFER_DISMISS_KEY) === offer.id) setOfferHidden(true); } catch { /* ignore */ }
  }, [offer?.id]);

  // The header is `position: fixed; top: 0`, so the bar reserves its own height
  // as a CSS variable the header reads. Without this the bar would sit under
  // the nav on every page.
  useEffect(() => {
    const root = document.documentElement;
    if ((promo && !hidden) || (!promo && offer && !offerHidden)) {
      const h = document.querySelector('.promo-bar')?.offsetHeight || 44;
      root.style.setProperty('--promo-h', h + 'px');
    } else {
      root.style.setProperty('--promo-h', '0px');
    }
    return () => root.style.setProperty('--promo-h', '0px');
  }, [promo, hidden, offer, offerHidden]);

  if (hidden && promo) return null;

  // A live price offer gets the same bar when no campaign is running. It is the
  // owner's own pricing decision, it is applied on the cards and the machine
  // pages, and the bar is how a visitor who never reaches /machinery hears
  // about it. It is dismissible like everything else here.
  const offerLine = !promo ? describeOffer(offer) : null;
  if (!promo && offerLine && !offerHidden) {
    const href = offer.scope === 'cars' ? '/inventory' : '/machinery';
    const closeOffer = () => {
      setOfferHidden(true);
      try { localStorage.setItem(OFFER_DISMISS_KEY, offer.id); } catch { /* ignore */ }
    };
    return (
      <div className="promo-bar price-offer-bar" role="region" aria-label="Price offer">
        <div className="shell promo-bar-inner">
          <span className="promo-tag"><Tag size={13}/></span>
          <b>{offerLine.line}</b>
          <span className="promo-sub">{offerLine.untilLabel ? `Ends ${offerLine.untilLabel}. ` : ''}Indicative FOB price, confirmed with your quotation.</span>
          <span className="promo-pill">{offer.percent}% off</span>
          <a className="promo-cta" href={href} onClick={linkClick(href, navigate)}>
            See the price <ArrowRight size={14}/>
          </a>
          <button className="promo-x" type="button" onClick={closeOffer} aria-label="Dismiss this price offer"><X size={14}/></button>
        </div>
      </div>
    );
  }

  if (!promo || hidden) return null;

  const close = () => {
    setHidden(true);
    try { localStorage.setItem(DISMISS_KEY, promo.id); } catch { /* ignore */ }
  };

  return (
    <div className="promo-bar" role="region" aria-label="Current offer">
      <div className="shell promo-bar-inner">
        <span className="promo-tag"><Tag size={13}/></span>
        <b>{promo.headline}</b>
        <span className="promo-sub">{promo.sub}</span>
        {promo.discount ? <span className="promo-pill">{promo.discount}% off margin</span> : null}
        {/* Same link contract as every other internal link on the site:
            a real href a crawler can follow, with client-side navigation on
            click when JS is running. */}
        <a className="promo-cta" href={hrefFromTarget(promo.href)} onClick={linkClick(promo.href, navigate)}>
          {promo.cta || 'See more'} <ArrowRight size={14}/>
        </a>
        <button className="promo-x" type="button" onClick={close} aria-label="Dismiss this offer"><X size={14}/></button>
      </div>
    </div>
  );
}
