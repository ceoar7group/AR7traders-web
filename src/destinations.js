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
