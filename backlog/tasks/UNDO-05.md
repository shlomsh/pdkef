---
id: "UNDO-05"
title: "Merge and Split share one undo chip, and Split's stops leaking"
status: "open"
priority: "P2"
epic: "undo-and-redo"
phase: "near-term"
depends_on: []
---

# UNDO-05 · Merge and Split share one undo chip, and Split's stops leaking

*Filed 2026-09-20* out of the redo assessment's per-tool survey. The bugs here are worth fixing on
their own, ahead of any question about redo in these two tools.

## Defects

- **Split's chip never cleans up.** Its 5s `setTimeout` is not cleared on unmount, and neither `reset`
  nor the file-replace path clears a pending chip, so a stale undo can restore pages belonging to the
  **previous document**. Merge has both cleanups (`PdfMergeTool.tsx:704-708` and `:721`); Split has
  neither.
- **Both chips restore a whole array wholesale**, so anything that landed asynchronously inside the 5s
  window is silently discarded by the undo: a thumbnail that finished rendering (and Split's derived
  `renderedCount` then goes backwards), and in Split's case any selection toggle made in the window,
  even though the chip only says "Rotated page N". Merge's exposure is narrower only because each new
  action replaces the pending one.
- **Split's chip is untranslated**, hardcoded English, unlike Merge which is wired to `toolMessages.ts`.

## Duplication

`registerUndo`, the chip CSS and the chip markup are duplicated near-verbatim across the two tools, and
the CSS admits it (`PdfSplitTool.module.css:280`: "Same shape as Merge's"). A shared
`useUndoChip({ windowMs })` plus an `<UndoChip>` absorbs all three and fixes Split's cleanup for free.
The snapshot-versus-inverse-op difference is per-call-site and should stay caller-supplied:
`perform: () => void` is already the right seam.

## On redo here

Out of scope for now, and it is not an extension: these tools store an **inverse closure**, not data, so
there is no forward equivalent, and a thunk cannot be persisted through `draftStore`'s structured clone
either. Redo would mean replacing the chip with a real stack, which is also a product decision:
`docs/ux-design-guidelines.md` §6 makes the transient chip the house pattern.

## Update 2026-09-20: the thumbnail half of this is no longer a prediction

UNDO-02 hit exactly the defect this ticket predicts for Merge and Split, in Edit Pages, and it was
reproduced rather than reasoned: a thumbnail that finished rendering after a snapshot was taken was
permanently destroyed by an undo past that point, because the snapshot held the pages array and
thumbnails arrive asynchronously outside history. On a long scan it blanked most of the grid.

The fix there is the shape to copy, and it is not "snapshot the thumbnails too". A thumbnail is not
a user edit, so undo must not be able to take it away: `src/tools/edit-pages/useEditHistory.js` grew
an `amend` that applies an async change to the live document *and* to every snapshot already on the
stacks, leaving the history's length untouched. Merge and Split need the same separation whenever
they get a real stack, and Split's wholesale `setPages(snapshot)` has the same hole today inside its
five-second window.
