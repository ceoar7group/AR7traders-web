#!/usr/bin/env node
// Automation history + undo — the owner's contract (2026-11-07):
//
//   "whatever published or done by seo desk or ai growth agent we must keep
//    its record and later if needed to undo it, it should be possible by
//    admin, and make things easier to do for even a naive [user]."
//
// So this file asserts exactly that machinery:
//   • every article write through /api/site-content lands in automation_log
//     WITH the before/after snapshots undo needs, attributed to the desk
//     (?via=topic-scout reads differently from a person in the News desk);
//   • agent config changes and executed agent drafts are logged the same way;
//   • undo restores the exact BEFORE state (or deletes what was created),
//     is ADMIN-ONLY, can't run twice, and is itself logged (undo_of);
//   • the panel copy (src/activity-log.js) tells a non-technical operator
//     the truth: what happened, when, and what Undo will do BEFORE clicking.
import assert from 'node:assert/strict';
import handler from '../api/site-content.js';
import { undoPlan, undoSummary, logAutomation, UNDO_TABLES } from '../api/_activity.js';
import { updateAgent, executeDraft, AGENTS } from '../api/_agents.js';
import { relativeTime, describeEntry, groupByDay, SOURCE_LABELS } from '../src/activity-log.js';
import { DEFAULTS } from '../api/_perm.js';

const clone = v => structuredClone(v);
let pass = 0, fail = 0;
const ok = (cond, msg) => { if (cond) { pass++; console.log('  ✓ ' + msg); } else { fail++; console.log('  ✗ ' + msg); } };
const say = msg => console.log(msg);

// ---------------------------------------------------------------------------
// In-memory Supabase stand-in covering the calls _activity/_agents/site-content
// make: select/eq/order/limit/single/maybeSingle + insert/update/upsert/delete
// chains (mirrors the fake in scripts/ai-growth.test.mjs).
// ---------------------------------------------------------------------------
function fakeDb(seed = {}) {
  const tables = { activities: [], automation_log: [], site_articles: [], ai_agents: [], site_settings: [], ai_agent_drafts: [], ai_agent_runs: [], ...clone(seed) };
  let seq = 0;
  return {
    tables,
    from(table) {
      const rows = tables[table] || (tables[table] = []);
      const q = { _method: 'select', _payload: null, _filters: [], _order: null, _limit: null, _single: false, _onConflict: null };
      q.select = () => q;
      q.eq = (k, v) => { q._filters.push([k, v]); return q; };
      q.like = () => q;
      q.order = (k, o) => { q._order = [k, o?.ascending !== false]; return q; };
      q.limit = n => { q._limit = n; return q; };
      q.single = () => { q._single = 'strict'; return q; };
      q.maybeSingle = () => { q._single = 'maybe'; return q; };
      q.insert = p => { q._method = 'insert'; q._payload = p; return q; };
      q.update = p => { q._method = 'update'; q._payload = p; return q; };
      q.upsert = (p, o) => { q._method = 'upsert'; q._payload = p; q._onConflict = o?.onConflict || 'id'; return q; };
      q.delete = () => { q._method = 'delete'; return q; };
      q.then = (resolve, reject) => {
        try {
          const match = () => rows.filter(r => q._filters.every(([k, v]) => String(r[k]) === String(v)));
          if (q._method === 'insert' || q._method === 'upsert') {
            const list = (Array.isArray(q._payload) ? q._payload : [q._payload]).map(raw => {
              const row = clone(raw);
              if (q._method === 'upsert') {
                const keys = q._onConflict.split(',').map(s => s.trim());
                const hit = rows.find(r => keys.every(k => String(r[k]) === String(row[k])));
                if (hit) { Object.assign(hit, row); return hit; }
              }
              const added = { id: row.id || `${table}-${++seq}`, created_at: row.created_at || new Date().toISOString(), ...row };
              rows.push(added); return added;
            });
            return resolve({ data: q._single ? list[0] || null : list, error: null });
          }
          if (q._method === 'update') {
            const hit = match();
            hit.forEach(r => Object.assign(r, clone(q._payload)));
            if (q._single) return resolve(hit[0] ? { data: clone(hit[0]), error: null } : { data: null, error: { message: 'no row' } });
            return resolve({ data: hit.map(clone), error: null });
          }
          if (q._method === 'delete') {
            for (const r of match()) rows.splice(rows.indexOf(r), 1);
            return resolve({ data: null, error: null });
          }
          let out = match();
          if (q._order) out = [...out].sort((a, b) => (String(a[q._order[0]]) < String(b[q._order[0]]) ? -1 : 1) * (q._order[1] ? 1 : -1));
          if (q._limit != null) out = out.slice(0, q._limit);
          if (q._single === 'strict') return resolve(out.length ? { data: clone(out[0]), error: null } : { data: null, error: { message: 'no row' } });
          if (q._single === 'maybe') return resolve({ data: out[0] ? clone(out[0]) : null, error: null });
          return resolve({ data: out.map(clone), error: null });
        } catch (e) { return reject(e); }
      };
      return q;
    }
  };
}

function brokenLogDb() {
  // automation_log missing (migration not applied): the table read throws.
  const db = fakeDb();
  const real = db.from.bind(db);
  db.from = table => {
    if (table !== 'automation_log') return real(table);
    const err = { message: "Could not find the table 'public.automation_log' in the schema cache" };
    const b = { select: () => b, eq: () => b, order: () => b, limit: () => b, maybeSingle: () => b, single: () => b,
      insert: () => b, update: () => b, upsert: () => b, delete: () => b, then: r => r({ data: null, error: err }) };
    return b;
  };
  return db;
}

function fakeRes() {
  const r = { statusCode: 0, body: null, headers: {} };
  r.status = c => { r.statusCode = c; return r; };
  r.setHeader = () => {};
  r.end = p => { try { r.body = JSON.parse(p); } catch { r.body = p; } };
  return r;
}
const permsFor = async role => DEFAULTS[role] || {};
const userFor = (id, role) => async () => ({ user: { id, email: `${role}@ar7.test` }, profile: { id, role, active: true, email: `${role}@ar7.test`, full_name: role } });
async function run(req, injected) {
  const res = fakeRes();
  const realError = console.error;
  console.error = () => {};
  try { await handler(req, res, injected); } finally { console.error = realError; }
  return res;
}
const H = { authorization: 'Bearer ok', 'content-type': 'application/json' };

// ---------------------------------------------------------------------------
say('\n1) Pure panel copy — src/activity-log.js');
{
  const now = Date.parse('2026-11-07T12:00:00Z');
  ok(relativeTime('2026-11-07T11:59:40Z', now) === 'just now', 'relativeTime: <1 min is "just now"');
  ok(relativeTime('2026-11-07T11:12:00Z', now) === '48 min ago', 'relativeTime: minutes');
  ok(relativeTime('2026-11-07T07:00:00Z', now) === '5 h ago', 'relativeTime: hours');
  ok(relativeTime('2026-11-06T10:00:00Z', now) === 'yesterday', 'relativeTime: yesterday');
  ok(relativeTime('not-a-date', now) === '', 'relativeTime: garbage input → empty, never NaN');

  const undoable = { created_at: '2026-11-07T11:00:00Z', source: 'topic-scout', summary: 'Published the article “X”', undo_kind: 'restore-row', created: false };
  let d = describeEntry(undoable, { isAdmin: true, now });
  ok(d.state === 'undoable' && d.canUndo === true, 'undoable entry + admin → canUndo');
  ok(d.undoLabel === 'Undo (restore previous)', 'restore label says what Undo does');
  ok(/previous version will be restored/i.test(d.confirmText), 'confirm text explains restore BEFORE the click');
  ok(d.badge === SOURCE_LABELS['topic-scout'], 'badge names Topic Scout');

  d = describeEntry({ ...undoable, created: true }, { isAdmin: true, now });
  ok(d.undoLabel === 'Undo (remove it)' && /REMOVED/i.test(d.confirmText), 'created entry → undo honestly says it removes');

  d = describeEntry(undoable, { isAdmin: false, now });
  ok(d.canUndo === false && /administrator/i.test(d.note), 'non-admin sees why they cannot undo');

  d = describeEntry({ ...undoable, undone_at: '2026-11-07T11:30:00Z', undone_by: 'Owner' }, { isAdmin: true, now });
  ok(d.state === 'undone' && d.canUndo === false && /Owner/.test(d.note), 'undone entry: no second undo, names who undid it');

  d = describeEntry({ created_at: '2026-11-07T11:00:00Z', source: 'ai-growth', summary: 'Prepared a reply', undo_kind: null }, { isAdmin: true, now });
  ok(d.state === 'record' && d.canUndo === false, 'record-only entry has no undo');

  const groups = groupByDay([
    { created_at: new Date(now - 3600e3).toISOString() },
    { created_at: new Date(now - 7200e3).toISOString() },
    { created_at: new Date(now - 30 * 3600e3).toISOString() }
  ], now);
  ok(groups.length === 2 && groups[0].label === 'Today' && groups[0].entries.length === 2 && groups[1].label === 'Yesterday', 'groupByDay: Today / Yesterday buckets');
}

// ---------------------------------------------------------------------------
say('\n2) undoPlan — snapshot semantics, pure');
{
  ok(undoPlan(null).blocked === 'Entry not found', 'missing entry blocked');
  ok(/already undone/.test(undoPlan({ undone_at: 'x', undo_kind: 'restore-row' }).blocked), 'double undo blocked');
  ok(/record only/.test(undoPlan({ undo_kind: null }).blocked), 'record-only blocked');
  ok(/not supported/.test(undoPlan({ undo_kind: 'restore-row', entity_type: 'profiles', entity_id: 'p1', before_state: {} }).blocked), 'non-whitelisted table blocked — undo can never touch profiles');

  const created = undoPlan({ undo_kind: 'delete-row', entity_type: 'site_articles', entity_id: 'a1', before_state: null });
  ok(created.op === 'delete' && created.table === 'site_articles' && created.keyVal === 'a1', 'created row → undo deletes it');

  const changed = undoPlan({ undo_kind: 'restore-row', entity_type: 'site_articles', entity_id: 'a1',
    before_state: { id: 'a1', title: 'Old', published: true, created_at: '2020-01-01' } });
  ok(changed.op === 'restore' && changed.row.title === 'Old' && changed.row.published === true, 'changed row → undo restores the before snapshot');
  ok(!('created_at' in changed.row), 'bookkeeping columns are not restored');

  const agent = undoPlan({ undo_kind: 'restore-row', entity_type: 'ai_agents', entity_id: 'leads', before_state: { agent: 'leads', enabled: false } });
  ok(agent.keyCol === 'agent' && agent.row.agent === 'leads', 'ai_agents keys on agent name, not uuid');
  ok(Object.keys(UNDO_TABLES).length === 5, 'undo whitelist stays deliberate (5 tables)');
  ok(/removed what/.test(undoSummary({ summary: 'S' }, { op: 'delete' })), 'undo summary for delete reads honestly');
}

// ---------------------------------------------------------------------------
say('\n3) /api/site-content writes land in automation_log with snapshots');
{
  const db = fakeDb();
  const injected = { db, getUser: userFor('ad1', 'admin'), permsFor };
  // Topic Scout creates a draft…
  let r = await run({ method: 'POST', query: { entity: 'articles', via: 'topic-scout' }, headers: H,
    body: { title: 'Guide A', body: 'Body', published: false } }, injected);
  ok(r.statusCode === 200, 'article create succeeds');
  let log = db.tables.automation_log;
  ok(log.length === 1 && log[0].source === 'topic-scout' && log[0].action === 'article-create', 'create logged, attributed to Topic Scout');
  ok(log[0].before_state === null && log[0].undo_kind === 'delete-row', 'create snapshot: before=null, undo deletes');
  const articleId = r.body.id;
  // …then publishes it.
  r = await run({ method: 'PATCH', query: { entity: 'articles', via: 'topic-scout' }, headers: H,
    body: { id: articleId, published: true } }, injected);
  ok(r.statusCode === 200, 'publish succeeds');
  log = db.tables.automation_log;
  ok(log.length === 2 && log[1].action === 'article-publish' && /Published the article/.test(log[1].summary), 'publish transition recognised and said in plain words');
  ok(log[1].before_state.published === false && log[1].undo_kind === 'restore-row', 'publish snapshot keeps the unpublished before-state');
  // A delete snapshots the row so undo can re-insert it.
  r = await run({ method: 'DELETE', query: { entity: 'articles', id: articleId }, headers: H }, injected);
  log = db.tables.automation_log;
  ok(log.length === 3 && log[2].action === 'content-delete' && log[2].before_state?.title === 'Guide A' && log[2].after_state === null, 'delete snapshots the full row for restore');
  ok(['website-desk'].includes(log[2].source), 'untagged calls fall back to the generic desk label (via is a whitelist, not trusted text)');
}

// ---------------------------------------------------------------------------
say('\n4) ?activity=list — staff view, honest when the migration is missing');
{
  const db = fakeDb({ automation_log: [
    { id: 'e1', created_at: '2026-11-07T10:00:00Z', actor: 'a', source: 'topic-scout', action: 'article-publish', summary: 'S1', entity_type: 'site_articles', entity_id: 'a1', undo_kind: 'restore-row', before_state: { x: 1 }, undone_at: null },
    { id: 'e2', created_at: '2026-11-07T11:00:00Z', actor: 'b', source: 'ai-growth', action: 'agent-article', summary: 'S2', entity_type: 'site_articles', entity_id: 'a2', undo_kind: 'delete-row', before_state: null, undone_at: null }
  ] });
  let r = await run({ method: 'GET', query: { activity: 'list' }, headers: H }, { db, getUser: userFor('m1', 'manager'), permsFor });
  ok(r.statusCode === 200 && r.body.entries.length === 2, 'manager (site.write) can read the history');
  ok(r.body.entries[0].id === 'e2', 'newest first');
  ok(r.body.entries[0].created === true && r.body.entries[1].created === false, 'created flag derived from the before snapshot');
  ok(!('before_state' in r.body.entries[0]) || r.body.entries[0].before_state === undefined, 'snapshots stay server-side');
  ok(r.body.isAdmin === false, 'manager is told they are not the undo authority');

  r = await run({ method: 'GET', query: { activity: 'list' }, headers: H }, { db: brokenLogDb(), getUser: userFor('ad1', 'admin'), permsFor });
  ok(r.statusCode === 200 && r.body.entries.length === 0 && /MIGRATION-2026-11-automation-log/.test(r.body.storage?.migration || ''), 'missing table → empty list + the exact migration to run, not a crash');

  r = await run({ method: 'GET', query: { activity: 'list' }, headers: H }, { db, getUser: userFor('s1', 'sales'), permsFor });
  ok(r.statusCode === 403, 'roles without site.write cannot read the history');
}

// ---------------------------------------------------------------------------
say('\n5) ?activity=undo — admin-only, restores exactly, logs itself');
{
  const seed = () => fakeDb({
    site_articles: [{ id: 'a1', title: 'New title', published: true, body: 'new' }],
    automation_log: [{ id: 'e1', created_at: '2026-11-07T10:00:00Z', actor: 'scout', source: 'topic-scout', action: 'article-publish',
      summary: 'Published the article “New title” to the website', entity_type: 'site_articles', entity_id: 'a1',
      before_state: { id: 'a1', title: 'Old title', published: false, body: 'old', created_at: '2026-01-01' },
      after_state: { id: 'a1', title: 'New title', published: true, body: 'new' }, undo_kind: 'restore-row', undone_at: null }]
  });

  let db = seed();
  let r = await run({ method: 'POST', query: { activity: 'undo' }, headers: H, body: { id: 'e1' } }, { db, getUser: userFor('m1', 'manager'), permsFor });
  ok(r.statusCode === 403 && /administrator/i.test(r.body.error), 'manager cannot undo — admin only, as the owner asked');
  ok(db.tables.site_articles[0].published === true, 'blocked undo changed nothing');

  r = await run({ method: 'POST', query: { activity: 'undo' }, headers: H, body: { id: 'e1' } }, { db, getUser: userFor('ad1', 'admin'), permsFor });
  ok(r.statusCode === 200 && r.body.op === 'restore', 'admin undo succeeds');
  const art = db.tables.site_articles[0];
  ok(art.title === 'Old title' && art.published === false && art.body === 'old', 'the article is EXACTLY its before-state again');
  const entry = db.tables.automation_log.find(e => e.id === 'e1');
  ok(!!entry.undone_at && entry.undone_by === 'admin', 'entry marked undone with who did it');
  const undoEntry = db.tables.automation_log.find(e => e.action === 'undo');
  ok(undoEntry && undoEntry.undo_of === 'e1' && undoEntry.source === 'undo', 'the undo is itself in the history, pointing at what it reversed');
  ok(!undoEntry.undo_kind, 'an undo entry is not itself undoable (no undo-of-undo chains)');

  r = await run({ method: 'POST', query: { activity: 'undo' }, headers: H, body: { id: 'e1' } }, { db, getUser: userFor('ad1', 'admin'), permsFor });
  ok(r.statusCode === 409 && /already undone/i.test(r.body.error), 'second undo of the same entry refuses');

  // Undo of a CREATE removes the created row.
  db = fakeDb({
    site_articles: [{ id: 'a9', title: 'Agent draft', published: false }],
    automation_log: [{ id: 'e9', created_at: '2026-11-07T10:00:00Z', actor: 'SEO Engine agent', source: 'ai-growth', action: 'agent-article',
      summary: 'created the unpublished draft', entity_type: 'site_articles', entity_id: 'a9',
      before_state: null, after_state: { id: 'a9' }, undo_kind: 'delete-row', undone_at: null }]
  });
  r = await run({ method: 'POST', query: { activity: 'undo' }, headers: H, body: { id: 'e9' } }, { db, getUser: userFor('ad1', 'admin'), permsFor });
  ok(r.statusCode === 200 && r.body.op === 'delete' && db.tables.site_articles.length === 0, 'undo of a create removes the created article');

  r = await run({ method: 'POST', query: { activity: 'nonsense' }, headers: H }, { db, getUser: userFor('ad1', 'admin'), permsFor });
  ok(r.statusCode === 400, 'unknown activity action → 400 with guidance');
}

// ---------------------------------------------------------------------------
say('\n6) Agents write history too — config changes and executed drafts');
{
  const db = fakeDb({ ai_agents: AGENTS.map(a => ({ id: 'ai-' + a, agent: a, enabled: false, paused: false, dry_run: true, max_items_per_run: 3, max_runs_per_day: 4, require_approval: true, autopublish: false })) });
  await updateAgent(db, 'leads', { enabled: true }, { full_name: 'Owner' });
  let log = db.tables.automation_log;
  ok(log.length === 1 && log[0].action === 'agent-config' && /switched ON/.test(log[0].summary), 'config change logged in plain words');
  ok(log[0].before_state.enabled === false && log[0].undo_kind === 'restore-row' && log[0].entity_id === 'leads', 'config before-snapshot enables undo back to OFF');

  const plan = undoPlan(log[0]);
  ok(plan.op === 'restore' && plan.row.enabled === false, 'undoing the config change switches the agent back off');

  // An approved article draft, executed, logs a delete-able create.
  const db2 = fakeDb({
    site_settings: [{ key: 'ai_growth_enabled', value: 'true' }],
    ai_agents: [{ id: 'ai-seo', agent: 'seo', enabled: true, paused: false, autopublish: false }],
    ai_agent_drafts: [{ id: 'd1', agent: 'seo', kind: 'article', status: 'approved', title: 'Export Guide', body: 'Words '.repeat(50), meta: {} }]
  });
  const out = await executeDraft(db2, 'd1', { full_name: 'Owner' });
  ok(out.state === 'executed' && out.result.action === 'article-created', 'draft executes as before (unpublished)');
  const entry = db2.tables.automation_log.find(e => e.action === 'agent-article');
  ok(entry && /SEO Engine agent created/.test(entry.summary) && entry.undo_kind === 'delete-row', 'executed draft logged with undo (remove the created draft)');
  ok(entry.entity_id && db2.tables.site_articles.some(a => String(a.id) === String(entry.entity_id)), 'log points at the real created row');
}

say(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
