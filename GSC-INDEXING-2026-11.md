# Google Search Console — Indexing Diagnosis (2026-11-13)

Snapshot from Search Console: **290 pages indexed, 82 not indexed**, indexed
count rising steadily since 2026-10-20. This document explains every
"not indexed" reason for ar7traders.com, classifies each as *by design* or
*timing*, and records the verification steps so the next audit does not have
to repeat them.

**Verdict: nothing is broken.** ~38 of the 82 URLs are the site's own
canonical/redirect/noindex architecture working as designed; ~44 are Google's
crawl queue catching up with pages added in early November. No code changes
are warranted.

## Reason-by-reason

| GSC reason | Count | Verdict | Root cause on this site |
|---|---|---|---|
| Alternate page with proper canonical tag | 18 | ✅ By design | Filter/variant URLs correctly declaring their canonical: `/inventory?make=X` canonicalizes to `/cars/x` (`carsLandingSeo` in `src/seo.js`), and `?lang=` translations captured pre-boot resolve to the clean English URL. Google indexed the canonical instead — duplicates being consolidated, no content missing from search. |
| Page with redirect | 16 | ✅ By design | `http→https`, `www→apex` (verified live: `www.ar7traders.com` 301s to apex), and legacy `/japan-stock/*` → `/inventory` permanent redirects in `vercel.json`. GSC lists the *old* URL; the destination **is** indexed. |
| Excluded by 'noindex' | 2 | ✅ Intentional | Vehicle/machine pages whose listing was sold or delisted render a "no longer listed" state with explicit noindex (`applySeo`: `vehicleMissing` / `machineMissing`). Keeps dead stock out of search. |
| Discovered – currently not indexed | 42 | ⏳ Timing | The sitemaps advertise ~420 URLs (67 static + 14 brand + 88 make/model + 248 live vehicles per DB + machinery/news). Many `/cars/{make}/{model}` pages went live only 2026-11-05..07. Google has found them and queued them; it rations crawl for newer domains. The rising indexed curve shows the queue draining. Some vehicle pages will sell before Google crawls them — inherent to inventory sites. |
| Crawled – currently not indexed | 2 | ⏳ Timing | Google fetched them and deferred judgment; re-evaluated automatically. Count of 2 is noise. |
| Duplicate without user-selected canonical | 1 | 🔍 Cosmetic | One variant where Google's render did not capture the canonical tag. Not worth engineering at count = 1. |
| Duplicate, Google chose different canonical than user | 1 | 🔍 Cosmetic | Google picked a different URL of one page pair as canonical; the content is still indexed under Google's pick. |

## Why "not indexed" is not an error list

GSC's "not indexed" bucket includes every URL Google ever saw — redirect
sources, filtered views, noindexed sold-car pages. A site with working
canonicals, redirects and noindex rules **should** have entries here; zero
would mean no duplicate protection at all.

## Verified during this audit (2026-11-13)

- `robots.txt`: Allow all; Disallow `/crm /account /portal /studio /seo /call`;
  4 sitemap lines — correct, and `scripts/growth-fixes` tests already assert
  the `/crm` exclusion is intentional.
- `/sitemap.xml`: ~67 static URLs; `/api/sitemap-vehicles.xml`: `/cars/{make}`,
  `/cars/{make}/{model}`, `/inventory/{stockRef}`.
- A live `/inventory/{ref}` page serves full prerendered HTML (title,
  description, canonical, specs, FAQ) — no empty-JS-shell indexing problem.
- `www.ar7traders.com` 301s to the apex domain.
- Supabase: 248 published vehicles, 14 makes, 88 make/model pairs.

## Optional follow-ups (manual, no code)

1. In GSC, open the two "Duplicate" rows to see the exact URLs; if either
   matters, use URL Inspection → Request Indexing on the canonical.
2. Request indexing manually for the 5–10 highest-value `/cars/{make}` pages
   to jump the crawl queue.
3. Do **not** start "Validate fix" on the healthy categories — it wastes a
   validation cycle.

Re-check in 3–4 weeks: expect indexed ≈ 350 and "Discovered – currently not
indexed" shrinking as the November model pages get crawled.
