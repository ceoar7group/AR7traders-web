// The vehicle share card — the 1200×630 image WhatsApp, Facebook, X, LinkedIn,
// Slack and Telegram draw beside a shared /inventory/<ref> link.
//
// Before this, og:image was the listing photo itself: whatever shape the yard
// camera produced, no name, no price, and different dimensions for every car —
// so the same link looked like a random photo on some phones and like nothing
// at all on others. A share card is the cheapest, highest-visibility surface
// this business has: a buyer forwards a car to a friend or a client, and the
// card is the whole first impression.
//
// Design (matches the site's own tokens — deep #032b1d, green #05543a, gold
// #e09a26):
//   • the listing photo, cover-cropped to the card's exact 1200×630;
//  • a diagonal scrim so the text stays legible over any photo;
//  • kicker, vehicle name (max two fitted lines), spec line;
//   • a white price pill, because the number is the first thing a buyer looks
//     for and a pill survives every photo;
//   • a footer with the stock reference and ar7traders.com.
//
// Two hard rules this module keeps:
//   1. It NEVER invents content. No price, no pill; no photo, a brand-only
//      card; nothing is drawn that the listing does not carry.
//   2. It NEVER fails a crawler. Every path returns an image — and if the
//      runtime cannot draw text (librsvg without fonts), the same card is
//      re-rendered without text rather than shipped with blank rectangles.
//
// Serverless budget note: this lives in a shared `_`-module imported by
// api/site-content.js, exactly like _crawler-render.js — the deployment stays
// at Vercel Hobby's 12-Function cap.
import sharp from 'sharp';
// The URL and dimensions live in a browser-safe module so the SPA head and this
// renderer can never publish a link that disagrees with the image served.
import { SHARE_CARD, shareCardPath, shareCardUrl } from '../src/share-card.js';

export const CARD = { width: SHARE_CARD.width, height: SHARE_CARD.height };

/** Path the card is published at (vercel.json rewrites it to site-content). */
export const cardPath = shareCardPath;

/** Absolute card URL for og:image / twitter:image. */
export const cardUrl = shareCardUrl;

// Fonts: Manrope is the site face but a serverless image runtime will rarely
// have it; the stack degrades through whatever the distro ships and the ink
// check below catches a runtime with no fonts at all.
const FONT = 'Manrope, DejaVu Sans, Liberation Sans, Arial, Helvetica, sans-serif';
const GREEN = '#05543a';
const DEEP = '#032b1d';
const GOLD = '#e09a26';
const GOLD_2 = '#f4bd55';

export function xmlEscape(value) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const tidy = value => String(value ?? '').replace(/\s+/g, ' ').trim();

/** Widest-fitting wrap. Glyph widths are estimated (no font metrics on the
 *  server); the estimate is deliberately generous so a line never overruns
 *  the card, and the last line gets an ellipsis when words had to be dropped. */
export function wrapLines(text, { maxWidth, fontSize, factor = 0.56, maxLines = 2 } = {}) {
  const words = tidy(text).split(' ').filter(Boolean);
  if (!words.length) return [];
  const width = s => s.length * fontSize * factor;
  const lines = [];
  let current = '';
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (lines.length < maxLines - 1 || !current) {
      if (width(next) <= maxWidth || !current) {
        // A single word wider than the card still gets trimmed below.
        current = next;
        continue;
      }
      lines.push(current);
      current = word;
      continue;
    }
    if (width(next) <= maxWidth) {
      current = next;
    } else {
      // Out of lines and out of room: mark the truncation honestly.
      let clipped = current;
      while (clipped.length > 1 && width(clipped + '…') > maxWidth) clipped = clipped.slice(0, -1).trimEnd();
      lines.push(clipped + '…');
      current = '';
      break;
    }
  }
  if (current) {
    let line = current;
    while (lenGuard(line, width, maxWidth)) line = line.slice(0, -1).trimEnd();
    lines.push(lenGuard(current, width, maxWidth) ? line + '…' : line);
  }
  return lines.slice(0, maxLines);
}

function lenGuard(line, width, maxWidth) {
  return width(line + '…') > maxWidth && line.length > 1;
}

/** "42000" → "42,000 km"; a string that already reads as mileage is kept. */
function kmLabel(km) {
  const raw = tidy(km);
  if (!raw) return '';
  if (/km/i.test(raw)) return raw;
  const digits = raw.replace(/[^0-9]/g, '');
  if (!digits || digits !== raw.replace(/[,]/g, '')) return raw;   // prose stays as written
  return `${Number(digits).toLocaleString('en-US')} km`;
}

/** Everything the card says, from the listing — nothing more. */
export function cardContent(row, ref) {
  const name = row ? [row.year, row.make, row.model].map(tidy).filter(Boolean).join(' ') : '';
  const specs = row
    ? [
        tidy(row.year),
        kmLabel(row.km),
        tidy(row.fuel),
        tidy(row.tr),
        tidy(row.grade) ? `Grade ${tidy(row.grade)}` : ''
      ].filter(Boolean).join(' · ')
    : '';
  return {
    name: name || 'Cars and machinery for export',
    specs,
    price: tidy(row?.priceLabel),
    ref: tidy(ref) ? `STOCK ${tidy(ref).toUpperCase()}` : '',
    kicker: name ? 'AR7 TRADERS · JAPAN EXPORT' : 'AR7 TRADERS · JAPAN & CHINA EXPORT',
    host: 'ar7traders.com'
  };
}

/** The SVG layer that sits on top of the photo. `withText:false` keeps the
 *  frame (scrim, gold rule, monogram, footer marks) without any glyphs. */
export function buildCardSvg(content, { withText = true, hasPhoto = true, priceWidth = 0 } = {}) {
  const { name, specs, price, ref, kicker, host } = content;
  const pad = 56;
  const textWidth = 780;
  const nameSize = 50;
  const nameLines = withText ? wrapLines(name, { maxWidth: textWidth, fontSize: nameSize, factor: 0.6, maxLines: 2 }) : [];
  const nameLineHeight = nameSize * 1.12;

  const footerBaseline = CARD.height - 40;          // stock ref + host
  const pillHeight = 62;
  const pillY = footerBaseline - 82;                // pill sits above the footer
  const pillBottomBaseline = pillY + 41;
  const specsBaseline = pillY - 28;
  const nameBottom = specs ? specsBaseline - 46 : pillY - 36;
  const nameTop = nameBottom - (Math.max(nameLines.length, 1) - 1) * nameLineHeight;
  const kickerBaseline = nameTop - 44;

  const nameTspans = nameLines.map((line, i) =>
    `<text x="${pad}" y="${(nameBottom - (nameLines.length - 1 - i) * nameLineHeight).toFixed(1)}"` +
    ` font-family="${FONT}" font-size="${nameSize}" font-weight="700" fill="#ffffff" letter-spacing="-1.4">${xmlEscape(line)}</text>`
  ).join('');

  // Price pill: white chip, digits in deep green, "FOB" quietly beside them.
  // The glyph estimate drives both the pill's width and where "FOB" starts, so
  // the two can never collide.
  const priceText = tidy(price);
  const priceFont = 34;
  const priceEstimate = priceWidth > 0 ? priceWidth : priceText.length * priceFont * 0.56;
  const fobWidth = 46;
  const pillWidth = Math.min(textWidth, Math.max(200, 26 + priceEstimate + 24 + fobWidth + 24));
  const pill = priceText
    ? `<g><rect x="${pad}" y="${pillY}" width="${pillWidth.toFixed(0)}" height="${pillHeight}" rx="${pillHeight / 2}" fill="#ffffff"/>` +
      `<text x="${pad + 26}" y="${pillBottomBaseline}" font-family="${FONT}" font-size="${priceFont}" font-weight="800" fill="${DEEP}">${xmlEscape(priceText)}</text>` +
      `<text x="${(pad + 26 + priceEstimate + 24).toFixed(0)}" y="${pillBottomBaseline - 4}" font-family="${FONT}" font-size="17" font-weight="700" fill="#5c6f65" letter-spacing="1.6">FOB</text></g>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD.width}" height="${CARD.height}" viewBox="0 0 ${CARD.width} ${CARD.height}">` +
    '<defs>' +
      // Left/bottom dark, top/right clear: the car stays visible, the copy stays readable.
      `<linearGradient id="scrim" x1="0" y1="0" x2="1" y2="0.35">` +
        '<stop offset="0" stop-color="#031812" stop-opacity="0.94"/>' +
        '<stop offset="0.42" stop-color="#031812" stop-opacity="0.72"/>' +
        '<stop offset="0.72" stop-color="#031812" stop-opacity="0.18"/>' +
        '<stop offset="1" stop-color="#031812" stop-opacity="0"/>' +
      '</linearGradient>' +
      `<linearGradient id="foot" x1="0" y1="0" x2="0" y2="1">` +
        '<stop offset="0" stop-color="#031812" stop-opacity="0"/>' +
        '<stop offset="1" stop-color="#031812" stop-opacity="0.82"/>' +
      '</linearGradient>' +
      `<linearGradient id="brand" x1="0" y1="0" x2="1" y2="1">` +
        `<stop offset="0" stop-color="${DEEP}"/><stop offset="1" stop-color="${GREEN}"/>` +
      '</linearGradient>' +
    '</defs>' +
    // Brand backdrop: invisible behind a photo, the whole card when there is none.
    (hasPhoto ? '' : `<rect width="${CARD.width}" height="${CARD.height}" fill="url(#brand)"/>` +
      `<circle cx="980" cy="196" r="210" fill="${GOLD}" opacity="0.10"/>` +
      `<circle cx="1090" cy="470" r="150" fill="#ffffff" opacity="0.05"/>`) +
    `<rect width="${CARD.width}" height="${CARD.height}" fill="url(#scrim)"/>` +
    `<rect y="${CARD.height - 210}" width="${CARD.width}" height="210" fill="url(#foot)"/>` +
    // Accent: a short gold rule marking the brand, and the site's deep-green base.
    `<rect x="${pad}" y="${kickerBaseline - 26}" width="54" height="5" rx="2.5" fill="${GOLD}"/>` +
    `<rect y="${CARD.height - 6}" width="${CARD.width}" height="6" fill="${GREEN}"/>` +
    (withText
      ? `<text x="${pad}" y="${kickerBaseline}" font-family="${FONT}" font-size="19" font-weight="800" fill="${GOLD_2}" letter-spacing="3.4">${xmlEscape(kicker)}</text>` +
        nameTspans +
        (specs ? `<text x="${pad}" y="${specsBaseline}" font-family="${FONT}" font-size="25" font-weight="600" fill="#cfe4d8">${xmlEscape(specs)}</text>` : '') +
        pill +
        (ref ? `<text x="${pad}" y="${footerBaseline}" font-family="${FONT}" font-size="17" font-weight="700" fill="#8fb3a3" letter-spacing="2.6">${xmlEscape(ref)}</text>` : '') +
        `<text x="${CARD.width - pad}" y="${footerBaseline}" text-anchor="end" font-family="${FONT}" font-size="21" font-weight="700" fill="#e9f3ec">${xmlEscape(host)}</text>`
      // Text-free variant still signs the card with vector marks only.
      : `<circle cx="${CARD.width - pad - 30}" cy="${pad + 30}" r="30" fill="none" stroke="${GOLD}" stroke-width="3"/>` +
        `<circle cx="${CARD.width - pad - 30}" cy="${pad + 30}" r="6" fill="${GOLD}"/>` +
        `<text x="${CARD.width - pad}" y="${footerBaseline}" text-anchor="end" font-family="${FONT}" font-size="21" font-weight="700" fill="#e9f3ec">${xmlEscape(host)}</text>`) +
    '</svg>';
}

// Real glyph widths, measured from a throwaway render. Without this the pill
// and its "FOB" tag are placed from a character-count estimate, and bold digits
// are wide enough (0.63em, not 0.56em) for the two to collide.
export async function measureText(text, fontSize, weight = 800, fallbackFactor = 0.58) {
  const clean = tidy(text);
  if (!clean) return 0;
  try {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="${Math.ceil(fontSize * 3)}">` +
      `<text x="0" y="${Math.ceil(fontSize * 2)}" font-family="${FONT}" font-size="${fontSize}" font-weight="${weight}" fill="#ffffff">${xmlEscape(clean)}</text></svg>`;
    const png = await sharp(Buffer.from(svg)).png().toBuffer();
    const { info } = await sharp(png).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
    return info.width > 0 ? info.width : Math.round(clean.length * fontSize * fallbackFactor);
  } catch {
    return Math.round(clean.length * fontSize * fallbackFactor);
  }
}

/** Text-only render used to prove the runtime actually drew glyphs. */
export async function hasGlyphInk(svg, { minInk = 900 } = {}) {
  try {
    const { data, info } = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const channels = info.channels;
    let ink = 0;
    for (let i = 3; i < data.length; i += channels) if (data[i] > 60 && ++ink > minInk) return true;
    return false;
  } catch {
    return false;
  }
}

async function background({ photoBuffer, photo, fetch: fetchImpl }) {
  if (photoBuffer || photo) {
    try {
      const source = photoBuffer || (await fetchPhoto(photo, { fetch: fetchImpl }));
      if (source) {
        return await sharp(source)
          .rotate()                                  // honour EXIF orientation
          .resize(CARD.width, CARD.height, { fit: 'cover', position: 'centre' })
          .toColourspace('srgb')
          .png()
          .toBuffer();
      }
    } catch {
      // Unreadable photo (truncated, SVG, CMYK, huge) → brand-only card.
    }
  }
  return null;
}

async function fetchPhoto(url, { timeout = 4500, fetch: fetchImpl } = {}) {
  const target = String(url || '').trim();
  if (!/^https?:\/\//i.test(target)) return null;
  const doFetch = fetchImpl || globalThis.fetch;
  if (typeof doFetch !== 'function') return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const res = await doFetch(target, { signal: controller.signal, redirect: 'follow' });
    if (!res.ok) return null;
    const length = Number(res.headers.get('content-length') || 0);
    if (length > 12 * 1024 * 1024) return null;
    const buffer = Buffer.from(await res.arrayBuffer());
    return buffer.length > 12 * 1024 * 1024 ? null : buffer;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Compose the card. Always resolves to a JPEG buffer. */
export async function renderVehicleCard(content, opts = {}) {
  const base = await background(opts);
  const hasPhoto = !!base;
  const priceWidth = content?.price ? await measureText(content.price, 34, 800) : 0;
  const textSvg = buildCardSvg(content, { withText: true, hasPhoto, priceWidth });
  const textDraws = await hasGlyphInk(textSvg);
  const svg = textDraws ? textSvg : buildCardSvg(content, { withText: false, hasPhoto, priceWidth });

  const canvas = base || await sharp({
    create: { width: CARD.width, height: CARD.height, channels: 3, background: DEEP }
  }).png().toBuffer();

  return sharp(canvas)
    .composite([{ input: Buffer.from(svg), top: 0, left: 0 }])
    .jpeg({ quality: 82, progressive: true, chromaSubsampling: '4:2:0' })
    .toBuffer();
}

/** The one thing the head builder and the endpoint both need to agree on. */
export const CARD_META = {
  width: SHARE_CARD.width,
  height: SHARE_CARD.height,
  type: SHARE_CARD.type,
  cache: 'public, max-age=300, s-maxage=86400, stale-while-revalidate=604800'
};
