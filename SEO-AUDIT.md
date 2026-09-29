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
| B2 | Founder-experience claim wording + qualifier | ✅ Repo (`13a5fec`; claims wording asserted in pages suite) | Policy: `CLAIMS-POLICY.md`. |
| B3 | Unsubstantiated stats removed (4.9/5, 98%, 35+ countries, manufacturer partnerships, universal auction-sheet verification) | ✅ Repo (negative assertions in test suites) | Reintroduction blocked by `CLAIMS-POLICY.md` §2. |
| B4 | No `aggregateRating`, no invented `sameAs` | ✅ Repo (seo-render suite checks JSON-LD) | Rules in `CLAIMS-POLICY.md` §3. |
| B5 | No UK physical-location implication from the UK phone | ✅ Repo | No address is claimed anywhere. |
| B6 | Founder-stat prominence (owner-approved 2026-09-28; figure revised `1,200+` → **`900+`** owner-directed 2026-09-29): dominant at all three sites (hero, world section, about story grid) with gold `+`, label + qualifier secondary small print directly adjacent, wording untouched | ✅ Repo | Dedicated `.founder-stat` class (shared `.stats`/`.trust-row` rules unchanged; 650px media query covered); pages suite asserts the 900+ figure + qualifier in the same block at each site. Revision recorded in `CLAIMS-POLICY.md` §1. |
| B7 | `/reviews` trust card: "Verified Buyer Feedback" headline, decorative placeholder initials (`aria-hidden`, disclosed in copy as placeholders), transparent reviews-being-gathered notice — no invented testimonials or ratings | ✅ Repo | `CLAIMS-POLICY.md` §3 updated; pages suite asserts headline + placeholder disclosure and still blocks fictional testimonials/star ratings. |

## C. SEO implementation — repo (commit `7452005`)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| C1 | Per-page titles/descriptions for all 16 public routes incl. `/shipping` | ✅ Repo | `src/seo.js` `PAGE_SEO`; seo-render suite. |
| C2 | Vehicle pages: `${year make model} (Stock ref)` title, fact-based description | ✅ Repo | `vehicleSeo()`; seo-render suite. |
| C3 | Vehicle JSON-LD honest: availability (sold/auction/reserved), price/currency (¥→JPY etc., offers omitted when no price), image omitted when absent | ✅ Repo | seo-render suite incl. demo units. |
| C4 | Missing vehicle → `noindex,nofollow` + "no longer listed" metadata | ✅ Repo | seo-render suite. |
| C5 | Staff routes `/crm /account /portal /studio` + legacy `#crm` → `noindex,nofollow` | ✅ Repo | seo-render suite (kept from #38/#39). |
| C6 | FAQPage JSON-LD scoped to `/faq` only (removed from static `@graph`) | ✅ Repo | `index.html` + seo-render suite. |
| C7 | Breadcrumbs + vehicle OG tags, canonical real-path | ✅ Repo | seo-render suite. |
| C8 | Sitemap 16 URLs, all routes exist, no staff URLs, `/shipping` priority 0.7 | ✅ Repo | seo-render suite. |
| C9 | Static shell (index.html) carries semantic initial HTML + build marker `ar7-2026-09-28-seo` | ✅ Repo | seo-render suite. |
| C10 | Per-page `og:image` (+ `og:image:width/height`, `og:image:alt`, `twitter:image`) for all 16 public routes — 4-image set under `public/assets/og/` (1200×630 crops of real site photography); static shell keeps the default image with its dimensions corrected to the actual 1240×800 asset | ✅ Repo (owner-approved 2026-09-28) | seo-render suite: per-route mapping, absolute URLs, declared dimensions asserted against the actual JPEG headers. |
| C11 | Vehicle pages: `og:image`/`twitter:image` = the car's own photo via `imageFor(car.image)` (absolute), default image when absent/loading/missing, no fabricated dimensions on listing photos | ✅ Repo | seo-render suite. |
| C12 | Dynamic vehicle sitemap `/api/sitemap-vehicles.xml`: published `site_listings` only, sold/private/delisted excluded, `carRef`-based URLs, XML-escaped, `<lastmod>` only for real `updated_at`, `public, max-age=120, s-maxage=600`, honest 503 on failure (never 200 + malformed XML); `robots.txt` gained a second Sitemap line; static 16-URL `sitemap.xml` unchanged and still authoritative for landing pages. `japan_dealer_stock` deliberately excluded — no public AR7 detail pages (decision recorded in `SEO-SUBMIT.md` §4). **Deploy note (2026-09-29):** the logic lives inside `api/site-content.js` (dispatched on `?sitemap=vehicles` via a `vercel.json` rewrite) because Vercel Hobby's 12-Serverless-Functions-per-deployment cap made a standalone 13th function break every deploy — production stayed on the PR #40 build until this was fixed | ✅ Repo (owner-approved 2026-09-28; deploy fixed 2026-09-29, verified serving 25 vehicle URLs on the preview deployment) | `test:sitemap-vehicles`, 28 passed / 0 failed (injected fake-db pattern). |

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

## F. Build & test suites — repo

| Suite | Result |
|-------|--------|
| `test:routing` | ALL PASS |
| `test:contacts` | ALL PASS |
| `test:header` | ALL PASS |
| `test:pages` | 86 passed, 0 failed (79 before this session's same-block claim assertions) |
| `test:currency` | ALL PASS |
| `test:inventory` | ALL PASS |
| `test:client` | 63 passed, 0 failed |
| `test:seo` (= `test:seo-render`, `scripts/seo-render.test.mjs`) | ALL PASS |
| `test:settings` (28) | 28 passed, 0 failed |
| `test:sitemap-vehicles` (new this session) | 28 passed, 0 failed |
| `test:goonet` (core+seed+sync) | 158 + 54 + 41, all passed |
| `npm run build` / `npm run build:crm` | ✓ both |

## G. Post-deploy verification — owner, after merging this branch

Run each and record results. If anything fails, roll back (see H).

```sh
curl -sS -I https://ar7traders.com/                      # 200, no Location
curl -sS -I https://www.ar7traders.com/                  # 301 → apex
curl -sS https://ar7traders.com/ | grep -c 'ar7-2026-09-28-seo'   # ≥1 (build marker)
curl -sS https://ar7traders.com/sitemap.xml | grep -c '<loc>'     # 16
curl -sS -I https://ar7traders.com/inventory/DOES-NOT-EXIST        # 404
curl -sS https://ar7traders.com/api/settings | head -c 300        # public keys only
```

Then in a browser: spot-check `/`, `/inventory`, one vehicle page, `/shipping`,
`/faq`; confirm `/crm` loads and its Website-settings form shows values (now
authed) with no console errors. In GSC, **URL Inspection → live test** one
vehicle page and `/faq` to confirm the new metadata is served; do not re-submit
indexing requests for pages already requested.

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
