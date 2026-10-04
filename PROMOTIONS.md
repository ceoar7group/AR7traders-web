# The promotions agent

`scripts/promo-agent.mjs` builds campaign candidates from verified stock and
writes channel-ready copy. Staff publish or clear the live campaign from the
CRM's **SEO desk → Campaign launchpad**; the SEO desk saves to the existing
`promo` site setting through the authenticated settings API.

```bash
npm run promo:plan                 # build candidate campaigns from real stock
npm run promo:social -- --id machinery-excavators   # copy for every channel
npm run promo:report               # inspect the local fallback and run history
```

Use the **SEO desk → Campaign launchpad** to publish or clear the live site
campaign. Publishing requires the `settings.write` permission and updates the
public site without a deploy.

`npm run promo:publish` is retained only as a legacy static-file fallback for a
deployment without a working settings API. It edits `public/promo.json`; the
live `promo` setting takes precedence whenever it is available. Do not use this
command for the normal production publishing flow.

## What a promotion is here

A promotion is a reason to buy this week, not a banner. The agent generates
campaign candidates from things that are true right now: the machinery actually
on the desk (with the make, type and FOB band that stock falls into), destination
markets AR7 quotes to, brands with stock behind them, and the buying guides that
bring search traffic. It never generates scarcity.

## What it refuses to do

- **It will not invent a discount.** `--discount` must be a real number you
  decide on, because a "5% off" that a quotation then contradicts is a refund
  waiting to happen. Campaign margin messaging is optional and separate from
  actual per-stock price reductions.
- **It will not state a stock count, a sold count, or a deadline that is not
  real.** No countdowns. A timer that resets is the fastest way to lose a
  buyer's trust, and `CLAIMS-POLICY.md` forbids the claims that usually go with
  it.
- **It will not post anywhere by itself.** It writes the copy and the tagged
  links; sending is a human action on a real account. See the note at the end of
  `scripts/promo-agent.mjs` for why automated posting needs the owner's own
  token and an approved app — and why that is a decision to make deliberately,
  not something a script should assume.

## The channels it writes for

| Channel | What is produced |
| --- | --- |
| Site | a candidate message for the public PromoBar, which staff publish in the SEO desk |
| WhatsApp | a short message a buyer can reply to, with the link |
| Facebook | a post with the link at the top |
| Instagram | caption plus the link for the bio |
| Email | subject and body, ready to paste |
| Blog | a title and body pointing at the guide or the catalogue page |

Every link carries `utm_source`, `utm_medium=promo` and `utm_campaign=<id>`, so
traffic can be attributed per campaign once the GA4 connector is set up
(`npm run seo:connect`).

## Where a campaign lives

1. **The `promo` setting is authoritative.** The SEO desk's **Campaign
   launchpad** writes it using the authenticated `/api/settings` endpoint. The
   `PromoBar` reflects the saved campaign without a deploy; clearing it in the
   desk removes it from the mounted public bar.
2. **`public/promo.json` is a fallback only.** `PromoBar` reads it when the
   settings API has not supplied a campaign. The legacy `npm run promo:publish`
   command edits this file for static-only deployments; it does not update the
   authoritative live setting.
3. **`PROMO-PLAN.md` and `public/promo-plan.json` are planning artifacts.**
   `npm run promo:plan` generates candidate copy from current stock. Staff
   select and publish the campaign from the SEO desk rather than from a CRM
   Promotions panel.

`api/settings.js` validates the shape before it will store it: the headline is
capped, the link must be an internal path (a promotion cannot point off-site),
the optional campaign margin message is preserved, and the end date must be a
real date.

## End dates are honoured

The public bar removes a campaign when `until` has passed, wherever it is
rendered from. An expired campaign is not shown to anybody. The Site Guardian
checks the static fallback file for stale dates; production campaign status
and clearing live in the SEO desk.

## In the CRM

Open **SEO desk → Campaign launchpad** to review the current campaign, enter its
headline, supporting line, internal destination and optional end date, then
publish or clear it. Campaign messaging is separate from per-stock pricing:
real vehicle and machinery discounts are still entered in **Price offers**.
The SEO desk is staff-only, noindex and never linked from public navigation.

## Two different things: campaigns and stock discounts

| | Campaign (`promo`) | Stock discount (`stock_discounts`) |
| --- | --- | --- |
| What it is | A message: a headline, a call to action, an internal link | A percentage attached to one vehicle or machine reference |
| Where it shows | The PromoBar campaign row | That item's cards/details and structured data, plus a separate selected-stock savings row in the PromoBar |
| Written by | CRM → **SEO desk → Campaign launchpad** (`settings.write`) | CRM → **Price offers**, or `npm run offer` |
| Ends | On its optional `until` date | On that stock entry's `until` date |

Campaign and stock discounts are validated by the existing settings API. The
campaign can be live alongside selected-stock savings; dismissing one notice
does not hide the other. Stock discounts are never catalogue-wide and always
remain tied to their own stock key. `src/offers.js` is the shared arithmetic the
website, CRM preview and `npm run offer` use, so public cards, detail prices and
structured data stay aligned.

`npm run offer -- "20% off machinery until 30 November"` is the command-line
face of the same per-stock editor, and `npm run offer -- --status` prints the
saved stock discounts.
