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
import { LAND, BORDERS } from './world-geo.js';

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
const MAX_POLY = LAND_P.reduce((m, p) => Math.max(m, p.n), 0);

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
    ...opts
  };

  const st = {
    lam: o.lam, phi: o.phi, vLam: 0, vPhi: 0,
    drag: false, lx: 0, ly: 0, sx: 0, sy: 0, moved: false,
    raf: 0, prev: performance.now(), visible: false, destroyed: false,
    w: 0, h: 0, dpr: 1, dash: 0, shipT: 0
  };
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
    const R = Math.min(w, h) / 2 * 0.985;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

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

    /* live night hemisphere — ring 90° from the subsolar point */
    if (o.night) {
      const [sLon, sLat] = sunLonLat();
      const sv = [Math.cos(sLat * RAD) * Math.cos(sLon * RAD), Math.cos(sLat * RAD) * Math.sin(sLon * RAD), Math.sin(sLat * RAD)];
      let ax = -sv[1], ay = sv[0], az = 0; // ⊥ sun
      const al = Math.hypot(ax, ay, az) || 1; ax /= al; ay /= al; az /= al;
      const bx = sv[1] * az - sv[2] * ay, by = sv[2] * ax - sv[0] * az, bz = sv[0] * ay - sv[1] * ax;
      const night = new Path2D();
      let penDown = false, anyVis = false;
      for (let i = 0; i <= 120; i++) {
        const t = i / 120 * Math.PI * 2;
        const px3 = ax * Math.cos(t) + bx * Math.sin(t);
        const py3 = ay * Math.cos(t) + by * Math.sin(t);
        const pz3 = az * Math.cos(t) + bz * Math.sin(t);
        const lon = Math.atan2(py3, px3) / RAD, lat = Math.asin(Math.max(-1, Math.min(1, pz3))) / RAD;
        projLL(lon, lat, v);
        let x = v[0], y = v[1];
        if (v[2] > 0) anyVis = true;
        else { const d = Math.hypot(x, y) || 1; x /= d; y /= d; }
        const sx2 = cx + x * R, sy2 = cy - y * R;
        if (!penDown) { night.moveTo(sx2, sy2); penDown = true; } else night.lineTo(sx2, sy2);
      }
      night.closePath();
      ctx.fillStyle = 'rgba(1,12,7,.44)';
      if (!anyVis) {
        // Terminator fully behind the sphere: the whole visible face is either
        // all day or all night — decided by whether the subsolar point faces us.
        projLL(sLon, sLat, v);
        if (v[2] <= 0) ctx.fillRect(0, 0, w, h); // clip keeps it on the sphere
      } else {
        // The clamped ring encloses ONE of the two caps in 2D — test which by
        // sampling whichever of the subsolar/antisolar points faces us.
        // (isPointInPath takes untransformed device-pixel coordinates.)
        projLL(sLon, sLat, v);
        const subVisible = v[2] > 0;
        if (!subVisible) projLL(sLon > 0 ? sLon - 180 : sLon + 180, -sLat, v);
        const rx = (cx + v[0] * R) * dpr, ry = (cy - v[1] * R) * dpr;
        const inside = ctx.isPointInPath(night, rx, ry);
        const nightEnclosed = subVisible ? !inside : inside;
        if (nightEnclosed) ctx.fill(night);
        else {
          const inv = new Path2D(night);
          inv.rect(-2, -2, w + 4, h + 4);
          ctx.fill(inv, 'evenodd'); // everything on the sphere EXCEPT the day cap
        }
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
        for (let i = 0; i <= 40; i++) {
          const [lon, lat] = gcPoint(o.origin.lon, o.origin.lat, m.lon, m.lat, i / 40);
          projLL(lon, lat, v);
          if (v[2] > 0.01) {
            const px = cx + v[0] * R, py = cy - v[1] * R;
            if (pen) ctx.lineTo(px, py); else { ctx.moveTo(px, py); pen = true; }
          } else pen = false;
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
      // ships — one gold tracer per route, phase-shifted
      for (let r = 0; r < o.routes.length; r++) {
        const m = o.routes[r];
        const t = (st.shipT + r / o.routes.length) % 1;
        const [lon, lat] = gcPoint(o.origin.lon, o.origin.lat, m.lon, m.lat, t);
        projLL(lon, lat, v);
        if (v[2] > 0.02) {
          const px = cx + v[0] * R, py = cy - v[1] * R;
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
    const hl = ctx.createRadialGradient(cx - R * 0.42, cy - R * 0.48, 0, cx - R * 0.42, cy - R * 0.48, R * 0.9);
    hl.addColorStop(0, 'rgba(255,255,255,.14)'); hl.addColorStop(0.4, 'rgba(255,255,255,.04)'); hl.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = hl; ctx.fillRect(0, 0, w, h);
    ctx.restore();

    /* rim + a soft green atmosphere halo just outside it */
    ctx.strokeStyle = 'rgba(79,208,138,.16)';
    ctx.lineWidth = Math.max(3, R * 0.016);
    ctx.beginPath(); ctx.arc(cx, cy, R + ctx.lineWidth / 2, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(229,181,83,.28)';
    ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();

    /* overlay markers (chips + flags) follow the sphere */
    if (o.markers) {
      const nodes = host.querySelectorAll('[data-lon]');
      for (const el of nodes) {
        projLL(parseFloat(el.dataset.lon), parseFloat(el.dataset.lat), v);
        const front = v[2] > 0.06;
        if (front) {
          const px = cx + v[0] * R, py = cy - v[1] * R;
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
    if (!st.raf && !st.destroyed && st.visible && !document.hidden && (!reduced || st.drag)) st.raf = requestAnimationFrame(loop);
  };
  const loop = t => {
    st.raf = 0;
    if (st.destroyed || !st.visible || document.hidden) return;
    const dt = Math.min(t - st.prev, 40); st.prev = t;
    if (!st.drag && !reduced) {
      st.lam += o.autoRotate * dt / 16;
      st.lam += st.vLam * dt / 16; st.vLam *= Math.pow(0.92, dt / 16);
      st.phi += st.vPhi * dt / 16; st.vPhi *= Math.pow(0.9, dt / 16);
      st.phi = Math.max(-85, Math.min(85, st.phi));
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

  // Pointer drag — degrees per pixel scales with size so every globe feels 1:1.
  const dn = e => {
    if (!o.interactive) return;
    st.drag = true; st.moved = false;
    st.sx = st.lx = e.clientX; st.sy = st.ly = e.clientY;
    host.classList.add('dragging');
    schedule();
    // NOTE: deliberately no setPointerCapture — capturing re-targets the
    // synthesized click to the host, which would break the overlay chips.
    // window-level move/up listeners already track drags that leave the host.
  };
  const mv = e => {
    if (!st.drag) return;
    const dx = e.clientX - st.lx, dy = e.clientY - st.ly;
    st.lx = e.clientX; st.ly = e.clientY;
    const k = 170 / Math.max(80, Math.min(st.w, st.h));
    st.lam -= dx * k; st.vLam = -dx * k * 0.8;
    st.phi += dy * k; st.vPhi = dy * k * 0.7;
    st.phi = Math.max(-85, Math.min(85, st.phi));
    if (Math.abs(e.clientX - st.sx) + Math.abs(e.clientY - st.sy) > 7) st.moved = true;
    render(); schedule();
  };
  const up = () => {
    if (!st.drag) return;
    st.drag = false;
    host.classList.remove('dragging');
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
  }

  measure();
  render(); // first paint even before IO fires (and the only paint when reduced)

  return () => {
    st.destroyed = true;
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
    }
  };
}
