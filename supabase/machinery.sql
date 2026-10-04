-- AR7 Traders — machinery & construction equipment (the China desk)
-- Run AFTER schema.sql. Lets the CRM publish machines the public site shows.
--
-- Design note: exactly like supabase/site-content.sql, RLS is ON and NO
-- policies are granted to browser clients. Public reads and every write go
-- through the Vercel functions using the service role. An anonymous visitor
-- reads published machines through /api/site-content?machinery=list, which is
-- a public GET — the same shape the car side already uses.
--
-- WHY A SEPARATE TABLE FROM site_listings
-- A machine is not a car. A car row is keyed on a Japanese stock number and
-- carries mileage, grade and steering; a machine is keyed on an AR7-MC-###
-- reference and carries hours, a spec sheet and a rights basis per photo.
-- Forcing both into one table would leave half the columns null on every row
-- and make the "no photo without a rights basis" rule impossible to enforce
-- per machine. The public /machinery routes read this table; /inventory keeps
-- reading site_listings exactly as it does today. Nothing on the car side
-- moves, is renamed, or is dropped.
--
-- WHY `published` DEFAULTS TO FALSE
-- site_listings defaults to true because a car listed in the CRM is a car the
-- team has already decided to sell. A machine is different: a photo may not be
-- published at all unless it carries a recorded rights basis (see
-- src/machinery-source.js RIGHTS / rightsAreUsable), so nothing here goes live
-- until a person or a passing gate says it may. Publishing is one click in the
-- CRM, and one more click is a fair price for never shipping an unlicensed
-- photograph.

-- --------------------------------------------------------------- machinery
create table if not exists public.machinery (
  id                 uuid primary key default gen_random_uuid(),

  -- Public identity. `ref` is what a buyer quotes back to us and what appears
  -- in the URL (/machinery/excavators/AR7-MC-001), so it is unique.
  ref                text unique not null,
  type               text not null,          -- Excavators | Loaders | Trucks | Cranes …
  brand              text not null,
  model              text not null,
  year               int,
  hours              int,                    -- hour-meter reading (km for trucks)
  price_usd          numeric,                -- indicative FOB, confirmed by quotation

  summary            text,
  -- [["Operating weight","30,200 kg"], ["Engine","Doosan DE08TIS · 147 kW"], …]
  specs              jsonb,
  -- [{"src":"/assets/machinery/x.webp","rights":"own-photo"}, …]
  -- `rights` is mandatory before publication; see rights_basis below.
  images             jsonb,

  status             text default 'Available',
  location           text,
  origin             text default 'China',

  -- ── Import provenance (Part 3) ──────────────────────────────────────────
  -- Where this machine came from, which adapter read it, and when. A machine
  -- added by hand in the CRM has no source_url and no adapter, which is how
  -- the CRM tells the two routes apart.
  source_url         text,
  adapter            text,
  rights_basis       text,                   -- RIGHTS value applied to the batch
  imported_at        timestamptz,

  -- ── Publication ────────────────────────────────────────────────────────
  published          boolean default false,
  -- 'auto' when the import gates passed and the machine published itself, or
  -- the profile id of the person who clicked Publish. Never null once
  -- published, and cleared on unpublish, so the CRM can always answer
  -- "who or what put this live".
  published_by       text,
  published_at       timestamptz,
  -- Why a machine is sitting in the review queue instead of live:
  -- 'no-rights-basis' | 'too-few-photos' | 'no-price' | 'unresolved-type'.
  hold_reason        text,

  -- ── Re-pricing and staleness (Part 3) ──────────────────────────────────
  -- A --daily run that sees a new price records the old figure here before
  -- overwriting it, so the CRM can show "was / now" rather than just "now".
  price_before_usd   numeric,
  price_changed_at   timestamptz,
  -- Last time the nightly run successfully read the source listing. When the
  -- source disappears the row is FLAGGED, never silently delisted — the owner
  -- decides, because a supplier taking a listing down for a weekend is not the
  -- same thing as the machine no longer being available.
  source_last_seen_at timestamptz,
  source_missing_since timestamptz,

  sort_order         int default 0,
  created_at         timestamptz default now(),
  updated_at         timestamptz default now(),
  created_by         uuid
);

-- The public catalogue filters on type and scans by publication state; the
-- nightly re-price walk scans by source_url. ref is already unique-indexed.
create index if not exists machinery_type_idx          on public.machinery(type);
create index if not exists machinery_published_idx     on public.machinery(published) where published;
create index if not exists machinery_source_url_idx    on public.machinery(source_url) where source_url is not null;
create index if not exists machinery_sort_idx          on public.machinery(sort_order, created_at desc);

-- ------------------------------------------------------------------- RLS
alter table public.machinery enable row level security;
-- Deliberately no policies: browser clients get nothing, the service role
-- (used by every Vercel function) bypasses RLS. Same contract as
-- site_listings / site_routes / site_articles.

-- --------------------------------------------------- tunable rules (Part 3)
-- Every rule the nightly import obeys lives in site_settings, exactly like
-- goonet_max_new_per_run, so the owner can retune the importer from the CRM
-- without a redeploy. Inserted with on conflict do nothing so re-running this
-- file never overwrites a value somebody has deliberately changed.
insert into public.site_settings(key, value, updated_at) values
  ('machinery_autopublish',         'true', now()),
  ('machinery_min_photos',          '1',    now()),
  ('machinery_max_reprice_per_run', '10',   now()),
  ('machinery_stale_after_days',    '14',   now()),
  ('machinery_allow_placeholder_photo', 'false', now())
on conflict (key) do nothing;
