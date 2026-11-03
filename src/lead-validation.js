// Shared by the browser form and the public leads API. Keep this module free
// of React, Supabase and logging: validation must behave identically on both
// sides, and an error object must never carry a customer's personal details.

export const LEAD_LIMITS = Object.freeze({
  name: 120,
  email: 200,
  phone: 40,
  country: 80,
  vehicle_interest: 180,
  message: 2000,
  stock_ref: 60,
});

// Offers are negotiation requests, never price acceptance. The amount is a
// positive number of US dollars; anything above this cap is a typo or abuse.
export const OFFER_AMOUNT_MAX = 10_000_000;

export const LEAD_SOURCES = Object.freeze([
  'Website',
  'Website contact',
  'Website signup',
  'Auction access',
  'Vehicle enquiry',
  'Machinery enquiry',
  'Vehicle offer',
  'Machinery offer',
  'Chat lead',
  'Stock alerts',
]);

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
// International-friendly, deliberately not E.164-only: national numbers and
// spaces/brackets/dashes are accepted. A leading + is optional; 7–15 digits
// covers national and international numbers without pretending to validate
// every country's numbering plan.
const PHONE_ALLOWED_RE = /^\+?[0-9\s().-]+$/;

export const cleanText = (value, max) => String(value ?? '').trim().slice(0, max);

export function phoneError(value) {
  const phone = cleanText(value, LEAD_LIMITS.phone + 1);
  if (!phone) return 'Please enter your contact phone number.';
  if (phone.length > LEAD_LIMITS.phone || !PHONE_ALLOWED_RE.test(phone)) {
    return 'Please enter a valid phone number. Spaces, brackets, dashes and a leading + are allowed.';
  }
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || digits.length > 15) {
    return 'Please enter a valid phone number with 7 to 15 digits, including the country code if you have one.';
  }
  return '';
}

export function validateLead(input = {}, { requireEmail = false } = {}) {
  const name = cleanText(input.name, LEAD_LIMITS.name + 1);
  const email = cleanText(input.email, LEAD_LIMITS.email + 1);
  const errors = {};
  if (name.length < 2) errors.name = 'Please enter your name (at least 2 characters).';
  if (name.length > LEAD_LIMITS.name) errors.name = `Please keep your name under ${LEAD_LIMITS.name} characters.`;
  const phoneMessage = phoneError(input.phone);
  if (phoneMessage) errors.phone = phoneMessage;
  if (!email && requireEmail) errors.email = 'Please enter your email address.';
  if (email && (email.length > LEAD_LIMITS.email || !EMAIL_RE.test(email))) {
    errors.email = 'Please enter a valid email address.';
  }
  // An offer amount is optional, but when given it must be a positive dollar
  // figure. Validated identically in the browser form and the API.
  const rawOffer = String(input.offer_amount ?? '').trim();
  if (rawOffer !== '') {
    const amount = Number(rawOffer.replace(/[,\s]/g, ''));
    if (!Number.isFinite(amount) || amount <= 0 || amount > OFFER_AMOUNT_MAX) {
      errors.offer_amount = 'Please enter your offer as a positive amount in US dollars, e.g. 12500.';
    }
  }
  return errors;
}

/** The cleaned numeric offer amount, or null when absent/invalid. */
export function offerAmountFrom(input = {}) {
  const raw = String(input.offer_amount ?? '').trim();
  if (raw === '') return null;
  const amount = Number(raw.replace(/[,\s]/g, ''));
  return Number.isFinite(amount) && amount > 0 && amount <= OFFER_AMOUNT_MAX ? Math.round(amount) : null;
}

export function leadFromRequest(input = {}) {
  const name = cleanText(input.name, LEAD_LIMITS.name);
  const email = cleanText(input.email, LEAD_LIMITS.email);
  const phone = cleanText(input.phone, LEAD_LIMITS.phone).replace(/\s+/g, ' ');
  const message = cleanText(input.message, LEAD_LIMITS.message);
  const budget = Number(input.budget);
  const source = LEAD_SOURCES.includes(input.source) ? input.source : 'Website';
  // Offer context, without a schema change: the offer amount is stored in the
  // existing numeric `budget` column, and the stock reference plus a plain
  // "this is a negotiation request" line go into `notes` where staff read
  // them. An offer is NEVER an accepted price — the CRM copy says so.
  const offerAmount = offerAmountFrom(input);
  const stockRef = cleanText(input.stock_ref, LEAD_LIMITS.stock_ref);
  const noteLines = [];
  if (offerAmount) noteLines.push(`Offer: USD ${offerAmount.toLocaleString('en-US')} (negotiation request — not an accepted price).`);
  if (stockRef) noteLines.push(`Stock reference: ${stockRef}`);
  if (message) noteLines.push(`Customer enquiry:\n${message}`);
  return {
    name,
    email: email || null,
    phone,
    country: cleanText(input.country, LEAD_LIMITS.country) || 'Other',
    vehicle_interest: cleanText(input.vehicle_interest ?? input.vehicle, LEAD_LIMITS.vehicle_interest) || 'General enquiry',
    // The existing CRM lead editor already has a notes field. Store the
    // buyer's message there so it is visible to staff without a schema change.
    notes: noteLines.length ? noteLines.join('\n') : null,
    source,
    status: 'new',
    budget: offerAmount ?? (Number.isFinite(budget) && budget > 0 ? budget : null),
  };
}
