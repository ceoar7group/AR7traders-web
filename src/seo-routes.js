// Canonical route examples shared by the offline SEO agent and the staff desk.
// Whole-site crawl targets are discovered from robots.txt and sitemap XML; this
// list is for route-shaped local audits and human-readable navigation only.
import { PAGE_SEO, MACHINERY_SEO, BASE } from './seo.js';
import { NEWS, articleSlug } from './news-data.js';
import { STAFF_NOINDEX_PATHS } from './seo-url.js';

const STAFF_PAGES = new Set(STAFF_NOINDEX_PATHS.map(path => path.slice(1)));

export function staticAuditRoutes() {
  const pages = Object.keys(PAGE_SEO).filter(page => page !== 'inventory');
  const routes = pages.map(page => ({
    page,
    url: BASE + (page === 'home' ? '/' : '/' + page),
    label: page,
    indexable: !STAFF_PAGES.has(page)
  }));
  routes.push({page: 'inventory', url: BASE + '/inventory', label: 'inventory'});
  // Route shapes only — omit made-up stock counts. The live crawl gets the
  // current make/model URLs from the vehicle sitemap.
  routes.push({page: 'inventory', url: BASE + '/cars/toyota', label: 'cars/toyota', seo: {make: 'Toyota', vehicleCount: null}});
  routes.push({page: 'inventory', url: BASE + '/cars/toyota/land-cruiser', label: 'cars/toyota/land-cruiser', seo: {make: 'Toyota', model: 'land cruiser', vehicleCount: null}});
  for (const type of Object.keys(MACHINERY_SEO)) {
    routes.push({page: 'machinery', url: BASE + '/machinery/' + type, label: 'machinery/' + type, seo: {machineType: type}});
  }
  if (NEWS[0]) {
    const slug = articleSlug(NEWS[0]);
    routes.push({page: 'news', url: BASE + '/news/' + slug, label: 'news/' + slug, seo: {}, carId: slug});
  }
  return routes;
}

export function publicLandingRoutes() {
  return staticAuditRoutes().filter(route => route.indexable !== false);
}
