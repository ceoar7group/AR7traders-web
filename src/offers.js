// Price offers — the discount the owner applies from the CRM, and the same
// discount the website shows.
//
// ONE RULE: the website never does arithmetic on a percentage it read from
// anywhere except this module. A card, a detail page, the home teaser and the
// structured data all call `priceWithOffer(listPrice, percentFor(...))`, so a
// 20% offer cannot show as 20% in one place and 18% in another.
//
// ── WHERE AN OFFER LIVES ────────────────────────────────────────────────────
//   • the live one  — the `offer` site setting, written from the CRM's
//                     "Price offers" panel, or by `npm run offer` (the agent),
//                     or straight from a request typed into that panel. It is
//                     a public setting: it is the price every visitor sees.
//   • the file      — public/offer.json, written by `npm run offer`. It is the
//                     fallback for a deployment with no API (or before the
//                     first CRM publish). Same shape, same validation.
//
// ── WHAT AN OFFER MAY SAY ───────────────────────────────────────────────────
//   {
//     active: true,
//     scope: 'machinery' | 'cars' | 'all',
//     percent: 20,                  // whole percent, 1–60
//     types: ['Excavators'],        // optional: only these machine types
//     machines: { 'AR7-MC-001': 15 },// optional: per-unit override, wins
//     label: 'Autumn offer',        // short, shown on the badge
//     headline: '20% off machinery',// the sentence the banner shows
//     until: '2026-11-30',          // optional; after this date it is dead
//     publishedAt, publishedBy      // who set it, for the audit trail
//   }
//
// Honesty rules this keeps (see CLAIMS-POLICY.md): a discount is our own
// pricing decision, so it is safe to state — but it is applied to the
// *indicative* FOB price, so the site keeps saying "indicative, confirmed by
// written quotation" beside every discounted number. A discount never implies
// a unit is in stock.

import {useEffect, useState} from 'react';
import {useSettings} from './site-settings.js';

export const OFFER_SCOPES = ['machinery', 'cars', 'all'];
export const MIN_OFFER_PERCENT = 1;
export const MAX_OFFER_PERCENT = 60;

/** Prices are rounded to $50 so a discounted price never looks invented. */
export const roundOfferPrice = n => Math.round(Number(n) / 50) * 50;

const slug = value => String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

/** ISO date or null. Anything else is dropped rather than guessed at. */
export const isoDate = value => {
  const s = String(value ?? '').trim();
  if (!s) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const parsed = new Date(s);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

/**
 * Validate and normalise an offer of unknown origin (a settings string, a
 * file, a hand-typed object). Returns `{ok, value, error}` — never throws, and
 * never keeps a field it could not verify.
 */
export function validateOffer(raw) {
  let offer = raw;
  if (typeof raw === 'string') {
    try { offer = JSON.parse(raw); } catch { return {ok: false, error: 'The offer is not valid JSON.'}; }
  }
  if (!offer || typeof offer !== 'object' || Array.isArray(offer)) return {ok: false, error: 'The offer must be an object.'};
  if (typeof offer.active !== 'boolean') return {ok: false, error: 'offer.active must be true or false.'};
  if (!offer.active) return {ok: true, value: {active: false}};

  const scope = OFFER_SCOPES.includes(offer.scope) ? offer.scope : null;
  if (!scope) return {ok: false, error: 'Choose what the discount applies to: machinery, cars or everything.'};
  const percent = Number(offer.percent);
  if (!Number.isFinite(percent) || percent < MIN_OFFER_PERCENT || percent > MAX_OFFER_PERCENT) {
    return {ok: false, error: `The discount must be a whole number between ${MIN_OFFER_PERCENT}% and ${MAX_OFFER_PERCENT}%.`};
  }
  const value = {
    active: true,
    id: String(offer.id || `offer-${slug(offer.label || offer.headline || 'price')}-${Math.round(percent)}`).slice(0, 60),
    scope,
    percent: Math.round(percent),
    label: String(offer.label || '').slice(0, 40) || null,
    headline: String(offer.headline || '').slice(0, 90) || `${Math.round(percent)}% off`,
    until: isoDate(offer.until),
    types: Array.isArray(offer.types) ? offer.types.map(String).filter(Boolean).slice(0, 8) : [],
    machines: {},
    publishedAt: offer.publishedAt ? String(offer.publishedAt).slice(0, 40) : new Date().toISOString(),
    publishedBy: offer.publishedBy ? String(offer.publishedBy).slice(0, 80) : null
  };
  // Per-unit overrides: only real refs, only real percentages.
  const overrides = offer.machines && typeof offer.machines === 'object' && !Array.isArray(offer.machines) ? offer.machines : {};
  for (const [ref, pct] of Object.entries(overrides)) {
    const n = Number(pct);
    if (!ref || !Number.isFinite(n) || n < MIN_OFFER_PERCENT || n > MAX_OFFER_PERCENT) continue;
    value.machines[String(ref).toUpperCase()] = Math.round(n);
  }
  return {ok: true, value};
}

/** Safe read of the settings/file string: an unusable offer reads as no offer. */
export function parseOffer(raw) {
  const result = validateOffer(raw);
  return result.ok && result.value.active ? result.value : null;
}

/** Is the offer live right now? An offer with an end date stops on that date. */
export function offerIsLive(offer, now = new Date()) {
  if (!offer || !offer.active) return false;
  if (!offer.until) return true;
  const end = new Date(`${offer.until}T23:59:59`);
  if (Number.isNaN(end.getTime())) return false;
  return now <= end;
}

/** Does this offer cover the thing being priced? */
export function offerCovers(offer, kind, {type} = {}) {
  if (!offer || !offer.active) return false;
  if (offer.scope === 'all') return true;
  if (kind === 'machine') {
    if (offer.scope !== 'machinery') return false;
    if (offer.types && offer.types.length) {
      return offer.types.some(t => String(t).toLowerCase() === String(type || '').toLowerCase());
    }
    return true;
  }
  return offer.scope === 'cars';
}

/**
 * The discount to apply to one item, in percent.
 * `kind` is 'machine' or 'car'; `ref` is the machine reference (per-unit
 * overrides only exist for machines, because a car's price is a single number
 * the inventory row already controls).
 */
export function percentFor(offer, kind, {ref, type} = {}) {
  if (!offerIsLive(offer)) return 0;
  if (kind === 'machine' && ref) {
    const override = offer.machines?.[String(ref).toUpperCase()];
    if (Number.isFinite(override)) return override;   // a unit offer beats the campaign
  }
  if (!offerCovers(offer, kind, {type})) return 0;
  return offer.percent;
}

/**
 * The one price function. Returns the list price, the discounted price, what
 * the buyer saves, and how to write it — or `hasOffer: false` when nothing
 * applies, so a caller can render the plain price with no special casing.
 */
export function priceWithOffer(listPrice, percent) {
  const was = Math.max(0, Number(listPrice) || 0);
  const pct = Number(percent) > 0 ? Math.round(Number(percent)) : 0;
  if (!pct || !was) return {hasOffer: false, was, now: was, saving: 0, percent: 0};
  const now = roundOfferPrice(was * (1 - pct / 100));
  return {hasOffer: true, was, now, saving: Math.max(0, was - now), percent: pct};
}

/** "20% off" — the badge text. */
export const offerBadge = (percent, label) => label ? `${label}` : `${percent}% off`;

/** A full sentence for a banner: "20% off machinery — ends 30 Nov 2026". */
/**
 * Is a campaign live right now? The end date is checked here — for the live
 * setting as well as for /promo.json — because a campaign written into the
 * database by the CRM used to outlive its `until` date for exactly as long as
 * nobody edited the record.
 */
export function campaignIsLive(promo, now = new Date()) {
  if (!promo || !promo.active) return false;
  if (!promo.until) return true;
  const end = new Date(`${promo.until}T23:59:59`);
  return Number.isNaN(end.getTime()) || now <= end;
}

/**
 * The rows the promotion bar renders. A campaign and a price offer are
 * independent sources and BOTH show while they are live: the offer row used to
 * be gated on "no campaign running", which is why a season-long campaign read
 * as "the discount I published never appeared". Each row is dismissed on its
 * own, and neither dismissal touches the other.
 */
export const barRows = ({promo, campaignDismissed, offer, offerDismissed, now}) => ({
  campaign: campaignIsLive(promo, now) && !campaignDismissed ? promo : null,
  offer: offerDismissed ? null : describeOffer(offer, now)
});

export function describeOffer(offer, now = new Date()) {
  if (!offerIsLive(offer, now)) return null;
  const what = offer.types && offer.types.length
    ? offer.types.join(', ').toLowerCase()
    : offer.scope === 'machinery' ? 'machinery'
      : offer.scope === 'cars' ? 'our listed cars' : 'everything we list';
  const line = offer.headline || `${offer.percent}% off ${what}`;
  return {
    percent: offer.percent,
    label: offerBadge(offer.percent, offer.label),
    line,
    scope: offer.scope,
    until: offer.until,
    untilLabel: offer.until ? formatDate(offer.until) : null,
    note: offer.until
      ? `${line} — ends ${formatDate(offer.until)}. Applied to the indicative FOB price; confirmed with your quotation.`
      : `${line}. Applied to the indicative FOB price; confirmed with your quotation.`
  };
}

export const formatDate = iso => {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleDateString('en-GB', {day: 'numeric', month: 'short', year: 'numeric'});
};

/**
 * The live offer, resolved once per render tree: the CRM setting first, the
 * file published by `npm run offer` as the fallback. Returns null when no
 * offer is live, which is the normal state.
 */
export function useOffer() {
  const settings = useSettings();
  const fromSettings = parseOffer(settings?.offer);
  const [fromFile, setFromFile] = useState(null);
  const key = fromSettings ? 'settings' : 'none';
  // /offer.json is only read when the settings API did not answer at all — a
  // static deployment, or a preview with no backend. Asking for it on every
  // page load would be a second request for a file that is almost never there.
  const apiAnswered = settings?.__source !== 'fallback';
  useEffect(() => {
    if (fromSettings || apiAnswered) return undefined;
    let alive = true;
    fetch('/offer.json', {cache: 'no-store'})
      .then(r => (r.ok ? r.json() : null))
      .then(data => { if (alive && data) setFromFile(parseOffer(data)); })
      .catch(() => { /* no file published — no offer */ });
    return () => { alive = false; };
  }, [key, fromSettings, apiAnswered]);
  const live = [fromSettings, fromFile].find(o => offerIsLive(o));
  return live || null;
}
