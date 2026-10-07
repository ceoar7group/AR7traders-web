# Where machinery photos, specs and prices come from

This is the rule the machinery desk runs on, and the reason it is written down
is that "just take it from Alibaba" sounds harmless and is not.

## The rule

**Publish photographs of machines we are actually quoting, supplied by the
seller who is quoting us.** Nothing else.

Three things follow from that, and all three are load-bearing:

1. **A photo belongs to whoever took it.** A watermark is not what makes it
   copyrighted — it is a label saying who owns it. Removing the label is a
   *separate*, more serious problem than the copying itself (it is
   "removing copyright management information"), and it is the version of
   this that gets a hosting account suspended.
2. **Marketplace listings carry the seller's own identity.** Their model
   numbers, their spec claims, their prices. Publishing those as AR7's
   catalogue means quoting a machine we cannot deliver at a price we cannot
   honour.
3. **Plagiarism detectors run on images now.** Chinese suppliers
   reverse-image-search their own listings routinely and file platform
   complaints. A takedown on `ar7traders.com` costs more than any traffic the
   listings would have brought.

## The legitimate routes — in order of how well they work

### 1. Ask the supplier (this is the one that works)

You are buying a machine from them. Before you pay, ask for:

- photographs of the **actual unit** — four corners, the hour meter, the spec
  plate, the undercarriage, the engine bay;
- a **cold-start video** and a walkaround video;
- the price, FOB, in USD;
- the Chinese **nameplate data** (model, serial, year).

Sellers send this happily — it is how they close a sale. Those photographs are
yours to publish: you are the buyer and you are reselling. This is exactly how
the car side works with Goo-net.

Feed them in like this:

```
machinery-suppliers/
  shandong-partner/
    supplier.json
    photos/unit-1.jpg  unit-2.jpg  unit-3.jpg
```

Then:

```bash
npm run machinery:import            # preview and validate
npm run machinery:import -- --write # merge into the catalogue
```

The importer brands each photo with the AR7 mark, the machine name and the
stock reference (`scripts/brand-machine-photo.sh`), applies the trading margin
from `src/machinery-data.js`, and refuses any listing that has no photograph.
Full format: the header comment in `scripts/import-machinery.mjs`.

### 2. Manufacturer spec sheets (for the technical figures)

Doosan, Sany, XCMG, SDLG, LiuGong, Shacman, Sinotruk and Zoomlion all publish
product brochures for dealers and resellers. Those are the right source for
`specs` — operating weight, engine model, bucket size, rated load. Facts are
not copyrightable, and the sheets are published to be used this way.

The specs currently in `src/machinery-data.js` are the figures buyers check
first, in English, on every listing.

### 3. Being on Alibaba legitimately

Register as a **seller** on Alibaba / Made-in-China and publish a company
profile with *your own* photographs of the units you are offering, and a link
to `ar7traders.com`. That is what the platform is for, it earns a real link,
and it cannot get your account suspended.

`npm run seo:backlinks -- --plan` lists this as a prospect alongside the
freight forwarders, port agents and inspection companies.

## Prices and the trading margin

`supplierPrice` in `src/machinery-data.js` is what the supplier quoted, FOB, in
USD. The listed price is that plus `MACHINERY_MARKUP` (currently `0.25`, i.e.
+25%), rounded to the nearest $50. It is one number, in one place:

```js
export const MACHINERY_MARKUP = 0.25;
```

Change it and the whole catalogue reprices. Every card shows the result under
*indicative FOB*, and the page states that the price is confirmed by written
quotation — which is what a trading margin is: a quote, not a published tariff.

## Adding a machine from a link (the Goo-net equivalent)

The car side has imported from a pasted Goo-net link for months. The machinery
side now does the same:

```bash
# facts only — price and specification from any product link
npm run machinery:sync -- --url https://www.alibaba.com/product-detail/…

# with the supplier's own photographs
npm run machinery:sync -- --url …                          # photos included
npm run machinery:sync -- --url … --rights supplier-permission   # a specific basis

# a whole list, one link per line
npm run machinery:sync -- --file links.txt --rights supplier-permission

# re-check every sourced listing's price
npm run machinery:sync -- --daily --write
```

It reads the page's structured data and specification table, works out the
make, type, price and specifications, applies `MACHINERY_MARKUP`, and prints the
resulting listing. `--write` merges it into `src/machinery-data.js` with status
**Imported — review before quoting**, so nothing reaches a customer without a
person looking at it first.

**Photographs import with the listing.** 2026-10-07, owner instruction: the
machinery importer works exactly like the car importer — the photographs the
supplier publishes on their own listing come across with it, so a machine
imports and lists *with* its pictures instead of waiting for paperwork. The
basis for each photograph is still **recorded** on it; that is provenance for
the desk to audit, not a gate on the listing:

| basis | when it applies |
| --- | --- |
| `supplier-listing` | the photo the supplier publishes on their own product page or marketplace listing for buyers — the default for every import |
| `supplier-permission` | the supplier sent you the photographs (WhatsApp, email, WeChat) to sell from |
| `own-photo` | AR7 or its inspector took the photograph |
| `dropship-authorized` | a reseller/dropship programme grants use of the product images |

A watermark is a label, not the source of the right, so the importer never
strips one. Made-in-China's image CDN is on the known-watermark list: those
copies are **counted and flagged for replacement** in the CRM (`photo basis
missing` / watermark review chips) rather than being dropped, which is what the
desk used to see as "the scraper imported nothing".

The one remaining gap is a listing the supplier publishes with *no* photograph
at all: it imports with real price and specification and is marked
`photosPending`, showing up in the desk's review queue.

### Alibaba, the sanctioned way

Scraping a marketplace is against its terms and breaks the first time they
change their markup. Alibaba.com runs an **Open Platform** for exactly this:
authorised applications get product data, prices and images through an API.
Set `ALIBABA_APP_KEY` and `ALIBABA_APP_SECRET` (from an approved application on
your own Alibaba account) and the `alibaba-open` adapter uses that route; the
importer prints which adapter it used every time, so you can always see which
one produced a listing.

Chinese supplier sites frequently block datacentre IPs. When a page comes back
empty the importer says so, and with `JINA_API_KEY` set it retries through a
reader relay — the same fallback the Goo-net crawler uses.

## How a machine reaches the website

Three surfaces, one catalogue (`src/machinery-data.js`):

| Surface | URL | Notes |
| --- | --- | --- |
| Type page | `/machinery/excavators` | The catalogue page for that type, listed in the sitemap |
| Hub | `/machinery` | All types, with make / price / year facets |
| **Machine page** | `/machinery/excavators/AR7-MC-001` | The unit's own page: `machineHref(machine)` builds it, `machineByRef(ref)` resolves it. Its own title, description, Product structured data and sitemap entry |

`npm run seo:fix` adds one URL per machine to `public/sitemap.xml`, so a new
unit is crawlable without touching the sitemap by hand — run it after adding
entries to the catalogue.

## What we promise about machines we do not list

The catalogue is what we can present today, not the limit of what we can
source. The page says so, and says how: send the model, a photo of a similar
machine, or the job it has to do, and the China desk checks the factories and
yards. Two claims are made and both are true by construction:

- **Quality checked before quoting** — supplier vetting, hour-meter and service
  record, structure and undercarriage inspection, cold-start video and
  walkaround before any payment (see *Photo standards* above).
- **Specified / customised to the order** — attachments, boom and arm lengths,
  buckets, tyres, guards and paint can be specified for the working conditions
  and the market the machine is going to.

Never claim: units in stock, units sold, delivery counts, or a price that no
supplier has quoted.

## Photo standards

Every photograph on this site — imported from a supplier, taken by our own
inspector, or generated for a hero — has to show a **current, clean, whole
machine**. That is the bar the importer screens against, and it is what AR7 is
judged by before a buyer reads a single price:

- **No rust, corrosion or peeling paint.** A machine can be a few years old;
  it cannot look abandoned.
- **No dents, cracks, welding, missing panels or obvious accident repair.**
- **No mud, caked dust or a yard full of scrap in the background.** Dry,
  tidy ground; the machine is the subject.
- **The whole unit in frame.** A close-up of a bucket proves nothing about a
  machine's condition.
- **Recent enough to mean something** — within eight years, and only with
  photographs that show its *current* condition. Older units are quoted as
  older units, never photographed as if they were new.
- **At least two photographs**: a machine has more than one side.

### How it is enforced, not just stated

`PHOTO_STANDARD` and `reviewPhotos()` in `src/machinery-source.js` screen every
candidate gallery before anything is published:

| Trigger | What happens |
| --- | --- |
| Listing copy mentions rust / corrosion / damage / dents / cracks / salvage / repaint / welding / leak / fire / accident | flagged |
| Fewer than `minPhotos` (2) photographs | flagged |
| Unit older than `maxAgeYears` (8) | flagged — publish only with photographs of its current condition |

A flagged gallery is **never published automatically**. The listing still
imports with its real price and specification, carries `photoFlags` for
whoever reviews it, and goes live in the `photosPending` state instead. The
only way past the screen is `--allow-photo-flags`, which exists so a human who
has actually looked at a clean machine with an unfortunate title is not
blocked by a keyword.

There is no "fix it in Photoshop" route. Retouching a photograph to hide a
machine's condition is the one thing that would make every other standard here
pointless.

### Asking a supplier for photographs

Send the checklist, not the word "photos":

> Please send 3–6 photographs of this actual unit: all four sides, the cab
> interior, the hour meter, and any repaired or repainted panel. Dry ground,
> daylight, no people in frame. If the machine has visible rust, dents or
> repainting, say so — we quote what is there.

### Generated imagery

The same standard applies when an image is generated rather than imported: the
prompt must ask for a **recent machine, clean paint, no rust, no dents, no mud,
no damage, whole unit in frame, dry tidy yard, no people and no third-party
branding**, and the result is checked against the list above before it goes
into `public/`. Generated images are only used as decoration — a hero
background, a section texture — never as evidence of a specific machine that is
for sale. See §"Units we have no photograph of yet".

## Units we have no photograph of yet

A machine with `photosPending: true` carries **no image at all**. The card shows
a "photos on request" panel instead.

This is deliberate. The alternative — pointing the card at another machine's
photograph to fill the grid — puts a picture in front of a buyer that does not
match what arrives at their port. All twelve units in the current catalogue
carry two to three branded photographs each; any unit that loses that coverage
(an import with no rights basis, a supplier photo that is withdrawn) falls back
to this state rather than borrowing a neighbour's picture.

## What never goes on this site

- Photographs from a marketplace listing, watermarked or not.
- Another seller's listing text, translated or otherwise.
- Any claim about how many units AR7 has sold or delivered. See
  `CLAIMS-POLICY.md` §1b.
