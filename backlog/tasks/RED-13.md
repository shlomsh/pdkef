---
id: "RED-13"
title: "Delete shows the page as it will be saved, and Hebrew previews read in order"
status: "in_progress"
priority: "P1"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-13 · Delete shows the page as it will be saved, and Hebrew previews read in order

*Filed 2026-09-27 from Shlomi trying Delete on a Hebrew PDF.*

Delete already removes the object from the file itself (`deleteObjectsFromPdf`), but the editor only
draws an outline and a strike-through over it: the text is still there on screen, so the person can't
see what the saved page will look like, including anything else the same text run takes with it. And
the object's preview ("Text queued for deletion: ...") shows Hebrew backwards, because a PDF stores it
in drawing order, left to right.

- **What you see is what you save.** A page with anything queued for deletion is drawn from the same
  rewritten content the download writes (the export's own splice, not an imitation of it). The mark
  keeps a light dashed outline and its undo button, so you can still see where something was.
- **No blank flash.** A page that is drawn again swaps in the new drawing only when it is finished.
- **Previews read in order.** A run's preview is turned from drawing order into reading order:
  Hebrew and Arabic words right to left, numbers and Latin inside them left to right.

## Acceptance

- Deleting a text run makes it disappear from the page on screen; Undo brings it back.
- The page on screen and the saved page match for the same deletions.
- On the Israeli health declaration, a run's preview reads "האגף לרישוי כלי ירייה", not reversed.
