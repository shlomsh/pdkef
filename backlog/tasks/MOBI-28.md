---
id: "MOBI-28"
title: "A checkbox sized to a tiny printed square jumps to the resize floor on the first touch"
status: "done"
priority: "P1"
epic: "mobile-round-trip"
phase: "quick-win"
depends_on: ["MOBI-27"]
legacy_state: "Done 2026-09-22"
---

# MOBI-28 · A checkbox sized to a tiny printed square jumps to the resize floor on the first touch

## What happened

Reported live on a real Hebrew tax form (income tax form 101), right after MOBI-27 shipped: "there
is a minimum size to the checkbox preventing it from fitting in place." A checkbox placed on a
detected printed square (`placeSymbolOnRegion`) is sized to match the print exactly - routinely a
few px, well under `MIN_SYMBOL_WIDTH_PX` (14px), the floor `applySymbolResize` holds a resize to so a
freely-placed symbol from the toolbar never shrinks into illegibility. That floor applied
unconditionally: `Math.max(minWidth, start.width + deltaWidth)` with `start.width` already below
`minWidth` means the very first pixel of *any* resize gesture - even a 1px nudge, even one aimed at
shrinking further - clamps straight up to the floor.

Reproduced with real Playwright rendering on the practice-form fixture: a checkbox placed on a
detected hint measured 4.28x4.28px, matching the print. A single-pixel drag on its bottom-right
handle jumped it to 13.9x13.9px - roughly the 14px floor - no longer fitting the printed square it
was sized to a moment before.

## Outcome (2026-09-22)

`applySymbolResize` (`src/editor/registry/symbol.ts`) now takes the lower of the caller's floor and
the symbol's own already-committed width as the effective floor for that gesture:
`Math.min(minWidth, start.width)`. A symbol already below the toolbar's floor is never raised by a
resize - it holds at its own size (a floor still applies, so it can't shrink to nothing) and grows
normally once dragged past the toolbar's floor. A symbol placed above the floor is unaffected: the
effective floor is still exactly `minWidth`, matching the pre-existing behaviour and its test
("honors the caller-provided symbol pixel floor after conversion to percent" in
`centeredResize.test.ts`).

Verified three ways: `centeredResize.test.ts` gained two cases (the first-pixel non-jump, and that
growth past the floor still works normally); a new e2e spec,
`e2e/symbol-resize-floor.spec.js`, places a symbol on a real detected checkbox (measured under 10px
at the test viewport) and drags its handle by 1px, asserting the width stays near where it started -
confirmed red against the unfixed code (jumped to 13.9px) and green against the fix; and the existing
`resizer-handle-spacing.spec.js` (MOBI-19/27) still passes, since the handle-spacing formula reads
the symbol's own rendered size regardless of how that size was reached.
