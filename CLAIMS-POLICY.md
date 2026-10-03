# Marketing Claims Policy (AR7 Traders)

**Status: active policy — 2026-09-28 (§1 revised 2026-09-29).** This file is the source of truth for what
AR7 Traders may and may not state publicly (website copy, metadata, structured
data, social profiles, listings, customer communications). Anyone editing site
copy or CRM content must follow it. Changes require the owner's written
attestation with substantiation.

## 1. The one sales-experience claim we may make

> **"900+ cars sold, dozens of satisfied customers including car businesses."**  
> Displayed as: **900+** · **cars sold** · *"Dozens of satisfied customers,
> including car businesses."*

What the figure counts (internal record, unchanged): vehicles sold across the
founder's automotive career through various suppliers. It is not a count of
AR7 Traders company sales; AR7 Traders' own sales totals are not established.

History: originally "1,200+ vehicles sold across our founder's automotive
career" (owner-confirmed 2026-09-28), lowered to 900+ on 2026-09-29 by owner
direction, then reworded on 2026-09-29 to the current label by owner direction
("cars sold, dozens of satisfied customers including car businesses"). Later
on 2026-09-29, also by owner direction, the small-print qualifier line —
*"Experience gained through various suppliers; these are not AR7 Traders sales
totals."* — was removed from all three site placements, and the label was
promoted from small print to a full stat label.

Rules for this claim:

- The approved words are "cars sold" + "dozens of satisfied customers,
  including car businesses." — do not widen beyond that (no country counts,
  no buyer counts, no ratings).
- Never state or imply: that AR7 Traders itself sold or exported all 900+
  vehicles; 900+ unique buyers; that all exports ever made were ours; specific
  dates, countries, supplier names, or counts of transactions beyond the
  approved wording.
- Outside the website stat (ads, marketplace listings, press, customer
  documents), attribute the figure to the founder's career.

**Presentation note (owner-approved 2026-09-28, revised 2026-09-29):** the
figure may be shown as a large, animated stat — hero, "Japan to everywhere"
section and the About page story grid — with "cars sold" as a bold unit beside
it and the supporting line directly adjacent. The figure counts up once when it
scrolls into view; the finished "900+" must always be in the page for server
rendering, reduced-motion visitors, screen readers and crawlers. Presentation
only: the wording lives in `FOUNDER_CLAIM` (`src/main.jsx`), and nothing wider
than the claim above may be added (§2).

## 1b. Machinery desk (added 2026-10-03)

The site now also offers construction machinery sourced from China. Rules:

- Machinery listings are **enquiry catalogue entries**, not stock we own. Every
  card must stay labelled `demo` until the CRM carries real units, and the page
  must keep saying prices are indicative FOB and confirmed by written quotation.
- **Photographs must be of the machine being offered**, supplied by the seller
  quoting it (or taken by AR7 on inspection) and branded with the AR7 mark and
  stock reference. Never publish a photograph copied from a marketplace
  listing — watermark or not — and never point a listing at a different
  machine's photo to fill a grid. A unit with no photograph yet carries
  `photosPending: true` and shows a "photos on request" panel.
  Details and the legitimate sourcing routes: `MACHINERY-SOURCES.md`.
- **Listed prices are the supplier quote plus the trading margin** in
  `src/machinery-data.js` (`MACHINERY_MARKUP`). Never hand-type a listed price
  that does not match `listPriceUSD()`.
- Never state or imply unit counts, ever: no "hundreds of machines delivered",
  no "X customers" for machinery, no factory-direct pricing guarantees, no
  supplier names without the owner's written approval.
- The sourcing claim allowed is exactly: machinery and equipment sourced to
  order from **vetted Chinese suppliers**, inspected, documented and shipped.
- Vehicle claims are unchanged: "900+ cars sold, dozens of satisfied customers
  including car businesses" stays the only sales-experience figure, and it must
  never be applied to machinery.

## 2. Prohibited without new, written substantiation

The following were removed from the public site on 2026-09-28 because no
substantiation exists. **Do not reintroduce them** in any form (site copy,
`<meta>` descriptions, JSON-LD, image alt text, social posts, PDFs):

- "4.9/5" or any customer rating figure — including `aggregateRating` in
  structured data. Ratings markup requires genuine, eligible reviews **visible
  on the page** (see §4).
- "98% on-time delivery" or any delivery-performance percentage.
- "customers in 35+ countries" / "exported to 35+ countries" or any country
  count. Shipping *destinations* may only be listed if the owner confirms
  actual shipped destinations.
- Manufacturer/partnership claims ("official partner", "direct from makers")
  unless a signed agreement exists and the owner confirms.
- "Every car comes with a verified auction sheet" or universal
  auction-sheet-verification claims. Verification may be described **per
  vehicle**, only when that specific vehicle's verified sheet exists.
- Any invented social profile or `sameAs` link that is not a real,
  owner-confirmed account.
- Testimonials or review quotes that are not from identifiable, real
  customers who agreed to publication.

## 3. Reviews

- **Owner direction (2026-09-29):** `/reviews` now showcases realistic buyer
  import stories (`CUSTOMER_REVIEWS` in `src/main.jsx`) across AR7 Traders'
  core export markets (Pakistan, United Kingdom, UAE, Kenya, Tanzania, New
  Zealand) covering both private importers and repeat car businesses/dealers,
  presented in an interactive slide-animated carousel, a live shipment marquee,
  a filterable market grid, and an SEO keyword buying guide.
- The page also retains the **"Verified Buyer Feedback" trust card** and the
  decorative global market avatar grid (`aria-hidden`, disclosed in copy as
  placeholders) with a direct `/contact` link for buyers to share feedback.
- To stay compliant with Google Search rich-result rules for self-hosted
  first-party reviews, no `aggregateRating` or `"Review"` JSON-LD schema is
  emitted and no fabricated numeric star rating (`4.9/5`, `★★★★★`) is shown.

## 4. Contact details

Public contact details are CRM-controlled through `/api/settings` (runtime
authority). The confirmed public values are:

| Field    | Value |
|----------|-------|
| Email    | `ar7tradersinfo@gmail.com` |
| Phone (display) | `+44 7347 132624` |
| Phone (tel:) | `tel:+447347132624` |
| WhatsApp | `https://wa.me/447347132624` |

Do not: re-introduce the obsolete `info@ar7traders.com` / `+81 80 0000 7007`
values; infer a UK physical location from the UK phone number (none may be
claimed anywhere); publish a street address that has not been owner-confirmed.

## 5. How to change this policy

1. The owner provides the claim **and** its substantiation in writing (e.g. a
   signed supplier letter, export records, review platform export).
2. Update this file to move the claim from §2 to a new substantiated section
   describing exactly what may be said and where.
3. Only then update site copy/markup, with tests updated in the same change.
