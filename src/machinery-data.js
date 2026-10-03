// Machinery & construction equipment desk.
//
// AR7 Traders sources cars at Japanese auctions and heavy equipment from
// vetted Chinese factories and dealers. This file is the built-in catalogue the
// site renders when the CRM/API has nothing published for machinery, in the
// same spirit as the car inventory fallback in src/main.jsx.
//
// ── HOW A MACHINE GETS INTO THIS FILE ──────────────────────────────────────
//
// Two routes, and only two:
//
//   1. AR7's own sourcing. We (or the owner) buy/quote a unit from a Chinese
//      supplier. The supplier sends photographs of THAT machine, its hours and
//      its price. Those photos are ours to publish — we are the buyer. This is
//      exactly how the car side works with Goo-net: a source we trade with
//      supplies the listing data.
//
//   2. The supplier import pipeline. `npm run machinery:import` reads a folder
//      of supplier photos + a price list (`machinery-suppliers/<name>/`) and
//      emits entries in the shape below. See MACHINERY-SOURCES.md.
//
// What we do NOT do: copy photographs, watermarks or listing text off Alibaba,
// Made-in-China or any other marketplace. A photo belongs to whoever took it,
// watermark or not, and removing the mark makes it worse rather than better.
// Manufacturer spec sheets (Doosan, Sany, XCMG, SDLG, LiuGong, Shacman,
// Sinotruk, Zoomlion) are published for dealers to use and are the right source
// for the technical figures in `specs`.
//
// ── PRICING ────────────────────────────────────────────────────────────────
//
// `supplierPrice` is what the supplier quotes us (FOB, USD). `price` is what we
// list, after MACHINERY_MARKUP. The markup is a trading margin, applied here in
// code so it is visible and adjustable in one place — never buried in a number
// typed by hand.
//
// HONESTY RULES (see CLAIMS-POLICY.md):
//   • No machine here is stock we own. The page says prices are indicative FOB
//     and confirmed by written quotation, and every card says the unit is
//     sourced to order — that is what keeps the listing truthful without a
//     DEMO sticker over the photo (removed 2026-10-03: it read as "this shop is
//     a mock-up" on a page whose machines are real and quotable).
//   • `supplierPrice` is a typical market quote for the model/year/hours shown,
//     rounded for readability — never presented as a binding offer.
//   • "Sourced from China" describes where the machines come from, not how many
//     we have sold. Never add counts of units sold or deliveries.
//   • A machine we do not yet have a photograph of carries `photosPending: true`
//     and NO image. Never point a listing at another machine's photograph to
//     fill the gap — showing a wheel loader for a tipper truck is the kind of
//     thing that loses a buyer at the port, and it is not fixable later.

import { machineHrefFor } from './sitemap-helpers.js';

export const MACHINE_TYPES = ['Excavators', 'Loaders', 'Trucks', 'Cranes'];

/**
 * Trading margin applied to a supplier quote before it is listed.
 * 0.25 = list at supplier price + 25%. Change this one number to reprice the
 * whole catalogue; nothing else needs editing.
 */
export const MACHINERY_MARKUP = 0.25;

export const MACHINERY_NOTE =
  'Sourced to order from vetted Chinese suppliers. Prices are indicative FOB and confirmed by written quotation, with inspection and loading photos before shipment.';

/** Round to the nearest $50 so a marked-up price never looks invented. */
const roundPrice = n => Math.round(n / 50) * 50;

/**
 * The listed price for a machine. One function, used by the cards, the home
 * teaser and the SEO module, so a price can never differ between two pages.
 */
export const listPriceUSD = machine => {
  if (!machine) return 0;
  if (Number.isFinite(Number(machine.price)) && Number(machine.price) > 0) return Number(machine.price);
  const supplier = Number(machine.supplierPrice) || 0;
  return supplier ? roundPrice(supplier * (1 + MACHINERY_MARKUP)) : 0;
};

/** Every photo of a machine, main shot first. */
export const machineImages = machine => {
  if (!machine || machine.photosPending) return [];
  const list = Array.isArray(machine?.images) ? machine.images.filter(Boolean) : [];
  if (list.length) return list;
  return machine?.image ? [machine.image] : [];
};

/**
 * The machine's catalogue page slug: /machinery/excavators, /machinery/loaders …
 * Detail pages hang off it, which is also how a crawler walks the catalogue.
 */
export const machineTypeSlug = machine => String(machine?.type || '').toLowerCase();

/**
 * The machine's own page — /machinery/excavators/AR7-MC-001. Cars open at
 * /inventory/<ref>; a machine opens at its own URL so a buyer can send it to a
 * colleague, and so the unit can earn a search result of its own.
 */
export const machineHref = machine => {
  if (!machine) return '/machinery';
  return machineHrefFor(machineTypeSlug(machine), machine.ref || machine.id);
};

/** Look a machine up from the reference (or id) in a URL. Case-insensitive. */
export const machineByRef = (ref, list = MACHINES) => {
  const want = String(ref ?? '').trim().toLowerCase();
  if (!want) return null;
  let decoded = want;
  try { decoded = decodeURIComponent(want); } catch { /* keep as-is */ }
  return list.find(m => String(m.ref).toLowerCase() === decoded || String(m.id).toLowerCase() === decoded) || null;
};

const M = '/assets/machinery/';

export const MACHINES = [
  {
    id: 'mch-dx300',
    ref: 'AR7-MC-001',
    name: 'Doosan DX300LC-9C',
    brand: 'Doosan',
    type: 'Excavators',
    year: 2019,
    hours: 6800,
    supplierPrice: 50000,
    origin: 'China',
    location: 'Shandong',
    status: 'Available',
    image: M + 'doosan-dx300lc-1.webp',
    images: [M + 'doosan-dx300lc-1.webp', M + 'doosan-dx300lc-2.webp', M + 'doosan-dx300lc-3.webp'],
    summary: '30-tonne class crawler excavator for bulk earthworks and quarry loading.',
    specs: [
      ['Operating weight', '30,200 kg'],
      ['Engine', 'Doosan DE08TIS · 147 kW'],
      ['Bucket', '1.4 m³ heavy-duty'],
      ['Undercarriage', '70% remaining']
    ]
  },
  {
    id: 'mch-dx250',
    ref: 'AR7-MC-002',
    name: 'Doosan DX250LCA',
    brand: 'Doosan',
    type: 'Excavators',
    year: 2020,
    hours: 4900,
    supplierPrice: 39200,
    origin: 'China',
    location: 'Jiangsu',
    status: 'Available',
    image: M + 'doosan-dx250lca-1.webp',
    images: [M + 'doosan-dx250lca-1.webp', M + 'doosan-dx250lca-2.webp', M + 'doosan-dx250lca-3.webp'],
    summary: '25-tonne crawler excavator, low hours, ready for site or resale.',
    specs: [
      ['Operating weight', '25,300 kg'],
      ['Engine', 'Doosan DE08TIS · 121 kW'],
      ['Bucket', '1.2 m³ heavy-duty'],
      ['Hours', '4,900 h genuine']
    ]
  },
  {
    id: 'mch-sany215',
    ref: 'AR7-MC-003',
    name: 'Sany SY215C',
    brand: 'Sany',
    type: 'Excavators',
    year: 2020,
    hours: 5200,
    supplierPrice: 38000,
    origin: 'China',
    location: 'Hunan',
    status: 'Available',
    image: M + 'sany-sy215c-1.webp',
    images: [M + 'sany-sy215c-1.webp', M + 'sany-sy215c-2.webp', M + 'sany-sy215c-3.webp'],
    summary: '21-tonne excavator, the workhorse size for general construction.',
    specs: [
      ['Operating weight', '21,500 kg'],
      ['Engine', 'Isuzu 4HK1X · 118 kW'],
      ['Bucket', '1.0 m³ general purpose'],
      ['Undercarriage', '75% remaining']
    ]
  },
  {
    id: 'mch-sany335',
    ref: 'AR7-MC-004',
    name: 'Sany SY335H',
    brand: 'Sany',
    type: 'Excavators',
    year: 2019,
    hours: 7100,
    supplierPrice: 68000,
    origin: 'China',
    location: 'Hunan',
    status: 'Available',
    image: M + 'sany-sy335h-1.webp',
    images: [M + 'sany-sy335h-1.webp', M + 'sany-sy335h-2.webp', M + 'sany-sy335h-3.webp'],
    summary: '33-tonne excavator for heavy earthworks and quarry feed.',
    specs: [
      ['Operating weight', '33,000 kg'],
      ['Engine', 'Isuzu 6HK1X · 191 kW'],
      ['Bucket', '1.6 m³ heavy-duty'],
      ['Undercarriage', '65% remaining']
    ]
  },
  {
    id: 'mch-xe215',
    ref: 'AR7-MC-005',
    name: 'XCMG XE215C',
    brand: 'XCMG',
    type: 'Excavators',
    year: 2020,
    hours: 5600,
    supplierPrice: 37200,
    origin: 'China',
    location: 'Jiangsu',
    status: 'Available',
    image: M + 'xcmg-xe215c-1.webp',
    images: [M + 'xcmg-xe215c-1.webp', M + 'xcmg-xe215c-2.webp', M + 'xcmg-xe215c-3.webp'],
    summary: '21-tonne excavator with comfortable cab, popular for hire fleets.',
    specs: [
      ['Operating weight', '21,000 kg'],
      ['Engine', 'Cummins QSB6.7 · 113 kW'],
      ['Bucket', '1.0 m³ general purpose'],
      ['Undercarriage', '72% remaining']
    ]
  },
  {
    id: 'mch-pc200',
    ref: 'AR7-MC-006',
    name: 'Komatsu PC200-8',
    brand: 'Komatsu',
    type: 'Excavators',
    year: 2018,
    hours: 8300,
    supplierPrice: 44500,
    origin: 'China',
    location: 'Shandong',
    status: 'Available',
    image: M + 'komatsu-pc200-8-1.webp',
    images: [M + 'komatsu-pc200-8-1.webp', M + 'komatsu-pc200-8-2.webp'],
    summary: '20-tonne excavator, strong residual value and parts availability.',
    specs: [
      ['Operating weight', '19,900 kg'],
      ['Engine', 'Komatsu SAA6D107E-1 · 110 kW'],
      ['Bucket', '0.8 m³ general purpose'],
      ['Undercarriage', '60% remaining']
    ]
  },
  {
    id: 'mch-xe370',
    ref: 'AR7-MC-007',
    name: 'XCMG XE370D',
    brand: 'XCMG',
    type: 'Excavators',
    year: 2021,
    hours: 4400,
    supplierPrice: 74000,
    origin: 'China',
    location: 'Jiangsu',
    status: 'Available',
    image: M + 'xcmg-xe370d-1.webp',
    images: [M + 'xcmg-xe370d-1.webp', M + 'xcmg-xe370d-2.webp'],
    summary: '37-tonne excavator for large earthworks, mining support and demolition.',
    specs: [
      ['Operating weight', '37,000 kg'],
      ['Engine', 'Cummins QSM11 · 212 kW'],
      ['Bucket', '1.9 m³ rock bucket'],
      ['Options', 'Quick coupler']
    ]
  },
  {
    id: 'mch-lg956',
    ref: 'AR7-MC-008',
    name: 'SDLG LG956L',
    brand: 'SDLG',
    type: 'Loaders',
    year: 2020,
    hours: 4700,
    supplierPrice: 27600,
    origin: 'China',
    location: 'Shandong',
    status: 'Available',
    image: M + 'sdlg-lg956l-1.webp',
    images: [M + 'sdlg-lg956l-1.webp', M + 'sdlg-lg956l-2.webp', M + 'sdlg-lg956l-3.webp'],
    summary: '5-tonne wheel loader for aggregates, batching plants and bulk handling.',
    specs: [
      ['Rated load', '5,000 kg'],
      ['Engine', 'Weichai WD10G220E23 · 162 kW'],
      ['Bucket', '3.0 m³'],
      ['Tyres', '23.5-25, good tread']
    ]
  },
  {
    id: 'mch-clg856',
    ref: 'AR7-MC-009',
    name: 'LiuGong CLG856H',
    brand: 'LiuGong',
    type: 'Loaders',
    year: 2020,
    hours: 5100,
    supplierPrice: 28800,
    origin: 'China',
    location: 'Guangxi',
    status: 'Available',
    image: M + 'liugong-clg856h-1.webp',
    images: [M + 'liugong-clg856h-1.webp', M + 'liugong-clg856h-2.webp'],
    summary: '5-tonne wheel loader with ZF transmission, comfortable for long shifts.',
    specs: [
      ['Rated load', '5,000 kg'],
      ['Engine', 'Cummins QSB6.7 · 164 kW'],
      ['Bucket', '3.2 m³'],
      ['Transmission', 'ZF 4WG200']
    ]
  },
  {
    id: 'mch-shacman',
    ref: 'AR7-MC-010',
    name: 'Shacman F3000 8×4',
    brand: 'Shacman',
    type: 'Trucks',
    year: 2020,
    hours: 62000,
    supplierPrice: 36000,
    origin: 'China',
    location: 'Shaanxi',
    status: 'Available',
    image: M + 'shacman-f3000-1.webp',
    images: [M + 'shacman-f3000-1.webp', M + 'shacman-f3000-2.webp'],
    summary: '8×4 tipper truck for quarry haulage and construction spoil.',
    specs: [
      ['Rated payload', '30,000 kg'],
      ['Engine', 'Weichai WP12 · 375 hp'],
      ['Body', '20 m³ steel tipper'],
      ['Mileage', '62,000 km genuine']
    ]
  },
  {
    id: 'mch-howo',
    ref: 'AR7-MC-011',
    name: 'Sinotruk HOWO 371',
    brand: 'Sinotruk',
    type: 'Trucks',
    year: 2019,
    hours: 78000,
    supplierPrice: 31500,
    origin: 'China',
    location: 'Shandong',
    status: 'Available',
    image: M + 'howo-371-1.webp',
    images: [M + 'howo-371-1.webp', M + 'howo-371-2.webp'],
    summary: '6×4 tipper tractor unit, the most common heavy truck in Africa.',
    specs: [
      ['Rated payload', '25,000 kg'],
      ['Engine', 'Sinotruk WD615 · 371 hp'],
      ['Body', '18 m³ steel tipper'],
      ['Mileage', '78,000 km genuine']
    ]
  },
  {
    id: 'mch-ztc250',
    ref: 'AR7-MC-012',
    name: 'Zoomlion ZTC250V',
    brand: 'Zoomlion',
    type: 'Cranes',
    year: 2020,
    hours: 2100,
    supplierPrice: 96000,
    origin: 'China',
    location: 'Hunan',
    status: 'Available',
    image: M + 'zoomlion-ztc250-1.webp',
    images: [M + 'zoomlion-ztc250-1.webp', M + 'zoomlion-ztc250-2.webp', M + 'zoomlion-ztc250-3.webp'],
    summary: '25-tonne truck crane with telescopic boom, certified lifting charts.',
    specs: [
      ['Max lifting capacity', '25,000 kg'],
      ['Boom', '5-section, 43 m'],
      ['Engine', 'Weichai WP7'],
      ['Condition', 'Lifting certificate supplied']
    ]
  }
];

/** Filter helpers shared by the page and the home teaser. */
export const machinesByType = type => (type && type !== 'All' ? MACHINES.filter(m => m.type === type) : MACHINES);

/** Kept for backwards compatibility with the home teaser. */
export const machinePriceUSD = machine => listPriceUSD(machine);
