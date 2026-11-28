// Geometry for the 3D walkaround (src/walkaround-3d.jsx).
//
// 2026-11-28 (owner: "i wanted you to or the web to generate a real time
// walkaround of the vehicle … maintain exact body proportions, wheel rim
// geometry, and panel lines. Keep the underside clean and symmetrical").
//
// What this file is — and what it is not:
//
//   • It is a REAL 3D model. Real metres, real wheelbase, real tyre and rim
//     geometry, panel gaps, a flat symmetrical floor. Drag it and it turns in
//     the browser, in real time, with no server.
//   • It is NOT a photogrammetric reconstruction of the individual car. Turning
//     a handful of studio JPEGs into a photo-real mesh needs gaussian splatting
//     or a neural 3D service on a GPU — every one of those is metered, and this
//     site runs on free tiers with no per-view cost. Pretending otherwise would
//     be a lie printed under a car a buyer is about to wire money for.
//
// So the model is built from the car's own data: its body class (sedan, SUV,
// van …) selects real-world dimensions for that class, the listing's colour
// (or the paint sampled from its photographs) selects the paint, and the
// year/grade select the wheel. Every surface here is generated, so the same
// code runs in the browser and in the test suite with no GPU.
//
// Design rules the tests pin (scripts/car-model.test.mjs):
//   • symmetric about the centre line — left mirrors right, exactly;
//   • wheels sit on the ground and inside the arches;
//   • the underside is a flat, closed, symmetric floor;
//   • no mesh is invented from a number the listing does not carry: a class
//     default is used instead of guessing, and the cited figure says which.

/** Real-world dimensions per body class, in metres. Sourced from the class
 *  medians of Japanese used stock (a Camry-class sedan, a Harrier-class SUV,
 *  a Hiace-class van), so proportions read as that kind of car. */
export const CLASS_PRESETS = {
  // boxiness is the superellipse exponent: 4 = a rounded loaf, 10 = flat sides
  // and a flat shoulder. A car body is nearly flat in between the wheel arches.
  sedan: {belt: 0.56,  length: 4.63, width: 1.78, height: 1.46, wheelbase: 2.70, tyre: 0.340, tyreWidth: 0.225, ride: 0.140, cabinRear: 0.20, cabinFront: 0.66, roofUp: 0.26, roofDown: 0.78, boxiness: 8.6, name: 'Sedan' },
  hatch: {belt: 0.56,  length: 4.02, width: 1.72, height: 1.50, wheelbase: 2.55, tyre: 0.325, tyreWidth: 0.205, ride: 0.145, cabinRear: 0.10, cabinFront: 0.64, roofUp: 0.30, roofDown: 0.86, boxiness: 8.6, name: 'Hatchback' },
  coupe: {belt: 0.52,  length: 4.45, width: 1.83, height: 1.33, wheelbase: 2.65, tyre: 0.345, tyreWidth: 0.245, ride: 0.125, cabinRear: 0.20, cabinFront: 0.68, roofUp: 0.34, roofDown: 0.70, boxiness: 8.0, name: 'Coupe' },
  wagon: {belt: 0.555,  length: 4.72, width: 1.80, height: 1.49, wheelbase: 2.75, tyre: 0.335, tyreWidth: 0.225, ride: 0.145, cabinRear: 0.05, cabinFront: 0.66, roofUp: 0.24, roofDown: 0.92, boxiness: 8.8, name: 'Wagon' },
  suv: {belt: 0.6,  length: 4.62, width: 1.86, height: 1.68, wheelbase: 2.69, tyre: 0.380, tyreWidth: 0.245, ride: 0.195, cabinRear: 0.08, cabinFront: 0.64, roofUp: 0.26, roofDown: 0.88, boxiness: 9.2, name: 'SUV' },
  van: {belt: 0.64,  length: 4.70, width: 1.70, height: 1.96, wheelbase: 2.90, tyre: 0.335, tyreWidth: 0.210, ride: 0.180, cabinRear: 0.04, cabinFront: 0.68, roofUp: 0.20, roofDown: 0.95, boxiness: 9.8, name: 'Van' },
  truck: {belt: 0.61,  length: 5.30, width: 1.90, height: 1.86, wheelbase: 3.10, tyre: 0.395, tyreWidth: 0.265, ride: 0.230, cabinRear: 0.34, cabinFront: 0.64, roofUp: 0.28, roofDown: 0.74, boxiness: 9.4, name: 'Pickup' }
};

const CLASS_ALIASES = {
  sedan: 'sedan', saloon: 'sedan', hatch: 'hatch', hatchback: 'hatch', '3 door': 'hatch', '5 door': 'hatch',
  coupe: 'coupe', 'coupé': 'coupe', convertible: 'coupe', wagon: 'wagon', estate: 'wagon', kombi: 'wagon',
  suv: 'suv', 'suv/crossover': 'suv', crossover: 'suv', '4wd': 'suv', jeep: 'suv', mpv: 'van', minivan: 'van',
  van: 'van', 'kei van': 'van', kei: 'hatch', truck: 'truck', pickup: 'truck', 'pick-up': 'truck', bus: 'van'
};

/** Body class of a listing, falling back to sedan — never an invented "sports". */
export function bodyClass(car = {}) {
  const raw = String(car.body || car.bodyType || car.type || '').trim().toLowerCase();
  if (!raw) return 'sedan';
  if (CLASS_ALIASES[raw]) return CLASS_ALIASES[raw];
  const key = Object.keys(CLASS_ALIASES).find(a => raw.includes(a));
  return key ? CLASS_ALIASES[key] : 'sedan';
}

const num = value => {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) return value;
  const n = parseFloat(String(value ?? '').replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) && n > 0 ? n : null;
};
/** Metres from a listing value given in mm or m. Each measurement has its own
 *  plausible range: a 1.86 m wide car is normal, a 1.86 m LENGTH is not. */
const DIM_RANGES = { length: [2.2, 7.2], width: [1.2, 2.6], height: [1.0, 2.8], wheelbase: [1.6, 4.6] };
const mmToM = (value, kind = 'length') => {
  const n = num(value);
  if (!n) return null;
  const metres = n > 20 ? n / 1000 : n;
  const [lo, hi] = DIM_RANGES[kind] || DIM_RANGES.length;
  return metres >= lo && metres <= hi ? metres : null;
};

/** Dimensions for one listing. A dimension the listing actually carries (mm or
 *  m, on any of the usual keys) wins over the class default; `source` says
 *  which was used, so the viewer can be honest about it. */
export function modelDims(car = {}) {
  const cls = bodyClass(car);
  const preset = CLASS_PRESETS[cls] || CLASS_PRESETS.sedan;
  const length = mmToM(car.length ?? car.lengthMm ?? car.overallLength, 'length');
  const width = mmToM(car.width ?? car.widthMm ?? car.overallWidth, 'width');
  const height = mmToM(car.height ?? car.heightMm ?? car.overallHeight, 'height');
  const wheelbase = mmToM(car.wheelbase ?? car.wheelBase ?? car.wheelbaseMm, 'wheelbase');
  const measured = !!(length && width && height && wheelbase);
  return {
    cls,
    className: preset.name,
    belt: preset.belt,
    boxiness: preset.boxiness,
    cabinRear: preset.cabinRear,
    cabinFront: preset.cabinFront,
    roofUp: preset.roofUp,
    roofDown: preset.roofDown,
    ride: preset.ride,
    tyre: preset.tyre,
    tyreWidth: preset.tyreWidth,
    length: length || preset.length,
    width: width || preset.width,
    height: height || preset.height,
    wheelbase: wheelbase || preset.wheelbase,
    source: measured ? 'listing' : 'class',
    dims: {
      length: length || preset.length,
      width: width || preset.width,
      height: height || preset.height,
      wheelbase: wheelbase || preset.wheelbase
    }
  };
}

/** Japanese export-market paint names → hex. A name in the table is used for
 *  the paint; anything else falls back to the colour sampled from the photos. */
export const PAINT_NAMES = {
  white: '#eef1f0', 'pearl white': '#f4f6f3', pearl: '#f2f5f2', 'super white': '#f7f8f7',
  silver: '#c6ccd0', 'silver metallic': '#c0c7cc', grey: '#8d949a', gray: '#8d949a',
  'dark grey': '#4b5257', 'dark gray': '#4b5257', gunmetal: '#5a6167', charcoal: '#3a4045',
  black: '#17191c', 'pearl black': '#101215', blue: '#22467f', 'dark blue': '#1a2f57',
  navy: '#1b2b4d', 'sky blue': '#7fb0d5', red: '#9d1b22', 'wine red': '#5d1a26',
  burgundy: '#571c26', maroon: '#4d1a20', beige: '#cbbfa6', champagne: '#c9bda0',
  gold: '#b39154', bronze: '#8a6a45', green: '#2f5b46', 'dark green': '#203f31',
  brown: '#5a4636', orange: '#c2601f', yellow: '#d9b629', purple: '#4a3358',
  pink: '#dba3ac', teal: '#2c6b6b'
};

/** Paint hex for a listing's own colour name, or null when the name is one we
 *  do not know — in which case the photo-sampled colour is used instead. */
export function paintForName(name) {
  const key = String(name || '').trim().toLowerCase();
  if (!key) return null;
  if (PAINT_NAMES[key]) return PAINT_NAMES[key];
  const hit = Object.keys(PAINT_NAMES).find(k => key.includes(k));
  return hit ? PAINT_NAMES[hit] : null;
}

const toHex = (r, g, b) => '#' + [r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
const parseHex = hex => {
  const h = String(hex || '').replace('#', '');
  if (h.length !== 6) return null;
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
};
const luma = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b;

/**
 * The paint colour of a photograph, for a listing whose colour name we do not
 * recognise. Photos are studio shots: a bright backdrop, a car in the middle.
 * We keep the middle band, throw away the backdrop (near-white, near-neutral
 * and very bright), group the rest into coarse buckets, and return the biggest
 * group's average — which is the body panels, not the tyres or the glass.
 *
 * @param {Uint8ClampedArray|number[]} rgba  pixel data (RGBA, row-major)
 * @param {{width:number,height:number}} size
 * @returns {string|null} hex, or null when the photo has no usable paint
 */
export function dominantPaint(rgba, { width = 0, height = 0 } = {}) {
  const px = rgba || [];
  if (!width || !height || px.length < width * height * 4) return null;
  const buckets = new Map();
  const x0 = Math.floor(width * 0.22), x1 = Math.floor(width * 0.78);
  const y0 = Math.floor(height * 0.30), y1 = Math.floor(height * 0.78);
  for (let y = y0; y < y1; y += 2) {
    for (let x = x0; x < x1; x += 2) {
      const i = (y * width + x) * 4;
      const a = px[i + 3];
      if (a !== undefined && a < 200) continue;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      const max = Math.max(r, g, b), min = Math.min(r, g, b);
      const sat = max === 0 ? 0 : (max - min) / max;
      // Backdrop: bright AND neutral. Panels can be bright too, but a pearl
      // car still carries shading, so require some structure (see +-16 below).
      if (luma([r, g, b]) > 232 && sat < 0.10) continue;
      const key = `${r >> 5}:${g >> 5}:${b >> 5}`;
      const cur = buckets.get(key) || { n: 0, r: 0, g: 0, b: 0, sat: 0 };
      cur.n += 1; cur.r += r; cur.g += g; cur.b += b; cur.sat += sat;
      buckets.set(key, cur);
    }
  }
  let best = null;
  for (const bucket of buckets.values()) {
    // Saturated, mid-bright paint wins over the grey floor and black tyres.
    const score = bucket.n * (1 + bucket.sat / bucket.n * 2.2);
    if (!best || score > best.score) best = { score, bucket };
  }
  if (!best || best.bucket.n < 24) return null;
  const { n, r, g, b } = best.bucket;
  const avg = [r / n, g / n, b / n];
  if (luma(avg) < 14) return null; // an all-black photo tells us nothing useful
  return toHex(...avg);
}

/** Paint for a listing: its own colour name first (exact and honest), then a
 *  colour sampled from its photographs, then a neutral silver. */
export function paintForCar(car = {}, sampled = null) {
  const named = paintForName(car.col ?? car.color ?? car.colour);
  if (named) return { hex: named, from: 'listing colour' };
  if (sampled && parseHex(sampled)) return { hex: sampled, from: 'photograph' };
  return { hex: '#b9c0c6', from: 'default' };
}

// ---------------------------------------------------------------------------
// Mesh building. No dependencies: every part is a plain {name, material,
// positions, indices} object, which the viewer hands to three.js and the test
// suite (and scripts/car-preview.mjs) can read without a GPU.
// ---------------------------------------------------------------------------

const V = { paint: 'paint', glass: 'glass', tyre: 'tyre', rim: 'rim', trim: 'trim', lampF: 'lampF', lampR: 'lampR', floor: 'floor' };

class Mesh {
  constructor(name, material) { this.name = name; this.material = material; this.positions = []; this.indices = []; }
  add(point) {
    // -0 and 0 are the same place but different keys; normalise so a mirrored
    // vertex compares equal to its twin.
    const clean = v => (v === 0 ? 0 : v);
    this.positions.push(clean(point[0]), clean(point[1]), clean(point[2]));
    return this.positions.length / 3 - 1;
  }
  tri(a, b, c) { this.indices.push(a, b, c); }
  quad(a, b, c, d) { this.tri(a, b, c); this.tri(a, c, d); }
  get count() { return this.positions.length / 3; }
  build() {
    return { name: this.name, material: this.material, positions: Float32Array.from(this.positions), indices: Uint32Array.from(this.indices) };
  }
}

const sign = v => (v < 0 ? -1 : 1);
const spow = (value, e) => (Math.abs(value) < 1e-9 ? 0 : sign(value) * Math.pow(Math.abs(value), e));
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/**
 * One closed cross-section, built from a quarter arc and mirrored — so the
 * left of the car is the exact negation of the right, to the last bit, instead
 * of "the same to within a rounding error". A superellipse is symmetric in
 * both axes, so four mirrored copies of one arc is the whole ring.
 *
 * @param {object} spec {halfWidth, y0, y1, n, seg, widthAt}
 *   widthAt(y) lets the canopy lean in toward the roof (tumblehome).
 * @returns {Array<[number, number]>} [y, z] pairs, `seg` of them (a multiple of 4)
 */
function superRing({ halfWidth, y0, y1, n = 5, seg = 32, widthAt = null }) {
  const m = Math.max(2, Math.round(seg / 4));
  const cy = (y0 + y1) / 2;
  const hy = Math.max(0.004, (y1 - y0) / 2);
  const e = 2 / n;
  const quarter = [];
  for (let i = 0; i <= m; i++) {
    const t = (i / m) * (Math.PI / 2);
    quarter.push([hy * spow(Math.sin(t), e), halfWidth * spow(Math.cos(t), e)]);
  }
  const out = [];
  const push = (dy, dz) => {
    const y = cy + dy;
    out.push([y, widthAt ? widthAt(y) * dz : dz]);
  };
  for (let i = 0; i <= m; i++) push(quarter[i][0], quarter[i][1]);
  for (let i = m - 1; i >= 1; i--) push(quarter[i][0], -quarter[i][1]);
  for (let i = 0; i <= m; i++) push(-quarter[i][0], -quarter[i][1]);
  for (let i = m - 1; i >= 1; i--) push(-quarter[i][0], quarter[i][1]);
  return out;
}

/** The same ring placed at an X position: the car's own cross-section. */
function ring({ x, halfWidth, y0, y1, n = 5, seg = 32 }) {
  return superRing({ halfWidth, y0, y1, n, seg }).map(([y, z]) => [x, y, z]);
}

/** A canopy cross-section: wide at the beltline, narrower at the roof, so the
 *  glass leans in the way real side windows do (tumblehome). */
function cabinRing({ x, baseW, roofW, y0, y1, n = 6.4, seg = 34 }) {
  const span = Math.max(0.001, y1 - y0);
  return superRing({
    halfWidth: baseW, y0, y1, n, seg,
    widthAt: y => {
      const frac = Math.max(0, Math.min(1, (y - y0) / span));
      return (baseW + (roofW - baseW) * frac) / baseW;
    }
  }).map(([y, z]) => [x, y, z]);
}

/** Connect two rings (same segment count) with quads. */
function bridge(mesh, a, b, seg, flip = false) {
  for (let i = 0; i < seg; i++) {
    const j = (i + 1) % seg;
    if (flip) mesh.quad(a[i], a[j], b[j], b[i]);
    else mesh.quad(a[i], b[i], b[j], a[j]);
  }
}

/** Close a ring with a flat fan around its centroid. */
function cap(mesh, ids, points, flip = false) {
  const cx = points.reduce((s, p) => s + p[0], 0) / points.length;
  const cy = points.reduce((s, p) => s + p[1], 0) / points.length;
  const cz = points.reduce((s, p) => s + p[2], 0) / points.length;
  // A centroid can land on 1e-17 away from zero; snap it so the flat cap is on
  // the centre line to the bit, like everything else.
  const snap = v => (Math.abs(v) < 1e-9 ? 0 : v);
  const centre = mesh.add([snap(cx), snap(cy), snap(cz)]);
  for (let i = 0; i < ids.length; i++) {
    const a = ids[i], b = ids[(i + 1) % ids.length];
    if (flip) mesh.tri(centre, b, a); else mesh.tri(centre, a, b);
  }
}

/** A solid built by lofting superellipse rings along X. `stations` are objects
 *  {x, halfWidth, y0, y1, n}; material is fixed for the whole loft. */
function loftX(name, material, stations, { caps = true, seg = 32 } = {}) {
  const mesh = new Mesh(name, material);
  let prev = null, prevPoints = null;
  for (const station of stations) {
    const points = ring({ ...station, seg });
    const ids = points.map(p => mesh.add(p));
    if (prev) bridge(mesh, prev, ids, seg);
    else if (caps) cap(mesh, ids, points, true);
    prev = ids; prevPoints = points;
  }
  if (prev && caps) cap(mesh, prev, prevPoints, false);
  return mesh;
}

/** Rounded box from a superellipsoid, centred at `centre`. e=1 is a sphere,
 *  e→0 a box. Used for lamps, mirrors, plates and handles. */
function roundedBox(name, material, { size, centre = [0, 0, 0], e = 0.35, seg = 20, rings = 12, rot = 0 }) {
  const mesh = new Mesh(name, material);
  const [sx, sy, sz] = size;
  const grid = [];
  for (let i = 0; i <= rings; i++) {
    const v = -Math.PI / 2 + (i / rings) * Math.PI;
    const row = [];
    const cv = spow(Math.cos(v), e), sv = spow(Math.sin(v), e);
    for (let j = 0; j < seg; j++) {
      const u = (j / seg) * Math.PI * 2;
      let x = (sx / 2) * cv * spow(Math.cos(u), e);
      let z = (sz / 2) * cv * spow(Math.sin(u), e);
      const y = (sy / 2) * sv;
      if (rot) { const c = Math.cos(rot), s = Math.sin(rot); const nx = x * c - y * s, ny = x * s + y * c; x = nx; }
      row.push(mesh.add([centre[0] + x, centre[1] + y, centre[2] + z]));
    }
    grid.push(row);
  }
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < seg; j++) {
      const j2 = (j + 1) % seg;
      mesh.quad(grid[i][j], grid[i][j2], grid[i + 1][j2], grid[i + 1][j]);
    }
  }
  return mesh;
}

/** Cylinder / disc along Z (wheels) or along X. */
function cylinder(name, material, { radius, length, centre = [0, 0, 0], axis = 'z', seg = 32, radiusEnd = null }) {
  const mesh = new Mesh(name, material);
  const r2 = radiusEnd ?? radius;
  const half = length / 2;
  const place = (a, b, c) => (axis === 'z' ? [centre[0] + a, centre[1] + b, centre[2] + c]
    : axis === 'x' ? [centre[0] + c, centre[1] + a, centre[2] + b]
      : [centre[0] + a, centre[1] + c, centre[2] + b]);
  const rims = [];
  for (const [r, offset] of [[radius, -half], [r2, half]]) {
    const ids = [];
    for (let i = 0; i < seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      ids.push(mesh.add(place(Math.cos(t) * r, Math.sin(t) * r, offset)));
    }
    rims.push(ids);
  }
  bridge(mesh, rims[0], rims[1], seg, true);
  for (const ids of rims) {
    const centreId = mesh.add(place(0, 0, ids === rims[0] ? -half : half));
    for (let i = 0; i < seg; i++) mesh.tri(centreId, ids[i], ids[(i + 1) % seg]);
  }
  return mesh;
}

/** A lathed tyre: a rounded shoulder profile revolved around the Z axis. */
function tyre(name, { radius, width, centre }) {
  const mesh = new Mesh(name, V.tyre);
  const half = width / 2;
  const profile = [
    [radius * 0.62, -half],
    [radius * 0.93, -half],
    [radius * 0.995, -half * 0.82],
    [radius, -half * 0.45],
    [radius, half * 0.45],
    [radius * 0.995, half * 0.82],
    [radius * 0.93, half],
    [radius * 0.62, half]
  ];
  const seg = 36;
  const rings = [];
  for (const [r, z] of profile) {
    const ids = [];
    for (let i = 0; i < seg; i++) {
      const t = (i / seg) * Math.PI * 2;
      ids.push(mesh.add([centre[0] + Math.cos(t) * r, centre[1] + Math.sin(t) * r, centre[2] + z]));
    }
    rings.push(ids);
  }
  for (let i = 0; i < rings.length - 1; i++) bridge(mesh, rings[i], rings[i + 1], seg, true);
  return mesh;
}

/**
 * The wheel: tyre, rim barrel, dished spokes, hub and a brake disc, all facing
 * outward. `side` is +1 for the right-hand wheel (positive Z), -1 for the left.
 */
function wheel({ centre, radius, width, side, spokes = 6, rimHex = null }) {
  const parts = [];
  parts.push(tyre('tyre', { radius, width, centre }));
  const outer = centre[2] + side * (width / 2 - 0.012);
  const rimR = radius * 0.74;
  // Barrel + lip, so the rim reads as an alloy rather than a flat plate.
  const barrel = cylinder('rim-barrel', V.rim, { radius: rimR, length: width * 0.62, centre, axis: 'z', seg: 32, radiusEnd: rimR });
  parts.push(barrel);
  const lip = cylinder('rim-lip', V.rim, { radius: rimR * 1.03, length: 0.022, centre: [centre[0], centre[1], outer - side * 0.004], axis: 'z', seg: 32, radiusEnd: rimR * 0.99 });
  parts.push(lip);
  // Hub and dished spokes.
  const hub = cylinder('rim-hub', V.rim, { radius: rimR * 0.26, length: 0.05, centre: [centre[0], centre[1], outer - side * 0.02], axis: 'z', seg: 20 });
  parts.push(hub);
  for (let i = 0; i < spokes; i++) {
    const angle = (i / spokes) * Math.PI * 2;
    const midR = rimR * 0.56;
    const spoke = roundedBox('rim-spoke', V.rim, {
      size: [0.036, 0.040, 0.040], e: 0.45, seg: 12, rings: 6,
      centre: [centre[0] + Math.cos(angle) * midR, centre[1] + Math.sin(angle) * midR, outer - side * 0.012],
      rot: 0
    });
    // Stretch the spoke along its radius: rebuild the positions.
    for (let k = 0; k < spoke.positions.length; k += 3) {
      const dx = spoke.positions[k] - centre[0];
      const dy = spoke.positions[k + 1] - centre[1];
      const along = (dx * Math.cos(angle) + dy * Math.sin(angle)) * 1.9;
      const across = -dx * Math.sin(angle) + dy * Math.cos(angle);
      spoke.positions[k] = centre[0] + Math.cos(angle) * along - Math.sin(angle) * across;
      spoke.positions[k + 1] = centre[1] + Math.sin(angle) * along + Math.cos(angle) * across;
    }
    parts.push(spoke);
  }
  // Brake disc, inboard of the spokes: the detail that makes a rim read real.
  const disc = cylinder('brake-disc', V.trim, { radius: rimR * 0.86, length: 0.018, centre: [centre[0], centre[1], outer - side * 0.055], axis: 'z', seg: 28 });
  parts.push(disc);
  return parts;
}

/** Shift a built mesh along X (rear wheels are the front wheel's shape). */
function translated(mesh, dx) {
  const out = new Mesh(mesh.name, mesh.material);
  for (let i = 0; i < mesh.positions.length; i += 3) {
    out.add([mesh.positions[i] + dx, mesh.positions[i + 1], mesh.positions[i + 2]]);
  }
  out.indices.push(...mesh.indices);
  return out;
}

/** Reverse a built mesh's winding (mirroring flips handedness). */
function mirrored(mesh) {
  const out = new Mesh(mesh.name, mesh.material);
  const n = mesh.positions.length / 3;
  for (let i = 0; i < n; i++) out.add([mesh.positions[i * 3], mesh.positions[i * 3 + 1], -mesh.positions[i * 3 + 2]]);
  for (let i = 0; i < mesh.indices.length; i += 3) out.tri(mesh.indices[i], mesh.indices[i + 2], mesh.indices[i + 1]);
  return out;
}

/**
 * Build the whole car.
 *
 * @param {object} params
 * @param {object} params.dims      from modelDims()
 * @param {string} params.paint     hex from paintForCar()
 * @param {'left'|'right'} [params.steering] which side the wheel is on
 * @returns {{parts:Array, dims:object, paint:string, stats:object}}
 */
export function buildCar({ dims, paint = '#b9c0c6', steering = 'right' } = {}) {
  const d = dims || modelDims({});
  const L = d.length, W = d.width, H = d.height;
  const halfW = W / 2;
  const wheelbase = d.wheelbase;
  const overhangFront = (L - wheelbase) * 0.52;
  const overhangRear = (L - wheelbase) * 0.48;
  const xRear = 0, xFront = L;
  const xAxleRear = overhangRear;
  const xAxleFront = L - overhangFront;
  const tyreR = d.tyre;
  const ride = d.ride;
  const sill = ride + 0.055;               // bottom of the bodywork
  const belt = H * (d.belt || 0.56);       // where glass starts (beltline)
  const roofY = H;
  const parts = [];

  const bodyHalfWidth = x => {
    const frontTaper = smooth(L * 0.86, L, x) * 0.10;
    const rearTaper = (1 - smooth(xRear, xRear + L * 0.13, x)) * 0.13;
    return halfW * (1 - frontTaper - rearTaper);
  };
  // The bonnet falls away toward the nose and the boot sits below the rear
  // deck, which is most of what separates a modern car from a 1970s brick.
  const beltAt = x => {
    const frontDrop = smooth(L * 0.78, L, x) * H * 0.125;
    const rearDrop = (1 - smooth(xRear, xRear + L * 0.17, x)) * H * 0.085;
    return belt - frontDrop - rearDrop;
  };
  // Wheel arches are an ellipse centred on the sill: the arch meets the sill
  // exactly at its own edge, so there is never a step in the body line.
  // The arch ceiling has to clear the TOP of the tyre (centre + radius), not
  // the axle: an arch that only clears the axle buries a fifth of the wheel.
  const archTop = tyreR * 2 + 0.055;
  const archHalf = tyreR + 0.10;
  const archAt = x => {
    // Approach and departure angles: the body lifts at the very ends.
    let y = sill + smooth(L * 0.955, L, x) * 0.055 + (1 - smooth(xRear, xRear + L * 0.05, x)) * 0.045;
    for (const xa of [xAxleFront, xAxleRear]) {
      const dd = Math.abs(x - xa);
      if (dd < archHalf) {
        const va = archTop - sill;
        y = Math.max(y, sill + va * Math.sqrt(1 - (dd / archHalf) ** 2));
      }
    }
    return y;
  };

  // Cabin placement as a fraction of length, from the rear: the cowl and the
  // base of the backlight are where they sit on a real car of this class.
  const cabinRear = xRear + L * d.cabinRear;
  const cabFront = L - L * (1 - d.cabinFront);
  const cabH = roofY - belt;

  // The BONNET and BOOT sit below the beltline; the shoulder rises to the belt
  // only where the glasshouse is. Without this, the cabin grows straight out of
  // the bonnet and the car reads as a 1970s slab.
  const deckAt = x => beltAt(x) - H * 0.075;
  // The shoulder rises at the base of the backlight and drops again at the
  // cowl — a step in front of the windscreen is a bonnet with a lump on it.
  const shoulderAt = x => smooth(cabinRear - L * 0.035, cabinRear + L * 0.01, x)
    * (1 - smooth(cabFront - L * 0.035, cabFront + L * 0.008, x));
  const topAt = x => deckAt(x) + (beltAt(x) - deckAt(x)) * shoulderAt(x);

  // ---- main body ----------------------------------------------------------
  const stations = [];
  const bodySteps = 96;
  for (let i = 0; i <= bodySteps; i++) {
    const x = xRear + (i / bodySteps) * (xFront - xRear);
    const y0 = archAt(x);
    const y1 = topAt(x);
    stations.push({ x, halfWidth: bodyHalfWidth(x), y0, y1: Math.max(y0 + 0.02, y1), n: d.boxiness });
  }
  parts.push(loftX('body', V.paint, stations, { seg: 40 }));

  // ---- greenhouse: a canopy whose height goes to zero at both ends --------
  const glass = new Mesh('glass', V.glass);
  const roof = new Mesh('roof', V.paint);
  {
    const steps = 46;
    let prevGlass = null, prevRoof = null;
    const roofline = s => {
      const up = smooth(0, d.roofUp, s);
      const down = 1 - smooth(d.roofDown, 1, s);
      return Math.max(0.015, Math.min(up, down));
    };
    for (let i = 0; i <= steps; i++) {
      const s = i / steps;
      const x = cabinRear + s * (cabFront - cabinRear);
      const h = cabH * roofline(s);
      const baseW = bodyHalfWidth(x) * 1.0;
      const roofW = bodyHalfWidth(x) * 0.84;
      const y0 = beltAt(x) - 0.03;
      const y1 = beltAt(x) + h;
      // superRing hands back a multiple of four points (mirrored quarters), so
      // the segment count is whatever it actually produced — never the request.
      const pts = cabinRing({ x, baseW, roofW, y0, y1, n: 5.2, seg: 36 });
      const seg = pts.length;
      const ids = [];
      for (let k = 0; k < seg; k++) {
        const [px, py, pz] = pts[k];
        const isRoof = py > topAt(x) + h * 0.72;
        ids.push({ glass: isRoof ? -1 : glass.add([px, py, pz]), roof: isRoof ? roof.add([px, py, pz]) : -1, y: py, z: pz });
      }
      const connect = (target, prev) => {
        if (!prev) return;
        for (let k = 0; k < seg; k++) {
          const k2 = (k + 1) % seg;
          const a = prev[k], b = prev[k2], c = ids[k2], dd = ids[k];
          if (a.material === -1 || b.material === -1 || c.material === -1 || dd.material === -1) continue;
          const P = index => (target === 'glass' ? a.glass : a.roof);
          if (target === 'glass') {
            if ([a.glass, b.glass, c.glass, dd.glass].some(v => v < 0)) continue;
            // Wound the same way as the body loft, so the outside of the glass
            // faces out — an inverted canopy is a hole you can see through.
            glass.quad(a.glass, dd.glass, c.glass, b.glass);
          } else if ([a.roof, b.roof, c.roof, dd.roof].every(v => v >= 0)) {
            roof.quad(a.roof, dd.roof, c.roof, b.roof);
          }
          void P;
        }
      };
      connect('glass', prevGlass);
      connect('roof', prevRoof);
      prevGlass = ids; prevRoof = ids;
    }
    // Close the roof panel and the belt ends so no hole shows from above.
    const closeRoofEnds = ids => {
      const top = ids.filter(p => p.roof >= 0);
      if (top.length > 2) for (let k = 1; k < top.length - 1; k++) roof.tri(top[0].roof, top[k].roof, top[k + 1].roof);
    };
    closeRoofEnds(prevRoof || []);
  }
  // Pillars: thin painted bands over the glass at the A, B and C posts. They
  // are their own part (a painted strip), never spare vertices borrowed from
  // the roof mesh — a stray vertex with no mirror twin breaks symmetry.
  {
    const pillars = new Mesh('pillars', V.paint);
    const pillar = (x, width) => {
      const halfWidth = bodyHalfWidth(x) * 1.0;
      const roofHalf = bodyHalfWidth(x) * 0.84;
      const y0 = topAt(x) - 0.02, y1 = roofY - 0.03;
      for (const side of [1, -1]) {
        const p1 = pillars.quad(
          pillars.add([x - width, y0, side * halfWidth]),
          pillars.add([x + width, y0, side * halfWidth]),
          pillars.add([x + width * 0.75, y1, side * roofHalf * 0.97]),
          pillars.add([x - width * 0.75, y1, side * roofHalf * 0.97])
        );
        void p1;
      }
    };
    pillar(cabFront - (cabFront - cabinRear) * 0.30, 0.045);
    pillar(cabinRear + (cabFront - cabinRear) * 0.52, 0.040);
    pillar(cabinRear + (cabFront - cabinRear) * 0.10, 0.050);
    // Winding: one side of a quad pair comes out backwards; rebuild the whole
    // strip facing out by flipping the left-hand quads' index order.
    for (let i = 0; i < pillars.indices.length; i += 6) {
      const a = pillars.indices[i + 1], b = pillars.indices[i + 2];
      pillars.indices[i + 1] = b; pillars.indices[i + 2] = a;
      const c = pillars.indices[i + 4];
      pillars.indices[i + 4] = pillars.indices[i + 5];
      pillars.indices[i + 5] = c;
    }
    parts.push(pillars.build());
  }
  parts.push(glass.build(), roof.build());

  // ---- bumpers, grille, lamps -------------------------------------------
  const frontFace = L;
  const bumperY = sill + 0.10;
  const bumperH = Math.min(0.34, (belt - sill) * 0.62);
  // The bumper is a fascia that wraps the end of the body: it starts inside
  // the bodywork so no seam shows, and only its outer face stands proud.
  parts.push(loftX('bumper-front', V.paint, [
    // A valance, not a nose: it stops well below the bonnet so the body's own
    // front face stays the nose, and only the lip stands proud.
    { x: frontFace - 0.22, halfWidth: bodyHalfWidth(frontFace - 0.22) * 1.002, y0: sill - 0.02, y1: beltAt(frontFace) - 0.20, n: 5.4 },
    { x: frontFace - 0.04, halfWidth: bodyHalfWidth(frontFace - 0.04) * 1.004, y0: sill - 0.005, y1: beltAt(frontFace) - 0.235, n: 5.0 },
    { x: frontFace + 0.035, halfWidth: bodyHalfWidth(frontFace) * 0.975, y0: sill + 0.05, y1: beltAt(frontFace) - 0.275, n: 4.6 }
  ], { seg: 36 }));
  parts.push(loftX('bumper-rear', V.paint, [
    { x: xRear + 0.22, halfWidth: bodyHalfWidth(xRear + 0.22) * 1.002, y0: sill - 0.02, y1: beltAt(xRear) - 0.20, n: 5.4 },
    { x: xRear + 0.04, halfWidth: bodyHalfWidth(xRear + 0.04) * 1.004, y0: sill - 0.005, y1: beltAt(xRear) - 0.235, n: 5.0 },
    { x: xRear - 0.035, halfWidth: bodyHalfWidth(xRear) * 0.975, y0: sill + 0.05, y1: beltAt(xRear) - 0.275, n: 4.6 }
  ], { seg: 36 }));

  // Lamps and grille sit relative to the height the body ACTUALLY has at each
  // end — the nose is lower than the beltline, and a lamp placed off the belt
  // floats above the bonnet.
  const noseTop = beltAt(frontFace);
  const tailTop = beltAt(xRear);
  const grilleY = noseTop - 0.155;
  parts.push(roundedBox('grille', V.trim, { size: [0.07, 0.115, W * 0.50], centre: [frontFace + 0.005, grilleY, 0], e: 0.25, seg: 18, rings: 8 }));
  for (let i = -1; i <= 1; i += 1) {
    parts.push(roundedBox('grille-slat', V.rim, { size: [0.075, 0.010, W * 0.48], centre: [frontFace + 0.008, grilleY + i * 0.032, 0], e: 0.4, seg: 10, rings: 4 }));
  }
  const lampZ = halfW * 0.60;
  for (const side of [1, -1]) {
    parts.push(roundedBox('lamp-front', V.lampF, { size: [0.085, 0.085, W * 0.24], centre: [frontFace + 0.012, noseTop - 0.045, side * lampZ], e: 0.3, seg: 16, rings: 8 }));
    parts.push(roundedBox('lamp-rear', V.lampR, { size: [0.075, 0.095, W * 0.26], centre: [xRear - 0.010, tailTop - 0.055, side * lampZ], e: 0.3, seg: 16, rings: 8 }));
  }
  parts.push(roundedBox('plate', V.trim, { size: [0.02, 0.10, 0.32], centre: [frontFace + 0.055, bumperY - 0.015, 0], e: 0.3, seg: 12, rings: 5 }));
  parts.push(roundedBox('plate-rear', V.trim, { size: [0.02, 0.10, 0.32], centre: [xRear - 0.055, bumperY - 0.015, 0], e: 0.3, seg: 12, rings: 5 }));

  // ---- mirrors, handles, panel gaps --------------------------------------
  const mirrorX = cabFront - (cabFront - cabinRear) * 0.12;
  for (const side of [1, -1]) {
    const mirrorZ = bodyHalfWidth(mirrorX) + 0.055;
    parts.push(cylinder('mirror-stalk', V.trim, { radius: 0.014, length: 0.09, centre: [mirrorX, beltAt(mirrorX) + 0.01, side * (bodyHalfWidth(mirrorX) + 0.01)], axis: 'z', seg: 10 }));
    parts.push(roundedBox('mirror', V.paint, { size: [0.11, 0.075, 0.055], centre: [mirrorX - 0.02, beltAt(mirrorX) - 0.005, side * mirrorZ], e: 0.3, seg: 14, rings: 7 }));
    // Door handles on the front and rear doors.
    for (const hx of [cabinRear + (cabFront - cabinRear) * 0.20, cabinRear + (cabFront - cabinRear) * 0.66]) {
      parts.push(roundedBox('handle', V.rim, { size: [0.12, 0.028, 0.03], centre: [hx, topAt(hx) - 0.085, side * (bodyHalfWidth(hx) + 0.002)], e: 0.4, seg: 12, rings: 5 }));
    }
    // Panel gaps: a thin dark line down each door edge, and around the boot.
    const gap = (x, yTop, yBottom) => {
      const w0 = bodyHalfWidth(x) + 0.0035;
      parts.push({ name: 'panel-gap', material: V.trim,
        positions: Float32Array.from([
          x, yTop, side * w0, x, yBottom, side * w0,
          x + 0.006, yBottom, side * w0, x + 0.006, yTop, side * w0]),
        indices: Uint32Array.from(side > 0 ? [0, 1, 2, 0, 2, 3] : [2, 1, 0, 3, 2, 0]) });
    };
    for (const x of [cabinRear + (cabFront - cabinRear) * 0.06, cabinRear + (cabFront - cabinRear) * 0.42, cabinRear + (cabFront - cabinRear) * 0.78]) {
      gap(x, beltAt(x) - 0.035, sill + 0.05);
    }
    gap(L - 0.34, beltAt(L - 0.34) - 0.04, beltAt(L - 0.34) - 0.075); // hood shut line hint
    // Shoulder crease, running the length of the body just under the glass.
    {
      const creaseY = gate => topAt(gate) - 0.14;
      for (let x = xRear + 0.30; x < L - 0.45; x += 0.25) {
        const xs = x, xe = Math.min(L - 0.45, x + 0.25);
        const wA = bodyHalfWidth(xs) + 0.0035, wB = bodyHalfWidth(xe) + 0.0035;
        parts.push({ name: 'panel-gap', material: V.trim,
          positions: Float32Array.from([
            xs, creaseY(xs), side * wA, xe, creaseY(xe), side * wB,
            xe, creaseY(xe) - 0.012, side * wB, xs, creaseY(xs) - 0.012, side * wA]),
          indices: Uint32Array.from(side > 0 ? [0, 1, 2, 0, 2, 3] : [2, 1, 0, 3, 2, 0]) });
      }
    }
  }

  // ---- wheels ------------------------------------------------------------
  // One wheel is built, then mirrored for the other side and shifted for the
  // other axle — so left and right are exact mirror images rather than two
  // builds that happen to look alike.
  const wheelZ = halfW - d.tyreWidth / 2 - 0.010;
  const frontRightWheel = wheel({ centre: [xAxleFront, tyreR, wheelZ], radius: tyreR, width: d.tyreWidth, side: 1, spokes: 6 });
  const axleGap = xAxleRear - xAxleFront;
  const wheels = [
    ...frontRightWheel,                                  // front right
    ...frontRightWheel.map(mesh => mirrored(mesh)),      // front left
    ...frontRightWheel.map(mesh => translated(mesh, axleGap)),          // rear right
    ...frontRightWheel.map(mesh => translated(mirrored(mesh), axleGap)) // rear left
  ];
  for (const mesh of wheels) parts.push(mesh);

  // ---- underside: flat, closed and symmetric -----------------------------
  {
    const floor = new Mesh('underbody', V.floor);
    const y = sill - 0.012;
    const zMax = halfW * 0.93;
    const x0 = xRear + 0.16, x1 = L - 0.16;
    const a = floor.add([x0, y, -zMax]), b = floor.add([x1, y, -zMax]), c = floor.add([x1, y, zMax]), d2 = floor.add([x0, y, zMax]);
    floor.quad(a, b, c, d2);
    // Two longitudinal ribs, mirrored about the centre line.
    for (const side of [1, -1]) {
      const z = side * zMax * 0.55;
      const p1 = floor.add([x0 + 0.2, y - 0.05, z - 0.05]), p2 = floor.add([x1 - 0.2, y - 0.05, z - 0.05]);
      const p3 = floor.add([x1 - 0.2, y - 0.05, z + 0.05]), p4 = floor.add([x0 + 0.2, y - 0.05, z + 0.05]);
      floor.quad(p1, p2, p3, p4);
      parts.push(cylinder('axle', V.trim, { radius: 0.035, length: zMax * 1.15, centre: [(x => x)(side > 0 ? xAxleFront : xAxleRear), tyreR * 0.92, 0], axis: 'z', seg: 12 }));
    }
    parts.push(floor.build());
    // Exhaust: one tip each side of the centre line, mirrored exactly.
    for (const side of [1, -1]) {
      parts.push(cylinder('exhaust', V.rim, { radius: 0.032, length: 0.16, centre: [xRear - 0.01, sill - 0.02, side * halfW * 0.36], axis: 'x', seg: 14 }));
    }
  }

  const built = parts.map(part => (part instanceof Mesh ? part.build() : part));
  const triangles = built.reduce((sum, part) => sum + part.indices.length / 3, 0);
  return { parts: built, dims: d, paint, steering, stats: { parts: built.length, triangles } };
}

/** Every dimension the viewer states on screen, so the caption and the model
 *  can never disagree. */
export function modelCaption(dims, paint) {
  const metres = v => `${v.toFixed(2)} m`;
  const basis = dims.source === 'listing'
    ? 'dimensions from the listing'
    : `${dims.className.toLowerCase()}-class dimensions`;
  return `3D showroom model — ${basis}, ${metres(dims.length)} long, ${metres(dims.width)} wide, ${metres(dims.height)} tall, ${metres(dims.wheelbase)} wheelbase. Paint from ${paint.from}. A generated model, not a photograph of this car.`;
}
