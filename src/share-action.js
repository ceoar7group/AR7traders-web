// One share behaviour for the whole site: the native sheet where it exists, the
// clipboard everywhere else.
//
// Kept out of the two pages that use it because the two must never drift — a
// car and a machine are forwarded the same way, and both links draw a card
// (api/_og-card.js) that makes the forwarded message look like the listing.
//
// The wording of each message lives with its own catalogue (vehicleShareMessage
// in vehicle-actions.jsx, machineShareMessage in machinery-data.js); this module
// only decides how the message leaves the browser and what the button says.
import { useEffect, useRef, useState } from 'react';

/** Native sheet, else clipboard. Resolves to the outcome, never throws:
 *   'shared'    — the platform's sheet completed;
 *   'cancelled' — the visitor closed the sheet (not an error, not a share);
 *   'copied'    — the message went to the clipboard;
 *   'failed'    — no sheet and no clipboard (nothing happened). */
export async function shareOrCopy({ title, text, url } = {}) {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  const body = String(text || '').trim();
  const link = String(url || '').trim();
  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share({ title: String(title || '').trim(), text: body, url: link });
      return 'shared';
    } catch (e) {
      // A cancelled sheet must not fall through to the clipboard: the visitor
      // decided not to share, and silently copying behind that decision would
      // both surprise them and claim a copy they did not ask for.
      if (e && e.name === 'AbortError') return 'cancelled';
    }
  }
  try {
    await nav.clipboard.writeText([body, link].filter(Boolean).join(' ').trim());
    return 'copied';
  } catch {
    return 'failed';
  }
}

/** What the button says after each outcome. A cancel or a failure says nothing:
 *  an aborted share is not a copy, and a failed one has nothing to report. */
export const SHARE_LABELS = { shared: 'Shared', copied: 'Link copied' };

/** The transient confirmation a share button shows, with its own timer. */
export function useShareAction(duration = 1800) {
  const [note, setNote] = useState('');
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  const share = async payload => {
    const outcome = await shareOrCopy(payload);
    const label = SHARE_LABELS[outcome] || '';
    clearTimeout(timer.current);
    setNote(label);
    if (label) timer.current = setTimeout(() => setNote(''), duration);
    return outcome;
  };
  return { note, share };
}
