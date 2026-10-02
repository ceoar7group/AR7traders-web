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
| Minimum photos | 5 | The quality gate — fewer good photos = skipped |
| Oldest model year | 2000 | Cars older than this year are skipped |
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
5. Writes the run timestamps/settings. The page bookmark has already advanced
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
  - **Delist / Re-list** — hide or restore it on the Japan dealer stock page.
- **Already added?** The *Promoted* column and the row buttons answer that
  from the actual records: a car that is in *Inventory* shows **In inventory ✓**
  (the button becomes a disabled confirmation), one that is on the site shows
  **On website ✓**, and one that is in both says **Website + inventory**. So a
  car cannot be copied twice by accident, and the CRM never claims an add that
  did not happen: the copy is verified before the button changes, and if the
  database refuses the write the notice says why instead of "added".
  Staff with the *Edit the public website* permission read the complete dealer
  list (delisted cars included, so **Re-list** is reachable); everyone else
  reads the public one.
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
(`npm run test:goonet` — 247 assertions across the parser, the seed builder and
the importer endpoint). A CLI is included:

```
SUPABASE_URL="https://xxx.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
node scripts/goonet-crawl.mjs --dry-run
```

Flags: `--dry-run` (print what would change, write nothing), `--page N`
(start at listing page N), `--min-photos N` (override the quality gate).

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

## 10. Why imports were still skipping every car (fixed, 2026-09-28)

The 2026-08-31 fixture batch imported fine, but live runs again reported
`inserted: 0` with per-car skip reasons of `missing fields: body`:

5. **Goo-net detail pages do not print a body-type row.** The importer's
   required-fields gate demands `body`, but the live 基本仕様 table has
   年式/走行距離/修復歴/排気量/乗車定員/駆動方式/燃料/ドア/ミッション/車体色 —
   no ボディタイプ (verified against a live detail page). `parseDetailPage`
   therefore always returned `body: null` and every candidate was skipped.
   `body` is now derived from the curated `MODEL_MAP` body hint
   (`bodyForModel`, longest match wins) — the same classification the seed
   batch curates by hand. An unknown model still yields `null` and the car
   is skipped honestly rather than imported with a guess.
6. **The relay could replace a good detail page.** `looksLikeStub` counts
   `/spread/` links, which is only meaningful for listing pages — a detail
   page legitimately has few or none, so detail fetches were re-dialled
   through the relay, and any larger page the relay returned (even a
   listing page) replaced the good detail HTML. `fetchPage` now takes
   `purpose: 'detail'` (used by the import loop) which never applies the
   stub heuristic — the relay still runs when the direct socket fails —
   and `mergeCardAndDetail` refuses to merge anything that did not parse
   as a real detail page (make + `<h1>` title).

After the fix the importer test suite is green end to end:
`goonet-core` 158, `goonet-seed` 54, `goonet-sync` 41 passed, 0 failed.

## 11. Self-healing: AI fallback, drift fallbacks, parser evidence (2026-09-30)

Goo-net's listing markup changes without notice, and a `parseMiss` run used
to mean: zero cars imported until somebody hand-fixed the regexes. Three
layers now keep the importer working in between:

1. **Markup-drift regex fallbacks** (`parseCard` in `scripts/goonet-core.mjs`).
   Loose card titles: when the strict `<h3><a …spread…>` shape is gone, the
   title is read from the spread anchor's text (longest candidate wins) or the
   thumbnail's `img alt`. English make names: `トヨタ` cards that print
   `Toyota` still detect (`detectMake` matches whole English words). Raw-yen
   prices: `￥1,999,000` and `1500000円` parse where `万円` is absent
   (`rawYen`, sanity-bounded so fee lines like `登録料15,000円` cannot win).
2. **AI fallback (the self-heal).** When a run is `parseMiss` — a real listing
   page the regex parser could not read — and `GEMINI_API_KEY` (or
   `OPENAI_API_KEY`) is set, the importer asks the LLM to extract the cards
   with a strict JSON schema, and the extracted cards flow into the **same**
   import loop: same detail fetch, same quality gate, same required fields,
   same blocklist. Rules that keep it safe:
   - **No key → never called.** A keyless run behaves exactly as before.
   - LLM image URLs must **literally occur in the source markup**; invented
     photos are dropped, so the quality gate is never fed fake galleries.
   - The report gains `llm: {via, model, extracted, error?}` and the CRM
     notice names it — success reads like `AI fallback (gemini) extracted N
     card(s)…`. The bookmark stays **held** (the parser may still be missing
     cards beyond the extraction window), and `parseMiss` stays `true` so the
     parser fix is not forgotten.
   - If the LLM extracts nothing, the run keeps its honest `parseMiss` report
     plus `llm.error` — the evidence below is then the fix's input.
3. **Parser evidence.** Every `blocked` or `parseMiss` run stores a **2 KB
   sample** of the exact HTML it parsed in
   `site_settings.goonet_parsemiss_sample`. The sample is **anchored on a
   real DOM car card**, not on the top of the page — a live listing page is
   ~1 MB, its first 2 KB are header boilerplate, and the first car *link* in
   the document is usually a JSON-LD `ItemList` entry that shows a parser fix
   nothing about the rendered cards. When the page has no usable card anchor
   at all, the sample is the structured-data block and says so. A clean read
   clears the stale sample. CRM → Japan dealer stock gains a **"Copy parser
   diagnostic"** admin button that copies the sample plus its metadata (the
   envelope is described in §12), served by the admin-only
   `GET /api/goonet-stock?action=diag`.

   **Gemini model.** The fallback calls `models/gemini-3.8-flash` by default
   (Google retired `gemini-2.5-flash` for new keys on 2026-09-30 — the first
   live run 404'd on it). Override with the `GEMINI_MODEL` env var if Google
   moves the default again.

4. **Title-anchor segmentation (the 2026-09-30 fix).** The live page links
   every stock in extra regions (hidden/preload grids), so "first spread
   link per stock" no longer marks the card start — one live run parsed
   **1 of 50 cards**. `parseListingPage` now anchors each card on its
   **title anchor**: the spread anchor with a readable caption (anchor text
   or `img alt`) whose following 2500 chars carry the spec block
   (年式/万円/走行距離). An `<h3>` anchor always wins over a bare
   thumbnail, and a bare thumbnail can never win over a spec-carrying
   anchor. Segments are cut title-anchor → title-anchor; the make line and
   photos are read from the region ABOVE the title, the spec fields from
   BELOW it, so neither the previous card's fields nor the next card's
   make line / thumbnails can bleed in. Regression fixtures:
   `scripts/fixtures/goonet-listing-2026-09-30.html` (the live layout) and
   the duplicate-grid case in `scripts/goonet-core.test.mjs`.

**Workflow when a run says `parseMiss`:** press "Copy parser diagnostic",
paste the stored markup where the fix is tracked, and fix `parseCard` /
`parseListingPage` in `scripts/goonet-core.mjs` against that **exact** markup
— then add the trimmed sample as a fixture in `scripts/fixtures/` with
regression tests. Until the fix ships, the AI fallback keeps importing cars
in the meantime (when a key is configured).

**Vercel keys for this feature** (Settings → Environment Variables):

- `GEMINI_API_KEY` — enables the AI fallback and the on-site assistant's
  grounded answers. Any Google AI project works (the project chosen at key
  creation is irrelevant). Free key: <https://aistudio.google.com/apikey>.
  `GEMINI_MODEL` optionally overrides the model (default
  `gemini-3.8-flash`).
- `OPENAI_API_KEY` — alternative provider, used only when no Gemini key is
  set.
- `JINA_API_KEY` / `GOONET_RELAY_URL` — the relay (see above) — unchanged.

## 12. The 2026-10-01 fix: bytes, cards and AI input (and the URL import assistant)

The live run of 2026-09-30 22:47 read **1,177,727 bytes**, counted **50 car
links**, parsed **0 cards**, and the AI fallback extracted nothing. Three
independent problems, all fixed and covered by regression tests:

**a. The response was decoded as UTF-8 whatever the source declared.**
`rawFetch` used `res.text()`, which ignores `Content-Type` and
`<meta charset>` and never sniffs bytes. The stored diagnostic proved it:
decoding the EUC-JP byte run `A5 C8 A5 E8 A5 BF C0 BE C5 EC B5 FE` as UTF-8
yields `\uFFFD\u0225\u897F…`, the exact signature the sample showed, while
the same bytes decoded as EUC-JP are `トヨタ西東京`. Every Japanese field
(make/model/fuel/body) then failed its own validation, so no card could ever
pass the gate. The reader now takes raw `arrayBuffer()` bytes and chooses the
charset as BOM → `Content-Type` → `<meta>` → byte sniff (valid UTF-8 wins,
otherwise EUC-JP vs Shift_JIS scored by replacement count), with aliases for
`cp932`, `sjis`, `x-euc`, `cseucpkdfmtjapanese`, and the rest of the legacy
labels. `maxBytes` now caps **bytes**, and byte count and character count are
reported separately.

**b. "50 car links" was never 50 cards.** The counter scanned the whole
document — including the JSON-LD `ItemList` in `<head>` — while the card
parser only accepted double-quoted **absolute** `www.goo-net.com` anchors.
Links are now found in absolute / protocol-relative / root-relative /
single-quoted / `\/`-escaped shapes, normalised to the canonical
`https://www.goo-net.com/usedcar/spread/goo/<n>/<id>.html`, and classified as
markup vs script vs bare. If no anchor can be used, the page's structured-data
candidates are read instead — but every candidate is still fetched from its own
detail page and passed through the same price/year/mileage/fuel/body/photo
gate, so nothing is invented.

**c. The AI fallback was sent the wrong 120,000 characters** — the header,
JSON-LD and navigation of a 1.2 MB page. It now receives bounded windows (a
small head, the ItemList lines, and the markup around each DOM card) with the
stock id and photo URLs, keeping the same output validation and the "photo
URLs must occur in the source markup" rule. It remains key-gated: no key, no
request.

**The diagnostic now describes the read, not just the bytes.**
`GET /api/goonet-stock?action=diag` returns
`{saved_at, page, source, via, run, bytes, chars, charset, charset_source,
content_type, replacements, dom_card_found, dom_car_links, structured_cars,
structure_source, spread_links, sample_kind, sample}`, so a bug report says
whether the page arrived as mojibake, whether the cars were in markup or
structured data, and which HTML source (direct or relay) it read. The run
report gains `discovered / alreadyKnown / rejected / cardSource`, and the
thin-page gate is judged in bytes. The CRM's "Copy parser diagnostic" writes
those encoding facts into the copied text.

**The URL import assistant** (CRM → Japan dealer stock → "Import from Goo-net
URLs"; staff with the `site.write` permission):

1. Paste up to **5** Goo-net vehicle URLs, one per line.
2. **Preview** — the server validates each URL (https, a `goo-net.com` host,
   no credentials, port 443, a `/usedcar/spread/goo/<n>/<id>.html` path) and
   re-reads each page through the same core, then shows the verified
   make/model/year/price/mileage/fuel/body, the photo URLs and count, the
   quality verdict and any missing fields. Nothing is written.
3. **Import** — the whole inspection runs again (a preview payload from the
   browser is never trusted), then each ready car is inserted into
   `japan_dealer_stock` as an **unpromoted** "New Arrival". Cars already in
   stock report `already_present`, deleted cars stay blocked, and
   quality/photo/missing-field failures report with their reason.
4. **Publish** with the existing Website / Inventory buttons on the row.

The assistant rides inside `api/goonet-stock.js` — no new serverless function,
still 12 ≤ 12 — and is bounded: 5 URLs, 9 s per page, 45 s per request.

**Live acceptance check for this fix:** run the importer now and confirm the
report is no longer `0 cards / parseMiss` — either new cars import, or the
counters honestly say the candidates were already known / quality-rejected.
Then press "Copy parser diagnostic": the sample must show readable Japanese
and real card markup, and the header must name the charset and its source.
Finally paste one currently available goo-net detail URL into the assistant,
preview, import, publish, and confirm the car reaches the public site; repeat
the same URL and expect `already_present` instead of a duplicate.

## 13. Why the Inventory/Website buttons did nothing (fixed, 2026-10-03)

The owner's report: pressing **Inventory** on a Japan dealer stock row showed an
error, the car never appeared in CRM → Inventory, and the row never said it had
been added. Four separate defects, all on the same short path:

1. **The action was dispatched from the wrong place.** Every CRM button sends
   its action in the **query string** (`POST /api/goonet-stock?action=promote`
   with a plain `{id, target}` body — the same shape `/api/team`,
   `/api/hr` and `/api/customer-admin` use), but `api/goonet-stock.js` only
   looked at `req.body.action`. So the request skipped the promote route
   entirely, fell through to the plain CRUD insert below it, and tried to
   insert an empty row:

   ```
   null value in column "goonet_id" of relation "japan_dealer_stock"
   violates not-null constraint
   ```

   That was the error on screen, and it is why nothing was ever copied — the
   whole row-action toolbar was affected (*Inventory*, *Website*, *Delist*,
   *Re-list*, *Reset bookmark*, and the import assistant's Preview/Import).
   The endpoint now reads the action from the query string **or** the body, and
   the CRM sends it in both. `scripts/goonet-promote.test.mjs` drives the exact
   CRM shape so this cannot come back, and the dev preview middleware mirrors
   the server's dispatch.

2. **Failed writes were answered with "Moved …".** Supabase resolves
   `{error}` instead of throwing, and the promotion helpers ignored every
   result — including the `promoted` flag they wrote. A car whose insert failed
   was still stamped `promoted = 'vehicles'`, so the CRM (and the importer) both
   believed it was in the inventory. Every write is now checked, the reason is
   surfaced to whoever pressed the button, and the flag is written **last**, only
   after the copy really landed. The scheduled importer still cannot be killed by
   one bad copy: a failure is reported in the run report (`failed`, with the
   reason in `skipped`) and the run carries on.

3. **The row could not say "already added".** The button always looked
   unpressed, so the only way to know was to open *Inventory* and search. The
   CRM now reads the state from the records — *Website cars* and *Inventory*
   compare by stock number — as well as the row's flag, and renders **On
   website ✓** / **In inventory ✓** / **Website + inventory** with the action
   replaced by a disabled confirmation. Pressing again can no longer copy a
   second vehicle: the API answers "… is already in CRM inventory (details
   refreshed)" and updates the existing vehicle.

4. **Two smaller bugs on the same path.** `'both'.includes('listings')` is
   `false`, so a car that was on the site **and** in the inventory was treated
   as neither — delisting left the website copy published, and re-promoting
   downgraded `'both'` to a single destination. The flag is now read as a token
   (`promotesToListings` / `promotesToInventory`). And *Re-list* always sent
   `available: false`, i.e. it hid the car the user was trying to restore; the
   CRM now sends the state the press should end up in.

Related: the CRM's dealer list is fetched with `all=1` for staff who may edit
stock, so it is uncached (a promotion is visible immediately, instead of up to
two minutes later from the public response's `Cache-Control`) and includes
delisted cars, which is what makes **Re-list** reachable at all.

Tests: `npm run test:goonet` (now including `scripts/goonet-promote.test.mjs` —
61 assertions) and `npm run test:crm` (74, including the row-state block).

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
  With `GEMINI_API_KEY` (or `OPENAI_API_KEY`) set, the AI fallback extracts the
  cards from the same page (strict JSON, validated, same quality gate) and the
  report names it: `llm: {via: "gemini", extracted: N}` and a note starting
  "AI fallback (gemini)". If the `llm` field is absent (no key) or shows
  `extracted: 0`, press "Copy parser diagnostic" and fix `parseCard` against
  the stored markup sample — see section 11.

`bookmarkAdvanced` in the JSON tells you whether the page bookmark moved.

**Can I stop the importer?** Delete the GitHub secret or the workflow file,
or untick "Auto-promote" and set limits to 0 in the CRM rules. The site is
unaffected either way.

**The importer is blocked every run / imports nothing — what now?**

Read the run report first (CRM → Japan dealer stock → "Run import now" shows
the skip reasons; the scheduled workflow prints the full JSON):

- `blocked: true` or `via: "relay"` plus many `detail fetch failed` /
  `missing fields` skips means goo-net is gating Vercel's datacenter IP and
  the relay is the weak link. The keyless `r.jina.ai` tier is rate-limited
  (401/429), so it works some days and not others. **Fix:** create a free API
  key at <https://jina.ai> and add `JINA_API_KEY` in Vercel → Settings →
  Environment Variables (no other change needed; redeploy once). The report's
  `relayKey` field says `configured` once the key is live. To use a different
  reader proxy entirely, set `GOONET_RELAY_URL` to its prefix.
- `parseMiss: true` means goo-net answered fine but the card markup changed —
  that is a parser bug in `scripts/goonet-core.mjs`, not a blockade.
- Skip reasons like `only 3 images (need 5+)` or `no/old year` mean the
  importer works and the quality gate is simply doing its job; lower the
  limits under Importer rules if you want more cars through.

**Escape hatch / one-off backfill from your own computer:** goo-net normally
serves residential connections the real page, so the terminal runner works
where Vercel is gated:

```
SUPABASE_URL="https://xxx.supabase.co" \
SUPABASE_SERVICE_ROLE_KEY="eyJ..." \
node scripts/goonet-crawl.mjs --dry-run     # show what would import
node scripts/goonet-crawl.mjs               # import for real
```

**The importer says `parseMiss` — where do I even start the parser fix?**
Copy the exact markup the importer saw, then fix the regexes against it:

1. CRM → Japan dealer stock → **"Copy parser diagnostic"** (admin). It copies
   a 2 KB sample of the markup goo-net served on the last blocked/parse-miss
   run plus its metadata (page URL, car-link count, byte count, when). The
   same data is available from `GET /api/goonet-stock?action=diag`.
2. Paste it where the fix is tracked and update `parseCard` /
   `parseListingPage` in `scripts/goonet-core.mjs` so that exact markup
   parses (title, price, year, km — whatever the gate then skips).
3. Add the trimmed sample as a fixture in `scripts/fixtures/` with
   regression tests (`scripts/goonet-core.test.mjs`), and make the whole
   suite green before shipping.
