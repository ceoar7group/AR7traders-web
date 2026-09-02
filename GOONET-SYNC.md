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
  cars, and stops early once its time budget is used (45 s for the whole run,
  of which at most 30 s goes to importing cars — well inside the
  `maxDuration: 60` the function declares). It never hammers the site, never
  times out, and resumes where it left off.
- Only cars that pass the **quality gate** (8+ photos, model year 2000+, a
  real price, and every one of make / model / year / price / km / fuel / body)
  are imported.
- A car that was **deleted never comes back**: every deletion is recorded in
  `goonet_blocklist`, and the importer skips anything on that list.

---

## 0. Cleaning up bad imports (do this once)

Old runs imported cars with a single photo, placeholder headings ("Unknown",
"Car") or missing details, and re-imported cars that had been deleted. To
clear them out and stop it happening again:

1. **Back up first** — Supabase → Database → Backups (or export
   `japan_dealer_stock` as CSV from the Table editor).
2. Open **Supabase → SQL Editor**, paste **`supabase/goonet-cleanup.sql`**,
   press Run. It creates `goonet_blocklist`, blocks + deletes every car with
   fewer than 8 photos or missing make/model/year/price, removes the website
   and CRM copies that were promoted from them, raises the importer's photo
   minimum to 8, and prints the check counts:

   ```sql
   select count(*) from public.japan_dealer_stock where photo_count < 8;  -- expect 0
   select count(*) from public.goonet_blocklist;                          -- expect > 0
   ```

   (`supabase/SETUP-EVERYTHING.sql` contains the same block, so a fresh
   database gets it automatically — both are safe to re-run.)
3. Deploy this version. From now on the CRM **Delete** button, the cleanup
   script and the importer all share the blocklist.

The same cleanup is available from a terminal, with a dry run:

```
SUPABASE_URL="https://xxx.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
node scripts/clean-goonet.js --dry-run      # list what would go, change nothing
node scripts/clean-goonet.js                # block + delete (and the promoted copies)
```

Flags: `--min-photos N` (default 8), `--keep-copies` (leave `site_listings` /
`vehicles` alone). Test on staging before production.

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
| Minimum photos | 8 | The quality gate — fewer photos = skipped. **8 is a floor**: a lower value in the CRM is ignored, a higher one is honoured |
| Oldest model year | 2000 | Cars older than this year are skipped (also a floor) |
| Max new cars per run | 6 | Batch size per run (keeps the site fast) |
| Delist checks per run | 5 | How many existing cars are verified per run |
| Weekly delist limit | 5 | Maintenance removes at most this many older cars/week |
| Weekly auto-promote limit | 2 | Fresh cars auto-promoted to the website per week |
| JPY → USD rate | 0.0068 | Used for estimated US prices |

What a run does, in order:

1. **Crawl** the next bookmarked Goo-net listing page (newest first). The
   bookmark only advances when that page was actually read (2+ parsed car cards).
   A blocked run, or a real page whose card markup the parser no longer
   understands, re-reads the same page instead of walking past it.
2. **Blocklist check**: a car whose goo-net id is on `goonet_blocklist` (it
   was deleted before) is skipped without even fetching its page, and shows
   in the report as `<stock no>: blocked (previously deleted)`.
3. **Quality gate**: for each new car, fetch its detail page and require ALL of:
   - **8 or more photos** that belong to *this* car (the full gallery is read,
     including the part goo-net ships as JSON; photos of the dealer's other
     cars on the same page are not counted);
   - a real **price** (car body price; anything under ¥50,000 is treated as a
     placeholder and rejected), **model year 2000 or newer** and not in the
     future, and a **mileage**;
   - every required field present: `make, model, year, price_jpy, km, fuel,
     body` — no "Unknown", no empty values;
   - a real heading: a make read from the car's own `<h1>` (not from the site
     menu), and a model that is not a placeholder ("Car", "Used Car",
     "Vehicle", or just the make name again);
   - the listing card and the detail page naming the **same make** — a
     mismatch means the page was misread, and the car is skipped rather than
     listed under the wrong brand;
   - no "listed until …" (already delisted) notice on the detail page.

   Skipped cars are listed in the run report with the reason, for example
   `988026081900208975902 Honda N-BOX (photos 1/8)`. The condition rating and
   repair history only move the quality *score*, they never block a car.
4. **Delist check**: a few existing cars are re-visited; if Goo-net shows the
   car is gone (404 or the "listed until …" notice), it is **delisted** — it
   disappears from the *Japan dealer stock* page, and if it had been promoted
   to the website, that listing is hidden too (`published=false`, reversible).
5. **Weekly maintenance** (once per 7 days): delists a *few* older/lower-quality
   cars, and auto-promotes a *few* fresh high-quality cars to the website so
   stock keeps growing without ever flooding the site.
6. Writes the run timestamps/settings. The page bookmark has already advanced
   only if step 1 yielded a readable listing; otherwise it stays held for the
   next run.

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
  - **Delist / Re-list** — hide or restore it on the Japan dealer stock page
    (reversible).
  - **Delete** — *permanent*. The car's goo-net id is written to
    `goonet_blocklist` **before** the row is removed, its website / CRM
    inventory copies (same stock number, vendor Goo-net) are removed too, and
    the activity log records "Permanently deleted and blocked car …". The
    importer will never bring that car back. If the blocklist table does not
    exist yet the delete is refused with a message telling you to run the SQL,
    because a delete that can be undone by the next import is not a delete.
  - Photos / Edit as usual.
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
(`npm run test:goonet` — 375 assertions across the parser, the seed builder,
the importer endpoint, the delete endpoint and the cleanup script). A CLI is
included; it applies exactly the importer's rules (blocklist, 8-photo floor,
required fields):

```
SUPABASE_URL="https://xxx.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
node scripts/goonet-crawl.mjs --dry-run
```

Flags: `--dry-run` (print what would change, write nothing), `--page N`
(start at listing page N), `--min-photos N` (raise the photo gate above 8 —
lower values are ignored, like the importer).

## 8. Seed the page from a real Goo-net batch

`scripts/fixtures/goonet-capture-2026-08-31.json` is a real capture of the
`price-100-300` listing (8 cars: make, title, both prices, year, mileage,
engine, transmission, repair history, condition ratings, prefecture, dealer,
photo URLs — all verbatim; only `fuel`/`body` are classified, because Goo-net
prints those on the detail page, not on the card).

`scripts/goonet-seed.mjs` turns that capture into `japan_dealer_stock` rows
using **the same `goonet-core` maths the live importer uses** — `manToYen` →
`yenToUsd` → `usdText` for pricing, `detectMake`/`detectModel` for the name,
the same 外装/内装 grade average, the same `qualityScore` gate — so the seed and
the importer cannot drift.

```
node scripts/goonet-seed.mjs            print the cars and their quality verdicts
node scripts/goonet-seed.mjs --sql      write supabase/japan-stock-seed.sql
SUPABASE_URL="https://xxx.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
node scripts/goonet-seed.mjs --push     upsert into japan_dealer_stock
```

The SQL is keyed on `goonet_id` with `on conflict … do update`, so re-running
it refreshes the cars instead of duplicating them. Run it **after**
`supabase/SETUP-EVERYTHING.sql` (which creates the table).

`src/dev-api-mock.js` builds the same rows from the same capture, so the local
dev preview of the Japan dealer stock page shows exactly what `--push` writes.

## 9. Why it was importing nothing (fixed)

Four separate defects, each enough on its own to make a run report
`inserted: 0` with no error:

1. **The relay was never tried on a network error.** `fetchPage` returned
   `{ok:false, status:0}` as soon as the direct fetch threw — *before* the
   relay branch. Goo-net answers data-centre IPs with a connection reset
   (`ECONNRESET`) rather than a 403, so the bot-gate relay that was supposed
   to be the fallback never ran and every page looked permanently blocked.
   Both paths now go through one `relayFetch()` helper; a dead socket is no
   longer mistaken for "delisted", and `allowRelay:false` still never dials
   the relay.
2. **The crawl ate the whole time budget.** A single `TIME_BUDGET_MS` was
   shared by the crawl and the import loop, whose first statement was
   `if (overBudget()) break;`. Any run that spent its seconds reading the
   listing imported nothing. There are now two budgets (`RUN_BUDGET_MS`,
   `IMPORT_BUDGET_MS`), and the import loop measures from the moment the
   crawl finished. Measured in the importer tests: `inserted 0` before,
   `inserted 2` after.
3. **Cards whose URL the parser missed were dropped silently.** The import
   loop only used `card.url`, which is `null` whenever the `<h3><a …spread…>`
   regex misses. It now falls back to `detailUrlFor(card.goonet_id)` (and
   stores the rebuilt URL in `goonet_url`), so a markup change surfaces as a
   fetch failure in the run report instead of a silent no-op.
4. **The year regex did not match live cards.** `numberAfter` required
   `\d{4}` followed by `年`/`(`/`（`, but live cards render `年式2019後`.
   Every car therefore got `year: null` → the gate's `no/old year` reason →
   `pass: false`. The parser now accepts `(19|20)\d{2}` followed by 年/( /（
   **or** a word boundary, while `年式 指定なし` (the search-form selector) and
   `20199` still parse as null.

A fifth, smaller bug: `detectModel` returned the *first* matching key, so
`カローラクロス` became "Corolla" and `ランドクルーザープラド` became "Land Cruiser".
The longest matching key now wins.

## FAQ

**Will this slow the website?** No. Runs are batched (a few cars per run),
time-boxed, and resume from a bookmark; the site reads the data through a
cached public endpoint. Importing even 50 cars over a day is a handful of
small inserts.

**What happens to a car that disappears from Goo-net?** The next delist check
marks it `available=false` (hidden from the site) and unpublishes the matching
*Website cars* listing if one exists. The importer never hard-deletes on its
own; only the CRM **Delete** button and the cleanup script do, and those also
blocklist the car.

**I deleted a car and it came back the next day — why?** That was the bug this
version fixes: the importer only knew what was in the table *right now*, so a
deleted car looked new again. Every deletion now lands in `goonet_blocklist`
and the import loop skips those ids (`blocked (previously deleted)` in the run
report, `blockedSkipped` in the counts). Run `supabase/goonet-cleanup.sql`
once so the table exists and the old bad imports are blocked too.

**Why were cars imported with 1 photo / the wrong make / "Car" as the model?**
Three parser faults, all fixed and covered by tests: the photo scanner only
saw the first thumbnails, not the full gallery goo-net embeds as JSON (and
counted the dealer's *other* cars' photos); the make was the first brand
found anywhere on the page — usually the site's brand menu — instead of the
car's own heading; and unmapped models fell back to "Car" or the make name.
The gate now refuses anything that is not complete and consistent, so a
parser miss produces a skip (visible in the report), never a bad listing.

**Will my free Vercel keep running?** Yes. No cron add-on, no always-on
server: GitHub Actions (free) wakes the function once a day for a few
seconds. If the site is sleeping, the first request just wakes it.

**The run reports `cardsSeen: 1` or `cardsSeen: 0` and imports nothing — what is that?**
There are two different failures that can look similar at first glance:

- **`blocked: true`** means Goo-net served a bot-gate/interstitial page: fewer
  than 2 car links, plus the gate's own wording (for example `アクセスが集中`,
  `セキュリティ`, `reCAPTCHA` / `captcha`) or an interstitial-sized body. Generic
  page boilerplate such as `cookie`, `Cookie`, `utilized`, or `verify` is
  diagnostic only — it never overrules real car links. The importer may retry
  through the free `r.jina.ai` reader relay, and keeps the relayed copy only
  when it really contains more cars. If the relay cannot read more either, the
  report holds the bookmark and skips delist/weekly sweeps so a day that read
  nothing cannot churn the catalogue.

- **`parseMiss: true`** means Goo-net returned a real listing page (many raw
  car links and usually a large body), but the importer parsed fewer than 2
  cards. That is a parser/markup-change bug, not a blockade. The report includes
  `diagnostics.rawCarLinks` and `diagnostics.directBytes`, keeps the bookmark
  held to avoid blind crawling, and still runs delist/weekly maintenance because
  those steps do not depend on the listing-card parser.

`bookmarkAdvanced` in the JSON tells you whether the page bookmark moved.

**Can I stop the importer?** Delete the GitHub secret or the workflow file,
or untick "Auto-promote" and set limits to 0 in the CRM rules. The site is
unaffected either way.
