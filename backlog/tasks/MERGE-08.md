---
id: "MERGE-08"
title: "The assembled document: every page of the result, in order, rendered on device before any merge"
status: "open"
priority: "P1"
epic: "merge-tool"
phase: "near-term"
depends_on: ["MERGE-01", "MERGE-07"]
legacy_state: "Open"
---

# MERGE-08 · The assembled document: every page of the result, in order, rendered on device before any merge

*Filed 2026-09-13* from the Merge review. This is the thesis of the plan: upload-based tools cannot
show the result before the upload ends; we hold the bytes and can show it as files are dropped.

## Scope and acceptance

Below the file list, a **page strip**: every page of every file in the final order, grouped by file
with a thin divider and the file's colour tag, rendered progressively from `renderPdfThumbnails` and
only for pages near the viewport (an IntersectionObserver is fine here; the home-page rule is about
revealing what JS first hid, and nothing here is hidden first). Drag a file in the list and the strip
reflows with the same animation SortableJS already gives the rows. Tap a page to see it large in a
dialog (`showModal()`, per `project_fullscreen_dialog_top_layer`).

This is a new component over the existing `PageGrid.module.css` classes and the Edit Pages thumbnail
pipeline, not a fork of either. The strip is read-only in this ticket; MERGE-09 makes it editable.
Rendering is cancellable: removing a file or clearing the list stops its pending renders.

**Performance and memory.** Thumbnails at 150 px wide as PNG are 15 to 25 KB each; a 400-page set
holds 8 MB of data URLs, acceptable, but the strip must render JPEG at a smaller width on phones and
must release thumbnails of removed files. Set a budget in the ticket before building (pages rendered
per second on a mid-range Android; memory per page) and measure it in a real browser.

**Acceptance.**

- With four files loaded, the strip shows all pages in order within a second on desktop, progressively
  on a phone; reordering a file reorders its group; removing a file removes its pages and cancels
  pending renders.
- pdf.js stays lazy; `npm run test:weight` unchanged for first load.
- One Playwright check under `e2e/merge/` that the strip's page count equals the sum of the files.
- The subhead can now truthfully mention seeing every page (MERGE-05 revisited in MERGE-09).
