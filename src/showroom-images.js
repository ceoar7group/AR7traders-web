// Responsive versions of the curated showroom covers. The originals remain
// the canonical detail/gallery images; only small cards and hero slides use
// these widths. Unknown or remote images are left unchanged.
const WIDTHS = {
  'hero-01.webp': 1400, 'hero-02-v2.webp': 1400, 'hero-03.webp': 1400,
  'hero-04-v3.webp': 1400, 'hero-05.webp': 1400, 'hero-06-v3.webp': 1400,
  'hero-07.webp': 1400, 'hero-08-v2.webp': 1376, 'hero-09-v2.webp': 1400,
  'hero-10-v3.webp': 1400, 'hero-11.webp': 1400, 'hero-12-v2.webp': 1400,
  'hero-13-v2.webp': 1348, 'hero-14-v3.webp': 1400, 'hero-15-v2.webp': 1400,
  'hero-16-v4.webp': 1400, 'hero-17-v3.webp': 1400, 'hero-18.webp': 1400
};
export function showroomSrcSet(src) {
  const match = /^\/assets\/showroom\/(hero-[\w-]+\.webp)$/.exec(String(src || ''));
  const width = match && WIDTHS[match[1]];
  if (!width) return undefined;
  const base = src.slice(0, -5);
  return `${base}-560.webp 560w, ${base}-760.webp 760w, ${src} ${width}w`;
}
export const SHOWROOM_CARD_SIZES = '(max-width: 560px) 88vw, (max-width: 900px) 44vw, 32vw';
export const SHOWROOM_HERO_SIZES = '(max-width:900px) 80vw, 36vw';
