// The 3D walkaround: a real, draggable model in the browser.
//
// 2026-11-28 (owner: "i wanted you to or the web to generate a real time
// walkaround of the vehicle … maintain exact body proportions, wheel rim
// geometry, and panel lines. Keep the underside clean and symmetrical").
//
// What this is: a WebGL model built from the listing's own body class, colour
// and (when the listing carries them) its millimetre dimensions. You can spin
// it, tilt it, zoom it, look underneath it — in real time, on a phone, with no
// server, no per-view cost and no upload of the owner's photographs anywhere.
//
// What this is not: a photograph-derived reconstruction of that individual car.
// Multi-view → photo-real mesh is gaussian splatting or a neural 3D service, and
// both are metered per model. The caption on screen says exactly this, because
// a buyer is looking at it while deciding whether to wire money.
//
// Everything three.js-related lives behind a dynamic import(), so the ~170 kB
// engine is fetched only when somebody actually opens the 3D view — never on
// first paint (scripts/bundle-budget.test.mjs measures that).
import { useCallback, useEffect, useRef, useState } from 'react';
import { buildCar, modelDims, paintForCar, modelCaption } from './car-model.js';
import { samplePaintFromImage } from './paint-sample.js';

const MATERIALS = {
  paint: { color: 0xb9c0c6, metalness: 0.55, roughness: 0.26, clearcoat: 1, clearcoatRoughness: 0.06, envMapIntensity: 1.15 },
  roof: { color: 0xb9c0c6, metalness: 0.55, roughness: 0.24, clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.2 },
  glass: { color: 0x0a1418, metalness: 0.1, roughness: 0.06, transparent: true, opacity: 0.44, envMapIntensity: 1.6 },
  tyre: { color: 0x0b0c0e, metalness: 0.0, roughness: 0.94 },
  rim: { color: 0xc3c9cf, metalness: 1.0, roughness: 0.22, clearcoat: 0.5, envMapIntensity: 1.4 },
  trim: { color: 0x14181b, metalness: 0.45, roughness: 0.55 },
  lampF: { color: 0xeef4ff, emissive: 0xcfe0ff, emissiveIntensity: 0.55, metalness: 0.2, roughness: 0.12 },
  lampR: { color: 0xff2f2f, emissive: 0xa8121a, emissiveIntensity: 0.8, metalness: 0.1, roughness: 0.2 },
  floor: { color: 0x0c0e10, metalness: 0.25, roughness: 0.88 }
};

const VIEWS = {
  front34: { theta: 0.82, phi: 1.22, radius: 8.4, label: 'Front three-quarter' },
  side: { theta: Math.PI / 2, phi: 1.35, radius: 8.8, label: 'Side' },
  rear34: { theta: Math.PI + 0.82, phi: 1.22, radius: 8.4, label: 'Rear three-quarter' },
  front: { theta: 0.02, phi: 1.3, radius: 8.0, label: 'Front' },
  top: { theta: 0.7, phi: 0.42, radius: 8.6, label: 'Above' },
  under: { theta: 1.1, phi: 1.86, radius: 7.6, label: 'Underside' }
};

export default function Walkaround3D({ car = {}, image = null, sampledPaint = null, className = '' }) {
  const hostRef = useRef(null);
  const stateRef = useRef(null);
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState('');
  const [autoRotate, setAutoRotate] = useState(true);
  const [view, setView] = useState('front34');

  const dims = modelDims(car);
  const paint = paintForCar(car, sampledPaint);
  const caption = modelCaption(dims, paint);

  const applyView = useCallback(key => {
    const target = VIEWS[key];
    if (!target || !stateRef.current) return;
    stateRef.current.goTo = { ...target };
    if (stateRef.current.floor) stateRef.current.floor.visible = key !== 'under';
    setView(key);
  }, []);

  useEffect(() => {
    let disposed = false;
    let frame = 0;
    const host = hostRef.current;
    if (!host) return undefined;

    (async () => {
      let THREE;
      try {
        THREE = await import('three');
      } catch {
        if (!disposed) { setStatus('error'); setError('The 3D engine could not be loaded.'); }
        return;
      }
      if (disposed) return;

      // A listing with no colour name we recognise gets its paint measured from
      // its own photo, before a single material is built.
      let paintHex = paint.hex;
      if (paint.from !== 'listing colour') {
        const sampled = await samplePaintFromImage(image);
        if (sampled) paintHex = sampled;
      }
      if (disposed) return;

      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: 'high-performance' });
      if (!renderer.getContext()) {
        setStatus('error');
        setError('This browser has no WebGL, so the 3D view cannot run here.');
        return;
      }
      renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.8));
      renderer.toneMapping = THREE.ACESFilmicToneMapping;
      renderer.toneMappingExposure = 1.05;
      renderer.outputColorSpace = THREE.SRGBColorSpace;
      renderer.shadowMap.enabled = true;
      renderer.shadowMap.type = THREE.PCFSoftShadowMap;
      renderer.domElement.setAttribute('aria-hidden', 'true');
      host.appendChild(renderer.domElement);

      const scene = new THREE.Scene();
      const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);

      // Studio environment: a handful of emissive panels rendered into a PMREM
      // once, so paint and chrome have something real to reflect. No HDR file,
      // no CDN, nothing to download.
      {
        const env = new THREE.Scene();
        const panel = (w, h, intensity, position, rotation) => {
          const mesh = new THREE.Mesh(
            new THREE.PlaneGeometry(w, h),
            new THREE.MeshBasicMaterial({ color: new THREE.Color(intensity, intensity, intensity), side: THREE.DoubleSide })
          );
          mesh.position.set(...position);
          if (rotation) mesh.rotation.set(...rotation);
          env.add(mesh);
        };
        panel(14, 14, 1.5, [0, 7, 0], [Math.PI / 2, 0, 0]);
        panel(9, 5, 0.9, [-7, 2.5, 0], [0, Math.PI / 2, 0]);
        panel(9, 5, 0.5, [7, 2, -1], [0, -Math.PI / 2, 0]);
        panel(12, 4, 0.35, [0, 1.2, -8], [0, 0, 0]);
        panel(12, 3, 0.2, [0, 0.4, 8], [0, 0, 0]);
        const pmrem = new THREE.PMREMGenerator(renderer);
        pmrem.compileEquirectangularShader();
        scene.environment = pmrem.fromScene(env, 0.04).texture;
        pmrem.dispose();
      }

      scene.add(new THREE.HemisphereLight(0xe7f2ff, 0x0a1218, 0.55));
      const key = new THREE.DirectionalLight(0xffffff, 2.4);
      key.position.set(5.5, 8.5, 5);
      key.castShadow = true;
      key.shadow.mapSize.set(1024, 1024);
      key.shadow.camera.near = 1;
      key.shadow.camera.far = 30;
      key.shadow.camera.left = -7; key.shadow.camera.right = 7;
      key.shadow.camera.top = 7; key.shadow.camera.bottom = -7;
      key.shadow.bias = -0.0006;
      scene.add(key);
      const rim = new THREE.DirectionalLight(0x9fd2ff, 1.3);
      rim.position.set(-6, 3.4, -5.5);
      scene.add(rim);
      const fill = new THREE.DirectionalLight(0xffe6c2, 0.55);
      fill.position.set(-2, 2.2, 6);
      scene.add(fill);

      // The car itself.
      const built = buildCar({ dims, paint: paintHex });
      const group = new THREE.Group();
      for (const part of built.parts) {
        const material = MATERIALS[part.material] || MATERIALS.trim;
        const isShell = part.material === 'paint' || part.material === 'roof' || part.material === 'floor';
        const mesh = new THREE.Mesh(
          (() => {
            const geometry = new THREE.BufferGeometry();
            geometry.setAttribute('position', new THREE.BufferAttribute(part.positions, 3));
            geometry.setIndex(new THREE.BufferAttribute(part.indices, 1));
            geometry.computeVertexNormals();
            return geometry;
          })(),
          part.material === 'paint' || part.material === 'roof'
            ? new THREE.MeshPhysicalMaterial({ ...material, color: new THREE.Color(paintHex), side: isShell ? THREE.DoubleSide : THREE.FrontSide })
            : new THREE.MeshPhysicalMaterial({ ...material, side: isShell ? THREE.DoubleSide : THREE.FrontSide })
        );
        mesh.castShadow = part.material !== 'glass';
        mesh.receiveShadow = true;
        group.add(mesh);
      }
      // Sit the car on the ground, centred on the origin for a clean orbit.
      group.position.set(-built.dims.length / 2, 0, 0);
      const stage = new THREE.Group();
      stage.add(group);
      scene.add(stage);

      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(14, 64),
        new THREE.ShadowMaterial({ color: 0x000000, opacity: 0.42 })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0.002;
      floor.receiveShadow = true;
      scene.add(floor);

      // A faint turntable ring, so an empty-looking underside still has a floor.
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(3.2, 3.26, 96),
        new THREE.MeshBasicMaterial({ color: 0x2f6a52, transparent: true, opacity: 0.35, side: THREE.DoubleSide })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.004;
      scene.add(ring);

      const state = {
        theta: VIEWS.front34.theta, phi: VIEWS.front34.phi, radius: VIEWS.front34.radius,
        targetTheta: VIEWS.front34.theta, targetPhi: VIEWS.front34.phi, targetRadius: VIEWS.front34.radius,
        floor, ring, goTo: null, dragging: false, velocity: 0, auto: true, visible: true
      };
      stateRef.current = state;

      const resize = () => {
        const rect = host.getBoundingClientRect();
        const width = Math.max(240, rect.width);
        const height = Math.max(200, rect.height);
        renderer.setSize(width, height, false);
        camera.aspect = width / height;
        // Pull back a little on tall/narrow screens so the whole car fits.
        state.aspectBoost = width / height < 1 ? 1.35 : 1;
        camera.updateProjectionMatrix();
      };
      resize();
      const observer = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resize) : null;
      observer?.observe(host);

      // Pointer orbit with inertia, wheel zoom, and two-finger pinch.
      const pointers = new Map();
      let last = null, pinchStart = null;
      const el = renderer.domElement;
      el.style.touchAction = 'pan-y';
      const onDown = event => {
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        el.setPointerCapture?.(event.pointerId);
        state.dragging = true;
        state.goTo = null;
        last = { x: event.clientX, y: event.clientY };
        if (pointers.size === 2) {
          const [a, b] = [...pointers.values()];
          pinchStart = { distance: Math.hypot(a.x - b.x, a.y - b.y), radius: state.targetRadius };
        }
      };
      const onMove = event => {
        if (!pointers.has(event.pointerId)) return;
        pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        if (pointers.size === 2 && pinchStart) {
          const [a, b] = [...pointers.values()];
          const distance = Math.hypot(a.x - b.x, a.y - b.y);
          state.targetRadius = Math.max(4.4, Math.min(13, pinchStart.radius * (pinchStart.distance / Math.max(1, distance))));
          return;
        }
        if (!last) return;
        const dx = event.clientX - last.x;
        const dy = event.clientY - last.y;
        last = { x: event.clientX, y: event.clientY };
        state.targetTheta -= dx * 0.0075;
        state.targetPhi = Math.max(0.18, Math.min(1.94, state.targetPhi - dy * 0.0055));
        state.velocity = -dx * 0.0075;
      };
      const onUp = event => {
        pointers.delete(event.pointerId);
        if (pointers.size < 2) pinchStart = null;
        if (!pointers.size) { state.dragging = false; last = null; }
      };
      const onWheel = event => {
        event.preventDefault();
        state.targetRadius = Math.max(4.4, Math.min(13, state.targetRadius + event.deltaY * 0.0042));
      };
      el.addEventListener('pointerdown', onDown);
      el.addEventListener('pointermove', onMove);
      el.addEventListener('pointerup', onUp);
      el.addEventListener('pointercancel', onUp);
      el.addEventListener('wheel', onWheel, { passive: false });

      // Pause the loop when the tab or the canvas is out of sight.
      const visibility = () => { state.visible = !document.hidden; };
      document.addEventListener('visibilitychange', visibility);
      let inView = true;
      const io = typeof IntersectionObserver !== 'undefined' ? new IntersectionObserver(entries => {
        inView = entries.some(entry => entry.isIntersecting);
      }, { threshold: 0.05 }) : null;
      io?.observe(host);

      const clock = new THREE.Clock();
      const tick = () => {
        frame = requestAnimationFrame(tick);
        const delta = Math.min(0.05, clock.getDelta());
        if (state.goTo) {
          // A preset is a one-shot: set the targets, then let the damping ease
          // the camera over, so auto-rotate can carry on from there.
          state.targetTheta = state.goTo.theta;
          state.targetPhi = state.goTo.phi;
          state.targetRadius = state.goTo.radius;
          state.goTo = null;
        }
        if (state.auto && !state.dragging) state.targetTheta += delta * 0.35;
        if (!state.dragging && Math.abs(state.velocity) > 0.0002) {
          state.targetTheta += state.velocity;
          state.velocity *= 0.94;
        }
        state.theta += (state.targetTheta - state.theta) * 0.12;
        state.phi += (state.targetPhi - state.phi) * 0.12;
        state.radius += (state.targetRadius - state.radius) * 0.12;
        const radius = state.radius * (state.aspectBoost || 1);
        camera.position.set(
          Math.sin(state.phi) * Math.cos(state.theta) * radius,
          Math.cos(state.phi) * radius,
          Math.sin(state.phi) * Math.sin(state.theta) * radius
        );
        camera.lookAt(0, built.dims.height * 0.42, 0);
        key.target.position.set(0, built.dims.height * 0.4, 0);
        key.target.updateMatrixWorld();
        // Paused off-screen or in a hidden tab: no draw, no battery burn.
        if (state.visible && inView) renderer.render(scene, camera);
      };
      state.auto = true;
      setStatus('ready');
      tick();

      // The public surface the component uses is the LIVE state object itself
      // (a copy here would silently swallow applyView's camera moves).
      state.setAuto = value => { state.auto = value; };
      state.floor = floor;
      state.dispose = function dispose() {
          cancelAnimationFrame(frame);
          observer?.disconnect();
          io?.disconnect();
          document.removeEventListener('visibilitychange', visibility);
          el.removeEventListener('pointerdown', onDown);
          el.removeEventListener('pointermove', onMove);
          el.removeEventListener('pointerup', onUp);
          el.removeEventListener('pointercancel', onUp);
          el.removeEventListener('wheel', onWheel);
          scene.traverse(object => {
            if (object.isMesh) {
              object.geometry?.dispose?.();
              const material = object.material;
              if (Array.isArray(material)) material.forEach(m => m.dispose?.());
              else material?.dispose?.();
            }
          });
          renderer.dispose();
          renderer.domElement.remove();
      };
      stateRef.current = state;
    })().catch(err => {
      if (disposed) return;
      setStatus('error');
      setError(err?.message ? String(err.message).slice(0, 120) : 'The 3D view could not start.');
    });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      stateRef.current?.dispose?.();
      stateRef.current = null;
    };
    // Rebuild only when the car (and therefore the geometry) actually changes.
  }, [car?.id, car?.body, car?.col, image, dims.length, dims.width, dims.height, dims.wheelbase, paint.hex]);

  useEffect(() => {
    stateRef.current?.setAuto?.(autoRotate);
  }, [autoRotate]);

  return (
    <div className={`wa3d ${className}`.trim()}>
      <div className="wa3d-stage" ref={hostRef} role="img" aria-label={`3D model of the ${car.make || ''} ${car.model || ''} — drag to orbit`}>
        {status === 'loading' && <p className="wa3d-status">Building the 3D model…</p>}
        {status === 'error' && (
          <p className="wa3d-status wa3d-error">
            {error || 'The 3D view is unavailable here.'} The photographs on the left show this exact car.
          </p>
        )}
      </div>
      <div className="wa3d-views" role="group" aria-label="Camera angle">
        {Object.entries(VIEWS).map(([key, value]) => (
          <button
            key={key}
            type="button"
            aria-pressed={view === key}
            onClick={() => applyView(key)}
          >{value.label}</button>
        ))}
        <button type="button" aria-pressed={autoRotate} onClick={() => setAutoRotate(v => !v)}>
          {autoRotate ? 'Stop rotation' : 'Auto-rotate'}
        </button>
      </div>
      <p className="wa3d-caption">{caption} Drag to orbit, scroll or pinch to zoom.</p>
    </div>
  );
}
