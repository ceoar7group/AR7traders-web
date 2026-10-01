// Public buyer guides & market notes (/news and /news/<slug>).
//
// Slugs are derived deterministically from the article title, capped at 90
// characters on whole-word boundaries so URLs stay readable and never end
// mid-word.

export const MAX_SLUG_LENGTH = 90;

export function articleSlug(input) {
  const raw = typeof input === 'object' && input !== null
    ? (input.title || input.slug || '')
    : String(input || '');
  const words = String(raw)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .split('-')
    .filter(Boolean);
  if (!words.length) return '';
  let out = '';
  for (const w of words) {
    const next = out ? `${out}-${w}` : w;
    if (next.length > MAX_SLUG_LENGTH) {
      if (!out) return w.slice(0, MAX_SLUG_LENGTH);
      break;
    }
    out = next;
  }
  return out;
}

const RAW_NEWS = [
  {
    cat: 'MARKET WATCH',
    date: 'Aug 18, 2026',
    min: 4,
    img: '/assets/japanese-car-auction-inspection-shipping-3.webp',
    title: 'Why Land Cruiser demand keeps climbing in Pakistan',
    ex: 'Auction prices, popular grades and what a realistic budget looks like this quarter.',
    body: 'KARACHI — Demand for the Land Cruiser family continues to outpace supply at Japanese auction houses. Grade 4.5 and above units attract strong bidding at USS Tokyo sessions, and clean 2020–2022 examples have been holding value well.\n\nFor buyers, our advice: set your maximum bid before the session, avoid pre-bid locking on high-demand lots, and ask our team to pull the auction sheet translation before you commit.\n\nIf you are targeting the Land Cruiser family for Pakistan, ask our team for a current budget view before you set your maximum bid.'
  },
  {
    cat: 'BUYING GUIDE',
    date: 'Aug 11, 2026',
    min: 5,
    img: '/assets/japanese-car-auction-inspection-shipping-1.webp',
    title: 'Auction sheet decoded: what R, A and 4.5 really mean',
    ex: 'Every mark on a Japanese auction sheet explained simply — so you bid with confidence.',
    body: 'A Japanese auction sheet is a condition report written in a shorthand of its own. Grades run from S (near-new) down through 4.5, 4.0, 3.5. Subjective marks like A (minor wear), B (scratches) and the dreaded R (repair history) appear next to each panel.\n\nFor auction-sourced lots, AR7 translates the inspector sheet into plain English and flags anything our inspection team wants verified by photo before you bid. Dealer-stock vehicles are reviewed from the dealer inspection notes and yard photographs.\n\nRule of thumb: for export, aim for grade 4.0+, no R marks on structure, and always ask for underbody photos on diesel 4WD models.'
  },
  {
    cat: 'LOGISTICS',
    date: 'Aug 04, 2026',
    min: 3,
    img: '/assets/japanese-car-auction-inspection-shipping-5.webp',
    title: 'RoRo vs container: which shipping method fits your car?',
    ex: 'Costs, protection and loading windows for both methods — with demo numbers.',
    body: 'RoRo (roll-on, roll-off) is the most economical way to move a drivable car between continents, with your vehicle secured on an enclosed car-carrier deck. Container shipping adds an estimated $1,800–$2,500 on Japan–Karachi routes (a planning estimate that varies by carrier and schedule) and gives you a sealed hold.\n\nWe generally recommend RoRo for standard stock under $45,000 and containers for high-value, low-ground-clearance or multi-car orders.\n\nEvery AR7 shipment includes marine transit insurance at an estimated 1.6% of vehicle value, whether RoRo or container.'
  },
  {
    cat: 'AUCTION',
    date: 'Jul 28, 2026',
    min: 4,
    img: '/assets/japanese-car-auction-inspection-shipping-2.webp',
    title: 'How online bidding works with AR7',
    ex: 'Deposits, bid limits, translations and the exact flow from your screen to the auction floor.',
    body: '1) Place a refundable bidding deposit (for example, $500 as a typical starting estimate). 2) Browse lots with our team, pick your target and set a hard maximum. 3) We bid live at the auction house on your behalf — you watch status in the portal. 4) Win or lose, you see the result after the lot closes.\n\nAfter a win, we issue an itemized proforma invoice, arrange payment, inspect and photograph the vehicle at the Japan export yard, then book your vessel.\n\nAuction hammer prices are in Japanese yen excluding freight; our calculator estimates your CIF cost to your port before you confirm.'
  }
];

export const NEWS = RAW_NEWS.map(a => ({ ...a, slug: articleSlug(a.title) }));

export const NEWS_CATEGORIES = [...new Set(NEWS.map(a => a.cat))];

export function articleBySlug(slug, list = NEWS) {
  if (slug == null || slug === '') return null;
  let decoded = String(slug).trim();
  try { decoded = decodeURIComponent(decoded); } catch { /* keep raw */ }
  const norm = articleSlug(decoded);
  if (!norm) return null;
  return (list || []).find(a => a && (a.slug === norm || articleSlug(a) === norm)) || null;
}

export function articleSeo(article) {
  if (!article || !article.title) return null;
  const slug = article.slug || articleSlug(article.title);
  const rawDesc = String(article.excerpt || article.ex || article.body || '').trim();
  const description = rawDesc.length > 160 ? rawDesc.slice(0, 157).trimEnd() + '…' : rawDesc;
  return {
    title: `${article.title} | AR7 Traders`,
    description,
    canonicalPath: `/news/${encodeURIComponent(slug)}`,
    ogImage: article.img || '/assets/og/auction.jpg',
    ogType: 'article'
  };
}
