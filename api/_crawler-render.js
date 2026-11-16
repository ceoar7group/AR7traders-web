// Dynamic crawler / OG rendering for SPA detail & landing routes that are
// NOT already prerendered to static HTML at build time:
//   • /cars/:make and /cars/:make/:model
//   • /machinery/:type/:ref (DB / scraped units beyond built-in AR7-MC-001..012)
//   • /news/:slug (CRM / AI Growth articles beyond the 6 built-in guides)
//
// Dispatched from api/site-content.js (query params ?carsmake, ?machhead,
// ?newshead) so it costs ZERO extra Vercel Serverless Functions against the
// 12-function Hobby cap.

import { adminClient } from './_supabase.js';
import { listMachines, builtinCatalogueMachines, resolveType } from './_machinery.js';
import { listPriceUSD, machineYearText, machineHours } from '../src/machinery-data.js';
import { carRef, hrefFor, carLandingPath, slugify, machinePath, machineTypePath } from '../src/sitemap-helpers.js';
import { mapDealerRows, PUBLIC_DEALER_LIMIT } from '../src/japan-stock-map.js';
import { NEWS, articleSlug } from '../src/news-data.js';

export const BASE_URL = 'https://ar7traders.com';
const HEAD_CACHE = 'public, max-age=300, s-maxage=1800';
const FALLBACK_CAR_IMAGE = BASE_URL + '/assets/japanese-car-auction-inspection-shipping-3.webp';
const FALLBACK_MCH_IMAGE = BASE_URL + '/assets/machinery/doosan-dx300lc-1.webp';
const FALLBACK_NEWS_IMAGE = BASE_URL + '/assets/japanese-car-auction-inspection-shipping-1.webp';
const UNAVAILABLE_STATUS = /^(sold|archived)$/i;

function esc(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function sendHtml(res, status, html, cache = HEAD_CACHE) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', cache);
  res.end(html);
}

function sendPlain(res, status, text) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.end(text);
}

function absUrl(src, fallback = FALLBACK_CAR_IMAGE) {
  const s = String(src || '').trim();
  if (!s) return fallback;
  if (/^https?:\/\//i.test(s)) return s;
  return BASE_URL + (s.startsWith('/') ? s : '/' + s);
}

function firstPhoto(row) {
  if (row?.image && String(row.image).trim()) return String(row.image).trim();
  let imgs = row?.images;
  if (typeof imgs === 'string') {
    try { imgs = JSON.parse(imgs); } catch { imgs = imgs.split(','); }
  }
  if (Array.isArray(imgs)) {
    const hit = imgs.find(x => typeof x === 'string' && x.trim());
    if (hit) return hit.trim();
  }
  return null;
}

function safeJsonLd(obj) {
  return JSON.stringify(obj).replace(/</g, '\\u003c');
}

function breadcrumbJsonLd(items) {
  return {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map(([name, url], i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name,
      item: url
    }))
  };
}

function renderDocument({
  title, description, url, image, alt, ogType = 'website',
  full = false, indexable = true, jsonLd = [], bodyHtml = ''
}) {
  const robots = full ? (indexable ? 'index,follow' : 'noindex,follow') : null;
  return '<!doctype html>\n<html lang="en"><head>\n' +
    '<meta charset="utf-8"/>\n' +
    `<title>${esc(title)}</title>\n` +
    `<meta name="description" content="${esc(description)}"/>\n` +
    (robots ? `<meta name="robots" content="${robots}"/>\n` : '') +
    `<link rel="canonical" href="${esc(url)}"/>\n` +
    `<meta property="og:type" content="${esc(ogType)}"/>\n` +
    '<meta property="og:site_name" content="AR7 Traders"/>\n' +
    `<meta property="og:title" content="${esc(title)}"/>\n` +
    `<meta property="og:description" content="${esc(description)}"/>\n` +
    `<meta property="og:url" content="${esc(url)}"/>\n` +
    `<meta property="og:image" content="${esc(image)}"/>\n` +
    `<meta property="og:image:alt" content="${esc(alt)}"/>\n` +
    '<meta name="twitter:card" content="summary_large_image"/>\n' +
    `<meta name="twitter:title" content="${esc(title)}"/>\n` +
    `<meta name="twitter:description" content="${esc(description)}"/>\n` +
    `<meta name="twitter:image" content="${esc(image)}"/>\n` +
    (full ? '' : `<meta http-equiv="refresh" content="0;url=${esc(url)}"/>\n`) +
    (full ? jsonLd.filter(Boolean).map(obj => `<script type="application/ld+json">${safeJsonLd(obj)}</script>\n`).join('') : '') +
    '</head><body>\n' +
    (full ? bodyHtml : `<p><a href="${esc(url)}">${esc(title)}</a></p>\n`) +
    '</body></html>\n';
}

function titleFromSlug(slug) {
  return String(slug || '')
    .split('-')
    .filter(Boolean)
    .map(w => w.length <= 3 && /^[a-z0-9]+$/i.test(w) ? w.toUpperCase() : w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

// ---------------------------------------------------------------------------
// 1. /machinery/:type/:ref — DB / scraped machinery + built-in fallback
// ---------------------------------------------------------------------------
export function buildMachineryHeadHtml(machine, opts = {}) {
  const full = !!opts.full;
  const reqType = resolveType(opts.type) || machine?.type || 'Excavators';
  const reqRef = String(opts.ref || machine?.ref || '').trim();
  const canonicalPath = machine
    ? machinePath(machine.type || reqType, machine.ref || reqRef)
    : (reqType ? machineTypePath(reqType) : '/machinery');
  const url = BASE_URL + canonicalPath;

  if (!machine) {
    const title = 'Construction & Heavy Machinery Export from China | AR7 Traders';
    const description = 'Excavators, wheel loaders, tipper trucks and cranes sourced to order from China and shipped to your port by AR7 Traders.';
    return renderDocument({
      title, description, url, image: FALLBACK_MCH_IMAGE,
      alt: 'Construction machinery sourced from China by AR7 Traders',
      full, indexable: false,
      jsonLd: [breadcrumbJsonLd([['Home', `${BASE_URL}/`], ['Machinery', `${BASE_URL}/machinery`]])],
      bodyHtml:
        `<h1>${esc(title)}</h1>\n` +
        '<p>This machine listing is unavailable or no longer active. Browse current machinery categories available to source from China.</p>\n' +
        `<p><a href="${esc(BASE_URL + machineTypePath(reqType))}">Browse ${esc(reqType)}</a> · <a href="${esc(BASE_URL + '/machinery')}">All machinery</a> · <a href="${esc(BASE_URL + '/')}">AR7 Traders</a></p>\n`
    });
  }

  const label = String(machine.type || 'Machinery').replace(/s$/i, '');
  const priceUsd = listPriceUSD(machine);
  const yearText = machineYearText(machine);
  const hrs = machineHours(machine);
  const usageText = hrs == null
    ? (machine.type === 'Trucks' ? 'km on request' : 'hours on request')
    : (machine.type === 'Trucks' ? `${hrs.toLocaleString('en-US')} km` : `${hrs.toLocaleString('en-US')} h`);
  const title = `${machine.name} (${machine.ref}) — ${label} from China | AR7 Traders`;
  const parts = [
    yearText,
    usageText,
    priceUsd > 0 ? `Indicative FOB US$${priceUsd.toLocaleString('en-US')}` : null,
    machine.origin ? `Sourced from ${machine.origin}` : null
  ].filter(Boolean);
  const description = `${parts.join(' · ')}. ${machine.summary || 'Inspected, photographed and shipped to your port by AR7 Traders.'}`;
  const photos = Array.isArray(machine.images) && machine.images.length
    ? machine.images.map(s => absUrl(s, FALLBACK_MCH_IMAGE))
    : (machine.image ? [absUrl(machine.image, FALLBACK_MCH_IMAGE)] : [FALLBACK_MCH_IMAGE]);
  const image = photos[0];
  const alt = `${machine.name} ${label.toLowerCase()} for export — ${machine.ref}`;
  const specs = Array.isArray(machine.specs) ? machine.specs : [];
  const typeUrl = BASE_URL + machineTypePath(machine.type || reqType);

  const productLd = {
    '@context': 'https://schema.org',
    '@type': 'Product',
    name: machine.name,
    sku: machine.ref,
    image: photos,
    description,
    brand: machine.brand ? { '@type': 'Brand', name: String(machine.brand) } : undefined,
    offers: priceUsd > 0 ? {
      '@type': 'Offer',
      url,
      priceCurrency: 'USD',
      price: priceUsd,
      availability: 'https://schema.org/PreOrder',
      seller: { '@type': 'Organization', name: 'AR7 Traders' }
    } : undefined
  };

  const bodyHtml =
    `<h1>${esc(machine.name)} — ${esc(label)} for export</h1>\n` +
    `<img src="${esc(image)}" alt="${esc(alt)}" width="820" height="560"/>\n` +
    '<ul>' + [
      `<li>Reference: ${esc(machine.ref)}</li>`,
      `<li>Category: ${esc(machine.type)}</li>`,
      machine.brand ? `<li>Brand: ${esc(machine.brand)}</li>` : '',
      `<li>Year: ${esc(yearText)}</li>`,
      `<li>Usage: ${esc(usageText)}</li>`,
      priceUsd > 0 ? `<li>Indicative FOB price: US$${priceUsd.toLocaleString('en-US')}</li>` : '',
      `<li>Sourcing origin: ${esc([machine.location, machine.origin].filter(Boolean).join(', ') || 'China')}</li>`,
      ...specs.map(([k, v]) => `<li>${esc(k)}: ${esc(v)}</li>`)
    ].filter(Boolean).join('') + '</ul>\n' +
    `<p>${esc(machine.summary || description)} Sourced to order from vetted Chinese suppliers with walkaround photos and export documentation handled.</p>\n` +
    `<p><a href="${esc(url)}">Open ${esc(machine.ref)} specification</a> · <a href="${esc(typeUrl)}">More ${esc(machine.type)}</a> · <a href="${esc(BASE_URL + '/machinery')}">Machinery desk</a> · <a href="${esc(BASE_URL + '/inventory')}">Cars from Japan</a></p>\n`;

  return renderDocument({
    title, description, url, image, alt, full, indexable: true,
    jsonLd: [
      productLd,
      breadcrumbJsonLd([
        ['Home', `${BASE_URL}/`],
        ['Machinery', `${BASE_URL}/machinery`],
        [machine.type, typeUrl],
        [machine.ref, url]
      ])
    ],
    bodyHtml
  });
}

export async function machineryHead(req, res, injected = {}) {
  if ((req.method || 'GET') !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendPlain(res, 405, 'Method not allowed');
  }
  const ref = String(req.query.machhead || '').trim().slice(0, 80);
  const type = String(req.query.machtype || '').trim().slice(0, 60);
  const full = String(req.query.render || '') === 'full';
  if (!ref) return sendHtml(res, 200, buildMachineryHeadHtml(null, { ref, type, full }));

  let machine = null;
  try {
    const db = injected.db || adminClient();
    const rows = await listMachines(db, { publishedOnly: true });
    machine = rows.find(m => String(m.ref || '').toUpperCase() === ref.toUpperCase()) || null;
  } catch (e) {
    console.error('machinery-head:', e?.message || e);
  }
  if (!machine) {
    const fallback = builtinCatalogueMachines();
    machine = fallback.find(m => String(m.ref || '').toUpperCase() === ref.toUpperCase()) || null;
  }
  if (machine && type) {
    const wantType = resolveType(type);
    if (wantType && String(machine.type || '').toLowerCase() !== wantType.toLowerCase()) {
      machine = null;
    }
  }
  return sendHtml(res, 200, buildMachineryHeadHtml(machine, { ref, type, full }));
}

// ---------------------------------------------------------------------------
// 2. /news/:slug — CRM / AI Growth articles + built-in fallback
// ---------------------------------------------------------------------------
export function buildNewsHeadHtml(article, opts = {}) {
  const full = !!opts.full;
  const slug = article ? (article.slug || articleSlug(article.title)) : String(opts.slug || '').trim();
  const url = article ? `${BASE_URL}/news/${encodeURIComponent(slug)}` : `${BASE_URL}/news`;

  if (!article) {
    const title = 'Export Guides & Market Notes | AR7 Traders';
    const description = 'Practical guides on Japanese car auction sheets, FOB vs CIF quotations, export certificates and global vehicle shipping from Japan & China.';
    return renderDocument({
      title, description, url, image: FALLBACK_NEWS_IMAGE,
      alt: 'AR7 Traders vehicle export insights and buying guides',
      full, indexable: false,
      jsonLd: [breadcrumbJsonLd([['Home', `${BASE_URL}/`], ['News & Guides', `${BASE_URL}/news`]])],
      bodyHtml:
        `<h1>${esc(title)}</h1>\n` +
        '<p>This article could not be found or is no longer published. Browse our latest export guides and market notes.</p>\n' +
        `<p><a href="${esc(BASE_URL + '/news')}">Browse all guides</a> · <a href="${esc(BASE_URL + '/inventory')}">Browse inventory</a> · <a href="${esc(BASE_URL + '/machinery')}">China machinery</a></p>\n`
    });
  }

  const title = `${article.title} | AR7 Traders`;
  const description = article.excerpt || article.ex || String(article.body || '').slice(0, 160);
  const image = absUrl(article.image || article.img, FALLBACK_NEWS_IMAGE);
  const alt = `${article.title} — AR7 Traders guide`;
  const category = article.category || article.cat || 'EXPORT GUIDE';
  const dateText = article.date || '';
  const readMin = Number(article.read_min || article.min) || 3;
  const paragraphs = String(article.body || '')
    .split(/\n{2,}/)
    .map(p => p.trim())
    .filter(Boolean);

  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: article.title,
    description,
    image: [image],
    articleSection: category,
    mainEntityOfPage: url,
    author: { '@type': 'Organization', name: 'AR7 Traders' },
    publisher: { '@type': 'Organization', name: 'AR7 Traders', url: `${BASE_URL}/` }
  };

  const bodyHtml =
    `<article>\n` +
    `<p>${esc(category)}${dateText ? ` · ${esc(dateText)}` : ''} · ${readMin} min read</p>\n` +
    `<h1>${esc(article.title)}</h1>\n` +
    `<img src="${esc(image)}" alt="${esc(alt)}" width="960" height="540"/>\n` +
    (article.excerpt || article.ex ? `<p><strong>${esc(article.excerpt || article.ex)}</strong></p>\n` : '') +
    paragraphs.map(p => `<p>${esc(p)}</p>\n`).join('') +
    `</article>\n` +
    `<p><a href="${esc(BASE_URL + '/news')}">All guides</a> · <a href="${esc(BASE_URL + '/inventory')}">Browse Japan inventory</a> · <a href="${esc(BASE_URL + '/machinery')}">Machinery export desk</a> · <a href="${esc(BASE_URL + '/contact')}">Contact AR7 Traders</a></p>\n`;

  return renderDocument({
    title, description, url, image, alt, ogType: 'article', full, indexable: true,
    jsonLd: [
      articleLd,
      breadcrumbJsonLd([
        ['Home', `${BASE_URL}/`],
        ['News & Guides', `${BASE_URL}/news`],
        [article.title, url]
      ])
    ],
    bodyHtml
  });
}

export async function newsHead(req, res, injected = {}) {
  if ((req.method || 'GET') !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendPlain(res, 405, 'Method not allowed');
  }
  const slug = String(req.query.newshead || '').trim().slice(0, 120);
  const full = String(req.query.render || '') === 'full';
  if (!slug) return sendHtml(res, 200, buildNewsHeadHtml(null, { slug, full }));

  let article = null;
  try {
    const db = injected.db || adminClient();
    const { data, error } = await db.from('site_articles')
      .select('id,title,category,date,read_min,image,excerpt,body,published')
      .eq('published', true).limit(500);
    if (!error && Array.isArray(data)) {
      article = data.find(r => articleSlug(r.title) === slug) || null;
    }
  } catch (e) {
    console.error('news-head:', e?.message || e);
  }
  if (!article) {
    article = NEWS.find(a => (a.slug || articleSlug(a.title)) === slug) || null;
  }
  return sendHtml(res, 200, buildNewsHeadHtml(article, { slug, full }));
}

// ---------------------------------------------------------------------------
// 3. /cars/:make and /cars/:make/:model — Dynamic brand/model landing pages
// ---------------------------------------------------------------------------
export function buildCarsLandingHeadHtml(cars = [], opts = {}) {
  const full = !!opts.full;
  const makeSlug = slugify(opts.make || '');
  const modelSlug = slugify(opts.model || '');
  const matches = (cars || []).filter(c => {
    if (!c || c.published === false) return false;
    if (c.status && UNAVAILABLE_STATUS.test(String(c.status))) return false;
    if (!makeSlug || slugify(c.make) !== makeSlug) return false;
    if (modelSlug && !(slugify(c.model) === modelSlug || slugify(c.model).startsWith(modelSlug + '-'))) return false;
    return true;
  });

  const makeName = matches[0]?.make || titleFromSlug(makeSlug) || 'Japanese Cars';
  const modelName = modelSlug ? (matches.find(c => slugify(c.model) === modelSlug)?.model || titleFromSlug(modelSlug)) : '';
  const headingSubject = modelName ? `${makeName} ${modelName}` : makeName;
  const canonicalPath = carLandingPath(makeName, modelName) || '/inventory';
  const url = BASE_URL + canonicalPath;

  const prices = matches.map(c => Number(c.price)).filter(n => Number.isFinite(n) && n > 0);
  const years = matches.map(c => Number(c.year)).filter(n => Number.isFinite(n) && n > 1970);
  const minP = prices.length ? Math.min(...prices) : null;
  const maxP = prices.length ? Math.max(...prices) : null;
  const minY = years.length ? Math.min(...years) : null;
  const maxY = years.length ? Math.max(...years) : null;

  const title = matches.length
    ? `${headingSubject} from Japan (${matches.length} available) — FOB prices & export | AR7 Traders`
    : `${headingSubject} export sourcing from Japan | AR7 Traders`;
  const pricePhrase = minP != null
    ? (minP === maxP ? `FOB from US$${minP.toLocaleString('en-US')}` : `FOB US$${minP.toLocaleString('en-US')}–US$${maxP.toLocaleString('en-US')}`)
    : 'transparent FOB & CIF quotes';
  const yearPhrase = minY != null ? (minY === maxY ? `${minY}` : `${minY}–${maxY}`) : 'verified auction & dealer';
  const description = matches.length
    ? `Browse ${matches.length} ${headingSubject} ${matches.length === 1 ? 'unit' : 'units'} (${yearPhrase}) ready for export from Japan — ${pricePhrase}. Inspection sheets and RoRo/container shipping arranged by AR7 Traders.`
    : `Request Japanese auction and showroom sourcing for ${headingSubject}. Inspected, documented and shipped to your port by AR7 Traders.`;

  const leadPhoto = matches.map(firstPhoto).find(Boolean);
  const image = absUrl(leadPhoto, FALLBACK_CAR_IMAGE);
  const alt = `${headingSubject} vehicles available for export from Japan — AR7 Traders`;

  const models = modelName ? [] : [...new Set(matches.map(c => c.model).filter(Boolean))].slice(0, 16);
  const itemListLd = matches.length ? {
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `${headingSubject} Export Stock`,
    url,
    description,
    mainEntity: {
      '@type': 'ItemList',
      numberOfItems: matches.length,
      itemListElement: matches.slice(0, 15).map((c, i) => ({
        '@type': 'ListItem',
        position: i + 1,
        url: BASE_URL + hrefFor('inventory', carRef(c)),
        name: [c.year, c.make, c.model].filter(Boolean).join(' ')
      }))
    }
  } : null;

  const crumbs = [
    ['Home', `${BASE_URL}/`],
    ['Inventory', `${BASE_URL}/inventory`],
    [makeName, BASE_URL + carLandingPath(makeName)]
  ];
  if (modelName) crumbs.push([modelName, url]);

  const bodyHtml =
    `<h1>${esc(headingSubject)} from Japan — export stock &amp; pricing</h1>\n` +
    `<p>${esc(description)}</p>\n` +
    (matches.length
      ? `<img src="${esc(image)}" alt="${esc(alt)}" width="820" height="550"/>\n<ul>` +
        matches.slice(0, 24).map(c => {
          const ref = carRef(c);
          const carUrl = BASE_URL + hrefFor('inventory', ref);
          const label = [c.year, c.make, c.model].filter(Boolean).join(' ');
          const meta = [
            c.km ? `${c.km} km` : null,
            c.fuel || null,
            c.tr || null,
            Number(c.price) > 0 ? `FOB US$${Number(c.price).toLocaleString('en-US')}` : null
          ].filter(Boolean).join(' · ');
          return `<li><a href="${esc(carUrl)}">${esc(label)}</a>${meta ? ` — ${esc(meta)}` : ''}</li>`;
        }).join('') + '</ul>\n'
      : '<p>No units of this exact model are currently on the live feed. Submit a custom sourcing request or browse all makes in stock.</p>\n') +
    (models.length
      ? '<p>Models: ' + models.map(m => `<a href="${esc(BASE_URL + carLandingPath(makeName, m))}">${esc(makeName)} ${esc(m)}</a>`).join(' · ') + '</p>\n'
      : '') +
    `<p><a href="${esc(BASE_URL + '/inventory')}">Full Japan inventory</a> · <a href="${esc(BASE_URL + '/brands')}">Explore brands</a> · <a href="${esc(BASE_URL + '/howbuy')}">How buying works</a> · <a href="${esc(BASE_URL + '/machinery')}">China machinery</a></p>\n`;

  return renderDocument({
    title, description, url, image, alt, full, indexable: matches.length > 0,
    jsonLd: [itemListLd, breadcrumbJsonLd(crumbs)],
    bodyHtml
  });
}

export async function carsLandingHead(req, res, injected = {}) {
  if ((req.method || 'GET') !== 'GET') {
    res.setHeader('Allow', 'GET');
    return sendPlain(res, 405, 'Method not allowed');
  }
  const make = String(req.query.carsmake || '').trim().slice(0, 60);
  const model = String(req.query.carsmodel || '').trim().slice(0, 80);
  const full = String(req.query.render || '') === 'full';
  if (!make) return sendHtml(res, 200, buildCarsLandingHeadHtml([], { make, model, full }));

  const cars = [];
  try {
    const db = injected.db || adminClient();
    const { data: listings } = await db.from('site_listings')
      .select('id,stock_no,make,model,year,km,fuel,tr,grade,price,image,images,status,published,sort_order')
      .eq('published', true).order('sort_order', { ascending: true }).limit(400);
    if (Array.isArray(listings)) cars.push(...listings);
    try {
      const { data: dealerRows } = await db.from('japan_dealer_stock')
        .select('*')
        .eq('available', true).order('imported_at', { ascending: false }).limit(PUBLIC_DEALER_LIMIT);
      if (Array.isArray(dealerRows)) cars.push(...mapDealerRows(dealerRows));
    } catch { /* dealer table optional in older fixtures */ }
  } catch (e) {
    console.error('cars-landing-head:', e?.message || e);
  }
  return sendHtml(res, 200, buildCarsLandingHeadHtml(cars, { make, model, full }));
}
