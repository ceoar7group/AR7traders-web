# Goo-net Importer (Dealer Stock)

Automatically imports high-quality used cars from **Goo-net Exchange**
(`goo-net-exchange.com`) into the public website's **Dealer Stock**, and
removes cars that disappear from Goo-net — while protecting the site's core
stock and keeping the database and browsing experience fast.

## What it does

Every run:

1. **Scrapes** Goo-net Exchange search pages (Land Cruiser, Alphard, Harrier,
   Vellfire, Vezel, Prius by default) for listing links.
2. Visits each listing's detail page and parses make, model, year, mileage,
   price (JPY → USD), fuel, body type, location, transmission, drivetrain,
   engine, colour and the full photo gallery.
3. **Filters for quality** — only listings with a cover photo *and* at least
   `minPhotos` photos (default 10) are imported. Thumbnail-only listings are
   skipped.
4. **Applies the rules** (see below) to insert / refresh / hide cars.
5. Writes an audit line to the CRM activity log.

## The rules (the "keep it smooth" contract)

These are all tunable from **CRM → Website settings** (keys `goonet_*`) — no
code deploy needed.

| Setting | Default | Meaning |
| --- | --- | --- |
| `goonet_enabled` | `true` | Master switch. Set `false` to pause the importer. |
| `goonet_daily_limit` | `40` | Max **new** cars imported per run (≈ per day). |
| `goonet_min_photos` | `10` | Minimum photos for a listing to count as "high quality". |
| `goonet_pinned_count` | `60` | The first N cars stay permanently and are never auto-removed. |
| `goonet_max_live` | `400` | Soft ceiling on live dealer-stock cars (site smoothness). |
| `goonet_unavailable_grace` | `21` days | Hide a Goo-net car after this many days unseen. |
| `goonet_new_arrival_days` | `7` days | A fresh import keeps the **New Arrival** badge for this long. |
| `goonet_request_delay_ms` | `1500` | Politeness delay between HTTP requests. |
| `goonet_page_limit` | `6` | Search pages walked per run. |
| `goonet_jpy_to_usd` | `155` | JPY → USD conversion rate for display prices. |

### Protection rules

- **Pinned cars** (`pinned = true`) and **manual cars** (`source ≠ 'goonet'`,
  i.e. everything you've authored in the CRM or the seed) are **never**
  modified or removed by the importer.
- The first `goonet_pinned_count` (default 60) cars are pinned automatically
  by the migration — this is the "core stock" that must always stay.

### Availability rules

- A Goo-net car that is **re-seen** during a run is refreshed (photos, price,
  spec) and, if it was previously hidden, **restored** to published.
- A Goo-net car **not seen** for `unavailableGraceDays` is hidden
  (`published = false`) — reversible, never hard-deleted.
- If live dealer stock exceeds `maxLive`, the **oldest** non-pinned Goo-net
  cars are hidden first, so the newest stock always stays visible.

### New Arrival aging

- Newly imported cars get `status = 'New Arrival'` and appear on the
  **New Arrivals** page.
- After `newArrivalDays` they roll to `In Stock` automatically.

## Where cars appear

- **Dealer Stock page** (`/dealer`) — every Goo-net import
  (`dealer_stock = true` / `source = 'goonet'`).
- **New Arrivals page** (`/new-arrivals`) — imports with `status = 'New Arrival'`.
- **Inventory page** — everything, with two new filter chips: **New Arrival**
  and **Dealer stock**.
- Pinned/manual cars continue to appear in the showroom as before.

## How to run it

### 1. One-time database migration

Apply `supabase/goonet-sync.sql` in the Supabase SQL editor (it is
idempotent). Fresh databases get the same columns from
`SETUP-EVERYTHING.sql`.

### 2. Environment variables

Set on Vercel (for the CRM button and the site):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Set on GitHub (Settings → Secrets and variables → Actions → New repository
secret) so the scheduled workflow can run the importer:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

### 3. Run

- **CRM button** — *Website cars* tab → **Import Goo-net stock** (admin only).
- **CLI** — `node scripts/goonet-scraper.mjs` (with `--dry-run` to preview).
- **Scheduled** — `.github/workflows/goonet-sync.yml` runs every 6 hours via
  GitHub Actions (free, and safe for a public repo). Secrets are stored in
  GitHub, never in code. You can also trigger it manually from the GitHub
  "Actions" tab.

### 4. Test

```
node scripts/goonet-core.test.mjs
node scripts/goonet-scraper.mjs --demo --dry-run
```

## Architecture

- `scripts/goonet-core.mjs` — pure logic (parsing, quality filter, planning,
  apply). No dependencies; injectable Supabase client + `fetch`.
- `scripts/goonet-scraper.mjs` — CLI entry point.
- `api/goonet-sync.js` — admin POST + cron GET entry point.
- `supabase/goonet-sync.sql` — migration (columns, indexes, settings, run log).
- `scripts/goonet-core.test.mjs` — unit tests.

> **Note on scraping:** the sandbox blocks direct outbound fetches to
> goo-net-exchange.com, but the importer runs in production on Vercel where
> egress is allowed. Parsing is defensive (graceful per-listing failure) so a
> layout change degrades to "import fewer cars" rather than a crash.
