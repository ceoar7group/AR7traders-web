-- =====================================================================
--  AR7 TRADERS — COMPLETE DATABASE SETUP
--
--  Paste this whole file into the Supabase SQL Editor and press RUN.
--  It creates every table and loads your current website content
--  (42 cars, 6 shipping routes, 4 articles).
--
--  Safe to run more than once — it skips anything already there.
-- =====================================================================

-- AR7 Traders CRM schema for Supabase PostgreSQL
create extension if not exists "pgcrypto";

do $$ begin create type public.crm_role as enum ('admin','sales'); exception when duplicate_object then null; end $$;
create table if not exists public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 full_name text not null default 'AR7 Team Member',
 role public.crm_role not null default 'sales',
 active boolean not null default true,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.profiles(id,full_name,role) values(new.id,coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),'sales'); return new; end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create table if not exists public.leads (id uuid primary key default gen_random_uuid(),name text not null,email text,phone text,country text,vehicle_interest text,source text default 'Website',status text not null default 'new',budget numeric(14,2),assigned_to text,next_follow_up date,notes text,created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.customers (id uuid primary key default gen_random_uuid(),name text not null,email text,phone text,country text,status text default 'active',total_spend numeric(14,2) default 0,vehicles_bought int default 0,notes text,created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.vehicles (id uuid primary key default gen_random_uuid(),stock_no text unique not null,make text not null,model text not null,year int,price numeric(14,2),status text default 'available',location text,steering text,colour text,interior text,notes text,created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.quotes (id uuid primary key default gen_random_uuid(),quote_no text unique not null,customer_name text not null,vehicle text not null,amount numeric(14,2) default 0,status text default 'draft',valid_until date,notes text,created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.shipments (id uuid primary key default gen_random_uuid(),tracking_no text unique not null,customer_name text,vehicle text not null,origin text,destination text,vessel text,status text default 'booking',eta date,progress int default 0 check(progress between 0 and 100),notes text,created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.tasks (id uuid primary key default gen_random_uuid(),title text not null,owner text,priority text default 'medium',status text default 'open',due_date date,notes text,created_by uuid references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table if not exists public.activities (id uuid primary key default gen_random_uuid(),action text not null,actor text default 'System',entity_type text,entity_id uuid,created_by uuid references auth.users(id),created_at timestamptz not null default now());

create index if not exists leads_status_idx on public.leads(status); create index if not exists leads_followup_idx on public.leads(next_follow_up); create index if not exists vehicles_status_idx on public.vehicles(status); create index if not exists shipments_status_idx on public.shipments(status); create index if not exists tasks_due_idx on public.tasks(due_date); create index if not exists activities_created_idx on public.activities(created_at desc);

alter table public.profiles enable row level security; alter table public.leads enable row level security; alter table public.customers enable row level security; alter table public.vehicles enable row level security; alter table public.quotes enable row level security; alter table public.shipments enable row level security; alter table public.tasks enable row level security; alter table public.activities enable row level security;
drop policy if exists "staff read own profile" on public.profiles;
create policy "staff read own profile" on public.profiles for select to authenticated using(id=auth.uid());
drop policy if exists "staff update own profile" on public.profiles;
create policy "staff update own profile" on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
-- Business tables are accessed through authenticated Vercel functions using the service role.
-- No direct browser policies are created, preventing anon/authenticated users from querying CRM data directly.



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
  -- Map position for the world-network globe on the website. When both are
  -- set the country is plotted and gets a shipping arc from Japan; leave
  -- them null and the route still lists on the destinations page but is not
  -- drawn on the globe.
  lon           numeric,
  lat           numeric,
  show_on_map   boolean default true,
  published     boolean default true,
  sort_order    int default 0,
  created_at    timestamptz default now(),
  updated_at    timestamptz default now()
);

-- Older installs created site_routes before the globe was CRM-driven.
alter table public.site_routes add column if not exists lon         numeric;
alter table public.site_routes add column if not exists lat         numeric;
alter table public.site_routes add column if not exists show_on_map boolean default true;

-- Re-running this file must never duplicate seed rows. Older installs were
-- seeded without a unique key, so remove any duplicates that already exist
-- (keeping the oldest row of each country) before adding the constraint.
delete from public.site_routes a
 using public.site_routes b
 where a.country = b.country
   and a.ctid    > b.ctid;
create unique index if not exists site_routes_country_key on public.site_routes (country);

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

-- Same duplicate protection as site_routes: article titles are the natural key.
delete from public.site_articles a
 using public.site_articles b
 where a.title = b.title
   and a.ctid  > b.ctid;
create unique index if not exists site_articles_title_key on public.site_articles (title);

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


-- ============ website content: current live site data ============
insert into public.site_listings (stock_no,make,model,year,km,fuel,body,price,image,grade,status,location,tr,drv,eng,seats,col,st,published,sort_order) values
  ('AR7-26001','Rolls-Royce','Ghost',2023,'4,200','Petrol','Luxury','$189,000','/assets/lux/rolls-royce-ghost.jpg','5.0','In Stock','Yokohama','AT','AWD','6,750cc',5,'Two-tone','RHD',true,1),
  ('AR7-26002','Rolls-Royce','Cullinan',2022,'9,800','Petrol','Luxury','$205,000','/assets/lux/rolls-royce-cullinan.jpg','5.0','In Stock','Tokyo','AT','AWD','6,750cc',5,'Purple','RHD',true,2),
  ('AR7-26003','Bentley','Continental GT',2022,'7,600','Petrol','Luxury','$168,000','/assets/lux/bentley-continental-gt.jpg','5.0','Auction','USS Tokyo','DCT','AWD','6,000cc',4,'White','RHD',true,3),
  ('AR7-26004','Mercedes-Benz','AMG GT 63',2021,'12,300','Petrol','Luxury','$142,000','/assets/lux/mercedes-amg-gt.jpg','4.5','In Stock','Osaka','DCT','AWD','4,000cc',4,'Silver','LHD',true,4),
  ('AR7-26005','BMW','M8 Competition',2021,'15,200','Petrol','Luxury','$118,000','/assets/lux/bmw-m8-competition.jpg','4.5','New Arrival','Nagoya','DCT','AWD','4,400cc',4,'Black','RHD',true,5),
  ('AR7-26006','Lamborghini','Huracan EVO',2020,'8,400','Petrol','Supercar','$245,000','/assets/lux/lamborghini-huracan.jpg','5.0','Auction','CAA Chubu','DCT','AWD','5,200cc',2,'Orange','RHD',true,6),
  ('AR7-26007','Ferrari','F8 Tributo',2020,'6,900','Petrol','Supercar','$265,000','/assets/lux/ferrari-f8-tributo.jpg','5.0','In Stock','Yokohama','DCT','RWD','3,900cc',2,'Red','RHD',true,7),
  ('AR7-26008','Bugatti','Chiron',2019,'2,100','Petrol','Hypercar','$2,850,000','/assets/lux/bugatti-chiron.jpg','5.0','Auction','USS Tokyo','DCT','AWD','8,000cc',2,'Blue','RHD',true,8),
  ('AR7-26009','Porsche','911 Turbo S',2022,'5,300','Petrol','Supercar','$205,000','/assets/lux/porsche-911-turbo-s.jpg','5.0','In Stock','Kobe','DCT','AWD','3,800cc',4,'Silver','RHD',true,9),
  ('AR7-26010','McLaren','720S',2021,'7,100','Petrol','Supercar','$235,000','/assets/lux/mclaren-720s.jpg','4.5','Auction','JU Aichi','DCT','RWD','4,000cc',2,'Orange','RHD',true,10),
  ('AR7-26011','Audi','R8 V10',2021,'9,300','Petrol','Supercar','$155,000','/assets/gallery/audi-r8-v10-01.webp','4.5','New Arrival','Tokyo','DCT','AWD','5,200cc',2,'Ascari Blue Metallic','RHD',true,11),
  ('AR7-26012','Lexus','LC 500',2021,'11,200','Petrol','Luxury','$95,000','/assets/gallery/lexus-lc-500-01.jpg','4.5','In Stock','Yokohama','AT','RWD','5,000cc',4,'Champagne Metallic','LHD',true,12),
  ('AR7-26013','Toyota','Land Cruiser ZX',2022,'18,400','Petrol','SUV','$58,900','/assets/used-japanese-cars-auction-export-toyota-3.jpg','4.5','In Stock','Yokohama','AT','4WD','3,500cc',7,'White','RHD',true,13),
  ('AR7-26014','Toyota','Alphard S C Package',2021,'32,100','Hybrid','MPV','$36,800','/assets/used-japanese-cars-auction-export-toyota-2.jpg','4.5','Auction','USS Tokyo','AT','2WD','2,500cc',7,'Black','RHD',true,14),
  ('AR7-26015','Toyota','Vellfire ZG Edition',2020,'41,700','Petrol','MPV','$29,600','/assets/used-japanese-cars-auction-export-toyota-4.jpg','4.0','In Stock','Nagoya','AT','2WD','2,500cc',7,'Pearl White','RHD',true,15),
  ('AR7-26016','Toyota','Noah S-Z',2026,'110','Hybrid','MPV','$32,400','/assets/used-japanese-cars-auction-export-toyota-1.jpg','S','New Arrival','Kobe','CVT','2WD','1,800cc',7,'White','RHD',true,16),
  ('AR7-26017','Nissan','Note e-Power X',2023,'12,800','Hybrid','Hatchback','$14,900','/assets/used-japanese-cars-auction-export-toyota-5.jpg','5.0','Auction','CAA Chubu','AT','2WD','1,200cc',5,'Silver','RHD',true,17),
  ('AR7-26018','Toyota','Land Cruiser Prado TX',2020,'48,600','Diesel','SUV','$38,200','/assets/japan-used-car-export-inventory-toyota-h-1.jpg','4.0','In Stock','Osaka','AT','4WD','2,800cc',7,'White','RHD',true,18),
  ('AR7-26019','Toyota','Prado L Package',2017,'67,900','Diesel','SUV','$31,500','/assets/japan-used-car-export-inventory-toyota-h-2.jpg','4.0','Auction','JU Aichi','AT','4WD','2,800cc',7,'Gray','RHD',true,19),
  ('AR7-26020','Toyota','Harrier Z Leather',2020,'29,300','Hybrid','SUV','$27,800','/assets/japan-used-car-export-inventory-toyota-h-3.jpg','4.5','New Arrival','Tokyo','CVT','2WD','2,500cc',5,'Gray','RHD',true,20),
  ('AR7-26021','Toyota','Harrier Premium',2019,'36,200','Petrol','SUV','$24,600','/assets/japan-used-car-export-inventory-toyota-h-4.jpg','4.5','In Stock','Kobe','CVT','2WD','2,000cc',5,'Pearl White','RHD',true,21),
  ('AR7-26022','Lexus','RX 450h F Sport',2021,'22,700','Hybrid','SUV','$43,900','/assets/japan-used-car-export-inventory-toyota-h-5.jpg','5.0','Auction','USS Tokyo','AT','4WD','3,500cc',5,'Black','RHD',true,22),
  ('AR7-26023','Nissan','Serena Highway Star',2022,'24,800','Hybrid','MPV','$22,800','/assets/japan-used-car-export-stock-honda-vezel--1.jpg','4.5','New Arrival','Nagoya','CVT','2WD','2,000cc',8,'White','RHD',true,23),
  ('AR7-26024','Toyota','Vitz F Safety Edition',2019,'39,100','Petrol','Hatchback','$9,850','/assets/japan-used-car-export-stock-honda-vezel--2.jpg','4.0','In Stock','Yokohama','CVT','2WD','1,300cc',5,'Red','RHD',true,24),
  ('AR7-26025','Toyota','Vitz Jewela',2018,'44,300','Petrol','Hatchback','$8,900','/assets/japan-used-car-export-stock-honda-vezel--3.jpg','4.0','Auction','CAA Chubu','CVT','2WD','1,300cc',5,'Blue','RHD',true,25),
  ('AR7-26026','Honda','Vezel e:HEV Z',2023,'11,600','Hybrid','SUV','$25,700','/assets/japan-used-car-export-stock-honda-vezel--4.jpg','5.0','In Stock','Kobe','CVT','2WD','1,500cc',5,'White','RHD',true,26),
  ('AR7-26027','Honda','Vezel RS Sensing',2021,'26,900','Hybrid','SUV','$21,400','/assets/japan-used-car-export-stock-honda-vezel--5.jpg','4.5','Auction','USS Tokyo','CVT','2WD','1,500cc',5,'Blue','RHD',true,27),
  ('AR7-26028','Toyota','Aqua S',2021,'15,800','Hybrid','Hatchback','$12,400','/assets/used-japanese-cars-auction-export-toyota-5.jpg','5.0','In Stock','Yokohama','CVT','2WD','1,500cc',5,'Green','RHD',true,28),
  ('AR7-26029','Nissan','X-Trail 20X',2020,'33,500','Hybrid','SUV','$18,900','/assets/japan-used-car-export-stock-honda-vezel--1.jpg','4.5','In Stock','Nagoya','CVT','4WD','2,000cc',5,'Silver','RHD',true,29),
  ('AR7-26030','Honda','Fit e:HEV NESS',2022,'9,800','Hybrid','Hatchback','$13,700','/assets/japan-used-car-export-stock-honda-vezel--2.jpg','5.0','New Arrival','Tokyo','CVT','2WD','1,500cc',5,'Yellow','RHD',true,30),
  ('AR7-26031','Suzuki','Swift Sport',2019,'28,700','Petrol','Hatchback','$11,900','/assets/japan-used-car-export-stock-honda-vezel--3.jpg','4.0','Auction','JU Aichi','MT','2WD','1,400cc',5,'Red','RHD',true,31),
  ('AR7-26032','Mazda','CX-5 XD L Package',2021,'21,400','Diesel','SUV','$22,900','/assets/japan-used-car-export-stock-honda-vezel--4.jpg','4.5','In Stock','Kobe','AT','4WD','2,200cc',5,'Gray','RHD',true,32),
  ('AR7-26033','Mitsubishi','Outlander PHEV',2021,'19,200','Hybrid','SUV','$26,900','/assets/japan-used-car-export-stock-honda-vezel--5.jpg','4.5','Auction','USS Tokyo','AT','4WD','2,400cc',5,'White','RHD',true,33),
  ('AR7-26034','Subaru','Forester X-EDITION',2020,'31,900','Petrol','SUV','$17,900','/assets/japan-used-car-export-inventory-toyota-h-1.jpg','4.5','In Stock','Osaka','CVT','4WD','2,000cc',5,'Blue','RHD',true,34),
  ('AR7-26035','Daihatsu','Move Canbus X',2021,'12,400','Petrol','Kei','$7,200','/assets/japan-used-car-export-stock-honda-vezel--2.jpg','5.0','New Arrival','Kobe','CVT','2WD','660cc',4,'Pink','RHD',true,35),
  ('AR7-26036','Toyota','Hiace Van 2.7 DX',2019,'52,300','Petrol','Van','$18,900','/assets/japan-used-car-export-inventory-toyota-h-3.jpg','4.0','In Stock','Yokohama','AT','2WD','2,700cc',3,'White','RHD',true,36),
  ('AR7-26037','Honda','Stepwgn Air EX',2021,'24,700','Hybrid','MPV','$25,900','/assets/used-japanese-cars-auction-export-toyota-1.jpg','4.5','Auction','CAA Chubu','CVT','2WD','2,000cc',8,'White','RHD',true,37),
  ('AR7-26038','Mercedes-Benz','C200 Avantgarde',2019,'36,100','Petrol','Sedan','$26,200','/assets/japan-used-car-export-inventory-toyota-h-4.jpg','4.5','In Stock','Tokyo','AT','2WD','1,500cc',5,'Black','LHD',true,38),
  ('AR7-26039','BMW','320i M Sport',2018,'41,800','Petrol','Sedan','$19,800','/assets/japan-used-car-export-inventory-toyota-h-5.jpg','4.0','Auction','USS Tokyo','AT','2WD','2,000cc',5,'Blue','LHD',true,39),
  ('AR7-26040','Audi','A4 2.0 TFSI S line',2019,'33,200','Petrol','Sedan','$21,800','/assets/japan-used-car-export-inventory-toyota-h-2.jpg','4.5','In Stock','Osaka','AT','4WD','2,000cc',5,'White','LHD',true,40),
  ('AR7-26041','Toyota','Voxy Hybrid ZS',2021,'21,900','Hybrid','MPV','$24,400','/assets/used-japanese-cars-auction-export-toyota-4.jpg','4.5','New Arrival','Nagoya','CVT','2WD','1,800cc',7,'White','RHD',true,41),
  ('AR7-26042','Nissan','Juke 15RX',2020,'26,800','Petrol','SUV','$12,900','/assets/japan-used-car-export-stock-honda-vezel--5.jpg','4.5','In Stock','Yokohama','CVT','2WD','1,500cc',5,'Silver','RHD',true,42)
on conflict (stock_no) do nothing;

insert into public.site_routes (country,port,transit,popular,freight_base,duty_pct,lon,lat,show_on_map,published,sort_order) values
  ('Pakistan','Karachi / Port Qasim','18–24 days','Land Cruiser · Vezel · Mira',950,48,67,24.9,true,true,1),
  ('UAE','Jebel Ali','18–22 days','Lexus · Patrol · Alphard',900,5,55.2,25.0,true,true,2),
  ('Kenya','Mombasa','24–30 days','Harrier · Prado · Note',1250,25,39.7,-4.0,true,true,3),
  ('United Kingdom','Southampton','35–42 days','Vellfire · Skyline · Jimny',1500,10,-1.4,50.9,true,true,4),
  ('New Zealand','Auckland','20–26 days','Prius · CX-5 · Forester',1150,10,174.8,-36.8,true,true,5),
  ('Tanzania','Dar es Salaam','25–32 days','RAV4 · Hiace · Vitz',1300,25,39.3,-6.8,true,true,6),
  ('Australia','Sydney','21–28 days','Land Cruiser · Hiace',1200,10,151.2,-33.9,true,true,7),
  ('USA','Los Angeles','28–36 days','Kei trucks · 4Runner',1400,25,-118.2,34.0,true,true,8)
on conflict (country) do nothing;

insert into public.site_articles (title,category,date,read_min,image,excerpt,body,published,sort_order) values
  ('Why Land Cruiser demand keeps climbing in Pakistan','MARKET WATCH','Aug 18, 2026',4,'/assets/japanese-car-auction-inspection-shipping-3.jpg','Auction prices, popular grades and what a realistic budget looks like this quarter.','KARACHI — Demand for the Land Cruiser family continues to outpace supply at Japanese auction houses. Grade 4.5 and above units are being bid out within the first two minutes of USS Tokyo sessions, and clean 2020–2022 examples are holding value exceptionally well.

For buyers, our advice: set your maximum bid before the session, avoid pre-bid locking on high-demand lots, and ask our team to pull the auction sheet translation before you commit.

AR7 clients in Pakistan imported over 60 Land Cruisers and Prados in the last 12 months, with 92% arriving within the quoted vessel window.',true,1),
  ('Auction sheet decoded: what R, A and 4.5 really mean','BUYING GUIDE','Aug 11, 2026',5,'/assets/japanese-car-auction-inspection-shipping-1.jpg','Every mark on a Japanese auction sheet explained simply — so you bid with confidence.','A Japanese auction sheet is a condition report written in a shorthand of its own. Grades run from S (near-new) down through 4.5, 4.0, 3.5. Subjective marks like A (minor wear), B (scratches) and the dreaded R (repair history) appear next to each panel.

AR7 translates every sheet into plain English and flags anything our inspection team wants verified by photo before you bid.

Rule of thumb: for export, aim for grade 4.0+, no R marks on structure, and always ask for underbody photos on diesel 4WD models.',true,2),
  ('RoRo vs container: which shipping method fits your car?','LOGISTICS','Aug 04, 2026',3,'/assets/japanese-car-auction-inspection-shipping-5.webp','Costs, protection and loading windows for both methods — with demo numbers.','RoRo (roll-on, roll-off) is the cheapest way to move a drivable car between continents, but your vehicle shares the deck with hundreds of others. Container shipping adds roughly $1,800–$2,500 on Japan–Karachi routes but gives you a sealed, private hold.

We recommend RoRo for standard stock under $45,000 and containers for premium, low-mileage or modified vehicles.

Every AR7 shipment includes marine insurance at 1.6% of vehicle value, whether RoRo or container.',true,3),
  ('How online bidding works with AR7','AUCTION','Jul 28, 2026',4,'/assets/japanese-car-auction-inspection-shipping-2.jpg','Deposits, bid limits, translations and the exact flow from your screen to the auction floor.','1) Fund a returnable bidding deposit (demo: $500). 2) Browse lots with our team, pick your target and set a hard maximum. 3) We bid live at the auction house on your behalf — you watch status in the portal. 4) Win or lose, you see the result within minutes.

After a win, we issue an invoice, arrange payment, inspect and photograph the vehicle, then book your vessel.

Bid prices are in Japanese yen excluding freight; our auto-calculator shows your CIF cost to your port before you confirm.',true,4)
on conflict (title) do nothing;

-- =====================================================================
--  MAKE YOURSELF ADMIN, AUTOMATICALLY
--
--  New accounts are 'sales' by default. This makes the FIRST account
--  you create an admin, and keeps doing so for the email below, even
--  if you sign up after running this file.
-- =====================================================================
-- Triggers on the same table fire in alphabetical order by trigger name.
-- The profile row is created by 'on_auth_user_created', so this trigger MUST
-- sort after it — 'z_' prefix guarantees that. (Named 'ar7_' it ran first and
-- silently did nothing, because there was no profile row to update yet.)
create or replace function public.ar7_promote_owner() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if lower(new.email) = lower('ceoar7grouplimited@gmail.com') then
    update public.profiles set role='admin', active=true where id = new.id;
  end if;
  return new;
end $$;

drop trigger if exists ar7_promote_owner_trg on auth.users;
drop trigger if exists z_ar7_promote_owner_trg on auth.users;
create trigger z_ar7_promote_owner_trg
  after insert on auth.users
  for each row execute function public.ar7_promote_owner();

-- If the account already exists, promote it right now:
update public.profiles p
set role='admin', active=true
from auth.users u
where p.id = u.id and lower(u.email) = lower('ceoar7grouplimited@gmail.com');


-- =====================================================================
--  PART 2 — TEAM PERMISSIONS, APPROVALS, CUSTOMER ORDERS & LEDGER
-- =====================================================================

-- ---- Roles -----------------------------------------------------------
-- The role column was an enum, which cannot have values added safely
-- inside a script. Converted to text + check constraint so new roles can
-- be added later without a migration.
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_schema='public' and table_name='profiles'
               and column_name='role' and udt_name='crm_role') then
    alter table public.profiles alter column role drop default;
    alter table public.profiles alter column role type text using role::text;
    alter table public.profiles alter column role set default 'sales';
  end if;
end $$;

alter table public.profiles drop constraint if exists profiles_role_check;
alter table public.profiles add constraint profiles_role_check
  check (role in ('admin','manager','sales','accounts','viewer'));

alter table public.profiles add column if not exists email text;
alter table public.profiles add column if not exists phone text;
alter table public.profiles add column if not exists title text;

-- Keep profiles.email in step with the auth record (handy for the team list).
update public.profiles p set email = u.email
from auth.users u where u.id = p.id and p.email is distinct from u.email;

-- ---- Permission matrix ----------------------------------------------
-- Editable from the CRM, so permissions can change without a code deploy.
create table if not exists public.role_permissions (
  role text not null,
  permission text not null,
  allowed boolean not null default false,
  primary key (role, permission)
);

insert into public.role_permissions (role,permission,allowed) values
  ('admin','leads.write',true),('admin','customers.write',true),('admin','vehicles.write',true),
  ('admin','orders.write',true),('admin','payments.write',true),('admin','site.write',true),
  ('admin','team.manage',true),('admin','approvals.decide',true),('admin','delete.direct',true),
  ('admin','customer.login_as',true),('admin','settings.write',true),
  ('manager','leads.write',true),('manager','customers.write',true),('manager','vehicles.write',true),
  ('manager','orders.write',true),('manager','payments.write',false),('manager','site.write',true),
  ('manager','team.manage',false),('manager','approvals.decide',true),('manager','delete.direct',false),
  ('manager','customer.login_as',true),('manager','settings.write',false),
  ('sales','leads.write',true),('sales','customers.write',true),('sales','vehicles.write',false),
  ('sales','orders.write',true),('sales','payments.write',false),('sales','site.write',false),
  ('sales','team.manage',false),('sales','approvals.decide',false),('sales','delete.direct',false),
  ('sales','customer.login_as',false),('sales','settings.write',false),
  ('accounts','leads.write',false),('accounts','customers.write',true),('accounts','vehicles.write',false),
  ('accounts','orders.write',true),('accounts','payments.write',true),('accounts','site.write',false),
  ('accounts','team.manage',false),('accounts','approvals.decide',false),('accounts','delete.direct',false),
  ('accounts','customer.login_as',false),('accounts','settings.write',false),
  ('viewer','leads.write',false),('viewer','customers.write',false),('viewer','vehicles.write',false),
  ('viewer','orders.write',false),('viewer','payments.write',false),('viewer','site.write',false),
  ('viewer','team.manage',false),('viewer','approvals.decide',false),('viewer','delete.direct',false),
  ('viewer','customer.login_as',false),('viewer','settings.write',false),
  -- HR / payroll
  ('admin','hr.view',true),('admin','hr.manage',true),('admin','payroll.view',true),('admin','payroll.manage',true),
  ('manager','hr.view',true),('manager','hr.manage',false),('manager','payroll.view',false),('manager','payroll.manage',false),
  ('sales','hr.view',false),('sales','hr.manage',false),('sales','payroll.view',false),('sales','payroll.manage',false),
  ('accounts','hr.view',true),('accounts','hr.manage',false),('accounts','payroll.view',true),('accounts','payroll.manage',true),
  ('viewer','hr.view',false),('viewer','hr.manage',false),('viewer','payroll.view',false),('viewer','payroll.manage',false)
on conflict (role,permission) do nothing;

-- ---- Approvals -------------------------------------------------------
create table if not exists public.approval_requests (
  id uuid primary key default gen_random_uuid(),
  kind text not null,                       -- delete | price_change | refund | other
  entity_type text not null,
  entity_id uuid,
  entity_label text,
  payload jsonb not null default '{}'::jsonb,
  reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected','applied')),
  requested_by uuid references auth.users(id),
  requested_by_name text,
  decided_by uuid references auth.users(id),
  decided_by_name text,
  decision_note text,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists approvals_status_idx on public.approval_requests(status, created_at desc);

-- ---- Customer portal accounts ---------------------------------------
alter table public.customers add column if not exists auth_user_id uuid references auth.users(id);
alter table public.customers add column if not exists portal_enabled boolean not null default false;
alter table public.customers add column if not exists credit_balance numeric(14,2) not null default 0;
create unique index if not exists customers_auth_user_idx on public.customers(auth_user_id) where auth_user_id is not null;

-- A customer signing up must NOT become a staff member. The original
-- trigger gave every new auth user a staff profile; now it skips anyone
-- flagged as a customer account.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if coalesce(new.raw_user_meta_data->>'account_type','staff') = 'customer' then
    return new;
  end if;
  insert into public.profiles(id,full_name,role,email)
  values(new.id,
         coalesce(new.raw_user_meta_data->>'full_name',split_part(new.email,'@',1)),
         'sales', new.email)
  on conflict (id) do nothing;
  return new;
end $$;

-- ---- Orders ----------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_no text unique not null,
  customer_id uuid references public.customers(id) on delete cascade,
  source text not null default 'manual' check (source in ('manual','website')),
  listing_id uuid references public.site_listings(id),
  make text, model text, year int, stock_no text,
  vehicle text not null,
  amount numeric(14,2) not null default 0,
  currency text not null default 'USD',
  status text not null default 'pending'
    check (status in ('pending','confirmed','paid','shipped','delivered','cancelled')),
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists orders_customer_idx on public.orders(customer_id, created_at desc);

create or replace function public.ar7_next_order_no() returns text
language plpgsql as $$
declare n int;
begin
  select coalesce(max(substring(order_no from 'AR7-O-([0-9]+)')::int),1000)+1
    into n from public.orders where order_no ~ '^AR7-O-[0-9]+$';
  return 'AR7-O-'||n;
end $$;

-- ---- Payments and the ledger ----------------------------------------
-- A payment is money received (a TT, cash, card). It is NOT tied to an
-- order at the moment it arrives - it sits as unapplied credit until
-- somebody chooses which order(s) to put it against.
create table if not exists public.payments (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.customers(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  currency text not null default 'USD',
  method text not null default 'TT' check (method in ('TT','Cash','Card','Cheque','Other')),
  tt_number text,
  bank text,
  received_at date not null default current_date,
  note text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists payments_customer_idx on public.payments(customer_id, received_at desc);

-- ---- Multi-currency ledger -------------------------------------------
-- All ledger math stays in the base currency (USD). When staff record an
-- order or payment in JPY, PKR, AED… we also keep the original figure and
-- the exchange rate used, so statements can show both. Idempotent:
-- safe to run on databases that predate these columns.
alter table public.orders  add column if not exists amount_original numeric(14,2);
alter table public.orders  add column if not exists fx_rate numeric(14,6);
alter table public.payments add column if not exists amount_original numeric(14,2);
alter table public.payments add column if not exists fx_rate numeric(14,6);

create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete cascade,
  order_id uuid not null references public.orders(id) on delete cascade,
  amount numeric(14,2) not null check (amount > 0),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);
create index if not exists alloc_payment_idx on public.payment_allocations(payment_id);
create index if not exists alloc_order_idx on public.payment_allocations(order_id);

-- Guard rail: you can never allocate more than the payment is worth.
create or replace function public.ar7_check_allocation() returns trigger
language plpgsql as $$
declare paid numeric; used numeric;
begin
  select amount into paid from public.payments where id = new.payment_id;
  select coalesce(sum(amount),0) into used from public.payment_allocations
    where payment_id = new.payment_id and id <> coalesce(new.id,'00000000-0000-0000-0000-000000000000'::uuid);
  if used + new.amount > paid + 0.005 then
    raise exception 'Allocation exceeds payment: payment is %, already applied %, tried to add %',
      paid, used, new.amount;
  end if;
  return new;
end $$;
drop trigger if exists ar7_check_allocation_trg on public.payment_allocations;
create trigger ar7_check_allocation_trg before insert or update on public.payment_allocations
  for each row execute function public.ar7_check_allocation();

-- Convenience views used by the CRM ledger screen.
-- Dropped first on purpose: they select x.*, and `create or replace view`
-- refuses to run if a new column has since been added to the base table.
drop view if exists public.payment_balances cascade;
drop view if exists public.order_balances   cascade;
create or replace view public.payment_balances as
select p.*, coalesce(a.applied,0) as applied,
       p.amount - coalesce(a.applied,0) as unapplied
from public.payments p
left join (select payment_id, sum(amount) applied from public.payment_allocations group by 1) a
  on a.payment_id = p.id;

create or replace view public.order_balances as
select o.*, coalesce(a.paid,0) as paid,
       o.amount - coalesce(a.paid,0) as balance_due
from public.orders o
left join (select order_id, sum(amount) paid from public.payment_allocations group by 1) a
  on a.order_id = o.id;

-- ---- Editable website settings --------------------------------------
create table if not exists public.site_settings (
  key text primary key,
  value text,
  label text,
  updated_at timestamptz not null default now()
);
insert into public.site_settings (key,value,label) values
  ('contact_email','info@ar7traders.com','Public contact email'),
  ('contact_phone','+81 80 0000 7007','Public phone number'),
  ('contact_address','Tokyo, Japan','Public address'),
  ('whatsapp_number','+818000007007','WhatsApp button number'),
  ('whatsapp_message','Hello AR7 Traders, I am interested in importing a vehicle.','WhatsApp pre-filled message'),
  ('enquiry_inbox','info@ar7traders.com','Where website enquiries are sent'),
  ('base_currency','USD','Ledger base currency'),
  ('default_customer_currency','USD','Default currency for new customer accounts, quotes and invoices'),
  ('exchange_rates','{"USD":1,"JPY":155,"EUR":0.92,"GBP":0.79,"PKR":278,"AUD":1.52,"NZD":1.66,"CAD":1.37,"AED":3.6725,"SAR":3.75,"KES":129}','Display currency rates per 1 USD (JSON)')
on conflict (key) do nothing;

-- ---- People / HR ------------------------------------------------------
-- Employment details for a staff member. Kept in its own table rather than
-- bolted onto `profiles`, because a profile is a login and an employee is a
-- contract: someone can leave (and lose their login) while their salary
-- history must survive for the accounts.
create table if not exists public.employees (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid unique references public.profiles(id) on delete set null,
  full_name text not null,
  email text,
  phone text,
  job_title text,
  department text default 'Sales'
    check (department in ('Sales','Operations','Accounts','Logistics','Management','Support')),
  employment_type text not null default 'full_time'
    check (employment_type in ('full_time','part_time','contract','intern')),
  status text not null default 'active'
    check (status in ('active','on_leave','left')),
  joined_on date default current_date,
  left_on date,
  base_salary numeric(14,2) not null default 0,   -- per month
  currency text not null default 'USD',
  -- Commission as a percentage of the value of orders credited to them.
  commission_pct numeric(6,3) not null default 0 check (commission_pct >= 0 and commission_pct <= 100),
  bank_details text,
  notes text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists employees_status_idx on public.employees(status);

-- Who gets the credit for a sale. Nullable: an order can exist without an
-- owner, and if an employee record is removed the order itself must not be.
alter table public.orders   add column if not exists employee_id uuid references public.employees(id) on delete set null;
alter table public.leads    add column if not exists employee_id uuid references public.employees(id) on delete set null;
create index if not exists orders_employee_idx on public.orders(employee_id);
create index if not exists leads_employee_idx  on public.leads(employee_id);

-- ---- Payroll ----------------------------------------------------------
-- One row per person per month. The unique constraint is what stops the
-- same month being paid twice by two different people.
create table if not exists public.payroll_runs (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees(id) on delete cascade,
  period_month date not null,                 -- always the 1st of the month
  base_salary numeric(14,2) not null default 0,
  commission   numeric(14,2) not null default 0,
  bonus        numeric(14,2) not null default 0,
  deductions   numeric(14,2) not null default 0 check (deductions >= 0),
  currency text not null default 'USD',
  status text not null default 'draft'
    check (status in ('draft','approved','paid')),
  paid_on date,
  method text,
  reference text,
  note text,
  created_by uuid references auth.users(id),
  approved_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (employee_id, period_month)
);
create index if not exists payroll_period_idx on public.payroll_runs(period_month desc);

-- Net pay is derived, never typed in, so it cannot drift from its parts.
drop view if exists public.payroll_view cascade;
create or replace view public.payroll_view as
select r.*,
       (r.base_salary + r.commission + r.bonus - r.deductions) as net_pay,
       e.full_name, e.job_title, e.department
from public.payroll_runs r
join public.employees e on e.id = r.employee_id;

-- Force period_month to the 1st, so "August" is always one bucket however
-- the date arrives from the browser.
create or replace function public.ar7_payroll_normalise() returns trigger
language plpgsql as $$
begin
  new.period_month := date_trunc('month', new.period_month)::date;
  new.updated_at := now();
  return new;
end $$;
drop trigger if exists ar7_payroll_norm_trg on public.payroll_runs;
create trigger ar7_payroll_norm_trg before insert or update on public.payroll_runs
  for each row execute function public.ar7_payroll_normalise();

-- A paid payroll run is a closed book: reopening it would let figures change
-- after the money left the bank. Only the reference/note stay editable.
create or replace function public.ar7_payroll_guard() returns trigger
language plpgsql as $$
begin
  if old.status = 'paid' and new.status <> 'paid' then
    raise exception 'This payslip is already paid and cannot be reopened. Raise an adjustment next month instead.';
  end if;
  if old.status = 'paid' and (
       new.base_salary <> old.base_salary or new.commission <> old.commission
       or new.bonus <> old.bonus or new.deductions <> old.deductions) then
    raise exception 'This payslip is already paid. Its amounts can no longer be changed.';
  end if;
  return new;
end $$;
drop trigger if exists ar7_payroll_guard_trg on public.payroll_runs;
create trigger ar7_payroll_guard_trg before update on public.payroll_runs
  for each row execute function public.ar7_payroll_guard();

-- ---- Performance ------------------------------------------------------
-- Performance is measured, not entered by hand, so nobody can inflate their
-- own numbers. Everything below is derived from real orders and payments.
drop view if exists public.employee_performance cascade;
create or replace view public.employee_performance as
select
  e.id                                   as employee_id,
  e.full_name, e.job_title, e.department, e.status,
  e.base_salary, e.commission_pct, e.currency,
  count(distinct o.id)                                                as orders_count,
  coalesce(sum(o.amount), 0)                                          as orders_value,
  count(distinct o.id) filter (where o.status in ('paid','shipped','delivered')) as orders_completed,
  coalesce(sum(o.amount) filter (where o.status in ('paid','shipped','delivered')), 0) as revenue_delivered,
  coalesce(sum(o.amount) * e.commission_pct / 100.0, 0)               as commission_earned,
  count(distinct l.id)                                                as leads_count,
  count(distinct l.id) filter (where l.status in ('proposal','negotiation','qualified')) as leads_active,
  max(o.created_at)                                                   as last_order_at
from public.employees e
left join public.orders o on o.employee_id = e.id
left join public.leads  l on l.employee_id = e.id
group by e.id, e.full_name, e.job_title, e.department, e.status,
         e.base_salary, e.commission_pct, e.currency;

-- Same figures, but sliced by month, for trend charts and payroll.
drop view if exists public.employee_month_performance cascade;
create or replace view public.employee_month_performance as
select
  e.id as employee_id, e.full_name,
  date_trunc('month', o.created_at)::date as period_month,
  count(o.id)                    as orders_count,
  coalesce(sum(o.amount), 0)     as orders_value,
  coalesce(sum(o.amount) * e.commission_pct / 100.0, 0) as commission_earned
from public.employees e
join public.orders o on o.employee_id = e.id
group by e.id, e.full_name, date_trunc('month', o.created_at);

-- ---- Security --------------------------------------------------------
alter table public.role_permissions   enable row level security;
alter table public.approval_requests  enable row level security;
alter table public.orders             enable row level security;
alter table public.payments           enable row level security;
alter table public.payment_allocations enable row level security;
alter table public.site_settings      enable row level security;
alter table public.employees          enable row level security;
alter table public.payroll_runs       enable row level security;
-- No policies on purpose: every read and write goes through the server
-- functions using the service role, which check permissions first.


-- ---- Migration: vehicle photo galleries (safe to re-run) -------------
-- The CRM's photo manager stores each vehicle's gallery as a JSON array.
-- Older databases were created before these columns existed; without them
-- every "Save photos" press fails with a 500 (column does not exist).
alter table public.site_listings add column if not exists images  jsonb;
alter table public.site_listings add column if not exists gallery jsonb;
alter table public.vehicles      add column if not exists image   text;
alter table public.vehicles      add column if not exists images  jsonb;
alter table public.vehicles      add column if not exists gallery jsonb;
alter table public.site_blocks   add column if not exists published boolean default true;

-- Show the result
select u.email, p.role, p.active
from public.profiles p join auth.users u on u.id = p.id;
