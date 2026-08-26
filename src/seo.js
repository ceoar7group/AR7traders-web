// Per-page titles and descriptions.
//
// The site is a single page with hash routing, so search engines and — more
// importantly for a business like this — WhatsApp, browser tabs and bookmarks
// all see one title unless we update it as the visitor moves around.
import {useEffect} from 'react';
import { hrefFor } from './routing.js';

const BASE = 'https://ar7traders.com';

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

export function applySeo(page, carId) {
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
}

/** Keeps the tab title and share preview in step with the current page. */
export function useSeo(page, carId) {
  useEffect(() => { applySeo(page, carId); }, [page, carId]);
}
