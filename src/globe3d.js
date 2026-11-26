// ---------------------------------------------------------------------------
// 2026-11-10 — THE AR7 3D GLOBE ENGINE (owner request: "redesign the globes,
// completely free rotation, smoother, countries accurate and in the right
// place on the map").
//
// The previous globes slid a FLAT equirectangular strip behind a circular
// mask — countries near the edge were stretched and the "rotation" was a
// scroll, not a spin. This engine renders a true ORTHOGRAPHIC projection of
// real Natural Earth 110m geometry (src/world-geo.js) on a <canvas>:
//
//   • free rotation on BOTH axes — drag anywhere, with inertia; longitude is
//     endless, latitude is clamped at the poles like every real globe app;
//   • every country is drawn from its real polygon, so each landmass sits at
//     its exact place and keeps its true shape while the sphere turns;
//   • live day & night — the real terminator from the current UTC time;
//   • animated great-circle routes with sailing ships (canvas, cheap);
//   • HTML overlay markers: any child of the host carrying data-lon/data-lat
//     is repositioned every frame and hidden while on the far hemisphere, so
//     flags and chips are real, clickable DOM (SEO/a11y friendly);
//   • rAF pauses off-screen / hidden-tab; honours prefers-reduced-motion;
//   • safe in jsdom (no 2D context → inert no-op cleanup).
//
// No dependencies: ~5k vertices × a handful of multiplications per frame.
// This module lives only in lazy chunks — never in the first-load bundle.
// ---------------------------------------------------------------------------
import { LAND, BORDERS, COUNTRIES } from './world-geo.js';
import earcut from 'earcut';

const RAD = Math.PI / 180;

/* Pre-compute sin/cos for every vertex ONCE — per frame we only multiply. */
function prep(flat) {
  const n = flat.length / 2;
  const cl = new Float32Array(n), sl = new Float32Array(n);
  const cp = new Float32Array(n), sp = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const lon = flat[2 * i] * RAD, lat = flat[2 * i + 1] * RAD;
    cl[i] = Math.cos(lon); sl[i] = Math.sin(lon);
    cp[i] = Math.cos(lat); sp[i] = Math.sin(lat);
  }
  return { n, cl, sl, cp, sp };
}
// 2026-11-10 (owner: "the water turned gold while rotating"): land polygons
// are pre-TRIANGULATED by the generator. Filling whole horizon-clamped rings
// let a half-hidden continent close its outline straight across open ocean;
// per-triangle culling makes that impossible — a triangle only ever covers
// its own few square degrees of land, so the sea stays green from every
// angle. o = ring offsets (coastline strokes), t = Uint16 triangle indices.
const LAND_P = LAND.map(p => ({ ...prep(p.v), o: p.o, t: Uint16Array.from(p.t) }));
const BORDER_P = BORDERS.map(prep);

// 2026-11-11 (owner: "do all the globe upgrades") — named country polygons.
// Hover/tap hit-testing uses even-odd ray casting over the raw rings (holes
// just work); the highlight fill triangulates the touched country ON DEMAND
// with earcut and caches it, so the one country someone points at costs a
// millisecond once and nothing after.
const bboxOf = f => {
  let a = 1e9, b = 1e9, c = -1e9, d = -1e9;
  for (let i = 0; i < f.length; i += 2) {
    if (f[i] < a) a = f[i]; if (f[i] > c) c = f[i];
    if (f[i + 1] < b) b = f[i + 1]; if (f[i + 1] > d) d = f[i + 1];
  }
  return [a, b, c, d];
};
const CTRY_P = COUNTRIES.map(c => ({ n: c.n, rings: c.r, p: c.r.map(prep), b: c.r.map(bboxOf) }));
const ctryTriCache = new Map(); // country index -> per-ring Uint16 triangle lists
const ctryTris = ci => {
  let t = ctryTriCache.get(ci);
  if (!t) { t = CTRY_P[ci].rings.map(f => Uint16Array.from(earcut(f, null, 2))); ctryTriCache.set(ci, t); }
  return t;
};
const inRing = (f, lon, lat) => {
  let hit = false;
  for (let i = 0, j = f.length - 2; i < f.length; j = i, i += 2) {
    const x1 = f[i], y1 = f[i + 1], x2 = f[j], y2 = f[j + 1];
    if ((y1 > lat) !== (y2 > lat) && lon < (x2 - x1) * (lat - y1) / (y2 - y1) + x1) hit = !hit;
  }
  return hit;
};
const hitCountry = (lon, lat) => {
  for (let ci = 0; ci < CTRY_P.length; ci++) {
    const c = CTRY_P[ci];
    let odd = false;
    for (let r = 0; r < c.rings.length; r++) {
      const b = c.b[r];
      if (lon < b[0] || lon > b[2] || lat < b[1] || lat > b[3]) continue;
      if (inRing(c.rings[r], lon, lat)) odd = !odd;
    }
    if (odd) return ci;
  }
  return -1;
};

const MAX_POLY = Math.max(
  LAND_P.reduce((m, p) => Math.max(m, p.n), 0),
  CTRY_P.reduce((m, c) => Math.max(m, ...c.p.map(r => r.n)), 0)
);

// Major port & trade cities — warm "city lights" on the night side.
const CITIES = [
  [139.7, 35.7], [135.5, 34.7], [137, 35.2], [127, 37.5], [116.4, 39.9], [121.5, 31.2],
  [114.2, 22.3], [103.8, 1.35], [100.5, 13.7], [106.8, -6.2], [121, 14.6], [77.2, 28.6],
  [72.9, 19.1], [67, 24.9], [74.3, 31.5], [69.2, 34.5], [51.4, 35.7], [55.3, 25.3],
  [46.7, 24.7], [29, 41], [37.6, 55.8], [31.2, 30.1], [36.8, -1.3], [39.7, -4],
  [39.3, -6.8], [3.4, 6.5], [28, -26.2], [-0.1, 51.5], [2.3, 48.9], [13.4, 52.5],
  [-3.7, 40.4], [-74, 40.7], [-87.6, 41.9], [-118.2, 34], [-79.4, 43.7], [-99.1, 19.4],
  [-46.6, -23.5], [-58.4, -34.6], [-77, -12], [151.2, -33.9], [145, -37.8],
  [174.8, -36.8], [115.9, -32], [18.4, -33.9], [45.3, 2]
].map(([lon, lat]) => ({ lon, lat, cl: Math.cos(lon * RAD), sl: Math.sin(lon * RAD), cp: Math.cos(lat * RAD), sp: Math.sin(lat * RAD) }));

/* Deterministic PRNG — same star sky and cloud belt on every visit. */
const mulberry = seed => () => {
  seed |= 0; seed = seed + 0x6D2B79F5 | 0;
  let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
  t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
  return ((t ^ t >>> 14) >>> 0) / 4294967296;
};
const STARS = (() => {
  const rnd = mulberry(7), out = [];
  for (let i = 0; i < 140; i++) out.push({ fx: rnd(), fy: rnd(), r: 0.4 + rnd() * 1.1, a: 0.25 + rnd() * 0.6, ph: rnd() * Math.PI * 2, tw: 0.4 + rnd() * 1.6 });
  return out;
})();
const CLOUDS = (() => {
  const rnd = mulberry(21), out = [];
  for (let i = 0; i < 15; i++) out.push({ lon: -180 + rnd() * 360, lat: -52 + rnd() * 112, r: 7 + rnd() * 9, a: 0.05 + rnd() * 0.08, spd: 0.5 + rnd() });
  return out;
})();

/* Subsolar point from the real clock (same maths the old globe used). */
function sunLonLat(now = new Date()) {
  const start = Date.UTC(now.getUTCFullYear(), 0, 0);
  const doy = (now.getTime() - start) / 86400000;
  const decl = -23.44 * Math.cos(RAD * 360 / 365 * (doy + 10));
  const utcH = now.getUTCHours() + now.getUTCMinutes() / 60 + now.getUTCSeconds() / 3600;
  return [180 - utcH * 15, decl];
}

/* Great-circle interpolation (slerp on the unit sphere). */
function gcPoint(aLon, aLat, bLon, bLat, t) {
  const a = [Math.cos(aLat * RAD) * Math.cos(aLon * RAD), Math.cos(aLat * RAD) * Math.sin(aLon * RAD), Math.sin(aLat * RAD)];
  const b = [Math.cos(bLat * RAD) * Math.cos(bLon * RAD), Math.cos(bLat * RAD) * Math.sin(bLon * RAD), Math.sin(bLat * RAD)];
  const dot = Math.max(-1, Math.min(1, a[0] * b[0] + a[1] * b[1] + a[2] * b[2]));
  const ang = Math.acos(dot) || 1e-6;
  const s = Math.sin(ang);
  const f = Math.sin((1 - t) * ang) / s, g = Math.sin(t * ang) / s;
  const x = f * a[0] + g * b[0], y = f * a[1] + g * b[1], z = f * a[2] + g * b[2];
  return [Math.atan2(y, x) / RAD, Math.asin(Math.max(-1, Math.min(1, z))) / RAD];
}

/**
 * Mount a 3D globe inside `host`. Returns a cleanup function.
 * The canvas child `.g3-canvas` must already exist in the host.
 */
export function mountGlobe(host, opts = {}) {
  const noop = () => {};
  if (!host) return noop;
  const canvas = host.querySelector('.g3-canvas');
  if (!canvas || typeof canvas.getContext !== 'function') return noop;
  // jsdom defines getContext but logs a "Not implemented" console error when
  // it runs without the optional canvas package — detect the real 2D API
  // first so test environments stay silent.
  if (typeof CanvasRenderingContext2D === 'undefined') return noop;
  let ctx = null;
  try { ctx = canvas.getContext('2d'); } catch { return noop; }
  if (!ctx) return noop;

  const o = {
    lam: 95, phi: 22,            // start centred near Japan↔Gulf trade lanes
    autoRotate: 0.055,           // deg per 16ms frame while idle
    night: true,
    borders: true,
    graticule: true,
    routes: [],                  // [{lon,lat}] destinations
    origin: { lon: 138, lat: 36 },
    markers: true,
    interactive: true,
    detail: 1,                   // 0 = mini decorative globes (skip fine work)
    // 2026-11-11 upgrades — each is opt-in so the mini orbs stay featherweight
    sun: true,                   // light the sphere from the real sun's direction
    stars: false,                // deterministic starfield behind the sphere
    clouds: false,               // drifting translucent cloud patches
    cities: false,               // warm city lights on the night side
    names: false,                // country hover/tap: highlight + name tooltip
    zoom: false,                 // ctrl+wheel / pinch zoom, double-click toggles
    // 2026-11-16 Lighthouse round 2: the engine's per-frame cost is
    // RESOLUTION-INDEPENDENT (every frame projects the whole Natural Earth
    // landmass and rebuilds the land Path2D), so a 56px nav orb at 60fps
    // burned the same CPU as the full showcase globe — ~12s of main-thread
    // work in a throttled trace, dwarfing everything else on the page.
    //   idleFps — while nobody is interacting, frames are skipped down to
    //             this rate; drags, zooms, flyTo and hover run at full rAF.
    //   sleep   — decorative orbs mount with ONE static frame and only start
    //             animating on the first real user gesture (scroll, pointer,
    //             key, touch). Bots and audits never move, humans always do.
    idleFps: 0,                  // 0 = uncapped (showcase default comes from opts)
    sleep: false,
    ...opts
  };
  if (!o.idleFps) o.idleFps = o.detail === 0 ? 14 : 30;

  // Offscreen buffer for the smooth day/night shading (see the render note).
  // Guarded: the engine-render test runs with DOM doubles that have no
  // createElement/ImageData, and jsdom has no real 2D raster — in both cases
  // night shading simply switches off while everything else keeps working.
  const NIGHT_S = 96;
  let nightCanvas = null, nightCtx = null, nightImg = null;
  try {
    if (o.night && typeof document !== 'undefined' && typeof document.createElement === 'function') {
      nightCanvas = document.createElement('canvas');
      nightCanvas.width = nightCanvas.height = NIGHT_S;
      nightCtx = nightCanvas.getContext && nightCanvas.getContext('2d');
      if (nightCtx && typeof nightCtx.createImageData === 'function' && typeof ctx.drawImage === 'function') {
        nightImg = nightCtx.createImageData(NIGHT_S, NIGHT_S);
        // pre-fill the night colour once — per frame only alpha changes
        const d = nightImg.data;
        for (let i = 0; i < d.length; i += 4) { d[i] = 1; d[i + 1] = 12; d[i + 2] = 7; }
      } else { nightCanvas = nightCtx = null; }
    }
  } catch { nightCanvas = nightCtx = nightImg = null; }

  const st = {
    lam: o.lam, phi: o.phi, vLam: 0, vPhi: 0,
    drag: false, lx: 0, ly: 0, sx: 0, sy: 0, moved: false,
    raf: 0, prev: performance.now(), visible: false, destroyed: false,
    w: 0, h: 0, dpr: 1, dash: 0, shipT: 0,
    zoom: 1, zoomT: 1,           // current / target zoom (eased in the loop)
    hoverC: -1, hvX: 0, hvY: 0,  // hovered country + pointer position
    fly: null,                   // active flyTo animation
    pts: new Map(), pinch: 0,    // active pointers (two = pinch zoom)
    drift: 0, clock: 0,          // cloud drift (deg) + star twinkle clock
    acc: 0                       // ms banked toward the next idle-capped frame
  };
  let awake = !o.sleep;          // sleep:true waits for the first user gesture
  const motionQuery = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)');
  let reduced = !!motionQuery?.matches;

  // per-frame projection scratch (one polygon at a time)
  const scrX = new Float32Array(MAX_POLY), scrY = new Float32Array(MAX_POLY), scrC = new Float32Array(MAX_POLY);

  const measure = () => {
    const rect = canvas.getBoundingClientRect();
    st.dpr = Math.min(2, window.devicePixelRatio || 1);
    st.w = Math.max(10, rect.width); st.h = Math.max(10, rect.height);
    canvas.width = Math.round(st.w * st.dpr);
    canvas.height = Math.round(st.h * st.dpr);
  };

  /* ---- the heart: one orthographic frame ---- */
  const render = () => {
    if (!st.w) measure();
    const w = st.w, h = st.h, dpr = st.dpr;
    const cx = w / 2, cy = h / 2;
    const R = Math.min(w, h) / 2 * 0.985 * st.zoom;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    /* starfield — deterministic sky behind the sphere */
    if (o.stars) {
      for (const sr of STARS) {
        const tw = 0.55 + 0.45 * Math.sin(st.clock * sr.tw + sr.ph);
        ctx.fillStyle = `rgba(214,233,255,${(sr.a * tw).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(sr.fx * w, sr.fy * h, sr.r, 0, Math.PI * 2); ctx.fill();
      }
    }

    const SUN = sunLonLat();
    const sunV = [Math.cos(SUN[1] * RAD) * Math.cos(SUN[0] * RAD), Math.cos(SUN[1] * RAD) * Math.sin(SUN[0] * RAD), Math.sin(SUN[1] * RAD)];

    const lam0 = st.lam * RAD, phi0 = st.phi * RAD;
    const cL = Math.cos(lam0), sL = Math.sin(lam0);
    const cP = Math.cos(phi0), sP = Math.sin(phi0);

    // project a prepped vertex i → writes [X, Y, cosc] into out
    const proj = (p, i, out) => {
      const cdl = p.cl[i] * cL + p.sl[i] * sL;      // cos(lon-lam0)
      const sdl = p.sl[i] * cL - p.cl[i] * sL;      // sin(lon-lam0)
      const x = p.cp[i] * sdl;
      const y = cP * p.sp[i] - sP * p.cp[i] * cdl;
      const cosc = sP * p.sp[i] + cP * p.cp[i] * cdl;
      out[0] = x; out[1] = y; out[2] = cosc;
    };
    const projLL = (lon, lat, out) => {
      const l = lon * RAD, f = lat * RAD;
      const cdl = Math.cos(l - lam0), sdl = Math.sin(l - lam0);
      const cf = Math.cos(f), sf = Math.sin(f);
      out[0] = cf * sdl;
      out[1] = cP * sf - sP * cf * cdl;
      out[2] = sP * sf + cP * cf * cdl;
    };
    const v = [0, 0, 0];

    /* ocean sphere */
    const og = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.4, R * 0.1, cx, cy, R);
    og.addColorStop(0, '#0f6a45'); og.addColorStop(0.55, '#06402a'); og.addColorStop(1, '#022316');
    ctx.fillStyle = '#032619';
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = og;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fill();

    ctx.save();
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.clip();

    /* graticule */
    if (o.graticule) {
      ctx.strokeStyle = 'rgba(255,255,255,.085)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let lon = -180; lon < 180; lon += 30) {
        let pen = false;
        for (let lat = -84; lat <= 84; lat += 6) {
          projLL(lon, lat, v);
          if (v[2] > 0.01) {
            const px = cx + v[0] * R, py = cy - v[1] * R;
            if (pen) ctx.lineTo(px, py); else { ctx.moveTo(px, py); pen = true; }
          } else pen = false;
        }
      }
      for (let lat = -60; lat <= 60; lat += 30) {
        let pen = false;
        for (let lon = -180; lon <= 180; lon += 6) {
          projLL(lon, lat, v);
          if (v[2] > 0.01) {
            const px = cx + v[0] * R, py = cy - v[1] * R;
            if (pen) ctx.lineTo(px, py); else { ctx.moveTo(px, py); pen = true; }
          } else pen = false;
        }
      }
      ctx.stroke();
    }

    /* land — brand gold relief, drawn triangle by triangle so a half-hidden
       continent can never flood the ocean with gold (see LAND_P note). */
    const landPath = new Path2D();
    const coastPath = new Path2D();
    for (const p of LAND_P) {
      // project every vertex of this polygon once (clamped x/y + visibility)
      let anyFront = false;
      for (let i = 0; i < p.n; i++) {
        proj(p, i, v);
        let x = v[0], y = v[1];
        if (v[2] < 0) { const d = Math.hypot(x, y) || 1; x /= d; y /= d; }
        scrX[i] = cx + x * R; scrY[i] = cy - y * R; scrC[i] = v[2];
        if (v[2] > 0) anyFront = true;
      }
      if (!anyFront) continue; // whole polygon on the far side
      const t = p.t;
      for (let k = 0; k < t.length; k += 3) {
        const a1 = t[k], b1 = t[k + 1], c1 = t[k + 2];
        if (scrC[a1] <= 0 && scrC[b1] <= 0 && scrC[c1] <= 0) continue;
        landPath.moveTo(scrX[a1], scrY[a1]);
        landPath.lineTo(scrX[b1], scrY[b1]);
        landPath.lineTo(scrX[c1], scrY[c1]);
        landPath.closePath();
      }
      // coastline: stroke only fully-visible ring segments (crisp, no limb arcs)
      for (let r = 0; r < p.o.length; r++) {
        const s0 = p.o[r], s1 = r + 1 < p.o.length ? p.o[r + 1] : p.n;
        for (let i = s0; i < s1; i++) {
          const j = i + 1 < s1 ? i + 1 : s0;
          if (scrC[i] > 0.01 && scrC[j] > 0.01) {
            coastPath.moveTo(scrX[i], scrY[i]);
            coastPath.lineTo(scrX[j], scrY[j]);
          }
        }
      }
    }
    const lg = ctx.createLinearGradient(0, cy - R, 0, cy + R);
    lg.addColorStop(0, '#f2c468'); lg.addColorStop(0.55, '#dca23a'); lg.addColorStop(1, '#b5801f');
    ctx.fillStyle = lg;
    ctx.shadowColor = 'rgba(0,20,12,.55)'; ctx.shadowBlur = R * 0.02; ctx.shadowOffsetY = 1;
    ctx.fill(landPath);
    ctx.shadowColor = 'transparent'; ctx.shadowBlur = 0; ctx.shadowOffsetY = 0;
    ctx.strokeStyle = 'rgba(243,205,120,.55)'; ctx.lineWidth = 0.8;
    ctx.lineCap = 'round';
    ctx.stroke(coastPath);

    /* country borders — thin engraved lines on the gold */
    if (o.borders && o.detail > 0) {
      ctx.strokeStyle = 'rgba(21,46,24,.38)';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      const a = [0, 0, 0], b = [0, 0, 0];
      for (const p of BORDER_P) {
        for (let i = 0; i < p.n - 1; i++) {
          proj(p, i, a); proj(p, i + 1, b);
          if (a[2] > 0.01 && b[2] > 0.01) {
            ctx.moveTo(cx + a[0] * R, cy - a[1] * R);
            ctx.lineTo(cx + b[0] * R, cy - b[1] * R);
          }
        }
      }
      ctx.stroke();
    }

    /* hovered/tapped country — brighter gold fill + crisp outline */
    if (o.names && st.hoverC >= 0) {
      const c = CTRY_P[st.hoverC];
      const tris = ctryTris(st.hoverC);
      const hp = new Path2D(), ho = new Path2D();
      for (let r = 0; r < c.p.length; r++) {
        const pr = c.p[r];
        let anyFront = false;
        for (let i = 0; i < pr.n; i++) {
          proj(pr, i, v);
          let x = v[0], y = v[1];
          if (v[2] < 0) { const d = Math.hypot(x, y) || 1; x /= d; y /= d; }
          scrX[i] = cx + x * R; scrY[i] = cy - y * R; scrC[i] = v[2];
          if (v[2] > 0) anyFront = true;
        }
        if (!anyFront) continue;
        const t = tris[r];
        for (let k = 0; k < t.length; k += 3) {
          const a1 = t[k], b1 = t[k + 1], c1 = t[k + 2];
          if (scrC[a1] <= 0 && scrC[b1] <= 0 && scrC[c1] <= 0) continue;
          hp.moveTo(scrX[a1], scrY[a1]); hp.lineTo(scrX[b1], scrY[b1]); hp.lineTo(scrX[c1], scrY[c1]); hp.closePath();
        }
        for (let i = 0; i < pr.n; i++) {
          const j = i + 1 < pr.n ? i + 1 : 0;
          if (scrC[i] > 0.01 && scrC[j] > 0.01) { ho.moveTo(scrX[i], scrY[i]); ho.lineTo(scrX[j], scrY[j]); }
        }
      }
      ctx.fillStyle = 'rgba(255,224,142,.45)';
      ctx.fill(hp);
      ctx.strokeStyle = 'rgba(255,236,178,.95)';
      ctx.lineWidth = 1.4;
      ctx.stroke(ho);
    }

    /* live night hemisphere — 2026-11-14 (owner: "the day/night transition is
       not smooth"): the old approach FILLED the exact terminator ring as a
       hard-edged Path2D, so day snapped to night along a crisp line. Now the
       shade is true per-pixel Lambert lighting: a small offscreen canvas (96²)
       computes dot(surface normal, sun) for every pixel of the disc, maps it
       through a smoothstep twilight band (dusk fades in over ~17° of arc) and
       is drawn scaled onto the sphere with bilinear smoothing. The terminator
       is now a soft dusk gradient from any camera angle, and the all-day /
       all-night edge cases fall out of the same maths for free. */
    if (o.night && nightImg) {
      projLL(SUN[0], SUN[1], v);                 // sun direction in VIEW space
      const sunX = v[0], sunY = v[1], sunZ = v[2];
      const data = nightImg.data;
      let k = 0;
      for (let j = 0; j < NIGHT_S; j++) {
        const Y = 1 - (j + 0.5) / NIGHT_S * 2;   // canvas y grows downward
        for (let i = 0; i < NIGHT_S; i++) {
          const X = (i + 0.5) / NIGHT_S * 2 - 1;
          const r2 = X * X + Y * Y;
          let a = 0;
          if (r2 <= 1) {
            const z = Math.sqrt(1 - r2);         // outward normal, toward viewer
            const lit = X * sunX + Y * sunY + z * sunZ;
            // twilight band: fully lit above +0.12, fully dark below -0.18
            let tt = (0.12 - lit) / 0.30;
            tt = tt < 0 ? 0 : tt > 1 ? 1 : tt;
            a = tt * tt * (3 - 2 * tt) * 0.5;    // smoothstep, max alpha .5
            if (r2 > 0.93) a *= (1 - r2) / 0.07; // feather the disc rim
          }
          data[k + 3] = (a * 255) | 0; k += 4;   // rgb pre-set to night colour
        }
      }
      nightCtx.putImageData(nightImg, 0, 0);
      const smoothWas = ctx.imageSmoothingEnabled;
      ctx.imageSmoothingEnabled = true;
      if ('imageSmoothingQuality' in ctx) ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(nightCanvas, cx - R, cy - R, 2 * R, 2 * R);
      ctx.imageSmoothingEnabled = smoothWas;
    }

    /* city lights — warm dots where the world is currently dark */
    if (o.cities && o.night) {
      for (const c of CITIES) {
        const cosc = Math.sin(st.phi * RAD) * c.sp + Math.cos(st.phi * RAD) * c.cp * (c.cl * Math.cos(st.lam * RAD) + c.sl * Math.sin(st.lam * RAD));
        if (cosc <= 0.04) continue;
        const cv = [c.cp * c.cl, c.cp * c.sl, c.sp];
        const dark = cv[0] * sunV[0] + cv[1] * sunV[1] + cv[2] * sunV[2] < -0.02;
        if (!dark) continue;
        projLL(c.lon, c.lat, v);
        const px = cx + v[0] * R, py = cy - v[1] * R;
        const a2 = Math.min(1, cosc * 2.2);
        ctx.fillStyle = `rgba(255,208,118,${(0.28 * a2).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(px, py, 3.4, 0, Math.PI * 2); ctx.fill();
        ctx.fillStyle = `rgba(255,224,150,${(0.95 * a2).toFixed(3)})`;
        ctx.beginPath(); ctx.arc(px, py, 1.3, 0, Math.PI * 2); ctx.fill();
      }
    }

    /* drifting translucent clouds — soft patches, foreshortened at the limb */
    if (o.clouds && o.detail > 0) {
      for (const cp2 of CLOUDS) {
        const lon = cp2.lon + st.drift * cp2.spd;
        projLL(lon, cp2.lat, v);
        if (v[2] <= 0.02) continue;
        const px = cx + v[0] * R, py = cy - v[1] * R;
        const rad = Math.max(4, R * Math.sin(cp2.r * RAD));
        const al = cp2.a * Math.pow(v[2], 1.4);
        const cg = ctx.createRadialGradient(px, py, 0, px, py, rad);
        cg.addColorStop(0, `rgba(255,255,255,${al.toFixed(3)})`);
        cg.addColorStop(0.65, `rgba(255,255,255,${(al * 0.55).toFixed(3)})`);
        cg.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = cg;
        ctx.beginPath(); ctx.arc(px, py, rad, 0, Math.PI * 2); ctx.fill();
      }
    }

    /* animated great-circle routes + ships */
    if (o.routes.length && o.detail > 0) {
      ctx.lineWidth = 1.3;
      ctx.strokeStyle = 'rgba(236,196,106,.85)';
      ctx.setLineDash([5, 6]);
      ctx.lineDashOffset = -st.dash;
      for (const m of o.routes) {
        ctx.beginPath();
        let pen = false;
        for (let i = 0; i <= 64; i++) { // 2026-11-14: finer arc = smoother lanes
          const [lon, lat] = gcPoint(o.origin.lon, o.origin.lat, m.lon, m.lat, i / 64);
          projLL(lon, lat, v);
          if (v[2] > 0.01) {
            const px = cx + v[0] * R, py = cy - v[1] * R;
            if (pen) ctx.lineTo(px, py); else { ctx.moveTo(px, py); pen = true; }
          } else pen = false;
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // ships — one gold tracer per route, phase-shifted, with a fading wake
      ctx.lineCap = 'round';
      for (let r = 0; r < o.routes.length; r++) {
        const m = o.routes[r];
        const t = (st.shipT + r / o.routes.length) % 1;
        // golden wake: a short trail of segments fading out behind the ship
        let wx = 0, wy = 0, wOk = false;
        for (let sgm = 8; sgm >= 1; sgm--) {
          const tt = t - sgm * 0.016;
          if (tt <= 0) { wOk = false; continue; }
          const [wlon, wlat] = gcPoint(o.origin.lon, o.origin.lat, m.lon, m.lat, tt);
          projLL(wlon, wlat, v);
          if (v[2] <= 0.02) { wOk = false; continue; }
          const px = cx + v[0] * R, py = cy - v[1] * R;
          if (wOk) {
            const f = 1 - sgm / 9;
            ctx.strokeStyle = `rgba(255,214,120,${(f * 0.5).toFixed(3)})`;
            ctx.lineWidth = 0.8 + f * 2.2;
            ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(px, py); ctx.stroke();
          }
          wx = px; wy = py; wOk = true;
        }
        const [lon, lat] = gcPoint(o.origin.lon, o.origin.lat, m.lon, m.lat, t);
        projLL(lon, lat, v);
        if (v[2] > 0.02) {
          const px = cx + v[0] * R, py = cy - v[1] * R;
          if (wOk) {
            ctx.strokeStyle = 'rgba(255,224,150,.6)';
            ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(wx, wy); ctx.lineTo(px, py); ctx.stroke();
          }
          ctx.fillStyle = 'rgba(255,224,150,.95)';
          ctx.beginPath(); ctx.arc(px, py, 2.6, 0, Math.PI * 2); ctx.fill();
          ctx.fillStyle = 'rgba(255,224,150,.25)';
          ctx.beginPath(); ctx.arc(px, py, 6, 0, Math.PI * 2); ctx.fill();
        }
      }
    }

    /* sphere shading: limb falloff + glass highlight */
    const sh = ctx.createRadialGradient(cx, cy, R * 0.55, cx, cy, R);
    sh.addColorStop(0, 'rgba(0,0,0,0)'); sh.addColorStop(0.82, 'rgba(1,16,9,.12)'); sh.addColorStop(1, 'rgba(0,10,5,.55)');
    ctx.fillStyle = sh; ctx.fillRect(0, 0, w, h);
    // glass highlight — when `sun` is on it sits where the real sun is,
    // so the bright side of the sphere IS the daylight side.
    let hx = cx - R * 0.42, hy = cy - R * 0.48, hs = 0.14;
    if (o.sun) {
      projLL(SUN[0], SUN[1], v);
      // pull the centre toward the disc so the glow stays visible even when
      // the subsolar point sits near (or beyond) the limb
      hx = cx + v[0] * R * 0.62; hy = cy - v[1] * R * 0.62;
      hs = 0.05 + 0.13 * Math.max(0, v[2]);
    }
    const hl = ctx.createRadialGradient(hx, hy, 0, hx, hy, R * (o.sun ? 1.15 : 0.9));
    hl.addColorStop(0, `rgba(255,252,238,${hs.toFixed(3)})`); hl.addColorStop(0.4, `rgba(255,252,238,${(hs * 0.3).toFixed(3)})`); hl.addColorStop(1, 'rgba(255,252,238,0)');
    ctx.fillStyle = hl; ctx.fillRect(0, 0, w, h);
    ctx.restore();

    /* rim + a soft green atmosphere halo just outside it */
    ctx.strokeStyle = 'rgba(79,208,138,.16)';
    ctx.lineWidth = Math.max(3, R * 0.016);
    ctx.beginPath(); ctx.arc(cx, cy, R + ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(229,181,83,.28)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

    /* country name tooltip — drawn last so it rides above everything */
    if (o.names && st.hoverC >= 0 && typeof ctx.fillText === 'function') {
      const name = CTRY_P[st.hoverC].n;
      ctx.font = '600 12px Manrope, system-ui, sans-serif';
      const tw2 = (ctx.measureText ? ctx.measureText(name).width : name.length * 7) + 22;
      let tx = st.hvX + 14, ty = st.hvY - 34;
      if (tx + tw2 > w - 6) tx = w - 6 - tw2;
      if (ty < 6) ty = st.hvY + 18;
      ctx.fillStyle = 'rgba(2,24,14,.92)';
      ctx.strokeStyle = 'rgba(229,181,83,.65)';
      ctx.lineWidth = 1;
      if (typeof ctx.roundRect === 'function') {
        ctx.beginPath(); ctx.roundRect(tx, ty, tw2, 26, 8); ctx.fill(); ctx.stroke();
      } else {
        ctx.fillRect(tx, ty, tw2, 26); ctx.strokeRect(tx, ty, tw2, 26);
      }
      ctx.fillStyle = '#ffe9b8';
      ctx.fillText(name, tx + 11, ty + 17);
    }

    /* overlay markers (chips + flags) follow the sphere */
    if (o.markers) {
      const nodes = host.querySelectorAll('[data-lon]');
      for (const el of nodes) {
        projLL(parseFloat(el.dataset.lon), parseFloat(el.dataset.lat), v);
        let front = v[2] > 0.06;
        let px = 0, py = 0;
        if (front) {
          px = cx + v[0] * R; py = cy - v[1] * R;
          // zoomed in: anything projected off-canvas must hide, not float
          if (px < -24 || px > w + 24 || py < -24 || py > h + 24) front = false;
        }
        if (front) {
          const s = 0.72 + 0.3 * v[2];
          // transform-only: compositor work, no per-frame layout
          el.style.transform = `translate(${px.toFixed(1)}px,${py.toFixed(1)}px) translate(-50%,-50%) scale(${s.toFixed(3)})`;
          el.style.opacity = String(Math.min(1, (v[2] - 0.06) * 9));
          el.style.zIndex = String(10 + Math.round(v[2] * 20));
          el.style.pointerEvents = v[2] > 0.14 ? 'auto' : 'none';
          el.style.visibility = 'visible';
        } else {
          el.style.visibility = 'hidden';
          el.style.pointerEvents = 'none';
        }
      }
    }
  };

  /* ---- animation / interaction plumbing ---- */
  const schedule = () => {
    if (!st.raf && !st.destroyed && st.visible && !document.hidden && (awake || st.drag) && (!reduced || st.drag)) st.raf = requestAnimationFrame(loop);
  };
  const loop = t => {
    st.raf = 0;
    if (st.destroyed || !st.visible || document.hidden) return;
    const real = Math.min(t - st.prev, 40); st.prev = t;
    // idle throttle: with nothing interacting, bank the elapsed time and skip
    // this frame until the idleFps budget is due. Motion below advances by the
    // BANKED time, so the rotation speed is identical — just fewer paints.
    const hot = st.drag || st.pinch || st.fly || st.hoverC >= 0 || Math.abs(st.zoomT - st.zoom) > 0.001;
    st.acc += real;
    if (!hot && st.acc < 1000 / o.idleFps) { schedule(); return; }
    const dt = Math.min(st.acc, 80); st.acc = 0;
    st.clock += dt * 0.0012;
    st.drift += dt * 0.00009; // clouds drift slowly eastward
    // eased zoom toward its target (double-click / flyTo set zoomT)
    if (Math.abs(st.zoomT - st.zoom) > 0.001) st.zoom += (st.zoomT - st.zoom) * Math.min(1, dt / 130);
    else st.zoom = st.zoomT;
    // flyTo: glide the camera to a market over ~1.1s (shortest way around)
    if (st.fly) {
      const f = st.fly, p2 = Math.min(1, (t - f.t0) / f.ms);
      const e2 = p2 < 0.5 ? 4 * p2 * p2 * p2 : 1 - Math.pow(-2 * p2 + 2, 3) / 2;
      st.lam = f.lam0 + f.dLam * e2;
      st.phi = f.phi0 + f.dPhi * e2;
      if (p2 >= 1) st.fly = null;
    } else if (!st.drag && !reduced) {
      st.lam += o.autoRotate / Math.max(1, st.zoom) * dt / 16;
      st.lam += st.vLam * dt / 16; st.vLam *= Math.pow(0.92, dt / 16);
      st.phi += st.vPhi * dt / 16; st.vPhi *= Math.pow(0.9, dt / 16);
      st.phi = Math.max(-85, Math.min(85, st.phi));
    }
    if (!st.drag && !reduced) {
      st.dash += dt * 0.022;
      st.shipT = (st.shipT + dt / 26000) % 1;
    }
    render();
    schedule();
  };

  const onVisible = en => {
    st.visible = !!en[0]?.isIntersecting;
    if (st.visible) { st.prev = performance.now(); schedule(); }
    else if (st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; }
  };
  const io = typeof IntersectionObserver === 'function' ? new IntersectionObserver(onVisible, { threshold: 0 }) : null;
  if (io) io.observe(host); else { st.visible = true; schedule(); }
  const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(() => { measure(); render(); }) : null;
  if (ro) ro.observe(canvas);
  const onVisibility = () => {
    if (document.hidden && st.raf) { cancelAnimationFrame(st.raf); st.raf = 0; }
    else { st.prev = performance.now(); schedule(); }
  };
  const onMotion = e => { reduced = !!e.matches; if (!reduced) schedule(); else render(); };
  document.addEventListener('visibilitychange', onVisibility);
  if (motionQuery?.addEventListener) motionQuery.addEventListener('change', onMotion);
  else motionQuery?.addListener?.(onMotion);

  // Inverse orthographic: CSS pixel on the canvas → [lon, lat] (or null off-globe).
  const screenToLL = (px, py) => {
    const cx = st.w / 2, cy = st.h / 2;
    const R = Math.min(st.w, st.h) / 2 * 0.985 * st.zoom;
    const x = (px - cx) / R, y = -(py - cy) / R;
    const rho = Math.hypot(x, y);
    if (!R || rho > 0.9999) return null;
    const cosc = Math.sqrt(1 - rho * rho);
    const phi0 = st.phi * RAD;
    const lat = Math.asin(Math.max(-1, Math.min(1, cosc * Math.sin(phi0) + y * Math.cos(phi0)))) / RAD;
    const lon = st.lam + Math.atan2(x, cosc * Math.cos(phi0) - y * Math.sin(phi0)) / RAD;
    return [((lon + 540) % 360) - 180, lat];
  };

  /* Fly the camera to a market — exposed on the returned cleanup function. */
  const flyTo = (lon, lat, ms = 1100) => {
    const tPhi = Math.max(-85, Math.min(85, lat));
    if (reduced) { st.lam = lon; st.phi = tPhi; render(); return; }
    st.fly = {
      t0: performance.now(), ms,
      lam0: st.lam, phi0: st.phi,
      dLam: (((lon - st.lam) % 360) + 540) % 360 - 180,
      dPhi: tPhi - st.phi
    };
    st.vLam = st.vPhi = 0;
    schedule();
  };

  // Pointer drag — degrees per pixel scales with size so every globe feels 1:1.
  // Two simultaneous pointers switch to PINCH ZOOM instead of rotating.
  const dn = e => {
    if (!o.interactive) return;
    st.fly = null; // a touch always hands control back to the visitor
    st.pts.set(e.pointerId ?? 1, [e.clientX, e.clientY]);
    if (st.pts.size === 2 && o.zoom) {
      const [p1, p2] = [...st.pts.values()];
      st.pinch = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]) || 1;
      st.drag = false;
      host.classList.remove('dragging');
      return;
    }
    st.drag = true; st.moved = false;
    st.sx = st.lx = e.clientX; st.sy = st.ly = e.clientY;
    host.classList.add('dragging');
    schedule();
    // NOTE: deliberately no setPointerCapture — capturing re-targets the
    // synthesized click to the host, which would break the overlay chips.
    // window-level move/up listeners already track drags that leave the host.
  };
  const mv = e => {
    if (st.pts.has(e.pointerId ?? 1)) st.pts.set(e.pointerId ?? 1, [e.clientX, e.clientY]);
    if (st.pinch && st.pts.size === 2) {
      const [p1, p2] = [...st.pts.values()];
      const nd = Math.hypot(p1[0] - p2[0], p1[1] - p2[1]) || 1;
      st.zoomT = st.zoom = Math.max(1, Math.min(3.4, st.zoom * nd / st.pinch));
      st.pinch = nd; st.moved = true;
      render(); schedule();
      return;
    }
    if (!st.drag) return;
    const dx = e.clientX - st.lx, dy = e.clientY - st.ly;
    st.lx = e.clientX; st.ly = e.clientY;
    const k = 170 / (Math.max(80, Math.min(st.w, st.h)) * st.zoom);
    st.lam -= dx * k; st.vLam = -dx * k * 0.8;
    st.phi += dy * k; st.vPhi = dy * k * 0.7;
    st.phi = Math.max(-85, Math.min(85, st.phi));
    if (Math.abs(e.clientX - st.sx) + Math.abs(e.clientY - st.sy) > 7) st.moved = true;
    render(); schedule();
  };
  const up = e => {
    if (e && e.pointerId != null) st.pts.delete(e.pointerId); else st.pts.clear();
    if (st.pts.size < 2) st.pinch = 0;
    if (!st.drag) return;
    st.drag = false;
    host.classList.remove('dragging');
    schedule();
  };

  // Country hover — hit-test the pointer against the named polygons.
  const hv = e => {
    if (!o.names || st.drag || st.pinch) return;
    const rect = canvas.getBoundingClientRect();
    const px = e.clientX - rect.left, py = e.clientY - rect.top;
    st.hvX = px; st.hvY = py;
    const ll = screenToLL(px, py);
    const ci = ll ? hitCountry(ll[0], ll[1]) : -1;
    if (ci !== st.hoverC) {
      st.hoverC = ci;
      if (ci >= 0) host.classList.add('over-country'); else host.classList.remove('over-country');
      render();
    } else if (ci >= 0 && reduced) render(); // tooltip follows even without rAF
  };
  const hvOut = () => {
    if (st.hoverC >= 0) { st.hoverC = -1; host.classList.remove('over-country'); render(); }
  };

  // Zoom: ctrl+wheel (= trackpad pinch) and double-click toggle.
  const wh = e => {
    if (!o.zoom || !e.ctrlKey) return; // plain scrolling must keep scrolling the page
    e.preventDefault();
    st.zoomT = st.zoom = Math.max(1, Math.min(3.4, st.zoom * Math.exp(-e.deltaY * 0.0016)));
    render(); schedule();
  };
  const dbl = e => {
    if (!o.zoom) return;
    e.preventDefault();
    st.zoomT = st.zoomT > 1.05 ? 1 : 2.1;
    schedule();
  };
  // After a real drag, swallow the click so chips/links underneath don't fire.
  const clickGuard = e => {
    if (st.moved) { e.stopPropagation(); e.preventDefault(); st.moved = false; }
  };
  if (o.interactive) {
    host.addEventListener('pointerdown', dn);
    window.addEventListener('pointermove', mv, { passive: true });
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', up);
    host.addEventListener('click', clickGuard, true);
    host.addEventListener('pointermove', hv, { passive: true });
    host.addEventListener('pointerleave', hvOut);
    host.addEventListener('wheel', wh, { passive: false });
    host.addEventListener('dblclick', dbl);
  }

  measure();
  render(); // first paint even before IO fires (and the only paint when reduced)

  // sleep mode: the static first frame above is the whole show until the
  // visitor does ANYTHING — then the orb starts its slow spin. One gesture
  // listener set, removed on first fire or on cleanup.
  const WAKE_EVTS = ['scroll', 'pointermove', 'pointerdown', 'keydown', 'touchstart'];
  const unwake = () => { for (const ev of WAKE_EVTS) window.removeEventListener(ev, onWake); };
  const onWake = () => {
    unwake();
    if (st.destroyed || awake) return;
    awake = true; st.prev = performance.now(); schedule();
  };
  if (o.sleep && typeof window !== 'undefined' && window.addEventListener) {
    for (const ev of WAKE_EVTS) window.addEventListener(ev, onWake, { passive: true, once: true });
  }

  const cleanup = () => {
    st.destroyed = true;
    unwake();
    if (st.raf) cancelAnimationFrame(st.raf);
    io?.disconnect(); ro?.disconnect();
    document.removeEventListener('visibilitychange', onVisibility);
    if (motionQuery?.removeEventListener) motionQuery.removeEventListener('change', onMotion);
    else motionQuery?.removeListener?.(onMotion);
    if (o.interactive) {
      host.removeEventListener('pointerdown', dn);
      window.removeEventListener('pointermove', mv);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', up);
      host.removeEventListener('click', clickGuard, true);
      host.removeEventListener('pointermove', hv);
      host.removeEventListener('pointerleave', hvOut);
      host.removeEventListener('wheel', wh);
      host.removeEventListener('dblclick', dbl);
    }
  };
  cleanup.flyTo = flyTo; // lets the fly-to-market buttons steer this globe
  return cleanup;
}
