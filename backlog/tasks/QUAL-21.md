---
id: "QUAL-21"
title: "Pages render at the size they are shown, and the practice form's logo is sharp"
status: "in_progress"
priority: "P2"
epic: "polish"
horizon: "now"
depends_on: []
---

# QUAL-21 · Pages render at the size they are shown, and the practice form's logo is sharp

*Filed 2026-10-14.* Shlomi saw the practice form look soft in /he/sign/. Two causes, both measured.

1. `src/editor-ui/PdfPageCanvas.tsx` rendered every page at a fixed `scale: 1.5` and never read
   `devicePixelRatio` or the width the page is shown at. An A4 page is a 892px canvas stretched by CSS
   to ~1,580 device px on a 2x laptop (1.8x upscale) and to ~1,170 on a 3x phone. Vector text goes
   soft. Sign and Redact share this component.
2. The practice form's only raster is its logo, a 96px PNG drawn at 20pt (~350 effective DPI), 15.5 KB
   of the 19.7 KB file. Soft when zoomed.

## Outcome

- The page canvas renders at `cssWidth x devicePixelRatio / pageWidthPt`, never below the old 1.5,
  with the pixel count capped so a big page or a dense display cannot exhaust canvas memory. The
  scale is a pure function next to `rasterPage.js`; the component only measures and repaints when the
  width bucket changes. A repaint keeps the existing offscreen-then-copy path, so a page never goes
  blank.
- The practice form's logo is a 192px derivative (~690 DPI at 20pt), regenerated through the same
  generator. The PDF grows from 19.7 KB to ~49 KB.

## Decisions

- Cap the display canvas at 6M px (~24 MB), under the 16.7M iOS ceiling `MAX_CANVAS_AREA` already
  names, because every page of a multi-page document holds a canvas at once.
- Lazy rendering of off-screen pages is not part of this; measure memory on a long document before
  deciding it is needed.

## Built and measured (2026-10-14)

- `pageRenderScale.js` (pure, 8 unit tests) and a `PdfPageCanvas` wired to it (3 jsdom tests, written red first).
- Dev server, /sign/, practice form, 2x display: a 900 CSS px page paints a 1,920px canvas (was 892).
  Narrowing to 336 CSS px repaints at the 892 floor; widening again returns to 1,920. No blank frame.
- `sample.pdf` 19,681 -> 49,462 bytes. The ground-truth JSON changed only by its `sha256`.
- `sample-preview.jpg` was not regenerated: the generator needs Playwright's chromium (not installed
  on this machine) and the logo is ~6px in a 168px thumbnail. Redact's and Sign's Playwright specs ran
  in CI only.
- Not done on purpose: lazy painting of off-screen pages. Measure a long document first.
