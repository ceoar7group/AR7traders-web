// What the browser will tell us about the connection it is on.
//
// The one place this matters today is the decorative globe orb in the header:
// its engine + Natural Earth geometry is a 101 KiB gzipped chunk, and on a
// phone in Karachi a data saver or a 2G/3G connection is not the place to
// spend it before the visitor has asked for anything.
//
// `navigator.connection` is Chromium-only (and unsupported on iOS Safari), which
// is exactly why it must be read defensively: no hints means "no reason to
// hold back", never "assume fast".
const nav = () => (typeof navigator === 'undefined' ? null : navigator);

/** The raw hints, or an empty object where the browser offers none. */
export function connectionHints(n = nav()) {
  const c = (n && (n.connection || n.mozConnection || n.webkitConnection)) || null;
  return {
    supported: !!c,
    saveData: !!(c && c.saveData),
    effectiveType: (c && c.effectiveType) || '',
  };
}

/**
 * True when there is a positive reason to defer a heavy, decorative download:
 * the visitor turned on a data saver, or the connection reports 2G/3G. A
 * missing `navigator.connection` (Safari) is not a reason — those visitors get
 * the same treatment as before.
 */
export function shouldDeferDecorative(hints = connectionHints()) {
  if (!hints || !hints.supported) return false;
  if (hints.saveData) return true;
  return /^(slow-)?2g$|^3g$/.test(String(hints.effectiveType || ''));
}
