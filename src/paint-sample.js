// Sample a car's paint colour from its own photograph.
//
// 2026-11-28. Most listings in this catalogue carry a colour name ("Pearl
// White", "Silver"), which src/car-model.js turns into paint directly. The
// imported Japan-stock rows often do not, and a grey model for a red car looks
// like a mistake — so the dominant panel colour is measured from the listing's
// main photo instead. Same origin, same CDN, no upload, no API.
import { dominantPaint } from './car-model.js';

/** Load an image and read its pixels, or null if anything at all goes wrong.
 *  Never throws: a missing colour is a grey model, not a broken page. */
export async function samplePaintFromImage(src, { size = 96 } = {}) {
  if (!src || typeof document === 'undefined') return null;
  try {
    const image = await new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.crossOrigin = 'anonymous';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('image failed'));
      img.src = src;
    });
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const context = canvas.getContext('2d', { willReadFrequently: false });
    if (!context) return null;
    context.drawImage(image, 0, 0, size, size);
    const { data } = context.getImageData(0, 0, size, size);
    return dominantPaint(data, { width: size, height: size });
  } catch {
    // A tainted canvas (a cross-origin photo with no CORS header) lands here.
    return null;
  }
}
