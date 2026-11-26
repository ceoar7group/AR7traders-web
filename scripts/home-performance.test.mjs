import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { showroomSrcSet, SHOWROOM_HERO_SIZES } from '../src/showroom-images.js';
import { observeVisibleCarousel } from '../src/visible-carousel.js';

for (const file of ['hero-01.webp','hero-02-v2.webp','hero-03.webp','hero-04-v3.webp','hero-05.webp','hero-06-v3.webp','hero-07.webp','hero-08-v2.webp','hero-09-v2.webp','hero-10-v3.webp','hero-11.webp','hero-12-v2.webp','hero-13-v2.webp','hero-14-v3.webp','hero-15-v2.webp','hero-16-v4.webp','hero-17-v3.webp','hero-18.webp']) {
  const set = showroomSrcSet('/assets/showroom/' + file);
  assert.ok(set);
  for (const candidate of set.split(', ')) {
    const [path, descriptor] = candidate.split(' ');
    assert.ok(existsSync('public' + path), `missing ${path}`);
    const bytes = readFileSync('public' + path);
    assert.equal(bytes.toString('ascii', 0, 4), 'RIFF');
    assert.equal(bytes.toString('ascii', 8, 12), 'WEBP');
    assert.equal(bytes.toString('ascii', 12, 16), 'VP8 ', 'verify dimensions from lossy WebP frame');
    assert.equal(bytes.readUInt16LE(26) & 0x3fff, parseInt(descriptor, 10), `srcset width matches ${path}`);
  }
}
assert.equal(showroomSrcSet('https://example.com/car.webp'), undefined);
assert.equal(showroomSrcSet('/assets/showroom/' + 'unknown.webp'), undefined);
const shell = readFileSync('index.html', 'utf8');
assert.ok(shell.includes(`imagesrcset="${showroomSrcSet('/assets/showroom/hero-01.webp')}"`));
assert.ok(shell.includes(`srcset="${showroomSrcSet('/assets/showroom/hero-01.webp')}"`));
assert.ok(shell.includes(`imagesizes="${SHOWROOM_HERO_SIZES}"`));

// ---- the hero must be settled while it is still the only thing on screen ---
// 2026-11-27 (owner: "check performance has gone slow"). Field metrics: FCP
// 0.2 s, LCP 0.8 s, but Speed Index 1.4 s and TBT 230 ms. The page was ready
// long before it LOOKED ready: the hero copy staggered in until 1.5 s and the
// founder figure then counted for two more seconds, so every visual-progress
// frame in between counted against Speed Index. Lighthouse scores what the
// visitor sees, and what they saw was a page assembling itself.
{
  const landing = readFileSync('src/landing-v2.css', 'utf8');
  const styles = readFileSync('src/styles.css', 'utf8');
  const main = readFileSync('src/main.jsx', 'utf8');

  /** `animation:<name> <duration>s <delay>s both` → the second it finishes. */
  const finishSeconds = rule => {
    const m = rule.match(/animation:[a-z-]+\s+([\d.]+)s(?:\s+([\d.]+)s)?/i);
    if (!m) return null;
    return Number(m[1]) + Number(m[2] || 0);
  };
  const heroRules = [...landing.matchAll(/\.hero-copy[^{]*\{[^}]*animation:[^}]*\}/g)]
    .map(r => ({ rule: r[0], end: finishSeconds(r[0]) }))
    .filter(r => r.end !== null);
  assert.ok(heroRules.length >= 4, `the hero entrance rules are found (${heroRules.length})`);
  const latest = Math.max(...heroRules.map(r => r.end));
  assert.ok(latest <= 0.75,
    `every hero entrance animation finishes within 0.75 s (latest ${latest.toFixed(2)} s: ${heroRules.map(r => r.rule.split('{')[0]).join(', ')})`);

  const founderHero = styles.match(/\.hero-copy \.founder-stat\{[^}]*\}/);
  assert.ok(founderHero, 'the hero founder figure has an entrance rule');
  const founderEnd = finishSeconds(founderHero[0]);
  assert.ok(founderEnd !== null && founderEnd <= 0.75,
    `the hero founder figure is placed within 0.75 s (${founderEnd.toFixed(2)} s)`);

  // The figure itself: a count that outlives the hero is a count nobody sees,
  // and every frame of it is a frame the visual progress can move.
  const countMs = Number((main.match(/const COUNT_MS=(\d+)/) || [])[1]);
  assert.ok(countMs > 0 && countMs <= 900,
    `the founder count-up runs for ${countMs} ms or less (was 2000 with a 900 ms delay)`);
  const heroDelay = Number((main.match(/<FounderStat variant="hero" delay=\{(\d+)\}/) || [])[1]);
  assert.ok(heroDelay >= 0 && heroDelay <= 200,
    `the hero figure starts counting within 200 ms (${heroDelay} ms)`);

  // Card stagger: a long stagger keeps repainting a grid that is already there.
  const step = Number((main.match(/--delay':Math\.min\(i,(\d+)\)\*(\d+)\+'ms'/) || [])[2]);
  assert.ok(step > 0 && step <= 60, `the car-card stagger steps by ${step} ms or less`);

  // Motion is not information: reduced-motion visitors skip the entrance.
  const reduced = landing.slice(landing.indexOf('@media (prefers-reduced-motion: reduce)'));
  assert.ok(/\.hero-copy[^{]*\{[^}]*animation:none!important/.test(reduced),
    'reduced-motion users get the hero immediately, not a fade-in');
}

const oldSet = globalThis.setInterval, oldClear = globalThis.clearInterval;
let next = 0, timers = new Map(), obs, disconnected = false, ticks = 0;
try {
  globalThis.setInterval = cb => { const id = ++next; timers.set(id, cb); return id; };
  globalThis.clearInterval = id => timers.delete(id);
  class Observer { constructor(cb) { this.cb = cb; obs = this; } observe(el) { assert.equal(el, 'stock'); } disconnect() { disconnected = true; } }
  const cleanup = observeVisibleCarousel('stock', () => ticks++, {Observer});
  assert.equal(timers.size, 0, 'no interval until visible');
  obs.cb([{isIntersecting:true}]); obs.cb([{isIntersecting:true}]);
  assert.equal(timers.size, 1, 'repeated visibility does not duplicate timers');
  [...timers.values()][0](); assert.equal(ticks, 1);
  obs.cb([{isIntersecting:false}]); assert.equal(timers.size, 0, 'offscreen timer stops');
  obs.cb([{isIntersecting:true}]); cleanup();
  assert.equal(timers.size, 0); assert.ok(disconnected, 'unmount cleans up observer and timer');
  const fallback = observeVisibleCarousel('stock', () => ticks++, {Observer: null});
  assert.equal(timers.size, 1, 'fallback rotates without IntersectionObserver');
  fallback(); assert.equal(timers.size, 0);
} finally { globalThis.setInterval = oldSet; globalThis.clearInterval = oldClear; }
console.log('Home performance regression checks passed');
