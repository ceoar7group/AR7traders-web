-- =====================================================================
--  AR7 TRADERS — GOO-NET IMPORTER (Dealer Stock) MIGRATION
--
--  Adds the columns, indexes, settings and run-log the Goo-net importer
--  needs. Safe to run more than once (everything is idempotent).
--
--  Paste into the Supabase SQL Editor and press RUN. You only need this
--  if you are adding the Goo-net importer to an existing database;
--  fresh databases get the same columns from SETUP-EVERYTHING.sql.
-- =====================================================================

-- ---- site_listings: provenance & lifecycle columns -------------------
-- source        'manual' (authored in the CRM / seed) or 'goonet' (scraper)
-- dealer_stock  true = shown on the public "Dealer Stock" page
-- pinned        true = permanent fixture, never auto-removed
-- goonet_id     the goo-net-exchange listing id (numeric slug)
-- photo_count   how many photos the listing carried when scraped
-- first_seen_at when the scraper first imported it
-- last_seen_at  when the scraper last saw it on Goo-net (drives expiry)
-- unavailable_since  set when Goo-net no longer lists the car
alter table public.site_listings add column if not exists source            text;
alter table public.site_listings add column if not exists dealer_stock      boolean default false;
alter table public.site_listings add column if not exists pinned            boolean default false;
alter table public.site_listings add column if not exists goonet_id         text;
alter table public.site_listings add column if not exists photo_count       int;
alter table public.site_listings add column if not exists first_seen_at     timestamptz;
alter table public.site_listings add column if not exists last_seen_at      timestamptz;
alter table public.site_listings add column if not exists unavailable_since timestamptz;

-- The first 60 cars (sort_order <= 60) are permanent fixtures — mark every
-- existing published row that isn't already a scraper import as pinned.
-- (Existing seed cars have no `source`, so they are 'manual' and protected.)
update public.site_listings
   set source = coalesce(source, 'manual'),
       pinned = true
 where sort_order <= 60;

-- Fast lookups used by the public site + the importer's expiry/cleanup pass.
create index if not exists site_listings_source_idx      on public.site_listings (source);
create index if not exists site_listings_dealer_idx      on public.site_listings (dealer_stock);
create index if not exists site_listings_pinned_idx      on public.site_listings (pinned);
create index if not exists site_listings_goonet_id_idx   on public.site_listings (goonet_id);
create index if not exists site_listings_last_seen_idx   on public.site_listings (last_seen_at);
create index if not exists site_listings_published_idx   on public.site_listings (published);

-- ---- Goo-net rules (editable from the CRM's Website settings) --------
-- These key names are read by scripts/goonet-core.mjs (normaliseConfig).
insert into public.site_settings (key,value,label) values
  ('goonet_enabled','true','Goo-net importer: master switch (true/false)'),
  ('goonet_daily_limit','40','Goo-net importer: max NEW cars imported per run/day'),
  ('goonet_min_photos','10','Goo-net importer: minimum photos for a "high quality" listing'),
  ('goonet_pinned_count','60','Goo-net importer: first N cars are permanent fixtures'),
  ('goonet_max_live','400','Goo-net importer: soft cap on live Goo-net cars (site smoothness)'),
  ('goonet_unavailable_grace','21','Goo-net importer: days unseen before a car is hidden'),
  ('goonet_new_arrival_days','7','Goo-net importer: days a car keeps the New Arrival badge'),
  ('goonet_request_delay_ms','1500','Goo-net importer: ms delay between requests (politeness)'),
  ('goonet_page_limit','6','Goo-net importer: search pages walked per run'),
  ('goonet_jpy_to_usd','155','Goo-net importer: JPY→USD rate for price conversion')
on conflict (key) do nothing;

-- ---- Run history (observability, not required for the importer) ------
create table if not exists public.goonet_runs (
  id            uuid primary key default gen_random_uuid(),
  started_at    timestamptz not null default now(),
  finished_at   timestamptz,
  status        text not null default 'running' check (status in ('running','ok','error','skipped')),
  summary       text,
  candidates    int,
  fetched       int,
  inserted      int,
  updated       int,
  unpublished   int,
  error         text
);
create index if not exists goonet_runs_started_idx on public.goonet_runs (started_at desc);
