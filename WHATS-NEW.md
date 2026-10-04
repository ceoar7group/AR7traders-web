# What's new — the 15 things you asked for

Plain-language guide to everything added in this update. Nothing here is live
yet; it all runs on your preview until you decide to publish.

---

## Before anything works: run the database update

Open **Supabase → SQL Editor**, paste the whole of
`supabase/SETUP-EVERYTHING.sql`, and press Run.

It is safe to run more than once — running it twice changes nothing the second
time. It adds the new tables (team permissions, activity log, approvals,
orders, payments, settings) without touching what you already have.

Then add one new setting in Vercel → Settings → Environment Variables:

```
SITE_URL = https://ar7traders.com
```

That is only used to build the link inside password-reset emails.

---

## 1. Team members with different permissions

**CRM → Team**

Five roles: Administrator, Manager, Sales, Accounts, Viewer.

Add a colleague with their name, email, role and a starting password. The grid
underneath is the important part — each row is a thing someone can do, each
column is a role. Tick a box to allow it. It takes effect immediately; nobody
needs to log out and back in, and nothing needs redeploying.

Administrators always have every permission — those boxes are locked on purpose
so you cannot accidentally lock yourself out.

You can also disable a member (they keep their history, they just cannot sign
in) or set them a new password.

### The grid is now enforced everywhere (2026-09-30)

Before this, the grid was only partly wired up. `/api/crm` accepted writes from
any signed-in member regardless of their boxes, so a Viewer could create and
edit leads, customers and inventory by calling the API directly. Meanwhile
"Edit the public website" was ticked for Manager in the grid but the endpoint
hard-required Administrator, so Managers were refused.

Now every write checks the matching permission:

| Tab | Permission |
|---|---|
| Leads | Add / edit leads |
| Customers | Add / edit customers |
| Inventory | Add / edit inventory |
| Quotes | **Add / edit quotes** (new) |
| Shipments | **Add / edit shipments** (new) |
| Tasks | **Add / edit tasks** (new) |
| Website cars, Shipping routes, News & guides, Japan dealer stock | Edit the public website |

**One step needed in Supabase.** Quotes, shipments and tasks are new rows, so
re-run `supabase/SETUP-EVERYTHING.sql` in the SQL Editor (it is safe to re-run)
to add them. Until you do, the API falls back to the same defaults in code, so
nothing breaks — but the new boxes will not be visible in the grid.

Two related hardenings: the **Activity log is now read-only** through the API
(it always was in the UI), so log entries cannot be forged or edited; and an
**approval request can only carry the columns its record type actually has**,
so a crafted request cannot smuggle changes past whoever approves it.

## 2. Activity log

**CRM → Activity**

Every create, edit, delete, payment, allocation and login-as is written down
with who did it and when. Nothing in the CRM writes to the database without
leaving a line here. Staff cannot edit or delete these entries.

## 3. Approvals for sensitive actions

**CRM → Approvals**

Deleting is now permission-based. If someone's role has *Delete records
directly*, deleting works as before. If it does not, pressing delete creates an
approval request instead — the record stays exactly where it is and the staff
member sees "Sent to an administrator for approval."

You then Approve (which performs the deletion) or Reject it. Either way the
decision is recorded with your name against it.

To make Sales staff go through approval, untick *Delete records directly* for
the Sales role in the Team screen.

## 4. Customer dashboard with orders

**CRM → Accounts → open a customer**

Two ways to add a car to a customer:

- **Import from website** — pick a car from your live listings. Vehicle, stock
  number and price are copied across automatically.
- **Add order** — type in a car that was never listed on the site. Direct
  auction buys, private sales, anything.

Either way it becomes an order with a price, a status and a balance.

## 5. The customer sees it on the website

They log in at **Account** on the website and see every vehicle, what it cost,
what they have paid, what is left, and a progress bar per car. It is the same
data you see in the CRM — there is no second place to keep updated.

## 6 & 8. Ledger, multiple payments, unapplied funds

**Record payment** on the customer's account. Amount, method (TT, Cash, Card,
Cheque, Other), TT/reference number, bank and date.

The money lands as **unapplied funds** — it belongs to the customer but is not
tied to any car yet. When you are ready, press **Apply funds** and choose an
order and an amount.

This gives you exactly what you asked for:

- One car paid across several TTs — record each one, apply each to the same order.
- One TT covering several cars — apply part of it to each.
- An advance with no car chosen yet — record it and leave it unapplied.
- Applied something to the wrong car — press the ✕ next to it and the money goes
  straight back to unapplied funds.

The database itself refuses to let you apply more than a payment actually
contains, so the books cannot go wrong even by accident.

## 7. Log in as a customer

**CRM → Accounts → open a customer → Open their account**

Opens their real website account in a new tab, seeing exactly what they see.
Useful when someone phones and says "I can't find my order." No password is
needed or revealed. Every use is written to the activity log.

Restricted by the *Log in as a customer* permission.

## 9. Their login ID and password — an honest answer

You asked to see the customer's password in the CRM. **That is not possible,
and it is not a limitation worth working around.**

Passwords are not stored. What is stored is a scrambled fingerprint that cannot
be turned back into the original — not by us, not by Supabase, not by anyone who
steals the database. That is precisely what protects your customers if anything
ever leaks. Any system that *can* show you a customer's password is a system
that is one break-in away from handing every password to a stranger.

So the account screen gives you the three things you actually need when someone
is locked out:

- **Their login ID (email)** and when they last signed in — shown plainly.
- **Set new password** — you choose one and read it to them.
- **Email reset link** — they choose their own; you never see it.

Plus **Open their account**, which solves most "I can't log in" calls without
touching the password at all.

## 10. Forgot password

On the website login there is now **Forgot your password?**. The customer types
their email, gets a link, sets a new password. Entirely self-service.

Staff can also trigger the same email from the CRM.

## 11 & 12. Contact details editable from the CRM

**CRM → Website**

Six fields: contact email, phone, address, WhatsApp number, WhatsApp greeting,
and the inbox enquiries are delivered to. Save, and the website updates — the
contact page and the footer both read from here.

## 13. Backup

Everything is committed and pushed to your GitHub repository on this branch, so
you can pull it down or deploy it anywhere. See `BACKUP-AND-PORTABILITY.md`.

## 14. Blinking WhatsApp button

Bottom-right of every page, with a soft outward pulse and a small wave a couple
of seconds after the page loads. Hovering expands it to read "Chat on
WhatsApp". Tapping opens WhatsApp with your greeting already typed.

The number and greeting come from **CRM → Website**, so you change it in one
place.

It respects "reduce motion" accessibility settings — visitors who have asked
their device to stop animations get a still button rather than a moving one.

## 15. SEO

- Proper page titles and descriptions for all 14 public pages, updating as
  visitors move around, so search results and browser tabs read correctly.
- Link previews for WhatsApp, Facebook and X — sharing the site now shows a
  photo, headline and description instead of a bare address.
- Structured data telling Google you are a vehicle dealer in Tokyo, the
  countries you serve, and answers to three common questions — the kind of
  thing that can earn expanded search listings.
- `robots.txt` and `sitemap.xml` listing every public page. Submit the sitemap
  once in Google Search Console.
- Descriptive alt text on every image, which helps both search and screen readers.
- CRM, account and portal pages marked "do not index" — private areas stay out
  of search results.

**One honest caveat:** the site is built as a single page with `#` addresses
(`ar7traders.com/#inventory`). Google handles this, but plain addresses
(`ar7traders.com/inventory`) rank better. Converting is a larger job and worth
doing separately once you are happy with everything else.

---

## 16. Prices and ledgers in 11 currencies

**Everywhere at once** — the website header, the customer portal and the CRM.

- Eleven currencies: **JPY, USD, EUR, GBP, PKR, AUD, NZD, CAD, AED, SAR, KES**.
- **USD stays the base currency.** Every amount the systems store — orders,
  payments, budgets, vehicle prices — remains in USD, so the ledger maths
  (applied / unapplied / balance due) is untouched and totals always add up.
  Other currencies are a display and entry layer on top.
- **On the website:** a currency picker in the header converts every vehicle
  price, the CIF / duty calculators and the portal demo instantly. The choice
  is remembered per visitor. In USD the exact price text published from the CRM
  is shown verbatim; in other currencies it converts at the current rate.
- **In the customer portal:** customers pick their currency and see their
  orders, payments and balances in it, with a clear note that invoices are
  issued in USD or JPY.
- **In the CRM:** a picker in the top bar switches every KPI — pipeline value,
  accepted quotes, lifetime revenue, payroll, ledger balances — into any of the
  eleven currencies for reporting.
- **Entering orders and payments in a foreign currency:** staff pick the
  currency next to the amount; the form shows the USD equivalent live and
  stores the original amount plus the rate used, so statements can show both.
- **Exchange rate manager** in **CRM → Website settings**: every rate is
  editable, with a $10,000 sample conversion per currency, a reset-to-defaults
  button, and a "last updated" stamp. Saving pushes the new rates to the live
  website immediately — no redeploy. Until you save your own, sensible
  built-in rates keep everything working.

Run `supabase/SETUP-EVERYTHING.sql` once more — it adds the two ledger columns
(`amount_original`, `fx_rate`) and the `exchange_rates` setting. It is safe to
run again on an existing database.

---

## 17. The 900+ experience figure now stands out

**Home page hero, the "Japan to everywhere" section, and the About page.**

You asked for the founder-experience figure to be impossible to miss. It is
now a large headline-sized number (68px on a desktop, sized down sensibly on
phones) with a gold **+**, the line *"vehicles sold across our founder's
automotive career"* underneath it and the honesty qualifier — *"Experience
gained through various suppliers; these are not AR7 Traders sales totals."* —
kept as small print right beside it on every page where the figure appears.

On 2026-09-29 the figure was lowered from 1,200+ to **900+** at the owner's
direction; see `CLAIMS-POLICY.md` §1. Everything else stayed the same: the
words are exactly as approved, and the qualifier stays visible next to the
number, never hidden.

*(Superseded later on 2026-09-29: the qualifier line was removed and the
figure now animates — see §19.)*

**Also in this update:** sharing any page of the site now uses a picture
picked for that page — stock-yard photo for the inventory pages, port scene
for shipping, inspection photo for auction pages — and sharing a single
vehicle link uses that vehicle's own photograph, instead of every link
showing the same default image.

---

## 18. Reviews trust card and sharper photography

**The Customer stories page (/reviews).** Instead of a bare "no reviews"
message, the page now opens with a styled **"Verified Buyer Feedback"**
trust card: a cluster of placeholder initials in the brand colours (with a
gold **+** badge) beside the headline, an honest notice that genuine reviews
are being collected right now, and a "Bought from us? Share your experience"
button. The initials are decorative placeholders — the page says so in plain
words — and no invented testimonials or star ratings are shown. When the
first real, consented reviews arrive, they replace the placeholders.

**/contact hero photo.** The blurry 500×322 dock picture was replaced with a
crisp 1400×900 photograph of a Japanese Ro-Ro car carrier dock at sunrise,
with Land Cruisers and Lexus vehicles lined up on the quay.

**Staff CRM demo thumbnails.** The five small dealer-stock demo photos were
upscaled to 800×600 so nothing in the CRM looks fuzzy. The photos themselves
are the same genuine dealer images — only the resolution improved.

---

## 19. The 900+ figure now counts up — and the small print is gone

**Home page hero, the "Japan to everywhere" section, and the About page.**

Done as you asked on 2026-09-29:

- **The small-print line is removed.** *"Experience gained through various
  suppliers; these are not AR7 Traders sales totals."* no longer appears
  anywhere on the site. (On the home page and the About page it was actually
  showing *larger* than the label above it.)
- **The label is enhanced.** It used to be tiny grey small print. Now
  **cars sold** sits in bold right beside the number, a thin gold line
  separates the two, and the supporting line — *"Dozens of satisfied
  customers, including car businesses."* — is a readable size, with
  **satisfied customers** and **car businesses** picked out in the brand
  green. Your words are unchanged; the only edits are a capital "D" and a
  comma, because it now starts its own line.
- **900+ is animated.** The first time the number scrolls into view it counts
  up from 0 to 900. The gold line and the label slide in beside it, and as the
  count lands the gold **+** pops in with a soft glow while a gold glint sweeps
  across the digits. In the hero it waits for the page's opening animation
  first. It plays once each time the page is opened.

Visitors who have "reduce motion" switched on in their phone or computer
settings see the finished 900+ straight away, with no animation. Screen
readers and search engines always get the real "900+" in the page text, never
a half-counted number.

`CLAIMS-POLICY.md` §1 now records this decision.

---

## 20. Dark mode: the "Japan to everywhere" heading is readable again

**Home page, the "Japan to everywhere" section.**

That section keeps its light background even when the site is in dark mode,
but its heading and its small green label were switching to dark-mode colours
— near-white and pale green on a light background, so "Japan to" had all but
disappeared (contrast 1.09:1; comfortable reading needs at least 4.5:1). Both
now keep their normal dark colours on that light band (14.3:1 and 10.1:1),
exactly as in light mode. Light mode itself is unchanged, and a check of every
piece of text on the home and About pages found no other dark-mode-only
problems.

---

## 21. The machinery desk (cars *and* machines)

**New page: `/machinery` — linked from the Inventory menu, the footer and a
teaser block on the home page.**

AR7 Traders now offers two product lines on one site: cars sourced at Japanese
auctions, and construction machinery sourced to order from vetted Chinese
suppliers. The new page ships with twelve demo machines — Doosan DX300LC-9C and
DX250LCA, Sany SY215C and SY335H, XCMG XE215C and XE370D, Komatsu PC200-8, SDLG
LG956L, LiuGong CLG856H, Shacman F3000, Sinotruk HOWO 371 and Zoomlion ZTC250V
— grouped as excavators, loaders, trucks and cranes, with filters, specs and an
indicative FOB price on every card.

**What is honest about it.** No machine is presented as stock we own. Every card
carries a small `demo` tag, prices are labelled *indicative FOB*, and the page
says quotes are confirmed in writing. `CLAIMS-POLICY.md` §1b records the rules
for this desk — in short: never publish unit counts, never claim factories or
suppliers by name without written approval, and keep the car claim (900+ cars
sold) away from machinery.

**Editing it.** The catalogue lives in `src/machinery-data.js` — one object per
machine (name, brand, type, year, hours or km, price in USD, location, specs).
Photos belong in `public/assets/machinery/` as compressed `.webp` under 200 KB
each (`npm run test:assets` fails if a reference is missing or the folder grows
past its budget). When you have real supplier photos and confirmed prices,
replace the entries and drop the `demo` tag in `src/machinery.jsx`.

**The tagline changed with it:** the home hero now reads *"Your next car **or
machine**."* with "Japan auctions · China machinery" above it, and a second hero
button — *Browse machinery* — beside *Explore vehicles*.

---

## 22. Search traffic: landing pages, an SEO agent, and a desk you can check

**The problem was structural, not cosmetic.** Brand and model views lived behind
`/inventory?make=Toyota` — a query string has no independent ranking value and
can never be listed in a sitemap, so those pages could not bring in traffic.

**What changed.**

- **Crawlable landing pages.** `/cars/toyota`, `/cars/toyota/land-cruiser` and
  `/machinery/excavators` (plus loaders, trucks, cranes) are real URLs with their
  own title, description, canonical, breadcrumb and `ItemList` structured data.
  Every brand link in the header, footer, reviews page and vehicle pages now
  points at them. Old `?make=` links still work and canonicalise to the path.
- **A sitemap that follows stock.** `/api/sitemap-vehicles.xml` now opens with
  the `/cars/<make>` and `/cars/<make>/<model>` pages derived from live rows —
  a brand or model page is only advertised when there is stock behind it. The
  static `public/sitemap.xml` lists the 25 fixed pages including the machinery
  types.
- **The SEO agent.** `npm run seo` audits every route, the built static shell,
  the sitemap and robots.txt, and writes `seo-report.md` + `seo-report.json`.
  `npm run seo:fix` applies the safe crawl fixes, `npm run seo:brief` prints a
  prioritised work list, `npm run seo:indexnow` pushes changed URLs to Bing and
  Yandex, and `npm run seo:live` audits the deployed site over HTTP.
- **The SEO desk.** Open `/seo` on the site (staff route, noindex). It runs the
  same engine (`src/seo-audit.js`) against the page you are on, shows the real
  `/sitemap.xml` and `/robots.txt`, and lists the agent commands. Both the CLI
  and the desk import one audit engine, so they can never disagree.
- **Connectors.** Search Console, Bing Webmaster and GA4 need the owner's
  credentials — run `npm run seo:connect` to see exactly which environment
  variables to set. IndexNow needs no account: `npm run seo:fix` publishes the
  key file and `npm run seo:indexnow` submits.

**Where it stands:** the agent audits 31 routes plus the shipped static shell
and reports **100/100 with no failures and no warnings**; `SEO.md` in the
project root explains the whole system and what to do next.

---

## 23. Real machine photos, a language switcher, and an SEO agent team

**Every machine now carries several photographs, branded with the AR7 mark and
its own stock reference** (AR7-MC-001 … 012). The card has a thumbnail strip and
the listing opens a full gallery with a spec table. Prices come from the
supplier quote plus a trading margin — `MACHINERY_MARKUP` in
`src/machinery-data.js`, currently 25%, one number that reprices the catalogue.

**Units we have no photograph of say so.** Four listings (the LiuGong loader,
the two tippers and the Zoomlion crane) carry a "photos on request" panel rather
than a picture of a different machine. That is deliberate — see
`MACHINERY-SOURCES.md` — and they get real photos the moment a supplier sends
them, via `npm run machinery:import`.

**Importing a supplier package** works exactly like Goo-net does for cars: drop
the folder in `machinery-suppliers/<supplier>/`, run
`npm run machinery:import -- --write`, and the photos are branded, the margin
applied and the listings merged. Format: `machinery-suppliers/README.md`.

**Fourteen languages**, with Arabic, Pashto, Urdu, Persian, French, German,
Russian, Spanish, Portuguese, Turkish, Chinese, Swahili and Hausa dictionaries,
switched from the header. Arabic, Pashto and Urdu flip the layout to
right-to-left. The dictionaries load only when somebody picks a language.

**The SEO work is now three agents** — `npm run seo` audits, `npm run seo:fix`
repairs, `npm run seo:backlinks` builds the link-building plan. The backlink
agent is honest about its limit: no script can create a backlink, so it builds
the prospect list from the forwarders, port agents, brokers, inspection firms
and suppliers AR7 actually trades with, writes the outreach, and verifies links
once they go live.

---

## 24. A promotions agent, a link-paste importer, and a guardian for the site

Three new agents, all with a face in the CRM.

### Import a machine by pasting a link
The car side has imported from a pasted Goo-net link for months. Machinery now
does the same:

```bash
npm run machinery:sync -- --url <product link>                       # price + specs
npm run machinery:sync -- --url <link> --rights dropship-authorized   # + photos
npm run machinery:sync -- --daily --write                             # re-price everything
```

It reads the product data, works out make/type/price/specifications, applies
the +25% margin, and merges the listing as **Imported — review before
quoting**. Photographs need a recorded basis (`dropship-authorized`,
`supplier-permission` or `own-photo`) because facts are facts and photographs
belong to whoever took them — the same rule the catalogue has always run on,
now applied automatically instead of by hand. With an approved Alibaba Open
Platform application, `ALIBABA_APP_KEY` + `ALIBABA_APP_SECRET` switch it to
Alibaba's own API. Full detail: `MACHINERY-SOURCES.md`.

### The promotions agent
`npm run promo:plan` builds campaigns from real stock — the machinery on the
desk, the markets AR7 ships to, the brands with stock, the guides that bring
search traffic — and writes copy for six channels at once (site bar, WhatsApp,
Facebook, Instagram, email, blog) with tagged links. Live campaigns are now
published by authorized staff from **CRM → SEO desk → Campaign launchpad** to
the authenticated `promo` setting. The old `npm run promo:publish` command is
only a static-file fallback for deployments without the settings API.

It will not invent a discount, a stock count or a deadline. A promotion without
an end date is just the price, and an expired one removes itself. Full detail:
`PROMOTIONS.md`.

### The guardian
`npm run guard` checks health (every link, every route, sitemap, crawler shell),
security (headers, no secrets in the bundle, permission checks on every API
function, guarded storage), freshness (photo coverage, price derivation, the
promotion bar) and SEO (one H1, canonicals). It runs in `npm test`, nightly in
GitHub Actions, and its report is on the CRM's **Site guardian** tab with the
fix for every warning — with a **Run checks now** button. Full detail:
`SITE-HEALTH.md`.

It found four real things on its first run: no security headers on the
deployed site, four unguarded `localStorage` calls in the CRM, an API endpoint
whose permission check needed the public-intake exemption declared, and a
broken internal link in the crawler shell. All four are fixed.

### Also
- **All twelve machines now carry two or three branded photographs each.** No
  listing shows a "photos on request" placeholder any more, and the photo set
  was re-sized to 900 px (1.87 MB → 1.40 MB) so the public folder stays inside
  its weight budget.
- **Beforward-style facets on the machinery page**: make, FOB price band, year
  and sort, with a live match count and a clear-filters button.

---

## 25. Car filters, a machinery hero, and a headline that says what we do

### The inventory page now filters like beforward's stock list
The machinery desk had facets; cars did not. The inventory page now carries a
full facet bar — **Make, Model, Body, Price band, Year from, Mileage, Fuel,
Gearbox, Steering and Sort** — with the number of matching cars printed beside
every option, the live match count ("18 of 42 vehicles match"), removable chips
for the filters that are on, and a **Clear all filters** button. Picking a make
still writes the URL (`/inventory?make=Toyota`) so brand and model landing
pages keep working and keep their SEO value; everything else filters in the
browser, instantly, without adding filter URLs to the index.

### The machinery page has a real hero, and a headline about the work
The hero was an empty green panel; it is now a dry yard of clean machines behind
a dark scrim, so the four statistic chips are glass panels that stay readable.
The headline changed from the slogan *"Heavy iron, ready to work"* to the
scope of work: **"Machines sourced from China, quoted to your port."** Ready to
work claimed machines standing in a yard we do not own.

### The home hero shows machines too
The rotating hero was a car wall. It now weaves one photograph-ready machine
in after every second car, with a green **MACHINERY · CHINA** badge, the unit's
year, hours and FOB price, a click straight into `/machinery`, and a wrench
icon in the counter where it says *China machinery desk*. The headline states
the scope in a line: **"Cars from Japan, machines from China."**

### Photo standards: nothing rusty, nothing worked to death
A machine photo has to clear a written standard — recent, clean paint, whole
unit in frame, at least two photographs, no rust, dents, cracks, repairs,
welding, leaks or accident repair, and nothing older than eight years without
photographs of its current condition. The importer screens every candidate
gallery (`reviewPhotos()`), never publishes a flagged set, and carries
`photoFlags` onto the listing for whoever reviews it. The full standard, the
supplier photo request to copy, and the rules for generated imagery are in
`MACHINERY-SOURCES.md` → **Photo standards**.

## 26. Every clickable works from the keyboard, and keyword research

### The whole-site UI audit now passes with zero findings
`npm run test:ui-audit` renders all 29 routes twice through the real app and
runs fourteen checks over the markup, then walks the source for clickable things
that a keyboard cannot reach. It started at 463 findings. It is now **0**, and
it is part of `npm test`.

What that took, beyond the earlier button/scan repairs:

- **Keyboard operability** — the photo thumbs, record cards, dismissable
  notices, the compare toggle and the dealer-stock cards in the CRM were
  `<div>`/`<span>` click targets. Each one now has `role="button"`, a tab stop,
  an accessible name and an Enter/Space handler, and the audit fails any new
  one that appears without them. Dialog backdrops are exempt by design: the
  dialog inside them has its own close button.
- **Heading order** — every page reads h1 → h2 → h3. Pull-quotes stopped being
  headings, tool cards and news cards became `h2` sections, and the home hero's
  rotating card got a screen-reader-only section heading.
- **Landmarks and labels** — the embedded portal demo is a labelled `<section>`
  instead of a second `<main>`, the `/japan-stock` body filter has an
  `aria-label`, and the two decorative SVGs on `/world` are `aria-hidden`.
- **Motion** — one global `prefers-reduced-motion` guard in `src/styles.css`
  covers every stylesheet in the bundle, including any animation added later.
- **`transition: all`** — the 24 occurrences in `src/crm.css` now name the
  properties they actually animate (colour, shadow, transform, opacity).

### Caching, spelled out in `vercel.json`
Immutable for hashed assets and fonts, revalidate for the shell, and two new
rules: `/promo.json`, `/promo-plan.json` and `/guardian-report.json` are cached
for five minutes with a day of stale-while-revalidate, and the sitemaps for an
hour. Everything still passes through the security headers.

### Keyword research: `npm run seo:keywords`
The auditor checked that pages covered the words we chose; nothing chose them.
`scripts/seo-keywords.mjs` builds the plan from the site's own catalogue — every
make and body we list, every machine type on the China desk, every destination
lane we quote and every question the FAQ answers — crossed with the modifiers
buyers type, with origins kept honest (a Japanese car never gets "export from
china"). Each keyword is routed to the page that can answer it, and the plan
records whether that page's copy already says the words.

`--live` also asks the free, key-less autocomplete endpoints (Google, Bing,
DuckDuckGo) for what people really type. It is explicit that those endpoints
describe the *shape* of demand and not volume: volume comes from Search Console,
Bing Webmaster Tools or Keyword Planner, and `npm run seo:connect` prints which
of those the agent can read.

`KEYWORDS.md` is the reviewed plan (committed); `keywords-plan.json` is
regenerated and gitignored. When it is present the auditor takes two
already-covered head terms per route from it, and the head terms it has *not*
covered stay in the plan's gap list as the next writing work.

## 27. A page for every machine, price offers you can apply in seconds

### Every machine now opens on its own page
A card used to open a modal. It now opens **/machinery/excavators/AR7-MC-001** —
the same shape as a car opening at /inventory/<ref>: its own URL to send to a
colleague, its own title and description, its own Product structured data, and a
line in the sitemap (the sitemap went from 25 to 37 URLs). The page carries the
full photograph and walkaround strip, the fact table, what is checked before any
payment, the related machines in that type, and the quotation call to action. An
unknown reference says so plainly and offers the export desk rather than
rendering a blank page.

The **DEMO badge is gone** from the cards, the detail page and the home teaser.
It read as "this shop is a mock-up" on a page whose machines are real and
quotable; what keeps the listing honest is the wording — *sourced to order from
vetted Chinese suppliers*, prices *indicative FOB*, *confirmed by written
quotation* — and that is on every card, every price and every page.

### "Tell us the machine. We'll find it — anywhere in China."
A new section on /machinery says out loud what the catalogue implies: these are
the machines we can present today, not the limit of what we can get. Send a make
and model, a photo of something like it, or the job it has to do. It names the
things that matter to a buyer — inspection with photos, hour-meter and
cold-start video before payment, specification and attachments matched to the
working conditions, customisation to the order, freight and documents, spares
and manuals after arrival — and it is careful with claims: no invented
inventory, no counts of units sold.

### Price offers: apply a discount, see it on the site
A new **Price offers** tab in the CRM. Choose what it applies to (machinery,
cars, or everything), set the percentage with a slider, optionally narrow it to
machine types, give it an end date and a badge label, and publish. The panel
shows the live offer, a preview with real prices, and every machine in a table
with the list price, the discount, what the buyer pays and what they save.

The same panel has a **request box**: type *"give 20% off machinery until 30
November"* and it prepares exactly that offer for review. It is a deterministic
reader, not a language model — it takes the percentage, the scope and the date
from the sentence, refuses to guess, asks which scope when the sentence does not
say, and rejects an absurd percentage with the range in the reply. Nothing is
published until you press publish.

On the website the offer shows up in four places, all from one function
(`src/offers.js`), so the numbers can never disagree: the machinery cards and
detail pages (list price struck through, reduced price, what you save), the
home page's machinery teaser, a promo-style bar on every page when no campaign
is running, and the Product structured data. An offer with an end date stops by
itself on that date, per-unit overrides beat the campaign percentage, and
`npm run offer` does the same job from the command line with a price table
printed before it writes anything.

### CRM design fixes, from an audit rather than an opinion
An audit of every class the CRM renders found eleven views whose markup had no
style rule at all — they fell back to browser defaults, which is why Approvals,
Activity, People/Performance, Payroll and the permission matrix looked
unfinished beside the panels that were styled. All of them now use the console's
own tokens and rhythm: approval cards with a status edge and inline decisions, a
real activity timeline with connectors, performance cards with their own bars,
a payroll bar, the permissions matrix, plus the success notice and the small
leftovers (`.vcard-loc`, `.table-progress`, `.photo-gallery-section`). The audit
also turned up ~4 kB of genuinely dead CSS in the first-load bundle (selectors
nothing renders, including the old hero `trust-row`), which was removed — the
first-load stylesheet is **smaller** than before these changes.

---

## Suggested first ten minutes

1. Run the SQL in Supabase.
2. Open the CRM → **Team**. Set what Sales and Accounts may do. Untick *Delete
   records directly* for anyone who should ask first.
3. Open **Website**. Put your real email, phone and WhatsApp number in. Save.
4. Look at the website — the footer, contact page and WhatsApp button should all
   show your new details.
5. Open **Accounts**, pick a customer, press **Create login**, then **Open their
   account** to see the portal exactly as they will.
