---
id: "RED-13"
title: "Delete shows the page as it will be saved, and Hebrew previews read in order"
status: "done"
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
  rewritten content the download writes (the export's own splice, not an imitation of it). No mark
  stays behind: the toolbar's Undo brings the object back.
- **No blank flash.** A page that is drawn again swaps in the new drawing only when it is finished.
- **Previews read in order.** A run's preview is turned from drawing order into reading order:
  Hebrew and Arabic words right to left, numbers and Latin inside them left to right.

## Acceptance

- Deleting a text run makes it disappear from the page on screen; Undo brings it back.
- The page on screen and the saved page match for the same deletions.
- On the Israeli health declaration, a run's preview reads "האגף לרישוי כלי ירייה", not reversed.

## Outcome (2026-09-28)

- `deleteObjects.js`: `rewritePageContent` is shared by the download and `buildDeletePreviewPage`, a
  one-page PDF with the spans cut out; `useDeletePreviews` swaps it in per page, and PdfPageCanvas
  double-buffers a repaint. Previews are keyed per file as well as per span list, since two files can
  share byte offsets (the reopened-draft path, guarded by a unit test; Replace already clears them).
- The per-object mark and its undo button are gone, on Shlomi's call: the page shows the result and the
  toolbar's Undo is the way back.
- A deleted object lifts off (0.22 s) once the page is drawn without it, never before, so it can't blink
  back; skipped under reduced motion (`DeleteLift.tsx`, the canvas's `page-painted` event).
- Icons: Delete takes the eraser (it takes the object out of the file); Whiteout, in Redact and Sign,
  becomes a blank slot in the Blur/Blackout line-of-text family. The trash can stays on Clear page and a
  box's own remove button.
- Previews read in order: `visualOrder.js` turns drawing-order Hebrew and Arabic into reading order.
- Measured on the Israeli health declaration: about 0.45 s from click to the clean page (0.12 s of it
  the debounce that groups quick clicks). Worth measuring on a phone before tuning.
