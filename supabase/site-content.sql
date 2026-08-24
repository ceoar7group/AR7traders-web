-- AR7 Traders — website content tables (CMS layer)
-- Run AFTER schema.sql. Lets the CRM edit what the public website shows.
--
-- Design note: like the CRM business tables, RLS is ON and NO policies are
-- granted to browser clients. Public reads and all writes go through the
-- Vercel functions using the service role. Anonymous visitors read the site
-- content through /api/site-content, which is a public GET.

-- ---------------------------------------------------------------- listings
-- Vehicles shown on the public website (Home + Inventory + Auction).
-- Kept separate from crm "vehicles": that table is internal stock tracking,
-- this one is the public shop window with marketing fields (image, grade).
create table if not exists public.site_listings (
  id            uuid primary key default gen_random_uuid(),
  stock_no      text unique not null,
  make          text not null,
  model         text not null,
  year          int,
  km            text,
  fuel          text,
  body          text,
  price         text,
  image         text,
  grade         text,
  status        text default 'In Stock',
  location      text,
  tr            text,
  drv           text,
  eng           text,
  seats         int,
  col           text,
  st            text,
  published     boolean default true,
  sort_order    int default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ------------------------------------------------------------------ routes
-- Shipping destinations powering the Shipping page + CIF calculator.
create table if not exists public.site_routes (
  id            uuid primary key default gen_random_uuid(),
  country       text not null,
  port          text,
  transit       text,
  popular       text,
  freight_base  numeric default 0,
  duty_pct      numeric default 0,
  published     boolean default true,
  sort_order    int default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ---------------------------------------------------------------- articles
-- News / guides shown on the site.
create table if not exists public.site_articles (
  id            uuid primary key default gen_random_uuid(),
  title         text not null,
  category      text,
  date          text,
  read_min      int default 3,
  image         text,
  excerpt       text,
  body          text,
  published     boolean default true,
  sort_order    int default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- ----------------------------------------------------------------- blocks
-- Generic editable text for page headings, hero copy, contact details etc.
-- key example: 'home.hero.title', 'contact.whatsapp'
create table if not exists public.site_blocks (
  id            uuid primary key default gen_random_uuid(),
  key           text unique not null,
  label         text,
  value         text,
  page          text,
  updated_at    timestamptz default now()
);

alter table public.site_listings enable row level security;
alter table public.site_routes   enable row level security;
alter table public.site_articles enable row level security;
alter table public.site_blocks   enable row level security;

-- No policies granted on purpose: service-role functions only.
