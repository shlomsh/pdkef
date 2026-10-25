---
id: "DEBT-55"
title: "Every tool that loads with pdf-lib repairs a lost page list the way Edit Pages does"
status: "open"
priority: "P3"
epic: "robustness"
horizon: "next"
depends_on: ["DEBT-54"]
---

# DEBT-55 · Every pdf-lib loader repairs a lost page list

*Filed 2026-10-18 with DEBT-54.* DEBT-54 gave Edit Pages `loadPdfWithPages` (`src/tools/edit-pages/loadPdfPages.ts`, with `pdfPageTree.ts`),
which reopens a PDF whose catalog lost its `/Pages` when one page-tree root survives. Split, Merge,
Compress, Unlock/Protect and the Sign and Redact adapters still call `PDFDocument.load` directly and fail
on the same files.

Outcome: the two modules move to `src/lib/` (rule 9 of the module boundaries wants two consumers there), each of them loads through the shared loader (or states in a comment why it cannot), and the
`pdf_page_tree` event gains a `tool` property so the read tells the tools apart. Start from the
`pdf_page_tree` counts: if the event never fires as `repaired` in production, say so here before
spending the work.

Progress (2026-10-25, GRID-05): `loadPdfWithPages` and `pdfPageTree` now live in `src/lib/`; Edit PDF and
Split load through them. Merge, Compress, Sign and the rest still have their own pdf-lib loads.
