---
id: "UNDO-03"
title: "A Redo control in the editor toolbar, once its width is measured"
status: "done"
priority: "P3"
epic: "undo-and-redo"
phase: "longer-term"
depends_on: ["UNDO-01"]
---

# UNDO-03 · A Redo control in the editor toolbar, once its width is measured

*Filed 2026-09-20. Done 2026-09-20.* UNDO-01 shipped redo on the keyboard and in the Undo dialog,
deliberately without a toolbar control. **The honest cost of that: redo was not discoverable on
touch** - and worse than the ticket predicted, since reverting from the dialog closed it, so the one
place redo existed shut itself at the moment it became usable. This ticket is the button.

## What shipped

Both tools now carry three controls where one used to be: **Undo** (one tap, one step), **Redo** (one
tap) and **History** (opens `UndoHistoryModal`, which keeps the timeline and selective revert and no
longer has a Redo button of its own - one action, one place). Redact first; Sign in the same shape and
order after its row was re-measured.

## The measurement, since that was the expensive part

Headless Chromium on Linux (the wide DejaVu face CI lands on), Share stubbed present, `/sign`:

| | natural width | 1172px box |
| --- | --- | --- |
| Before (Undo alone) | 1121.6px | 50.4px spare |
| With Redo and History | 1205.6px | **33.6px over - wrapped, Download stranded** |
| After paying for them | 1135.7px | 36.3px spare |

Paid for with Date's label (`data-icon-only`, -43.9px; a calendar is as plain a convention as an undo
arrow) and 2px off every gap at 1300px and up (-26px). The next label to go is Replace's, 62.7px.

The phone grid needed re-tuning the way SIGN-18 warned it would, and for the reason SIGN-18 found:
greedy flex fills each line to the cap, so **only some counts balance at the 44px floor**. Thirteen
lands 6+6+1 or 4+4+4+1; ten lands 4+4+2. So Sign shows thirteen above 344px of toolbar, twelve below it
(Feedback stands down - it does not act on the document at all, and it is in the site footer of every
page) and eleven below 239px (History too, as the last of the two). History outranks Feedback here
because its dialog is reachable from nowhere else; on a phone, dropping it would have left selective
revert with no way in. Date stopped being optional: it edits the document, and it now pays its way with
its label instead. New thresholds: a 629px one-line floor and the
344px stand-down, both `N * 44 + (N-1) * 4.8` arithmetic like every other number in that file.

Measured rows, every width the guards walk: 4+4+3 at 320px, 4+4+4 at 360px, 6+6 at 390px and 430px,
7+6 at 500px and 700px, one line from 768px up. Redact is unchanged at 5+5 and 3+3+3.

## Fixed in review, worth knowing

A History control disabled on `actionHistory.length === 0` goes dead at exactly the moment its dialog
is fullest: undo everything and every step is sitting above the NOW divider, waiting to be redone,
with the applied list empty. That was survivable while the same control also performed the undo; it is
not once it only opens the dialog. Both tools now read `actionHistory.length === 0 && !canRedo`.

## Guards

`e2e/tool-toolbars/toolbar-touch-targets.spec.js` gains Sign's 700px case: thirteen 44px targets need a
629.6px line and a 700px window has 587.2px, so that band is now a balanced 7+6 rather than one line.
It moved out of `toolbar-desktop-one-line.spec.js`'s width list into this one - the derived floor moved
with the control count, and the assertion itself was not touched.
