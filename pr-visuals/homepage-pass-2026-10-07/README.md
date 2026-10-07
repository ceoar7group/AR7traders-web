# Homepage / header pass — 2026-10-07, viewport by viewport

Captured against the dev server with a real Chromium (headless), one fresh page
per viewport, storage cleared between viewports, each page fully scrolled before
the numbers were read. Motion was frozen for the captures
(`prefers-reduced-motion: reduce`) — the hero cards fade **in** on every rotation
by design, so a timed grab could otherwise photograph the first frames of a
swap. Full JSON: `audit-2026-10-07.json` in this folder.

## The problem, before

| what | before |
| --- | --- |
| Bar height assumed by the layout | hard-coded per breakpoint: 122 / 140 / 142 / 158 / 160 px |
| Blank band under the bar | the hero was pushed down by those offsets while the bar itself was fixed at `top: 0` |
| Ticker | overlapped by the hero's bottom edge (hero bottom 890 vs ticker top 938 at 1440) |
| `900+ cars sold` | clipped by 42 px (stat 860–932) |
| Bar over the hero on scroll | pinned for the whole page: at scrollY 400 the nav (0–174) sat over `.hero h1` (581×39) and the vehicle window (574×174) at 1440/1280/1024 |
| Machinery hero | bar permanently pinned over the `Machinery desk` headline on the lazy `/machinery` route |

## The fix

* `--head-h` is **measured** (`calc(--promo-h + --head-pad + --ribbon-h + --head-gap + --nav-h + --head-pad)`
  and then written from the bar's own `ResizeObserver`). Nothing hard-codes a
  header offset any more; `src/fixes.css` is deleted.
* `.site > main { padding-top: var(--head-h) }` — the hero starts *below* the
  bar instead of under it, and the reservation shrinks with the promo bar.
* The bar leaves before the hero's **first line of copy** can reach it, so the
  headline, the CTA row, the Cars/Japan-stock links, the `900+` figure and the
  ticker can never be covered; it comes back at the top (24 px hysteresis) and
  the hero region is re-resolved from the DOM so a lazy route chunk is picked up
  without a scroll.
* One owner for the bar's lifecycle (`src/site-header.jsx`) and one for the bar
  itself (`src/site-layout.css`) — the per-breakpoint offsets that used to live
  in `styles.css`, `expanded.css`, `landing-v2.css` and `detail-responsive.css`
  are gone.

## Measured, after (all six viewports, promo bar visible)

| viewport | `--head-h` | hero top | hero bottom | ticker top | bar over hero copy? | `overflowX` |
| --- | ---: | ---: | ---: | ---: | --- | --- |
| 1440×900 | 174 px | 174 | 937 | 937 | no | false |
| 1280×800 | 174 px | 174 | 933 | 933 | no | false |
| 1024×768 | 174 px | 174 | 907 | 907 | no | false |
| 768×1024 | 227 px | 227 | 1625 | 1625 | no | false |
| 390×844 | 213 px | 213 | 1485 | 1485 | no | false |
| 360×740 | 213 px | 213 | 1499 | 1499 | no | false |

* **Header → hero gap**: the hero begins exactly at `--head-h` at every width —
  no unexplained blank band.
* **Ticker**: hero bottom == ticker top at every width; the ticker is never
  overlaid by the hero image and vice versa.
* **Promo dismissed** (`localStorage` key holds the campaign id): `--head-h`
  drops to 138 px (desktop) / 133 px (tablet) / 118 px (phone) and the hero
  starts at that value — the reservation tracks the real bar, it is not a
  constant.
* **Bar lifecycle walk** (scrollY 0 → 10 → 20 → 30 → 60 → 100 → 150 → 260 →
  400 → 700 → 1200 → 0): pinned at the very top, away from the first scroll
  past the boundary, back at 0, and **never** covering `.hero h1`, `.hero-cta`,
  `.founder-stat`, `.ticker` or the vehicle window at any step at any of the six
  viewports.
* **`900+ cars sold`**: at 1440 the figure (142×68), the rule (2×72), the copy
  column and the label do not intersect; nothing paints above the digits
  (`elementsFromPoint` at the centre of the digits returns only the digit span
  and its own wrappers); the glint is the same glyph with a mask, and it settles
  at `opacity: 0`. Verified light **and** dark, hero variant (`is-done`) and
  world/about variant (`is-done`, digits `rgb(4,63,40)` on the world band's
  `rgb(232,237,232)`).
* **Deep refresh / lazy routes**: `/machinery` (a lazy chunk) refreshed at
  scrollY 900, `/inventory` and `/brands` — bar pinned at the top, away as soon
  as the page is scrolled, never over the hero copy; `/account` (no hero)
  keeps the bar at every scroll, as before.

## Screens

| viewport | hero | ticker | promo dismissed |
| --- | --- | --- | --- |
| 1440×900 | [hero](hero-1440x900.jpg) | [ticker](ticker-1440x900.jpg) | [nopromo](nopromo-1440x900.jpg) |
| 1280×800 | [hero](hero-1280x800.jpg) | [ticker](ticker-1280x800.jpg) | [nopromo](nopromo-1280x800.jpg) |
| 1024×768 | [hero](hero-1024x768.jpg) | [ticker](ticker-1024x768.jpg) | [nopromo](nopromo-1024x768.jpg) |
| 768×1024 | [hero](hero-768x1024.jpg) | [ticker](ticker-768x1024.jpg) | [nopromo](nopromo-768x1024.jpg) |
| 390×844 | [hero](hero-390x844.jpg) | [ticker](ticker-390x844.jpg) | [nopromo](nopromo-390x844.jpg) |
| 360×740 | [hero](hero-360x740.jpg) | [ticker](ticker-360x740.jpg) | [nopromo](nopromo-360x740.jpg) |

Also in this folder: [world section at 1440](world-1440x900.jpg),
[`900+` in the world band, light](stat-world-light.jpg) and
[dark](stat-world-dark.jpg).

### Hero composition, in full

The vehicle window is the dominant element at every breakpoint, with the Auction
and Shipping Lane cards inside the same bounded container and smaller than it:

| viewport | visual (container) | vehicle window | auction card | route card |
| --- | --- | --- | --- | --- |
| 1440×900 | 616×540 | **574×493** | 200×105 | 216×157 |
| 1024×768 | 491×461 | **438×381** | 200×105 | 216×157 |
| 390×844 | 372×565 (stacked) | **372×233** | 372×105 | 372×144 |

| viewport | the visual, cropped |
| --- | --- |
| 1440×900 | [hero-visual-1440x900.jpg](hero-visual-1440x900.jpg) |
| 1024×768 | [hero-visual-1024x768.jpg](hero-visual-1024x768.jpg) |
| 390×844 | [hero-visual-390x844.jpg](hero-visual-390x844.jpg) |

(The screenshots step the carousel onto the *China machinery* slide because the
vehicle photographs come from the goo-net CDN, which the capture sandbox cannot
reach — the local machine photographs show the same container, inset and crop.)

**Why some earlier hero screenshots show an empty white window**: not a layout
fault. The rotating vehicle images are goo-net CDN URLs
(`picture1.goo-net.com`, `naturalWidth: 0` here); the container, insets, shade
and float title render exactly as measured above.

## CRM machinery desk — the second half of the work

| screen | what it shows |
| --- | --- |
| [Machinery desk](crm-machinery-desk.jpg) | 13 rows: the 12 seeded machines **plus** the machine that only exists on the public website (`AR7-MC-DEMO`, added by "Importer (auto)"), each row with `Photos`, `Unpublish`, `Archive`, `Edit` |
| [Editor](crm-machinery-editor.jpg) | opening a row gives the full record — stock no, brand, model, origin, price, description — with `Save record`, `Duplicate` and `Delete` |

Import controls on the same screen: **Import from a supplier link** (paste a
product URL) and **Run scraper (up to 24)** per category — no agreement gate,
and every imported photo records a basis instead of blocking the listing.
