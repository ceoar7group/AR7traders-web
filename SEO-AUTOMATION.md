# SEO automation and machinery recovery — 2026-10-10

## Staff SEO desk

All server actions remain behind the existing `site.write` permission.

- **Research keywords**: uses Search Console queries/pages from the last complete
  28-day window when Google credentials are configured. Shows actual impressions,
  clicks, CTR and average position. Without credentials, returns clearly labelled
  catalogue-derived ideas, never invented search-volume or competition numbers.
- **Draft this topic**: opens the existing draft editor with the selected topic.
- **Generate AI draft**: creates guide or news copy, a title and an excerpt from
  staff-supplied facts. Requires server-side `OPENAI_API_KEY`; optional
  `SEO_OPENAI_MODEL` defaults to `gpt-4o-mini`. Requests time out after 30 seconds
  and are limited to 2,400 output tokens. Provider errors do not save partial work.
- News requires HTTPS source URLs and a verified event date in the facts. The
  generator does not browse those URLs or assert that it verified them. It must
  not fabricate breaking news, stock availability, duties, prices or statistics.
- **Fix draft SEO**: repairs excerpt whitespace/length using existing copy and
  computes reading time. It does not change the title-derived URL or factual body.
- Generated content remains unsaved/unpublished in the editor with an explicit
  review marker. Save a draft, verify every claim/source, remove the marker,
  save again, and explicitly publish using the existing review workflow.
  This is one-click generation, not unchecked mass publication.

The existing dynamic news sitemap includes published CRM articles, not drafts.
Build-time HTML currently covers the eight destination pages and six built-in
articles; newly published CRM articles still use the existing client renderer.
This patch does not claim full-site SSR or guaranteed indexing.

## Automatic technical maintenance

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
