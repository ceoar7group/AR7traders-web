// 2026-11-10 — the 3D globe engine actually renders, and countries land in
// the RIGHT PLACE (the owner's core complaint about the old strip globes).
// jsdom cannot paint a canvas, so this harness stubs the 2D context with a
// recorder and drives src/globe3d.js through a full frame: projection
// accuracy, marker positioning, hemisphere culling, and cleanup are all
// asserted against the recorded draw calls.
import assert from 'node:assert/strict';

let passed = 0;
const ok = (cond, label) => {
  assert.ok(cond, label);
  passed++;
  console.log('  ✓ ' + label);
};

/* ---------- minimal DOM/canvas doubles (only what the engine touches) ---------- */
class FakeGradient { addColorStop() {} }
class FakePath2D {
  constructor(src) { this.ops = src ? [...src.ops] : []; }
  moveTo(x, y) { this.ops.push(['M', x, y]); }
  lineTo(x, y) { this.ops.push(['L', x, y]); }
  closePath() { this.ops.push(['Z']); }
  rect(x, y, w, h) { this.ops.push(['R', x, y, w, h]); }
}
class FakeCtx {
  constructor() { this.calls = []; this.fills = []; }
  setTransform() {} clearRect() {} save() {} restore() {} clip() {}
  beginPath() {} arc(...a) { this.calls.push(['arc', ...a]); }
  moveTo() {} lineTo() {} stroke() {} setLineDash() {} fillRect(...a) { this.calls.push(['fillRect', ...a]); }
  fill(path) { this.calls.push(['fill']); if (path instanceof FakePath2D) this.fills.push(path); }
  createRadialGradient() { return new FakeGradient(); }
  createLinearGradient() { return new FakeGradient(); }
  isPointInPath() { return false; }
}
class FakeElement {
  constructor(tag) {
    this.tagName = tag; this.children = []; this.dataset = {}; this.style = {};
    this.listeners = {}; this.classList = { add() {}, remove() {} };
    this.width = 0; this.height = 0;
  }
  appendChild(c) { this.children.push(c); return c; }
  querySelector(sel) { return this.children.find(c => sel.includes(c.cls)) || null; }
  querySelectorAll(sel) {
    if (sel === '[data-lon]') return this.children.filter(c => 'lon' in c.dataset);
    return [];
  }
  addEventListener(type, fn) { (this.listeners[type] ||= []).push(fn); }
  removeEventListener(type, fn) { this.listeners[type] = (this.listeners[type] || []).filter(f => f !== fn); }
  getBoundingClientRect() { return { width: 400, height: 400, left: 0, top: 0 }; }
  getContext(kind) { return kind === '2d' ? this.ctx : null; }
}

const g = globalThis;
g.CanvasRenderingContext2D = FakeCtx;
g.Path2D = FakePath2D;
g.window = { devicePixelRatio: 1, addEventListener() {}, removeEventListener() {}, matchMedia: () => ({ matches: false, addEventListener() {}, removeEventListener() {} }) };
g.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
g.requestAnimationFrame = () => 1;
g.cancelAnimationFrame = () => {};
if (!g.performance) g.performance = { now: () => Date.now() };

const { mountGlobe } = await import('../src/globe3d.js');

console.log('\n-- the engine mounts, projects and cleans up --');
{
  const host = new FakeElement('div');
  const canvas = new FakeElement('canvas'); canvas.cls = 'g3-canvas'; canvas.ctx = new FakeCtx();
  host.appendChild(canvas);

  // overlay markers: Japan (front, dead centre), its antipode (must hide)
  const jp = new FakeElement('button'); jp.dataset = { lon: '138', lat: '36' };
  const anti = new FakeElement('span'); anti.dataset = { lon: '-42', lat: '-36' };
  host.appendChild(jp); host.appendChild(anti);

  // centre the camera exactly on Japan and render one frame synchronously
  const cleanup = mountGlobe(host, { lam: 138, phi: 36, autoRotate: 0 });
  ok(typeof cleanup === 'function', 'mountGlobe returns a cleanup function');
  ok(canvas.width === 400 && canvas.height === 400, 'the canvas backing store matches the measured size');

  const ctx = canvas.ctx;
  ok(ctx.fills.length > 0, 'land polygons were filled on the first frame');
  const landPts = ctx.fills.reduce((n, p) => n + p.ops.length, 0);
  ok(landPts > 2000, `the real Natural Earth geometry is drawn (${landPts} path ops)`);

  // 2026-11-10 (owner: "water turned gold while rotating"): the land fill
  // must be TRIANGLES, never whole horizon-clamped rings — a ring that is
  // half behind the sphere closes its outline straight across open ocean and
  // floods the green water with gold. Pin: every subpath of the land fill is
  // exactly one triangle (M, L, L, Z), and no vertex strays off the sphere.
  const landFill = ctx.fills[0];
  let mi = 0, triOk = true, inDisc = true;
  while (mi < landFill.ops.length) {
    const sub = landFill.ops.slice(mi, mi + 4);
    if (!(sub[0]?.[0] === 'M' && sub[1]?.[0] === 'L' && sub[2]?.[0] === 'L' && sub[3]?.[0] === 'Z')) { triOk = false; break; }
    for (const op of sub) if (op.length > 1 && Math.hypot(op[1] - 200, op[2] - 200) > 200 * 0.985 + 1.5) inDisc = false;
    mi += 4;
  }
  ok(triOk && mi > 0, `the land fill is pure triangles (${mi / 4} drawn) — half-hidden continents cannot paint the ocean gold`);
  ok(inDisc, 'every drawn land vertex stays on the sphere disc');

  // Japan marker must sit at the centre of a 400×400 canvas when the camera
  // is centred on Japan — THE "right place on the map" guarantee.
  const m = /translate\((-?[\d.]+)px,(-?[\d.]+)px\)/.exec(jp.style.transform || '');
  ok(!!m, 'the Japan chip was positioned via transform (no per-frame layout)');
  ok(Math.abs(parseFloat(m[1]) - 200) < 1 && Math.abs(parseFloat(m[2]) - 200) < 1,
    `Japan projects to the exact centre when the camera faces it (got ${m[1]},${m[2]})`);
  ok(jp.style.visibility === 'visible' && jp.style.pointerEvents === 'auto',
    'front-hemisphere markers are visible and clickable');
  ok(anti.style.visibility === 'hidden' && anti.style.pointerEvents === 'none',
    'far-hemisphere markers are hidden and non-interactive');

  // free rotation: a drag event path exists on the host
  ok((host.listeners.pointerdown || []).length === 1, 'the host listens for pointer drags');
  ok((host.listeners.click || []).length === 1, 'a click guard protects chips after a drag');

  cleanup();
  ok((host.listeners.pointerdown || []).length === 0, 'cleanup removes the drag listeners');
}

console.log('\n-- environments without a real canvas stay silent --');
{
  const host = new FakeElement('div');
  const canvas = new FakeElement('canvas'); canvas.cls = 'g3-canvas'; canvas.ctx = null;
  host.appendChild(canvas);
  const cleanup = mountGlobe(host, {});
  ok(typeof cleanup === 'function', 'a null 2D context yields an inert no-op cleanup');
  cleanup();
}

console.log(`\n${passed} passed, 0 failed`);
