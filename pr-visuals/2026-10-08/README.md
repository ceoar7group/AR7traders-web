# Market pages, the import receipt, and the honest year — 2026-10-08

Evidence for the 2026-10-08 pass: six indexable market landing pages
(`/destinations/<market>`), the machinery import receipt that answers
"where did the machines I selected go?", and the end of the fabricated
model year.

Captured with `scripts/page-shots.mjs` against `npm run preview` (the built
`dist/`), one fresh page per viewport, storage cleared, `prefers-reduced-motion:
reduce`, `deviceScaleFactor 1`. Rectangles and head tags were read **before**
any full-page capture — a full-page capture resizes the viewport, so measuring
after it reports the wrong numbers. Machine-readable facts:
`page-measurements.json` in this folder. The hero work from the previous pass
keeps its own folder, `pr-visuals/2026-10-07/`, with its harness
(`scripts/hero-measure.mjs`) and measurements.

Known capture limit: full-page shots (`*-full.jpg`) show below-the-fold
sections that reveal on scroll at opacity 0, because a single timed grab cannot
fire every IntersectionObserver. Judgement by eye was done on those shots for
content order and on the viewport shots for geometry; every geometry claim
below is a measured number, not an eyeballed one.

## Before / after — market pages (Task 3, priority 2)

| what | before | after (measured) |
| --- | --- | --- |
| URL per market | one picker on `/destinations`; six markets, zero indexable URLs | 6 URLs in `public/sitemap.xml` (43 locs total, was 37), one canonical each |
| H1 | "Where are we shipping?" (the hub's) | `Import a used car from Japan to Kenya` — 1 H1 per market page at all 3 viewports |
| Route facts | hidden behind a `<select>` | 4 fact tiles on the page (port, planning transit, models, Japan loading ports) |
| Documents | prose paragraph, duplicated on the hub | per-market pack (Kenya 3 items, UK 4) + named authority, one owner (`src/destination-page.jsx`) |
| FAQ | none | 5 visible questions per market, mirrored in `FAQPage` JSON-LD (5 questions measured in the DOM) |
| Structured data | hub breadcrumb only | `BreadcrumbList` (3 crumbs) + `FAQPage` per market, asserted in `scripts/seo-render.test.mjs` |
| Live stock | hub RelatedStock only | "STOCK THIS ROUTE CARRIES" matched to the route's models (Kenya: Harrier/Prado/Prado TX) + 9 inventory links on the page |
| Hub copy | the guide rendered inline *and* nowhere else | hub links out to the six pages; the inline duplicate is deleted (no two URLs carry the same paragraphs) |
| Keyword routing | `import car to kenya` → `/destinations` | → `/destinations/kenya` (two-market queries still route to the hub); pinned in `scripts/tools.test.mjs` |
| `npm run seo:brief` | "Audit is clean. Add content and keep publishing." + "add a destination landing page per market (Kenya, UAE, Pakistan)" | "Audit is clean across 37 route(s), including 6 market landing pages…" + a freshness bullet that names only markets still missing a page |
| `npm run seo` | 100/100 on 11 routes | 100/100 on 17 routes (6 markets + `/destinations/unknown-market`, which is `noindex` and canonicals to the hub) |

Measured head tags (from `page-measurements.json`, client-rendered):

| route | title | description | canonical | H1s | overflow |
| --- | ---: | ---: | --- | ---: | --- |
| `/destinations/kenya` | 47 ch | 138 ch | `…/destinations/kenya` | 1 | false (1440/1440, 768/768, 390/390) |
| `/destinations/united-kingdom` | 56 ch | 154 ch | `…/destinations/united-kingdom` | 1 | false |
| `/destinations` (hub) | 45 ch | 127 ch | `…/destinations` | 1 | false |

Budgets the audit measures: title ≤ 60 ch, description 70–165 ch. Kenya's
description drops the third model rather than exceed 165; the UK's keeps two.
No duty percentage or tax rate appears in any market page's copy (asserted in
`scripts/pages-render.test.jsx` on the tag-stripped text).

## Before / after — the import receipt (Task 2)

| what | before | after |
| --- | --- | --- |
| Confirm notice | "…selected machines are published on the website", printed from `imported`/`updated`/`rePriced` alone — true even when nothing was written | `describeImportOutcome()` receipt: `2 added of 3 selected`, "1 of the selection did NOT make it", one `<li>` per refused row **by name with the server's reason** (`data-kind` ok/partial/none) |
| A 422 refusal | bare error string; per-row reasons thrown away | `call()` carries `err.body`; a wholly refused confirm renders as a `data-kind="none"` receipt with every reason |
| Refused rows on screen | preview cleared either way | preview kept; the inline fix-up (type/brand/model) opens on **only** the refused candidate (`refusedCandidateKeys`, 4 pinned cases) |
| Refusals identifiable | every new row shared the placeholder `AR7-MC-NEW` | `planImport` now returns `name`/`brand`/`model` with each `invalid` row, so the receipt says "Sany SY215C" |
| Per-run count | hard-coded 6 in the API default, CRM always asked for ≤24 | `machinery_scraper_batch` default `'8'`, CRM input 1–24 remembered in `localStorage['ar7.machinery.scraperBatch']`, sent as `limit`, "Make default" PATCHes `/api/settings` for `settings.write` staff; server clamps to `MAX_SCRAPER_MACHINES = 24` |
| Desk honesty | no published count anywhere | "1 of 2 desk machines are published on the website — 1 hidden by a person" above the import panel |
| Stale machines | `step=stale` flags, nothing else | `purgeStale` archives unpublished rows missing ≥ N days; delete only removes rows a person already parked or twice-stale rows; published rows never touched; every step audited |
| Model year | `product.year \|\| new Date().getFullYear()` — a fabricated year on a public listing | `null`; the preview warns "states no model year", `validateRow` accepts null, the site renders "Year not stated" / "hours on request"; a stated year/hours is still read (`Year 2019` → 2019, `6,800 hours` → 6800) |

End-to-end in `scripts/machinery-scraper.test.mjs` (113 assertions): preview →
confirm against the fixture world; every accepted candidate is a published row,
every refused one appears in `invalid` **and** in the rendered receipt
(`scripts/machinery-receipt.test.jsx`, 88 assertions, non-demo, real planner as
the stub server).

## Test and build ledger (this pass)

| command | result |
| --- | --- |
| `npm test` (all suites) | exit 0 |
| `test:machinery-scraper` | 113 / 0 |
| `test:machinery-receipt` (new) | 88 / 0 |
| `test:machinery-source` | 67 / 0 |
| `test:settings` | 59 / 0 |
| `test:crm` | 158 / 0 |
| `test:pages` | 348 / 0 |
| `test:client` | 151 / 0 |
| `test:routing`, `test:tools`, `test:seo-render` | ALL PASS |
| `test:bundle` | 59 / 0 — first-load JS 481.36 kB raw / 142.07 kB gzip; budget ratcheted 479→482 raw / 142→143 gzip **with the reason written at the assertion** (market copy is eager because `src/seo.js` reads it for titles/descriptions/FAQPage; the page markup itself is a lazy route chunk, asserted not preloaded) |
| `test:functions` | 12 ≤ 12 (still exactly twelve counted Vercel functions) |
| `npm run seo` | 100/100 across 17 routes |
| `npm run guard` | 18 pass · 0 warn · 0 fail |
| `npm run build` / `build:crm` | ✓ / ✓ |

## Still open (not claimed done)

* Owner env actions: `GOOGLE_SERVICE_ACCOUNT_JSON`, `GSC_SITE_URL`,
  `GA4_PROPERTY_ID`, `AR7_INDEXNOW_KEY` — runbook in `SEO-SUBMIT.md` §2026-10-08.
* GA4 events (`quote_open`, `whatsapp_click`, `newsletter_signup`,
  `vehicle_view`) and the "watch this lot" capture: not built.
* Mirroring supplier photos off `picture1.goo-net.com` to own storage: not built
  (the sandbox cannot load that host, so the hero photo renders blank here — an
  environment limit, not a page bug).
* Guide cadence wired into `npm run promo:*`: not built; `seo:brief` still lists
  it as the next manual lever.
* `site_routes` lists Australia and the USA; they have no `DEST` copy, so they
  have no page — `seo:brief` will name them the moment a market exists in `DEST`
  without one.
