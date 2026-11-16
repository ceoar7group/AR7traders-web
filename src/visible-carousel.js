// Keep the home stock carousel still while it is outside the viewport. In
// browsers without IntersectionObserver it retains the previous timer behavior.
export function observeVisibleCarousel(el, tick, {Observer = globalThis.IntersectionObserver, every = 5200} = {}) {
  if (!el) return () => {};
  let timer = null;
  const start = () => { if (timer === null) timer = setInterval(tick, every); };
  const stop = () => { if (timer !== null) { clearInterval(timer); timer = null; } };
  if (typeof Observer !== 'function') { start(); return stop; }
  const observer = new Observer(entries => {
    if (entries.some(entry => entry.isIntersecting)) start(); else stop();
  });
  observer.observe(el);
  return () => { observer.disconnect(); stop(); };
}
