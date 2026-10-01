---
id: "SIGN-39"
title: "Changing a placed field element's font does not re-place it"
status: "done"
priority: "P2"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: ["SIGN-38"]
---

# SIGN-39 · Changing a placed field element's font does not re-place it

## The gap

SIGN-38 made `placeTextOnField`/`placeTextOnCell`/`placeCombOnRegion` centre a field's digits on the
per-font ink centre, so a fresh placement lands right for whichever font it is typed in. But placement
only runs once, at creation (a tap, a Next/Previous move, or a fill-mode keystroke). If a person then
changes a field element's font afterwards - the toolbar's font picker, on an element already sitting on
a detected comb or cell - nothing re-runs `placeTextOnField` for it, so the element keeps the vertical
position the old font was placed at instead of the new one's own ink centre.

## The fix (shipped in 836248d)

Shipped as `topKeepingInkCentre` in `combPlacement.ts`, called from `PdfWorkspace.tsx`. It also re-tops free text, not only field elements. The original sketch was:

Likely shape: the font-change handler (wherever `ElementToolbar`'s font picker dispatches an update) has
to know whether the changed element sits on a detected field and, if so, recompute its `top` (and, for a
cell, `left`/`minWidth`) the same way the creation paths do - probably by re-deriving the `TypableField`
the element sits on (`elementIsOnField`, `fieldOrder.ts`, already used by `useFieldNavigation.ts` and
`fillWorkspace.ts`'s `boxOf`) and calling `placeTextOnField` again with the new family. Needs a decision
on whether this is undo-logged as its own step or folded into the font-change's own update entry.

## Acceptance

- [x] Scoped into a real plan before implementation starts.
- [x] A field element's font change on a detected comb or cell re-centres its digits on the new font's
  ink centre, matching what a fresh placement in that font would produce.
- [x] ~~A free (non-field) text element's font change is unaffected - there is no strip to re-centre on.~~ Superseded by 836248d: free text is re-topped too.
- [ ] `npm run check:fast` is green.

## Closed 2026-10-01

Shipped in 836248d (`topKeepingInkCentre`, `combPlacement.ts`; `PdfWorkspace.tsx`). It also re-tops free text, so acceptance criterion 3 is superseded by that behaviour.
