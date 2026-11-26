// Where a vehicle's share card lives, and how big it is.
//
// Kept in its own tiny module because both sides of the site need it and they
// must never disagree:
//   • api/_og-card.js renders the image (Node only — it needs sharp);
//   • src/seo.js stamps og:image / og:image:width / og:image:height in the
//     browser and at build time (must stay free of Node-only imports).
//
// The URL is rewritten in vercel.json from /api/og/<ref> to the existing
// site-content function, so the card costs no extra Serverless Function.
export const SHARE_CARD = { width: 1200, height: 630, type: 'image/jpeg' };

/** Path of the card for one listing reference (stock no, or the row id). */
export const shareCardPath = ref =>
  `/api/og/${encodeURIComponent(String(ref ?? '').trim())}`;

/** Absolute card URL for og:image / twitter:image. */
export const shareCardUrl = (base, ref) => base + shareCardPath(ref);

/** Machinery cards: /api/og/m/<ref> — the `m/` segment keeps the two
 *  catalogues from ever resolving each other's references. */
export const machineCardPath = ref =>
  `/api/og/m/${encodeURIComponent(String(ref ?? '').trim())}`;

export const machineCardUrl = (base, ref) => base + machineCardPath(ref);
