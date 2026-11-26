// RowActions — a discoverable action cell for wide CRM tables.
//
// Extracted from crm.jsx so the AI Growth desk can reuse the control without
// importing the whole CRM shell back into itself — that import would be a cycle.
import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreVertical } from 'lucide-react';

const DEFAULT_GAP = 6;
const DEFAULT_PADDING = 8;
const MIN_MENU_WIDTH = 224;
const MAX_MENU_WIDTH = 320;

const numberOr = (value, fallback = 0) => {
  if (value === undefined || value === null || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

const clamp = (value, min, max) => {
  const high = Math.max(min, max);
  return Math.min(Math.max(value, min), high);
};

/**
 * Pure viewport placement for a row-action menu.
 *
 * `triggerRect` and `menuRect` are DOMRect-like objects; `viewport` is an
 * explicit { width, height } pair so this function remains deterministic in
 * tests and does not read global window state. The menu right-aligns to the
 * trigger, opens below when it fits (otherwise above), and is clamped to the
 * viewport with a small safe edge. Returned dimensions are CSS-pixel values.
 */
export function placeMenu(triggerRect = {}, menuRect = {}, viewport = {}, options = {}) {
  const viewportWidth = Math.max(0, numberOr(viewport.width, 0));
  const viewportHeight = Math.max(0, numberOr(viewport.height, 0));
  const edge = Math.max(0, numberOr(options.padding, DEFAULT_PADDING));
  const gap = Math.max(0, numberOr(options.gap, DEFAULT_GAP));
  const xPadding = Math.min(edge, viewportWidth / 2);
  const yPadding = Math.min(edge, viewportHeight / 2);
  const maxWidth = Math.min(MAX_MENU_WIDTH, Math.max(0, viewportWidth - (2 * xPadding)));
  const maxHeight = Math.max(0, viewportHeight - (2 * yPadding));
  const width = Math.min(Math.max(0, numberOr(menuRect.width, MIN_MENU_WIDTH)), maxWidth);
  const height = Math.min(Math.max(0, numberOr(menuRect.height, 0)), maxHeight);

  const triggerLeft = numberOr(triggerRect.left, 0);
  const triggerTop = numberOr(triggerRect.top, 0);
  const triggerRight = numberOr(triggerRect.right, triggerLeft + numberOr(triggerRect.width, 0));
  const triggerBottom = numberOr(triggerRect.bottom, triggerTop + numberOr(triggerRect.height, 0));

  const left = clamp(triggerRight - width, xPadding, viewportWidth - xPadding - width);
  const roomBelow = Math.max(0, viewportHeight - yPadding - (triggerBottom + gap));
  const roomAbove = Math.max(0, triggerTop - gap - yPadding);
  const placement = height <= roomBelow || roomBelow >= roomAbove ? 'bottom' : 'top';
  const requestedTop = placement === 'bottom'
    ? triggerBottom + gap
    : triggerTop - gap - height;
  const top = clamp(requestedTop, yPadding, viewportHeight - yPadding - height);

  return { left, top, width, maxWidth, maxHeight, placement };
}

function panelItems(items, onSelect) {
  return (items || []).filter(Boolean).map((item, i) => item.divider
    ? <div key={'d' + i} className="crm-row-menu-divider" role="separator" />
    : (
      <button
        key={item.key || i}
        type="button"
        role="menuitem"
        tabIndex={-1}
        className={'crm-row-menu-item' + (item.danger ? ' danger' : '') + (item.className ? ' ' + item.className : '')}
        disabled={item.disabled}
        title={item.title}
        onClick={() => { onSelect?.(); item.onSelect && item.onSelect(); }}
      >
        {item.icon}{item.label}
      </button>
    ));
}

function rowIsVisible(trigger) {
  if (!trigger?.isConnected) return false;
  const row = trigger.closest('tr') || trigger;
  const rowRect = row.getBoundingClientRect();
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
  let top = 0;
  let bottom = viewportHeight;

  // `.crm-table-wrap` is the vertical scrollport for the Japan stock table.
  // Intersect the row itself with its visible client area as well as the
  // viewport; a partially visible row may keep its menu open, but once the
  // whole row leaves view the portal is dismissed.
  const scrollport = trigger.closest('.crm-table-wrap');
  if (scrollport) {
    const rect = scrollport.getBoundingClientRect();
    const clientTop = numberOr(scrollport.clientTop, 0);
    const clientHeight = numberOr(scrollport.clientHeight, 0);
    if (clientHeight > 0) {
      top = Math.max(top, rect.top + clientTop);
      bottom = Math.min(bottom, rect.top + clientTop + clientHeight);
    }
  }

  return rowRect.height > 0 && rowRect.bottom > top && rowRect.top < bottom;
}

function getTheme(trigger) {
  return trigger?.closest('.crm-shell')?.getAttribute('data-crm-theme')
    || document.documentElement.getAttribute('data-crm-theme')
    || 'emerald';
}

export function RowActions({ primary, items = [], label = 'More actions', className = '' }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState(null);
  const triggerRef = useRef(null);
  const panelRef = useRef(null);

  const enabledItems = items.filter(item => item && !item.divider && !item.disabled);
  const theme = typeof document === 'undefined' ? 'emerald' : getTheme(triggerRef.current);

  // Measure after the portal has mounted, then keep it attached to the trigger
  // through both window resizes and scrolls in any ancestor scroll container.
  // If the row itself leaves the scrollport, close rather than leaving a menu
  // floating over unrelated records.
  useEffect(() => {
    if (!open) return undefined;
    const trigger = triggerRef.current;
    const panel = panelRef.current;
    if (!trigger || !panel) return undefined;

    let frame = null;
    const requestFrame = window.requestAnimationFrame?.bind(window) || (fn => window.setTimeout(fn, 0));
    const cancelFrame = window.cancelAnimationFrame?.bind(window) || window.clearTimeout.bind(window);
    const measure = () => {
      if (frame !== null) cancelFrame(frame);
      frame = requestFrame(() => {
        frame = null;
        if (!trigger.isConnected || !panel.isConnected) return;
        if (!rowIsVisible(trigger)) {
          setOpen(false);
          return;
        }
        const bounds = placeMenu(
          trigger.getBoundingClientRect(),
          panel.getBoundingClientRect(),
          {
            width: window.visualViewport?.width || window.innerWidth || document.documentElement.clientWidth,
            height: window.visualViewport?.height || window.innerHeight || document.documentElement.clientHeight
          }
        );
        setPosition(bounds);
      });
    };

    measure();
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    const visualViewport = window.visualViewport;
    visualViewport?.addEventListener('scroll', measure);
    visualViewport?.addEventListener('resize', measure);
    return () => {
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
      visualViewport?.removeEventListener('scroll', measure);
      visualViewport?.removeEventListener('resize', measure);
      if (frame !== null) cancelFrame(frame);
    };
  }, [open]);

  // Outside click dismisses the portalled panel. Escape closes it and restores
  // focus to the trigger, which lives back in the pinned action cell.
  useEffect(() => {
    if (!open) return undefined;
    const onDown = event => {
      if (!panelRef.current?.contains(event.target) && !triggerRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const onKey = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus({ preventScroll: true });
      }
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  // Wait until the first measurement makes the portal visible before focusing
  // into it; visibility:hidden elements cannot take focus in Chromium. Focus
  // only once per opening, not after each scroll/resize reposition.
  const focusedOnOpenRef = useRef(false);
  useEffect(() => {
    if (!open) {
      focusedOnOpenRef.current = false;
      return;
    }
    if (position && !focusedOnOpenRef.current) {
      panelRef.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus();
      focusedOnOpenRef.current = true;
    }
  }, [open, position]);

  const onMenuKeyDown = event => {
    const nodes = [...(panelRef.current?.querySelectorAll('[role="menuitem"]:not([disabled])') || [])];
    if (!nodes.length) return;
    const at = nodes.indexOf(document.activeElement);
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      nodes[at < 0 ? 0 : (at + 1) % nodes.length]?.focus();
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      nodes[at < 0 ? nodes.length - 1 : (at - 1 + nodes.length) % nodes.length]?.focus();
    } else if (event.key === 'Home') {
      event.preventDefault();
      nodes[0]?.focus();
    } else if (event.key === 'End') {
      event.preventDefault();
      nodes[nodes.length - 1]?.focus();
    } else if (event.key === 'Tab') {
      setOpen(false);
    }
  };

  const renderPanel = ({ closed = false, ref = null, style = undefined, portal = false } = {}) => (
    <div
      ref={ref}
      className={'crm-row-menu-panel' + (closed ? ' is-closed' : '')}
      data-row-menu-panel="1"
      data-row-menu-portal={portal ? '1' : undefined}
      data-crm-theme={portal ? theme : undefined}
      role="menu"
      aria-label={label}
      aria-hidden={closed ? 'true' : undefined}
      onKeyDown={closed ? undefined : onMenuKeyDown}
      style={style}
    >
      {panelItems(items, () => setOpen(false))}
    </div>
  );

  const portalStyle = position
    ? {
        left: `${position.left}px`,
        top: `${position.top}px`,
        width: `${position.width}px`,
        maxWidth: `${position.maxWidth}px`,
        maxHeight: `${position.maxHeight}px`,
        visibility: 'visible'
      }
    : { left: '0px', top: '0px', visibility: 'hidden' };

  return (
    <div className={'crm-row-menu-wrap' + (className ? ' ' + className : '')}>
      {primary && (
        <button
          type="button"
          className={'crm-row-primary ' + (primary.danger ? 'danger' : '')}
          data-row-primary={primary.key || 'primary'}
          onClick={primary.onSelect}
          disabled={primary.disabled}
          title={primary.title}
          aria-label={primary.label}
        >
          {primary.icon}{primary.label}
        </button>
      )}
      <div className="crm-row-menu">
        <button
          ref={triggerRef}
          type="button"
          className={'crm-row-menu-trigger' + (open ? ' open' : '')}
          data-row-menu="1"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`${label}${enabledItems.length ? ` (${enabledItems.length})` : ''}`}
          title={label}
          onClick={() => { setPosition(null); setOpen(value => !value); }}
        >
          <MoreVertical size={14} />
          <span className="crm-row-menu-count">More</span>
        </button>
        {/* Keep this closed in-cell copy: render tests and non-interactive
            consumers inspect row actions without first opening a menu. */}
        {renderPanel({ closed: true })}
      </div>
      {open && typeof document !== 'undefined' && createPortal(
        renderPanel({ ref: panelRef, style: portalStyle, portal: true }),
        document.body
      )}
    </div>
  );
}
