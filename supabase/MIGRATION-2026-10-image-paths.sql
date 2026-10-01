-- ---------------------------------------------------------------------------
-- MIGRATION 2026-10 — image paths after the WebP pass
-- ---------------------------------------------------------------------------
-- The October 2026 image pass renamed 40 photographs in public/assets from
-- .jpg to .webp and rewrote every reference in the repository. Rows that were
-- already stored in Supabase kept the old name, so on the live site the
-- showroom / inventory cards for cars uploaded before the pass render the ALT
-- text instead of a photo. Cars uploaded after the pass are fine.
--
-- This file cleans those stored paths. It is OPTIONAL: vercel.json already
-- rewrites each old URL to its .webp sibling and src/image-fallback.js retries
-- an <img> once against the sibling extension, so the site works without it.
-- Run it when convenient — it is safe to re-run (every pass only touches rows
-- that still mention an old path) and it only ever moves a .jpg name onto the
-- .webp file that actually ships.
--
-- Paste into the Supabase SQL editor. Read the dry-run block first: it shows
-- exactly what is left to fix before anything is written.
-- ---------------------------------------------------------------------------

-- ============ 1. DRY RUN — what still points at a renamed photo ============
-- Nothing below writes. Run it, look at the rows, then run section 2.
-- A row listed here after section 2 points at a path that is not in the list —
-- fix that row by hand, or re-upload the car through the CRM.

with renamed(old_path, new_path) as (
  values
  ('/assets/gallery/lexus-lc-500-01.jpg', '/assets/gallery/lexus-lc-500-01.webp'),
  ('/assets/gallery/lexus-lc-500-02.jpg', '/assets/gallery/lexus-lc-500-02.webp'),
  ('/assets/gallery/lexus-lc-500-03.jpg', '/assets/gallery/lexus-lc-500-03.webp'),
  ('/assets/gallery/lexus-lc-500-04.jpg', '/assets/gallery/lexus-lc-500-04.webp'),
  ('/assets/gallery/lexus-lc-500-05.jpg', '/assets/gallery/lexus-lc-500-05.webp'),
  ('/assets/inventory/700052000730260404001.jpg', '/assets/inventory/700052000730260404001.webp'),
  ('/assets/inventory/700054141330260802005.jpg', '/assets/inventory/700054141330260802005.webp'),
  ('/assets/inventory/700056103730260717002.jpg', '/assets/inventory/700056103730260717002.webp'),
  ('/assets/inventory/700071023230260801001.jpg', '/assets/inventory/700071023230260801001.webp'),
  ('/assets/inventory/700100197430260726001.jpg', '/assets/inventory/700100197430260726001.webp'),
  ('/assets/inventory/988026080300208264002.jpg', '/assets/inventory/988026080300208264002.webp'),
  ('/assets/japan-used-car-export-inventory-toyota-h-1.jpg', '/assets/japan-used-car-export-inventory-toyota-h-1.webp'),
  ('/assets/japan-used-car-export-inventory-toyota-h-2.jpg', '/assets/japan-used-car-export-inventory-toyota-h-2.webp'),
  ('/assets/japan-used-car-export-inventory-toyota-h-3.jpg', '/assets/japan-used-car-export-inventory-toyota-h-3.webp'),
  ('/assets/japan-used-car-export-inventory-toyota-h-4.jpg', '/assets/japan-used-car-export-inventory-toyota-h-4.webp'),
  ('/assets/japan-used-car-export-inventory-toyota-h-5.jpg', '/assets/japan-used-car-export-inventory-toyota-h-5.webp'),
  ('/assets/japan-used-car-export-stock-honda-vezel--1.jpg', '/assets/japan-used-car-export-stock-honda-vezel--1.webp'),
  ('/assets/japan-used-car-export-stock-honda-vezel--2.jpg', '/assets/japan-used-car-export-stock-honda-vezel--2.webp'),
  ('/assets/japan-used-car-export-stock-honda-vezel--3.jpg', '/assets/japan-used-car-export-stock-honda-vezel--3.webp'),
  ('/assets/japan-used-car-export-stock-honda-vezel--4.jpg', '/assets/japan-used-car-export-stock-honda-vezel--4.webp'),
  ('/assets/japan-used-car-export-stock-honda-vezel--5.jpg', '/assets/japan-used-car-export-stock-honda-vezel--5.webp'),
  ('/assets/japanese-car-auction-inspection-shipping-1.jpg', '/assets/japanese-car-auction-inspection-shipping-1.webp'),
  ('/assets/japanese-car-auction-inspection-shipping-2.jpg', '/assets/japanese-car-auction-inspection-shipping-2.webp'),
  ('/assets/japanese-car-auction-inspection-shipping-3.jpg', '/assets/japanese-car-auction-inspection-shipping-3.webp'),
  ('/assets/lux/audi-r8.jpg', '/assets/lux/audi-r8.webp'),
  ('/assets/lux/bentley-continental-gt.jpg', '/assets/lux/bentley-continental-gt.webp'),
  ('/assets/lux/bmw-m8-competition.jpg', '/assets/lux/bmw-m8-competition.webp'),
  ('/assets/lux/bugatti-chiron.jpg', '/assets/lux/bugatti-chiron.webp'),
  ('/assets/lux/ferrari-f8-tributo.jpg', '/assets/lux/ferrari-f8-tributo.webp'),
  ('/assets/lux/lamborghini-huracan.jpg', '/assets/lux/lamborghini-huracan.webp'),
  ('/assets/lux/lexus-lc-500.jpg', '/assets/lux/lexus-lc-500.webp'),
  ('/assets/lux/mclaren-720s.jpg', '/assets/lux/mclaren-720s.webp'),
  ('/assets/lux/mercedes-amg-gt.jpg', '/assets/lux/mercedes-amg-gt.webp'),
  ('/assets/lux/porsche-911-turbo-s.jpg', '/assets/lux/porsche-911-turbo-s.webp'),
  ('/assets/lux/rolls-royce-cullinan.jpg', '/assets/lux/rolls-royce-cullinan.webp'),
  ('/assets/lux/rolls-royce-ghost.jpg', '/assets/lux/rolls-royce-ghost.webp'),
  ('/assets/used-japanese-cars-auction-export-toyota-1.jpg', '/assets/used-japanese-cars-auction-export-toyota-1.webp'),
  ('/assets/used-japanese-cars-auction-export-toyota-2.jpg', '/assets/used-japanese-cars-auction-export-toyota-2.webp'),
  ('/assets/used-japanese-cars-auction-export-toyota-4.jpg', '/assets/used-japanese-cars-auction-export-toyota-4.webp'),
  ('/assets/used-japanese-cars-auction-export-toyota-5.jpg', '/assets/used-japanese-cars-auction-export-toyota-5.webp')
)
select 'public.site_listings.image' as where_it_is, t.id, r.old_path as stale_path,
       t.image as stored_value
  from public.site_listings t
  join renamed r on t.image like '%' || r.old_path || '%';

select 'public.site_listings.images' as where_it_is, t.id, r.old_path as stale_path,
       t.images as stored_value
  from public.site_listings t
  join renamed r on t.images::text like '%' || r.old_path || '%';

select 'public.site_listings.gallery' as where_it_is, t.id, r.old_path as stale_path,
       t.gallery as stored_value
  from public.site_listings t
  join renamed r on t.gallery::text like '%' || r.old_path || '%';

select 'public.site_articles.image' as where_it_is, t.id, r.old_path as stale_path,
       t.image as stored_value
  from public.site_articles t
  join renamed r on t.image like '%' || r.old_path || '%';

select 'public.site_articles.body' as where_it_is, t.id, r.old_path as stale_path,
       t.body as stored_value
  from public.site_articles t
  join renamed r on t.body like '%' || r.old_path || '%';

select 'public.vehicles.image' as where_it_is, t.id, r.old_path as stale_path,
       t.image as stored_value
  from public.vehicles t
  join renamed r on t.image like '%' || r.old_path || '%';

select 'public.vehicles.images' as where_it_is, t.id, r.old_path as stale_path,
       t.images as stored_value
  from public.vehicles t
  join renamed r on t.images::text like '%' || r.old_path || '%';

select 'public.vehicles.gallery' as where_it_is, t.id, r.old_path as stale_path,
       t.gallery as stored_value
  from public.vehicles t
  join renamed r on t.gallery::text like '%' || r.old_path || '%';

select 'public.site_blocks.value' as where_it_is, t.id, r.old_path as stale_path,
       t.value as stored_value
  from public.site_blocks t
  join renamed r on t.value like '%' || r.old_path || '%';

-- ============ 2. THE FIX ============
-- One pass per column that can hold a photo path, looping over the same list.
-- Looping matters: a gallery can hold several renamed photos, and one UPDATE
-- ... FROM would only ever fix the first of them.
-- A column your install does not have is skipped with a notice rather than
-- aborting the whole file.

-- ---- public.site_listings.image ----
do $$
declare r record;
begin
  for r in (
    values
      ('/assets/gallery/lexus-lc-500-01.jpg', '/assets/gallery/lexus-lc-500-01.webp'),
      ('/assets/gallery/lexus-lc-500-02.jpg', '/assets/gallery/lexus-lc-500-02.webp'),
      ('/assets/gallery/lexus-lc-500-03.jpg', '/assets/gallery/lexus-lc-500-03.webp'),
      ('/assets/gallery/lexus-lc-500-04.jpg', '/assets/gallery/lexus-lc-500-04.webp'),
      ('/assets/gallery/lexus-lc-500-05.jpg', '/assets/gallery/lexus-lc-500-05.webp'),
      ('/assets/inventory/700052000730260404001.jpg', '/assets/inventory/700052000730260404001.webp'),
      ('/assets/inventory/700054141330260802005.jpg', '/assets/inventory/700054141330260802005.webp'),
      ('/assets/inventory/700056103730260717002.jpg', '/assets/inventory/700056103730260717002.webp'),
      ('/assets/inventory/700071023230260801001.jpg', '/assets/inventory/700071023230260801001.webp'),
      ('/assets/inventory/700100197430260726001.jpg', '/assets/inventory/700100197430260726001.webp'),
      ('/assets/inventory/988026080300208264002.jpg', '/assets/inventory/988026080300208264002.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-1.jpg', '/assets/japan-used-car-export-inventory-toyota-h-1.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-2.jpg', '/assets/japan-used-car-export-inventory-toyota-h-2.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-3.jpg', '/assets/japan-used-car-export-inventory-toyota-h-3.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-4.jpg', '/assets/japan-used-car-export-inventory-toyota-h-4.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-5.jpg', '/assets/japan-used-car-export-inventory-toyota-h-5.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--1.jpg', '/assets/japan-used-car-export-stock-honda-vezel--1.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--2.jpg', '/assets/japan-used-car-export-stock-honda-vezel--2.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--3.jpg', '/assets/japan-used-car-export-stock-honda-vezel--3.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--4.jpg', '/assets/japan-used-car-export-stock-honda-vezel--4.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--5.jpg', '/assets/japan-used-car-export-stock-honda-vezel--5.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-1.jpg', '/assets/japanese-car-auction-inspection-shipping-1.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-2.jpg', '/assets/japanese-car-auction-inspection-shipping-2.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-3.jpg', '/assets/japanese-car-auction-inspection-shipping-3.webp'),
      ('/assets/lux/audi-r8.jpg', '/assets/lux/audi-r8.webp'),
      ('/assets/lux/bentley-continental-gt.jpg', '/assets/lux/bentley-continental-gt.webp'),
      ('/assets/lux/bmw-m8-competition.jpg', '/assets/lux/bmw-m8-competition.webp'),
      ('/assets/lux/bugatti-chiron.jpg', '/assets/lux/bugatti-chiron.webp'),
      ('/assets/lux/ferrari-f8-tributo.jpg', '/assets/lux/ferrari-f8-tributo.webp'),
      ('/assets/lux/lamborghini-huracan.jpg', '/assets/lux/lamborghini-huracan.webp'),
      ('/assets/lux/lexus-lc-500.jpg', '/assets/lux/lexus-lc-500.webp'),
      ('/assets/lux/mclaren-720s.jpg', '/assets/lux/mclaren-720s.webp'),
      ('/assets/lux/mercedes-amg-gt.jpg', '/assets/lux/mercedes-amg-gt.webp'),
      ('/assets/lux/porsche-911-turbo-s.jpg', '/assets/lux/porsche-911-turbo-s.webp'),
      ('/assets/lux/rolls-royce-cullinan.jpg', '/assets/lux/rolls-royce-cullinan.webp'),
      ('/assets/lux/rolls-royce-ghost.jpg', '/assets/lux/rolls-royce-ghost.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-1.jpg', '/assets/used-japanese-cars-auction-export-toyota-1.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-2.jpg', '/assets/used-japanese-cars-auction-export-toyota-2.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-4.jpg', '/assets/used-japanese-cars-auction-export-toyota-4.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-5.jpg', '/assets/used-japanese-cars-auction-export-toyota-5.webp')
  ) as v(old_path, new_path) loop
    update public.site_listings
       set image = replace(image, r.old_path, r.new_path)
     where image like '%' || r.old_path || '%';
  end loop;
exception when undefined_column then
  raise notice 'public.site_listings.image: column not present on this install — skipped';
end $$;

-- ---- public.site_listings.images ----
do $$
declare r record;
begin
  for r in (
    values
      ('/assets/gallery/lexus-lc-500-01.jpg', '/assets/gallery/lexus-lc-500-01.webp'),
      ('/assets/gallery/lexus-lc-500-02.jpg', '/assets/gallery/lexus-lc-500-02.webp'),
      ('/assets/gallery/lexus-lc-500-03.jpg', '/assets/gallery/lexus-lc-500-03.webp'),
      ('/assets/gallery/lexus-lc-500-04.jpg', '/assets/gallery/lexus-lc-500-04.webp'),
      ('/assets/gallery/lexus-lc-500-05.jpg', '/assets/gallery/lexus-lc-500-05.webp'),
      ('/assets/inventory/700052000730260404001.jpg', '/assets/inventory/700052000730260404001.webp'),
      ('/assets/inventory/700054141330260802005.jpg', '/assets/inventory/700054141330260802005.webp'),
      ('/assets/inventory/700056103730260717002.jpg', '/assets/inventory/700056103730260717002.webp'),
      ('/assets/inventory/700071023230260801001.jpg', '/assets/inventory/700071023230260801001.webp'),
      ('/assets/inventory/700100197430260726001.jpg', '/assets/inventory/700100197430260726001.webp'),
      ('/assets/inventory/988026080300208264002.jpg', '/assets/inventory/988026080300208264002.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-1.jpg', '/assets/japan-used-car-export-inventory-toyota-h-1.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-2.jpg', '/assets/japan-used-car-export-inventory-toyota-h-2.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-3.jpg', '/assets/japan-used-car-export-inventory-toyota-h-3.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-4.jpg', '/assets/japan-used-car-export-inventory-toyota-h-4.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-5.jpg', '/assets/japan-used-car-export-inventory-toyota-h-5.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--1.jpg', '/assets/japan-used-car-export-stock-honda-vezel--1.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--2.jpg', '/assets/japan-used-car-export-stock-honda-vezel--2.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--3.jpg', '/assets/japan-used-car-export-stock-honda-vezel--3.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--4.jpg', '/assets/japan-used-car-export-stock-honda-vezel--4.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--5.jpg', '/assets/japan-used-car-export-stock-honda-vezel--5.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-1.jpg', '/assets/japanese-car-auction-inspection-shipping-1.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-2.jpg', '/assets/japanese-car-auction-inspection-shipping-2.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-3.jpg', '/assets/japanese-car-auction-inspection-shipping-3.webp'),
      ('/assets/lux/audi-r8.jpg', '/assets/lux/audi-r8.webp'),
      ('/assets/lux/bentley-continental-gt.jpg', '/assets/lux/bentley-continental-gt.webp'),
      ('/assets/lux/bmw-m8-competition.jpg', '/assets/lux/bmw-m8-competition.webp'),
      ('/assets/lux/bugatti-chiron.jpg', '/assets/lux/bugatti-chiron.webp'),
      ('/assets/lux/ferrari-f8-tributo.jpg', '/assets/lux/ferrari-f8-tributo.webp'),
      ('/assets/lux/lamborghini-huracan.jpg', '/assets/lux/lamborghini-huracan.webp'),
      ('/assets/lux/lexus-lc-500.jpg', '/assets/lux/lexus-lc-500.webp'),
      ('/assets/lux/mclaren-720s.jpg', '/assets/lux/mclaren-720s.webp'),
      ('/assets/lux/mercedes-amg-gt.jpg', '/assets/lux/mercedes-amg-gt.webp'),
      ('/assets/lux/porsche-911-turbo-s.jpg', '/assets/lux/porsche-911-turbo-s.webp'),
      ('/assets/lux/rolls-royce-cullinan.jpg', '/assets/lux/rolls-royce-cullinan.webp'),
      ('/assets/lux/rolls-royce-ghost.jpg', '/assets/lux/rolls-royce-ghost.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-1.jpg', '/assets/used-japanese-cars-auction-export-toyota-1.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-2.jpg', '/assets/used-japanese-cars-auction-export-toyota-2.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-4.jpg', '/assets/used-japanese-cars-auction-export-toyota-4.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-5.jpg', '/assets/used-japanese-cars-auction-export-toyota-5.webp')
  ) as v(old_path, new_path) loop
    update public.site_listings
       set images = replace(images::text, r.old_path, r.new_path)::jsonb
     where images::text like '%' || r.old_path || '%';
  end loop;
exception when undefined_column then
  raise notice 'public.site_listings.images: column not present on this install — skipped';
end $$;

-- ---- public.site_listings.gallery ----
do $$
declare r record;
begin
  for r in (
    values
      ('/assets/gallery/lexus-lc-500-01.jpg', '/assets/gallery/lexus-lc-500-01.webp'),
      ('/assets/gallery/lexus-lc-500-02.jpg', '/assets/gallery/lexus-lc-500-02.webp'),
      ('/assets/gallery/lexus-lc-500-03.jpg', '/assets/gallery/lexus-lc-500-03.webp'),
      ('/assets/gallery/lexus-lc-500-04.jpg', '/assets/gallery/lexus-lc-500-04.webp'),
      ('/assets/gallery/lexus-lc-500-05.jpg', '/assets/gallery/lexus-lc-500-05.webp'),
      ('/assets/inventory/700052000730260404001.jpg', '/assets/inventory/700052000730260404001.webp'),
      ('/assets/inventory/700054141330260802005.jpg', '/assets/inventory/700054141330260802005.webp'),
      ('/assets/inventory/700056103730260717002.jpg', '/assets/inventory/700056103730260717002.webp'),
      ('/assets/inventory/700071023230260801001.jpg', '/assets/inventory/700071023230260801001.webp'),
      ('/assets/inventory/700100197430260726001.jpg', '/assets/inventory/700100197430260726001.webp'),
      ('/assets/inventory/988026080300208264002.jpg', '/assets/inventory/988026080300208264002.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-1.jpg', '/assets/japan-used-car-export-inventory-toyota-h-1.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-2.jpg', '/assets/japan-used-car-export-inventory-toyota-h-2.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-3.jpg', '/assets/japan-used-car-export-inventory-toyota-h-3.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-4.jpg', '/assets/japan-used-car-export-inventory-toyota-h-4.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-5.jpg', '/assets/japan-used-car-export-inventory-toyota-h-5.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--1.jpg', '/assets/japan-used-car-export-stock-honda-vezel--1.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--2.jpg', '/assets/japan-used-car-export-stock-honda-vezel--2.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--3.jpg', '/assets/japan-used-car-export-stock-honda-vezel--3.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--4.jpg', '/assets/japan-used-car-export-stock-honda-vezel--4.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--5.jpg', '/assets/japan-used-car-export-stock-honda-vezel--5.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-1.jpg', '/assets/japanese-car-auction-inspection-shipping-1.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-2.jpg', '/assets/japanese-car-auction-inspection-shipping-2.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-3.jpg', '/assets/japanese-car-auction-inspection-shipping-3.webp'),
      ('/assets/lux/audi-r8.jpg', '/assets/lux/audi-r8.webp'),
      ('/assets/lux/bentley-continental-gt.jpg', '/assets/lux/bentley-continental-gt.webp'),
      ('/assets/lux/bmw-m8-competition.jpg', '/assets/lux/bmw-m8-competition.webp'),
      ('/assets/lux/bugatti-chiron.jpg', '/assets/lux/bugatti-chiron.webp'),
      ('/assets/lux/ferrari-f8-tributo.jpg', '/assets/lux/ferrari-f8-tributo.webp'),
      ('/assets/lux/lamborghini-huracan.jpg', '/assets/lux/lamborghini-huracan.webp'),
      ('/assets/lux/lexus-lc-500.jpg', '/assets/lux/lexus-lc-500.webp'),
      ('/assets/lux/mclaren-720s.jpg', '/assets/lux/mclaren-720s.webp'),
      ('/assets/lux/mercedes-amg-gt.jpg', '/assets/lux/mercedes-amg-gt.webp'),
      ('/assets/lux/porsche-911-turbo-s.jpg', '/assets/lux/porsche-911-turbo-s.webp'),
      ('/assets/lux/rolls-royce-cullinan.jpg', '/assets/lux/rolls-royce-cullinan.webp'),
      ('/assets/lux/rolls-royce-ghost.jpg', '/assets/lux/rolls-royce-ghost.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-1.jpg', '/assets/used-japanese-cars-auction-export-toyota-1.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-2.jpg', '/assets/used-japanese-cars-auction-export-toyota-2.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-4.jpg', '/assets/used-japanese-cars-auction-export-toyota-4.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-5.jpg', '/assets/used-japanese-cars-auction-export-toyota-5.webp')
  ) as v(old_path, new_path) loop
    update public.site_listings
       set gallery = replace(gallery::text, r.old_path, r.new_path)::jsonb
     where gallery::text like '%' || r.old_path || '%';
  end loop;
exception when undefined_column then
  raise notice 'public.site_listings.gallery: column not present on this install — skipped';
end $$;

-- ---- public.site_articles.image ----
do $$
declare r record;
begin
  for r in (
    values
      ('/assets/gallery/lexus-lc-500-01.jpg', '/assets/gallery/lexus-lc-500-01.webp'),
      ('/assets/gallery/lexus-lc-500-02.jpg', '/assets/gallery/lexus-lc-500-02.webp'),
      ('/assets/gallery/lexus-lc-500-03.jpg', '/assets/gallery/lexus-lc-500-03.webp'),
      ('/assets/gallery/lexus-lc-500-04.jpg', '/assets/gallery/lexus-lc-500-04.webp'),
      ('/assets/gallery/lexus-lc-500-05.jpg', '/assets/gallery/lexus-lc-500-05.webp'),
      ('/assets/inventory/700052000730260404001.jpg', '/assets/inventory/700052000730260404001.webp'),
      ('/assets/inventory/700054141330260802005.jpg', '/assets/inventory/700054141330260802005.webp'),
      ('/assets/inventory/700056103730260717002.jpg', '/assets/inventory/700056103730260717002.webp'),
      ('/assets/inventory/700071023230260801001.jpg', '/assets/inventory/700071023230260801001.webp'),
      ('/assets/inventory/700100197430260726001.jpg', '/assets/inventory/700100197430260726001.webp'),
      ('/assets/inventory/988026080300208264002.jpg', '/assets/inventory/988026080300208264002.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-1.jpg', '/assets/japan-used-car-export-inventory-toyota-h-1.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-2.jpg', '/assets/japan-used-car-export-inventory-toyota-h-2.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-3.jpg', '/assets/japan-used-car-export-inventory-toyota-h-3.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-4.jpg', '/assets/japan-used-car-export-inventory-toyota-h-4.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-5.jpg', '/assets/japan-used-car-export-inventory-toyota-h-5.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--1.jpg', '/assets/japan-used-car-export-stock-honda-vezel--1.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--2.jpg', '/assets/japan-used-car-export-stock-honda-vezel--2.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--3.jpg', '/assets/japan-used-car-export-stock-honda-vezel--3.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--4.jpg', '/assets/japan-used-car-export-stock-honda-vezel--4.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--5.jpg', '/assets/japan-used-car-export-stock-honda-vezel--5.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-1.jpg', '/assets/japanese-car-auction-inspection-shipping-1.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-2.jpg', '/assets/japanese-car-auction-inspection-shipping-2.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-3.jpg', '/assets/japanese-car-auction-inspection-shipping-3.webp'),
      ('/assets/lux/audi-r8.jpg', '/assets/lux/audi-r8.webp'),
      ('/assets/lux/bentley-continental-gt.jpg', '/assets/lux/bentley-continental-gt.webp'),
      ('/assets/lux/bmw-m8-competition.jpg', '/assets/lux/bmw-m8-competition.webp'),
      ('/assets/lux/bugatti-chiron.jpg', '/assets/lux/bugatti-chiron.webp'),
      ('/assets/lux/ferrari-f8-tributo.jpg', '/assets/lux/ferrari-f8-tributo.webp'),
      ('/assets/lux/lamborghini-huracan.jpg', '/assets/lux/lamborghini-huracan.webp'),
      ('/assets/lux/lexus-lc-500.jpg', '/assets/lux/lexus-lc-500.webp'),
      ('/assets/lux/mclaren-720s.jpg', '/assets/lux/mclaren-720s.webp'),
      ('/assets/lux/mercedes-amg-gt.jpg', '/assets/lux/mercedes-amg-gt.webp'),
      ('/assets/lux/porsche-911-turbo-s.jpg', '/assets/lux/porsche-911-turbo-s.webp'),
      ('/assets/lux/rolls-royce-cullinan.jpg', '/assets/lux/rolls-royce-cullinan.webp'),
      ('/assets/lux/rolls-royce-ghost.jpg', '/assets/lux/rolls-royce-ghost.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-1.jpg', '/assets/used-japanese-cars-auction-export-toyota-1.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-2.jpg', '/assets/used-japanese-cars-auction-export-toyota-2.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-4.jpg', '/assets/used-japanese-cars-auction-export-toyota-4.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-5.jpg', '/assets/used-japanese-cars-auction-export-toyota-5.webp')
  ) as v(old_path, new_path) loop
    update public.site_articles
       set image = replace(image, r.old_path, r.new_path)
     where image like '%' || r.old_path || '%';
  end loop;
exception when undefined_column then
  raise notice 'public.site_articles.image: column not present on this install — skipped';
end $$;

-- ---- public.site_articles.body ----
do $$
declare r record;
begin
  for r in (
    values
      ('/assets/gallery/lexus-lc-500-01.jpg', '/assets/gallery/lexus-lc-500-01.webp'),
      ('/assets/gallery/lexus-lc-500-02.jpg', '/assets/gallery/lexus-lc-500-02.webp'),
      ('/assets/gallery/lexus-lc-500-03.jpg', '/assets/gallery/lexus-lc-500-03.webp'),
      ('/assets/gallery/lexus-lc-500-04.jpg', '/assets/gallery/lexus-lc-500-04.webp'),
      ('/assets/gallery/lexus-lc-500-05.jpg', '/assets/gallery/lexus-lc-500-05.webp'),
      ('/assets/inventory/700052000730260404001.jpg', '/assets/inventory/700052000730260404001.webp'),
      ('/assets/inventory/700054141330260802005.jpg', '/assets/inventory/700054141330260802005.webp'),
      ('/assets/inventory/700056103730260717002.jpg', '/assets/inventory/700056103730260717002.webp'),
      ('/assets/inventory/700071023230260801001.jpg', '/assets/inventory/700071023230260801001.webp'),
      ('/assets/inventory/700100197430260726001.jpg', '/assets/inventory/700100197430260726001.webp'),
      ('/assets/inventory/988026080300208264002.jpg', '/assets/inventory/988026080300208264002.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-1.jpg', '/assets/japan-used-car-export-inventory-toyota-h-1.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-2.jpg', '/assets/japan-used-car-export-inventory-toyota-h-2.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-3.jpg', '/assets/japan-used-car-export-inventory-toyota-h-3.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-4.jpg', '/assets/japan-used-car-export-inventory-toyota-h-4.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-5.jpg', '/assets/japan-used-car-export-inventory-toyota-h-5.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--1.jpg', '/assets/japan-used-car-export-stock-honda-vezel--1.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--2.jpg', '/assets/japan-used-car-export-stock-honda-vezel--2.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--3.jpg', '/assets/japan-used-car-export-stock-honda-vezel--3.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--4.jpg', '/assets/japan-used-car-export-stock-honda-vezel--4.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--5.jpg', '/assets/japan-used-car-export-stock-honda-vezel--5.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-1.jpg', '/assets/japanese-car-auction-inspection-shipping-1.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-2.jpg', '/assets/japanese-car-auction-inspection-shipping-2.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-3.jpg', '/assets/japanese-car-auction-inspection-shipping-3.webp'),
      ('/assets/lux/audi-r8.jpg', '/assets/lux/audi-r8.webp'),
      ('/assets/lux/bentley-continental-gt.jpg', '/assets/lux/bentley-continental-gt.webp'),
      ('/assets/lux/bmw-m8-competition.jpg', '/assets/lux/bmw-m8-competition.webp'),
      ('/assets/lux/bugatti-chiron.jpg', '/assets/lux/bugatti-chiron.webp'),
      ('/assets/lux/ferrari-f8-tributo.jpg', '/assets/lux/ferrari-f8-tributo.webp'),
      ('/assets/lux/lamborghini-huracan.jpg', '/assets/lux/lamborghini-huracan.webp'),
      ('/assets/lux/lexus-lc-500.jpg', '/assets/lux/lexus-lc-500.webp'),
      ('/assets/lux/mclaren-720s.jpg', '/assets/lux/mclaren-720s.webp'),
      ('/assets/lux/mercedes-amg-gt.jpg', '/assets/lux/mercedes-amg-gt.webp'),
      ('/assets/lux/porsche-911-turbo-s.jpg', '/assets/lux/porsche-911-turbo-s.webp'),
      ('/assets/lux/rolls-royce-cullinan.jpg', '/assets/lux/rolls-royce-cullinan.webp'),
      ('/assets/lux/rolls-royce-ghost.jpg', '/assets/lux/rolls-royce-ghost.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-1.jpg', '/assets/used-japanese-cars-auction-export-toyota-1.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-2.jpg', '/assets/used-japanese-cars-auction-export-toyota-2.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-4.jpg', '/assets/used-japanese-cars-auction-export-toyota-4.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-5.jpg', '/assets/used-japanese-cars-auction-export-toyota-5.webp')
  ) as v(old_path, new_path) loop
    update public.site_articles
       set body = replace(body, r.old_path, r.new_path)
     where body like '%' || r.old_path || '%';
  end loop;
exception when undefined_column then
  raise notice 'public.site_articles.body: column not present on this install — skipped';
end $$;

-- ---- public.vehicles.image ----
do $$
declare r record;
begin
  for r in (
    values
      ('/assets/gallery/lexus-lc-500-01.jpg', '/assets/gallery/lexus-lc-500-01.webp'),
      ('/assets/gallery/lexus-lc-500-02.jpg', '/assets/gallery/lexus-lc-500-02.webp'),
      ('/assets/gallery/lexus-lc-500-03.jpg', '/assets/gallery/lexus-lc-500-03.webp'),
      ('/assets/gallery/lexus-lc-500-04.jpg', '/assets/gallery/lexus-lc-500-04.webp'),
      ('/assets/gallery/lexus-lc-500-05.jpg', '/assets/gallery/lexus-lc-500-05.webp'),
      ('/assets/inventory/700052000730260404001.jpg', '/assets/inventory/700052000730260404001.webp'),
      ('/assets/inventory/700054141330260802005.jpg', '/assets/inventory/700054141330260802005.webp'),
      ('/assets/inventory/700056103730260717002.jpg', '/assets/inventory/700056103730260717002.webp'),
      ('/assets/inventory/700071023230260801001.jpg', '/assets/inventory/700071023230260801001.webp'),
      ('/assets/inventory/700100197430260726001.jpg', '/assets/inventory/700100197430260726001.webp'),
      ('/assets/inventory/988026080300208264002.jpg', '/assets/inventory/988026080300208264002.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-1.jpg', '/assets/japan-used-car-export-inventory-toyota-h-1.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-2.jpg', '/assets/japan-used-car-export-inventory-toyota-h-2.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-3.jpg', '/assets/japan-used-car-export-inventory-toyota-h-3.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-4.jpg', '/assets/japan-used-car-export-inventory-toyota-h-4.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-5.jpg', '/assets/japan-used-car-export-inventory-toyota-h-5.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--1.jpg', '/assets/japan-used-car-export-stock-honda-vezel--1.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--2.jpg', '/assets/japan-used-car-export-stock-honda-vezel--2.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--3.jpg', '/assets/japan-used-car-export-stock-honda-vezel--3.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--4.jpg', '/assets/japan-used-car-export-stock-honda-vezel--4.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--5.jpg', '/assets/japan-used-car-export-stock-honda-vezel--5.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-1.jpg', '/assets/japanese-car-auction-inspection-shipping-1.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-2.jpg', '/assets/japanese-car-auction-inspection-shipping-2.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-3.jpg', '/assets/japanese-car-auction-inspection-shipping-3.webp'),
      ('/assets/lux/audi-r8.jpg', '/assets/lux/audi-r8.webp'),
      ('/assets/lux/bentley-continental-gt.jpg', '/assets/lux/bentley-continental-gt.webp'),
      ('/assets/lux/bmw-m8-competition.jpg', '/assets/lux/bmw-m8-competition.webp'),
      ('/assets/lux/bugatti-chiron.jpg', '/assets/lux/bugatti-chiron.webp'),
      ('/assets/lux/ferrari-f8-tributo.jpg', '/assets/lux/ferrari-f8-tributo.webp'),
      ('/assets/lux/lamborghini-huracan.jpg', '/assets/lux/lamborghini-huracan.webp'),
      ('/assets/lux/lexus-lc-500.jpg', '/assets/lux/lexus-lc-500.webp'),
      ('/assets/lux/mclaren-720s.jpg', '/assets/lux/mclaren-720s.webp'),
      ('/assets/lux/mercedes-amg-gt.jpg', '/assets/lux/mercedes-amg-gt.webp'),
      ('/assets/lux/porsche-911-turbo-s.jpg', '/assets/lux/porsche-911-turbo-s.webp'),
      ('/assets/lux/rolls-royce-cullinan.jpg', '/assets/lux/rolls-royce-cullinan.webp'),
      ('/assets/lux/rolls-royce-ghost.jpg', '/assets/lux/rolls-royce-ghost.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-1.jpg', '/assets/used-japanese-cars-auction-export-toyota-1.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-2.jpg', '/assets/used-japanese-cars-auction-export-toyota-2.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-4.jpg', '/assets/used-japanese-cars-auction-export-toyota-4.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-5.jpg', '/assets/used-japanese-cars-auction-export-toyota-5.webp')
  ) as v(old_path, new_path) loop
    update public.vehicles
       set image = replace(image, r.old_path, r.new_path)
     where image like '%' || r.old_path || '%';
  end loop;
exception when undefined_column then
  raise notice 'public.vehicles.image: column not present on this install — skipped';
end $$;

-- ---- public.vehicles.images ----
do $$
declare r record;
begin
  for r in (
    values
      ('/assets/gallery/lexus-lc-500-01.jpg', '/assets/gallery/lexus-lc-500-01.webp'),
      ('/assets/gallery/lexus-lc-500-02.jpg', '/assets/gallery/lexus-lc-500-02.webp'),
      ('/assets/gallery/lexus-lc-500-03.jpg', '/assets/gallery/lexus-lc-500-03.webp'),
      ('/assets/gallery/lexus-lc-500-04.jpg', '/assets/gallery/lexus-lc-500-04.webp'),
      ('/assets/gallery/lexus-lc-500-05.jpg', '/assets/gallery/lexus-lc-500-05.webp'),
      ('/assets/inventory/700052000730260404001.jpg', '/assets/inventory/700052000730260404001.webp'),
      ('/assets/inventory/700054141330260802005.jpg', '/assets/inventory/700054141330260802005.webp'),
      ('/assets/inventory/700056103730260717002.jpg', '/assets/inventory/700056103730260717002.webp'),
      ('/assets/inventory/700071023230260801001.jpg', '/assets/inventory/700071023230260801001.webp'),
      ('/assets/inventory/700100197430260726001.jpg', '/assets/inventory/700100197430260726001.webp'),
      ('/assets/inventory/988026080300208264002.jpg', '/assets/inventory/988026080300208264002.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-1.jpg', '/assets/japan-used-car-export-inventory-toyota-h-1.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-2.jpg', '/assets/japan-used-car-export-inventory-toyota-h-2.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-3.jpg', '/assets/japan-used-car-export-inventory-toyota-h-3.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-4.jpg', '/assets/japan-used-car-export-inventory-toyota-h-4.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-5.jpg', '/assets/japan-used-car-export-inventory-toyota-h-5.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--1.jpg', '/assets/japan-used-car-export-stock-honda-vezel--1.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--2.jpg', '/assets/japan-used-car-export-stock-honda-vezel--2.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--3.jpg', '/assets/japan-used-car-export-stock-honda-vezel--3.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--4.jpg', '/assets/japan-used-car-export-stock-honda-vezel--4.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--5.jpg', '/assets/japan-used-car-export-stock-honda-vezel--5.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-1.jpg', '/assets/japanese-car-auction-inspection-shipping-1.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-2.jpg', '/assets/japanese-car-auction-inspection-shipping-2.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-3.jpg', '/assets/japanese-car-auction-inspection-shipping-3.webp'),
      ('/assets/lux/audi-r8.jpg', '/assets/lux/audi-r8.webp'),
      ('/assets/lux/bentley-continental-gt.jpg', '/assets/lux/bentley-continental-gt.webp'),
      ('/assets/lux/bmw-m8-competition.jpg', '/assets/lux/bmw-m8-competition.webp'),
      ('/assets/lux/bugatti-chiron.jpg', '/assets/lux/bugatti-chiron.webp'),
      ('/assets/lux/ferrari-f8-tributo.jpg', '/assets/lux/ferrari-f8-tributo.webp'),
      ('/assets/lux/lamborghini-huracan.jpg', '/assets/lux/lamborghini-huracan.webp'),
      ('/assets/lux/lexus-lc-500.jpg', '/assets/lux/lexus-lc-500.webp'),
      ('/assets/lux/mclaren-720s.jpg', '/assets/lux/mclaren-720s.webp'),
      ('/assets/lux/mercedes-amg-gt.jpg', '/assets/lux/mercedes-amg-gt.webp'),
      ('/assets/lux/porsche-911-turbo-s.jpg', '/assets/lux/porsche-911-turbo-s.webp'),
      ('/assets/lux/rolls-royce-cullinan.jpg', '/assets/lux/rolls-royce-cullinan.webp'),
      ('/assets/lux/rolls-royce-ghost.jpg', '/assets/lux/rolls-royce-ghost.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-1.jpg', '/assets/used-japanese-cars-auction-export-toyota-1.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-2.jpg', '/assets/used-japanese-cars-auction-export-toyota-2.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-4.jpg', '/assets/used-japanese-cars-auction-export-toyota-4.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-5.jpg', '/assets/used-japanese-cars-auction-export-toyota-5.webp')
  ) as v(old_path, new_path) loop
    update public.vehicles
       set images = replace(images::text, r.old_path, r.new_path)::jsonb
     where images::text like '%' || r.old_path || '%';
  end loop;
exception when undefined_column then
  raise notice 'public.vehicles.images: column not present on this install — skipped';
end $$;

-- ---- public.vehicles.gallery ----
do $$
declare r record;
begin
  for r in (
    values
      ('/assets/gallery/lexus-lc-500-01.jpg', '/assets/gallery/lexus-lc-500-01.webp'),
      ('/assets/gallery/lexus-lc-500-02.jpg', '/assets/gallery/lexus-lc-500-02.webp'),
      ('/assets/gallery/lexus-lc-500-03.jpg', '/assets/gallery/lexus-lc-500-03.webp'),
      ('/assets/gallery/lexus-lc-500-04.jpg', '/assets/gallery/lexus-lc-500-04.webp'),
      ('/assets/gallery/lexus-lc-500-05.jpg', '/assets/gallery/lexus-lc-500-05.webp'),
      ('/assets/inventory/700052000730260404001.jpg', '/assets/inventory/700052000730260404001.webp'),
      ('/assets/inventory/700054141330260802005.jpg', '/assets/inventory/700054141330260802005.webp'),
      ('/assets/inventory/700056103730260717002.jpg', '/assets/inventory/700056103730260717002.webp'),
      ('/assets/inventory/700071023230260801001.jpg', '/assets/inventory/700071023230260801001.webp'),
      ('/assets/inventory/700100197430260726001.jpg', '/assets/inventory/700100197430260726001.webp'),
      ('/assets/inventory/988026080300208264002.jpg', '/assets/inventory/988026080300208264002.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-1.jpg', '/assets/japan-used-car-export-inventory-toyota-h-1.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-2.jpg', '/assets/japan-used-car-export-inventory-toyota-h-2.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-3.jpg', '/assets/japan-used-car-export-inventory-toyota-h-3.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-4.jpg', '/assets/japan-used-car-export-inventory-toyota-h-4.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-5.jpg', '/assets/japan-used-car-export-inventory-toyota-h-5.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--1.jpg', '/assets/japan-used-car-export-stock-honda-vezel--1.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--2.jpg', '/assets/japan-used-car-export-stock-honda-vezel--2.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--3.jpg', '/assets/japan-used-car-export-stock-honda-vezel--3.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--4.jpg', '/assets/japan-used-car-export-stock-honda-vezel--4.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--5.jpg', '/assets/japan-used-car-export-stock-honda-vezel--5.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-1.jpg', '/assets/japanese-car-auction-inspection-shipping-1.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-2.jpg', '/assets/japanese-car-auction-inspection-shipping-2.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-3.jpg', '/assets/japanese-car-auction-inspection-shipping-3.webp'),
      ('/assets/lux/audi-r8.jpg', '/assets/lux/audi-r8.webp'),
      ('/assets/lux/bentley-continental-gt.jpg', '/assets/lux/bentley-continental-gt.webp'),
      ('/assets/lux/bmw-m8-competition.jpg', '/assets/lux/bmw-m8-competition.webp'),
      ('/assets/lux/bugatti-chiron.jpg', '/assets/lux/bugatti-chiron.webp'),
      ('/assets/lux/ferrari-f8-tributo.jpg', '/assets/lux/ferrari-f8-tributo.webp'),
      ('/assets/lux/lamborghini-huracan.jpg', '/assets/lux/lamborghini-huracan.webp'),
      ('/assets/lux/lexus-lc-500.jpg', '/assets/lux/lexus-lc-500.webp'),
      ('/assets/lux/mclaren-720s.jpg', '/assets/lux/mclaren-720s.webp'),
      ('/assets/lux/mercedes-amg-gt.jpg', '/assets/lux/mercedes-amg-gt.webp'),
      ('/assets/lux/porsche-911-turbo-s.jpg', '/assets/lux/porsche-911-turbo-s.webp'),
      ('/assets/lux/rolls-royce-cullinan.jpg', '/assets/lux/rolls-royce-cullinan.webp'),
      ('/assets/lux/rolls-royce-ghost.jpg', '/assets/lux/rolls-royce-ghost.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-1.jpg', '/assets/used-japanese-cars-auction-export-toyota-1.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-2.jpg', '/assets/used-japanese-cars-auction-export-toyota-2.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-4.jpg', '/assets/used-japanese-cars-auction-export-toyota-4.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-5.jpg', '/assets/used-japanese-cars-auction-export-toyota-5.webp')
  ) as v(old_path, new_path) loop
    update public.vehicles
       set gallery = replace(gallery::text, r.old_path, r.new_path)::jsonb
     where gallery::text like '%' || r.old_path || '%';
  end loop;
exception when undefined_column then
  raise notice 'public.vehicles.gallery: column not present on this install — skipped';
end $$;

-- ---- public.site_blocks.value ----
do $$
declare r record;
begin
  for r in (
    values
      ('/assets/gallery/lexus-lc-500-01.jpg', '/assets/gallery/lexus-lc-500-01.webp'),
      ('/assets/gallery/lexus-lc-500-02.jpg', '/assets/gallery/lexus-lc-500-02.webp'),
      ('/assets/gallery/lexus-lc-500-03.jpg', '/assets/gallery/lexus-lc-500-03.webp'),
      ('/assets/gallery/lexus-lc-500-04.jpg', '/assets/gallery/lexus-lc-500-04.webp'),
      ('/assets/gallery/lexus-lc-500-05.jpg', '/assets/gallery/lexus-lc-500-05.webp'),
      ('/assets/inventory/700052000730260404001.jpg', '/assets/inventory/700052000730260404001.webp'),
      ('/assets/inventory/700054141330260802005.jpg', '/assets/inventory/700054141330260802005.webp'),
      ('/assets/inventory/700056103730260717002.jpg', '/assets/inventory/700056103730260717002.webp'),
      ('/assets/inventory/700071023230260801001.jpg', '/assets/inventory/700071023230260801001.webp'),
      ('/assets/inventory/700100197430260726001.jpg', '/assets/inventory/700100197430260726001.webp'),
      ('/assets/inventory/988026080300208264002.jpg', '/assets/inventory/988026080300208264002.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-1.jpg', '/assets/japan-used-car-export-inventory-toyota-h-1.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-2.jpg', '/assets/japan-used-car-export-inventory-toyota-h-2.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-3.jpg', '/assets/japan-used-car-export-inventory-toyota-h-3.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-4.jpg', '/assets/japan-used-car-export-inventory-toyota-h-4.webp'),
      ('/assets/japan-used-car-export-inventory-toyota-h-5.jpg', '/assets/japan-used-car-export-inventory-toyota-h-5.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--1.jpg', '/assets/japan-used-car-export-stock-honda-vezel--1.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--2.jpg', '/assets/japan-used-car-export-stock-honda-vezel--2.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--3.jpg', '/assets/japan-used-car-export-stock-honda-vezel--3.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--4.jpg', '/assets/japan-used-car-export-stock-honda-vezel--4.webp'),
      ('/assets/japan-used-car-export-stock-honda-vezel--5.jpg', '/assets/japan-used-car-export-stock-honda-vezel--5.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-1.jpg', '/assets/japanese-car-auction-inspection-shipping-1.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-2.jpg', '/assets/japanese-car-auction-inspection-shipping-2.webp'),
      ('/assets/japanese-car-auction-inspection-shipping-3.jpg', '/assets/japanese-car-auction-inspection-shipping-3.webp'),
      ('/assets/lux/audi-r8.jpg', '/assets/lux/audi-r8.webp'),
      ('/assets/lux/bentley-continental-gt.jpg', '/assets/lux/bentley-continental-gt.webp'),
      ('/assets/lux/bmw-m8-competition.jpg', '/assets/lux/bmw-m8-competition.webp'),
      ('/assets/lux/bugatti-chiron.jpg', '/assets/lux/bugatti-chiron.webp'),
      ('/assets/lux/ferrari-f8-tributo.jpg', '/assets/lux/ferrari-f8-tributo.webp'),
      ('/assets/lux/lamborghini-huracan.jpg', '/assets/lux/lamborghini-huracan.webp'),
      ('/assets/lux/lexus-lc-500.jpg', '/assets/lux/lexus-lc-500.webp'),
      ('/assets/lux/mclaren-720s.jpg', '/assets/lux/mclaren-720s.webp'),
      ('/assets/lux/mercedes-amg-gt.jpg', '/assets/lux/mercedes-amg-gt.webp'),
      ('/assets/lux/porsche-911-turbo-s.jpg', '/assets/lux/porsche-911-turbo-s.webp'),
      ('/assets/lux/rolls-royce-cullinan.jpg', '/assets/lux/rolls-royce-cullinan.webp'),
      ('/assets/lux/rolls-royce-ghost.jpg', '/assets/lux/rolls-royce-ghost.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-1.jpg', '/assets/used-japanese-cars-auction-export-toyota-1.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-2.jpg', '/assets/used-japanese-cars-auction-export-toyota-2.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-4.jpg', '/assets/used-japanese-cars-auction-export-toyota-4.webp'),
      ('/assets/used-japanese-cars-auction-export-toyota-5.jpg', '/assets/used-japanese-cars-auction-export-toyota-5.webp')
  ) as v(old_path, new_path) loop
    update public.site_blocks
       set value = replace(value, r.old_path, r.new_path)
     where value like '%' || r.old_path || '%';
  end loop;
exception when undefined_column then
  raise notice 'public.site_blocks.value: column not present on this install — skipped';
end $$;

-- ============ 3. VERIFY ============
-- Re-run the dry-run block in section 1. It should return no rows.
