---
id: "SIGN-39"
title: "Changing a placed field element's font does not re-place it"
status: "open"
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

## The fix (not yet scoped)

Likely shape: the font-change handler (wherever `ElementToolbar`'s font picker dispatches an update) has
to know whether the changed element sits on a detected field and, if so, recompute its `top` (and, for a
cell, `left`/`minWidth`) the same way the creation paths do - probably by re-deriving the `TypableField`
the element sits on (`elementIsOnField`, `fieldOrder.ts`, already used by `useFieldNavigation.ts` and
`fillWorkspace.ts`'s `boxOf`) and calling `placeTextOnField` again with the new family. Needs a decision
on whether this is undo-logged as its own step or folded into the font-change's own update entry.

## Acceptance

- [ ] Scoped into a real plan before implementation starts.
- [ ] A field element's font change on a detected comb or cell re-centres its digits on the new font's
  ink centre, matching what a fresh placement in that font would produce.
- [ ] A free (non-field) text element's font change is unaffected - there is no strip to re-centre on.
- [ ] `npm run check:fast` is green.
