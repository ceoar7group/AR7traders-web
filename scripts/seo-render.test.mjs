// Smoke test for the SEO head manager (src/seo.js): per-page title/description/
// canonical, noindex on staff pages, BreadcrumbList and the Car/Offer JSON-LD
// that powers vehicle rich results. Also covers vehicle-specific metadata,
// missing-vehicle behaviour, FAQ scoping and sitemap consistency. Run:
//   npm run test:seo
import { JSDOM } from 'jsdom';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const dir = path.dirname(fileURLToPath(import.meta.url));

const dom = new JSDOM(
  '<!doctype html><html><head><title>old</title></head><body></body></html>',
  { url: 'https://ar7traders.com/' }
);
globalThis.window = dom.window;
globalThis.document = dom.window.document;

const { applySeo, PAGE_SEO, FAQ_ITEMS } = await import('../src/seo.js');

let failed = 0;
const ok = (cond, msg) => { if (!cond) { failed++; console.error('FAIL:', msg); } else console.log('ok  :', msg); };

const meta = (sel) => document.head.querySelector(sel)?.getAttribute('content');
const jsonld = (id) => {
  const el = document.getElementById(id);
  return el ? JSON.parse(el.textContent) : null;
};

// ---- home -----------------------------------------------------------------
applySeo('home', null);
ok(document.title.includes('Japanese Car Exporter'), 'home title is the exporter headline');
ok(meta('meta[name="description"]')?.includes('Auction-sourced'), 'home description meta is set');
ok(!meta('meta[name="description"]')?.includes('35+'), 'home description no longer claims 35+ countries');
ok(document.head.querySelector('link[rel="canonical"]')?.href === 'https://ar7traders.com/', 'home canonical is the root URL');
ok(meta('meta[name="robots"]')?.startsWith('index,follow'), 'home is indexable');
let bc = jsonld('breadcrumb-jsonld');
ok(bc?.['@type'] === 'BreadcrumbList', 'BreadcrumbList is injected');
ok(bc?.itemListElement.length === 1 && bc.itemListElement[0].name === 'Home', 'home breadcrumb has just Home');
ok(jsonld('vehicle-jsonld') === null, 'no Car JSON-LD on the home page');
ok(jsonld('faq-jsonld') === null, 'no FAQPage JSON-LD on the home page');

// ---- inner page -----------------------------------------------------------
applySeo('contact', null);
ok(document.title.includes('Contact AR7 Traders'), 'contact title is per-page');
ok(document.head.querySelector('link[rel="canonical"]')?.href === 'https://ar7traders.com/contact', 'contact canonical is /contact');
bc = jsonld('breadcrumb-jsonld');
ok(bc?.itemListElement.length === 2 && bc.itemListElement[1].name === 'Contact', 'contact breadcrumb is Home → Contact');

// ---- shipping has its own metadata (was falling back to home) -------------
applySeo('shipping', null);
ok(PAGE_SEO.shipping, 'PAGE_SEO has a shipping entry');
ok(document.title === PAGE_SEO.shipping[0] && document.title.includes('Vehicle Shipping from Japan'),
  'shipping title is unique, not the homepage fallback');
ok(meta('meta[name="description"]') === PAGE_SEO.shipping[1], 'shipping description is its own');
ok(meta('meta[property="og:title"]') === PAGE_SEO.shipping[0] && meta('meta[name="twitter:title"]') === PAGE_SEO.shipping[0],
  'shipping OG/Twitter titles match the page title');
ok(document.head.querySelector('link[rel="canonical"]')?.href === 'https://ar7traders.com/shipping', 'shipping canonical is /shipping');

// ---- FAQ markup is scoped to /faq -----------------------------------------
applySeo('faq', null);
let faq = jsonld('faq-jsonld');
ok(faq?.['@type'] === 'FAQPage', 'FAQPage JSON-LD is injected on /faq');
ok(Array.isArray(faq?.mainEntity) && faq.mainEntity.length === FAQ_ITEMS.length, 'FAQ markup covers the rendered questions');
applySeo('contact', null);
ok(jsonld('faq-jsonld') === null, 'FAQPage JSON-LD is removed when leaving /faq');

// ---- vehicle detail page with car data ------------------------------------
const car43 = {
  id: 43, make: 'Toyota', model: 'Harrier S', year: 2023,
  km: '24,204', fuel: 'Petrol', tr: 'AT', eng: '2,000cc', seats: 5,
  price: '$21,000', image: '/assets/inventory/700071023230260801001.jpg'
};
applySeo('inventory', '43', car43);
ok(document.title.includes('2023 Toyota Harrier S'), 'vehicle title names the car');
ok(!document.title.includes('Japanese Cars for Export'), 'vehicle title is not the listing-level default');
ok(document.title.includes('Stock 43'), 'vehicle title carries the stock reference');
ok(document.title.endsWith('AR7 Traders'), 'vehicle title ends with the brand');
ok(meta('meta[name="description"]')?.includes('24,204 km'), 'vehicle description includes mileage');
ok(meta('meta[name="description"]')?.includes('$21,000'), 'vehicle description includes the published price');
ok(meta('meta[property="og:title"]') === document.title && meta('meta[property="og:description"]') === meta('meta[name="description"]'),
  'vehicle OG tags match the page title/description');
ok(meta('meta[name="twitter:title"]') === document.title, 'vehicle Twitter title matches');
ok(document.head.querySelector('link[rel="canonical"]')?.href === 'https://ar7traders.com/inventory/43', 'vehicle canonical includes the stock ref');
const v = jsonld('vehicle-jsonld');
ok(v?.['@type'] === 'Car', 'Car JSON-LD is injected on the detail page');
ok(v?.name === '2023 Toyota Harrier S', 'Car name is year + make + model');
ok(v?.brand?.name === 'Toyota' && v?.model === 'Harrier S', 'Car carries brand and model');
ok(v?.vehicleTransmission === 'Automatic transmission', 'AT maps to schema transmission');
ok(v?.fuelType === 'Gasoline', 'Petrol maps to Gasoline');
ok(v?.mileageFromOdometer?.value === 24204 && v.mileageFromOdometer.unitCode === 'KMT', 'odometer is numeric km');
ok(v?.vehicleEngine?.engineDisplacement?.value === 2000, 'engine displacement is parsed from "2,000cc"');
ok(v?.offers?.price === '21000' && v.offers.priceCurrency === 'USD', 'offer price is numeric USD for a $ string');
ok(v?.offers?.availability === 'https://schema.org/InStock', 'in-stock status maps to InStock');
ok(v?.offers?.url === 'https://ar7traders.com/inventory/43', 'offer points at the vehicle URL');
ok(v?.image === 'https://ar7traders.com/assets/inventory/700071023230260801001.jpg', 'image is made absolute');
bc = jsonld('breadcrumb-jsonld');
ok(bc?.itemListElement[1]?.name === '2023 Toyota Harrier S', 'breadcrumb names the car on the detail page');

// ---- async arrival: the same route re-applies once the car data lands -----
applySeo('inventory', '43');           // before the data arrives: listing-level SEO
ok(document.title.includes('Japanese Cars for Export'), 'loading vehicle keeps honest listing metadata');
ok(jsonld('vehicle-jsonld') === null, 'no Car JSON-LD before the vehicle data arrives');
applySeo('inventory', '43', car43);    // data lands
ok(document.title.includes('2023 Toyota Harrier S'), 'late vehicle data updates the title');
ok(jsonld('vehicle-jsonld')?.name === '2023 Toyota Harrier S', 'late vehicle data injects the Car JSON-LD');

// ---- statuses, currencies, missing fields ---------------------------------
{
  applySeo('inventory', '43', { ...car43, status: 'Sold' });
  ok(jsonld('vehicle-jsonld')?.offers?.availability === 'https://schema.org/SoldOut', 'sold status maps to SoldOut');
  applySeo('inventory', '43', { ...car43, status: 'Auction' });
  let av = jsonld('vehicle-jsonld');
  ok(av?.offers && !('availability' in av.offers), 'auction status keeps the offer but omits availability');
  applySeo('inventory', '43', { ...car43, status: 'Reserved' });
  ok(jsonld('vehicle-jsonld')?.offers?.availability === 'https://schema.org/InStock', 'reserved status maps to InStock');
  applySeo('inventory', '43', { ...car43, price: '\u00a52,980,000' });
  let jp = jsonld('vehicle-jsonld');
  ok(jp?.offers?.price === '2980000' && jp.offers.priceCurrency === 'JPY', '\u00a5 price keeps JPY currency');
}
// Missing / zero / non-numeric prices → no offer (never a false price).
for (const price of [null, '', 0, 'POA', 'Price on request']) {
  applySeo('inventory', '43', { ...car43, price });
  const o = jsonld('vehicle-jsonld');
  ok(o && !('offers' in o), `price ${JSON.stringify(price)} omits the offer instead of publishing a false one`);
}
// Missing image → the image key is omitted entirely (never BASE + undefined).
applySeo('inventory', '43', { ...car43, image: null });
const noImg = jsonld('vehicle-jsonld');
ok(noImg && !('image' in noImg), 'missing image omits the image field (no /undefined URL)');
ok(!JSON.stringify(noImg).includes('undefined'), 'no "undefined" leaks anywhere in the vehicle JSON-LD');
// Demo record with formatted units but no price.
applySeo('inventory', 'demo-1', { make: 'Nissan', model: 'Note', year: 2018, km: '138,000', eng: '1,200cc' });
const demo = jsonld('vehicle-jsonld');
ok(demo?.mileageFromOdometer?.value === 138000 && demo.vehicleEngine?.engineDisplacement?.value === 1200,
  'formatted units (138,000 km / 1,200cc) still parse');
ok(!('offers' in demo), 'demo record without a price publishes no offer');

// ---- confirmed-missing vehicle: honest metadata, noindex -------------------
applySeo('inventory', 'gone-ref', null, { vehicleMissing: true });
ok(document.title.includes('no longer listed'), 'missing vehicle gets an honest title');
ok(meta('meta[name="robots"]') === 'noindex,nofollow', 'missing vehicle is noindex');
ok(jsonld('vehicle-jsonld') === null, 'missing vehicle publishes no Car JSON-LD');
applySeo('inventory', 'gone-ref', null); // still loading (not confirmed missing)
ok(meta('meta[name="robots"]')?.startsWith('index,follow'), 'a vehicle that is merely loading stays indexable');

// ---- leaving the detail page removes the Car block ------------------------
applySeo('inventory', null);
ok(jsonld('vehicle-jsonld') === null, 'Car JSON-LD is removed when leaving the detail page');
bc = jsonld('breadcrumb-jsonld');
ok(bc?.itemListElement[1]?.name === 'Vehicle Inventory', 'inventory breadcrumb uses the page label');

// ---- staff pages stay noindex ---------------------------------------------
for (const page of ['crm', 'account', 'portal', 'studio']) {
  applySeo(page, null);
  ok(meta('meta[name="robots"]') === 'noindex,nofollow', `${page} is noindex,nofollow`);
  ok(jsonld('vehicle-jsonld') === null, `no stray Car JSON-LD on ${page}`);
}

// ---- sitemap consistency ----------------------------------------------------
{
  const xml = readFileSync(path.join(dir, '..', 'public', 'sitemap.xml'), 'utf8');
  const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m => m[1]);
  ok(locs.length === 16, `sitemap lists 16 URLs (found ${locs.length})`);
  ok(locs.includes('https://ar7traders.com/shipping'), 'sitemap includes /shipping');
  for (const staff of ['/crm', '/account', '/portal', '/studio']) {
    ok(!locs.some(l => l.includes(staff)), `sitemap has no staff route ${staff}`);
  }
  const { PAGES } = await import('../src/routing.js');
  for (const l of locs) {
    const p = new URL(l).pathname.replace(/^\//, '').split('/')[0] || 'home';
    ok(PAGES.has(p), `sitemap path /${p} is a real route`);
  }
  // Every indexable public page in PAGE_SEO that the sitemap can represent is
  // present (vehicle detail URLs are dynamic and intentionally excluded).
  const sitemapPages = locs.map(l => new URL(l).pathname.replace(/^\//, '').split('/')[0] || 'home');
  for (const p of ['home', 'inventory', 'auction', 'services', 'brands', 'destinations', 'tools',
    'world', 'howbuy', 'news', 'about', 'reviews', 'faq', 'contact', 'shipping', 'japan-stock']) {
    ok(sitemapPages.includes(p), `sitemap covers /${p === 'home' ? p : p}`);
  }
}

// ---- static shell: homepage business graph only, no sitewide FAQ ----------
{
  const html = readFileSync(path.join(dir, '..', 'index.html'), 'utf8');
  const m = html.match(/<script type="application\/ld\+json" id="business-jsonld">([\s\S]*?)<\/script>/);
  ok(!!m, 'static business JSON-LD is present and addressable');
  const graph = JSON.parse(m[1])['@graph'].map(n => n['@type']);
  ok(graph.includes('AutoDealer') && graph.includes('WebSite'), 'static graph keeps AutoDealer + WebSite');
  ok(!graph.includes('FAQPage'), 'static graph no longer ships FAQPage on every route');
  ok(!html.includes('35+ countries'), 'static shell no longer claims 35+ countries');
}

console.log(failed ? `\n${failed} FAILURES` : '\nALL PASS');
process.exit(failed ? 1 : 0);
