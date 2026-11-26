# Scraper and indexing follow-up — 2026-10-09

## Baseline and preservation

This session stays on `arena/1808db0f-ar7traders-web`. The initial checkout was
clean at `d616732`, behind PR #81. It was fast-forwarded to the exact merged PR
commit `e1a4105cda2bed7a8c95e2ebd332e62a9016495d` before follow-up edits.
The hero, import receipt/fix-up UI, batch settings, honest machinery year,
purge protections and dynamic sitemap `updated_at` logic are preserved.
No additional Vercel function, database migration or production mutation was made.

## Confirmed findings and fixes

### Scraper

- GitHub scheduled machinery run **37920219168** failed with **HTTP 500**.
  The check annotations confirm the status, but the log download host was
  inaccessible from this environment. The exact production exception remains
  unverified; this patch must not be described as a proven live recovery.
- The preview scraper allowed 24 machines, with per-fetch timeouts and pacing,
  but no run deadline despite the endpoint's 60-second Vercel limit. It now has
  a 45-second deadline, caps network timeouts by the remaining budget and returns
  partial previews with a warning. Confirm these, then rerun to skip imported links.
- The nightly machinery pass previously fed a partial list of seen IDs into a
  host-wide stale sweep. A timeout or 403 could flag unrelated unchecked stock.
  Now only an individual confirmed 404/410 response flags its row. No automatic
  deletion was added. Existing stale flags are not bulk-cleared without evidence.
- Machinery job exceptions now return a structured diagnostic response.
- Scheduled workflows now check response contents: HTTP 200 with a blocked
  crawler, an unsuccessful parse, or machinery source errors is not success.
  Zero new cars alone is still valid (existing stock is not an importer failure).

### Search and content

- Previously editorial routes all initially received the homepage HTML and
  depended on JavaScript for content and canonical metadata. This is an indexing
  weakness, **not proof of Google's reason for excluding a particular URL**.
- The production build now prerenders **8 destination pages and 6 built-in
  guides**, with route-specific titles, canonical links, real text and structured
  data, served by explicit rewrites before the SPA catch-all. Market markup and
  metadata reuse the client components/data. Live stock is not frozen into HTML.
- Australia and USA now have routes, sitemap entries, documents and eligibility
  warnings. Planning transit/model/freight values reuse `site_routes` seed data
  already in `supabase/SETUP-EVERYTHING.sql`; no import duty rate was invented.
  Buyers are directed to official approval guidance before buying. A model
  example is not a promise that a particular vehicle can be imported/registered.
- Added two guides: checking export documents and comparing FOB/CIF quotations.
- `npm run promo:plan -- --guides-per-month 2` now produces a dated monthly
  editorial queue (bounded to 2–4). Review and publish via the existing CRM SEO
  desk. This does not claim unattended article publication or social posting.
- Dynamic vehicle, machinery and news sitemap lastmod behaviour is unchanged.

## Validation

- `npm test`: **passed**, including PR #81's receipt, hero/responsive, rendering,
  SEO, sitemap, machinery and function-count checks, plus new regression tests.
- Machinery scraper: **121 passed / 0 failed**; nightly machinery: **32 / 0**.
- New built-HTML checks: **14 editorial routes**, one H1/canonical each, actual
  text without JavaScript, preserved client scripts, market FAQ JSON-LD.
- `npm run seo`: all audited routes **100/100**. This is a local technical check,
  not a Google indexing/ranking score or traffic forecast.
- `npm run guard`: **18 pass / 0 warn / 0 fail**.
- Website and CRM production builds: passed. `git diff --check`: passed.
- First-load JS measured 486.58 kB raw / 143.85 kB gzip. The test budget is now
  488/145 kB, with the two additional market copy sets and two guides documented
  as the reason; no new first-load library was added. Build-only dependencies
  and generated HTML are not shipped as client JavaScript.

## Deploy and investigate next

1. Deploy this branch through the normal review/release process. No deployment
   or workflow dispatch was performed in this session.
2. Run both importer workflows once after deployment; inspect the response and
   Vercel exception log. For the machinery 500, verify the service-role environment,
   the machinery schema/migrations and the returned database error before changing
   settings. For supplier blocks, respect robots rules and use an authorised
   supplier feed/import path rather than bypassing access restrictions.
3. Inspect page source on `/destinations/australia`, `/destinations/usa` and a new
   guide: correct canonical, matching H1 and body text should precede JavaScript.
4. Follow `SEO-SUBMIT.md` for Search Console, Bing, GA4 and IndexNow owner setup.
   Submit the static and dynamic sitemaps and use URL Inspection on representative
   excluded URLs. Record Google's selected canonical, crawl date and exclusion
   reason; compare the rendered page and HTTP status with the intended URL.
5. Export Search Console Pages and Performance data (last 90 days vs previous
   period). “Discovered, not indexed”, “Crawled, not indexed”, duplicate canonical,
   noindex and not-found cases require different fixes. Low impressions and low
   CTR are also different problems. Do not infer the cause from traffic alone.
6. Allow recrawling time; neither a clean audit nor sitemap/IndexNow submission
   guarantees inclusion, rankings or visitors.

## Still open — not represented as completed

- GA4 browser event instrumentation, consent integration and measurement setup.
  A GA4 reporting property ID is not the browser's `G-...` measurement ID.
- Server-backed “watch this lot” / saved-search lead capture. Existing local
  favourites are not a notification subscription.
- Supplier-photo mirroring to owned storage, including permission checks,
  storage configuration, deduplication and safe URL/image validation.
- Owner Search Console/Bing/GA4/IndexNow configuration and verified live outcomes.
- The scheduled machinery HTTP 500's exact cause and production scraper recovery.
- Build-time HTML covers built-in editorial content, not dynamic vehicle or
  machinery detail pages or CRM-only articles. Built-in guide edits made in the
  CRM may differ from initial HTML until source data/build integration is added;
  redeploy source edits and evaluate broader SSR against Search Console evidence.

Generated reports/plans were restored rather than committing run timestamps.
