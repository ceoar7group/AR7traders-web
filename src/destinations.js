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
  ],
  [
    'Australia', 'Sydney', '21–28 days', 'Land Cruiser · Hiace', 1200,
    'Before buying, ask your Australian compliance specialist to confirm the exact vehicle’s import approval pathway. Do not bid or book shipping until the required approval is in place. Japan export preparation and biosecurity cleaning must match the agreed entry requirements.',
    'Your broker checks the invoice, Bill of Lading, Japanese Export Certificate and import approval for Australian Border Force clearance. Biosecurity inspection and state or territory registration are separate steps; shipping a car does not guarantee it can be registered.'
  ],
  [
    'USA', 'Los Angeles', '28–36 days', 'Kei trucks · 4Runner', 1400,
    'Check the exact manufacture date and vehicle specification with a US import specialist before purchase. NHTSA safety eligibility and EPA emissions eligibility are separate requirements. Do not assume a Japanese-market car or kei truck is road-legal merely because it can be shipped.',
    'Your customs broker confirms the invoice, Bill of Lading, Japanese Export Certificate and applicable NHTSA and EPA declarations for US Customs and Border Protection. State title and registration requirements must be checked separately before committing to a vehicle.'
  ],

  // -------------------------------------------------------------------------
  // Market expansion (owner direction 2026-11-08): the routes below are the
  // established used-vehicle lanes out of Japan that the first eight markets
  // left uncovered — East & Southern Africa, the Caribbean, the Pacific,
  // South Asia, the Gulf and the RHD corners of Europe. Same rules as above:
  // transit windows are planning figures, freight baselines feed the demo
  // calculators only, and no duty rate is ever quoted — where a market gates
  // imports behind a licence or an age rule, the copy says "confirm before
  // purchase" instead of promising eligibility.
  // -------------------------------------------------------------------------
  [
    'Uganda', 'Mombasa (transit to Kampala)', '30–38 days', 'Harrier · Premio · Hiace', 1250,
    'Our Japan desk verifies the first-registration year against current Ugandan rules, books the UNBS pre-export roadworthiness inspection (JEVIC) at the export yard, and arranges RoRo space to Mombasa with onward bonded transit toward Kampala.',
    'Your clearing agent presents the roadworthiness certificate, Original Bill of Lading and Japanese Export Certificate to the Uganda Revenue Authority for the bonded movement from Mombasa. Import duty, the environmental levy and registration fees are assessed by URA.'
  ],
  [
    'Zambia', 'Dar es Salaam (transit to Lusaka)', '32–40 days', 'Vitz · Fit · Noah', 1350,
    'We confirm chassis and engine numbers against the Export Certificate, book the ZABS pre-export roadworthiness inspection in Japan, and load RoRo to Dar es Salaam for bonded road transit to Lusaka or the Copperbelt.',
    'The inspection certificate, Original Bill of Lading and commercial invoice travel ahead by courier so your agent can clear with the Zambia Revenue Authority and arrange the transit bond. All duties and taxes are assessed by ZRA at entry.'
  ],
  [
    'Zimbabwe', 'Dar es Salaam (transit to Harare)', '32–42 days', 'Fit · Vitz · Hilux', 1350,
    'We photograph the car at the export yard, confirm the de-registration paperwork, and book RoRo to Dar es Salaam with bonded carriage to Harare or Bulawayo — confirming any current pre-shipment inspection requirement with your clearing agent before loading.',
    'Your agent lodges the Original Bill of Lading, Japanese Export Certificate and invoice with ZIMRA for the transit entry and final clearance. Duty, surtax and registration charges are calculated by Zimbabwean authorities.'
  ],
  [
    'Mozambique', 'Maputo / Beira', '28–35 days', 'Vitz · Demio · Hiace', 1300,
    'Mozambique-bound cars complete the required pre-shipment inspection in Japan before loading; we verify the chassis number against the Export Certificate and book RoRo or container space to Maputo or Beira.',
    'The inspection certificate, Original Bill of Lading and invoice are couriered ahead for clearance with Mozambique Customs. Duties and taxes are assessed by the Autoridade Tributária at the port.'
  ],
  [
    'DR Congo', 'Dar es Salaam (transit to Lubumbashi)', '35–45 days', 'Hiace · Land Cruiser · Canter', 1400,
    'We prepare the export paperwork with French translations where requested, and book RoRo to Dar es Salaam with bonded road carriage toward Lubumbashi and the Katanga mining region.',
    'Your clearing agent files the Original Bill of Lading, Japanese Export Certificate and invoice with DGDA customs at the border post. All duties and taxes are assessed by Congolese authorities.'
  ],
  [
    'Botswana', 'Durban / Walvis Bay (transit to Gaborone)', '35–45 days', 'Hilux · Fortuner · Corolla', 1450,
    'Botswana-bound cars ship RoRo to Durban or Walvis Bay and move under customs bond by road to Gaborone or Francistown; we confirm the transit routing with your clearing agent before the vessel is booked.',
    'BURS assesses customs duty and VAT when the bond is closed in Botswana. The Original Bill of Lading, Japanese Export Certificate and invoice are couriered ahead so the transit documents can be prepared before arrival.'
  ],
  [
    'Jamaica', 'Kingston', '40–50 days', 'Fielder · Axio · Probox', 1800,
    'Before any purchase we ask you to confirm your Trade Board import licence and the current vehicle-age limit — then our Japan desk sources the car, photographs it at the yard and books container or RoRo space to Kingston.',
    'Your licensed customs broker presents the import licence, Original Bill of Lading, Japanese Export Certificate and invoice to the Jamaica Customs Agency. Duties, fees and registration are assessed by Jamaican authorities.'
  ],
  [
    'Trinidad & Tobago', 'Port of Spain', '42–52 days', 'Aqua · Fielder · Raize', 1850,
    'We confirm the car fits the current import-licence and age rules with your broker before purchase, then arrange inspection photographs and container or RoRo space to Port of Spain.',
    'The Customs and Excise Division processes the entry against the import licence, Original Bill of Lading and Japanese Export Certificate. Motor vehicle tax, VAT and duty are assessed by Trinidad and Tobago authorities.'
  ],
  [
    'Guyana', 'Georgetown', '45–55 days', 'Premio · Allion · Spacio', 1900,
    'We verify the first-registration year — Guyana taxes by age band — photograph the car at the export yard and book container space to Georgetown, usually via Caribbean transshipment.',
    'Your broker lodges the Original Bill of Lading, Japanese Export Certificate and invoice with the Guyana Revenue Authority, which assesses all duties and taxes at entry.'
  ],
  [
    'Fiji', 'Suva / Lautoka', '18–25 days', 'Prius · Aqua · Hiace', 1100,
    'Fiji-bound cars get pre-export biosecurity cleaning in Japan, and we confirm the current LTA age and standards rules for the exact car before purchase, then book RoRo to Suva or Lautoka.',
    'Biosecurity inspection and customs clearance happen at the Fijian port; the Fiji Revenue and Customs Service assesses duty and VAT, and LTA handles inspection and registration.'
  ],
  [
    'Papua New Guinea', 'Port Moresby / Lae', '20–28 days', 'Land Cruiser · Hilux · Dyna', 1300,
    'We prepare underbody photographs and biosecurity cleaning in Japan, then book RoRo or container space on the Pacific services into Port Moresby or Lae.',
    'PNG Customs Service processes the entry against the Original Bill of Lading, Japanese Export Certificate and invoice; duties and GST are assessed at the port, and registration follows locally.'
  ],
  [
    'Sri Lanka', 'Colombo / Hambantota', '14–20 days', 'Wagon R · Alto · Prius', 850,
    'Sri Lanka\u2019s import licensing changes frequently, so we confirm the current permit position for the exact model and year with your agent before any bid, then book RoRo space on the short Colombo lane.',
    'Your clearing agent files the import licence, Original Bill of Lading and Japanese Export Certificate with Sri Lanka Customs, which assesses all duties and levies at entry.'
  ],
  [
    'Bangladesh', 'Chattogram / Mongla', '16–22 days', 'Allion · Premio · X-Trail', 900,
    'We verify the manufacturing year against the current Import Policy Order age limit with your C&F agent, arrange yard photographs and book RoRo or container space to Chattogram or Mongla.',
    'Your C&F agent lodges the Original Bill of Lading, Japanese Export Certificate and invoice with Bangladesh Customs; duty, supplementary duty and VAT are assessed under the national tariff at entry.'
  ],
  [
    'Mongolia', 'Tianjin (rail to Ulaanbaatar)', '30–40 days', 'Prius · Land Cruiser · Delica', 1600,
    'Mongolia-bound cars normally ship by container to Tianjin and continue by rail to Ulaanbaatar under transit documents; we confirm the corridor and handover point with your forwarder before loading in Japan.',
    'Mongolian Customs assesses duty, excise and VAT when the shipment clears at the border or in Ulaanbaatar; the Original Bill of Lading, Japanese Export Certificate and invoice travel ahead so the transit file is ready.'
  ],
  [
    'Ireland', 'Dublin', '40–48 days', 'Jimny · Alphard · Roadster', 1550,
    'We confirm odometer history on the de-registration paperwork, photograph the car in Japan and book container or RoRo space to Dublin, usually via a European transshipment hub.',
    'Customs entry is filed with the Revenue Commissioners using our invoice and the Japanese Export Certificate, followed by VRT inspection, NCT where applicable, and Irish registration. Customs duty, VAT and VRT are assessed by Revenue.'
  ],
  [
    'Cyprus', 'Limassol', '30–38 days', 'Vitz · Note · Serena', 1450,
    'Cyprus drives on the left, so Japanese cars fit directly; we verify the registration paperwork, arrange photographs and book container or RoRo space to Limassol.',
    'Your agent completes the EU import declaration with Cyprus Customs and Excise, then registration follows with the Road Transport Department. Duty, VAT and registration fees are assessed by Cypriot authorities.'
  ],
  [
    'Malta', 'Valletta (Marsaxlokk)', '32–40 days', 'Jazz · Fit · N-Box', 1500,
    'We confirm the odometer history and the vehicle details Malta\u2019s registration system uses, then book container space to the Malta Freeport with transshipment on the main east\u2013west services.',
    'Malta Customs processes the EU import entry, and Transport Malta assesses the registration tax from the vehicle\u2019s details before Maltese plates are issued. All amounts are set by Maltese authorities.'
  ],
  [
    'Oman', 'Sohar / Muscat', '16–22 days', 'Land Cruiser · Patrol · Lexus LX', 900,
    'We confirm the exact specification with you — Oman registers left-hand-drive vehicles — then arrange inland transport to the export port and book RoRo or container space to Sohar.',
    'Royal Oman Police Customs clears the car against the Original Bill of Lading, Japanese Export Certificate and invoice; duty and registration requirements are set by Omani authorities.'
  ],
  [
    'Qatar', 'Hamad Port', '18–24 days', 'Land Cruiser · Prado · Lexus', 950,
    'We confirm the left-hand-drive specification and the current vehicle-age rule with your clearing agent before purchase, then book RoRo or container space to Hamad Port.',
    'The General Authority of Customs processes the entry using the Original Bill of Lading, Japanese Export Certificate and invoice; duty and registration with the Ministry of Interior are assessed in Qatar.'
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
// Australia/USA planning figures and model examples reuse the existing
// site_routes seed (SETUP-EVERYTHING.sql). They are not eligibility promises.
export const DESTINATION_DOCS = {
  Australia: {
    inspection: 'Confirm biosecurity cleaning and inspection requirements before departure',
    docs: ['Commercial invoice', 'Bill of Lading', 'Japanese Export Certificate', 'Applicable vehicle import approval'],
    authority: 'Australian Border Force and relevant Australian authorities',
    eligibility: 'Approval depends on the exact vehicle and import pathway. Confirm eligibility, biosecurity and registration before buying.',
    source: 'https://www.infrastructure.gov.au/infrastructure-transport-vehicles/vehicles/importing-road-vehicle-australia'
  },
  USA: {
    inspection: null,
    docs: ['Commercial invoice', 'Bill of Lading', 'Japanese Export Certificate', 'Applicable NHTSA HS-7 and EPA declarations, confirmed by your broker'],
    authority: 'US Customs and Border Protection',
    eligibility: 'Federal safety, emissions and state registration are separate checks. Model examples are not a promise of US road legality.',
    source: 'https://www.nhtsa.gov/importing-vehicle'
  },
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
  },
  // 2026-11-08 market expansion — same discipline as above: the docs listed
  // are the ones each market's own arrival copy names, inspections only where
  // the regime is firmly established, and gated markets state the licence or
  // age check as an eligibility caveat instead of a promise.
  Uganda: {
    inspection: 'UNBS pre-export roadworthiness inspection (JEVIC), booked in Japan before loading',
    docs: ['Roadworthiness certificate', 'Original Bill of Lading', 'Japanese Export Certificate', 'Commercial invoice'],
    authority: 'Uganda Revenue Authority'
  },
  Zambia: {
    inspection: 'ZABS pre-export roadworthiness inspection, booked in Japan before loading',
    docs: ['Inspection certificate', 'Original Bill of Lading', 'Japanese Export Certificate', 'Commercial invoice'],
    authority: 'Zambia Revenue Authority'
  },
  Zimbabwe: {
    inspection: null,
    docs: ['Original Bill of Lading', 'Japanese Export Certificate', 'Commercial invoice'],
    authority: 'Zimbabwe Revenue Authority (ZIMRA)'
  },
  Mozambique: {
    inspection: 'Pre-shipment inspection for Mozambique customs, completed in Japan before loading',
    docs: ['Inspection certificate', 'Original Bill of Lading', 'Japanese Export Certificate', 'Commercial invoice'],
    authority: 'Mozambique Customs (Autoridade Tributária)'
  },
  'DR Congo': {
    inspection: null,
    docs: ['Original Bill of Lading', 'Japanese Export Certificate', 'Commercial invoice (French translation on request)'],
    authority: 'DGDA (Congolese customs)'
  },
  Botswana: {
    inspection: null,
    docs: ['Original Bill of Lading', 'Japanese Export Certificate', 'Commercial invoice', 'Customs bond transit documents, prepared by your clearing agent'],
    authority: 'Botswana Unified Revenue Service'
  },
  Jamaica: {
    inspection: null,
    docs: ['Trade Board import licence (obtained by the buyer before shipment)', 'Original Bill of Lading', 'Japanese Export Certificate', 'Commercial invoice'],
    authority: 'Jamaica Customs Agency',
    eligibility: 'A Trade Board import licence and the current vehicle-age limit must be confirmed before buying or shipping.'
  },
  'Trinidad & Tobago': {
    inspection: null,
    docs: ['Import licence (obtained by the buyer before shipment)', 'Original Bill of Lading', 'Japanese Export Certificate', 'Commercial invoice'],
    authority: 'Customs and Excise Division of Trinidad and Tobago',
    eligibility: 'An import licence and the current vehicle-age limit must be confirmed before buying or shipping.'
  },
  Guyana: {
    inspection: null,
    docs: ['Original Bill of Lading', 'Japanese Export Certificate', 'Commercial invoice'],
    authority: 'Guyana Revenue Authority'
  },
  Fiji: {
    inspection: 'Pre-export biosecurity cleaning in Japan',
    docs: ['Original Bill of Lading', 'Japanese Export Certificate', 'Commercial invoice', 'Biosecurity cleaning record'],
    authority: 'Fiji Revenue and Customs Service',
    eligibility: 'Confirm the current LTA age and standards rules for the exact car before purchase.'
  },
  'Papua New Guinea': {
    inspection: 'Pre-export biosecurity cleaning in Japan',
    docs: ['Original Bill of Lading', 'Japanese Export Certificate', 'Commercial invoice'],
    authority: 'PNG Customs Service'
  },
  'Sri Lanka': {
    inspection: null,
    docs: ['Import licence / permit (confirmed before purchase)', 'Original Bill of Lading', 'Japanese Export Certificate', 'Commercial invoice'],
    authority: 'Sri Lanka Customs',
    eligibility: 'Import permits and age rules change frequently — confirm the current licence position for the exact model before purchase.'
  },
  Bangladesh: {
    inspection: null,
    docs: ['Original Bill of Lading', 'Japanese Export Certificate', 'Commercial invoice'],
    authority: 'Bangladesh Customs (National Board of Revenue)',
    eligibility: 'The current Import Policy Order age limit must be confirmed for the exact car before purchase.'
  },
  Mongolia: {
    inspection: null,
    docs: ['Original Bill of Lading', 'Japanese Export Certificate', 'Commercial invoice', 'Rail transit documents, prepared by your forwarder'],
    authority: 'Mongolian Customs General Administration'
  },
  Ireland: {
    inspection: null,
    docs: ['Original Bill of Lading', 'Japanese Export Certificate', 'Commercial invoice', 'Customs entry and VRT booking, filed by your agent'],
    authority: 'The Revenue Commissioners'
  },
  Cyprus: {
    inspection: null,
    docs: ['Original Bill of Lading', 'Japanese Export Certificate', 'Commercial invoice'],
    authority: 'Cyprus Customs and Excise'
  },
  Malta: {
    inspection: null,
    docs: ['Original Bill of Lading', 'Japanese Export Certificate', 'Commercial invoice'],
    authority: 'Malta Customs and Transport Malta'
  },
  Oman: {
    inspection: null,
    docs: ['Original Bill of Lading', 'Japanese Export Certificate', 'Commercial invoice'],
    authority: 'Royal Oman Police Customs',
    eligibility: 'Oman registers left-hand-drive vehicles — confirm the specification and any age rule before purchase.'
  },
  Qatar: {
    inspection: null,
    docs: ['Original Bill of Lading', 'Japanese Export Certificate', 'Commercial invoice'],
    authority: 'General Authority of Customs (Qatar)',
    eligibility: 'Qatar restricts older used imports — confirm the current vehicle-age rule for the exact car before purchase.'
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
    eligibility: extra.eligibility || null,
    source: extra.source || null,
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
     `${f.eligibility ? 'Model examples to discuss, subject to eligibility checks, include' : 'The models this route carries most often are'} ${f.models.join(', ')}. We also source any make and model to order: share your target car, year range, mileage cap and budget, and our Japan desk monitors daily auction lists and dealer networks until a match appears.${f.eligibility ? ` ${f.eligibility}` : ''}`],
    [`What documents arrive before the vessel does?`,
     `${f.docs.join('; ')}${f.inspection ? `. ${f.inspection} is arranged in Japan before loading` : ''}. The pack is couriered to you or your clearing agent ahead of arrival so it can be filed without storage delays at the port.`],
    [`Who calculates import duty in ${f.country}?`,
     `${f.authority} does, at the port of entry. Import duty, local taxes and registration charges are never bundled into a Japan CIF invoice and we do not quote a rate — your licensed clearing agent assesses the exact payable amount against the original documents we courier.`],
    [`What does a quotation for ${f.country} include?`,
     `Every price on this site is an indicative FOB price — the vehicle and export preparation up to loading in Japan. A written quotation confirms it and, on a CIF quote, adds sea freight to ${f.port} and marine transit insurance. Nothing is charged from a website figure: you buy against the written quotation.`]
  ];
}
