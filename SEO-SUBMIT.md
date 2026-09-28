# SEO + Search Submission Runbook (AR7 Traders)

## Status — 2026-09-28

Owner handoff records the following as completed (do not repeat DNS setup):

- Namecheap nameservers intentionally retained. Apex A: `76.76.21.21`.
- www CNAME: `268c62e82ffdcc9e.vercel-dns-017.com.`
- **Never edit or delete** SPF TXT: `v=spf1 include:spf.efwd.registrar-servers.com ~all`.
- **Never edit or delete** GSC TXT: `google-site-verification=yFi_NTpbdqz_DnWhzi0w5x1ihXT6tQebjvdRrfuQ7ss`.
- GSC domain property verified; `https://ar7traders.com/sitemap.xml` accepted (15 URLs).
- Indexing requested for `/`, `/inventory`, `/howbuy`. www is indexed;
  apex has an old pre-DNS-fix “Page with redirect” result. Do not treat that old crawl as current behavior.

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

## 1. Priority: consolidate to non-www (pending owner settings check)

In Vercel → project `ar-7traders-web` → **Settings → Domains**, inspect both
hosts. Keep both attached. If apex redirects to www, reverse that configuration:
serve apex directly and redirect www to `https://ar7traders.com` permanently
(301 where available). Preserve paths and query strings. Inspect HTTPS options too.
Do not create opposing redirects; do not change DNS or remove www.

If there is **no** apex→www domain-level redirect, add this top-level block to
`vercel.json` before `rewrites`, through a PR to main:

```json
"redirects": [
  {
    "source": "/(.*)",
    "has": [{ "type": "host", "value": "www.ar7traders.com" }],
    "destination": "https://ar7traders.com/$1",
    "statusCode": 301
  }
],
```

This block is intentionally not active yet: the reverse redirect must first be
ruled out or removed. Leave existing rewrites unchanged, including staff routes.
After the settings change or production deployment, run from a network that can reach the site:

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

After **24–48 hours from the successful host change**, inspect
`https://ar7traders.com/` in GSC. Use **Test live URL** to separate current behavior
from an old indexed crawl. Confirm no redirect and request indexing once if
appropriate; avoid repeated requests. Google may take days or longer to select
apex as canonical; indexing is not guaranteed. Keep www attached throughout.

## 2. Regression checks

Run each npm script separately (passing multiple names to a single `npm run`
does not execute all scripts):

```sh
npm ci
for task in routing header pages currency inventory client seo; do
  npm run "test:$task" || exit 1
done
npm run build
```

The header tests check the Inventory button's DOM text (allowing its chevron),
and the intended 13 More links rather than an obsolete even-item requirement.
SEO tests enforce `noindex,nofollow` on all four staff pages. Keep real-path
canonicals, static crawler content, structured data, robots rules, and 404 handling.

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

- Dynamic sitemap listing public, available `/inventory/STOCK` detail URLs from
  the authoritative inventory source. Plan caching, XML escaping, failures and
  removal of sold/private stock before implementation.
- Add only owner-confirmed real social profile URLs to AutoDealer `sameAs`.
- Per-page Open Graph images.
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
- The current sitemap lists public landing pages, not individual vehicles.
  Vehicle URLs can be discovered via links; a dynamic sitemap remains optional.
