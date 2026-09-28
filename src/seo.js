// Per-page titles and descriptions.
//
// The site is a single page with hash routing, so search engines and — more
// importantly for a business like this — WhatsApp, browser tabs and bookmarks
// all see one title unless we update it as the visitor moves around.
import {useEffect} from 'react';
import { hrefFor } from './routing.js';

const BASE = 'https://ar7traders.com';

const PAGE_LABELS = {
  inventory: 'Vehicle Inventory', auction: 'Auction Bidding', services: 'Export Services',
  brands: 'Brands We Export', destinations: 'Shipping Destinations', tools: 'Import Cost Calculator',
  world: 'Global Network', howbuy: 'How to Buy', news: 'News & Guides', about: 'About',
  reviews: 'Reviews', faq: 'FAQ', contact: 'Contact', 'japan-stock': 'Japan Dealer Stock',
  shipping: 'Shipping'
};

export const PAGE_SEO = {
  home:        ['AR7 Traders | Japanese Car Exporter — Auction Vehicles Shipped Worldwide',
                'Auction-sourced vehicles from Japan, inspected, documented and shipped to your port. Translated auction sheets and one clear price to 35+ countries.'],
  inventory:   ['Japanese Cars for Export | Live Stock — AR7 Traders',
                'Browse verified Japanese vehicles ready for export: Toyota, Nissan, Honda, Lexus, Mercedes and more, with mileage, grade and shipping cost to your port.'],
  auction:     ['Japan Car Auction Access | Bid With AR7 Traders',
                'Bid at Japanese car auctions with translated auction sheets, condition grading advice and an agreed maximum bid placed on your behalf.'],
  services:    ['Vehicle Export Services | Inspection, Shipping & Documents — AR7 Traders',
                'Sourcing, inspection, de-registration, export certificates, RoRo and container shipping, and customs paperwork handled end to end.'],
  brands:      ['Japanese Car Brands We Export | Toyota, Nissan, Honda, Lexus — AR7 Traders',
                'Explore the Japanese and European brands AR7 Traders sources at auction and exports worldwide, with typical pricing and availability.'],
  destinations:['Where We Ship | Car Export Destinations — AR7 Traders',
                'Shipping routes, transit times, freight costs and import duty guidance for Pakistan, the UAE, Kenya, Tanzania, the UK and more.'],
  tools:       ['Import Cost Calculator | Duty & Shipping Estimates — AR7 Traders',
                'Estimate landed cost before you buy: freight by destination port, import duty by country and total cost for your vehicle.'],
  world:       ['Our Global Network | AR7 Traders Worldwide',
                'AR7 Traders ships to 35+ countries. Explore our destination network, ports served and regional market guides.'],
  howbuy:      ['How to Buy a Car From Japan | Step-by-Step — AR7 Traders',
                'From telling us the car you want to collecting it at your port: the full AR7 Traders buying process explained in plain language.'],
  news:        ['Japanese Car Import News & Guides | AR7 Traders',
                'Auction tips, import rule changes, shipping updates and buying guides for importing vehicles from Japan.'],
  about:       ['About AR7 Traders | Japanese Vehicle Exporters',
                'Who we are, how we work, and why buyers in 35+ countries trust AR7 Traders to source and ship their vehicles from Japan.'],
  reviews:     ['Customer Stories | AR7 Traders Reviews',
                'Real experiences from AR7 Traders buyers importing vehicles from Japan to Pakistan, Kenya, the UAE and beyond.'],
  faq:         ['Japanese Car Import FAQ | Help — AR7 Traders',
                'Answers on auctions, grading, shipping times, duty, payment and paperwork for importing a vehicle from Japan.'],
  contact:     ['Contact AR7 Traders | Japan Export Desk',
                'Talk to our Japan export desk by email, phone or WhatsApp about sourcing and shipping your next vehicle.'],
  account:     ['Your Account | AR7 Traders',
                'Sign in to see your vehicle orders, payments received and remaining balance.'],
  portal:      ['Client Portal | AR7 Traders',
                'Track bids, shipments, documents and payments in the AR7 Traders client portal.'],
  'japan-stock': ['Japan Dealer Stock | Fresh Goo-net Imports — AR7 Traders',
                'Hand-picked dealer stock straight from Goo-net Japan: fresh arrivals with verified photos, full specs and export pricing, updated regularly.'],
  crm:         ['AR7 Traders Staff CRM', 'Internal operations console.'],
  studio:      ['Responsive Preview | AR7 Traders', 'Preview the AR7 Traders website across phone, tablet, laptop and desktop.']
};

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

/** Builds schema.org JSON-LD for a single vehicle's detail page. */
function vehicleJsonLd(car, carId) {
  if (!car) return null;
  const name = [car.year, car.make, car.model].filter(Boolean).join(' ');
  const km = Number(String(car.km || '').replace(/[^0-9]/g, '')) || undefined;
  const price = Number(String(car.price || '').replace(/[^0-9.]/g, '')) || undefined;
  const image = String(car.image || '').startsWith('http') ? car.image : BASE + car.image;
  const data = {
    '@context': 'https://schema.org',
    '@type': 'Car',
    name,
    brand: {'@type': 'CarMake', name: car.make || undefined},
    model: car.model || undefined,
    image,
    url: BASE + hrefFor('inventory', carId),
    vehicleTransmission: ({AT: 'Automatic transmission', MT: 'Manual transmission',
      CVT: 'CVT', DCT: 'Dual-clutch transmission'})[car.tr] || undefined,
    fuelType: ({Petrol: 'Gasoline', Diesel: 'Diesel', Hybrid: 'Hybrid',
      Electric: 'Electric'})[car.fuel] || undefined,
    seatingCapacity: car.seats || undefined,
    mileageFromOdometer: km ? {'@type': 'QuantitativeValue', value: km, unitCode: 'KMT'} : undefined,
    offers: price ? {
      '@type': 'Offer',
      price: String(price),
      priceCurrency: 'USD',
      availability: 'https://schema.org/InStock',
      url: BASE + hrefFor('inventory', carId)
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

export function applySeo(page, carId, car) {
  const [title, description] = PAGE_SEO[page] || PAGE_SEO.home;
  const url = BASE + hrefFor(page, carId);
  const noindex = ['crm', 'account', 'portal', 'studio'].includes(page);

  document.title = title;
  setMeta('meta[name="description"]', 'content', description);
  setMeta('meta[property="og:title"]', 'content', title);
  setMeta('meta[property="og:description"]', 'content', description);
  setMeta('meta[property="og:url"]', 'content', url);
  setMeta('meta[name="twitter:title"]', 'content', title);
  setMeta('meta[name="twitter:description"]', 'content', description);
  setMeta('meta[name="robots"], meta[name="robots"]', 'content',
    noindex ? 'noindex,nofollow' : 'index,follow,max-image-preview:large,max-snippet:-1');

  let link = document.head.querySelector('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = url;

  // Breadcrumb rich result: Home → Current page (Home → Car name on detail pages).
  const crumbs = [
    {'@type': 'ListItem', position: 1, name: 'Home', item: BASE + '/'}
  ];
  if (page && page !== 'home') {
    const label = (page === 'inventory' && car)
      ? [car.year, car.make, car.model].filter(Boolean).join(' ')
      : PAGE_LABELS[page] || title;
    crumbs.push({'@type': 'ListItem', position: crumbs.length + 1, name: label, item: url});
  }
  setJsonLd('breadcrumb-jsonld', JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: crumbs
  }));

  // Vehicle structured data on the detail page only.
  setJsonLd('vehicle-jsonld', vehicleJsonLd(page === 'inventory' ? car : null, carId));
}

/** Keeps the tab title, share preview and structured data in step with the page. */
export function useSeo(page, carId, car) {
  useEffect(() => { applySeo(page, carId, car); }, [page, carId, car]);
}
