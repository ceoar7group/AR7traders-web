import { DEALER_PAGE_SIZE, DEALER_MAX_PAGES } from './japan-stock-map.js';

// Never replace the catalogue with a silently truncated multi-page response.
export async function fetchDealerStock(fetcher = fetch) {
  const all = [];
  for (let page = 0; page <= DEALER_MAX_PAGES; page++) {
    const response = await fetcher('/api/goonet-stock?page=' + page);
    if (!response.ok) throw new Error('Japan stock page unavailable');
    const batch = await response.json();
    if (!Array.isArray(batch)) throw new Error('Invalid Japan stock page');
    if (page === DEALER_MAX_PAGES && batch.length) throw new Error('Japan stock pagination limit reached');
    all.push(...batch);
    if (batch.length < DEALER_PAGE_SIZE) return all;
  }
  return all;
}
