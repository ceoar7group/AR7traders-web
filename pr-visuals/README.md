# W1–W4 responsive audit evidence

Baseline: `68400a4b3883ff36a982c41bfa4ab5facca11131` (the branch's starting `main` tip). The paired captures use the same mocked API responses, CSS-pixel viewport and build settings; external requests were blocked. The public pages returned HTTP 200 at every capture, with no browser page errors and no horizontal overflow (`documentWidth === viewportWidth`) in any of the 20 page/viewport runs.

## Inventory toolbar — facet rows and toolbar height, baseline → branch

| Viewport | Facet rows | Toolbar height |
| --- | ---: | ---: |
| 1920 × 1080 | 10 → 2 | 720 → 252 px |
| 1366 × 900 | 10 → 2 | 720 → 252 px |
| 1024 × 900 | 10 → 2 | 720 → 252 px |
| 768 × 900 | 5 → 2 | 423 → 252 px |
| 390 × 844 | 5 → 5 (two columns) | 486 → 443 px |

The 10 facets now wrap across the full toolbar rather than remaining in a narrow vertical stack. At 390 px the two-column toolbar is retained and wraps into five rows. No overflow was measured at any width.

| Viewport | Baseline | Branch |
| --- | --- | --- |
| 1920 × 1080 | [Before](inventory-before-1920.jpg) | [After](inventory-after-1920.jpg) |
| 1366 × 900 | [Before](inventory-before-1366.jpg) | [After](inventory-after-1366.jpg) |
| 1024 × 900 | [Before](inventory-before-1024.jpg) | [After](inventory-after-1024.jpg) |
| 768 × 900 | [Before](inventory-before-768.jpg) | [After](inventory-after-768.jpg) |
| 390 × 844 | [Before](inventory-before-390.jpg) | [After](inventory-after-390.jpg) |

## Hero — 900+ stat and scroll cue

The 900+ founder proof is present at all five widths. The scroll cue remains present on desktop and is restored on tablet/phone; the baseline hid it at 768 px and 390 px. In the branch it is in the document at y=1491 px and y=1449 px respectively (the cue follows the longer stacked mobile hero). Desktop/tablet cue y positions are recorded in [`audit-metrics.json`](audit-metrics.json).

The hero rotates its featured stock, auction and shipping cards by design. Its before/after captures are representative viewport screenshots; a different rotating card or clock value is not a layout change. The 390 px pair is especially useful for reviewing the founder stat's small-screen fit.

| Viewport | Baseline | Branch |
| --- | --- | --- |
| 1920 × 1080 | [Before](hero-before-1920.jpg) | [After](hero-after-1920.jpg) |
| 1366 × 900 | [Before](hero-before-1366.jpg) | [After](hero-after-1366.jpg) |
| 1024 × 900 | [Before](hero-before-1024.jpg) | [After](hero-after-1024.jpg) |
| 768 × 900 | [Before](hero-before-768.jpg) | [After](hero-after-768.jpg) |
| 390 × 844 | [Before](hero-before-390.jpg) | [After](hero-after-390.jpg) |

Full capture metrics: [`audit-metrics.json`](audit-metrics.json).

## 2026-10-07 — homepage header/hero pass + CRM machinery desk

The header no longer reserves a hard-coded offset per breakpoint, the hero starts
exactly below the bar, the bar leaves before the hero's first line of copy can
reach it, and the CRM machinery desk shows (and lets you edit/delete) the machines
already on the website. Viewport-by-viewport evidence, measured numbers and the
CRM captures: [`homepage-pass-2026-10-07/`](homepage-pass-2026-10-07/README.md).
