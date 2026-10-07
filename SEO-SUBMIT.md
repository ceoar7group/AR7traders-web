# SEO + Search Submission Runbook (AR7 Traders)

## Status — 2026-09-28

Owner handoff records the following as completed (do not repeat DNS setup):

- Namecheap nameservers intentionally retained. Apex A: `76.76.21.21`.
- www CNAME: `268c62e82ffdcc9e.vercel-dns-017.com.`
- **Never edit or delete** SPF TXT: `v=spf1 include:spf.efwd.registrar-servers.com ~all`.
- **Never edit or delete** GSC TXT: `google-site-verification=yFi_NTpbdqz_DnWhzi0w5x1ihXT6tQebjvdRrfuQ7ss`.
- GSC domain property verified; `https://ar7traders.com/sitemap.xml` accepted (15 URLs
  at the time; the sitemap now lists 16 — Google picks up the addition on recrawl).
  Indexing requested **once** for `/`, `/inventory`, `/howbuy` — do not repeat.
  www is indexed; apex has an old pre-DNS-fix “Page with redirect” result.
  Do not treat that old crawl as current behavior.
- **Host consolidation is DONE and live-tested (2026-09-28):** apex is served
  directly, www 301s to apex, both hosts attached, deep-link path+query
  preserved (GSC Test-live-URL passed). Do not reverse it, do not add a
  duplicate `vercel.json` redirect, do not change DNS or detach www.

Session 2026-09-28 (`arena/01a0e77f-ar7traders-web`) adds: honest
vehicle-specific SEO (`7452005`), settings-API field-level security
(`1b1d649`), and the goo-net importer body-type fix (`a7675de`), on top of
the contacts (`0da8b06`) and claims (`13a5fec`, `a2e5286`) commits. See
`SEO-AUDIT.md` for the full audit matrix, post-deploy checks and rollback,
and `CLAIMS-POLICY.md` for the marketing-claims rules.

Session `arena/01a0e7ed-ar7traders-web` (same day, PR to `main`) adds:
owner-approved prominence for the founder stat (figure since lowered to 900+
by owner direction of 2026-09-29, wording unchanged,
`CLAIMS-POLICY.md` §1), per-page Open Graph images for all 16 public routes
plus per-vehicle photos on detail pages, and the dynamic vehicle sitemap
route `/api/sitemap-vehicles.xml` (referenced from `robots.txt`). Post-deploy
status for this session: every direct `curl` check is **not tested (no
network access)** — sandbox TLS to ar7traders.com (and any host) fails at
handshake — while content-level checks passed through a separate page-fetch
service; full table in `SEO-AUDIT.md` §G. Nothing was submitted to GSC.

Repository verification in this session:

- PR #38 merged as `70f83384373577b16c83a28485b08a29b2a83de8`
  (the handoff's `6c8d7c0` is not its merge SHA).
- GitHub's Vercel status for that merge: success, “Deployment has completed”,
  2026-09-28 09:05:24 UTC.
- Deployment: https://vercel.com/ar-9/ar-7traders-web/6JFHJXVWStau1Ak42qgSsZ5iMLH4
- Local production build passes without warnings; source and built HTML contain
  `ar7-2026-09-28-seo`. This does **not** verify the live HTML marker or Vercel build logs.
- Sandbox DNS resolves apex to `76.76.21.21`; direct HTTPS curl checks on both
  hosts fail during TLS with `SSL_ERROR_SYSCALL`, including a pinned-IP check.
  No HTTP status or Location header was obtained.
- A separate page-fetch service reports www as the final URL for an apex fetch.
  This suggests a reverse redirect, but does not establish its HTTP code or
  whether the result is fresh. Inspect Vercel settings before adding a redirect.
- Vercel authenticated domain settings/build logs were not accessible in this session.

## 1. Canonical host — DONE, preserve (was: consolidate to non-www)

The consolidation described below has been completed in Vercel and verified by
the owner with a GSC live test on 2026-09-28: apex `https://ar7traders.com` is
served directly and `www.ar7traders.com` 301s to it, with both hosts attached.
The `vercel.json` redirect block was deliberately **not** added — the redirect
lives in Vercel domain settings, and a second code-level redirect would duplicate
it. Leave existing rewrites (including staff routes) unchanged.

Standing rules: do not reverse the hosts, do not detach www, do not change DNS,
never touch the SPF or Google-verification TXT records, and do not add a
duplicate redirect to `vercel.json`.

Re-run these checks from a network that can reach the site after any future
domain or deployment change:

```sh
curl -sS -I https://ar7traders.com/
curl -sS -I https://www.ar7traders.com/
curl -sS -I 'https://www.ar7traders.com/inventory/AR7-26001?source=seo'
curl -sS -IL --max-redirs 5 https://www.ar7traders.com/
curl -sS https://ar7traders.com/ | grep 'ar7-2026-09-28-seo'
```

Expected: apex 200 without Location; www 301 to apex; deep-link path and query
preserved; followed www request ends at apex 200 without a loop. Also smoke-test
`/crm`, `/account`, `/portal`, `/studio` and `/#crm` in a browser, and confirm an
unknown path returns 404. Review Vercel production build logs for warnings/errors.

GSC note: use **Test live URL** to separate current behavior from an old
indexed crawl. Indexing for `/`, `/inventory`, `/howbuy` has already been
requested once — avoid repeated requests. Google may take days or longer to
select apex as canonical; indexing is not guaranteed. Keep www attached
throughout. For this branch's post-deploy checks and rollback, see
`SEO-AUDIT.md` §G–H.

## 2. Regression checks

Run each npm script separately (passing multiple names to a single `npm run`
does not execute all scripts):

```sh
npm ci
for task in routing contacts header pages currency inventory client seo settings goonet sitemap-vehicles functions; do
  npm run "test:$task" || exit 1
done
npm run build && npm run build:crm
```

Script notes: `test:seo` and `test:seo-render` are aliases for the same file
(`scripts/seo-render.test.mjs`); `test:goonet` runs the core + seed + sync
suites (158 / 54 / 41); `test:sitemap-vehicles` covers the dynamic vehicle
sitemap route (logic inside `api/site-content.js`, dispatched on
`?sitemap=vehicles`; the public URL `/api/sitemap-vehicles.xml` is kept by
a `vercel.json` rewrite); `test:functions` guards the Vercel Hobby 12-function
cap — it counts api/*.js excluding api/_*.js and fails loudly if a 13th
function is added, pointing to the consolidation pattern in
api/site-content.js. The sitemap logic lives inside the site-content function
because Vercel Hobby allows **12 Serverless Functions per deployment** and
a standalone 13th function broke every deploy from 2026-09-28 to
2026-09-29 — including production, which stayed on the PR #40 build until
this fix. Passing multiple names to a
single `npm run` still does not execute all scripts — run them one by one
or via the loop above.

The header tests check the Inventory button's DOM text (allowing its chevron),
and the intended 13 More links rather than an obsolete even-item requirement.
SEO tests enforce `noindex,nofollow` on all four staff pages, per-route
`og:image` mapping (dimensions asserted against the actual asset files), and
the same-block figure+qualifier claim assertions. Keep real-path canonicals,
static crawler content, structured data, robots rules, and 404 handling.

## 3. Bing Webmaster Tools — owner account required

1. Sign in with your Microsoft account at https://www.bing.com/webmasters.
2. Choose **Import from Google Search Console** (also available via
   **Settings → Site lists**; UI labels may vary).
3. Authorize the Google account that owns the verified `ar7traders.com` domain
   property, then select/import AR7 Traders. Use `https://ar7traders.com` if asked
   for the site URL. Confirm verification succeeds; do not add or replace DNS
   records when import works.
4. Open the site's **Sitemaps** section. Check whether import already brought
   over the sitemap; otherwise submit `https://ar7traders.com/sitemap.xml`.
5. Confirm sitemap processing succeeds and review crawl/indexing reports later.

Do not share login credentials in chat. Import/verification must be completed by
the owner. Bing visibility can support discovery in Microsoft search and Copilot;
submission does not guarantee indexing or AI citations.

## 4. Optional work — owner approval first

- ✅ **Dynamic vehicle sitemap — implemented 2026-09-28**
  (`arena/01a0e7ed-ar7traders-web`): `https://ar7traders.com/api/sitemap-vehicles.xml`
  lists public, available `/inventory/<stock>` detail URLs from `site_listings`
  only — `published = true`, status not sold/private/delisted — with
  `carRef`-based (stock number, else row id) references, XML escaping,
  `<lastmod>` only for real `updated_at` timestamps, and
  `Cache-Control: public, max-age=120, s-maxage=600`. A database failure
  returns an honest 503, never 200 with malformed XML. **Decision:**
  `japan_dealer_stock` cars are excluded — they have no public AR7 detail
  page (they render on `/japan-stock` and link out to goo-net); a car
  promoted into `site_listings` is included automatically. `robots.txt`
  references it as a second Sitemap; the static 16-URL `sitemap.xml` stays
  authoritative for landing pages. Covered by `npm run test:sitemap-vehicles`.
  **Owner: submit `https://ar7traders.com/api/sitemap-vehicles.xml` in GSC
  and/or Bing if you want it crawled explicitly — nothing was submitted on
  your behalf in this session.**
- ✅ **Per-page Open Graph images — implemented 2026-09-28:** all 16 public
  routes get `og:image` (+ truthful width/height + `og:image:alt` +
  `twitter:image`) from a four-image set in `public/assets/og/` (1200×630
  crops of real site photography); vehicle pages use the car's own photo
  with the static shell image as fallback. The `index.html` shell keeps the
  default image, with its declared dimensions corrected to the actual
  1240×800 file.
- Add only owner-confirmed real social profile URLs to AutoDealer `sameAs`.
  (No profiles were supplied — nothing added, nothing invented.)
- `aggregateRating` only if genuine, eligible reviews are visible on-page;
  never fabricate ratings, hours, social accounts, or business details.

Contact details are CRM-controlled through `/api/settings`; do not substitute
unverified static contacts. Existing `llms.txt` and structured data aid machine
readability but are not a guarantee of inclusion in AI answers.

## 5. Monthly maintenance

- Review GSC **Indexing → Pages** and applicable **Enhancements** reports.
- Check canonical selection and fix actual coverage/structured-data errors.
- Update sitemap `lastmod` when substantive page content changes, not simply
  because a build or monthly review happened.
- Keep `/faq` and `/news` accurate and useful. FAQ markup alone does not ensure
  rich results; Google's FAQ rich-result eligibility is restricted.
- The static sitemap lists public landing pages; individual vehicle URLs
  live in the dynamic `https://ar7traders.com/api/sitemap-vehicles.xml`
  (referenced from `robots.txt`). Submitting that vehicle sitemap in GSC or
  Bing is an owner action — this session submitted nothing; indexing
  requests for `/`, `/inventory`, `/howbuy` were already made once and must
  not be repeated.

## 2026-10-08 — owner env actions (the four the code cannot do for you)

The market landing pages (`/destinations/<market>`, see
`pr-visuals/2026-10-08/README.md`) are live in this branch and audited 100/100
by `npm run seo`. Everything below is a **human** step with a credential; none
of it is code, and none of it is done. Until these exist, `npm run seo:connect`
correctly reports every connector as not connected — that is the honest state,
not a bug.

| variable | what it unlocks | exact owner steps |
| --- | --- | --- |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | Real queries, impressions, clicks and coverage errors in `npm run seo:live` / `seo:connect` | Google Cloud → IAM → create a service account (no role needed), enable the Search Console API, create a JSON key, paste the whole JSON as this variable. Then **add the service account's email as a user of the GSC property** — without that the API answers "not authorised" and the connector stays red. |
| `GSC_SITE_URL` | Tells the connector which property to read (`sc-domain:ar7traders.com` for the domain property verified on 2026-09-28) | Set it to exactly the property string GSC shows, including the `sc-domain:` or `https://` prefix. |
| `GA4_PROPERTY_ID` | Organic traffic and landing-page reporting (`properties/NNNNNNNN`) | GA4 Admin → Property settings → copy the property ID. Grant the same service account **Viewer** on the property. Without GA4 there is nothing to measure the market pages against — their whole purpose is ranking for named queries, and this is the only way to see it. |
| `AR7_INDEXNOW_KEY` | Instant re-crawl on Bing/Yandex when stock or guides change | Optional and self-serving: `npm run seo:fix` generates the key and publishes the key file. Set the variable to the same string afterwards so deploys reuse it instead of minting a new one. |

### Once those four exist, in order

1. `npm run seo:connect` — expect all four connectors green.
2. Submit the sitemap **once**: `https://ar7traders.com/sitemap.xml` (GSC already
   accepted it on 2026-09-28; it now lists 43 URLs, so this is a refresh, not a
   new submission — do not repeat per-URL indexing requests).
3. Request indexing for the **six new market URLs only**, once each:
   `/destinations/kenya`, `/destinations/pakistan`, `/destinations/uae`,
   `/destinations/united-kingdom`, `/destinations/new-zealand`,
   `/destinations/tanzania`.
4. Bing: `npm run seo:indexnow` (uses the key) — this is the one-time Bing
   submission; IndexNow then keeps Bing current on every deploy.
5. Watch GSC coverage for the six URLs; a "Discovered – currently not indexed"
   state in week one is normal and is not a defect.

Nothing in this branch submits anything on its own. The site ships, the audit
stays green, and the owner decides when search engines are told.
