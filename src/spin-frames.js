// Pure helpers for the 360° walkaround (src/spin-view.jsx). Kept out of the
// component file so the frame-sampling rule and the honesty wording can be
// unit-tested without a DOM (scripts/spin-view.test.mjs).
export const MAX_FRAMES = 36;
// One frame per ~12 px of drag: a 400 px swipe crosses about a third of the
// vehicle, which is how a real spin viewer feels.
export const PX_PER_FRAME = 12;

/**
 * Evenly sample a listing's photographs into spin frames. A listing with 24
 * photos uses all 24; one with 60 is sampled down to 36 so a phone never
 * downloads a hundred images to turn a car around once.
 */
export function spinFrames(images = [], max = MAX_FRAMES) {
  const list = (Array.isArray(images) ? images : [])
    .map(value => (typeof value === 'string' ? value.trim() : (value && typeof value === 'object' ? (value.src || '') : '')))
    .filter(Boolean);
  if (list.length <= max) return [...new Set(list)];
  const step = list.length / max;
  const out = [];
  for (let i = 0; i < max; i++) out.push(list[Math.floor(i * step)]);
  return [...new Set(out)];
}

/** What the viewer tells the buyer about how many photographs back the spin.
 *  A three-photo "360°" is a slideshow; saying so is the honest thing. */
export function spinLabel(count) {
  if (!count) return 'No photographs on file yet — ask our team for a walkaround video.';
  if (count <= 1) return 'One photograph on file — ask us for a full 360° set.';
  if (count < 8) return `${count} photographs on file, looped as a spin. Ask us for a full studio set.`;
  return `${count} photographs, looped as a 360° spin — the whole vehicle, verified stock only.`;
}
