-- ---------------------------------------------------------------------------
-- MIGRATION 2026-10 — machinery & construction equipment desk
-- ---------------------------------------------------------------------------
-- Adds the table behind the public /machinery routes and the CRM's machine
-- inventory, so a machine can be added, priced, published, unpublished and
-- archived from the CRM without a code change or a redeploy.
--
-- SAFE TO RE-RUN. Every statement is `if not exists` / `on conflict do
-- nothing`, so running this twice changes nothing the second time and never
-- overwrites a setting somebody has deliberately retuned in the CRM.
--
-- This file touches ONE new table (public.machinery) and inserts at most five
-- rows into public.site_settings. It does not alter, rename or drop anything
-- on the car side — site_listings, site_routes, site_articles, vehicles and
-- japan_dealer_stock are untouched, so the existing inventory, the Goo-net
-- scraper and every car upgrade keep working exactly as they do now.
--
-- Fresh installs do not need this file: supabase/SETUP-EVERYTHING.sql runs
-- supabase/machinery.sql, which holds the same DDL. Keep the two in step.
-- ---------------------------------------------------------------------------

-- ============ 1. DRY RUN — what already exists ============================
-- Nothing below writes. If the table is listed here, section 2 will leave it
-- alone rather than recreate it.

select table_name, 'already present — section 2 will skip it' as note
  from information_schema.tables
 where table_schema = 'public' and table_name = 'machinery';

select key, value from public.site_settings where key like 'machinery_%';

-- ============ 2. THE TABLE ================================================
-- Full column notes live in supabase/machinery.sql. The short version:
--   ref/type/brand/model/year/hours/price_usd — what a buyer sees
--   specs/images/summary                      — the listing
--   source_url/adapter/rights_basis           — where an import came from
--   published/published_by/hold_reason        — who or what put it live
--   price_before_usd/source_missing_since     — re-pricing and staleness
create table if not exists public.machinery (
  id                    uuid primary key default gen_random_uuid(),
  ref                   text unique not null,
  type                  text not null,
  brand                 text not null,
  model                 text not null,
  year                  int,
  hours                 int,
  price_usd             numeric,
  summary               text,
  specs                 jsonb,
  images                jsonb,
  status                text default 'Available',
  location              text,
  origin                text default 'China',
  source_url            text,
  adapter               text,
  rights_basis          text,
  imported_at           timestamptz,
  published             boolean default false,
  published_by          text,
  published_at          timestamptz,
  hold_reason           text,
  price_before_usd      numeric,
  price_changed_at      timestamptz,
  source_last_seen_at   timestamptz,
  source_missing_since  timestamptz,
  sort_order            int default 0,
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),
  created_by            uuid
);

-- Columns added after the first cut of this table would land here, one
-- guarded ALTER each, so an install that already has the table still picks
-- them up. There are none yet — this is the first version.
-- alter table public.machinery add column if not exists … ;

create index if not exists machinery_type_idx       on public.machinery(type);
create index if not exists machinery_published_idx  on public.machinery(published) where published;
create index if not exists machinery_source_url_idx on public.machinery(source_url) where source_url is not null;
create index if not exists machinery_sort_idx       on public.machinery(sort_order, created_at desc);

alter table public.machinery enable row level security;

-- ============ 3. THE TUNABLE RULES ========================================
-- Every rule the nightly importer obeys, in site_settings, so the owner can
-- retune it from the CRM without a redeploy (same pattern as
-- goonet_max_new_per_run). `on conflict do nothing` means a value the owner
-- has already changed is never stomped on.
insert into public.site_settings(key, value, updated_at) values
  ('machinery_autopublish',             'true',  now()),  -- may an import publish itself
  ('machinery_min_photos',              '1',     now()),  -- photos required before auto-publish
  ('machinery_max_reprice_per_run',     '10',    now()),  -- source listings re-priced per nightly run
  ('machinery_stale_after_days',        '14',    now()),  -- days unread before a source is flagged stale
  ('machinery_allow_placeholder_photo', 'false', now())   -- may a facts-only import publish with no photo
on conflict (key) do nothing;

-- ============ 4. VERIFY ===================================================
-- Should list the table, the five settings above, and zero rows (an empty
-- catalogue is correct — the site falls back to src/machinery-data.js until
-- the first machine is published).
select count(*) as machines from public.machinery;
select key, value from public.site_settings where key like 'machinery_%' order by key;
