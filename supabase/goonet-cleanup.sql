-- =====================================================================
--  GOO-NET CLEANUP — permanently remove bad imports and block them
--
--  Run this ONCE in Supabase → SQL Editor (it is also safe to re-run).
--  BACK UP FIRST: Supabase → Database → Backups, or
--    select * from public.japan_dealer_stock  →  export CSV.
--
--  What it does, in order:
--    1. creates goonet_blocklist (the importer's permanent memory of every
--       deleted car — anything on it is never re-imported)
--    2. blocks every car with < 8 photos or missing / placeholder details
--    3. removes the website + CRM copies promoted from those cars
--    4. deletes the cars themselves
--    5. raises the importer's photo minimum to 8
--    6. prints the counts you can check against the task sheet
-- =====================================================================

-- 1. Blocklist table -----------------------------------------------------
create table if not exists public.goonet_blocklist (
  goonet_id   text primary key,
  stock_no    text,
  reason      text,
  blocked_at  timestamptz default now()
);
create index if not exists goonet_blocklist_blocked_idx on public.goonet_blocklist(blocked_at desc);
alter table public.goonet_blocklist enable row level security;
-- (no browser policies on purpose: only the service-role functions touch it)

-- 2. Block the bad cars BEFORE deleting them ------------------------------
--    Photo rule: fewer than 8 photos (photo_count OR the actual gallery).
insert into public.goonet_blocklist (goonet_id, stock_no, reason, blocked_at)
select goonet_id, stock_no,
       'Old import with <8 photos (' || least(coalesce(photo_count, 0),
         case when images is null or jsonb_typeof(images) <> 'array' then 0 else jsonb_array_length(images) end)
       || ')',
       now()
  from public.japan_dealer_stock
 where coalesce(photo_count, 0) < 8
    or images is null
    or jsonb_typeof(images) <> 'array'
    or jsonb_array_length(images) < 8
on conflict (goonet_id) do nothing;

--    Detail rule: missing / placeholder make, model, year or price.
insert into public.goonet_blocklist (goonet_id, stock_no, reason, blocked_at)
select goonet_id, stock_no,
       'Old import with missing details (make:' || coalesce(make, 'null')
         || ', model:' || coalesce(model, 'null')
         || ', year:' || coalesce(year::text, 'null')
         || ', price_jpy:' || coalesce(price_jpy::text, 'null') || ')',
       now()
  from public.japan_dealer_stock
 where make is null or btrim(make) = '' or make = 'Unknown'
    or model is null or btrim(model) = '' or lower(model) in ('car', 'vehicle', 'used car', 'unknown')
    or year is null or year < 2000
    or price_jpy is null or price_jpy <= 0
on conflict (goonet_id) do nothing;

-- 3. Remove the promoted copies (website cars + CRM inventory) -----------
delete from public.site_listings
 where stock_no in (
   select j.stock_no from public.japan_dealer_stock j
     join public.goonet_blocklist b on b.goonet_id = j.goonet_id
    where j.stock_no is not null);

delete from public.vehicles
 where vendor = 'Goo-net'
   and stock_no in (
   select j.stock_no from public.japan_dealer_stock j
     join public.goonet_blocklist b on b.goonet_id = j.goonet_id
    where j.stock_no is not null);

-- 4. Delete the bad cars --------------------------------------------------
delete from public.japan_dealer_stock
 where goonet_id in (select goonet_id from public.goonet_blocklist);

-- 5. Importer rule: minimum 8 photos --------------------------------------
insert into public.site_settings (key, value, label)
values ('goonet_min_photos', '8', 'Minimum photos a car must have to be imported (quality gate; the importer never goes below 8)')
on conflict (key) do update
  set value = case when coalesce(nullif(public.site_settings.value, ''), '0')::numeric < 8 then '8' else public.site_settings.value end,
      updated_at = now();

-- 6. Verification (both should match the task sheet) ---------------------
select 'japan_dealer_stock with < 8 photos (expect 0)' as check_name,
       count(*) as value
  from public.japan_dealer_stock
 where coalesce(photo_count, 0) < 8
union all
select 'goonet_blocklist rows (expect > 0)', count(*) from public.goonet_blocklist
union all
select 'japan_dealer_stock remaining', count(*) from public.japan_dealer_stock
union all
select 'japan_dealer_stock with Unknown make / generic model (expect 0)', count(*)
  from public.japan_dealer_stock
 where make is null or make = 'Unknown' or model is null or lower(model) in ('car', 'vehicle', 'used car');
