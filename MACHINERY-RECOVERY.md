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

## Validation

Full npm test passed after the workflow/desk changes. Additional focused checks:
98 receipt/UI checks; 41 nightly sync checks; 75 machinery CRM checks; 121 scraper
checks; paginated audit tested against 1,201 rows and against a missing-table
failure. Website and CRM builds pass. No extra Vercel function was added.
