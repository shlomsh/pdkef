---
id: "SITE-41"
title: "Redact: a blur strength picker on the blur box toolbar"
status: "in_progress"
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

- `src/editor/model/blurStrength.ts` owns the levels and their screen/export radii.
- `BlurElement.strength` is optional; absent reads as `strong`, today's look, so old drafts and
  exports are unchanged.
- The last chosen level is a browser-wide preference (`lastBlurStrength`), like whiteout's colour.

## Acceptance

- The blur box toolbar shows a strength picker; picking a level changes the box on screen and in
  the export, is one undo step, and survives a reload.
- A new blur box starts at the last chosen level.
- A light blur over large and small text is unreadable in the exported PDF.
