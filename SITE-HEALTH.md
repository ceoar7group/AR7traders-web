# The site guardian

`scripts/guardian.mjs` — one pass over health, security, freshness and SEO.

```bash
npm run guard              # the full report
npm run guard -- --json    # machine-readable, written to .guardian-report.json
npm run guard -- --watch   # re-check every five minutes while you work
```

The point is not that it can fix everything. The point is that the site cannot
silently rot: every check names the file to open, or the command to run.

## What it checks

**Health**
- every internal link and asset in the built site resolves — routes are resolved
  against `src/routing.js` `PAGES`, not a hand-copied list, because a copy is a
  list that goes stale the first time somebody adds a page
- the crawler shell carries an H1 and real content
- the sitemap contains no staff or transactional URLs, and `robots.txt`
  advertises it

**Security**
- the response headers are declared in `vercel.json`
  (`X-Content-Type-Options`, `Referrer-Policy`, `X-Frame-Options`,
  `Strict-Transport-Security`, `Permissions-Policy`, `Cross-Origin-Opener-Policy`)
- no credential value is reachable from the client bundle
- no `eval`, and no `dangerouslySetInnerHTML` fed by a variable
- every `localStorage` call is guarded — Safari private mode throws, and an
  unguarded write means the CRM does not open
- every API function either checks a permission or declares itself a public
  intake endpoint with `guardian:public-endpoint`, in which case it must have
  input caps

**Freshness** (reads the live data modules, not a copy)
- machinery photo coverage, and that a `photosPending` unit never borrows
  another machine's photograph
- the price derivation still equals `supplierPrice + MACHINERY_MARKUP` — a
  hand-edited published price is how a catalogue and its margin drift apart
- each machinery type page has stock
- the promotion bar is not live-but-expired, and flags a published discount that
  has to be honoured in quotations
- sourced listings have been re-priced within 30 days

**SEO**
- exactly one H1 per rendered page
- a canonical on every page

## Where it runs

- **Locally**: `npm run guard`, and in `npm test` (as `npm run test:tools`).
- **In CI**: `.github/workflows/guardian.yml` runs the guardian, the SEO audit
  and the full test suite on every push to `main` and nightly at 03:17 UTC. A
  failure turns the run red. The report is committed back to
  `public/guardian-report.json` so the CRM always shows the most recent real
  run — the workflow only ever commits that one file.

The agents run against the repository, not from the browser: a serverless
function has no repo and no build to inspect. That is why the CRM's **Run checks
now** button starts the GitHub Action rather than pretending to scan from a
function.

## In the CRM

**Site guardian** (between *Website settings* and *Activity log*) shows:

- the summary — passing, warnings, failures, and when the last run was
- every check, grouped by area, with the detail and the fix
- **Run checks now**, which starts the GitHub Action
- **Promotions** — what is live, and the campaigns available to publish. See
  `PROMOTIONS.md`
- the exact commands for local runs, each with a copy button

Publishing a promotion needs `settings.write`, the same permission as editing
the website. A viewer sees the button disabled rather than hidden.

## Why some findings are warnings

A guardian that cries wolf gets ignored. Two things are deliberately warnings
rather than failures:

- **A published discount** is not a bug — it is a commitment. The warning stays
  until the promotion is cleared, so the discount is visible to whoever quotes.
- **A listing not re-priced in 30 days** is normal drift, not breakage.

Everything that would break the site, the build or a customer's confidence is a
failure, and a failure fails the run.
