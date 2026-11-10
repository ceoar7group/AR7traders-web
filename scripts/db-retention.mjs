// Data retention — keeps the free Supabase tier healthy forever.
//
// Run nightly by .github/workflows/guardian.yml (and runnable by hand:
//   SUPABASE_URL=… SUPABASE_SERVICE_ROLE_KEY=… node scripts/db-retention.mjs).
//
// WHY: the free Supabase project allows 500 MB of database. The business
// tables (leads, customers, quotes, orders, shipments, listings) stay small
// and are NEVER touched here — people's records are not "retention". What
// grows without bound is the exhaust: audit activities, automation logs,
// AI usage counters, cancelled AI drafts and old chat messages. Each gets a
// retention window long enough that nobody ever misses a row, and the
// windows are deliberately conservative — this script prevents a problem
// years out, it does not chase megabytes today (~15 MB as of 2026-11).
//
// Every delete is by created_at/day cutoff only; no row that could matter to
// a customer, a deal, or an audit inside its window is ever removed.
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) {
  console.log('db-retention: SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set — skipped (nothing deleted).');
  process.exit(0);
}
const db = createClient(url, key, { auth: { persistSession: false } });
const isoDaysAgo = d => new Date(Date.now() - d * 86400000).toISOString();
const dayDaysAgo = d => isoDaysAgo(d).slice(0, 10);

// table, time column, window in days, extra filter, reason
const RULES = [
  { table: 'activities',        col: 'created_at', days: 365, why: 'audit trail — kept a full year' },
  { table: 'automation_log',    col: 'created_at', days: 180, why: 'agent/automation run log' },
  { table: 'ai_provider_usage', col: 'day',        days: 120, day: true, why: 'per-day AI quota counters' },
  { table: 'ai_agent_runs',     col: 'created_at', days: 180, why: 'growth-studio run history' },
  { table: 'ai_agent_drafts',   col: 'created_at', days: 120, status: ['cancelled', 'rejected'], why: 'drafts nobody approved — approved/sent drafts are kept' },
  { table: 'wa_messages',       col: 'created_at', days: 730, why: 'WhatsApp history — two full years' },
];

let failures = 0;
for (const r of RULES) {
  const cutoff = r.day ? dayDaysAgo(r.days) : isoDaysAgo(r.days);
  try {
    let q = db.from(r.table).delete({ count: 'exact' }).lt(r.col, cutoff);
    if (r.status) q = q.in('status', r.status);
    const { count, error } = await q;
    if (error) throw error;
    console.log(`db-retention: ${r.table.padEnd(18)} removed ${String(count ?? 0).padStart(4)} rows older than ${r.days}d (${r.why})`);
  } catch (e) {
    failures++;
    console.error(`db-retention: ${r.table} FAILED — ${e?.message || e}`);
  }
}
if (failures) {
  // Retention must never fail the guardian run over a missing optional table,
  // but it should say so loudly in the log.
  console.error(`db-retention: ${failures} rule(s) failed — check the messages above.`);
}
process.exit(0);
