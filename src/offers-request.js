// Turning a written instruction into a price offer.
//
// Kept apart from src/offers.js on purpose: this is the sentence parser, and
// only the CRM and `npm run offer` use it. The public site never needs it, so it
// stays in the CRM's lazy chunk instead of the first-load bundle.
//
// It is deterministic — a percentage, a scope and a date, read from the words
// below — and it says so when it cannot find them rather than guessing. A
// language model is not required to apply a discount, and a wrong percentage on
// a live price is not a thing to leave to chance.
import { validateOffer, isoDate, formatDate, MIN_OFFER_PERCENT, MAX_OFFER_PERCENT } from './offers.js';

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december'];

/**
 * Turn a plain-English instruction into an offer the CRM can review and
 * publish. This is the "ask the agent to do it" surface: it is a deterministic
 * parser, not a language model — it understands the sentences below and says
 * so when it does not, rather than inventing a percentage.
 *
 *   "20% off machinery"
 *   "apply 15% discount on excavators until 30 November"
 *   "10 percent off all cars"
 *   "special offer 25% off everything until 2026-12-31"
 *   "clear the offer"
 */
export function parseOfferRequest(text, {now = new Date(), machines = [], existing = null} = {}) {
  const raw = String(text || '').trim();
  if (!raw) return {ok: false, reply: 'Tell me the discount — for example "20% off machinery until 30 November".'};

  if (/\b(clear|remove|cancel|stop|end|kill)\b/i.test(raw) && /\b(offer|discount|sale|deal)\b/i.test(raw)) {
    return {ok: true, action: 'clear', offer: {active: false}, reply: 'Clearing the price offer. Visitors go back to the list price on the next page load.'};
  }

  const percentMatch = raw.match(/(\d{1,2}(?:\.\d+)?)\s*(?:%|percent|per cent|pc\b)/i)
    || raw.match(/\b(?:discount|off|reduce|drop|cut)\D{0,12}(\d{1,2})\b/i);
  if (!percentMatch) {
    return {ok: false, reply: 'I could not find a percentage. Say it as a number — "15% off excavators" or "20 percent off machinery".'};
  }
  const percent = Number(percentMatch[1]);
  if (!Number.isFinite(percent) || percent < MIN_OFFER_PERCENT || percent > MAX_OFFER_PERCENT) {
    return {ok: false, reply: `A discount has to be between ${MIN_OFFER_PERCENT}% and ${MAX_OFFER_PERCENT}%. ${percent}% is outside that range.`};
  }

  // Scope: machinery is the default desk here, but only when the sentence
  // actually points at it. An unscoped instruction asks instead of guessing.
  let scope = null;
  const typeWords = [...new Set(machines.map(m => m.type))];
  const types = typeWords.filter(t => new RegExp(`\\b${t.toLowerCase().replace(/s$/, '')}s?\\b`, 'i').test(raw));
  if (/\b(everything|site[- ]?wide|whole (site|catalogue|catalog)|all (stock|listings|machines and cars))\b/i.test(raw)) scope = 'all';
  else if (/\b(cars?|vehicles?|inventory|japan stock|dealer stock)\b/i.test(raw) && !/\bmachinery|machines?\b/i.test(raw)) scope = 'cars';
  else if (/\bmachinery|machines?\b|equipment|heavy\b|\bexcavators?\b|\bloaders?\b|\bcranes?\b|\btippers?\b|\btrucks?\b/i.test(raw)) scope = 'machinery';
  if (!scope) {
    return {
      ok: false,
      reply: 'Which should the discount apply to — machinery, cars, or everything? Say it like "15% off machinery".',
      draft: {percent}
    };
  }
  // "15% off cars" must not also narrow to a machine type from a stray word.
  const narrowedTypes = scope === 'machinery' ? types : [];

  // End date: an explicit one, or none. Open-ended offers are allowed but the
  // CRM shows the missing end date as a warning rather than hiding it.
  let until = null;
  const isoInText = raw.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (isoInText) until = isoInText[1];
  if (!until) {
    const monthDay = raw.match(new RegExp(`\\b(\\d{1,2})\\s+(${MONTHS.join('|')})\\b`, 'i'));
    const dayMonth = raw.match(new RegExp(`\\b(${MONTHS.join('|')})\\s+(\\d{1,2})\\b`, 'i'));
    const year = (raw.match(/\b(20\d{2})\b/) || [])[1] || String(now.getFullYear());
    if (monthDay) {
      const m = MONTHS.indexOf(monthDay[2].toLowerCase()) + 1;
      until = isoDate(`${year}-${String(m).padStart(2, '0')}-${String(monthDay[1]).padStart(2, '0')}`);
    } else if (dayMonth) {
      const m = MONTHS.indexOf(dayMonth[1].toLowerCase()) + 1;
      until = isoDate(`${year}-${String(m).padStart(2, '0')}-${String(dayMonth[2]).padStart(2, '0')}`);
    }
    if (until && new Date(`${until}T23:59:59`) < now) {
      // A date in the past would publish a dead offer; roll it to next year.
      until = isoDate(`${Number(year) + 1}-${until.slice(5)}`);
    }
  }

  const label = (raw.match(/["“']([^"”']{3,40})["”']/) || [])[1] || null;
  const labelPart = label ? `${label} — ` : '';
  const what = narrowedTypes.length ? narrowedTypes.join(', ').toLowerCase() : scope === 'cars' ? 'cars' : scope === 'all' ? 'everything' : 'machinery';
  const draft = {
    active: true,
    scope,
    percent: Math.round(percent),
    types: narrowedTypes,
    label,
    headline: `${Math.round(percent)}% off ${what}`,
    until,
    machines: existing?.machines && typeof existing.machines === 'object' ? existing.machines : {},
    publishedAt: now.toISOString(),
    publishedBy: 'CRM assistant'
  };
  const checked = validateOffer(draft);
  if (!checked.ok) return {ok: false, reply: checked.error};
  return {
    ok: true,
    action: 'publish',
    offer: checked.value,
    reply: `${labelPart}${checked.value.headline}${until ? ` until ${formatDate(until)}` : ' with no end date'}. Review it, then publish — the website shows it on the next page load.`
  };
}

