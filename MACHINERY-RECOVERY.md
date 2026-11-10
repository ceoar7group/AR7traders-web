# Machinery workflow and hidden imports — 2026-10-09

## What was verified

GitHub machinery workflow runs 37920219168, 37766405538 and 37608048190
failed. The latest run's annotation records HTTP 500. Detailed logs redirect to
an inaccessible host in this sandbox. Production Supabase/Vercel credentials
are not present here. **The live database contents and the exact production
500 cause have not been verified. No live rows were changed.**

## Code fixes

- Catalogue, scraper deduplication, confirmation and nightly reads now paginate
  instead of silently stopping at Supabase's default row cap. A database read
  error is an error, not an empty catalogue that allows duplicate imports.
- The authenticated desk gets the stored database shape, including `price_usd`
  and image provenance, rather than losing editable fields in the public mapper.
- **Find stored / hidden imports** performs a fresh authenticated database audit.
  It lists unpublished/archived rows, exact references, stored hold reasons and
  validation issues. Valid, unarchived hidden rows can be explicitly published
  in place after confirmation. No duplicate row is created.
- Scraper receipts identify previously imported hidden rows and references of
  duplicate links. A source already in the catalogue is not silently re-added.
- Desk copy no longer asserts that every hidden row was hidden by a person;
  older imports may have been held by earlier code.
- Nightly repricing preserves publication state, Reserved/Sold status, owner
  hold reason and publication metadata. Archived sources are not rechecked.
  Checks start with the least recently seen sources, reducing repeated checks
  of only the first rows when the runtime budget is exhausted.
- Environment failures and schema errors produce structured diagnostics instead
  of an opaque exception. Known missing-table/column codes point to the schema
  migration; they do not automatically change the production schema.
- Workflow dispatch now offers **audit** (read-only, default) or **refresh**.
  Scheduled runs remain refreshes. Audit counts appear in the job summary, and
  returned database errors are included in failure annotations. The client waits
  75 seconds so the 60-second server can return its diagnostic response.

## Which gates remain?

No minimum photo count, photo-rights label, supplier price, model year or hour
meter is required to publish a valid machine. Missing facts stay missing; there
is no fabricated price or year. Tests cover restoring a listing without these.

Authentication, an identifiable machine/reference, valid catalogue type, duplicate
protection and supplier robots/access rules remain. Removing them would expose
private records, create duplicate URLs, misfile machines or ignore supplier rules.
Archived records are visible in the audit but are not automatically restored.

A **preview does not save** a row. Only the explicit confirmation step writes it.
The nightly workflow rechecks existing imports; it does not discover and add new
machines. The CRM scraper is the discovery → preview → confirm path.

## After deployment

1. CRM → Machinery desk → **Find stored / hidden imports**. This queries the
   actual database, not the bundled website catalogue. Inspect each recorded
   hold reason; use **Publish existing listing** only for a row you want live.
2. GitHub Actions → Machinery importer → Run workflow → **audit**. This requires
   the deployed API version in this patch; do not run audit against old code,
   which does not recognise the new job name. Review the counts and response.
3. If audit reports a missing table/column, inspect the production schema against
   `supabase/MIGRATION-2026-10-machinery.sql` before applying anything. If it
   reports database configuration, check the Vercel Supabase server variables.
   Keep credentials in platform settings, not chat or source files.
4. Run **refresh** after the audit succeeds. Inspect individual supplier failures
   rather than treating HTTP 200 as proof of success. Do not blindly retry a
   failed write batch; inspect stored references first.
5. Run the CRM scraper, confirm selected candidates and review the receipt.
   Then open each published machinery URL on the website.

## The desk now says WHY it is empty (2026-10-12)

The failed machinery reads used to be swallowed (`catch { return [k, []] }`), so
an uncreated table produced an **empty desk**, not a broken one — and because the
bundled website catalogue fills that table, it could even look healthy. The
nightly importer 500'd for days while the one person who could fix it had no
cause on screen. That is fixed:

- **Every failed entity read is kept**, with the server's `stage`, `storage` and
  `ownerAction` (the API has always sent them; the desk threw them away).
- **The machinery tab shows a storage alert** — `role="alert"`, the server's own
  sentence ("Could not find the table 'public.machinery' in the schema cache"),
  the state and table, the SQL file to run with its `pg_notify` reload, and the
  plain statement that the list below is the built-in website catalogue rather
  than database records.
- **Missing storage is distinguished from a transient read error.** Only a
  missing table sets `writesBlocked`, which hides the "Add all to the desk"
  button — a button whose only possible answer is the same failure again. A
  timeout or a 503 keeps the button and its own wording.
- **The import panel keeps the same promise.** While the table is missing, every
  control that reads or writes STORED machines is disabled (Find stored /
  hidden imports, publish, archive/delete stale rows, confirm import), each with
  the migration named on its tooltip, and the panel says so next to them.
  Supplier link and scraper previews stay enabled — they read the supplier, not
  our database, so the market is still visible while the owner migrates. A
  disabled control that still looks pressable is its own defect: the shots
  script fails if any disabled panel button computes opacity 1, which is why the
  panel's top-level action now dims (it did not) and why it stopped being a
  21px target (204×21 → 34px tall, measured).
- **Run storage diagnostic** calls `GET /api/site-content?machinery=doctor`
  (staff-only, read-only) and renders one line per check with a Pass/Fail
  verdict and the fix for each failure. Nothing is written or changed.
- The alert's button is 38px tall with a full-width phone layout, and every text
  element in both blocks was measured against WCAG AA in all three CRM themes
  (`scripts/machinery-alert-shots.mjs`). The measurement caught real failures —
  gold "Fix:" text at 2.75:1 and the 11px hint line at 4.23:1 on the Porcelain
  Light theme — which are now fixed and pinned by guards.

Owner steps are unchanged and are printed on the screen:

1. Run `supabase/MIGRATION-2026-10-machinery.sql` in the Supabase SQL editor.
2. Then `select pg_notify('pgrst', 'reload schema');` so PostgREST sees it.
3. Press **Run storage diagnostic** until every check reads Pass, then import.

Verification limits: no production credentials exist in this workspace, and
anonymous requests to `/api/site-content?machinery=doctor` are answered
`{"error":"Unauthorized"}` — the auth gate runs before action dispatch, so that
response does not confirm which actions the deployed build contains. The
diagnostic is proven by the handler tests and the desk's DOM tests, not by
production.

## The machinery sitemap describes the site that exists (2026-10-12)

`/api/sitemap-machinery.xml` answered **503** whenever the machinery read failed —
which, in production, is every time, because the table does not exist. But the
website does not fail with it: `hydrateMachines()` keeps the built-in catalogue
when a response is empty or fails, so `/machinery/excavators/AR7-MC-001` is live,
linked and indexable. `robots.txt` declares that sitemap, so the owner's Search
Console showed a fetch error for pages that were being served perfectly well,
and the dynamic sitemap listed nothing while the static one listed all twelve.

The rule is now the same one the client follows and `?machinery=doctor` reports:

- the sitemap advertises **exactly what the site is serving** — the published
  database rows when there are any, otherwise the built-in catalogue — and says
  which in `X-Machinery-Source: database | bundled-catalogue`;
- a storage problem adds `X-Machinery-Storage: missing-table` and still logs the
  state and the owner action (the loud, actionable surfaces are unchanged: the
  CRM storage alert, the doctor, the workflow preflight);
- the fallback caches for 60s, not the usual 600, so the real rows appear as soon
  as the migration runs;
- the empty-database case behaves the same way (`hydrateMachines()` refuses an
  empty list for exactly the same reason);
- `POST` is now refused with `405` + `Allow: GET`, matching the vehicle sitemap.

The vehicles sitemap was **not** changed: its own read is healthy in production
(verified 2026-10-12 — 70+ URLs served). Its built-in car showcase lives inside
`src/main.jsx` (a client module), so giving it the same fallback would mean moving
that data into an importable module first — a separate change, recorded rather
than smuggled in.

## Validation

Full npm test passed after the workflow/desk changes. Additional focused checks:
98 receipt/UI checks; 41 nightly sync checks; 75 machinery CRM checks; 121 scraper
checks; paginated audit tested against 1,201 rows and against a missing-table
failure. Website and CRM builds pass. No extra Vercel function was added.

2026-10-12, the storage alert: 150 receipt/UI checks (was 98) and 78 CRM theme
checks (was 46); `scripts/machinery-alert-shots.mjs` rendered the alert, the
diagnostic report and the blocked import panel through the running preview in
emerald/dark/light at 1440×900 and 390×844 — 66 checks, 0 failures, every text
element above AA (lowest 5.72:1), no clipped button, no sub-24px target, no
sideways overflow, and every disabled control visibly dimmed.

2026-10-12, the machinery sitemap: 50 → 72 checks. Both responses (database rows
and the built-in catalogue) are parsed as real XML (jsdom `text/xml`: one
`urlset`, sitemaps.org namespace, one `<loc>` per `<url>`), every advertised URL
is resolved by the SPA router, the dynamic fallback and the static
`public/sitemap.xml` are asserted to list the same twelve machine pages, and the
doctor's own "public catalogue" answer is asserted to count the same machines the
sitemap advertises.
