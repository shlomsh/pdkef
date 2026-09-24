---
id: "MOBI-31"
title: "Dragging a text box's side handle on a phone moves the box instead of resizing it"
status: "in_progress"
priority: "P1"
epic: "mobile-round-trip"
phase: "quick-win"
depends_on: []
legacy_state: "Open"
---

# MOBI-31 · Dragging a text box's side handle on a phone moves the box instead of resizing it

## What Shlomi saw

iPhone, form 101, 2026-09-24. A phone number typed into a detected field came out as a spaced,
multi-column (comb) element by mistake. To make it a plain text box again he pressed the left middle
handle to narrow it, and the drag moved the whole element left instead of resizing it.

## Acceptance

At a touch phone viewport, press-dragging any visible side handle of a text box, comb or plain,
resizes it and never moves it, including a box near the page edge. There is a way back from a comb
element to a plain text box that a person can find on a phone.

## Known limits, from review (2026-09-24)

- A pinch that starts after one finger is already dragging or resizing is cancelled cleanly (nothing
  moves, nothing commits) but does not zoom: iOS has already had `preventDefault()` for that touch
  sequence. Only a pinch whose fingers land together is handed to the browser.
- `restoreSubtreeAttributes` in `useElementResize.js` reverts the element's subtree to its grab-time
  attributes with raw DOM writes. The only render inside that window is the `isSpanResizing` preview,
  which the next render cleans up; an unrelated Preact attribute write during a cancelled resize would
  be lost until that attribute next changes.
