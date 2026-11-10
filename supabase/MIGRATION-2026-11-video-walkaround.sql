-- Video walkarounds (2026-11-18). One optional YouTube link per website car.
-- Applied to production via the Supabase connector on 2026-11-18 (migration
-- name: add_site_listings_video); kept here so a fresh database gets the same
-- shape from SETUP-EVERYTHING.sql + migrations.
alter table public.site_listings add column if not exists video text;
