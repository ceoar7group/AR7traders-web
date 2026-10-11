# SEO automation and machinery recovery — 2026-10-10

## Staff SEO desk

All server actions remain behind the existing `site.write` permission.

- **Research keywords**: uses Search Console queries/pages from the last complete
  28-day window when Google credentials are configured. Shows actual impressions,
  clicks, CTR and average position. Without credentials, returns clearly labelled
  catalogue-derived ideas, never invented search-volume or competition numbers.
- **Draft this topic**: opens the existing draft editor with the selected topic.
- **Generate AI draft**: creates guide or news copy, a title and an excerpt from
  staff-supplied facts. Since 2026-10-11 the default provider is **Gemini on the
  free tier** (server-side `GEMINI_API_KEY`, model `gemini-3.8-flash`, overridable
  with `SEO_GEMINI_MODEL`). It never falls back to a paid provider: OpenAI is used
  only if you set `SEO_AI_PROVIDER=openai` yourself (then `OPENAI_API_KEY`, with
  `SEO_OPENAI_MODEL` defaulting to `gpt-4o-mini`). Requests time out after 30
  seconds, are limited to 2,400 output tokens and are retried a bounded number of
  times only for transient failures. Every failure names its state and the exact
  fix (missing key, rejected key, model unavailable, daily quota spent, per-minute
  limit, timeout, truncation, safety refusal, empty output, provider outage) and
  **saves nothing** — a provider error never leaves partial work behind. The desk
  shows which provider will be used, read from the server, so it cannot drift from
  the deployment. Without a key the factual formatter above still works.
- News requires HTTPS source URLs and a verified event date in the facts. The
  generator does not browse those URLs or assert that it verified them. It must
  not fabricate breaking news, stock availability, duties, prices or statistics.
- **Fix draft SEO**: repairs excerpt whitespace/length using existing copy and
  computes reading time. It does not change the title-derived URL or factual body.
- Generated content remains unsaved/unpublished in the editor with an explicit
  review marker. Save a draft, verify every claim/source, remove the marker,
  save again, and explicitly publish using the existing review workflow.
  This is one-click generation, not unchecked mass publication.

The **machinery** sitemap (`/api/sitemap-machinery.xml`, declared in robots.txt)
advertises exactly the machine pages the website is serving: the published
database rows when there are any, otherwise the built-in catalogue that
`hydrateMachines()` keeps in place — and it says which in
`X-Machinery-Source`. Until 2026-10-12 it answered **503** whenever the read
failed, which it did on every request in production while the site served all
twelve built-in machines at live, linked URLs; the fallback now caches for 60s so
the real rows appear as soon as the migration runs. The **vehicle** sitemap keeps
its existing behaviour (its own read is healthy; the car showcase's fallback
lives inside `src/main.jsx`, so it would have to move before it could be served
the same way) — see MACHINERY-RECOVERY.md.

The existing dynamic news sitemap includes published CRM articles, not drafts.
Build-time HTML currently covers the eight destination pages and six built-in
articles; newly published CRM articles still use the existing client renderer.
This patch does not claim full-site SSR or guaranteed indexing.

## Automatic technical maintenance

**AI Growth agents** (CRM → AI Growth) use the same provider client. Their setup,
permissions and approval rules are documented in `AI-GROWTH.md`.

`npm run build` now runs `seo:repair-crawl` first. It deterministically restores
missing editorial URLs, explicit HTML rewrites and all four robots sitemap
references. It preserves existing lastmod dates and robots exclusions, refuses
conflicting rewrites, and is idempotent. Thus repairs ship with actual production
builds, rather than merely being reported in a dashboard.

The **SEO research and technical audit** workflow runs weekly and on demand:
production build/repair → keyword plan → two-guide monthly editorial plan → SEO
checks. It uploads reports for review. It does not secretly push changes to main,
spend AI credits unattended or publish unverified articles. Search Console,
IndexNow and GA4 still need the owner's deployment configuration (SEO-SUBMIT.md).

## Hidden machinery imports

**Publish all eligible hidden imports** appears after a fresh inventory audit in
the machinery desk. It restores up to 100 valid, Available, previously imported
rows in place, without photo/price/year gates and without creating duplicates.
Archived, Reserved, Sold and invalid rows are excluded and remain visible in the
private audit for deliberate handling. Confirmation is required. Publication is
conditional on the row still being hidden and Available when written.

The GitHub **Machinery importer** workflow also offers `audit`, `refresh`, and
`recover`. Recovery requires `confirm_recovery=true`. A capability preflight
refuses old deployments so a new job name cannot accidentally trigger the old
car-sync fallback. Inventory/recovery counts are emitted in job annotations and
summaries so they remain inspectable when raw log downloads are unavailable.

Local tests cannot prove production has zero hidden imports. The live audit and
recovery outcome must be checked after deployment. Schema or environment errors
must be fixed on the actual deployment; no credentials belong in chat or Git.
