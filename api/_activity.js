// Automation history + undo — shared module, dispatched from
// api/site-content.js on ?activity=<action> (list | undo), so it costs no
// Serverless Function against the Vercel Hobby cap of 12.
//
// THE CONTRACT (owner's requirement, 2026-11-07): everything the SEO desk,
// Topic Scout and the AI Growth agents publish or change must leave a record,
// and an administrator must be able to undo it later. So:
//
//   • logAutomation() writes one row per change into public.automation_log
//     with the row state BEFORE and AFTER. It never throws — a history
//     failure must not break the action itself.
//   • handleActivity('list') returns the recent history for the CRM panel.
//   • handleActivity('undo') restores the BEFORE state. Admin only. An undo
//     is itself logged (undo_of points at the reversed entry), so the trail
//     is complete in both directions and nothing is ever silently lost.
//
// Undo semantics by snapshot, not by replaying actions:
//   before_state = null  → the action created the row  → undo DELETES it.
//   before_state = {...} → the action changed the row  → undo RESTORES it
//                          (upsert, so undoing a delete re-inserts the row).

import { send } from './_supabase.js';

export const AUTOMATION_LOG_MIGRATION = 'supabase/MIGRATION-2026-11-automation-log.sql';

// Only these tables may ever be touched by an undo, each with its key column.
// Anything else in a log row is a record, never an action.
export const UNDO_TABLES = {
  site_articles: 'id',
  site_listings: 'id',
  site_routes:   'id',
  site_blocks:   'id',
  ai_agents:     'agent'
};

// Columns stripped before restoring a snapshot: identity and bookkeeping
// belong to the row, not to the snapshot.
const NEVER_RESTORE = new Set(['created_at']);

const missingTable = e => /automation_log|schema cache|does not exist/i.test(String(e?.message || e || ''));

/** Append one history row. Never throws: history must not break the action. */
export async function logAutomation(db, entry) {
  try {
    const row = {
      actor: String(entry.actor || 'System').slice(0, 200),
      source: String(entry.source || 'crm').slice(0, 40),
      action: String(entry.action || 'change').slice(0, 60),
      summary: String(entry.summary || 'Change recorded').slice(0, 500),
      entity_type: entry.entityType || null,
      entity_id: entry.entityId != null ? String(entry.entityId) : null,
      before_state: entry.before ?? null,
      after_state: entry.after ?? null,
      undo_kind: entry.undoKind || null,
      undo_of: entry.undoOf || null
    };
    const { error } = await db.from('automation_log').insert(row);
    if (error) console.error('automation_log insert failed:', error.message);
  } catch (e) {
    console.error('automation_log insert failed:', e.message);
  }
}

/**
 * Pure: what would undoing this entry do? Returns
 *   { op:'delete'|'restore', table, keyCol, keyVal, row? }  or
 *   { blocked: '<reason>' } when the entry cannot be undone.
 * Exported for tests — the HTTP handler below executes exactly this plan.
 */
export function undoPlan(entry) {
  if (!entry) return { blocked: 'Entry not found' };
  if (entry.undone_at) return { blocked: 'This entry was already undone' };
  if (!entry.undo_kind) return { blocked: 'This entry is a record only — there is nothing to undo' };
  const table = entry.entity_type;
  const keyCol = UNDO_TABLES[table];
  if (!keyCol) return { blocked: `Undo is not supported for ${table || 'this entry'}` };
  if (!entry.entity_id) return { blocked: 'The entry does not identify the row it changed' };
  if (entry.before_state == null) {
    // The action created the row — undo removes it again.
    return { op: 'delete', table, keyCol, keyVal: entry.entity_id };
  }
  const row = {};
  for (const [k, v] of Object.entries(entry.before_state)) {
    if (!NEVER_RESTORE.has(k)) row[k] = v;
  }
  // Restoring must put the row back under its original key even if deleted.
  row[keyCol] = keyCol === 'id' ? entry.entity_id : entry.before_state[keyCol] ?? entry.entity_id;
  return { op: 'restore', table, keyCol, keyVal: entry.entity_id, row };
}

/** Plain-language sentence for the undo confirmation + the undo log entry. */
export function undoSummary(entry, plan) {
  const what = entry?.summary ? `“${entry.summary}”` : 'the change';
  if (plan?.op === 'delete') return `Undo: removed what ${what} created`;
  return `Undo: restored the previous state of ${what}`;
}

/**
 * HTTP dispatcher. The caller (api/site-content.js) has ALREADY authenticated
 * the user and checked `site.write`; this adds the admin gate for undo.
 */
export async function handleActivity(req, res, action, { db, auth }) {
  if (action === 'list') {
    const limit = Math.max(1, Math.min(200, Number(req.query.limit) || 60));
    try {
      const { data, error } = await db.from('automation_log')
        .select('id,created_at,actor,source,action,summary,entity_type,entity_id,undo_kind,undone_at,undone_by,undo_of,before_state')
        .order('created_at', { ascending: false }).limit(limit);
      if (error) throw error;
      // before_state is only used to tell "created" from "changed" in the UI
      // label; the snapshot itself stays server-side.
      const entries = (data || []).map(e => ({ ...e, created: e.before_state == null && !!e.undo_kind, before_state: undefined }));
      return send(res, 200, { entries, isAdmin: auth.profile?.role === 'admin' });
    } catch (e) {
      if (missingTable(e)) {
        return send(res, 200, {
          entries: [], isAdmin: auth.profile?.role === 'admin',
          storage: { ok: false, migration: AUTOMATION_LOG_MIGRATION,
            ownerAction: `History is not set up yet. Run ${AUTOMATION_LOG_MIGRATION} in Supabase → SQL Editor once, then this panel fills itself.` }
        });
      }
      return send(res, 500, { error: e.message });
    }
  }

  if (action === 'undo') {
    if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed' });
    // Undo rewrites live content — that stays an administrator decision.
    if (auth.profile?.role !== 'admin') {
      return send(res, 403, { error: 'Only an administrator can undo automation actions.' });
    }
    const id = String(req.body?.id || '');
    if (!id) return send(res, 400, { error: 'Missing id' });
    let entry;
    try {
      const { data, error } = await db.from('automation_log').select('*').eq('id', id).maybeSingle();
      if (error) throw error;
      entry = data;
    } catch (e) {
      return send(res, missingTable(e) ? 503 : 500, { error: e.message });
    }
    const plan = undoPlan(entry);
    if (plan.blocked) return send(res, 409, { error: plan.blocked });

    if (plan.op === 'delete') {
      const { error } = await db.from(plan.table).delete().eq(plan.keyCol, plan.keyVal);
      if (error) return send(res, 500, { error: error.message });
    } else {
      // Upsert so undoing a deletion re-inserts the row with its original id.
      const { error } = await db.from(plan.table).upsert(plan.row, { onConflict: plan.keyCol });
      if (error) return send(res, 500, { error: error.message });
    }

    const actor = auth.profile?.full_name || auth.profile?.email || auth.user?.email || 'Administrator';
    const undoneAt = new Date().toISOString();
    await db.from('automation_log').update({ undone_at: undoneAt, undone_by: actor }).eq('id', id);
    await logAutomation(db, {
      actor, source: 'undo', action: 'undo',
      summary: undoSummary(entry, plan),
      entityType: plan.table, entityId: plan.keyVal,
      before: entry.after_state, after: entry.before_state,
      undoOf: entry.id
      // No undoKind: an undo is reversed by redoing the action, not by
      // chaining undo-of-undo entries.
    });
    return send(res, 200, { ok: true, undone: id, op: plan.op, at: undoneAt });
  }

  return send(res, 400, { error: `Unknown activity action: ${action || '(none)'}. Use activity=list or activity=undo.` });
}
