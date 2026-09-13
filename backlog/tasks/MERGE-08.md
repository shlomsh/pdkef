---
id: "MERGE-08"
title: "The assembled document: every page of the result, in order, rendered on device before any merge"
status: "done"
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

## Updates

- 2026-09-13: `src/components/MergeTool/PageStrip.tsx` + `PageStrip.module.css`, loaded through a
  dynamic `import()` once files exist (eager JS for `/merge/` 261 KB brotli against 255 before, budget
  400; pdf.js stays lazy). One horizontal `role="list"` of every plan entry, dividers at file
  boundaries, a file tag per card. Thumbnails come from `openThumbnailSource` (one pdf.js document
  per file, released with `destroy()` and an aborted controller when the file leaves), rendered one
  at a time with a yield between pages and only for cards an IntersectionObserver on the strip
  reports near the viewport. Budget: 150px PNG on desktop (15 to 25 KB a page), 96px JPEG at 0.7
  under 768px (2 to 3 KB), so a 400-page set stays under 10 MB of data URLs on desktop and about
  1 MB on a phone. Tap a page: `PagePreviewDialog` via `showModal()`, also a dynamic import. The
  Playwright count guard is `e2e/merge/merge-strip.spec.js`. Measured on a mid-range Android: not
  done here (no device in this session); left for the field read in MERGE-16. Done.
- Direction A (2026-09-13): the horizontal strip became a wrapping page grid that fills the workspace, with a label per file (tag, name, page range) instead of the per-page tag the critique found painted under the thumbnail; 104px cells on desktop, 96px on a phone, 12px gaps, landscape shown landscape at full cell width. The heading carries "14 rendered" while thumbnails arrive.
- Wave 5 (2026-09-13, Shlomi): one continuous wrapping grid across files; a file's label is a small tag above the first page of its run, a full-width caption row only for a run of four pages or more; five one-page files sit in one row at 1280 and as four and one at 375 (72px cells, 8px gaps). Every file name goes through FileName.tsx, a middle ellipsis that keeps the number and .pdf, laid out in the name's own direction.
- Review pass (2026-09-13, Shlomi): the page preview is a gallery. Previous and Next are 44px chevrons on the two sides of a fixed-height (70vh) stage, the stage's outer thirds step on a click and the middle third is inert; the last page stays up, dimmed, until the next one has rendered, so the dialog no longer shrinks and grows on every step (measured: one stage height, 630px at 1280, across five steps). The title's count is the output count the heading uses, with "· skipped" on a skipped page, and Previous/Next disable at the real ends of the plan. Cells are a fixed height in every row; a landscape page is wider, never shorter.
- 2026-09-13 (Shlomi): a click on Rotate left that cell's buttons open while the pointer hovered another page (`:focus-within` held by the clicked button). The cluster follows hover and `:focus-visible` only; a keyboard-focused cell still shows it. Guard in merge-direction-a.spec.js on chromium and webkit.
