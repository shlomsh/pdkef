---
id: "RED-43"
title: "A box can be reached and removed with the keyboard"
status: "in_progress"
priority: "P2"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-43 · A box can be reached and removed with the keyboard

Boxes are only reachable with a pointer. Tab reaches each box in page order, Enter or Space selects it, Delete or Backspace removes it with the usual undo chip, arrow keys move it by one point (Shift: ten), Escape deselects. Moves coalesce into one undo entry like any nudge.

## Acceptance
- Unit tests for each key. Focus is visible with the existing focus ring token.
