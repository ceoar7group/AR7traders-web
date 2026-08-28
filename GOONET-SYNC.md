# Goo-net dealer stock importer — how it works

This update adds a self-running **Goo-net (goo-net.com) importer** plus three
things you asked for around it: a new **"Japan dealer stock"** page on the
website, a **"Japan dealer stock"** manager in the CRM with buttons to move
cars into *Website cars* or *Inventory*, and an upgraded **profit system** in
the CRM with sourcing-vendor breakdowns.

It is deliberately engineered to run on **free Vercel (Hobby)** hosting:

- No Vercel cron add-on. The importer is triggered by a free **GitHub Actions
  workflow** (or any uptime/cron service) calling one small Vercel function.
- Every run is **tiny** — it crawls one Goo-net page, imports at most a few
  cars, and stops early if it has been running ~8 seconds. It never hammers
  the site, never times out, and resumes where it left off.
- Only cars that pass the **quality gate** (minimum photo count, price, year,
  mileage, condition rating) are imported.

---

## 1. Run the database update (required)

Open **Supabase → SQL Editor**, paste the whole of
`supabase/SETUP-EVERYTHING.sql`, press **Run**. It is safe to run again.

This adds:

- `japan_dealer_stock` — where imported Goo-net cars live (new website page +
  CRM manager).
- `vendor`, `cost_price`, `freight_cost`, `duty_cost`, `other_cost`,
  `sourcing_currency` columns on `vehicles` — the profit system.
- `goonet_*` settings — importer rules you can tune from the CRM.

## 2. Connect the scheduler (one time, ~3 minutes)

1. **Vercel → your project → Settings → Environment Variables** — add one
   variable (type exactly):
   `GOONET_SYNC_KEY` = a long random string (e.g. `openssl rand -hex 32`)
2. **GitHub → your repo → Settings → Secrets and variables → Actions →
   New repository secret** — add the *same* value as `GOONET_SYNC_KEY`.
3. Optional: if your site URL is not `https://ar7traders.com`, add the secret
   `GOONET_SYNC_URL` = your live URL.
4. Redeploy the Vercel project once (env vars apply on build).

That's it. The workflow (`.github/workflows/goonet-sync.yml`) now calls
`/api/goonet-sync?key=…` **once a day at 03:00 UTC** — the free-tier default.
Each run is small and resumes from a bookmark, so the daily cadence keeps the
site fast. If you ever want more frequent runs, change the `cron` line in
that file (e.g. `cron: '0 */6 * * *'` = every 6 hours) — but keep the "once
daily at most" free-tier rule as the recommended setting.

No GitHub Actions? Any free cron service (cron-job.org, UptimeRobot,
healthchecks.io) can call the same URL — one call per day is plenty.

## 3. The importer's rules (editable in the CRM)

**CRM → Japan dealer stock → Importer rules**

| Setting | Default | Meaning |
|---|---|---|
| Goo-net search page | `price-100-300` listing | Which newest-first listing to crawl |
| Minimum photos | 8 | The quality gate — fewer good photos = skipped |
| Max new cars per run | 6 | Batch size per run (keeps the site fast) |
| Delist checks per run | 5 | How many existing cars are verified per run |
| Weekly delist limit | 5 | Maintenance removes at most this many older cars/week |
| Weekly auto-promote limit | 2 | Fresh cars auto-promoted to the website per week |
| JPY → USD rate | 0.0068 | Used for estimated US prices |

What a run does, in order:

1. **Crawl** the next bookmarked Goo-net listing page (newest first).
2. **Quality gate**: for each new car, fetch its detail page, count photos,
   read price/year/mileage/condition — only import cars that pass. Skipped
   cars are listed in the run report.
3. **Delist check**: a few existing cars are re-visited; if Goo-net shows the
   car is gone (404 or the "listed until …" notice), it is **delisted** — it
   disappears from the *Japan dealer stock* page, and if it had been promoted
   to the website, that listing is hidden too (`published=false`, reversible).
4. **Weekly maintenance** (once per 7 days): delists a *few* older/lower-quality
   cars, and auto-promotes a *few* fresh high-quality cars to the website so
   stock keeps growing without ever flooding the site.
5. Advances the page bookmark and writes an Activity-log line.

Everything is idempotent — running it twice changes nothing the second time.

**Manual runs:** the same "Run import now" button in the CRM triggers one run
instantly (admin only), and `scripts/goonet-crawl.mjs` (see below) is the
terminal version with `--dry-run`.

## 4. The new page: Japan dealer stock

- URL: **`https://ar7traders.com/japan-stock`** (also in the header nav,
  the More menu and the footer).
- Shows only **available, quality-gated** dealer cars from `japan_dealer_stock`
  (photo count badge, grade, price, location, photo gallery modal with controls
  outside the picture area, "Enquire" and a link to the original Goo-net
  listing).
- Cars delisted on Goo-net disappear automatically — no manual cleanup.

## 5. The CRM manager

**CRM → Japan dealer stock**

- Every imported car: photo, stock no., vehicle, year, km, price, photo count,
  **quality score**, status, promoted flag, imported date.
- Filter chips: All / Available / New this week / Promoted / Delisted.
- Row actions:
  - **Website** — move the car to *Website cars* (published on the site,
    shown in Inventory too since it becomes a listing).
  - **Inventory** — copy it into the CRM *Inventory* as a vehicle with
    `vendor = Goo-net` and its estimated cost.
  - **Delist / Re-list** — hide or restore it on the Japan dealer stock page.
  - Photos / Edit / Delete as usual.
- **Run import now** (admin) and **Importer rules** settings panel.
- In demo mode (no Supabase keys) everything works with sample data.

## 6. Profit system upgrade

**CRM → Profit & sourcing** (new tab, plus profit columns in **Inventory**)

- Per vehicle: **selling price** minus **purchase cost + freight + duty +
  other costs** = profit and margin %.
- KPI cards: stock value, total cost, potential profit, average margin.
- **Per-vendor breakdown**: Goo-net, USS/TAA/JU/CAA auctions, dealer network,
  private sales… — units, stock value, cost, profit and margin per channel.
- Vehicles without cost data are excluded from profit totals so the books
  can't be overstated.
- Edit the costs on any vehicle from **Inventory → Edit** (new fields), or
  from *Profit & sourcing* via "Open inventory".

## 7. Terminal runner (optional)

The scraper core (`scripts/goonet-core.mjs`) is dependency-free and tested
(`node scripts/goonet-core.test.mjs` — 66 assertions). A CLI is included:

```
SUPABASE_URL="https://xxx.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
node scripts/goonet-crawl.mjs --dry-run
```

Flags: `--dry-run` (print what would change, write nothing), `--page N`
(start at listing page N), `--min-photos N` (override the quality gate).

## FAQ

**Will this slow the website?** No. Runs are batched (a few cars per run),
time-boxed, and resume from a bookmark; the site reads the data through a
cached public endpoint. Importing even 50 cars over a day is a handful of
small inserts.

**What happens to a car that disappears from Goo-net?** The next delist check
marks it `available=false` (hidden from the site) and unpublishes the matching
*Website cars* listing if one exists. Nothing is ever hard-deleted.

**Will my free Vercel keep running?** Yes. No cron add-on, no always-on
server: GitHub Actions (free) wakes the function once a day for a few
seconds. If the site is sleeping, the first request just wakes it.

**Can I stop the importer?** Delete the GitHub secret or the workflow file,
or untick "Auto-promote" and set limits to 0 in the CRM rules. The site is
unaffected either way.
