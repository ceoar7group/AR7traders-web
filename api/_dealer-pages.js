// One deterministic ordering and page size for all public dealer-stock reads.
// UUID id is the unique tie-breaker because imports commonly share a timestamp.
// Ranged requests do not form a transactional snapshot: a sync while paging can
// still shift rows between requests. A cursor/snapshot-backed catalogue is the
// next scaling step; this keeps each response bounded without changing the CRM.
import {DEALER_PAGE_SIZE, DEALER_MAX_PAGES} from '../src/japan-stock-map.js';
export {DEALER_PAGE_SIZE, DEALER_MAX_PAGES};

export async function readDealerPage(db, page) {
  const start = page * DEALER_PAGE_SIZE;
  const {data, error} = await db.from('japan_dealer_stock').select('*')
    .eq('available', true)
    .order('imported_at', {ascending:false})
    .order('id', {ascending:false})
    .range(start, start + DEALER_PAGE_SIZE - 1);
  if (error) throw new Error(error.message || 'dealer stock read failed');
  return data || [];
}

// Sitemap and landing pages must not silently publish an incomplete snapshot.
export async function readAllDealerPages(db) {
  const rows = [];
  for (let page = 0; page <= DEALER_MAX_PAGES; page++) {
    const batch = await readDealerPage(db, page);
    if (page === DEALER_MAX_PAGES && batch.length) throw new Error('dealer stock exceeds supported pagination limit');
    rows.push(...batch);
    if (batch.length < DEALER_PAGE_SIZE) return rows;
  }
  return rows;
}
