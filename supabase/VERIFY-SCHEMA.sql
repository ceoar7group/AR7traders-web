-- ---------------------------------------------------------------------------
-- VERIFY-SCHEMA.sql — READ-ONLY production verification for AR7 Traders
-- ---------------------------------------------------------------------------
-- Run this in the Supabase SQL editor for the CONFIRMED production project.
-- It performs SELECTs only: no INSERT/UPDATE/DELETE, no DDL, no pg_notify.
-- It does not create leads, change settings, publish stock, or reload the
-- PostgREST schema cache. Use it before deciding whether a migration is needed.
--
-- After any approved migration, reload PostgREST separately:
--   select pg_notify('pgrst', 'reload schema');
-- then re-run the relevant API diagnostic (machinery doctor / AI Growth overview).
-- ---------------------------------------------------------------------------

-- 0) Confirm you are looking at the intended database and role.
select current_database() as database_name,
       current_user as sql_role,
       now() as checked_at;

-- 1) Required relations. A missing row here means the migration has not created
--    that table in THIS database (or it lives in another schema/project).
with required(table_name) as (
  values
    ('leads'), ('activities'), ('site_settings'),
    ('machinery'),
    ('ai_agents'), ('ai_agent_runs'), ('ai_agent_locks'),
    ('ai_agent_drafts'), ('ai_agent_messages'), ('ai_provider_usage')
)
select r.table_name,
       (t.table_name is not null) as present,
       t.table_schema
  from required r
  left join information_schema.tables t
    on t.table_schema = 'public' and t.table_name = r.table_name
 order by r.table_name;

-- 2) Lead-path columns used by api/leads.js and the CRM. The public form maps
--    message -> notes and requires phone; email remains optional but validated.
select column_name, data_type, is_nullable, column_default
  from information_schema.columns
 where table_schema = 'public' and table_name = 'leads'
   and column_name in ('id','name','email','phone','country','vehicle_interest',
                       'source','status','budget','notes','created_at','created_by')
 order by column_name;

-- 3) RLS state and policy counts. The serverless functions use the service role;
--    browser clients should not gain direct access through new public policies.
select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       count(p.policyname) as policy_count
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  left join pg_policies p on p.schemaname = n.nspname and p.tablename = c.relname
 where n.nspname = 'public'
   and c.relname in ('leads','activities','machinery',
                     'ai_agents','ai_agent_runs','ai_agent_locks',
                     'ai_agent_drafts','ai_agent_messages','ai_provider_usage')
 group by c.relname, c.relrowsecurity
 order by c.relname;

-- 4) Importer / AI settings. Read-only. Note especially machinery_autopublish:
--    the machinery migration seeds it true when absent; do NOT enable publishing
--    as part of a repair without explicit owner approval.
select key, value, updated_at
  from public.site_settings
 where key like 'machinery_%' or key like 'ai_growth_%'
 order by key;

-- 5) AI agent safety defaults. A fresh AI migration should leave every agent
--    disabled, dry-run, approval-required and autopublish=false.
select agent, enabled, paused, dry_run, require_approval, autopublish,
       max_items_per_run, max_runs_per_day
  from public.ai_agents
 order by agent;

-- 6) Privacy-safe lead destination check. Run AFTER a real buyer submission (or
--    an approved non-production test). It returns no names, phones, emails or
--    message bodies — only whether the required fields arrived and where the
--    lead was routed in the CRM.
select id,
       source,
       status,
       created_at,
       (phone is not null and btrim(phone) <> '') as has_phone,
       (email is not null and btrim(email) <> '') as has_email,
       (notes is not null and btrim(notes) <> '') as has_message,
       vehicle_interest
  from public.leads
 order by created_at desc
 limit 20;

-- 7) Lead counts by public source, to confirm contact vs auction vs vehicle vs
--    machinery enquiries are distinguishable in the CRM.
select coalesce(source, '(null)') as source,
       count(*) as leads,
       count(*) filter (where phone is not null and btrim(phone) <> '') as with_phone,
       max(created_at) as latest_at
  from public.leads
 group by source
 order by latest_at desc nulls last;

-- 8) Machinery storage shape (no inventory rows are selected or changed).
select column_name, data_type
  from information_schema.columns
 where table_schema = 'public' and table_name = 'machinery'
 order by ordinal_position;

-- 9) PostgREST schema-cache note.
-- SQL cannot prove the Vercel/PostgREST cache is fresh. If a table exists above
-- but the API still reports PGRST205 / "schema cache", run the separate reload:
--   select pg_notify('pgrst', 'reload schema');
-- then retry the staff-only diagnostic:
--   GET /api/site-content?machinery=doctor
--   GET /api/goonet-sync?job=agents   (sync key required; read-only overview)
-- Do not paste service-role keys, sync keys or customer data into chat or logs.
