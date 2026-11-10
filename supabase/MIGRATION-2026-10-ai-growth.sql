-- ---------------------------------------------------------------------------
-- MIGRATION 2026-10 — AI Growth agents (orchestrator, runs, drafts, usage)
-- ---------------------------------------------------------------------------
-- SAFE TO RE-RUN. Every statement is `if not exists` / `on conflict do nothing`,
-- so running this twice changes nothing the second time and never overwrites a
-- setting a person has retuned in the CRM.
--
-- WHAT THIS CREATES (and why each table exists)
--
--   ai_agents          Agent configuration: on/off, schedule, timezone, dry-run,
--                      per-run and per-day limits. One row per agent.
--   ai_agent_runs      Every run, persisted — not kept in process memory. Holds
--                      the lifecycle state (queued → running → awaiting_review →
--                      approved → executing → completed, plus rejected,
--                      cancelled, failed, partially_completed), the idempotency
--                      key that stops duplicate triggers, the lease that stops
--                      overlapping runs, per-step outcomes and checkpoints so a
--                      bounded serverless run can resume, and initiator /
--                      reviewer / approver / executor attribution.
--   ai_agent_locks     One row per agent, holding the run that owns it and the
--                      lease expiry. An expired lease is reclaimable, so a
--                      killed worker cannot lock an agent out for ever.
--   ai_agent_drafts    Reviewable output (article drafts, lead replies, social
--                      posts). Nothing here is published: a draft only becomes
--                      an action after an explicit approval, and the row keeps
--                      the approval and the execution result separately.
--   ai_agent_messages  Scheduled / executed outbound messages and posts, with
--                      their own state machine (prepared, opened, submitted,
--                      delivered, failed, skipped) so "drafted" is never shown
--                      as "posted".
--   ai_provider_usage  Per-day provider usage (requests and tokens) so quota
--                      exhaustion is visible in the dashboard before it stops
--                      work, and so cost estimates are only shown when the
--                      numbers were actually supplied by the provider.
--
-- RLS is ON with NO policies for browser clients, exactly like supabase/
-- machinery.sql: every read and write goes through the Vercel functions with
-- the service role, gated by the CRM's own permission checks.
--
-- NOTHING here touches the car or machinery tables. It is additive.
-- ---------------------------------------------------------------------------

-- ============ 0. DRY RUN — what already exists =============================
select table_name as already_present
  from information_schema.tables
 where table_schema = 'public'
   and table_name in ('ai_agents','ai_agent_runs','ai_agent_locks','ai_agent_drafts','ai_agent_messages','ai_provider_usage');

-- ============ 1. AGENT CONFIGURATION ======================================
create table if not exists public.ai_agents (
  agent            text primary key,             -- leads | seo | social
  label            text not null,
  enabled          boolean not null default false,
  paused           boolean not null default false,
  dry_run          boolean not null default true,
  schedule_cron    text,                          -- informational; GitHub Actions holds the schedule
  timezone         text not null default 'UTC',
  max_items_per_run integer not null default 5,
  max_runs_per_day  integer not null default 4,
  require_approval boolean not null default true,
  autopublish      boolean not null default false, -- separate, deliberate authorisation
  updated_at       timestamptz not null default now(),
  updated_by       text
);

insert into public.ai_agents (agent, label, enabled, dry_run, schedule_cron, max_items_per_run, max_runs_per_day)
values
  ('leads',  'Lead Gen & CRM',  false, true, '0 7 * * 1-5',  5, 4),
  ('seo',    'SEO Engine',      false, true, '30 6 * * 2,5', 3, 2),
  ('social', 'Social Media',    false, true, '0 8 * * *',    1, 2)
on conflict (agent) do nothing;

-- ============ 2. RUNS =====================================================
create table if not exists public.ai_agent_runs (
  id               uuid primary key default gen_random_uuid(),
  agent            text not null,
  status           text not null default 'queued',
  mode             text not null default 'dry-run',   -- dry-run | review | execute
  trigger          text not null default 'manual',    -- manual | schedule | api
  idempotency_key  text unique,
  requested_by     text,
  reviewed_by      text,
  approved_by      text,
  executed_by      text,
  started_at       timestamptz,
  finished_at      timestamptz,
  lease_until      timestamptz,
  attempt          integer not null default 1,
  checkpoint       jsonb,
  counts           jsonb,     -- attempted / succeeded / skipped / failed / drafted
  steps            jsonb,     -- [{step, state, detail, at}]
  provider         jsonb,     -- {name, model, requests, tokensIn, tokensOut, quotaState}
  error            text,
  note             text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index if not exists ai_agent_runs_agent_idx  on public.ai_agent_runs(agent, created_at desc);
create index if not exists ai_agent_runs_status_idx on public.ai_agent_runs(status);

-- ============ 3. LOCKS / LEASES ===========================================
create table if not exists public.ai_agent_locks (
  agent       text primary key,
  run_id      uuid,
  lease_until timestamptz,
  updated_at  timestamptz not null default now()
);

-- ============ 4. DRAFTS ===================================================
create table if not exists public.ai_agent_drafts (
  id            uuid primary key default gen_random_uuid(),
  agent         text not null,
  run_id        uuid,
  kind          text not null,                  -- article | lead-reply | social-post | brief | spec-card
  title         text,
  body          text,
  target        text,                           -- slug/url/channel/stock ref the draft is about
  meta          jsonb,                          -- sources, evidence, score, rubric version…
  status        text not null default 'awaiting_review',
  review_note   text,
  created_by    text,
  reviewed_by   text,
  approved_by   text,
  executed_by   text,
  approved_at   timestamptz,
  executed_at   timestamptz,
  result        jsonb,                          -- what actually happened when it executed
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists ai_agent_drafts_agent_idx  on public.ai_agent_drafts(agent, created_at desc);
create index if not exists ai_agent_drafts_status_idx on public.ai_agent_drafts(status);

-- ============ 5. MESSAGES / POSTS =========================================
create table if not exists public.ai_agent_messages (
  id            uuid primary key default gen_random_uuid(),
  agent         text not null,
  draft_id      uuid,
  channel       text not null,                 -- whatsapp | instagram | linkedin | website | email
  to_ref        text,                          -- consented lead id / account handle, never a secret
  body          text,
  state         text not null default 'prepared',  -- prepared | opened | submitted | delivered | failed | skipped | cancelled
  scheduled_for timestamptz,
  sent_at       timestamptz,
  provider_id   text,
  error         text,
  meta          jsonb,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists ai_agent_messages_state_idx on public.ai_agent_messages(channel, state, scheduled_for);

-- ============ 6. PROVIDER USAGE ===========================================
create table if not exists public.ai_provider_usage (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null,
  model        text,
  feature      text not null,
  day          date not null default current_date,
  requests     integer not null default 0,
  tokens_in    integer not null default 0,
  tokens_out   integer not null default 0,
  errors       integer not null default 0,
  last_state   text,
  updated_at   timestamptz not null default now(),
  unique (provider, feature, day)
);

-- ============ 7. RLS ======================================================
alter table public.ai_agents          enable row level security;
alter table public.ai_agent_runs      enable row level security;
alter table public.ai_agent_locks     enable row level security;
alter table public.ai_agent_drafts    enable row level security;
alter table public.ai_agent_messages  enable row level security;
alter table public.ai_provider_usage  enable row level security;

-- ============ 8. SETTINGS =================================================
-- The global emergency stop and the provider switches live in site_settings so
-- the desk can flip them without a redeploy (same pattern as the importers).
insert into public.site_settings (key, value, updated_at) values
  ('ai_growth_enabled',            'true',  now()),
  ('ai_growth_emergency_stop',     'false', now()),
  ('ai_growth_dry_run_default',    'true',  now()),
  ('ai_growth_max_runs_per_day',   '6',     now()),
  ('ai_growth_provider',           'gemini',now())
on conflict (key) do nothing;

-- Ask PostgREST to pick the new tables up immediately (also printed by the
-- nightly workflow when the machinery storage probe fails).
select pg_notify('pgrst', 'reload schema');
