import React, { useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowRight, Check, LockKeyhole, X } from 'lucide-react';
import { useLang } from './i18n.jsx';
import { validateLead } from './lead-validation.js';
import './enquiry-form.css';

const COUNTRIES = ['Pakistan', 'UAE', 'United Kingdom', 'Kenya', 'Tanzania', 'New Zealand', 'Australia', 'USA', 'Other'];
const SOURCE = {
  contact: 'Website contact',
  auction: 'Auction access',
  vehicle: 'Vehicle enquiry',
  machinery: 'Machinery enquiry',
};

const COPY = {
  contact: {
    kicker: 'CONTACT AR7 TRADERS',
    title: 'Send us a message.',
    body: 'One form, straight to our team. No auction-access signup is needed.',
    submit: 'Send enquiry',
    successTitle: 'Enquiry received.',
    successBody: 'Your enquiry has been saved. Our team will contact you using the details you provided.',
  },
  auction: {
    kicker: 'JOIN THE AUCTION',
    title: 'Request auction access.',
    body: 'Tell us where you are and what you are looking for. Auction access is a separate service from a general enquiry.',
    submit: 'Request access',
    successTitle: 'Access request received.',
    successBody: 'Your request has been saved. Our auction specialist will contact you with the next steps.',
  },
  vehicle: {
    kicker: 'VEHICLE ENQUIRY',
    title: 'Enquire about this vehicle.',
    body: 'Send your question directly to our Japan export desk. No auction-access signup is needed.',
    submit: 'Send vehicle enquiry',
    successTitle: 'Vehicle enquiry received.',
    successBody: 'Your enquiry has been saved. Our Japan export desk will contact you about this vehicle.',
  },
  machinery: {
    kicker: 'CHINA MACHINERY DESK',
    title: 'Request a machinery quotation.',
    body: 'Tell us the machine and destination. Our machinery desk will confirm availability and quote freight to your port.',
    submit: 'Request quotation',
    successTitle: 'Quotation request received.',
    successBody: 'Your request has been saved. Our machinery desk will contact you with availability and a quotation.',
  },
};

function copyFor(kind, t) {
  if (kind === 'auction') {
    return {
      kicker: t('enq.kicker'),
      title: t('enq.h2'),
      body: t('enq.body'),
      submit: t('enq.submit'),
      successTitle: t('enq.successTitle'),
      successBody: t('enq.successBody'),
    };
  }
  return COPY[kind] || COPY.contact;
}

function Field({ id, label, required, optional, error, hint, children }) {
  const describedBy = [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(' ') || undefined;
  return (
    <div className={'enquiry-field' + (error ? ' has-error' : '')}>
      <label htmlFor={id}>
        {label} {required ? <span className="enquiry-required">(required)</span> : optional ? <span className="enquiry-optional">(optional)</span> : null}
      </label>
      {children({ id, 'aria-invalid': error ? 'true' : undefined, 'aria-describedby': describedBy, 'aria-required': required ? 'true' : undefined })}
      {hint && <small id={`${id}-hint`} className="enquiry-hint">{hint}</small>}
      {error && <span id={`${id}-error`} className="enquiry-field-error">{error}</span>}
    </div>
  );
}

export function EnquiryForm({ kind = 'contact', initialValues = {}, onSuccess, onBackToSite }) {
  const { t } = useLang();
  const uid = useId().replace(/:/g, '');
  const copy = copyFor(kind, t);
  const formRef = useRef(null);
  const successRef = useRef(null);
  const busyRef = useRef(false);
  const [errors, setErrors] = useState({});
  const [apiError, setApiError] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (sent) successRef.current?.focus();
  }, [sent]);

  const fieldId = name => `${uid}-${name}`;
  const clearError = name => {
    setErrors(prev => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  async function submit(event) {
    event.preventDefault();
    if (busyRef.current) return;
    const form = event.currentTarget;
    const values = Object.fromEntries(new FormData(form).entries());
    const nextErrors = validateLead(values, { requireEmail: true });
    setErrors(nextErrors);
    setApiError('');
    if (Object.keys(nextErrors).length) {
      const first = form.querySelector(`[name="${Object.keys(nextErrors)[0]}"]`);
      first?.focus();
      return;
    }
    busyRef.current = true;
    setBusy(true);
    try {
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...values, source: SOURCE[kind] || SOURCE.contact }),
      });
      const result = await response.json().catch(() => ({}));
      // A 2xx alone is not proof of persistence. The API must confirm both
      // ok:true and the id of the lead it actually inserted.
      if (!response.ok || result.ok !== true || !result.id) {
        throw new Error(result.error || 'Your enquiry could not be saved. Please try again or contact us directly.');
      }
      form.reset();
      setSent(true);
      onSuccess?.(result.id);
    } catch (error) {
      // Never log the payload, phone number, email or provider response body.
      setApiError(error instanceof TypeError
        ? 'We could not reach the enquiry service. Your details are still here — please try again or contact us directly.'
        : error.message || 'Your enquiry could not be saved. Please try again or contact us directly.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  if (sent) {
    return (
      <div className="enquiry-success" role="status" tabIndex={-1} ref={successRef}>
        <span className="enquiry-success-icon"><Check aria-hidden="true" /></span>
        <h3>{copy.successTitle}</h3>
        <p>{copy.successBody}</p>
        <button type="button" className="primary" onClick={() => {
          if (kind === 'auction' && onBackToSite) { onBackToSite(); return; }
          setSent(false); setErrors({}); setApiError('');
        }}>
          {kind === 'auction' && onBackToSite ? t('enq.backToSite') : 'Send another enquiry'}
        </button>
      </div>
    );
  }

  return (
    <div className={'enquiry-form-wrap enquiry-form-' + kind}>
      {kind === 'contact' && (
        <header className="enquiry-heading">
          <div className="kicker">{copy.kicker}</div>
          <h2 id="contact-enquiry">{copy.title}</h2>
          <p>{copy.body}</p>
        </header>
      )}
      <form ref={formRef} className="enquiry-form" onSubmit={submit} noValidate aria-busy={busy} aria-label={copy.title}>
        {Object.keys(errors).length > 0 && <div className="enquiry-alert" role="alert">Please check the highlighted fields.</div>}
        {apiError && <div className="enquiry-alert" role="alert">{apiError}</div>}
        <div className="enquiry-hp" aria-hidden="true">
          <label htmlFor={fieldId('website')}>Leave this field empty</label>
          <input id={fieldId('website')} name="website" tabIndex={-1} autoComplete="off" />
        </div>

        <Field id={fieldId('name')} label={t('enq.yourName')} required error={errors.name}>
          {props => <input {...props} name="name" required minLength={2} maxLength={120} autoComplete="name" placeholder={t('enq.namePlaceholder')} defaultValue={initialValues.name || ''} onChange={() => clearError('name')} />}
        </Field>

        <div className="enquiry-row">
          <Field id={fieldId('email')} label={t('enq.email')} required error={errors.email}>
            {props => <input {...props} name="email" required type="email" maxLength={200} autoComplete="email" inputMode="email" placeholder="you@email.com" defaultValue={initialValues.email || ''} onChange={() => clearError('email')} />}
          </Field>
          <Field id={fieldId('phone')} label="Contact phone number" required error={errors.phone} hint="Include your country code if you can, for example +92 300 1234567.">
            {props => <input {...props} name="phone" required type="tel" inputMode="tel" autoComplete="tel" maxLength={40} placeholder="+92 300 1234567" defaultValue={initialValues.phone || ''} onChange={() => clearError('phone')} />}
          </Field>
        </div>

        <div className="enquiry-row">
          <Field id={fieldId('country')} label={t('enq.destination')} optional>
            {props => (
              <select {...props} name="country" autoComplete="country-name" defaultValue={initialValues.country || ''}>
                <option value="">Select your country</option>
                {COUNTRIES.map(country => <option key={country} value={country}>{country}</option>)}
              </select>
            )}
          </Field>
          <Field id={fieldId('vehicle_interest')} label={kind === 'machinery' ? 'Machine you need' : t('enq.vehicle')} optional>
            {props => <input {...props} name="vehicle_interest" maxLength={180} autoComplete="off" placeholder={kind === 'machinery' ? 'e.g. 20-ton excavator' : t('enq.vehiclePlaceholder')} defaultValue={initialValues.vehicle_interest || ''} />}
          </Field>
        </div>

        <Field id={fieldId('message')} label={kind === 'contact' ? 'How can we help?' : 'Your message'} optional>
          {props => <textarea {...props} name="message" rows={4} maxLength={2000} autoComplete="off" placeholder={kind === 'contact' ? 'Tell us about the vehicle, machinery, or service you need.' : 'Share your question, budget, destination port, or timing.'} defaultValue={initialValues.message || ''} />}
        </Field>

        <button className="primary enquiry-submit" type="submit" disabled={busy}>
          {busy ? t('enq.sending') : copy.submit} <ArrowRight aria-hidden="true" />
        </button>
        <small className="enquiry-privacy"><LockKeyhole aria-hidden="true" /> {t('enq.privacy')}</small>
      </form>
    </div>
  );
}

export function EnquiryDialog({ context = {}, onClose }) {
  const { t } = useLang();
  const uid = useId().replace(/:/g, '');
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const kind = context.kind || 'auction';
  const copy = copyFor(kind, t);

  useEffect(() => {
    const previous = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const dialog = dialogRef.current;
    const focusables = () => [...dialog.querySelectorAll('button:not([disabled]), input:not([disabled]):not([tabindex="-1"]), select:not([disabled]), textarea:not([disabled]), a[href]')]
      .filter(el => el.offsetParent !== null || el === document.activeElement);
    const frame = requestAnimationFrame(() => {
      const first = dialog.querySelector('input[name="name"]') || dialog.querySelector('button');
      first?.focus();
    });
    const onKey = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusables();
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    dialog.addEventListener('keydown', onKey);
    return () => {
      cancelAnimationFrame(frame);
      dialog.removeEventListener('keydown', onKey);
      document.body.style.overflow = previousOverflow;
      if (previous instanceof HTMLElement) previous.focus();
    };
  }, []);

  return createPortal(
    <div className="modal-backdrop enquiry-backdrop" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="modal enquiry-modal" role="dialog" aria-modal="true" aria-labelledby={`${uid}-title`} ref={dialogRef}>
        <button className="modal-x" type="button" onClick={onClose} aria-label={t('common.close')}><X aria-hidden="true" /></button>
        <div className="kicker">{copy.kicker}</div>
        <h2 id={`${uid}-title`}>{copy.title}</h2>
        <p className="enquiry-dialog-body">{copy.body}</p>
        <EnquiryForm kind={kind} initialValues={context} onBackToSite={onClose} />
      </div>
    </div>,
    document.body
  );
}
