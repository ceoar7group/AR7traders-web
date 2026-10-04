// Pricing helpers shared by the public site, CRM and PromoBar.
//
// Discounts are item-specific only: car:REF or machine:REF. There is no
// catalogue-wide discount path; each page resolves the same validated entry
// before showing a reduced price. Promotions are independent banner content
// published from the staff-only SEO desk.

import {useEffect, useMemo, useState} from 'react';
import {useSettings} from './site-settings.js';
import {EMPTY_STOCK_DISCOUNTS, parseStockDiscounts, describeStockDiscounts} from './stock-discounts-public.js';
export {
  STOCK_DISCOUNT_VERSION, STOCK_DISCOUNT_MIN_PERCENT, STOCK_DISCOUNT_MAX_PERCENT,
  STOCK_DISCOUNT_MAX_ITEMS, EMPTY_STOCK_DISCOUNTS, stockDiscountKey,
  parseStockDiscounts, stockDiscountIsLive, stockDiscountFor, describeStockDiscounts
} from './stock-discounts-public.js';


/** Resolve the public stock-discount setting, with a static-deploy fallback. */
export function useStockDiscounts() {
  const settings = useSettings();
  const raw = settings?.stock_discounts;
  const fromSettings = useMemo(() => raw ? parseStockDiscounts(raw) : null, [raw]);
  const [fromFile, setFromFile] = useState(EMPTY_STOCK_DISCOUNTS);

  useEffect(() => {
    if (fromSettings) return undefined;
    let alive = true;
    fetch('/stock-discounts.json', {cache: 'no-store'})
      .then(r => r.ok ? r.json() : null)
      .then(data => { if (alive && data) setFromFile(parseStockDiscounts(data)); })
      .catch(() => { /* no static discounts file in this deployment */ });
    return () => { alive = false; };
  }, [fromSettings]);

  return fromSettings || fromFile;
}

/** Prices are rounded to $50 so a discounted price never looks invented. */
export const roundOfferPrice = n => Math.round(Number(n) / 50) * 50;

/**
 * Shared discount arithmetic. Returns the visible list price, buyer price and
 * saving. Every discounted public price keeps the list price alongside it.
 */
export function priceWithOffer(listPrice, percent) {
  const was = Math.max(0, Number(listPrice) || 0);
  const pct = Number(percent) > 0 ? Math.round(Number(percent)) : 0;
  if (!pct || !was) return {hasOffer: false, was, now: was, saving: 0, percent: 0};
  const now = roundOfferPrice(was * (1 - pct / 100));
  return {hasOffer: true, was, now, saving: Math.max(0, was - now), percent: pct};
}

export const formatDate = iso => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'});
};

/** A public banner campaign is separate from item-specific price discounts. */
export function campaignIsLive(promo, now = new Date()) {
  if (!promo || !promo.active) return false;
  if (!promo.until) return true;
  const end = new Date(`${promo.until}T23:59:59`);
  return Number.isFinite(end.getTime()) && now <= end;
}

/** Campaign and selected-stock rows can be dismissed independently. */
export const barRows = ({promo, campaignDismissed, stockDiscounts, offerDismissed, now} = {}) => ({
  campaign: campaignIsLive(promo, now) && !campaignDismissed ? promo : null,
  offer: offerDismissed ? null : describeStockDiscounts(stockDiscounts, now)
});
