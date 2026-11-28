# Performance audit — 2026-11-27 (mobile Lighthouse round)

What the owner's panel said, what was measured, what was changed, and — just as
important — what was tried, measured and **not** shipped. Numbers here are
reproducible with the commands at the bottom.

The panel (`Lighthouse 13.6`, custom throttling):

| Metric | Value | Verdict |
|---|---|---|
| First Contentful Paint | 0.2 s | good |
| Largest Contentful Paint | 0.8 s | good |
| **Total Blocking Time** | **230 ms** | **orange** |
| **Speed Index** | **1.4 s** | **orange** |
| CLS | 0.034 | good |

Two different problems were hiding in those two orange numbers.

---

## 1. Speed Index 1.4 s — the page was ready long before it looked ready

FCP at 0.2 s and LCP at 0.8 s with Speed Index at 1.4 s is not a bandwidth
shape. It means visual progress kept happening after the page was readable.

Cause: the hero entrance used filled animations, so each element was **invisible**
until its turn, and the founder figure then counted from zero.

| Element | Before | Landed at |
|---|---|---|
| eyebrow | `.8s` +`.05` | 0.85 s |
| `h1` (the LCP element) | `.9s` +`.15` | 1.05 s |
| hero copy | `.9s` +`.3` | 1.20 s |
| CTAs | `.9s` +`.45` | 1.35 s |
| founder figure | `.9s` +`.6`, then a 900 ms wait and a 2,000 ms count | **2.9 s** |

Fixed (PR #215): the same stagger, tightened to land at **0.66 s**, with the
count at 800 ms from 80 ms. Car-card stagger 80 ms/card → 55 ms capped at five.
Reduced-motion visitors now skip the entrance entirely instead of being made to
watch it. Guarded in `scripts/home-performance.test.mjs` (no hero rule may finish
after 0.75 s, count ≤ 900 ms, hero delay ≤ 200 ms, stagger ≤ 60 ms).

---

## 2. Total Blocking Time 230 ms — one enormous commit

TBT sums every long task's overrun past 50 ms, so it punishes a single big block
of main-thread work. The home page built its entire body in one commit. Measured
per section, server-rendered in Node (no throttling — a floor, not a projection):

| Block | Elements | Staged? |
|---|---|---|
| stock grid | 432 | yes |
| **nav** | 334 | no — visible |
| **hero** | 262 | no — visible |
| shop-by rails | 201 | yes |
| brand budgets | 198 | yes |
| footer | 182 | yes |
| machinery teaser | 154 | yes |
| **world-clock ribbon** (one copy) | 145 | no — visible |
| motion showcase | 106 | no — visible |
| auction preview | 79 | yes |
| process | 74 | yes |
| ticker | 62 | no — visible |
| world / globe section | 25 | yes (globe chunk already deferred) |
| closing CTA | 12 | yes |

Fixed (PRs #216, #217): `src/progressive.jsx` mounts the below-the-fold page one
group per idle slice, so the browser paints and answers input between them.

| | before | after |
|---|---|---|
| first-commit elements | 2,418 | **926** |
| first-commit markup | 167.6 kB | **59.0 kB** |
| whole page still renders | 2,418 | 2,284 (banner strips are data-dependent) |

Guarantees, all tested (`scripts/progressive-mount.test.jsx`,
`scripts/first-commit-budget.test.jsx`):

* **no markup depends on a callback** — where the browser cannot schedule after
  paint (server render, older Safari) the whole page renders in one commit;
* **nobody reaches a hole** — pointerdown/keydown/wheel/touchstart/scroll,
  `beforeprint`, a 2.5 s deadline, and any load that starts scrolled or on an
  in-page anchor all mount the rest at once;
* the first commit stays under 1,050 elements / 65 kB, and no idle slice may add
  more than 450 elements (a slice that big would be a new long task).

### Two bugs found on the way
* The stock grid's carousel attached its observer with a one-off look-up at
  mount; staging the grid would have silently killed the auto-advance. Fixed with
  a callback ref + an effect dependency (PR #217).
* Three stage groups shared `n=1`, so they opened together as a 633-element
  slice; and the deadline was one timer *per stage*, so a busy main thread could
  push the last section out four times over. Both fixed in #217.

### Corrected numbers
An earlier write-up of this work said the header ribbon was 603 elements and had
eighteen cities. Both were wrong — it has **nine** cities and is **145**
elements (about 280 with the duplicated half mounted). The figures in this file
were re-measured per block with jsdom rather than eyeballed from a markup diff.

---

## 3. Scroll cost: a custom property written on `:root` every frame

`--scroll` was written on `document.documentElement` on every scroll frame, on
every route. Exactly **one** rule in the whole stylesheet reads it — `.car-main`,
the vehicle-detail parallax — so the home page was invalidating style
document-wide, every frame, for a variable nothing on it used.

Fixed: the value is written on the element that reads it, and not at all on
routes without one. Guarded in `scripts/home-performance.test.mjs` (exactly one
CSS rule may read `--scroll`, and it must be `.car-main`).

---

## 4. Data savers and 2G/3G

The duplicate half of the world-clock ribbon is now skipped entirely when
`shouldDeferDecorative()` is true (data saver, or 2G/3G) — the ribbon stays
static at frame zero with all nine cities and their times, instead of scrolling.
Same rule that keeps the 101 KiB globe engine away on those connections.

---

## Tried, measured, and deliberately NOT shipped

Recording these so nobody spends the afternoon on them again.

| Idea | Measurement | Why it was dropped |
|---|---|---|
| Defer the ribbon's 9 `Intl.DateTimeFormat` instances | 18 formatters cost **15 ms** cold — but **17 ms of that is one-time ICU/timezone initialisation** the currency formatter pays anyway; the formatters are **1.5 ms warm** | Moving them would have changed nothing except blank clock cells |
| Replace the grain overlay's SVG `feTurbulence` with a pre-rasterised tile | a 120×120 filter tile rasterises once, a few ms | The look is owner-approved; a few ms is not worth a visual gamble |
| Share flag geometry between the ribbon's two copies with `<symbol>`/`<use>` | with only two copies, the sprite (`1 + 9 shapes + 2 uses` per country) saves ~70 elements of 280 | Not worth the markup risk for 70 elements |
| Stage the motion showcase / ticker (106 + 62 elements) | the hero's own rule is `min-height: 0` — it is **not** full-height | They are visible on tall screens; staging them would pop content in |
| `content-visibility: auto` on staged sections | would skip layout of offscreen sections after each slice | Needs a real browser to size `contain-intrinsic-size` correctly; a wrong value trades TBT for CLS, and CLS is currently green |
| Split `src/main.jsx` to shrink the 96 kB gzipped entry chunk | entry = 344 kB raw: `main.jsx` 138 kB minified, the rest is header/promo/jp-display | The below-fold home JSX is only ~3.5 kB gzipped of that; a real win needs a deeper refactor than this round |

---

## Reproducing the numbers

```bash
# first commit vs whole page (no browser needed)
npm run test:first-commit

# staging behaviour + per-slice element cap, against the real <App/> in jsdom
npm run test:progressive

# hero entrance budgets, --scroll reader count, data-saver ribbon
npm run test:home-performance
```

First load, unchanged in surface but measured every build:
**152.6 kB gzipped JS / 28 kB gzipped CSS** (`npm run test:bundle`).
