// The 360° walkaround — the dedicated button beside Enlarge on a vehicle page.
//
// 2026-11-25 (owner: "add a 3D/4D walkaround / 360° view with its own dedicated
// button, using the best free AI/tech for it"). Everything on the market that
// calls itself free for this is one of three things:
//
//   • a hosted spin service (Sirv, Cloudimage, SpinMe) — free only in a water
//     marked trial, and it wants the frames uploaded somewhere anyway;
//   • Google's <model-viewer> — genuinely free, but it needs a .glb model of
//     each car, which nobody supplies for a used Japanese listing;
//   • a spin built from the photographs the listing already has — no licence,
//     no upload, no key, no per-view cost, and it works on the phone in a
//     buyer's hand today.
//
// So: the third. Every listing carries 12–25 studio photographs (galleryFor),
// which is exactly a spin's frame set. Drag (or swipe, or the arrow keys) to
// rotate; the frames loop; optional auto-spin; and on a device with an
// orientation sensor, "tilt to look" turns the phone into the control — the
// cheap, free version of the VR head-turn people expect.
//
// Honesty rules kept here:
//   • the count says how many real photographs back the spin, because a
//     three-photo "360°" is a slideshow and the buyer deserves to know;
//   • nothing is invented: frames are the listing's own images, in order.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { spinFrames, spinLabel, PX_PER_FRAME } from './spin-frames.js';
import Walkaround3D from './walkaround-3d.jsx';

export default function SpinView({ open, onClose, images = [], title = 'Vehicle', car = null }) {
  const frames = useMemo(() => spinFrames(images), [images]);
  // Two ways to look at the same car: its own photographs (real, in order) and
  // the generated 3D model (proportions and paint, clearly labelled as a model).
  // Photographs open first — a buyer should meet the actual car, not a stand-in.
  const [mode, setMode] = useState('photos');
  const [index, setIndex] = useState(0);
  const [spinning, setSpinning] = useState(true);
  const [tilt, setTilt] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const dragRef = useRef(null);
  const tiltRef = useRef(null);
  const count = frames.length;

  const step = useCallback(delta => {
    if (!count) return;
    setIndex(i => ((i + delta) % count + count) % count);
  }, [count]);

  // Auto-spin: a slow, steady rotation until the buyer takes over.
  useEffect(() => {
    if (!open || !spinning || count < 2) return undefined;
    const id = setInterval(() => step(1), 260);
    return () => clearInterval(id);
  }, [open, spinning, count, step]);

  useEffect(() => {
    if (!open) { setLoaded(false); setSpinning(true); return undefined; }
    setLoaded(false);
    const onKey = e => {
      if (e.key === 'Escape') { e.preventDefault(); onClose?.(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); setSpinning(false); step(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); setSpinning(false); step(1); }
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = previous; };
  }, [open, onClose, step]);

  // Frames are preloaded so a fast drag never shows a blank card.
  useEffect(() => {
    if (!open || !count) return;
    frames.slice(0, 6).forEach(src => { const img = new Image(); img.decoding = 'async'; img.src = src; });
  }, [open, frames, count]);

  // Device-orientation steering (opt-in, because iOS asks permission).
  const enableTilt = useCallback(async () => {
    try {
      const api = typeof window !== 'undefined' ? window.DeviceOrientationEvent : null;
      if (api && typeof api.requestPermission === 'function') {
        const granted = await api.requestPermission();
        if (granted !== 'granted') return false;
      }
      if (!api) return false;
      const onTilt = e => {
        const heading = e.alpha ?? 0;
        const next = Math.floor((((heading % 360) + 360) % 360) / 360 * count);
        if (Number.isFinite(next)) setIndex(next);
      };
      window.addEventListener('deviceorientation', onTilt);
      tiltRef.current = onTilt;
      setTilt(true);
      setSpinning(false);
      return true;
    } catch {
      return false;
    }
  }, [count]);

  useEffect(() => () => {
    if (tiltRef.current) window.removeEventListener('deviceorientation', tiltRef.current);
    tiltRef.current = null;
  }, []);

  if (!open) return null;

  const onPointerDown = e => {
    setSpinning(false);
    dragRef.current = { x: e.clientX, index };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  };
  const onPointerMove = e => {
    if (!dragRef.current || !count) return;
    const px = e.clientX - dragRef.current.x;
    if (Math.abs(px) < 6) return;
    const next = dragRef.current.index - Math.round(px / PX_PER_FRAME);
    setIndex(((next % count) + count) % count);
  };
  const onPointerUp = () => { dragRef.current = null; };

  return (
    <div
      className="spin-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={`360° walkaround — ${title}`}
      tabIndex={-1}
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose?.(); } }}
      onClick={e => { if (e.target === e.currentTarget) onClose?.(); }}
    >
      <div className="spin-card">
        <header className="spin-head">
          <div>
            <b>360° walkaround</b>
            <small>{title}</small>
          </div>
          <button type="button" className="spin-close" onClick={onClose} aria-label="Close the 360° walkaround">Close</button>
        </header>
        <div className="spin-tabs" role="tablist" aria-label="How to view this vehicle">
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'photos'}
            className={mode === 'photos' ? 'active' : ''}
            onClick={() => setMode('photos')}
          >Photographs{count ? ` (${count})` : ''}</button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'model'}
            className={mode === 'model' ? 'active' : ''}
            onClick={() => setMode('model')}
          >3D model</button>
        </div>
        {mode === 'model' ? (
          <div className="spin-stage spin-stage-3d">
            <Walkaround3D car={car || {}} image={frames[0] || null} />
          </div>
        ) : (
        <div
          className="spin-stage"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
          onDoubleClick={() => setSpinning(s => !s)}
        >
          {count ? (
            <img
              src={frames[index]}
              alt={`${title} — 360° view, frame ${index + 1} of ${count}`}
              draggable="false"
              onLoad={() => setLoaded(true)}
              onError={() => setLoaded(false)}
              width="820"
              height="550"
              decoding="async"
            />
          ) : (
            <div className="spin-empty">No photographs on file for this vehicle yet — ask our team for a walkaround video.</div>
          )}
          {count > 1 && <span className="spin-badge" aria-live="polite"><b>{index + 1}</b> / {count}</span>}
          {!loaded && count ? <span className="spin-loading" aria-hidden="true">Loading frame…</span> : null}
        </div>
        )}
        {mode === 'photos' && (
        <div className="spin-controls">
          <button type="button" onClick={() => { setSpinning(false); step(-1); }} aria-label="Rotate left">◀</button>
          <button type="button" className="spin-play" onClick={() => setSpinning(s => !s)} aria-pressed={spinning}>
            {spinning ? 'Pause spin' : 'Auto-spin'}
          </button>
          <button type="button" onClick={() => { setSpinning(false); step(1); }} aria-label="Rotate right">▶</button>
          <button type="button" className="spin-tilt" onClick={enableTilt} aria-pressed={tilt} disabled={tilt}>
            {tilt ? 'Tilt steering on' : 'Tilt to look'}
          </button>
        </div>
        )}
        {mode === 'photos'
          ? <p className="spin-note">{spinLabel(count)} Drag the vehicle, or use the arrow keys.</p>
          : <p className="spin-note">Generated 3D model — proportions from this listing's body class{car?.length ? ' and its own dimensions' : ''}, paint from its colour{car?.col ? ` (${car.col})` : ''}. It is not a photograph of this car; the Photographs tab is.</p>}
      </div>
    </div>
  );
}
