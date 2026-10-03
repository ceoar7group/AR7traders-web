// The action stack on the vehicle detail page.
//
//   Enquire now      — the one solid, dominant action: opens the access form
//   WhatsApp         — opens the CRM-configured conversation with THIS car named
//   Chat Now         — opens the existing on-site assistant (ChatWidget)
//   Save · Copy link — quiet utilities
//
// The pairs live in their own rows so each wraps on its own: two across at every
// real width, one column only when a pair genuinely would not fit, and a missing
// WhatsApp number leaves Chat Now to fill its row rather than reshuffling the rest.
//
// Presentation only. The saved list, the "link copied" flash, the enquiry modal
// and the chat widget all stay with their owners and arrive here as props, so
// this file adds no hooks, no second chat system and no new state.
//
// WhatsApp: the number comes from the CRM-controlled settings through the same
// waLink() helper every other WhatsApp link on the site uses, so nothing about
// the contact is hardcoded. The prefilled text only says WHICH car the visitor
// is asking about — year/make/model and the stock reference printed on the
// page — and states nothing about the car or the business that the record does
// not already say (CLAIMS-POLICY.md).
import React from 'react';
import { ArrowRight, Check, Heart, MessageCircle, Share2 } from 'lucide-react';
import { WhatsAppIcon } from './brand-icons.jsx';
import { waLink } from './site-settings.js';

/** "2023 Rolls-Royce Ghost" — only the fields the record actually carries. */
export const vehicleName = car =>
  [car?.year, car?.make, car?.model]
    .filter(v => v !== null && v !== undefined && String(v).trim() !== '')
    .map(v => String(v).trim())
    .join(' ');

/** The prefilled WhatsApp text: concise, names the car and its stock reference. */
export function vehicleWhatsAppMessage(car, stockRef) {
  const name = vehicleName(car) || 'vehicle';
  const ref = String(stockRef ?? '').trim();
  return `Hello AR7 Traders, I'm interested in the ${name}${ref ? ` (stock ${ref})` : ''}. Is it still available?`;
}

/** https://wa.me/<number>?text=… from the configured number, or '' when none is set. */
export function vehicleWhatsAppHref(settings, car, stockRef) {
  const number = settings && settings.whatsapp_number;
  return number ? waLink(number, vehicleWhatsAppMessage(car, stockRef)) : '';
}

export function VehicleActions({ car, stockRef, settings, saved, copied, onEnquire, onChat, onToggleSave, onCopy }) {
  const name = vehicleName(car);
  const subject = name ? `the ${name}` : 'this vehicle';
  const waHref = vehicleWhatsAppHref(settings, car, stockRef);
  return (
    <div className="detail-actions" role="group" aria-label={`Actions for ${subject}`}>
      <button className="primary" onClick={onEnquire} type="button">Enquire now <ArrowRight/></button>
      <div className="detail-actions-row">
        {waHref && (
          <a
            className="detail-cta detail-cta--wa"
            href={waHref}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`WhatsApp AR7 Traders about ${subject} (opens in a new tab)`}
          >
            <WhatsAppIcon size={18}/> WhatsApp
          </a>
        )}
        <button
          className="detail-cta detail-cta--chat"
          type="button"
          onClick={onChat}
          aria-haspopup="dialog"
          aria-label="Chat Now with the AR7 assistant"
        >
          <MessageCircle/> Chat Now
        </button>
      </div>
      <div className="detail-actions-row">
        <button className={saved ? 'ghost-btn fav-on' : 'ghost-btn'} onClick={onToggleSave} type="button">
          <Heart fill={saved ? 'currentColor' : 'none'}/> {saved ? 'Saved' : 'Save'}
        </button>
        <button className={copied ? 'ghost-btn is-done' : 'ghost-btn'} type="button" onClick={onCopy}>
          {copied ? <Check/> : <Share2/>} {copied ? 'Link copied' : 'Copy link'}
        </button>
      </div>
    </div>
  );
}
