---
id: "DEBT-63"
title: "Compress and PDF to Image stay inside the browser's canvas limit on very large pages"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# DEBT-63 · Compress and PDF to Image stay inside the browser's canvas limit on very large pages

*Filed 2026-10-26* from the architecture review ([docs/architecture-debt-review-2026-10-26.md](../../docs/architecture-debt-review-2026-10-26.md), "Two findings that may be bugs"). Suspected,
not yet seen in production.

## Why

Only the editor clamps a page render to `MAX_CANVAS_AREA` (`src/editor/adapters/pdf/rasterPage.js:9`,
used by `pageRenderScale.js`). Compress renders every page at a fixed scale up to 2.0
(`compress.js:31-38`, canvas at `:63`), and PDF to Image renders at the chosen scale and stacks pages
into one tall canvas (`toImage.js` `renderPage` and `stackCanvases`, whose comment already names the
ceiling). A large-format page (an A0 drawing, a long scanned roll) could exceed the area and come back
blank or throw.

## Outcome

- Start from a test that fails today: a page whose area at the tool's scale exceeds `MAX_CANVAS_AREA`
  gets a canvas larger than the cap. See it red first. If it cannot be made to fail, retire this
  ticket with the reason.
- Compress and PDF to Image size every canvas through the same clamp the editor uses, imported from
  one place (ARCH-39 later moves the clamp into the shared render helper; this ticket does not wait).
- The stacked PDF to Image output respects the cap for the combined canvas too.

## Acceptance

- [x] The red test is green, for Compress, a single PDF to Image page and a stacked output.
- [x] Normal-sized pages render at exactly the scale they do today (no quality change).

## Result

- Red run: the new tests failed before the change (`compressRenderScale is not a function`, `pageRenderScale` and `stackedRenderScale` not functions: 9 of 9 failed). Neither tool had any clamp, so the scale decision did not exist as a unit; each is now a pure exported function.
- Files: new `src/lib/canvasLimits.js` (`MAX_CANVAS_AREA`, `MAX_CANVAS_SIDE`, `clampScaleToCanvas`); `rasterPage.js` imports and re-exports the constants, `rasterScaleFor` is `clampScaleToCanvas(w, h, RASTER_SCALE)`; `compress.js` (`compressRenderScale`, used by `compressPdf` and the target-size render); `toImage.js` (`pageRenderScale`, `stackedRenderScale`); tests `compressScale.test.js` and `imageScale.test.js`.
- Stacked rule: when the combined canvas (widest page by summed heights) would pass the cap, every page renders at one lower scale, `clampScaleToCanvas(maxWidth, totalHeight, chosenScale)`, so the stack keeps its proportions. Sizes come from a cheap scale-1 pass before rendering.
- US Letter at every Compress level and every PDF to Image scale keeps exactly today's scale (asserted).

## Closed 2026-10-27

Landed with the unify-and-narrow branch. The clamp is `src/lib/canvasLimits.js`, and ARCH-39 moved every page render onto `renderPageToCanvas`, which applies it. The first red run failed on missing functions rather than on an oversized canvas; the arithmetic (a 5000 x 5000 pt page at Compress scale 2.0 needs about 100M pixels against a 16.7M cap) is what makes the bug real.
