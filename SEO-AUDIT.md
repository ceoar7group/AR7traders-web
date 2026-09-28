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

## F. Build & test suites — repo

| Suite | Result |
|-------|--------|
| `test:routing` | ALL PASS |
| `test:header` | ALL PASS |
| `test:pages` | 79 passed, 0 failed |
| `test:currency` | ALL PASS |
| `test:inventory` | ALL PASS |
| `test:client` | 63 passed, 0 failed |
| `test:seo` (contacts/llms etc.) | ALL PASS |
| `test:seo-render` | ALL PASS |
| `test:settings` (new) | 28 passed, 0 failed |
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
