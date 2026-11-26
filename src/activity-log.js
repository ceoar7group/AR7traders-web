// Automation history — pure presentation logic for the CRM "History & undo"
// panel (AI Growth desk). No React, no fetch, no DOM: everything here is
// deterministic and unit-tested by scripts/activity-log.test.mjs.
//
// The server (api/_activity.js) stores WHAT happened; this module decides how
// a non-technical operator reads it: a plain sentence, a friendly timestamp,
// a source badge, and an honest undo button that explains what undoing does
// BEFORE anything is clicked.

export const SOURCE_LABELS = {
  'topic-scout':  'SEO desk · Topic Scout',
  'seo-desk':     'SEO desk',
  'ai-growth':    'AI Growth agent',
  'news-desk':    'News & guides desk',
  'website-desk': 'Website desk',
  'undo':         'Undo',
  'crm':          'CRM'
};

/** "just now", "12 min ago", "3 h ago", "2 days ago", else a local date. */
export function relativeTime(iso, now = Date.now()) {
  const t = Date.parse(iso || '');
  if (!Number.isFinite(t)) return '';
  const s = Math.max(0, Math.floor((now - t) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 7 * 86400) { const d = Math.floor(s / 86400); return d === 1 ? 'yesterday' : `${d} days ago`; }
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

/**
 * Everything the panel needs to render one entry:
 * { badge, when, canUndo, undoLabel, confirmText, state }
 *   state: 'undone' | 'undoable' | 'record'
 */
export function describeEntry(entry, { isAdmin = false, now = Date.now() } = {}) {
  const badge = SOURCE_LABELS[entry?.source] || SOURCE_LABELS.crm;
  const when = relativeTime(entry?.created_at, now);
  if (entry?.undone_at) {
    return {
      badge, when, state: 'undone', canUndo: false, undoLabel: null,
      confirmText: null,
      note: `Undone ${relativeTime(entry.undone_at, now)} by ${entry.undone_by || 'an administrator'}`
    };
  }
  if (!entry?.undo_kind) {
    return { badge, when, state: 'record', canUndo: false, undoLabel: null, confirmText: null, note: null };
  }
  // created === true means undo deletes the thing; otherwise it restores.
  const removes = entry.created === true;
  return {
    badge, when, state: 'undoable',
    canUndo: isAdmin,
    undoLabel: removes ? 'Undo (remove it)' : 'Undo (restore previous)',
    confirmText: removes
      ? `Undo this?\n\n“${entry.summary}”\n\nThe item it created will be REMOVED from the website/CRM. This is recorded in the history.`
      : `Undo this?\n\n“${entry.summary}”\n\nThe previous version will be restored exactly as it was. This is recorded in the history.`,
    note: isAdmin ? null : 'Only an administrator can undo'
  };
}

/** Newest first, grouped by calendar day for easy scanning. */
export function groupByDay(entries, now = Date.now()) {
  const dayOf = iso => {
    const t = Date.parse(iso || '');
    if (!Number.isFinite(t)) return 'Earlier';
    const d = new Date(t), today = new Date(now);
    const key = d.toDateString();
    if (key === today.toDateString()) return 'Today';
    const y = new Date(now - 86400000);
    if (key === y.toDateString()) return 'Yesterday';
    return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
  };
  const groups = [];
  for (const entry of entries || []) {
    const label = dayOf(entry.created_at);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.entries.push(entry);
    else groups.push({ label, entries: [entry] });
  }
  return groups;
}
