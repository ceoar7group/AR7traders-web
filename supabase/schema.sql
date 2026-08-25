-- AR7 Traders CRM schema for Supabase PostgreSQL
create extension if not exists "pgcrypto";

create type public.crm_role as enum ('admin','sales');
create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default 'AR7 Team Member',
 role public.crm_role not null default 'sales',
 active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.profiles(id,full_name,role) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),'sales'); return new; end $$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table public.leads (id uuid primary key default gen_random_uuid(),name text not null,email text,phone text,country text,vehicle_interest text,source text default 'Website',status text not null default 'new',budget numeric(14,2),assigned_to text,next_follow_up date,notes text,created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.customers (id uuid primary key default gen_random_uuid(),name text not null,email text,phone text,country text,status text default 'active',total_spend numeric(14,2) default 0,vehicles_bought int default 0,notes text,created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.vehicles (id uuid primary key default gen_random_uuid(),stock_no text unique not null,make text not null,model text not null,year int,price numeric(14,2),status text default 'available',location text,steering text,colour text,interior text,notes text,created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.quotes (id uuid primary key default gen_random_uuid(),quote_no text unique not null,customer_name text not null,vehicle text not null,amount numeric(14,2) default 0,status text default 'draft',valid_until date,notes text,created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.shipments (id uuid primary key default gen_random_uuid(),tracking_no text unique not null,customer_name text,vehicle text not null,origin text,destination text,vessel text,status text default 'booking',eta date,progress int default 0 check(progress between 0 and 100),notes text,created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.tasks (id uuid primary key default gen_random_uuid(),title text not null,owner text,priority text default 'medium',status text default 'open',due_date date,notes text,created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.activities (id uuid primary key default gen_random_uuid(),action text not null,actor text default 'System',entity_type text,entity_id uuid,created_by uuid references auth.users(id),created_at timestamptz not null default now());

create index leads_status_idx on public.leads(status); create index leads_followup_idx on public.leads(next_follow_up); create index vehicles_status_idx on public.vehicles(status); create index shipments_status_idx on public.shipments(status); create index tasks_due_idx on public.tasks(due_date); create index activities_created_idx on public.activities(created_at desc);

alter table public.profiles enable row level security; alter table public.leads enable row level security; alter table public.customers enable row level security; alter table public.vehicles enable row level security; alter table public.quotes enable row level security; alter table public.shipments enable row level security; alter table public.tasks enable row level security; alter table public.activities enable row level security;
create policy "staff read own profile" on public.profiles for select to authenticated using(id=auth.uid());
create policy "staff update own profile" on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
-- Business tables are accessed through authenticated Vercel functions using the service role.
-- No direct browser policies are created, preventing anon/authenticated users from querying CRM data directly.

-- Vehicle photo galleries: the CRM photo manager stores per-vehicle galleries.
-- (idempotent — safe on both fresh and existing databases)
alter table public.vehicles add column if not exists image   text;
alter table public.vehicles add column if not exists images  jsonb;
alter table public.vehicles add column if not exists gallery jsonb;

-- After creating the first user in Authentication > Users, promote that user:
-- update public.profiles set role='admin', full_name='Your Name' where id='AUTH-USER-UUID';
