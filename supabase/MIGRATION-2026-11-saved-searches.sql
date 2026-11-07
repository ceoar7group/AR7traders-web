-- Saved searches & stock alerts (2026-11-07).
--
-- A buyer saves their inventory filters; the nightly sweep
-- (/api/my-account?alerts=run, triggered by .github/workflows/goonet-sync.yml
-- right after the Goo-net import lands new stock) e-mails them the cars that
-- are new since the search last looked.
--
--   criteria   jsonb — the filter snapshot (src/saved-search.js is the one
--              matcher both the browser and the sweep run)
--   seen_refs  jsonb — stock references this search has already been shown;
--              "new" is a set difference, so a car alerts once, ever
--   email      text  — captured from the confirmed auth user at save time so
--              the sweep never needs an admin auth lookup per row
--
-- RLS is enabled with NO policies: only the service-role API (my-account.js)
-- touches this table, always scoped to the requesting auth user.

create table if not exists public.saved_searches (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  name text not null default 'My search',
  criteria jsonb not null default '{}'::jsonb,
  email_alerts boolean not null default true,
  seen_refs jsonb not null default '[]'::jsonb,
  last_checked_at timestamptz,
  last_notified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_searches_user_idx on public.saved_searches(auth_user_id);

alter table public.saved_searches enable row level security;
