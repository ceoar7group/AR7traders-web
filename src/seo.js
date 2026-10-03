// Per-page titles, descriptions and structured data.
//
// The site is a single page with hash routing, so search engines and — more
// importantly for a business like this — WhatsApp, browser tabs and bookmarks
// all see one title unless we update it as the visitor moves around.
//
// Honesty rules that apply to everything below:
//   • vehicle metadata comes from the vehicle record, not the listing default;
//   • the Car/Offer JSON-LD only states what the page actually shows — real
//     availability, a price whose currency matches the published string, and
//     images that exist. Unsupported values are omitted, never invented;
//   • a vehicle that is confirmed missing (content hydrated, not in the list)
//     gets honest "no longer listed" metadata and noindex rather than
//     posing as a live listing;
//   • the FAQPage markup is scoped to /faq only (it used to sit in the static
//     shell where every route inherited it).
import {useEffect} from 'react';
import { hrefFor, slugify } from './routing.js';
import { articleBySlug, articleSeo } from './news-data.js';
import { listPriceUSD } from './machinery-data.js';
import { priceWithOffer } from './offers.js';

export const BASE = 'https://ar7traders.com';

const PAGE_LABELS = {
  inventory: 'Vehicle Inventory', auction: 'Auction Bidding', services: 'Export Services',
  brands: 'Brands We Export', destinations: 'Shipping Destinations', tools: 'Import Cost Calculator',
  world: 'Global Network', howbuy: 'How to Buy', news: 'News & Guides', about: 'About',
  reviews: 'Reviews', faq: 'FAQ', contact: 'Contact', 'japan-stock': 'Japan Dealer Stock',
  shipping: 'Shipping', machinery: 'Machinery & Equipment'
};

// Only canonicalize makes we explicitly recognize. Keep the current catalogue
// makes here as well as the major Japanese and export-market makes so an
// unexpected query never creates a thin, misleading brand landing URL.
const SEO_BRANDS = [
  'Toyota', 'Lexus', 'Honda', 'Nissan', 'Mazda', 'Mercedes-Benz', 'BMW',
  'Porsche', 'Land Rover', 'Audi', 'Suzuki', 'Subaru', 'Mitsubishi', 'Daihatsu',
  'Rolls-Royce', 'Bentley', 'Lamborghini', 'Ferrari', 'Bugatti', 'McLaren'
];
const canonicalBrand = make => {
  const value = String(make ?? '').trim();
  if (!value || /^(all|any)$/i.test(value)) return null;
  return SEO_BRANDS.find(brand => brand.toLowerCase() === value.toLowerCase()) || null;
};

/** Brand-specific landing metadata for a known inventory make filter. */
export function brandSeo(make) {
  const brand = canonicalBrand(make);
  if (!brand) return null;
  return {
    make: brand,
    title: `${brand} Used & Luxury Cars for Export from Japan | AR7 Traders`,
    description: `Explore ${brand} vehicles sourced in Japan. Request itemized FOB or CIF quotes, compare RoRo and container shipping, and review source-appropriate condition notes: translated auction sheets for auction-sourced vehicles and yard notes for dealer or showroom stock.`,
    canonicalPath: `/inventory?make=${encodeURIComponent(brand)}`
  };
}

export const PAGE_SEO = {
  home:        ['Japanese Car Exporter | Cars & Machinery | AR7 Traders',
                'Auction-sourced vehicles from Japan, inspected, documented and shipped to your port. Translated auction sheets and one clear price.'],
  inventory:   ['Japanese Cars for Export | Live Stock | AR7 Traders',
                'Browse verified Japanese vehicles ready for export: Toyota, Nissan, Honda, Lexus, Mercedes and more, with mileage, grade and shipping cost to your port.'],
  auction:     ['Japan Car Auction Access | Bid With AR7 Traders',
                'Bid at Japanese car auctions with translated auction sheets, condition grading advice and an agreed maximum bid placed on your behalf.'],
  services:    ['Vehicle Export Services: Inspection & Shipping | AR7 Traders',
                'Sourcing, inspection, de-registration, export certificates, RoRo and container shipping, and customs paperwork handled end to end.'],
  brands:      ['Car Brands We Export | Toyota, Nissan, Lexus | AR7 Traders',
                'Explore the Japanese and European brands AR7 Traders sources at auction and exports worldwide, with typical pricing and availability.'],
  destinations:['Car Export Destinations & Ports | AR7 Traders',
                'Shipping routes, transit times, freight costs and import duty guidance for Pakistan, the UAE, Kenya, Tanzania, the UK and more.'],
  tools:       ['Import Cost Calculator | Duty & Shipping Estimates — AR7 Traders',
                'Estimate landed cost before you buy: freight by destination port, import duty by country and total cost for your vehicle.'],
  world:       ['Our Global Network | AR7 Traders Worldwide',
                'Explore AR7 Traders\u2019 shipping destinations, ports served and regional market guides.'],
  howbuy:      ['How to Buy a Car From Japan | Step-by-Step — AR7 Traders',
                'From telling us the car you want to collecting it at your port: the full AR7 Traders buying process explained in plain language.'],
  news:        ['Japanese Car Import News & Guides | AR7 Traders',
                'Auction tips, import rule changes, shipping updates and buying guides for importing vehicles from Japan.'],
  about:       ['About AR7 Traders | Japanese Vehicle Exporters',
                'Who we are, how we work, and how AR7 Traders sources and ships vehicles from Japan for buyers worldwide.'],
  reviews:     ['Japanese Car Exporter | Customer Reviews & Buyer Stories',
                'Genuine reviews of AR7 Traders: auction sheet translations, USS Tokyo bidding and RoRo & container shipping to Pakistan, the UK, UAE and Kenya.'],
  faq:         ['Japanese Car Import FAQ | Help — AR7 Traders',
                'Answers on auctions, grading, shipping times, duty, payment and paperwork for importing a vehicle from Japan.'],
  contact:     ['Contact AR7 Traders | Japan Export Desk',
                'Talk to our Japan export desk by email, phone or WhatsApp about sourcing and shipping your next vehicle.'],
  shipping:    ['Vehicle Shipping from Japan | RoRo & Container — AR7 Traders',
                'How AR7 Traders ships vehicles from Japan: RoRo and container sea freight, export documents, marine insurance and milestone tracking to your port.'],
  account:     ['Your Account | AR7 Traders',
                'Sign in to see your vehicle orders, payments received and remaining balance.'],
  portal:      ['Client Portal | AR7 Traders',
                'Track bids, shipments, documents and payments in the AR7 Traders client portal.'],
  machinery:   ['Construction Machinery for Export | AR7 Traders',
                'Excavators, wheel loaders, tippers and cranes sourced to order from vetted Chinese suppliers, inspected and shipped to your port. Indicative FOB prices.'],
  'japan-stock': ['Japan Dealer Stock | Fresh Japan Imports — AR7 Traders',
                'Hand-picked dealer stock from Japan: fresh arrivals with verified photos, full specs and export pricing, updated regularly.'],
  crm:         ['AR7 Traders Staff CRM', 'Internal operations console for AR7 Traders staff: leads, customers, quotes, shipments and approvals.'],
  studio:      ['Responsive Preview | AR7 Traders', 'Preview the AR7 Traders website across phone, tablet, laptop and desktop.'],
  seo:         ['SEO Desk | AR7 Traders', 'Staff-only SEO audit desk: the same checks the AR7 SEO agent runs, on the live page.']
};

// The /faq page renders these questions grouped by topic (the 3rd tuple
// element); the FAQPage JSON-LD destructures only [q, a] so markup and visible
// content never drift apart and schema.org receives only Question/Answer pairs.
export const FAQ_ITEMS = [
  ['How do Japanese car auctions work?', 'Licensed trade members inspect and bid on vehicles at wholesale auction houses across Japan. AR7 shortlists suitable lots, translates the inspector notes and places your agreed maximum bid on your behalf.', 'Auctions & condition'],
  ['Can I see the auction sheet before bidding?', 'For auction-sourced lots, yes — we share the Japanese auction sheet and a plain-English summary of the grades and marks before you commit to a bid. For dealer-stock vehicles, condition is reviewed from the dealer report and yard photographs.', 'Auctions & condition'],
  ['What do Japanese auction grades like 4.5, 4.0 and R mean?', 'Grades S, 5, 4.5 and 4.0 indicate overall condition and mileage Band, while panel codes like A1 (small scratch), U1 (minor dent) and W2 (paint wave) mark individual panels. An R or RA grade means repaired accident history — we flag those clearly before you decide.', 'Auctions & condition'],
  ['How is dealer stock different from an auction vehicle?', 'Auction vehicles sell on a scheduled bidding day at a hammer price in Japanese yen, whereas dealer-stock vehicles are already priced at Japanese dealerships for immediate reservation without waiting for an auction session.', 'Auctions & condition'],
  ['Can AR7 source a specific model?', 'Yes. Share your target make, model, year range, mileage cap, preferred colour and destination port. We monitor daily auction lists and Japanese dealer networks until a matching vehicle appears.', 'Auctions & condition'],
  ['What is included in the export price?', 'The listed vehicle price is an FOB (Free on Board) starting estimate in Japan. Your written quotation itemizes the vehicle price, Japanese inland transport and export preparation, ocean freight and marine transit insurance (CIF).', 'Pricing & payment'],
  ['What is the difference between FOB and CIF pricing?', 'FOB covers the vehicle and export preparation up to loading at the Japanese port. CIF (Cost, Insurance and Freight) adds sea freight to your destination port and marine transit insurance so you see the landed port cost before customs.', 'Pricing & payment'],
  ['How do I pay for a vehicle and what currencies are accepted?', 'Purchases are settled by international bank transfer (T/T) against an itemized proforma invoice, typically in USD or JPY. For auction bidding, a refundable deposit activates your bidding limit and the balance is invoiced after a successful purchase.', 'Pricing & payment'],
  ['Are the calculator numbers on the website final quotes?', 'No — all calculator outputs and transit windows on the website are planning estimates. Before you commit, our Japan export desk issues a written quotation with current carrier freight and documentation costs for your specific vehicle.', 'Pricing & payment'],
  ['How long does shipping take?', 'Sea transit depends on your destination port, carrier schedule and whether the vessel sails direct or transships. Typical planning windows range from roughly 18 to 42 days after loading in Japan.', 'Shipping & documents'],
  ['Should I choose RoRo or container shipping?', 'RoRo (Roll-on/Roll-off) is the standard, cost-effective choice for drivable cars, SUVs and vans. Dedicated or shared containers suit high-value supercars, low-clearance vehicles or multi-car dealership orders.', 'Shipping & documents'],
  ['Which export documents will I receive?', 'Every shipment is prepared with a Commercial Invoice, original Bill of Lading, Japanese Export Certificate (de-registration certificate) and marine insurance certificate, plus pre-shipment inspection certificates (such as QISJ, JEVIC or EAA) where required by your market.', 'Shipping & documents'],
  ['How do I track my vehicle?', 'Clients receive portal and WhatsApp updates covering yard arrival photos in Japan, pre-export inspection, vessel booking, Bill of Lading dispatch by courier and estimated port arrival.', 'Customs & arrival'],
  ['Who calculates import duty and clears the car at my port?', 'Import duty, local taxes and registration fees are always assessed by your own country’s customs authority under local rules. Your licensed clearing agent at the destination port submits the original documents we courier to you and confirms the exact duty payable.', 'Customs & arrival']
];

export const FAQ_TOPICS = [...new Set(FAQ_ITEMS.map(x => x[2]))];

/* ---------------------------------------------------------------------------
   Indexable landing pages
   ---------------------------------------------------------------------------
   /cars/<make> and /cars/<make>/<model> carry the searches that actually bring
   exporter traffic ("toyota land cruiser export", "used excavator for sale"),
   so each one gets its own title, description, canonical and ItemList — the
   structure BeForward and the machinery marketplaces rank with. The generic
   /inventory page keeps its own copy and never competes with them.
   --------------------------------------------------------------------------- */

const countryList = 'Pakistan, the UAE, Kenya, Tanzania, the UK and worldwide';

export function carsLandingSeo(make, model, count) {
  const m = canonicalBrand(make);
  if (!m) return null;
  const n = Number.isFinite(count) && count > 0 ? count : null;
  const stock = n ? `${n} ${n === 1 ? 'vehicle' : 'vehicles'} in stock` : 'live stock';
  if (model) {
    const label = String(model).replace(/\b\w/g, c => c.toUpperCase());
    return {
      title: `${m} ${label} for Export from Japan | AR7 Traders`,
      description: `Used ${m} ${label} cars from Japanese auctions with a translated auction sheet. ${stock} · export price in USD, shipping to your port.`,
      h1: `${m} ${label} for export`,
      canonicalPath: `/cars/${slugify(m)}/${slugify(model)}`,
      label: `${m} ${label}`
    };
  }
  return {
    title: `Used ${m} Cars for Export from Japan | AR7 Traders`,
    description: `Used ${m} cars from Japanese auctions — mileage, grade and auction sheet, ${stock}, export price in USD and shipping to your port.`,
    h1: `Used ${m} cars for export`,
    canonicalPath: `/cars/${slugify(m)}`,
    label: m
  };
}

// Machinery catalogue pages. Kept beside the car ones so every indexable
// landing page in the site is defined in exactly one place.
export const MACHINERY_SEO = {
  excavators: ['Used Excavators for Sale & Export | Doosan, Sany | AR7 Traders',
    'Crawler excavators from 13 to 37 tonnes sourced to order from vetted Chinese suppliers: Doosan, Sany and Komatsu, with indicative FOB prices.'],
  loaders: ['Wheel Loaders for Sale & Export | SDLG, LiuGong | AR7 Traders',
    'Five-tonne wheel loaders sourced to order from vetted Chinese suppliers, inspected with photos and video, and shipped to your port with the export documents.'],
  trucks: ['Tipper Trucks for Export | Shacman, Howo | AR7 Traders',
    'Heavy tipper trucks and tractor heads from Shacman, Sinotruk and Howo, sourced to order from vetted Chinese suppliers and shipped breakbulk to your port.'],
  cranes: ['Truck Cranes for Export | Zoomlion, XCMG | AR7 Traders',
    'Truck-mounted and rough-terrain cranes from Zoomlion and XCMG with lifting certificates, sourced to order from vetted Chinese suppliers.']
};

/**
 * One machine's page. The title carries the model people search for, the
 * description carries the number they care about, and both say the unit is
 * sourced to order — the honest version of availability, since we do not hold
 * these machines.
 */
export function machineSeo(machine, {percent = 0} = {}) {
  if (!machine) return null;
  const list = listPriceUSD(machine);
  const price = percent > 0 ? priceWithOffer(list, percent).now : list;
  const priced = price ? `indicative FOB $${Number(price).toLocaleString('en-US')}` : 'FOB price on request';
  const usage = machine.type === 'Trucks'
    ? `${Number(machine.hours).toLocaleString('en-US')} km`
    : `${Number(machine.hours).toLocaleString('en-US')} hours`;
  const type = String(machine.type || '').toLowerCase().replace(/s$/, '');
  return {
    title: `${machine.name} ${type} for export from China | AR7 Traders`,
    description: `${machine.year} ${machine.name} ${type} (${machine.ref}) sourced to order from a vetted Chinese supplier — ${usage}, inspected with photos and video, ${priced}. Quoted with freight to your port.`,
    canonicalPath: `/machinery/${machine.type.toLowerCase()}/${machine.ref}`,
    price,
    listPrice: list,
    type
  };
}

const MISSING_VEHICLE_SEO = [
  'Vehicle no longer listed | AR7 Traders',
  'This vehicle is no longer in our current stock. Browse live Japanese vehicles ready for export on AR7 Traders.'
];

const MISSING_ARTICLE_SEO = [
  'Guide not found | AR7 Traders',
  'This buying guide could not be found. Browse our Japanese car import guides and market notes on AR7 Traders.'
];

function setMeta(selector, attr, value) {
  let el = document.head.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    const [, k, v] = selector.match(/\[(\w+)="([^"]+)"\]/) || [];
    if (k) el.setAttribute(k, v);
    document.head.appendChild(el);
  }
  el.setAttribute(attr, value);
}

function removeMeta(selector) {
  const el = document.head.querySelector(selector);
  if (el) el.remove();
}

// ---- per-page Open Graph images (owner-approved 2026-09-28) ----------------
// A small branded set of honest, real photographs — no invented stats,
// ratings, country counts or fabricated screenshots (CLAIMS-POLICY.md §2).
// Every URL is absolute; declared dimensions must match the actual file
// (asserted against the JPEG headers in scripts/seo-render.test.mjs):
//   • the default/home image is the static shell's own picture (kept so the
//     no-JS shell in index.html and the JS-applied head can never disagree);
//   • public/assets/og/*.jpg are 1200×630 crops of site photography;
//   • vehicle pages use the vehicle's own photo instead (width/height are
//     omitted there because a listing photo is not a 1200×630 asset).
const OG_DEFAULT = {
  image: BASE + '/assets/used-japanese-cars-auction-export-toyota-3.jpg',
  width: 1240, height: 800,
  alt: 'Japanese vehicles prepared for export by AR7 Traders'
};
const OG_SET = {
  inventory: {
    image: BASE + '/assets/og/inventory.jpg', width: 1200, height: 630,
    alt: 'Japanese vehicle photographed for export in a showroom yard'
  },
  shipping: {
    image: BASE + '/assets/og/shipping.jpg', width: 1200, height: 630,
    alt: 'Vehicles and shipping containers at a Japanese export port'
  },
  auction: {
    image: BASE + '/assets/og/auction.jpg', width: 1200, height: 630,
    alt: 'Vehicle inspection being carried out at a Japanese facility'
  },
  help: {
    image: BASE + '/assets/og/help.jpg', width: 1200, height: 630,
    alt: 'Japanese vehicle photographed for export'
  }
};
// Route → image group for every public route in PAGE_SEO (16). Staff routes
// are noindex and fall back to the default image.
export const PAGE_OG = {
  home: OG_DEFAULT,
  inventory: OG_SET.inventory, brands: OG_SET.inventory, 'japan-stock': OG_SET.inventory,
  auction: OG_SET.auction, services: OG_SET.auction, howbuy: OG_SET.auction,
  shipping: OG_SET.shipping, destinations: OG_SET.shipping, world: OG_SET.shipping,
  faq: OG_SET.help, news: OG_SET.help, reviews: OG_SET.help,
  contact: OG_SET.help, about: OG_SET.help, tools: OG_SET.help,
  machinery: OG_SET.shipping
};
export const ogFor = page => PAGE_OG[page] || OG_DEFAULT;

// ---- vehicle metadata helpers ------------------------------------------------

const carName = car => [car?.year, car?.make, car?.model].filter(Boolean).join(' ');

/** Numeric price from the published display string ('"$21,000"' → 21000). */
function priceNumber(price) {
  if (typeof price === 'number') return Number.isFinite(price) && price > 0 ? price : null;
  const n = Number(String(price || '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Currency that matches the published price string. The site's base display
 *  currency is USD; strings that carry another symbol keep their currency. */
function priceCurrency(price) {
  const s = String(price ?? '').trim();
  if (/^\u00a5|JPY/i.test(s)) return 'JPY';
  if (/^\u20ac|EUR/i.test(s)) return 'EUR';
  if (/^\u00a3|GBP/i.test(s)) return 'GBP';
  if (/AED/i.test(s)) return 'AED';
  if (/PKR/i.test(s)) return 'PKR';
  return 'USD';
}

/** Display form of the published price for descriptions ('$21,000' stays as
 *  published; a number is formatted in its currency). */
function priceText(price) {
  if (typeof price === 'string' && price.trim()) return price.trim();
  const n = priceNumber(price);
  if (!n) return null;
  const cur = priceCurrency(price);
  const symbol = {USD: '$', JPY: '\u00a5', EUR: '\u20ac', GBP: '\u00a3'}[cur];
  return symbol ? symbol + n.toLocaleString('en-US') : `${n} ${cur}`;
}

/** Vehicle-specific title — replaces the listing-level default. */
export function vehicleSeo(car, carId) {
  const name = carName(car) || 'Vehicle';
  const facts = [];
  if (car?.km) facts.push(String(car.km).replace(/,\s*/g, ',') + ' km');
  if (car?.fuel) facts.push(car.fuel);
  if (car?.tr) facts.push(car.tr);
  const price = priceText(car?.price);
  if (price) facts.push('export price from ' + price);
  const ref = carId != null && String(carId) !== '' ? ` (Stock ${String(carId)})` : '';
  const title = `${name}${ref} — Japanese Import | AR7 Traders`;
  const desc = facts.length
    ? `${name} for export from Japan: ${facts.join(', ')}. See the full specification, photos and stock reference, then ask our team for a landed quote.`
    : `${name} for export from Japan. See the full specification and photos, then ask our team for a landed quote.`;
  return [title, desc];
}

/** schema.org availability that matches the record's status — or null when the
 *  status does not support an honest availability claim (auction lots are not
 *  AR7 stock, so no availability is published for them). */
function availabilityFor(car) {
  const s = String(car?.status || '').toLowerCase();
  if (!s) return 'https://schema.org/InStock';
  if (/sold|delivered/.test(s)) return 'https://schema.org/SoldOut';
  if (/auction|bidding|upcoming/.test(s)) return null;
  return 'https://schema.org/InStock';
}

/** Absolute image URL, or null when the record has no image (never
 *  'https://ar7traders.com/undefined'). */
function imageFor(src) {
  const s = String(src || '').trim();
  if (!s) return null;
  return /^https?:\/\//i.test(s) ? s : BASE + s;
}

/** Builds schema.org JSON-LD for a single vehicle's detail page. Only fields
 *  with real data are emitted; everything else is omitted, not faked. */
function vehicleJsonLd(car, carId) {
  if (!car) return null;
  const name = carName(car);
  const km = Number(String(car.km || '').replace(/[^0-9]/g, '')) || undefined;
  const price = priceNumber(car.price);
  const currency = price ? priceCurrency(car.price) : null;
  const image = imageFor(car.image);
  const availability = availabilityFor(car);
  const url = BASE + hrefFor('inventory', carId);
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Car',
    name,
    brand: {'@type': 'CarMake', name: car.make || undefined},
    model: car.model || undefined,
    image: image || undefined,
    url,
    vehicleTransmission: ({AT: 'Automatic transmission', MT: 'Manual transmission',
      CVT: 'CVT', DCT: 'Dual-clutch transmission'})[car.tr] || undefined,
    fuelType: ({Petrol: 'Gasoline', Diesel: 'Diesel', Hybrid: 'Hybrid',
      Electric: 'Electric'})[car.fuel] || undefined,
    seatingCapacity: car.seats || undefined,
    mileageFromOdometer: km ? {'@type': 'QuantitativeValue', value: km, unitCode: 'KMT'} : undefined,
    offers: price ? {
      '@type': 'Offer',
      price: String(price),
      priceCurrency: currency,
      availability: availability || undefined,
      url
    } : undefined
  };
  const cc = Number(String(car.eng || '').replace(/[^0-9]/g, ''));
  if (cc) data.vehicleEngine = {
    '@type': 'EngineSpecification',
    engineDisplacement: {'@type': 'QuantitativeValue', value: cc, unitCode: 'CMQ'}
  };
  // Drop keys with no value so the emitted JSON stays clean.
  return JSON.stringify(data, (k, v) => (v === undefined ? undefined : v));
}

/** Builds Article JSON-LD from a guide's visible copy and canonical URL. */
export function articleJsonLd(article) {
  const seo = articleSeo(article);
  if (!article || !seo) return null;
  const url = BASE + seo.canonicalPath;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description: seo.description,
    image: imageFor(seo.ogImage),
    url,
    mainEntityOfPage: {'@type': 'WebPage', '@id': url},
    author: {'@type': 'Organization', name: 'AR7 Traders', url: BASE + '/'},
    publisher: {
      '@type': 'Organization',
      name: 'AR7 Traders',
      url: BASE + '/',
      logo: {'@type': 'ImageObject', url: BASE + '/assets/ar7-logo.png'}
    },
    articleSection: article.cat
  };
  return JSON.stringify(data, (k, v) => (v === undefined ? undefined : v));
}

function setJsonLd(id, json) {
  let el = document.getElementById(id);
  if (!json) {
    if (el) el.remove();
    return;
  }
  if (!el) {
    el = document.createElement('script');
    el.id = id;
    el.type = 'application/ld+json';
    document.head.appendChild(el);
  }
  el.textContent = json;
}

export function applySeo(page, carId, car, opts = {}) {
  const isVehiclePage = page === 'inventory' && carId != null && String(carId) !== '';
  const vehicleMissing = !!(isVehiclePage && !car && opts.vehicleMissing);
  const brand = page === 'inventory' && !isVehiclePage ? brandSeo(opts.make) : null;
  const landing = page === 'inventory' && !isVehiclePage ? carsLandingSeo(opts.make, opts.model, opts.vehicleCount) : null;
  const machineTypeSeo = page === 'machinery' && opts.machineType ? MACHINERY_SEO[String(opts.machineType).toLowerCase()] : null;
  // One machine's own page beats the type page: it is more specific, it is what
  // the visitor asked for, and it is the page that can rank for the model.
  const machinePage = page === 'machinery' && opts.machine ? machineSeo(opts.machine, {percent: opts.machineOfferPercent || 0}) : null;
  const isArticlePage = page === 'news' && carId != null && String(carId) !== '';
  const article = isArticlePage ? articleBySlug(carId) : null;
  const articleMissing = isArticlePage && !article;
  const artSeo = article ? articleSeo(article) : null;

  const [title, description] = vehicleMissing
    ? MISSING_VEHICLE_SEO
    : (isVehiclePage && car)
      ? vehicleSeo(car, carId)
      : articleMissing
        ? MISSING_ARTICLE_SEO
        : artSeo
          ? [artSeo.title, artSeo.description]
          : landing
            ? [landing.title, landing.description]
            : machinePage
              ? [machinePage.title, machinePage.description]
              : machineTypeSeo
                ? machineTypeSeo
                : brand
                ? [brand.title, brand.description]
                : (PAGE_SEO[page] || PAGE_SEO.home);
  const url = articleMissing
    ? BASE + '/news'
    : artSeo
      ? BASE + artSeo.canonicalPath
      : landing
        ? BASE + landing.canonicalPath
        : machinePage
          ? BASE + machinePage.canonicalPath
          : machineTypeSeo
            ? BASE + '/machinery/' + String(opts.machineType).toLowerCase()
            : brand
            ? BASE + brand.canonicalPath
            : BASE + hrefFor(page, carId);
  const noindex = ['crm', 'account', 'portal', 'studio', 'seo'].includes(page) || vehicleMissing || articleMissing;

  document.title = title;
  setMeta('meta[name="description"]', 'content', description);
  setMeta('meta[property="og:title"]', 'content', title);
  setMeta('meta[property="og:description"]', 'content', description);
  setMeta('meta[property="og:url"]', 'content', url);
  setMeta('meta[name="twitter:title"]', 'content', title);
  setMeta('meta[name="twitter:description"]', 'content', description);

  // Per-page preview image: the vehicle's own photo on detail pages (when it
  // has one), the guide's own photo on /news/<slug>, otherwise the page's
  // mapped branded asset. twitter:image stays in lockstep, og:image:alt
  // describes what the image actually shows, and width/height only ever
  // describe the real asset (never left stale from a previously visited route).
  const vehiclePhoto = isVehiclePage && car ? imageFor(car.image) : null;
  const articlePhoto = artSeo ? imageFor(artSeo.ogImage) : null;
  const og = isVehiclePage
    ? (vehiclePhoto
      ? { image: vehiclePhoto, width: null, height: null, alt: carName(car) + ' photo' }
      : OG_DEFAULT)
    : (artSeo && articlePhoto)
      ? { image: articlePhoto, width: null, height: null, alt: article.title }
      : machinePage
        ? { image: machineShareImage(opts.machine), width: null, height: null, alt: `${opts.machine.name} for export from China` }
        : ogFor(page);
  setMeta('meta[property="og:image"]', 'content', og.image);
  setMeta('meta[property="og:image:alt"]', 'content', og.alt);
  setMeta('meta[name="twitter:image"]', 'content', og.image);
  if (og.width && og.height) {
    setMeta('meta[property="og:image:width"]', 'content', String(og.width));
    setMeta('meta[property="og:image:height"]', 'content', String(og.height));
  } else {
    removeMeta('meta[property="og:image:width"]');
    removeMeta('meta[property="og:image:height"]');
  }
  setMeta('meta[name="robots"], meta[name="robots"]', 'content',
    noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large,max-snippet:-1');

  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = url;

  // Breadcrumb rich result: inventory and guide detail routes retain their
  // three-level parent context; other top-level routes remain Home → Page.
  const crumbs = [
    {'@type': 'ListItem', position: 1, name: 'Home', item: BASE + '/'}
  ];
  if (page && page !== 'home') {
    if (isArticlePage && article) {
      crumbs.push({'@type': 'ListItem', position: 2, name: PAGE_LABELS.news, item: BASE + '/news'});
      crumbs.push({'@type': 'ListItem', position: 3, name: article.title, item: url});
    } else if (isVehiclePage && car) {
      crumbs.push({'@type': 'ListItem', position: 2, name: 'Inventory', item: BASE + '/inventory'});
      crumbs.push({'@type': 'ListItem', position: 3, name: carName(car), item: url});
    } else if (landing) {
      crumbs.push({'@type': 'ListItem', position: 2, name: 'Inventory', item: BASE + '/inventory'});
      crumbs.push({'@type': 'ListItem', position: 3, name: landing.label, item: url});
    } else if (machinePage) {
      crumbs.push({'@type': 'ListItem', position: 2, name: 'Machinery', item: BASE + '/machinery'});
      crumbs.push({'@type': 'ListItem', position: 3, name: String(opts.machineType), item: BASE + '/machinery/' + String(opts.machineType).toLowerCase()});
      crumbs.push({'@type': 'ListItem', position: 4, name: opts.machine.name, item: url});
    } else if (machineTypeSeo) {
      crumbs.push({'@type': 'ListItem', position: 2, name: 'Machinery', item: BASE + '/machinery'});
      crumbs.push({'@type': 'ListItem', position: 3, name: String(opts.machineType), item: url});
    } else if (brand) {
      crumbs.push({'@type': 'ListItem', position: 2, name: 'Inventory', item: BASE + '/inventory'});
      crumbs.push({'@type': 'ListItem', position: 3, name: brand.make, item: url});
    } else {
      const label = PAGE_LABELS[page] || title;
      crumbs.push({'@type': 'ListItem', position: crumbs.length + 1, name: label, item: url});
    }
  }
  setJsonLd('breadcrumb-jsonld', JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs
  }));

  // A landing page is a list, so it says so: ItemList of the vehicles (or
  // machine types) the page actually shows. This is what earns the
  // list-style rich result and tells crawlers what the page is for.
  setJsonLd('list-jsonld', landing ? JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'ItemList',
    name: landing.h1,
    numberOfItems: Number.isFinite(opts.vehicleCount) ? opts.vehicleCount : undefined,
    itemListOrder: 'https://schema.org/ItemListOrderDescending',
    url
  }) : null);

  // Vehicle structured data on the detail page only.
  setJsonLd('vehicle-jsonld', vehicleJsonLd(isVehiclePage ? car : null, carId));

  // A machine is a product, and its page may describe one: name, brand, the
  // type as category, the price we actually show, and the photos we hold.
  // Availability is stated as what it is — sourced to order, never InStock.
  setJsonLd('machine-jsonld', machinePage ? JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: opts.machine.name,
    category: String(opts.machine.type),
    sku: opts.machine.ref,
    brand: {'@type': 'Brand', name: opts.machine.brand},
    description: opts.machine.summary,
    image: machineImagesFor(opts.machine).map(i => BASE + i).slice(0, 6),
    offers: machinePage.price ? {
      '@type': 'Offer',
      price: String(machinePage.price),
      priceCurrency: 'USD',
      availability: 'https://schema.org/PreOrder',
      url,
      priceValidUntil: opts.machineOfferUntil || undefined,
      seller: {'@type': 'Organization', name: 'AR7 Traders'}
    } : undefined
  }) : null);

  // Article structured data exists only for a guide that resolves from NEWS.
  // setJsonLd removes the node on /news, any other route, or an unknown slug.
  setJsonLd('article-jsonld', articleJsonLd(isArticlePage && article ? article : null));

  // FAQ markup scoped to /faq — it must not ride along on every route.
  setJsonLd('faq-jsonld', page === 'faq' ? JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: FAQ_ITEMS.map(([q, a]) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: {'@type': 'Answer', text: a}
    }))
  }) : null);
}

/** Keeps the tab title, share preview and structured data in step with the page. */
export function useSeo(page, carId, car, opts = {}) {
  const vehicleMissing = !!opts.vehicleMissing;
  const make = opts.make ?? null;
  const model = opts.model ?? null;
  const machineType = opts.machineType ?? null;
  const machineRef = opts.machineRef ?? null;
  const machine = opts.machine ?? null;
  const machineOfferPercent = opts.machineOfferPercent ?? 0;
  const machineOfferUntil = opts.machineOfferUntil ?? null;
  const vehicleCount = opts.vehicleCount ?? null;
  useEffect(() => {
    applySeo(page, carId, car, { vehicleMissing, make, model, machineType, machineRef, machine, machineOfferPercent, machineOfferUntil, vehicleCount });
  }, [page, carId, car, vehicleMissing, make, model, machineType, machineRef, machine,
      machineOfferPercent, machineOfferUntil, vehicleCount]);
}

/** The machine's own photograph for a share card, or the site card. */
function machineShareImage(machine) {
  const first = (Array.isArray(machine?.images) && machine.images.filter(Boolean)[0]) || machine?.image;
  return first ? BASE + first : OG_DEFAULT.image;
}

const machineImagesFor = machine => (Array.isArray(machine?.images) ? machine.images.filter(Boolean) : machine?.image ? [machine.image] : []);
