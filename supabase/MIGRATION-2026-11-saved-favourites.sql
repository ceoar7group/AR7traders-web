-- Saved favourites synced to the customer account (2026-11-08).
--
-- The heart icon on the public site used to live only in the browser's
-- localStorage. Signed-in customers now get ONE row here holding the stock
-- references they hearted, so favourites follow them across devices.
--
--   refs  jsonb — array of stock references (carRef / stock_no strings).
--         The API replaces the whole array on PUT (last write wins) and
--         caps it at 200 entries; references for cars that have left the
--         stock list are kept so a favourite survives a re-import.
--
-- RLS is enabled with NO policies: only the service-role API
-- (my-account.js ?favourites routes) touches this table, always scoped to
-- the requesting auth user — the same contract as saved_searches.

create table if not exists public.saved_favourites (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  refs jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists saved_favourites_user_idx on public.saved_favourites(auth_user_id);

alter table public.saved_favourites enable row level security;
