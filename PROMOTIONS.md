# The promotions agent

`scripts/promo-agent.mjs` — one agent that decides what to promote, writes the
copy for every channel AR7 actually uses, publishes the campaign to the site,
and keeps a record so the same campaign is not run into the ground.

```bash
npm run promo                      # what is live, and what has been run
npm run promo:plan                 # build this week's campaigns from real stock
npm run promo:publish -- --id machinery-excavators --until 2026-11-30
npm run promo:publish -- --none    # take the bar down
npm run promo:social -- --id machinery-excavators   # copy for every channel
npm run promo:report               # what the site has shown and what has run
```

## What a promotion is here

A promotion is a reason to buy this week, not a banner. The agent generates
campaigns from things that are true right now: the machinery actually on the
desk (with the make, type and FOB band that stock falls into), destination
markets AR7 quotes to, brands with stock behind them, and the buying guides that
bring search traffic. It never generates scarcity.

## What it refuses to do

- **It will not invent a discount.** `--discount` must be a real number you
  decide on, because a "5% off" that a quotation then contradicts is a refund
  waiting to happen — and the site's own guardian checks for exactly this.
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
| Site | the promotion bar, above the header, on every page — dismissible |
| WhatsApp | a short message a buyer can reply to, with the link |
| Facebook | a post with the link at the top |
| Instagram | caption plus the link for the bio |
| Email | subject and body, ready to paste |
| Blog | a title and body pointing at the guide or the catalogue page |

Every link carries `utm_source`, `utm_medium=promo` and `utm_campaign=<id>`, so
traffic can be attributed per campaign once the GA4 connector is set up
(`npm run seo:connect`).

## Where a campaign lives

Three places, in order of authority:

1. **The `promo` setting** — what the CRM's *Site guardian → Promotions* panel
   writes (or `npm run promo:publish`, which reads the same key). The site's
   promotion bar shows it on the next page load, with no deploy.
2. **`public/promo.json`** — written by the agent into the built site. This is
   what a visitor sees if the API is unreachable.
3. **`public/promo-plan.json`** — the campaign list the CRM panel offers, so the
   list an operator picks from is the list the agent generated, never a second
   hand-maintained copy.

`api/settings.js` validates the shape before it will store it: the headline is
capped, the link must be an internal path (a promotion cannot point off-site),
the discount must be between 1 and 40, and the end date must be a real date.

## End dates are honoured

The bar removes itself when `until` has passed, wherever it is rendered from.
An expired campaign is not shown to anybody, and the guardian flags a live
promotion whose end date has gone by — that check exists because the failure
mode is silent: nobody notices a banner that should have come down.

## In the CRM

**Site guardian → Promotions** shows what is live, who published it, whether a
discount is attached, and the campaigns available to publish. Publishing needs
the same permission as editing the website (`settings.write`); without it the
button is disabled rather than hidden, so a viewer can see the control exists.

## Two different things: campaigns and price offers

| | Campaign (`promo`) | Price offer (`offer`) |
| --- | --- | --- |
| What it is | A message: a headline, a call to action, a link | A number: a percentage off the listed price |
| Where it shows | The promo bar at the top of every page | The machinery cards, machine pages, the home teaser, a bar when no campaign is live, and the Product structured data |
| Written by | CRM → Site guardian → Promotions, or `npm run promo:publish` | CRM → **Price offers**, or `npm run offer` |
| Ends | On its `until` date | On its `until` date |

Both are public settings, both are validated on write, and both stop by
themselves when their end date passes. A campaign can say anything; an offer
changes the price a buyer reads, so it is applied by one function
(`src/offers.js`) that the website, the CRM preview and `npm run offer` all call
— the card, the detail page and the structured data cannot drift apart.

`npm run offer -- "20% off machinery until 30 November"` is the command-line
face of the same panel, and `npm run offer -- --status` prints what is live now.
