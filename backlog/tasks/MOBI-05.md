---
id: "MOBI-05"
title: "Tap a detected checkbox to place a mark in it"
status: "done"
priority: "P2"
epic: "mobile-round-trip"
phase: "near-term"
depends_on: ["MOBI-03"]
legacy_state: "Done"
---

# MOBI-05 · Tap a detected checkbox to place a mark in it

## Scope and acceptance

**The checkbox half of a government form is high-count, low-value-per-item, and brutal on a phone.**
Page 1 of the National Insurance health declaration carries a measured 127 checkbox-sized squares,
dominated by two size families at 6.6x6.6pt and 7.6x7.6pt: roughly two dozen medical questions, each
with a כן and a לא box, plus the physician's confirmation block. Income tax form 101 is the same shape
with a different instruction printed at the top: "סמן/י √ בריבוע המתאים", mark a tick in the
appropriate square. Form 101 even embeds ZapfDingbats to draw those ticks itself.

A 6.6pt square is about 2.3mm on paper. Placing a symbol inside one on a phone today means zooming in,
arming the symbol tool, tapping, and then nudging, roughly fifty times for one health declaration.

The editor already has the other half: a symbol tool with check, x and dot marks, and a remembered
`lastSymbolMark` preference. Make a detected checkbox a tap target that places the current mark
centred in the square at a size derived from the square, not from the last symbol width the user
happened to drag somewhere else.

Scope discipline. This ticket places a mark in a box; it does not attempt to understand that כן and לא
are mutually exclusive, or to group boxes into questions. Radio-style exclusivity needs semantics the
geometry does not carry, and guessing it wrong silently unticks a person's answer on a medical form.
Leave it out and say so.

Respect the arming model exactly as MOBI-04 does: tapping a detected box must not leave a tool armed,
and must not change what the next tap on empty space means.

**Acceptance.** On the committed health declaration fixture, one tap on a כן box places the current
mark centred in that printed square, verified against the detected square's centre and sized to it. A
second tap on the same box removes the mark rather than stacking a second one. Marks survive export,
undo and draft restore. No mutual exclusivity is implemented, and the ticket records that as a
deliberate exclusion rather than an oversight. The interaction is proven at a real phone viewport, not
only at desktop width, since the whole justification is a 2.3mm target.

## Completed with MOBI-04 follow-through

Placement and sizing landed with MOBI-04: arming Symbols outlines every
detected square, and a tap fills the one under it at exactly the printed
square's width and height (`placeSymbolOnRegion` in
`src/editor/text/combPlacement.ts`). The remaining follow-through is now
complete: a second tap deletes the existing mark with a reversible delete
history entry instead of stacking it, and the page overlay observes that tap
before the selected mark's wrapper consumes it. The mark remains an ordinary
symbol element, so the established export and draft paths carry it unchanged.

`e2e/sign/form-grid-fill.spec.js` proves the interaction on the committed
health-declaration fixture at a 390×844 touch viewport: one tap places one
mark, the tool disarms, then re-arming and tapping the same printed square
clears it, and reverting that delete restores the mark. No yes/no or
radio-style mutual exclusion is inferred or applied.
`src/editor/workspace/useEditorDraftPersistence.test.tsx` independently
confirms that the snapped mark's non-square page-percent geometry survives a
draft restore.

One correction to the measurement above: the 127 figure counts `re` operators
that clip text and never paint, at a squareness tolerance loose enough to admit
a 13.3x10.8 rectangle. The page draws **51** checkboxes - 28 in the examiner's
table, 20 in the doctor's, 3 in the declaration - and that is what the detector
reports. See the note in `formGrid.fixtures.test.js`.
