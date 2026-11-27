// Progressive mounting: hand the browser the page one screen at a time.
//
// 2026-11-27 (the owner's Lighthouse panel: TBT 230 ms, the last orange metric).
// Total Blocking Time is the sum of every long task's overrun past 50 ms, so a
// single huge commit is exactly what it punishes. The home page used to render
// 2,418 elements in ONE synchronous commit — header ribbon, hero, six stock
// cards, the shop-by rails, the machinery teaser, the budget grid, the auction
// preview, the CTA and the entire footer. That measures ~107 ms of pure React
// render on a server CPU before the DOM is even touched; on a 4x-throttled phone
// it lands as one long task of several hundred milliseconds, during which taps
// and scrolling are queued and the page feels stuck.
//
// Nothing below the fold has to exist before the visitor can read the hero, so
// the sections now mount in stages: the first commit carries only what is on
// screen, and every stage after it renders inside its own idle slice (one
// section group per slice, so each slice stays small). Between slices the
// browser is free to paint and to answer input.
//
// Two promises this module must keep, because a staged page that forgets them is
// worse than a slow one:
//
//  1. No markup may ever depend on a callback firing. Where the environment
//     cannot schedule after paint — the server-render test suite, browsers
//     without requestIdleCallback — every stage renders immediately, exactly as
//     the page always did. `canStage()` is deliberately narrow for that reason.
//  2. A visitor must never reach an empty section. Any interaction, a load that
//     starts already scrolled (or on an in-page anchor), and a hard deadline all
//     flush every remaining stage at once.
import React, {useContext, useEffect, useRef, useState} from 'react';

// Default Infinity: a <Stage> used without a queue (or in a test that renders a
// fragment on its own) shows its children rather than silently showing nothing.
const StageCtx = React.createContext(Infinity);

// Can this environment hold markup back until after the first paint?
export const canStage = () => {
  try {
    if (typeof window === 'undefined' || !window) return false;
    // requestIdleCallback is what makes "after paint" a promise instead of a
    // guess. Chrome has it (that is also the browser the owner's Lighthouse run
    // uses); older Safari and the jsdom/server-render tests do not, and for them
    // the page renders whole, as before.
    if (typeof window.requestIdleCallback !== 'function') return false;
    // Someone who arrives already scrolled down — a reload midway through a
    // long page, or /#budgets — would watch the page grow above them. That is a
    // layout shift, so give those visitors everything in the first commit.
    if (window.scrollY > 0) return false;
    if (location.hash && location.hash.length > 1) return false;
    return true;
  } catch {
    return false;
  }
};

// How long a staged page may stay partial before it gives up and renders the
// rest in one go (a busy main thread can starve idle callbacks for a while).
const DEADLINE_MS = 2500;

export function StageQueue({steps, children}) {
  const total = Math.max(1, (steps | 0) || 1);
  // Decided once, on the first render: a later change of mind would remount.
  const staged = useRef(null);
  if (staged.current === null) staged.current = canStage();
  const [stage, setStage] = useState(() => (staged.current ? 0 : total));
  const flush = () => setStage(total);

  // One stage per idle slice. Each setStage re-runs this effect, which schedules
  // the next slice — so the sections arrive in order, with paint time between
  // them, instead of in one commit.
  useEffect(() => {
    if (!staged.current || stage >= total) return;
    if (typeof window.requestIdleCallback !== 'function') {
      setStage(total);
      return;
    }
    const id = window.requestIdleCallback(() => setStage(s => Math.min(total, s + 1)), {timeout: 250});
    return () => {
      if (typeof window.cancelIdleCallback === 'function') window.cancelIdleCallback(id);
    };
  }, [stage, total]);

  // The escape hatches. Anything that suggests the visitor is on their way down
  // the page mounts the rest immediately, so a fast scroll can never outrun the
  // queue.
  useEffect(() => {
    if (!staged.current || stage >= total) return;
    const events = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'];
    const onAny = () => setStage(total);
    for (const e of events) window.addEventListener(e, onAny, {passive: true, once: true});
    window.addEventListener('beforeprint', onAny);
    return () => {
      for (const e of events) window.removeEventListener(e, onAny);
      window.removeEventListener('beforeprint', onAny);
    };
  }, [stage, total]);

  // One deadline for the whole queue, measured from mount — not one per stage, or
  // a busy main thread could push the last section out four times over. It covers
  // the case where no idle callback and no interaction happens at all.
  useEffect(() => {
    if (!staged.current) return;
    const timer = setTimeout(() => setStage(total), DEADLINE_MS);
    return () => clearTimeout(timer);
  }, [total]);

  return <StageCtx.Provider value={stage}>{children}</StageCtx.Provider>;
}

// Renders its children once the queue reaches stage `n`. The children element is
// created by the page (not here), so once a stage is open React sees the same
// element object on later renders and skips re-rendering that whole subtree —
// the queue advancing costs nothing for the stages that are already mounted.
export function Stage({n = 1, children}) {
  return useContext(StageCtx) >= n ? children : null;
}
