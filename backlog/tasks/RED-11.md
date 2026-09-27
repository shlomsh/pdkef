---
id: "RED-11"
title: "Boxes from one search stay a set: remove them together, blur strength shared"
status: "in_progress"
priority: "P2"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-11 · Boxes from one search stay a set: remove them together, blur strength shared

*Filed 2026-09-27 from RED-02, on Shlomi's question.*

"Redact all" adds its boxes as one undo step, but afterwards they are separate boxes: after any other
edit, removing the twelve boxes a search made means twelve deletes. RED-03's linked copies don't fit,
because they share position and size, and found words each sit in their own place.

- Boxes added by one Find action share a `findSetId`. It links nothing about geometry.
- Trash on a found box asks the scope: "This box" or "All N from this search" (and "All N pages"
  too when the box is also repeated on every page). One undo step either way.
- Changing blur strength on a found box applies to its whole set, one undo step, the way linked
  copies share it. Find makes only Blackout and Blur boxes, so strength is the only style to share.
- Duplicating or repeating a found box makes ordinary boxes; they don't join the set.
- A set of one is just a box.

## Acceptance

- After "Redact all" and another edit, trash on one found box offers "All N from this search", which
  removes exactly that search's boxes as one undo step.
