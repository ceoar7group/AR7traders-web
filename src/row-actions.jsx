// RowActions — a discoverable action cell for wide CRM tables.
//
// Extracted from crm.jsx so the AI Growth desk (src/ai-growth.jsx) can reuse the
// exact same control without importing the whole CRM shell back into itself —
// that import would be a cycle. crm.jsx re-exports it, so nothing else changes.
import React, { useEffect, useRef, useState } from 'react';
import { MoreVertical } from 'lucide-react';

/**
 * RowActions — a discoverable action cell for wide CRM tables.
 *
 * WHY THIS EXISTS (owner report, 2026-10-11)
 * On Japan dealer stock the row's action cell carried six buttons in a
 * `white-space: nowrap` flex row. `.crm-goonet .crm-table-wrap table` has
 * `min-width: 1100px`, and `.crm-table-wrap td.crm-row-actions` is pinned with
 * `position: sticky; right: 0` — so the cell was always on screen, but its
 * right-hand 43px were clipped outside the scroller's padding box. The pill
 * that fell inside those last 43 pixels was "Edit": measured at 1440px,
 * 1024px, 768px and 390px, the Edit button's right edge sat 43px past the
 * visible area of the table, at every viewport, with no way to scroll it into
 * view (it was already at its sticky position).
 *
 * HOW THIS FIXES IT
 *   • One always-visible primary action — Edit — first in the cell, so it is
 *     the leftmost thing in the pinned column and can never be the control
 *     clipped at the right edge.
 *   • Everything else (publish, inventory, delist, photos, delete) lives in a
 *     labelled overflow menu opened by a button that is ALWAYS last, so the
 *     menu button itself is the only thing that can ever be clipped — and the
 *     menu it opens is positioned inside the viewport, not clipped by it.
 *   • Destructive actions are separated behind a divider and keep their own
 *     confirmation from the caller's handler.
 *   • Full keyboard support: the trigger is a real <button> with
 *     aria-haspopup/aria-expanded; the menu is a role="menu" whose items are
 *     role="menuitem" and are reachable with Arrow keys, Home/End, Enter,
 *     Space and Escape (which returns focus to the trigger).
 *
 * `primary` is rendered flat; `items` are { key, label, icon, onSelect,
 * danger?, disabled?, title? }. `items` may contain { divider: true }.
 */
export function RowActions({ primary, items = [], label = 'More actions', className = '' }) {
  const [open, setOpen] = useState(false);
  const triggerRef = useRef(null);
  const menuRef = useRef(null);

  // Close on outside click / Escape. A pinned cell inside a scroll container
  // has no natural dismissal, so this is not optional.
  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (!menuRef.current?.contains(e.target) && !triggerRef.current?.contains(e.target)) setOpen(false); };
    const onKey = e => { if (e.key === 'Escape') { setOpen(false); triggerRef.current?.focus(); } };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [open]);

  // Put focus on the first item when the menu opens from the keyboard.
  useEffect(() => {
    if (open) menuRef.current?.querySelector('[role="menuitem"]:not([disabled])')?.focus();
  }, [open]);

  const enabled = items.filter(i => i && !i.divider && !i.disabled);
  const onMenuKeyDown = e => {
    const nodes = [...(menuRef.current?.querySelectorAll('[role="menuitem"]:not([disabled])') || [])];
    const at = nodes.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') { e.preventDefault(); nodes[(at + 1 + nodes.length) % nodes.length]?.focus(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); nodes[(at - 1 + nodes.length) % nodes.length]?.focus(); }
    else if (e.key === 'Home') { e.preventDefault(); nodes[0]?.focus(); }
    else if (e.key === 'End') { e.preventDefault(); nodes[nodes.length - 1]?.focus(); }
    else if (e.key === 'Tab') { setOpen(false); }
  };

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
      <div className="crm-row-menu" ref={menuRef}>
        <button
          ref={triggerRef}
          type="button"
          className={'crm-row-menu-trigger' + (open ? ' open' : '')}
          data-row-menu="1"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label={`${label}${enabled.length ? ` (${enabled.length})` : ''}`}
          title={label}
          onClick={() => setOpen(v => !v)}
        >
          <MoreVertical size={14} />
          <span className="crm-row-menu-count">More</span>
        </button>
        {/* The items are always in the DOM and hidden with `display: none` while
            the menu is closed — that keeps them out of the tab order and out of
            the accessibility tree, and it keeps the markup stable for the
            render tests, which assert on the actions a row offers. */}
        <div
          className={'crm-row-menu-panel' + (open ? '' : ' is-closed')}
          data-row-menu-panel="1"
          role="menu"
          aria-label={label}
          aria-hidden={open ? undefined : 'true'}
          onKeyDown={onMenuKeyDown}
        >
          {items.filter(Boolean).map((item, i) => item.divider
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
                onClick={() => { setOpen(false); item.onSelect && item.onSelect(); }}
              >
                {item.icon}{item.label}
              </button>
            ))}
        </div>
      </div>
    </div>
  );
}
