// Single source of truth for which columns the API layer may write.
//
// Four files used to keep their own copy of these lists (api/crm.js,
// api/site-content.js, api/goonet-stock.js and — unfiltered — api/approvals.js).
// Keeping them here means an approval request cannot write a column that the
// matching CRUD endpoint would refuse, and a column added in one place cannot
// silently go missing in another.
//
// Files named api/_*.js are shared modules, not Serverless Functions, so this
// does not count against the Vercel Hobby 12-function cap
// (see scripts/function-count.test.mjs).

export const CRM_COLUMNS = {
  leads:      ['name','email','phone','country','vehicle_interest','source','status','budget','assigned_to','next_follow_up'],
  customers:  ['name','email','phone','country','status','total_spend','vehicles_bought','notes'],
  vehicles:   ['stock_no','make','model','year','price','status','location','steering','colour','interior','image','images','gallery','notes','vendor','cost_price','freight_cost','duty_cost','other_cost','sourcing_currency'],
  quotes:     ['quote_no','customer_name','vehicle','amount','status','valid_until','notes'],
  shipments:  ['tracking_no','customer_name','vehicle','origin','destination','vessel','status','eta','progress','notes'],
  tasks:      ['title','owner','priority','status','due_date','notes']
};

export const SITE_COLUMNS = {
  listings: ['stock_no','make','model','year','km','fuel','body','price','image','images','gallery','grade','status','location','tr','drv','eng','seats','col','st','published','sort_order'],
  routes:   ['country','port','transit','popular','freight_base','duty_pct','lon','lat','show_on_map','published','sort_order'],
  articles: ['title','category','date','read_min','image','excerpt','body','published','sort_order'],
  blocks:   ['key','label','value','page']
};

export const GOONET_COLUMNS = [
  'goonet_id','stock_no','make','model','year','km','fuel','body',
  'price_jpy','price_usd','price','image','images','grade','status',
  'location','tr','drv','eng','seats','col','st','vendor',
  'goonet_url','photo_count','quality_score','available','promoted'
];

/** Table name -> writable columns, for anything an approval may act on.
 *  Keyed by the physical table so it can be looked up straight from
 *  approval_requests.entity_type. */
export const TABLE_COLUMNS = {
  leads:         CRM_COLUMNS.leads,
  customers:     CRM_COLUMNS.customers,
  vehicles:      CRM_COLUMNS.vehicles,
  quotes:        CRM_COLUMNS.quotes,
  shipments:     CRM_COLUMNS.shipments,
  tasks:         CRM_COLUMNS.tasks,
  site_listings: SITE_COLUMNS.listings,
  site_routes:   SITE_COLUMNS.routes,
  site_articles: SITE_COLUMNS.articles
};

/** Keep only the keys the table is allowed to receive. */
export function pickColumns(table, payload) {
  const cols = TABLE_COLUMNS[table] || [];
  const out = {};
  for (const k of cols) if (k in (payload || {})) out[k] = payload[k];
  return out;
}
