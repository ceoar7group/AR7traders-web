# SEO & Site-Integrity Audit Matrix — 2026-09-28

Scope: branch `arena/01a0e77f-ar7traders-web` (this session), builds on merged
PRs #38/#39. Every row states **what was verified and how**. "Repo" means
verified in this repository via code, tests or production build — it says
nothing about the live deployment. "Live" rows need the owner (or a session
with live network access) to confirm after deploy.

## A. Canonical host, redirects, DNS — LIVE, owner-confirmed done

| # | Item | Status | Evidence / action |
|---|------|--------|-------------------|
| A1 | Apex `https://ar7traders.com` is the canonical host, served directly | ✅ Live (owner confirmed; GSC **Test live URL** passed 2026-09-28) | Do not reverse. |
| A2 | `www.ar7traders.com` → apex 301, path+query preserved | ✅ Live (owner confirmed in Vercel; deep-link check passed) | Configured in Vercel domain settings, **not** in `vercel.json` — do not add a duplicate code redirect. |
| A3 | Both hosts stay attached in Vercel | ✅ Live | Detaching either breaks the redirect. |
| A4 | Namecheap DNS: apex A `76.76.21.21`, www CNAME `268c62e82ffdcc9e.vercel-dns-017.com.` | ✅ Live (owner confirmed) | `216.198.79.1` is merely a newer Vercel IP — not evidence of stale AWS records; don't "fix" docs that say so. |
| A5 | SPF TXT and Google-verification TXT records | ✅ Live | **Never edit or delete.** |
| A6 | GSC domain property verified; sitemap accepted | ✅ Live (15 URLs at the time) | Sitemap is now 16 URLs (added `/shipping`); Google picks it up on recrawl. Indexing for `/`, `/inventory`, `/howbuy` was requested once — do not repeat. |
| A7 | Old apex "Page with redirect" GSC result | ℹ️ Expected | Stale pre-fix crawl. Current behavior is A1/A2. Index status may take days; not guaranteed. |

## B. Contacts & claims — repo + live copy

| # | Item | Status | Evidence / action |
|---|------|--------|-------------------|
| B1 | Obsolete `info@ar7traders.com` / `+81 80 0000 7007` gone from public surfaces | ✅ Repo (contacts suite ALL PASS; live CRM page already correct) | Runtime authority is `/api/settings` — do not hard-code contacts. |
| B2 | Founder-experience claim wording + qualifier (qualifier line removed at owner direction 2026-09-29 — see B6) | ✅ Repo (`13a5fec`; claims wording asserted in pages suite) | Policy: `CLAIMS-POLICY.md`. |
| B3 | Unsubstantiated stats removed (4.9/5, 98%, 35+ countries, manufacturer partnerships, universal auction-sheet verification) | ✅ Repo (negative assertions in test suites) | Reintroduction blocked by `CLAIMS-POLICY.md` §2. |
| B4 | No `aggregateRating`, no invented `sameAs` | ✅ Repo (seo-render suite checks JSON-LD) | Rules in `CLAIMS-POLICY.md` §3. |
| B5 | No UK physical-location implication from the UK phone | ✅ Repo | No address is claimed anywhere. |
| B6 | Founder-stat prominence (owner-approved 2026-09-28; figure revised `1,200+` → **`900+`** owner-directed 2026-09-29, wording revised 2026-09-29 to "cars sold, dozens of satisfied customers including car businesses"): dominant at all three sites (hero, world section, about story grid) with gold `+`, label + qualifier secondary small print directly adjacent, qualifier unchanged | ✅ Repo | Dedicated `.founder-stat` class (shared `.stats`/`.trust-row` rules unchanged; 650px media query covered); pages suite asserts the 900+ figure + new label + qualifier in the same block at each site. Revision recorded in `CLAIMS-POLICY.md` §1. **Revised 2026-09-29 (owner direction):** qualifier line removed at all three sites; label promoted to a bold "cars sold" unit + highlighted supporting line; figure counts up once on scroll-into-view (server markup always carries the finished `900+`, plus visually hidden text; reduced-motion shows it immediately). Pages suite asserts the finished stat, the new label and the qualifier's absence at each site; client suite asserts the count arms at 0 and lands on 900. |
| B7 | `/reviews` showcase + trust card (owner-directed 2026-09-29): interactive slide-animated customer review carousel (`CUSTOMER_REVIEWS`), continuous shipment marquee, market/dealership filter grid, SEO keyword buying guide, plus "Verified Buyer Feedback" trust card and ≥24 placeholder avatars (`aria-hidden`, disclosed as placeholders, SEO-safe no `aggregateRating`) | ✅ Repo | `CLAIMS-POLICY.md` §3 updated; pages, client and seo-render suites assert the review slider, slide controls, filter tabs, SEO keywords, and absence of `aggregateRating` / star ratings. |

## C. SEO implementation — repo (commit `7452005`)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| C1 | Per-page titles/descriptions for all 16 public routes incl. `/shipping` | ✅ Repo | `src/seo.js` `PAGE_SEO`; seo-render suite. |
| C2 | Vehicle pages: `${year make model} (Stock ref)` title, fact-based description | ✅ Repo | `vehicleSeo()`; seo-render suite. |
| C3 | Vehicle JSON-LD honest: availability (sold/auction/reserved), price/currency (¥→JPY etc., offers omitted when no price), image omitted when absent | ✅ Repo | seo-render suite incl. demo units. |
| C4 | Missing vehicle → `noindex,nofollow` + "no longer listed" metadata | ✅ Repo | seo-render suite. |
| C5 | Staff routes `/crm /account /portal /studio` + legacy `#crm` → `noindex,nofollow` | ✅ Repo | seo-render suite (kept from #38/#39). |
| C6 | FAQPage JSON-LD scoped to `/faq` only (removed from static `@graph`); `FAQ_ITEMS` expanded 6 → 14 answers with a 3rd topic element (`FAQ_TOPICS`), grouped by topic on `/faq`; FAQPage JSON-LD destructures only `[q, a]` | ✅ Repo | `index.html`, `src/seo.js`, `src/main.jsx` + seo-render & pages suites. |
| C7 | Breadcrumbs + vehicle OG tags, canonical real-path | ✅ Repo | seo-render suite. |
| C8 | Sitemap 20 URLs (16 landing pages + 4 `/news/<slug>` guides), all routes exist, no staff URLs, `/shipping` priority 0.7 | ✅ Repo | `public/sitemap.xml` + seo-render & bundle-budget suites. |
| C9 | Static shell (index.html) carries semantic initial HTML + build marker `ar7-2026-09-28-seo` | ✅ Repo | seo-render suite. |
| C10 | Per-page `og:image` (+ `og:image:width/height`, `og:image:alt`, `twitter:image`) for all 16 public routes — 4-image set under `public/assets/og/` (1200×630 crops of real site photography); static shell keeps the default image with its dimensions corrected to the actual 1240×800 asset | ✅ Repo (owner-approved 2026-09-28) | seo-render suite: per-route mapping, absolute URLs, declared dimensions asserted against the actual JPEG headers. |
| C11 | Vehicle pages: `og:image`/`twitter:image` = the car's own photo via `imageFor(car.image)` (absolute), default image when absent/loading/missing, no fabricated dimensions on listing photos | ✅ Repo | seo-render suite. |
| C12 | Dynamic vehicle sitemap `/api/sitemap-vehicles.xml`: published `site_listings` only, sold/private/delisted excluded, `carRef`-based URLs, XML-escaped, `<lastmod>` only for real `updated_at`, `public, max-age=120, s-maxage=600`, honest 503 on failure (never 200 + malformed XML); `robots.txt` gained a second Sitemap line; static `sitemap.xml` still authoritative for landing pages. `japan_dealer_stock` also included where live/unpromoted. **Deploy note (2026-09-29):** the logic lives inside `api/site-content.js` (dispatched on `?sitemap=vehicles` via a `vercel.json` rewrite) because Vercel Hobby's 12-Serverless-Functions-per-deployment cap made a standalone 13th function break every deploy — production stayed on the PR #40 build until this was fixed | ✅ Repo (owner-approved 2026-09-28; deploy fixed 2026-09-29, verified serving 25 vehicle URLs on the preview deployment) | `test:sitemap-vehicles`, 28 passed / 0 failed (injected fake-db pattern). |
| C13 | Phase C1 buyer content (2026-10-01): `BuyerGuide` on `/inventory/<stock>` (5 steps, FOB/CIF plain-language note, per-vehicle `hasAuctionSheet()` condition wording, explicit customs authority duty note with no rate quoted, links to `/howbuy`, `/faq`, `/shipping`); `src/destinations.js` market guides on `/destinations` switched via `useRef` + `scrollIntoView` (transit labelled planning figure, no duty rates); addressable guides at `/news/<slug>` (`src/news-data.js` `articleSlug()` whole-word ≤90 chars, per-guide SEO + `noindex` on unknown slugs, `<a href>` cards + topic filter); `HOWBUY` exported with 4th element per step and step 05 reworded | ✅ Repo | `test:news`, `test:pages`, `test:seo`, `test:routing`, `test:sitemap-vehicles`. |
| C14 | Phase C2 brand landing depth and contextual links (2026-10-01): known `?make=<Brand>` filters get brand-specific title/description/canonical/`og:url` and `Home → Inventory → <Brand>` breadcrumbs; `/inventory` shows a current-result-count brand context card, existing logo, qualified Japan sourcing note, and links back to all stock, `/brands` and `/howbuy`; vehicle details link up to 3 same-make/body published listings plus all stock for that make; each `/news/<slug>` guide footer links to destinations, shipping, tools, buying instructions and FAQ alongside its live-stock block | ✅ Repo | `test:seo` and `test:pages`; explicit checks cover Toyota SEO/context and Rolls-Royce related stock. |
| C15 | Phase C3 rich-result completeness (2026-10-01): known `/news/<slug>` guides emit `Article` JSON-LD from `NEWS` content (headline, SEO description, guide image/canonical URL, organization author/publisher/logo, section); the script is removed on `/news`, unknown slugs and all non-guide routes; vehicle detail and brand-filtered inventory routes use `Home → Inventory → Vehicle/Brand`, while guide breadcrumbs remain `Home → News & Guides → Article` | ✅ Repo | `test:seo` checks Article fields/removal and 3-level vehicle, brand and guide `BreadcrumbList` objects. |

## D. Settings API security — repo (commit `1b1d649`)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| D1 | Anonymous `GET /api/settings` → public allowlist only (contact + exchange-rate keys) | ✅ Repo | `test:settings` 28/28. |
| D2 | Importer/operational keys (goonet_*, defaults) unreadable anonymously | ✅ Repo | test seeds a private key and asserts absence. |
| D3 | Authed GET returns full set, `private, no-store`; bad token = 401 (no silent downgrade) | ✅ Repo | test:settings. |
| D4 | PATCH: auth + `settings.write`, key allowlist, value validation (type/length/email) | ✅ Repo | test:settings. |
| D5 | CRM sends Bearer on both settings reads and surfaces load errors | ✅ Repo (build:crm ✓, client suite ✓) | — |
| D6 | Public site needs nothing beyond the allowlist (currency + contact keys) | ✅ Repo (currency suite ALL PASS) | — |

## E. Goo-net importer — repo (commit `a7675de`)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| E1 | Body type derived from curated `MODEL_MAP` (real pages have no ボディタイプ row); unknown → skipped honestly | ✅ Repo | core suite 158/158. |
| E2 | Detail fetches never relay-replaced (`purpose:'detail'`); merge only real detail pages | ✅ Repo | core + sync suites. |
| E3 | Full import path green: direct, relay-rescued, slow-crawl and title-less card scenarios import | ✅ Repo | sync suite 41/41 (was 31/41). |
| E4 | Photo/quality gates, safe delisting, bookmark behaviour, permission checks, budgets, relay safeguards | ✅ Repo, unchanged | same assertions as before. |
| E5 | Production stock sync while testing | ⛔ Not done (correctly) | No production sync or inventory mutation was run in this session. |
| E6 | Scheduler configured as documented | ✅ Repo (2026-09-28) | `.github/workflows/goonet-sync.yml` present: daily `03:00 UTC` cron calling `/api/goonet-sync` per `GOONET-SYNC.md` §2. Owner-side secrets (`GOONET_SYNC_KEY`) are not verifiable from the repo. First production run remains owner-gated (Task E of the handoff). |

## F. Build & test suites — repo (final Phase C2/C3/D1 verification, 2026-10-01)

`npm test`: **24 suites, 1,999 assertions passed, 0 failed.** The scripts that
print only `ALL PASS` are counted from their individual successful assertion
lines in the run log. `test:goonet` and `test:imported` totals include each
sub-suite shown below.

| Suite | Final assertions |
|-------|-----------------|
| `test:currency` (logic + render) | 45 passed, 0 failed |
| `test:inventory` | 23 passed, 0 failed |
| `test:routing` | 50 passed, 0 failed |
| `test:news` | 64 passed, 0 failed |
| `test:contacts` | 65 passed, 0 failed |
| `test:settings` | 28 passed, 0 failed |
| `test:authz` | 134 passed, 0 failed |
| `test:leads` | 31 passed, 0 failed |
| `test:seo` (`scripts/seo-render.test.mjs`) | 264 passed, 0 failed |
| `test:sitemap-vehicles` | 52 passed, 0 failed |
| `test:sync` | 18 passed, 0 failed |
| `test:goonet` (core 371 + seed 54 + sync 55 + assistant 84 + repair 30) | 594 passed, 0 failed |
| `test:imported` (map 40 + render 33) | 73 passed, 0 failed |
| `test:functions` | 1 cap assertion passed; 12/12 functions |
| `test:crm` | 57 passed, 0 failed |
| `test:crm-theme` | 46 passed, 0 failed |
| `test:header` | 38 passed, 0 failed |
| `test:pages` | 197 passed, 0 failed |
| `test:client` | 87 passed, 0 failed |
| `test:copy` | 12 passed, 0 failed |
| `test:assets` | 13 passed, 0 failed |
| `test:image-fallback` | 43 passed, 0 failed |
| `test:bundle` | 51 passed, 0 failed; first-load JS 414.80 kB raw / 121.48 kB gzip; CSS 151.22 kB raw / 29.84 kB gzip; CRM, customer portal, network and reviews JS/CSS remain lazy-loaded |
| `test:car-alt` | 13 passed, 0 failed |
| `npm run build` / `npm run build:crm` | both production builds pass |

## G. Post-deploy verification — owner, after merging this branch

Run each and record results. If anything fails, roll back (see H).

```sh
curl -sS -I https://ar7traders.com/                                      # expect 200, no Location
curl -sS -I https://www.ar7traders.com/                                  # expect 301 → apex
curl -sS https://ar7traders.com/ | grep -c 'ar7-2026-09-28-seo'         # ≥1 (build marker)
curl -sS https://ar7traders.com/sitemap.xml -o /tmp/ar7-sitemap.xml
grep -c '<loc>' /tmp/ar7-sitemap.xml                                    # exactly 20
grep -c '<loc>https://ar7traders.com/news/' /tmp/ar7-sitemap.xml       # exactly 4 guide URLs
grep -F '<loc>https://ar7traders.com/news/auction-sheet-decoded-what-r-a-and-4-5-really-mean</loc>' /tmp/ar7-sitemap.xml
curl -sS -L -o /dev/null -w 'guide HTTP %{http_code}\n' https://ar7traders.com/news/auction-sheet-decoded-what-r-a-and-4-5-really-mean
curl -sS -L -o /dev/null -w 'Toyota inventory HTTP %{http_code}\n' 'https://ar7traders.com/inventory?make=Toyota'
curl -sS -L -o /dev/null -w 'vehicle detail HTTP %{http_code}\n' https://ar7traders.com/inventory/AR7-26001
curl -sS -o /tmp/ar7-sitemap-vehicles.xml -w 'vehicle sitemap HTTP %{http_code}\n' https://ar7traders.com/api/sitemap-vehicles.xml
grep -c '<loc>' /tmp/ar7-sitemap-vehicles.xml                             # live published-vehicle URL count
grep -q '</urlset>' /tmp/ar7-sitemap-vehicles.xml && echo 'vehicle sitemap XML closes correctly'
curl -sS -I https://ar7traders.com/inventory/DOES-NOT-EXIST             # expect the app's missing-stock response
curl -sS https://ar7traders.com/api/settings | head -c 300                # public keys only
```

Then in a browser: spot-check `/`, `/inventory`, `/inventory?make=Toyota`,
`/inventory/AR7-26001`, the guide above, `/shipping` and `/faq`; confirm related
stock and guide links work. Inspect the guide's Article JSON-LD and the vehicle
and brand BreadcrumbList in the rendered DOM; confirm `/crm` loads and its
Website-settings form shows values (now authed) with no console errors. In GSC,
**URL Inspection → live test** one vehicle page and `/faq` to confirm the new
metadata is served; do not re-submit indexing requests for pages already
requested.

### §G results — 2026-09-28, session `arena/01a0e7ed-ar7traders-web`

**Direct network from this sandbox is blocked at TLS.** `curl` to
`https://ar7traders.com/` and `https://www.ar7traders.com/` both fail during
the handshake with `SSL_ERROR_SYSCALL` (unrelated hosts fail the same way —
all outbound TLS from the sandbox is blocked). Every §G **curl** check below
is therefore **not tested (no network access)**; no HTTP status, redirect or
header claim is made. Content-level checks were repeated through a separate
page-fetch service (it executes JavaScript and returns page content only — it
does **not** expose status codes, redirect chains, headers or console output):

| # | §G check | Result | Evidence / notes |
|---|----------|--------|------------------|
| G1 | `curl -I https://ar7traders.com/` → 200, no Location | **not tested (no network access)** | Sandbox TLS blocked. The page-fetch service does render `https://ar7traders.com/` successfully (status not observable through it). |
| G2 | `curl -I https://www.ar7traders.com/` → 301 → apex | **not tested (no network access)** — indirect evidence only | Fetching `https://www.ar7traders.com/inventory/AR7-26001?source=seo` via the page-fetch service ends at `https://ar7traders.com/inventory/AR7-26001?source=seo` — apex host, path and query preserved. Consistent with A2; the 301 itself was not observed. |
| G3 | build marker `ar7-2026-09-28-seo` in live HTML | **not tested (no network access)** | The marker lives in `<head>`; the page-fetch service returns rendered body only. The marker is present in repo and production build (C9). |
| G4 | sitemap `<loc>` count = 16 | ✅ content-level (2026-09-28, page-fetch) | Live `sitemap.xml` lists exactly 16 `<loc>` entries including `/shipping`, with no staff routes. |
| G5 | 404 on unknown path | **not tested (no network access)** — content checked, status not observable | A path outside the rewrites (`/this-path-should-404-2026`) serves the branded 404 page ("Page not found — AR7 Traders"). `/inventory/DOES-NOT-EXIST` is **covered by the `vercel.json` rewrite** to the SPA shell, so its expected live status is 200 + the honest "no longer listed" `noindex` page (C4), *not* 404 — the §G command as written will likely show 200 there. Owner: confirm the actual status from an unblocked network; no redirect/DNS change is implied either way. |
| G6 | `/api/settings` public keys only | ✅ content-level (2026-09-28, page-fetch) | Anonymous response contains exactly `contact_email, contact_phone, contact_address, whatsapp_number, whatsapp_message, enquiry_inbox, exchange_rates` with the confirmed public values — no importer/operational keys. |
| G7 | Browser spot-check `/`, `/inventory`, one vehicle page, `/shipping`, `/faq` | ✅ content-level (2026-09-28, page-fetch renders JS) | All five render with the correct per-page titles; `/inventory` lists 29 vehicles in its two groups; `/inventory/AR7-26001` shows the correct detail page ("2023 Rolls-Royce Ghost (Stock AR7-26001)"); `/shipping` and `/faq` match `PAGE_SEO`. Not a human browser session — no console/network panel observed. |
| G8 | `/crm` Website-settings form shows values (sign-in) | **not tested** | Requires the owner's credentials; only the CRM shell load was observed. If the form is empty, sign out/in first (§H.3). |
| G9 | GSC live test / indexing | **not tested (owner-only)** | No GSC action was taken; no indexing requests submitted or repeated. |

Nothing failed, so no rollback (§H) was triggered; nothing was redeployed and
no DNS or redirect settings were touched.

### §G results — 2026-09-29, session `arena/01a0ee3b-ar7traders-web` (post-merge PR #42, production verification)

**Scope:** PR #42 (commit f0aa457) already merged to main — deployment count back to 12, production green. This session adds owner-directed wording revision (900+ cars sold, dozens of satisfied customers including car businesses), reviews global placeholder grid, function-count guard test, and corrected comment in api/site-content.js. Verification performed after merge on PRODUCTION (https://ar7traders.com) using page-fetch service; direct TLS curl still blocked in sandbox (same SSL_ERROR_SYSCALL as 2026-09-28), so status codes, headers, redirects not observable — content-level only, honest.

| # | Check | Result | Evidence / notes |
|---|-------|--------|------------------|
| G10 | `/api/sitemap-vehicles.xml` returns valid XML with vehicle URLs | ✅ content-level (2026-09-29, page-fetch) | Fetching https://ar7traders.com/api/sitemap-vehicles.xml via page-fetch returns XML body (page-fetch strips tags in markdown view, but URLs visible). Counted 29 `<loc>` entries: AR7-26001..AR7-26012 (12) + 17 Japan-stock-derived rows (0710232A30260801W001 etc). Valid urlset, starts with `<?xml`, ends with `</urlset>`. No sold/private/delisted. Cache header not observable via page-fetch. |
| G11 | `/api/site-content?entity=listings` still works (no sitemap regression) | ✅ content-level (2026-09-29, page-fetch) | Anonymous GET returns JSON array of listings (first row AR7-26001 Rolls-Royce Ghost, published true). No 500, no empty. Proves sitemap dispatch on ?sitemap=vehicles did not break listings branch. |
| G12 | homepage shows 900+ with qualifier | ✅ content-level (2026-09-29, page-fetch) | https://ar7traders.com/ renders "900+ vehicles sold across our founder’s automotive career" (production still on previous wording until this PR deploys) + qualifier "Experience gained through various suppliers; these are not AR7 Traders sales totals." After this PR deploys, wording will be "cars sold, dozens of satisfied customers including car businesses." with same qualifier — pages suite asserts it. |
| G13 | /reviews shows trust card | ✅ content-level (2026-09-29, page-fetch) | https://ar7traders.com/reviews renders "Verified Buyer Feedback", "collecting genuine reviews", "placeholders, not reviewers", aria-hidden initials. No star ratings. New grid (≥24 avatars) will appear after this PR deploys — repo verified, SEO-safe (no aggregateRating). |
| G14 | /contact hero image is a self-hosted, web-sized WebP | ✅ repo (2026-10-01, image pass) | public/assets/japanese-car-auction-inspection-shipping-2.webp is 1000×643 (1400×900 JPEG before the 2026-10 image pass; page banners are now capped at 1000 px, card photos at 820 px). Used on /contact hero. `scripts/asset-refs.test.mjs` fails if the file is missing or `public/` outgrows its 2.5 MB budget. |
| G15 | og:image meta tags present on /, /inventory, /shipping | ✅ repo (seo-render suite) + content-level partial | seo-render.test.mjs asserts per-route og:image mapping (absolute URLs, width/height, alt, twitter:image) for all 16 routes including /shipping. Page-fetch service returns rendered body only, not `<head>`, so live og:image tags not observable via it — repo build is source of truth. Live titles for /, /inventory, /shipping match PAGE_SEO (content-level check 2026-09-29). |
| G16 | function count ≤12 | ✅ repo (2026-09-29, function-count test) | `node scripts/function-count.test.mjs` lists 12 files: approvals, crm, customer-admin, goonet-stock, goonet-sync, hr, leads, my-account, settings, site-content, site-sync, team (excluding _perm, _supabase). Count 12 ≤ 12 — Vercel Hobby cap respected. |

Honesty note: No curl status/redirect/header checks claimed as passing because sandbox TLS to ar7traders.com is blocked (SSL_ERROR_SYSCALL). All live checks above are content-level via page-fetch, which executes JS and returns body only — it does NOT expose status codes, headers, console, or redirect chains. No GSC action taken.

## H. Rollback

Every change is behind individually revertable commits:

1. **Whole session:** `git revert a7675de 1b1d649 7452005 a2e5286 13a5fec 0da8b06`
   (or redeploy the previous Vercel deployment from the Vercel dashboard —
   "Instant Rollback" needs no git action) and rebuild.
2. **SEO only:** revert `7452005` — `src/seo.js`, `index.html`, `sitemap.xml`,
   `src/main.jsx` revert together; the site falls back to the previous
   metadata. `/shipping` sitemap entry disappears with it.
3. **Settings API only:** revert `1b1d649`. No data is migrated — the table and
   seed values are unchanged — so a revert is safe. If the CRM shows empty
   settings forms after deploy, the token refresh (sign out/in) fixes it; it is
   not a reason to revert.
4. **Goo-net only:** revert `a7675de`. The importer returns to skipping cars
   with `missing fields: body` (the pre-existing behavior); nothing else
   changes and no inventory data is affected.
5. **Host/DNS:** never roll back A2/A3/A5 (see §A) — those predate this session
   and are correct.
