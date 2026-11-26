-- Profile writes are handled by the authenticated, field-filtered team API.
-- Direct self-update lets a user change their role/active status via PostgREST.
drop policy if exists "staff update own profile" on public.profiles;
revoke update on table public.profiles from anon, authenticated;
