---
id: "MERGE-07"
title: "Every row says pages: counts, sizes, true aspect, undo on remove, duplicates, insert where dropped"
status: "open"
priority: "P2"
epic: "merge-tool"
phase: "near-term"
depends_on: ["MERGE-01"]
legacy_state: "Open"
---

# MERGE-07 · Every row says pages: counts, sizes, true aspect, undo on remove, duplicates, insert where dropped

*Filed 2026-09-13* from the Merge review.

## Scope and acceptance

A merge is a list of pages, and the list never says so. Six changes to the file list, none of which
touches the architecture:

- **Page count and size per row** (`3 pages · 4.9 KB`), and the total in the identity line
  (`4 PDFs · 18 pages · 22 KB`). The count comes from the same pdf.js load that renders the thumbnail
  in `renderThumbnail`; return it alongside the data URL rather than parsing twice.
- **True aspect.** `.thumb` is a 40 x 52 box with `object-fit: cover`, so a landscape page shows a
  slice of its top edge. A fixed 44 x 58 box with `contain` keeps row height stable and shows the page
  as it is.
- **Undo on remove.** Remove is instant and irreversible, and the target sits at the row edge next to
  the scroll thumb on a phone. Replace with a five-second status line, "Removed X · Undo", in the
  `hint-message` style; no confirm dialog.
- **Duplicate nudge.** Same name and size already in the list: "Already added" with "Add anyway".
- **Insert where dropped.** Dropping files onto the list shows an insertion line between rows and
  inserts there, instead of appending; SortableJS's own ghost is the model.
- **Peek.** Tap a thumbnail to expand that file's pages inline (renders on expand via
  `renderPdfThumbnails`, so the closed list costs nothing). This is the seed MERGE-08 grows into.

**Acceptance.**

- Counts and sizes present per row and in total; landscape fixtures display landscape.
- Undo restores the file at its old position; duplicate nudge fires and can be overridden.
- Unit tests for counts, undo and duplicates; the Merge e2e spec checks the insertion line on a real
  drop.
