// Destination market guides and route estimates.
//
// Each entry is a 7-tuple:
//   [0] country        — destination country name
//   [1] port           — primary port(s) of discharge
//   [2] transit        — estimated sea-transit window (planning figure only)
//   [3] popularModels  — commonly requested models on this route
//   [4] baseFreightUsd — demo RoRo freight baseline in USD for calculators
//   [5] whatToExpect   — what happens in Japan before the vessel sails
//   [6] onArrival      — what happens when the vessel reaches the port
//
// Per CLAIMS-POLICY.md: transit windows are planning estimates (schedules and
// transshipment vary), and no import duty percentage or tax rate is quoted
// here — customs duties and local taxes are always determined by the buyer's
// own customs authority at the port of entry.

import { slugify, destinationPath } from './sitemap-helpers.js';

export const DEST = [
  [
    'Pakistan',
    'Karachi / Port Qasim',
    '18–24 days',
    'Land Cruiser · Vezel · Mira',
    950,
    'After purchase in Japan, we verify the first-registration year on the Japanese Export Certificate, photograph the vehicle at the export yard in Yokohama, Nagoya or Kobe, and book scheduled RoRo or container space to Karachi or Port Qasim.',
    'Original Bill of Lading, Japanese Export Certificate (with English translation) and commercial invoice are sent by courier before arrival so your clearing agent can file with Pakistan Customs. Import duty, regulatory duty and port charges are assessed directly by your customs authority.'
  ],
  [
    'UAE',
    'Jebel Ali',
    '18–22 days',
    'Lexus · Patrol · Alphard',
    900,
    'We confirm chassis specification (LHD or RHD), arrange inland transport to Yokohama, Osaka or Nagoya port, and book either RoRo deck space or a sealed container with lashing photos for higher-value luxury and performance cars.',
    'Your courier pack includes the Original Bill of Lading, Japanese Export Certificate, Certificate of Origin when requested, and itemized CIF invoice for Jebel Ali clearance. Customs duty, VAT and RTA registration requirements are determined by UAE authorities.'
  ],
  [
    'Kenya',
    'Mombasa',
    '24–30 days',
    'Harrier · Prado · Note',
    1250,
    'Before bidding or purchase, our Japan desk checks the exact year and month of first registration against Kenya rules, then books the mandatory KEBS / QISJ pre-shipment roadworthiness and radiation inspection in Japan prior to RoRo loading.',
    'Once the vessel berths at Mombasa, your clearing agent presents the QISJ Certificate of Roadworthiness, Original Bill of Lading and Export Certificate to KRA and port authorities. All import duties, excise and registration fees are calculated by Kenyan customs.'
  ],
  [
    'United Kingdom',
    'Southampton',
    '35–42 days',
    'Vellfire · Skyline · Jimny',
    1500,
    'We provide detailed yard and underbody photographs in Japan, confirm de-registration paperwork (Yushutsu Massho) showing odometer history, and book RoRo or container sailings into Southampton, Bristol or Newcastle.',
    'On arrival in the UK, your shipping agent completes NOVA notification and customs entry using our commercial invoice, Bill of Lading and Japanese Export Certificate, followed by MOT / IVA preparation and DVLA registration. UK customs duty and VAT are set by HMRC.'
  ],
  [
    'New Zealand',
    'Auckland',
    '20–26 days',
    'Prius · CX-5 · Forester',
    1150,
    'Vehicles bound for New Zealand undergo pre-export biosecurity cleaning and odometer verification in Japan before boarding direct RoRo vessels to Auckland, Wellington or Lyttelton.',
    'At the New Zealand port, MPI biosecurity inspection and entry certification (VTNZ / VINZ compliance) are completed alongside customs clearance. GST, clean-car or border charges and registration fees are assessed by New Zealand authorities.'
  ],
  [
    'Tanzania',
    'Dar es Salaam',
    '25–32 days',
    'RAV4 · Hiace · Vitz',
    1300,
    'We coordinate mandatory TBS pre-shipment roadworthiness inspection (EAA / JEVIC) at the Japanese export yard, confirm chassis and engine numbers against the Export Certificate, and book RoRo freight to Dar es Salaam.',
    'We courier the Original Bill of Lading, Export Certificate, inspection certificate and commercial invoice ahead of vessel arrival so your clearing agent can process TRA customs and port release without storage delays. Duties and taxes are decided by Tanzanian customs.'
  ]
];

// ---------------------------------------------------------------------------
// One indexable page per market (2026-10-08).
//
// Everything below is derived from the tuples above plus the arrival copy each
// market already states — no new facts, and specifically no duty percentages or
// tax rates anywhere (CLAIMS-POLICY.md: customs duty and local taxes are always
// the buyer's own authority's decision, quoted by their clearing agent).
// ---------------------------------------------------------------------------

/** `/destinations/kenya` — the URL for one market, from its country name. */
export const destinationHref = country => destinationPath(country);

/** The URL slug for a country: 'United Kingdom' → 'united-kingdom'. */
export const destinationSlug = country => slugify(String(country || '').trim());

/** Find a market by the slug in the URL. Unknown slug → null (the page says so). */
export function destinationBySlug(slug) {
  const s = String(slug || '').trim().toLowerCase();
  if (!s) return null;
  return DEST.find(d => destinationSlug(d[0]) === s) || null;
}

/**
 * The document pack this market's courier contains, and the pre-shipment
 * inspection it needs — lifted from the market's own arrival and departure
 * copy above, because a generic list would be a guess about someone's customs.
 */
export const DESTINATION_DOCS = {
  Pakistan: {
    inspection: null,
    docs: ['Original Bill of Lading', 'Japanese Export Certificate (with English translation)', 'Commercial invoice'],
    authority: 'Pakistan Customs'
  },
  UAE: {
    inspection: null,
    docs: ['Original Bill of Lading', 'Japanese Export Certificate', 'Certificate of Origin (when requested)', 'Itemised CIF invoice'],
    authority: 'UAE customs authorities (Jebel Ali)'
  },
  Kenya: {
    inspection: 'KEBS / QISJ pre-shipment roadworthiness and radiation inspection, booked in Japan before loading',
    docs: ['QISJ Certificate of Roadworthiness', 'Original Bill of Lading', 'Japanese Export Certificate'],
    authority: 'Kenya Revenue Authority'
  },
  'United Kingdom': {
    inspection: null,
    docs: ['Commercial invoice', 'Bill of Lading', 'Japanese Export Certificate (Yushutsu Massho, showing odometer history)', 'NOVA notification and customs entry, filed by your shipping agent'],
    authority: 'HMRC'
  },
  'New Zealand': {
    inspection: 'Pre-export biosecurity cleaning and odometer verification in Japan',
    docs: ['Bill of Lading', 'Japanese Export Certificate', 'Biosecurity cleaning record for MPI inspection'],
    authority: 'New Zealand Customs and MPI'
  },
  Tanzania: {
    inspection: 'TBS pre-shipment roadworthiness inspection (EAA / JEVIC) at the Japanese export yard',
    docs: ['Inspection certificate', 'Original Bill of Lading', 'Export Certificate', 'Commercial invoice'],
    authority: 'Tanzania Revenue Authority'
  }
};

/** The market's facts as an object, so a page cannot mis-index the tuple. */
export function destinationFacts(dest) {
  if (!Array.isArray(dest)) return null;
  const [country, port, transit, popularModels, baseFreightUsd, whatToExpect, onArrival] = dest;
  const extra = DESTINATION_DOCS[country] || { inspection: null, docs: [], authority: 'your customs authority' };
  return {
    country, port, transit, popularModels, baseFreightUsd, whatToExpect, onArrival,
    models: String(popularModels || '').split(' · ').map(x => x.trim()).filter(Boolean),
    slug: destinationSlug(country),
    href: destinationPath(country),
    docs: extra.docs,
    inspection: extra.inspection,
    authority: extra.authority,
    h1: `Import a used car from Japan to ${country}`
  };
}

/**
 * The five questions a buyer on this route actually asks, answered only with
 * facts this site already states: the planning transit window, the models this
 * route carries, the document pack, who assesses duty, and what a quotation
 * covers. Rendered visibly on the page and mirrored in the FAQPage JSON-LD that
 * src/seo.js emits for the same URL — markup that describes content that is not
 * on the page is worse than no markup.
 */
export function destinationFaqs(dest) {
  const f = destinationFacts(dest);
  if (!f) return [];
  return [
    [`How long does shipping from Japan to ${f.port} take?`,
     `The planning window for this route is ${f.transit} after the vessel is loaded in Japan. Schedules and transshipment vary, so the sailing date on your written quotation is the one to plan against — the ${f.transit} figure is an estimate, not a commitment.`],
    [`Which used cars does AR7 ship to ${f.country}?`,
     `The models this route carries most often are ${f.models.join(', ')}. We also source any make and model to order: share your target car, year range, mileage cap and budget, and our Japan desk monitors daily auction lists and dealer networks until a match appears.`],
    [`What documents arrive before the vessel does?`,
     `${f.docs.join('; ')}${f.inspection ? `. ${f.inspection} is arranged in Japan before loading` : ''}. The pack is couriered to you or your clearing agent ahead of arrival so it can be filed without storage delays at the port.`],
    [`Who calculates import duty in ${f.country}?`,
     `${f.authority} does, at the port of entry. Import duty, local taxes and registration charges are never bundled into a Japan CIF invoice and we do not quote a rate — your licensed clearing agent assesses the exact payable amount against the original documents we courier.`],
    [`What does a quotation for ${f.country} include?`,
     `Every price on this site is an indicative FOB price — the vehicle and export preparation up to loading in Japan. A written quotation confirms it and, on a CIF quote, adds sea freight to ${f.port} and marine transit insurance. Nothing is charged from a website figure: you buy against the written quotation.`]
  ];
}
