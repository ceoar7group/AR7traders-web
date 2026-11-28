#!/usr/bin/env node
// Dev tool: render the 3D walkaround model to PNG from the command line.
//
//   node scripts/car-preview.mjs            # every body class, one grid PNG
//   node scripts/car-preview.mjs suv        # one class, four angles
//
// The browser model (src/car-model.js) is pure JavaScript, so the same mesh
// that three.js draws in the walkaround can be rasterised here with no GPU,
// no browser and no WebGL. That is how the geometry gets reviewed — CI has no
// GPU, and "it compiles" is not a way to judge whether a car looks like a car.
import { writeFileSync, mkdirSync } from 'node:fs';
import sharp from 'sharp';
import { buildCar, modelDims, CLASS_PRESETS, paintForCar } from '../src/car-model.js';

const W = 720, H = 420;

function render(models, { azimuth = 0.9, elevation = 0.32, distance = 11 } = {}) {
  const buf = Buffer.alloc(W * H * 4);
  // Studio backdrop: a soft vertical gradient, like the viewer's environment.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const t = y / H;
      const sky = [26 + 30 * (1 - t), 34 + 34 * (1 - t), 40 + 38 * (1 - t)];
      const i = (y * W + x) * 4;
      buf[i] = sky[0]; buf[i + 1] = sky[1]; buf[i + 2] = sky[2]; buf[i + 3] = 255;
    }
  }
  // A soft contact shadow on the backdrop, so the car is standing on something.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const dx = (x - W * 0.5) / (W * 0.30), dy = (y - H * 0.62) / (H * 0.05);
      const shadow = Math.exp(-(dx * dx + dy * dy)) * 0.55;
      if (shadow < 0.01) continue;
      const i = (y * W + x) * 4;
      buf[i] *= 1 - shadow; buf[i + 1] *= 1 - shadow; buf[i + 2] *= 1 - shadow;
    }
  }
  const depth = new Float32Array(W * H).fill(Infinity);

  const cx = 2.32;
  const target = [cx, 0.66, 0];
  const eye = [
    target[0] + Math.cos(azimuth) * Math.cos(elevation) * distance,
    target[1] + Math.sin(elevation) * distance,
    target[2] + Math.sin(azimuth) * Math.cos(elevation) * distance
  ];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const norm = a => { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const forward = norm(sub(target, eye));
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  const fov = 1.05;

  const project = p => {
    const rel = sub(p, eye);
    const x = dot(rel, right), y = dot(rel, up), z = dot(rel, forward);
    if (z <= 0.05) return null;
    const f = (H / 2) / Math.tan(fov / 2);
    return [(W / 2) + (x / z) * f, (H / 2) - (y / z) * f, z];
  };

  const light1 = norm([0.55, 0.9, 0.35]);
  const light2 = norm([-0.5, 0.4, -0.75]);
  const shell = { paint: [1, 1, 1], glass: [0.16, 0.22, 0.26], tyre: [0.09, 0.09, 0.10], rim: [0.62, 0.65, 0.68], trim: [0.2, 0.2, 0.22], lampF: [1, 0.98, 0.9], lampR: [0.75, 0.1, 0.12], floor: [0.13, 0.13, 0.14] };
  const hexToRgb = hex => [1, 3, 5].map(i => parseInt(String(hex).replace('#', '').substr(i - 1, 2), 16) / 255);

  for (const model of models) {
    const paint = hexToRgb(model.paint);
    for (const part of model.parts) {
      const base = part.material === 'paint' || part.material === 'roof' ? paint : (shell[part.material] || [0.8, 0.8, 0.8]);
      const pos = part.positions, idx = part.indices;
      for (let i = 0; i < idx.length; i += 3) {
        const ia = idx[i] * 3, ib = idx[i + 1] * 3, ic = idx[i + 2] * 3;
        const a = [pos[ia], pos[ia + 1], pos[ia + 2]];
        const b = [pos[ib], pos[ib + 1], pos[ib + 2]];
        const c = [pos[ic], pos[ic + 1], pos[ic + 2]];
        const n = norm(cross(sub(b, a), sub(c, a)));
        const viewDir = norm(sub(eye, a));
        if (dot(n, viewDir) <= 0) continue;      // back-face culling, double sided if needed
        const pa = project(a), pb = project(b), pc = project(c);
        if (!pa || !pb || !pc) continue;
        const shade = 0.28 + 0.78 * Math.max(0, dot(n, light1)) + 0.30 * Math.max(0, dot(n, light2));
        const fres = Math.pow(1 - Math.max(0, dot(n, viewDir)), 3) * 0.30;
        // Specular: a tight highlight from the key light, which is what makes
        // car paint read as paint instead of plastic.
        const half = norm([light1[0] + viewDir[0], light1[1] + viewDir[1], light1[2] + viewDir[2]]);
        const spec = Math.pow(Math.max(0, dot(n, half)), 42) * (part.material === 'paint' || part.material === 'roof' || part.material === 'glass' || part.material === 'rim' ? 0.85 : 0.12);
        const groundFade = Math.min(1, 0.45 + a[1] * 0.9);
        const colour = base.map((v, k) => Math.min(255, 255 * (v * shade * groundFade + fres * 0.6 + spec + (k === 1 ? 0.02 : 0.03))));
        const minX = Math.max(0, Math.floor(Math.min(pa[0], pb[0], pc[0])));
        const maxX = Math.min(W - 1, Math.ceil(Math.max(pa[0], pb[0], pc[0])));
        const minY = Math.max(0, Math.floor(Math.min(pa[1], pb[1], pc[1])));
        const maxY = Math.min(H - 1, Math.ceil(Math.max(pa[1], pb[1], pc[1])));
        const area = (pb[0] - pa[0]) * (pc[1] - pa[1]) - (pc[0] - pa[0]) * (pb[1] - pa[1]);
        if (Math.abs(area) < 1e-6) continue;
        for (let y = minY; y <= maxY; y++) {
          for (let x = minX; x <= maxX; x++) {
            const px = x + 0.5, py = y + 0.5;
            const w0 = ((pb[0] - px) * (pc[1] - py) - (pc[0] - px) * (pb[1] - py)) / area;
            const w1 = ((pc[0] - px) * (pa[1] - py) - (pa[0] - px) * (pc[1] - py)) / area;
            const w2 = 1 - w0 - w1;
            if (w0 < 0 || w1 < 0 || w2 < 0) continue;
            const z = w0 * pa[2] + w1 * pb[2] + w2 * pc[2];
            const di = y * W + x;
            if (z >= depth[di]) continue;
            depth[di] = z;
            const o = di * 4;
            buf[o] = colour[0]; buf[o + 1] = colour[1]; buf[o + 2] = colour[2]; buf[o + 3] = 255;
          }
        }
      }
    }
  }
  return buf;
}

const args = process.argv.slice(2);
const only = args[0] && CLASS_PRESETS[args[0]] ? args[0] : null;
const classes = only ? [only] : Object.keys(CLASS_PRESETS);
mkdirSync('node_modules/.tmp/car-preview', { recursive: true });

// ONLY=body,cabin renders a subset of parts — the quickest way to see which
// piece is creating a shape you did not intend.
const only2 = process.env.ONLY ? new Set(process.env.ONLY.split(',')) : null;

const models = classes.map(cls => {
  const dims = modelDims({ body: cls });
  const built = buildCar({ dims, paint: paintForCar({ col: cls === 'suv' ? 'Silver' : cls === 'sedan' ? 'Pearl White' : 'Black' }).hex });
  if (!only2) return built;
  return { ...built, parts: built.parts.filter(part => only2.has(part.name) || only2.has(part.material)) };
});

if (only) {
  const angles = [['front34', 0.62, 0.20], ['side', 1.5708, 0.06], ['rear34', 3.6, 0.22], ['low', 0.95, -0.05], ['top', 0.6, 0.72]];
  for (const [name, az, el] of angles) {
    const buf = render(models, { azimuth: az, elevation: el, distance: 5.6 });
    const file = `node_modules/.tmp/car-preview/${only}-${name}.png`;
    await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).png().toFile(file);
    console.log('wrote', file);
  }
} else {
  const buf = render(models, { azimuth: 0.8, elevation: 0.26, distance: 6.6 });
  const file = 'node_modules/.tmp/car-preview/classes.png';
  await sharp(buf, { raw: { width: W, height: H, channels: 4 } }).png().toFile(file);
  console.log('wrote', file);
}
console.log('triangles:', models.map(m => m.stats.triangles).join(', '));
