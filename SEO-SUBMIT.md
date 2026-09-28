# SEO + Search Submission Runbook (AR7 Traders)

Everything in this file is copy-paste ready. It covers: fixing the one DNS
problem, getting the site verified in Google Search Console, submitting the
sitemap, and getting the site in front of AI answers (ChatGPT, Perplexity,
Copilot, Gemini).

Done automatically by the codebase (no action needed):

- Per-page `<title>` + meta description + canonical URL on every page
- Open Graph / Twitter cards for WhatsApp & social sharing
- JSON-LD structured data: `AutoDealer`, `WebSite`, `FAQPage` (home) +
  `BreadcrumbList` (every page) + `Car`/`Offer` (every vehicle detail page)
- `robots.txt` (staff areas blocked, sitemap referenced)
- `sitemap.xml` with all 15 public pages
- `llms.txt` — a plain-English site description that AI assistants read
- Real 404 status for unknown URLs (branded 404 page)
- Crawler-readable content in the initial HTML (visible to AI crawlers that
  don't execute JavaScript)

---

## 1. FIX THE DOMAIN (do this first — 10 minutes)

Your Vercel email is correct: DNS is managed at your registrar (Namecheap),
and one record is stale.

- `www.ar7traders.com` → CNAME → Vercel ✅ (already correct)
- `ar7traders.com` (the root) → A → `216.198.79.1` ❌ (an old Amazon/AWS
  server — NOT Vercel)

### Copy-paste fix in Namecheap

1. Log in to Namecheap → **Domain List** → `ar7traders.com` → **Manage**.
2. Open **Advanced DNS**.
3. Find the **A Record** with host `@` (or blank host) pointing at
   `216.198.79.1`. **Edit** it to point at:

   ```
   76.76.21.21
   ```

   (Vercel's IP — this is what Vercel's "Alternative setup with A or CNAME
   records" instructs for the root record.)
4. If there are other A records for `@` pointing at old hosts, delete them.
   Leave the `www` CNAME as it is.
5. Wait up to ~1 hour (usually minutes), then check
   `https://ar7traders.com/` (without www) — it should load the Vercel site
   with a valid padlock.

**Optional (not required):** if you'd rather have Vercel manage all DNS,
change the nameservers in Namecheap to `ns1.vercel-dns.com` and
`ns2.vercel-dns.com`. The email in your inbox explains this. Either way works;
the A-record fix above is the only thing that's actually broken.

---

## 2. GOOGLE SEARCH CONSOLE (5 minutes)

This is how you "submit" the site to Google and watch what it indexes.

1. Go to https://search.google.com/search-console and sign in with
   `ceoar7grouplimited@gmail.com` (the domain owner account).
2. Select **Add property → Domain** and enter `ar7traders.com` (a domain
   property covers both www and root).
3. Verify with **DNS** (easiest since you're in Namecheap anyway):
   - Google gives you a TXT record: `google-site-verification=XXXX...`
   - In Namecheap → **Advanced DNS** → **Add New Record** → Type `TXT`,
     Host `@`, Value = the string Google gave you.
   - Click **Verify** back in Google. (Takes a few minutes.)
   - Alternative: choose "HTML tag" instead and send me the tag — I'll add it
     to `index.html` for you.
4. Once verified: **Indexing → Sitemaps** → enter

   ```
   sitemap.xml
   ```

   → **Submit**. All 15 pages should appear.
5. For fastest pickup of the most important pages: **Indexing → URL
   Inspection**, paste `https://ar7traders.com/`, then **Request indexing**.
   Repeat for `/inventory`, `/howbuy`, `/contact`.

Google will then crawl and index over the following days/weeks. In Search
Console watch **Indexing → Pages** to confirm URLs move to "Indexed".

---

## 3. BING WEBMASTER TOOLS (3 minutes — powers Microsoft Copilot + more)

1. Go to https://www.bing.com/webmasters → sign in → **Add a site** →
   `https://ar7traders.com`.
2. Verify with the same DNS TXT record Bing generates (add it in Namecheap
   next to the Google one).
3. **Sitemaps** → submit `sitemap.xml`.
4. Bing can also import your verified Google property: **Settings → Site
   lists → Import from Google Search Console** — one click if you did step 2.

Bing's index feeds Microsoft Copilot and is one of the main channels AI
answers pull from, so this matters for "visible in AI searches".

---

## 4. AI SEARCH VISIBILITY (already done in code)

- `https://ar7traders.com/llms.txt` is live and describes the business,
  services, pages and contacts in plain English — this is the file LLM
  assistants (ChatGPT, Perplexity, Claude, Gemini) are increasingly told to
  consult.
- The homepage HTML now contains real business content (not just an empty
  app shell), so AI crawlers that don't run JavaScript still see what AR7
  Traders is and does.
- Structured data (`AutoDealer`, `Car`, `FAQPage`) makes the business and
  each vehicle machine-readable.

**Tip:** make sure the site (step 1) is reachable on the root domain before
asking around in ChatGPT/Perplexity — they crawl the canonical root URL.

---

## 5. Ongoing (monthly, ~5 minutes)

- When the Goo-net stock sync adds new vehicles, no extra step is needed —
  vehicle pages are indexable and the sitemap covers the listing pages.
- Keep `/faq` and `/news` content current; FAQ + news pages are the fastest
  way to earn rich results and AI citations.
- In Google Search Console, monthly: check **Pages** report for crawl errors,
  and **Enhancements** for structured-data issues (fix any red flags).
- If you add real social profiles (Instagram, Facebook, LinkedIn), tell me
  and I'll wire them into the `sameAs` field of the business structured data.
