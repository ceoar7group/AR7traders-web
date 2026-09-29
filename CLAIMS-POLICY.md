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

- The website may show reviews **only if** they are from real customers,
  collected with their consent, and displayed verbatim on the page.
- The current site shows a **"Verified Buyer Feedback" trust card** that
  states reviews are being collected from customers — not a fabricated
  rating. Its decorative initials cluster is `aria-hidden` and the page copy
  explicitly discloses the initials as placeholders, not published reviewers.
  Do not attach names, faces, quotes or star ratings to it until real,
  consented reviews exist.
- Once ≥1 genuine review is published on-page, per-review markup may be
  added. `aggregateRating` requires a genuine visible collection of reviews
  and should be discussed with the owner first.

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
