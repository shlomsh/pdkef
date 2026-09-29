---
id: "RED-35"
title: "Redact on touch: a swipe scrolls, handles after a tap, Delete shows what it can take, controls in one bar"
status: "done"
priority: "P1"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-35 · Redact on touch: a swipe scrolls, handles after a tap, Delete shows what it can take, controls in one bar

*UX review 2026-09-29, guideline §8 and §17.*

- A touch that starts on a box that is not selected scrolls the page; only a selected box moves
  (`touchNeedsSelection`, `touchClaim.ts`).
- Resize handles show after a direct tap on a box, not on hover, on touch.
- With Delete armed on a touch device, everything Delete can take is outlined, so "Tap something
  highlighted" is true.
- On a coarse pointer, a selected box's controls (color or blur strength, duplicate, repeat, delete) sit
  in one fixed bar at the bottom of the screen, never floating over the page. Desktop keeps the floating
  toolbar.

## Acceptance

- Phone viewport: a swipe starting on an unselected box scrolls; tap, then drag, moves it.
- Delete armed on touch shows outlines on every deletable object.
- The selected box's bar is fixed at the bottom and never overlaps the box.

## Result (2026-09-29)

A swipe on an unselected box scrolls (touch-action pans until selected); Delete outlines what it can take on touch; on a touch device a selected box's controls sit in a fixed bottom bar (RedactBoxBar.tsx, useCoarsePointer asks for a fine pointer, as ArmHint does).
