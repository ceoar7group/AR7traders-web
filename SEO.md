# SEO: how it works here, and how to drive it

**Current state: `npm run seo` reports 100/100, 0 failures, 0 warnings** across all
31 audited routes plus the shipped static shell. `npm test` (which now includes
`test:seo-audit`) passes end to end.

Traffic comes from **crawlable pages**, not from meta tags. Everything below
exists to make sure that when somebody searches *"used Toyota Land Cruiser for
export"* or *"used excavator for sale to Pakistan"*, there is a real page on
this site to land on — and that the owner can check that claim in ten seconds.

## 1. The page structure

| URL | What it is | Where its metadata comes from |
| --- | --- | --- |
| `/cars/<make>` | Brand landing page (`/cars/toyota`) | `carsLandingSeo()` in `src/seo.js` |
| `/cars/<make>/<model>` | Model landing page (`/cars/toyota/land-cruiser`) | same, model branch |
| `/machinery/<type>` | Machinery type page (`/machinery/excavators`) | `MACHINERY_SEO` in `src/seo.js` |
| `/inventory/<ref>` | One vehicle | `vehicleSeo()` + `Car`/`Offer` JSON-LD |
| `/news/<slug>` | Guide / article | `articleSeo()` + `Article` JSON-LD |
| everything else | Fixed routes | `PAGE_SEO` / `PAGE_OG` |

Rules that keep it working:

- **One canonical URL per thing.** A brand view canonicalises to
  `/cars/toyota`, never to `/inventory?make=Toyota`. `inventoryHref()` in
  `src/routing.js` is the only place brand links are built, so a new link
  cannot accidentally reintroduce the query-string form.
- **Nothing indexable may carry noindex.** Staff and tool routes (`/crm`,
  `/account`, `/portal`, `/studio`, `/seo`) are noindex *and* disallowed in
  `public/robots.txt`. The audit fails if those two ever disagree.
- **No invented facts.** Sitemap `lastmod` values come from row timestamps.
  Landing pages appear in the vehicle sitemap only when stock exists.

## 2. The sitemaps

- `public/sitemap.xml` — the 25 fixed pages (hand-edited, pinned by
  `scripts/seo-render.test.mjs`). Add a page here when you add a route.
- `/api/sitemap-vehicles.xml` — generated per request from `site_listings` and
  `japan_dealer_stock`. It leads with derived `/cars/<make>` and
  `/cars/<make>/<model>` URLs, then every vehicle detail URL. Visibility rules
  are identical to the public pages, so it can never advertise hidden stock.
- `public/robots.txt` declares both. Never add a third sitemap file without
  checking the 12-function Vercel cap (`scripts/function-count.test.mjs`).

## 3. The SEO agents (three, each with one job)

| Agent | Command | Does |
| --- | --- | --- |
| **Auditor** | `npm run seo` | Audits every route, the built shell, sitemap and robots. Reads only. |
| **Fixer** | `npm run seo:fix` | Applies the safe, deterministic crawl fixes. |
| **Backlinks** | `npm run seo:backlinks` | Prospect list, outreach copy, link verification. |
| **Keywords** | `npm run seo:keywords` | Researches what buyers type and routes each query to the page that should answer it. |
| Reporting | `npm run seo:brief`, `npm run seo:connect`, `npm run seo:live` | Work brief, connector status, live-site check. |
| Submission | `npm run seo:indexnow` | Pushes changed URLs to Bing and Yandex. |

The audit and the fix are **deliberately separate commands**. `npm run seo` never
writes to the site; `npm run seo:fix` only makes changes it can prove are
correct (a missing sitemap declaration, a machinery type page absent from the
sitemap, a missing IndexNow key file). Everything else it reports rather than
guesses.

### What the backlink agent can and cannot do

It **can**: keep a prioritised prospect list built from the parties AR7 actually
trades with — freight forwarders, port agents, customs brokers, inspection
companies, supplier factories, insurers, chambers of commerce — write the
outreach for each, track what was sent, and verify links that go live.

It **cannot** create a backlink. A backlink is somebody else deciding to link to
you. Any tool that claims otherwise is buying links or posting spam, and both
cost more traffic than they gain. `npm run seo:backlinks -- --plan` writes the
plan, the outreach template and the target list; the sending is a human's job.

### Keyword research: what to write next

`npm run seo` checks that a page *covers* the words we chose. `npm run seo:keywords`
chooses them, from the site's own catalogue — every make and body we list, every
machine type on the China desk, every destination lane we quote and every question
the FAQ answers — crossed with the modifiers buyers actually type.

```bash
npm run seo:keywords           # plan + KEYWORDS.md + keywords-plan.json
npm run seo:keywords -- --live # also ask the free autocomplete endpoints
npm run seo:keywords -- --print
```

The live pass uses **free, key-less** suggestion endpoints (Google, Bing,
DuckDuckGo). It is honest about its limits: those endpoints describe the *shape*
of demand, and they say nothing about volume or difficulty. Volume comes from a
data source — Search Console, Bing Webmaster Tools or Keyword Planner — so run
`npm run seo:connect` to see which the agent can already read.

`KEYWORDS.md` is the reviewed copy (committed); `keywords-plan.json` is
regenerated each run and gitignored. When the plan file is present the auditor
picks up two already-covered head terms per route, so the audit keeps checking
the researched words instead of a hard-coded pair; head terms the plan marks as
*not yet covered* stay in the plan's gap list as work to do, rather than warning
on every run.

### The auditor and fixer in detail

```bash
npm run seo            # full audit → seo-report.md + seo-report.json (exit 1 on a failure)
npm run seo:fix        # safe, deterministic crawl fixes
npm run seo:brief      # prioritised work list, highest impact first
npm run seo:connect    # connector status and setup instructions
npm run seo:indexnow   # submit changed URLs to Bing + Yandex
npm run seo:live       # audit the deployed site over HTTP
```

The agent audits two things separately, and says so in the report:

1. **Head checks per route**, by driving the real `src/seo.js` module inside a
   jsdom document — exactly what the browser produces.
2. **Body checks** (H1, images, internal links) against the built
   `dist/index.html` — exactly what a crawler that does not run JavaScript sees.

`npm run seo` exits non-zero when any route has a failure, so it can gate a
deploy. The generated `seo-report.*` files are gitignored: regenerate them.

## 3c. Languages and search

The site ships a language switcher (14 languages, including Arabic, Pashto,
Urdu, French, German, Russian and Chinese — `src/i18n.js`). Two deliberate
decisions:

- **The non-English dictionaries are a lazy chunk** (~12 kB gzip) that loads only
  when a visitor picks a language. Shipping thirteen dictionaries to everybody
  cost first-load weight for no benefit.
- **Translated views are not separate indexable pages.** The switcher updates
  `<html lang>` and `<html dir>` and stores the choice, but the canonical, the
  sitemap and the structured data stay on the English URLs. A half-translated
  page ranking over the real catalogue page would cost traffic, not gain it.
  When a market justifies a properly translated, hosted section, it becomes its
  own set of URLs with `hreflang` — that is a deliberate next step, not
  something to fake with a client-side switch.

## 3d. Promotions as an SEO surface

The promotion bar and the campaign pages are ways to concentrate attention on a
page that already ranks, and they are built so they cannot damage the index:

- The bar's link is a **real internal link** with a crawlable `href`, so the
  campaign target gets a site-wide link while the campaign runs.
- `/promo.json`, `/promo-plan.json` and `/guardian-report.json` are deliberately
  **not** in the sitemap and carry no SEO value — they are operational files.
  `robots.txt` leaves them crawlable on purpose: hiding them would be pretending
  they are not there, and they contain nothing private.
- A campaign is never given its own URL. One target page, one canonical, and the
  campaign is a link to it — the alternative, a `?promo=` variant per campaign,
  is how a site manufactures duplicate content out of its own marketing.
- The machinery facets (make, FOB band, year) and the inventory facets (make,
  model, body, price band, year, mileage, fuel, gearbox, steering, sort) are
  **client-side filters, not URL variants**, for the same reason. Beforward
  publishes crawlable filter URLs (`/stocklist/make=1/sortkey=n/`) because
  their catalogue is tens of thousands of vehicles; AR7's is dozens, and dozens
  do not justify twenty duplicate URLs. The one filter that *does* write the
  URL is make — because `/inventory?make=Toyota` and `/cars/toyota` are real
  landing pages with their own copy, and those stay crawlable.

### Machine pages

Each machine has its own URL — `/machinery/<type>/<REF>` — with its own title
("Doosan DX300LC-9C excavator for export from China | AR7 Traders"), a
description carrying the model, the year, the hours and the indicative FOB
price, a canonical to itself, Product structured data (availability stated as
pre-order, never InStock, because the unit is sourced to order) and one entry in
`public/sitemap.xml`. When a price offer is live the structured data carries the
discounted figure and its end date, so the markup matches what the page shows.

```
npm run seo:fix    # adds any missing machine URL to the sitemap
npm run seo        # audits the type pages and the shell
```

## 4. Connectors

| Connector | Env vars | What you get | Where to get it |
| --- | --- | --- | --- |
| Google Search Console | `GOOGLE_SERVICE_ACCOUNT_JSON`, `GSC_SITE_URL` | Real queries, impressions, clicks, coverage errors | Google Cloud service account + add its email as a user of the property |
| Bing Webmaster Tools | `BING_WEBMASTER_API_KEY` | Bing/Yahoo index coverage and keyword data | Bing Webmaster Tools → Settings → API access |
| Google Analytics 4 | `GA4_PROPERTY_ID` (+ the same service account) | Organic traffic and landing pages | GA4 Admin → property ID; grant the service account Viewer |
| IndexNow | `AR7_INDEXNOW_KEY` (optional) | Instant re-crawl on Bing/Yandex | None — `npm run seo:fix` generates the key and publishes the file |
| In-site SEO desk | — | The same audit, in the browser, for anyone on the team | Open `/seo` |

There are no credentials in this repository and none should ever be added.
The agent reads environment variables only; `npm run seo:connect` prints which
ones are set and what each unlocks, and never prints secret values.

## 5. The in-site SEO desk (`/seo`)

A staff route (noindex, linked from the More menu next to the CRM). It runs
`src/seo-audit.js` against the live document, fetches the real `/sitemap.xml`
and `/robots.txt`, shows the score with the evidence behind every check, and
lists the agent commands with copy buttons. It exists so the SEO work can be
verified by the owner instead of being taken on trust.

## 6. What still needs a human

The agent fixes crawl mechanics. These need judgement, and `npm run seo:brief`
lists them every time:

- **Photos you have rights to.** Supplier photos, manufacturer press assets or
  licensed stock — never another dealer's watermarked listing image.
- **Destination landing pages** per market actually served (Kenya, UAE,
  Pakistan, Tanzania) with real freight and duty guidance.
- **Guides** answering real queries ("how to import a car to Kenya", "RoRo vs
  container to Mombasa").
- **Links.** Supplier pages, port agents, freight partners, chambers of
  commerce. No on-page change substitutes for this.

## 7. Housekeeping

- Any budget ratchet (`scripts/bundle-budget.test.mjs`,
  `scripts/asset-refs.test.mjs`) needs a dated comment saying what was measured
  and why the number moved.
- After adding a fixed route: add it to `PAGES` in `src/routing.js`, give it a
  `PAGE_SEO` entry, add the URL to `public/sitemap.xml`, update the pin in
  `scripts/seo-render.test.mjs`, and add a marker to `ROUTES` in
  `scripts/pages-render.test.jsx` (that file is also the list of routes a
  sitemap URL is allowed to point at).
- Then run `npm run seo` and `npm test`.
