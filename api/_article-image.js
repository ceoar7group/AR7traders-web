// A generated cover image for EVERY article — no stock photo, no paid API.
//
// 2026-11-25 (owner: "add an AI that generates a separate image for each
// article … i need free"). Three options were on the table:
//
//   • paid generators (DALL·E, Midjourney, Stable Diffusion endpoints) — the
//     owner said free, so no;
//   • a free public diffusion API (Pollinations) — genuinely free and keyless,
//     but it is somebody else's queue: a 6-second render at article-creation
//     time and an occasional 502 are normal, and an article must never publish
//     with a broken image;
//   • compose the cover ourselves with sharp + SVG, which this repository
//     already ships for the share cards — instant, deterministic, no quota, no
//     key, and it never fails a page.
//
// This module does the third, and *generates* rather than reuses: the colour
// scheme, the geometry and the typography are all derived from a hash of the
// article's own slug, so every article gets a visibly different cover and the
// same article always gets the same one (a regenerate never changes a published
// page's look).
//
// The optional free-AI path is wired but opt-in: set ARTICLE_COVER_AI=on and the
// endpoint will try the keyless Pollinations image API first, falling back to
// this composition the moment it is slow or unavailable. Nothing is claimed to
// be AI-made when it was composed here — the response carries
// `x-cover-source: generated|pollinations-free`.
//
// Serverless budget: shared `_` module imported by api/site-content.js, so the
// deployment still ships 12 Vercel Functions.
import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { xmlEscape, wrapLines, hasGlyphInk, stripCaptionBand } from './_og-card.js';

export const ARTICLE_COVER = { width: 1200, height: 630 };
export const ARTICLE_COVER_TYPE = 'image/jpeg';
export const ARTICLE_COVER_CACHE = 'public, max-age=3600, s-maxage=31536000, stale-while-revalidate=604800';

/** Deep greens that read as "AR7" plus a seeded accent for the geometry. */
const SCHEMES = [
  { from: '#032b1d', to: '#065a3c', accent: '#e09a26', ink: '#ffffff' },
  { from: '#04231a', to: '#0a5f45', accent: '#f4bd55', ink: '#ffffff' },
  { from: '#052018', to: '#0b4f6c', accent: '#e09a26', ink: '#ffffff' },
  { from: '#0a1f16', to: '#134e4a', accent: '#f7c869', ink: '#ffffff' },
  { from: '#031c2b', to: '#0a4d5c', accent: '#7fd4a8', ink: '#ffffff' },
  { from: '#1a1408', to: '#3c2f12', accent: '#e09a26', ink: '#ffffff' }
];

const FONT = 'Manrope, DejaVu Sans, Liberation Sans, Arial, Helvetica, sans-serif';

/** Deterministic bytes for one article: same slug ⇒ same cover, forever. */
export function coverSeed(slug = '') {
  return createHash('sha1').update(String(slug || 'ar7').toLowerCase()).digest();
}

export const coverScheme = seed => SCHEMES[seed[0] % SCHEMES.length];

const tidy = value => String(value ?? '').replace(/\s+/g, ' ').trim();

/**
 * The geometric layer. Seeded rings, a diagonal band and a dot grid — cheap
 * vector shapes that survive every runtime (no filters, no external fonts).
 */
function artLayer(seed, scheme) {
  const ring = (cx, cy, r, w, o) =>
    `<circle cx="${cx.toFixed(0)}" cy="${cy.toFixed(0)}" r="${r.toFixed(0)}" fill="none" stroke="${scheme.accent}" stroke-width="${w}" opacity="${o}"/>`;
  const rings = [
    ring(980 + (seed[1] % 60), 120 + (seed[2] % 50), 210 + (seed[3] % 80), 3, 0.30),
    ring(980 + (seed[1] % 60), 120 + (seed[2] % 50), 320 + (seed[4] % 90), 2, 0.18),
    ring(140 - (seed[5] % 50), 560 + (seed[6] % 40), 160 + (seed[7] % 70), 2, 0.16)
  ].join('');
  const bandY = 430 + (seed[8] % 120);
  const band = `<rect x="-80" y="${bandY}" width="1400" height="${26 + (seed[9] % 40)}" fill="${scheme.accent}" opacity="0.14" transform="rotate(${-8 + (seed[10] % 16)} 600 500)"/>`;
  // A quiet dot field in the upper band — never over the title or the footer,
  // where it would speckle the type.
  let dots = '';
  const cols = 9 + (seed[11] % 5), rows = 3 + (seed[12] % 2);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      dots += `<circle cx="${(90 + c * 34).toFixed(0)}" cy="${(96 + r * 30).toFixed(0)}" r="2.4" fill="${scheme.ink}" opacity="0.16"/>`;
    }
  }
  return rings + band + dots;
}

/** The whole cover as one SVG layer (scrim + art + type). */
export function buildCoverSvg(article, seed, { withText = true } = {}) {
  const scheme = coverScheme(seed);
  const { width, height } = ARTICLE_COVER;
  const pad = 64;
  const title = tidy(article.title) || 'AR7 Traders';
  const category = tidy(article.category || article.cat || 'EXPORT GUIDE').toUpperCase().slice(0, 40);
  const lines = withText ? wrapLines(title, { maxWidth: width - pad * 2, fontSize: 58, factor: 0.55, maxLines: 3 }) : [];
  const lineHeight = 64;
  const blockBottom = height - 132;
  const firstBaseline = blockBottom - (Math.max(lines.length, 1) - 1) * lineHeight;
  const tspans = lines.map((line, i) =>
    `<text x="${pad}" y="${(firstBaseline + i * lineHeight).toFixed(1)}" font-family="${FONT}" font-size="58" font-weight="800" fill="${scheme.ink}" letter-spacing="-1.2">${xmlEscape(line)}</text>`
  ).join('');

  const scrim = `<defs>
      <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${scheme.from}" stop-opacity="0.55"/>
        <stop offset="55%" stop-color="${scheme.from}" stop-opacity="0.86"/>
        <stop offset="100%" stop-color="${scheme.from}" stop-opacity="0.97"/>
      </linearGradient>
      <linearGradient id="chip" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stop-color="${scheme.accent}" stop-opacity="0.95"/>
        <stop offset="100%" stop-color="${scheme.accent}" stop-opacity="0.55"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#sky)"/>`;

  const chipWidth = Math.min(width - pad * 2, 26 + category.length * 13);
  const marks = withText
    ? `<rect x="${pad}" y="${firstBaseline - 210}" width="${chipWidth}" height="40" rx="20" fill="url(#chip)"/>
       <text x="${pad + 20}" y="${firstBaseline - 183}" font-family="${FONT}" font-size="20" font-weight="800" fill="#04231a" letter-spacing="2.2">${xmlEscape(category)}</text>
       ${tspans}
       <text x="${pad}" y="${height - 52}" font-family="${FONT}" font-size="19" font-weight="700" fill="${scheme.accent}" letter-spacing="2.4">AR7 TRADERS · JAPAN &amp; CHINA EXPORT</text>
       <text x="${width - pad}" y="${height - 52}" text-anchor="end" font-family="${FONT}" font-size="21" font-weight="800" fill="#ffffff">ar7traders.com</text>`
    : `<circle cx="${width - pad - 34}" cy="${pad + 34}" r="30" fill="none" stroke="${scheme.accent}" stroke-width="3"/>
       <circle cx="${width - pad - 34}" cy="${pad + 34}" r="6" fill="${scheme.accent}"/>
       <text x="${width - pad}" y="${height - 52}" text-anchor="end" font-family="${FONT}" font-size="21" font-weight="800" fill="#ffffff">ar7traders.com</text>`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${scrim}${artLayer(seed, scheme)}${marks}</svg>`;
}

/** Brand-only canvas when no photograph is available. */
async function plainCanvas(seed) {
  const scheme = coverScheme(seed);
  const { width, height } = ARTICLE_COVER;
  return sharp({ create: { width, height, channels: 3, background: scheme.from } }).png().toBuffer();
}

async function photoCanvas(photo, { fetch: fetchImpl } = {}) {
  const target = String(photo || '').trim();
  if (!target) return null;
  const { width, height } = ARTICLE_COVER;
  try {
    let buffer = null;
    if (/^https?:\/\//i.test(target)) {
      const doFetch = fetchImpl || globalThis.fetch;
      if (typeof doFetch !== 'function') return null;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 4000);
      try {
        const res = await doFetch(target, { signal: controller.signal, redirect: 'follow' });
        if (!res.ok) return null;
        buffer = Buffer.from(await res.arrayBuffer());
      } finally { clearTimeout(timer); }
    } else {
      const { readFile } = await import('node:fs/promises');
      const { join } = await import('node:path');
      buffer = await readFile(join(process.cwd(), 'public', target.replace(/^\//, '')));
    }
    if (!buffer || !buffer.length) return null;
    // Our own machinery photos are delivered with a branded caption band baked
    // into the bottom ~11%; left in place it would print "AR7 TRADERS" twice on
    // the same cover. Any other geometry passes through untouched.
    const upright = await sharp(buffer).rotate().png().toBuffer();
    return await sharp(await stripCaptionBand(upright)).resize(width, height, { fit: 'cover', position: 'centre' })
      .toColourspace('srgb').png().toBuffer();
  } catch {
    return null;                          // a broken photo is never a broken page
  }
}

/**
 * Render one article's cover. Always resolves to a JPEG buffer.
 * `photo` is the article's own stored image, when it has one.
 */
export async function renderArticleCover(article = {}, { photo = null, fetch: fetchImpl } = {}) {
  const seed = coverSeed(article.slug || article.title || 'ar7');
  // A cover URL stored in `image` is this endpoint's own output, not a source
  // photograph — reusing it would recurse.
  const sourcePhoto = isCoverPath(photo) ? null : photo;
  const base = (await photoCanvas(sourcePhoto, { fetch: fetchImpl })) || await plainCanvas(seed);
  const textSvg = buildCoverSvg(article, seed, { withText: true });
  // A runtime without fonts must not print blank rectangles, exactly like the
  // share cards: fall back to the text-free composition instead.
  const drawText = await hasGlyphInk(textSvg, { minInk: 600 });
  const svg = drawText ? textSvg : buildCoverSvg(article, seed, { withText: false });
  return sharp(base)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 84, progressive: true, chromaSubsampling: '4:2:0' })
    .toBuffer();
}

/**
 * Optional free AI art (keyless Pollinations). Opt-in with ARTICLE_COVER_AI=on.
 * Returns null — never throws — so the caller always has the composed cover to
 * fall back on.
 */
export async function freeAiArt(article = {}, { fetch: fetchImpl, timeout = 7000 } = {}) {
  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== 'function') return null;
  const subject = tidy(`${article.title || ''} ${article.category || ''}`).slice(0, 180);
  const prompt = `editorial photograph for an article about Japanese used car and construction machinery export: ${subject}. Clean, professional, natural light, no text, no watermark`;
  const seed = Number.parseInt(createHash('sha1').update(prompt).digest('hex').slice(0, 8), 16) % 1000000;
  const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${ARTICLE_COVER.width}&height=${ARTICLE_COVER.height}&seed=${seed}&nologo=true`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await doFetch(url, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer.length > 4096 ? buffer : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// The URL shape lives in a browser-safe module so the news cards, the head and
// this endpoint cannot disagree about it.
export { articleCoverPath, articleCoverUrl, ARTICLE_COVER_SIZE } from '../src/article-cover.js';
import { articleCoverPath as _articleCoverPath, isCoverPath } from '../src/article-cover.js';
export const coverPathFor = _articleCoverPath;
