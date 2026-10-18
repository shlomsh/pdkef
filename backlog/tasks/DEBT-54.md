---
id: "DEBT-54"
title: "Edit Pages opens a PDF whose catalog lost its page list, and says how often that happens"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "now"
depends_on: []
---

# DEBT-54 · Edit Pages opens a PDF whose catalog lost its page list

*Filed 2026-10-18 from the daily error read.* On 16 Oct one person's file failed to open in Edit Pages
(`pdf_tool_run`, step `load_document`, build 3a21898). The live pdf-lib chunk names the throw site:
`PDFDocument.load` succeeded, then `getPageCount()` -> `catalog.Pages()` -> `context.lookup(ref, PDFDict)`
threw `UnexpectedObjectTypeError`. The catalog's `/Pages` did not resolve to a page-tree dictionary.

## What was measured (2026-10-18, @cantoo/pdf-lib 2.11.1, pdfjs-dist 6.4.299)

Fourteen hand-built variants (catalog with no `/Pages`, `/Pages` to a missing object, to a number, to an
array, page tree in a broken object stream, two roots, inherited attributes):

- pdf.js rejected every file pdf-lib's page tree failed on ("Invalid Root reference", after "Indexing all
  PDF objects"). So pdf.js cannot supply the page order, and the thumbnails fail on the same files.
- In most of them pdf-lib still holds the page-tree root: exactly one `/Type /Pages` dictionary with no
  `/Parent`, Kids intact. Repointing the catalog's `/Pages` at it and saving gives a file both pdf-lib
  and pdf.js open, with the document's own page order and inherited MediaBox and Rotate kept.
- When the object stream holding the root is unreadable, no root survives, only loose `/Page`
  dictionaries. Their order is not recorded anywhere we can read, so we do not guess it.

## Outcome

- Edit Pages opens such a file, shows its thumbnails and exports it, whenever exactly one parentless
  page-tree root survives. One shared loader does the repair for opening and for export.
- Every file whose catalog's `/Pages` does not resolve to a dictionary, repaired or not, sends one
  `pdf_page_tree` maintenance event: outcome, how `/Pages` was broken, and how many roots survived. A
  page tree that resolves but is damaged further down sends no event; its error report says where. Closed lists only, like Sign's
  `page_kind`; nothing from the document. A failure still sends its error report, as the
  "Catching errors" rule asks.
- `docs/error-known-items.json` knows the fingerprint, so a later report reads against the event.

## Contract

- `src/tools/edit-pages/pdfPageTree.ts` (pure, pdf-lib passed in): `diagnosePageTree(doc, lib)` returns
  `{ shape, roots }` or null when `/Pages` resolves; `repairPageTree(doc, lib)` repoints `/Pages` at the
  single root and returns whether the document now has pages.
- `src/tools/edit-pages/loadPdfPages.ts`: `loadPdfWithPages(bytes)` returns `{ doc, pageCount, bytes, repaired }`, and
  rethrows the original error when it cannot repair.
- `maintenanceEventSchema.ts`: event `pdf_page_tree`, properties `{ outcome: 'repaired' | 'failed',
  shape: 'no_pages_key' | 'pages_ref_missing' | 'pages_wrong_type', roots: 'none' | 'one' | 'several' }`.

Other tools that load with pdf-lib adopt the loader in DEBT-55.
