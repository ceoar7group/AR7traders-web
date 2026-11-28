// Where an article's generated cover lives. Browser-safe (no sharp, no Node
// built-ins) so the head builder, the news cards and the API endpoint can all
// agree on one URL — the same rule the share cards follow in src/share-card.js.
//
// The image itself is composed server-side by api/_article-image.js: free,
// deterministic, one distinct cover per article.

export const ARTICLE_COVER_SIZE = { width: 1200, height: 630 };

/** `/api/cover/<slug>` — rewritten to api/site-content.js in vercel.json. */
export function articleCoverPath(slug) {
  const clean = String(slug ?? '').trim();
  return `/api/cover/${encodeURIComponent(clean)}`;
}

export function articleCoverUrl(base, slug) {
  return String(base || '').replace(/\/+$/, '') + articleCoverPath(slug);
}

/** True when a stored image URL is already a generated cover (so a lookup must
 *  not treat it as the source photograph). */
export const isCoverPath = value => /^\/api\/cover\//.test(String(value || ''));
