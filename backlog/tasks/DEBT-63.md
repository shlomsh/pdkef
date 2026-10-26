---
id: "DEBT-63"
title: "Compress and PDF to Image stay inside the browser's canvas limit on very large pages"
status: "open"
priority: "P2"
epic: "unify-and-narrow"
horizon: "now"
order: 2
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

- [ ] The red test is green, for Compress, a single PDF to Image page and a stacked output.
- [ ] Normal-sized pages render at exactly the scale they do today (no quality change).
