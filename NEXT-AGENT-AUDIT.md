# Next agent: audit the whole website and the CRM, end to end

Copy everything below the horizontal rule and paste it as your first message.
Read `README.md`, `START-HERE.md` and `CLAIMS-POLICY.md` before you change
anything — the claims policy is a hard constraint, not a style guide.

---

You are auditing **AR7 Traders** (`ceoar7group/AR7traders-web`), a Japanese
used-car exporter's website and the CRM behind it, now that a large machinery
feature has just been merged (PR #69). Your job is a full end-to-end audit
with fixes. Do not add features. Find what is broken, wrong, or badly
presented, and fix it.

## Where things are

| Area | Files |
|---|---|
| The whole public site | `src/main.jsx` (~5,000 lines, the entire SPA) |
| Cars | `src/crm.jsx` Inventory, Website cars, Japan dealer stock |
| Machinery | `src/machinery.jsx`, `src/machinery-data.js` |
| Import agent | `api/_machinery-import.js`, `?import=machinery` in `api/site-content.js` |
| Nightly jobs | `api/goonet-sync.js` (`?job=machinery`), `.github/workflows/` |
| API | `api/*.js` — **exactly 12 counted Vercel functions, do not add a 13th** |
| SQL | `supabase/SETUP-EVERYTHING.sql` (self-contained), `supabase/*.sql` |
| Dictionaries | `src/i18n.js` (13 languages) |

**Hard constraints you must not break:**
- **12 Serverless Functions, maximum.** New logic goes in `api/_*.js` shared
  modules (free) dispatched from an existing function via a query param.
  Check with `ls api/*.js | grep -v '/_' | wc -l`.
- **Never machine-translate prices, incoterms or shipping terms.** `FOB`,
  `CIF`, `RoRo` stay in Latin script in every language.
- **Prices are always "indicative FOB, confirmed by written quotation."**
- **Never claim stock counts or units sold.** Machinery copy avoids "stock".
- **Every machine in the database is published.** `published` defaults to
  true; `false` means "a person deliberately hid this". Do not reintroduce an
  approval gate.
- **No photograph goes on the site without a recorded rights basis**
  (`dropship-authorized`, `supplier-permission`, `own-photo`). Never copy a
  marketplace photo, never strip a watermark, never invent a specification.
- **The car side and the scraper are load-bearing.** Do not restructure
  `team.js`, `hr.js`, `approvals.js`, `crm.js`, `goonet-sync.js`,
  `goonet-stock.js` just to make something tidier.

**Gates — run all of these before you say anything is done:**
```
npm test                  # every suite; must be 0 failures
npm run build && npm run guard
npm run seo
npm run test:bundle
npm run test:i18n-switch
```
`npm run guard` and `npm run seo` rewrite `PROMO-PLAN.md`,
`public/promo-plan.json`, `seo-backlinks.md` and `public/guardian-report.json`
with only a new `generatedAt`. `git checkout --` those four before committing.

**Commit messages say what broke and why**, not just what changed.

---

## 1. Functional: click through everything and make it work

Do this as a user, not a code reader. `npm run dev`, then:

**The public site** — home, inventory, `/cars/<make>`, `/inventory/<ref>`,
Japan stock, machinery (`/machinery`, `/machinery/excavators`,
`/machinery/excavators/AR7-MC-001`), shipping, brands, news, contact,
account, portal. For each: does it load, does anything throw, is there a
console error, does a deep link work on a hard reload?

**The CRM** — every one of the 21 sidebar tabs. Add a record, edit it, delete
it, search, sort, export CSV, switch view modes. Specifically:
- Add a machine in the Machinery desk with three photos and a price. It should
  appear on the public site immediately.
- Change its price. The new price should show, and the old one should be
  visible as *was / now*.
- Unpublish it. It should leave the site **and** the machinery sitemap, and
  its old URL should return an honest "no longer listed" page that is
  `noindex` — not a blank screen and not the type page's title.
- Paste a supplier link into the import box. Preview should show the machine
  and **write nothing**. Import should then add it, published, attributed to
  the importer rather than to you.

**What to look for, in priority order:** anything that throws or renders
blank; anything that silently does nothing when clicked; a button that lies
about what it did; state that goes stale after an edit; a form that accepts
nonsense; a list that shows a record it should not.

## 2. SEO: find real problems and fix them

Run `npm run seo` and read `seo-report.md` — but do not trust a green score.
The auditor that produced it is the same code that could be wrong. Check by
hand:

- Titles and descriptions: unique per page, no `undefined`/`null`/`NaN`,
  accurate to what the page shows.
- Canonicals: correct per route, never pointing at a page for something that
  is gone.
- `robots`: staff pages (`/crm`, `/account`, `/portal`, `/studio`, `/seo`) are
  `noindex`; everything a buyer should find is indexable.
- Structured data: validate the Car/Offer/Breadcrumb JSON-LD by hand. A price
  of `undefined`, an `offers` block on a car with no price, or an
  `og:image` pointing at a file that does not exist are all real bugs.
- Both sitemaps: `/api/sitemap-vehicles.xml` and
  `/api/sitemap-machinery.xml`. Every URL in them must be a route the SPA
  actually resolves — a sitemap advertising a dead path is worse than no
  sitemap. Check `public/robots.txt` advertises all three sitemaps.
- Images: `alt` text, intrinsic `width`/`height`, lazy loading, no layout
  shift.
- Headings: one `h1` per page, in a sensible order.

## 3. Design, UI and UX

This is where I expect the most findings. Be specific and fix them.

- **Buttons.** Is every button obviously a button? Big enough to hit (aim for
  at least 44×44 px on touch)? Does it have a hover, focus and disabled
  state? Does a disabled button say *why*? Is the primary action on each page
  visually the primary action?
- **Sizes and spacing.** Anything cramped, overlapping, or misaligned.
  Heading scale consistent? Text long enough to break a layout — try a long
  machine name, a long brand, a big price, a long summary.
- **Visibility and contrast.** Any text too light, too small, or lost against
  its background. Check the CRM's dark theme and light theme **both**.
- **Responsive.** 360 px, 414 px, 768 px, 1024 px, 1440 px. Nothing should
  overflow horizontally or become unreachable.
- **RTL.** Switch to Arabic, Persian and Urdu (`/ar`, `/fa`, `/ur`). Layout
  must mirror. Watch for icons that should flip, text that should not, and
  padding on the wrong side. `scripts/i18n-switch.test.mjs` pins 11 physical
  leading edges — if you touch `src/i18n.css`, keep it green.
- **Machinery pages specifically.** The catalogue, the type pages and the
  detail page were built quickly. Check the photo gallery, the specification
  table, the was/now price row, and the "indicative FOB" wording is always
  present wherever a price or discount appears.
- **Empty states.** Every list, filtered to nothing, should say something
  useful rather than showing a blank panel.

## 4. Known weak spots — check these first

- **The `ps`, `ha` and `sw` dictionaries are machine-written** and have never
  been read by a native speaker. Expect wrong words, wrong register, and
  homoglyphs (a Greek capital iota once reached the Hausa footer). Scan for
  `/[\u0370-\u03FF\u0400-\u04FF]/` across `fr, de, es, pt, tr, sw, ha, zh`
  after any dictionary edit.
- **The machinery feature is new and barely exercised against a real
  database.** Every SQL file in `supabase/` has been written but **never
  executed** — there was no reachable Supabase instance. Read
  `supabase/machinery.sql` and the migration for column/type mistakes before
  you trust them.
- **I could not reach the live site from my sandbox** (`curl` to
  ar7traders.com returned nothing), so no behaviour has been verified against
  production. You may be the first to see it actually running. Check the
  Vercel deployment for the merge commit.
- **The nightly machinery job has never run.** Look at
  `.github/workflows/machinery-sync.yml` and `?job=machinery` in
  `api/goonet-sync.js`. The first real run is yours to watch.
- **Overlay trap:** `content-visibility: auto` in `src/expanded.css` clips
  full-screen overlays. Portal them to `document.body`.
  `scripts/overlay-portal.test.mjs` enforces this.

## 5. Report back

For everything you fix, say: what was wrong, what you saw that proved it, and
what you changed. For anything you could not fix, say why and what you would
need. If you find something that looks like a deliberate decision but seems
wrong to you, flag it rather than reversing it — several odd-looking choices
in this codebase are load-bearing.

Do not claim a check passed if you could not run it. Hand me the command
instead.
