-- Referral codes (2026-11-18). Applied to production via the Supabase
-- connector the same day (migration name: add_referral_codes).
-- • customers.referral_code — each linked portal customer gets one share
--   code (AR7-XXXXX), generated on first account view; unique when present.
-- • leads.referral_code — a new enquiry can carry the code a friend shared,
--   so staff see the attribution on the lead in the CRM.
alter table public.customers add column if not exists referral_code text;
create unique index if not exists customers_referral_code_key on public.customers (referral_code) where referral_code is not null;
alter table public.leads add column if not exists referral_code text;
