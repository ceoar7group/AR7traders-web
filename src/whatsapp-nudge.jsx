// The engagement nudge on a vehicle page.
//
// 2026-11-25 (owner: "no leads and no WhatsApp messages at all — increase
// engagement so customers message on WhatsApp / enquire on a car").
//
// The WhatsApp buttons were already on every card and in the action stack, so
// the missing piece was not another button — it was a prompt at the moment a
// buyer has clearly been reading for a while and still has not acted. This is
// that prompt, and it keeps every honesty rule the site already follows:
//
//   • it never invents urgency: no countdown, no "3 people are viewing", no
//     discount that does not exist on the listing;
//   • it quotes the car's published price exactly as the page shows it, and
//     says "price on request" when the listing carries no price;
//   • it is a suggestion, not a wall: it never covers the content, never blocks
//     the phone CTA dock, and "Not now" removes it for a week;
//   • one nudge per vehicle per week, so a returning buyer is not nagged.
import { useEffect, useRef, useState } from 'react';
import { WhatsAppIcon } from './brand-icons.jsx';
import { waLink } from './site-settings.js';

export const NUDGE_KEY = ref => `ar7-wa-nudge:${String(ref || '')}`;
export const NUDGE_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;
export const NUDGE_DELAY_MS = 40_000;      // a minute-long read is a real buyer
export const NUDGE_SCROLL = 0.55;          // or half the page, whichever is first

/** The message a buyer would otherwise have to type out. Quoted, never invented. */
export function nudgeMessage({ label, ref, price, port }) {
  const car = [label, ref ? `(ref ${ref})` : ''].filter(Boolean).join(' ').trim();
  const quoted = String(price ?? '').trim();
  const priceText = quoted ? ` Your site shows it at ${quoted}.` : '';
  const portText = port ? ` What is the CIF to ${port}?` : ' What is the CIF to my port?';
  return `Hello AR7, I'm interested in the ${car || 'vehicle'} on your website.${priceText}${portText} Is it still available?`;
}

function coolingDown(ref) {
  try {
    const last = Number(localStorage.getItem(NUDGE_KEY(ref)) || 0);
    return Date.now() - last < NUDGE_COOLDOWN_MS;
  } catch { return false; }
}

function remember(ref) {
  try { localStorage.setItem(NUDGE_KEY(ref), String(Date.now())); } catch { /* private mode */ }
}

export default function WhatsAppNudge({ open = true, label, ref = '', price = '', port = '', whatsappNumber, onEnquire }) {
  const [visible, setVisible] = useState(false);
  const shown = useRef(false);

  useEffect(() => {
    if (!open || !ref || coolingDown(ref)) return undefined;
    const reveal = () => {
      if (shown.current) return;
      shown.current = true;
      setVisible(true);
    };
    const timer = setTimeout(reveal, NUDGE_DELAY_MS);
    const onScroll = () => {
      const doc = document.documentElement;
      const height = Math.max(doc.scrollHeight - window.innerHeight, 1);
      if ((window.scrollY || window.pageYOffset || 0) / height >= NUDGE_SCROLL) reveal();
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => { clearTimeout(timer); window.removeEventListener('scroll', onScroll); };
  }, [open, ref]);

  const dismiss = () => { setVisible(false); remember(ref); };
  if (!visible) return null;

  const href = waLink(whatsappNumber, nudgeMessage({ label, ref, price, port }));

  return (
    <aside className="wa-nudge" role="complementary" aria-label="Message AR7 Traders on WhatsApp">
      <div className="wa-nudge-body">
        <b>Still deciding about this one?</b>
        <p>Send us the stock reference on WhatsApp and we reply with the CIF to your port and fresh photographs — no form to fill in.</p>
      </div>
      <div className="wa-nudge-actions">
        <a className="wa-nudge-send" href={href} target="_blank" rel="noopener noreferrer" onClick={() => remember(ref)}>
          <WhatsAppIcon size={15}/> Message on WhatsApp
        </a>
        {onEnquire ? <button type="button" className="wa-nudge-enquire" onClick={() => { remember(ref); onEnquire(); }}>Enquire instead</button> : null}
        <button type="button" className="wa-nudge-dismiss" onClick={dismiss} aria-label="Dismiss this suggestion">Not now</button>
      </div>
    </aside>
  );
}
