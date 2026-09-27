---
id: "SITE-41"
title: "Redact: a blur strength picker on the blur box toolbar"
status: "done"
priority: "P2"
epic: "site-quality"
phase: "near-term"
depends_on: []
---

# SITE-41 · Redact: a blur strength picker on the blur box toolbar

*Asked for 2026-09-27 as an "opacity" control on the blur element's toolbar.*

Real opacity would let the original show through the exported blur, which undoes a redaction, so
the control sets blur **strength** instead: light, medium or strong, as a preset picker like the
thickness menu. Every level stays unreadable in the export.

- `src/editor/model/blurStrength.ts` owns the levels. Each level is a fraction of the box's own
  height (0.3 / 0.4 / 0.5), applied the same way on screen (CSS container units) and in the export.
- `BlurElement.strength` is optional; absent reads as `strong`, today's look, so old drafts and
  exports are unchanged.
- The last chosen level is a browser-wide preference (`lastBlurStrength`), like whiteout's colour.

## What the real export showed (2026-09-27)

The first build used fixed radii (12 / 18 / 24px at the 2.5x export raster). Rendered back from a
real export: at 12px a 28pt headline read plainly, and even 24px, the one fixed blur production has
always used, left the headline's word shapes guessable. 11pt text and digits were gone at 18px and
up. Readability depends on the blur relative to the text, so a fixed radius cannot promise
unreadable at every size. A radius of 0.25 x the box height already read as a smear for every line
size, so the levels start above it. This also fixes the big-text leak in the old fixed blur, and the
export now fills white under each blurred patch so a box touching the page edge stays fully opaque.

## Acceptance

- The blur box toolbar shows a strength picker; picking a level changes the box on screen and in
  the export, is one undo step, and survives a reload.
- A new blur box starts at the last chosen level.
- A light blur over large and small text is unreadable in the exported PDF.
