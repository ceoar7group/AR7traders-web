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
