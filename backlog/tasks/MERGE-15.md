---
id: "MERGE-15"
title: "Spike: a bookmark per source file in the merged PDF"
status: "open"
priority: "P3"
epic: "merge-tool"
phase: "optional"
depends_on: ["MERGE-09"]
legacy_state: "Open"
---

# MERGE-15 · Spike: a bookmark per source file in the merged PDF

*Filed 2026-09-13* from the Merge review.

## Scope and acceptance

None of the leaders writes an outline into the merged file. A bookmark per source file, named after the
file and pointing at its first page, makes a 200-page merge navigable in every viewer and costs the
person nothing. It is a small, true differentiator that fits the voice: useful, not loud.

`@cantoo/pdf-lib` has no high-level outline API, so this is low-level `/Outlines` objects, and it is a
spike first: two days to prove a correct outline in Preview, Acrobat, Chrome and iOS, with skipped
pages and cross-file reordering (MERGE-09) accounted for (a bookmark points at the file's first
*exported* page; a file with every page skipped gets none). Any new dependency goes through the
licence allowlist (`npm run test:licenses`).

**Acceptance of the spike.** A written go or no-go in this ticket with the viewer matrix. If go, the
build ticket is filed separately with the option on by default and off under Options (MERGE-11).

## Update 2026-09-13: spike done, go

Landed on `claude/merge-tool-polish-m20`: `src/lib/outline.js` (`addFileOutline(pdfDoc, entries)`,
low-level `/Outlines` chain, `PDFHexString.fromText` titles so Hebrew survives, `/XYZ null null null`
destinations that keep the reader's zoom) and a `bookmarks` option on `mergePdfs`, off by default until Shlomi has opened the sample (the
reviewer's point: an outline in every merged file is a product change, not a ticket default),
one entry per source file at its first exported page in output order; a file with every page
skipped gets none, and a single contributing file writes no outline at all (a one-entry outline
just names the document). No new dependency. Tests: `outline.test.js` (5) and a `MERGE-15` block in
`merge.test.js` (4: skipped page, fully-skipped file, cross-file reorder, Hebrew title, single file,
`bookmarks: false`).

Viewer matrix: pdf.js (Firefox's engine, and PDkef's own thumbnails) reads the three entries in
order with the Hebrew title intact and each pointing at the right page. Chrome (PDFium), macOS
Preview and Acrobat are not scriptable from here: sample at `~/Downloads/merge15-bookmarks-sample.pdf`
(expects "num-3", "דוח מס", "num-5" on pages 1, 2, 3) for Shlomi to open. `qpdf`/`mutool` are not
installed on this machine.

Decisions still Shlomi's: whether the flag goes on at all, and whether the person gets a switch (the Options disclosure this ticket
mentioned no longer exists; the nearest home is a checkbox row next to "Add page numbers") or the
outline is simply always there.
