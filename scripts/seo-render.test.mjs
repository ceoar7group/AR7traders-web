// Smoke test for the SEO head manager (src/seo.js): per-page title/description/
// canonical, noindex on staff pages, BreadcrumbList and the Car/Offer JSON-LD
// that powers vehicle rich results. Run:
//   npm run test:seo
import { JSDOM } from 'jsdom';

const dom = new JSDOM(
  '<!doctype html><html><head><title>old</title></head><body></body></html>',
  { url: 'https://ar7traders.com/' }
);
globalThis.window = dom.window;
globalThis.document = dom.window.document;

const { applySeo } = await import('../src/seo.js');

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
ok(document.head.querySelector('link[rel="canonical"]')?.href === 'https://ar7traders.com/', 'home canonical is the root URL');
ok(meta('meta[name="robots"]')?.startsWith('index,follow'), 'home is indexable');
let bc = jsonld('breadcrumb-jsonld');
ok(bc?.['@type'] === 'BreadcrumbList', 'BreadcrumbList is injected');
ok(bc?.itemListElement.length === 1 && bc.itemListElement[0].name === 'Home', 'home breadcrumb has just Home');
ok(jsonld('vehicle-jsonld') === null, 'no Car JSON-LD on the home page');

// ---- inner page -----------------------------------------------------------
applySeo('contact', null);
ok(document.title.includes('Contact AR7 Traders'), 'contact title is per-page');
ok(document.head.querySelector('link[rel="canonical"]')?.href === 'https://ar7traders.com/contact', 'contact canonical is /contact');
bc = jsonld('breadcrumb-jsonld');
ok(bc?.itemListElement.length === 2 && bc.itemListElement[1].name === 'Contact', 'contact breadcrumb is Home → Contact');

// ---- vehicle detail page with car data ------------------------------------
const car43 = {
  id: 43, make: 'Toyota', model: 'Harrier S', year: 2023,
  km: '24,204', fuel: 'Petrol', tr: 'AT', eng: '2,000cc', seats: 5,
  price: '$21,000', image: '/assets/inventory/700071023230260801001.jpg'
};
applySeo('inventory', '43', car43);
ok(document.head.querySelector('link[rel="canonical"]')?.href === 'https://ar7traders.com/inventory/43', 'vehicle canonical includes the stock ref');
const v = jsonld('vehicle-jsonld');
ok(v?.['@type'] === 'Car', 'Car JSON-LD is injected on the detail page');
ok(v?.name === '2023 Toyota Harrier S', 'Car name is year + make + model');
ok(v?.brand?.name === 'Toyota' && v?.model === 'Harrier S', 'Car carries brand and model');
ok(v?.vehicleTransmission === 'Automatic transmission', 'AT maps to schema transmission');
ok(v?.fuelType === 'Gasoline', 'Petrol maps to Gasoline');
ok(v?.mileageFromOdometer?.value === 24204 && v.mileageFromOdometer.unitCode === 'KMT', 'odometer is numeric km');
ok(v?.vehicleEngine?.engineDisplacement?.value === 2000, 'engine displacement is parsed from "2,000cc"');
ok(v?.offers?.price === '21000' && v.offers.priceCurrency === 'USD', 'offer price is numeric USD');
ok(v?.offers?.url === 'https://ar7traders.com/inventory/43', 'offer points at the vehicle URL');
ok(v?.image === 'https://ar7traders.com/assets/inventory/700071023230260801001.jpg', 'image is made absolute');
bc = jsonld('breadcrumb-jsonld');
ok(bc?.itemListElement[1]?.name === '2023 Toyota Harrier S', 'breadcrumb names the car on the detail page');

// ---- leaving the detail page removes the Car block ------------------------
applySeo('inventory', null);
ok(jsonld('vehicle-jsonld') === null, 'Car JSON-LD is removed when leaving the detail page');
bc = jsonld('breadcrumb-jsonld');
ok(bc?.itemListElement[1]?.name === 'Vehicle Inventory', 'inventory breadcrumb uses the page label');

// ---- staff pages stay noindex ---------------------------------------------
applySeo('crm', null);
ok(meta('meta[name="robots"]') === 'noindex,nofollow', 'crm is noindex,nofollow');
ok(jsonld('vehicle-jsonld') === null, 'no stray Car JSON-LD on crm');

console.log(failed ? `\n${failed} FAILURES` : '\nALL PASS');
process.exit(failed ? 1 : 0);
