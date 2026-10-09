// Human-reviewed publishing queue; never invent an article or auto-publish it.
export const GUIDE_TOPICS = [
  ['Before bidding: checking Australian vehicle import eligibility', '/destinations', 'Confirm the applicable approval pathway with the Australian transport authority and buyer’s compliance specialist before purchase.'],
  ['Importing a Japanese car to the USA: eligibility before shipping', '/destinations', 'Verify federal safety, emissions and state registration requirements independently; do not promise every Japanese vehicle is eligible.'],
  ['A buyer’s checklist for Japanese export documents', '/howbuy', 'Explain invoice, export certificate and Bill of Lading checks; link to the destination-specific document pack.'],
  ['How to compare FOB and CIF quotations', '/shipping', 'Separate vehicle cost, freight, insurance and destination charges without presenting demo estimates as a binding quote.']
];
export function editorialPlan(date = new Date(), count = 2) {
  const month = date.toISOString().slice(0, 7);
  const n = Math.max(2, Math.min(4, Math.floor(Number(count) || 2)));
  return GUIDE_TOPICS.slice(0, n).map(([title, target, brief], i) => ({
    id: `${month}-guide-${i + 1}`, due: `${month}-${String(7 + i * 7).padStart(2, '0')}`,
    title, target, brief, status: 'review-required'
  }));
}
