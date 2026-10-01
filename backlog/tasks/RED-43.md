---
id: "RED-43"
title: "A box can be reached and removed with the keyboard"
status: "done"
priority: "P2"
epic: "redact-tool"
depends_on: []
---

# RED-43 · A box can be reached and removed with the keyboard

Boxes are only reachable with a pointer. Tab reaches each box in page order, Enter or Space selects it, Delete or Backspace removes it with the usual undo chip, arrow keys move it by one point (Shift: ten), Escape deselects. Moves coalesce into one undo entry like any nudge.

## Acceptance
- Unit tests for each key. Focus is visible with the existing focus ring token.

## Result

`boxKeys.ts` maps keys to intents; RedactBox is focusable with a name ("Blur box", "Whiteout stroke") and dispatches to the callbacks a click, the delete button and a drag release use. Enter selects (Space stays the page-wide peek), Escape deselects, Delete/Backspace removes, arrows move 1 pt, Shift 10. (540af6d4, 9c147e6f)
