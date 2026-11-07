-- MIGRATION 2026-11 — automation history with undo
--
-- WHY: everything the SEO desk (Topic Scout publishes), the AI Growth agents
-- and the website desks do to the public website must leave a reviewable
-- record, and an administrator must be able to undo it later. The existing
-- `activities` table only stores a sentence; undo needs the actual row
-- snapshots, so this table stores the state BEFORE and AFTER every change.
--
-- HOW TO APPLY: Supabase → SQL Editor → paste this file → Run.
-- It is idempotent (safe to run twice).

create table if not exists public.automation_log (
  id           uuid primary key default gen_random_uuid(),
  created_at   timestamptz not null default now(),
  actor        text not null default 'System',     -- who did it (email or agent name)
  source       text not null default 'crm',        -- seo-desk | topic-scout | ai-growth | news-desk | website-desk | undo
  action       text not null,                      -- article-publish, agent-config, …
  summary      text not null,                      -- the plain-language sentence shown in History
  entity_type  text,                               -- table touched (site_articles, ai_agents, …)
  entity_id    text,                               -- row id / agent key, as text
  before_state jsonb,                              -- row snapshot before the change (null = the row did not exist)
  after_state  jsonb,                              -- row snapshot after the change (null = the row was deleted)
  undo_kind    text,                               -- restore-row | delete-row | null (record only, not undoable)
  undone_at    timestamptz,                        -- set when an admin undoes this entry
  undone_by    text,
  undo_of      uuid                                -- for entries that ARE an undo: the entry they reversed
);

create index if not exists automation_log_created_idx on public.automation_log(created_at desc);

-- Service-role only (the Vercel functions). No browser policies on purpose:
-- history snapshots can contain pre-publication drafts.
alter table public.automation_log enable row level security;

select pg_notify('pgrst', 'reload schema');
