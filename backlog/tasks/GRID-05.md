---
id: "GRID-05"
title: "Split shows its pages through the shared page grid"
status: "done"
priority: "P2"
epic: "polish"
depends_on: ["GRID-04"]
---

# GRID-05 · Split on the shared page grid

Design: [docs/shared-page-grid.md](../../docs/shared-page-grid.md), decision 4. Split's
`PageToggleTile` grid moves onto `PageGrid` with drag off; its own thumbnail renderer goes. Its undo
moves to the stack and `useUndoChip` is deleted if nothing else uses it. Extend the parity guard
with `/split/`.

## Outcome (2026-10-25)

Done. Split composes the shared pieces like Edit PDF: one Undo/Redo stack over the plan (a range typed
in one go is one step), PageGrid without drag, PageWorkspace with the rail in order of consequence (mode,
pages, Download, hand-offs, Replace file last; UX guideline 20), the shared Download flow (One PDF per
page builds several parts, each saved and shared), Compress and Sign for one PDF, NeedsUnlock in English
and Hebrew. The mode stays in view on phone in the sticky bar (split-stage spec at 1280, 820, 375).
Shared additions: plan range helpers, `reorderable`, multi-file output, FinishRow `tools`, history
`merge`; `loadPdfWithPages` and `pdfPageTree` moved to `src/lib/` (Edit PDF and Split, the first step of
DEBT-55). Parity guard covers /split/ (cell rects within 1px of Merge). A 29-path production matrix
passed (English, Hebrew, phone, hand-off, protected files, multi-file downloads, one-step Undo). Two fresh
reviews' findings were fixed, among them focus jumping from the range field to a tile, Download again
doing nothing for several files, no way out of a failed load, English protected copy on /he/split/, the
Hebrew plural in Merge's and Split's headings, a stale hand-off navigating after a new file, and a dead
Tailwind rule compiled from a message key. A completed Share now counts in Merge and Edit PDF too
(ANALYTICS.md, 2026-10-25).
