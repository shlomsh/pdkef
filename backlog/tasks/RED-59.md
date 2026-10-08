---
id: "RED-59"
title: "Metadata removal is a claim Redact has to show and explain, not just do"
status: "in_progress"
priority: "P2"
epic: "redact"
horizon: "now"
depends_on: []
---

# RED-59 · Metadata removal is a claim Redact has to show and explain, not just do

Filed 2026-10-08 by Shlomi. Takes over SEO-43, retired into this ticket.

## Why

Saying "Redact removes metadata" is a strong claim. A person who redacted a contract needs to see that
the author, the app and device that made it, and the dates are gone, and the docs need to say exactly
what goes and what stays, per export path. Today the removal mostly happens without anyone seeing it.

## What is already true (from SEO-43, read in the code 2026-10-08)

- The saved-file check shows and removes title, author, subject, keywords, the XMP stream, attachments
  and parts of the file no page shows (`src/tools/redact/check/types.ts` `PlaceKind`,
  `placeLocator.ts`, `removePlace.ts`).
- The Delete export clears every Info entry, creator, producer and both dates included, and the XMP
  stream (`clearDocumentDetails`, `src/editor/adapters/pdf/deleteObjects.js`, RED-27).
- The flattened (Blur, Blackout, Whiteout) export starts from a new document, per the same comment.
- Gap: the check does not list Creator, Producer, CreationDate or ModDate, which are the details RED-27
  found on a CamScanner scan (app name, device, exact scan time).

## Step 1: the deeper look, before any change

A table, per export path (flattened pages, Delete, a mix, "Remove it" from the check): which document
details leave, which stay, and which the check shows. Measured on real files saved through the tool and
read back with pdf-lib, not read off the code. Fixtures: a CamScanner scan, a Word export, a file with
XMP history, a file with an attachment. Include the export's own Producer: does pdf-lib stamp one?

## Step 2: show it and explain it

- In the tool: where the person sees the details the file carried and that they are gone, in plain words
  ("Made with CamScanner on an iPhone, 7 Oct 09:14"), not field names. Design call to make here, against
  `docs/ux-design-guidelines.md`.
- In the docs: the Redact page FAQ and the redaction guides say what goes and what stays, matching the
  step 1 table exactly. No claim beyond what the table shows.
- The check lists Creator, Producer and the dates, with a unit test per key seen failing first.

## Acceptance

- The step 1 table recorded here, from saved files.
- Every metadata claim in the tool and docs traces to a row of that table.
- An e2e test that saves a fixture with known details and asserts the saved file has none of them.

## 2026-10-08 step 1 measured

Fixture: `thai-lor-yor-01-2562.pdf` (a real Word 2016 export with XMP and widgets), plus a title,
subject, keywords, an attachment, a catalog JavaScript name tree, an OpenAction script, and page-level
`/Metadata` and `/PieceInfo`. `deleteObjectsFromPdf` and `removePlace` were run for real. The flattened
row replicates `assemble()` in `redact.js` (`create()` + `copyPages` + `save()`), because `redactPdf` needs a
canvas. Script: scratchpad `red59/measure.mjs`; the lead re-ran it with the same result.

| Detail | Delete | Flattened or mixed | Remove it (one place) |
| --- | --- | --- | --- |
| Title, author, subject, keywords | gone | gone | only the one removed |
| Creator, producer, dates | gone | replaced: "pdf-lib (https://github.com/Hopding/pdf-lib)" and the export time | original kept |
| Catalog XMP | gone | gone | gone only when that place is removed |
| Attached files | **kept** | gone | only the one removed |
| Document JavaScript, OpenAction | **kept** | gone | kept |
| Page-level `/Metadata`, `/PieceInfo` | **kept** | **kept on pages copied untouched** | kept |
| Trailer `/ID` | kept (original's) | none | kept |

Mixed runs Delete first and then the flattened path, so its result is the flattened column.

**What the check shows:** a document detail is listed only when a searched term matches its text
(`checkSavedFile.ts`). Nothing lists the details unprompted. Creator, producer and dates are never read
(`readSavedFile.ts`, `placeLocator.ts`).

**What the docs claim:**
- `permanently-delete-text-from-pdf.yaml` (body and FAQ): the download "leaves out the original file's
  details: its title, author, the app that made it and when". True for Delete, which is the path that guide
  covers.
- `remove-camscanner-watermark-from-pdf.yaml`: "keeps no title, author or scan time". True on every path.
- No claim covers attachments, scripts or page-level metadata, and the Redact FAQ makes no metadata claim.

**Existing tests** cover Info and catalog XMP after Delete only (`deleteObjects.test.js`, RED-27). Nothing
covers the flattened export's details, attachments, scripts, page-level metadata or `/ID`.

**Calls for step 2** (the lead proposes, Shlomi decides):
1. Should Delete drop attached files, document scripts and page-level metadata the way the flattened path
   does? An attachment can carry the unredacted original.
2. Should the export stamp no producer instead of "pdf-lib"?
3. Should the check show the document details unprompted, in plain words, so the person sees what goes?

## 2026-10-08 Shlomi's calls

- **File stamps:** every Redact download says nothing about who made it or when (no producer, creator or
  dates) and gets a fresh file ID.
- **Show the details:** the check shows a file's document details without being asked, in plain words.
- **Hidden parts (attached files, scripts, page-level metadata):** not decided in chat. Shlomi wants the
  UX planned carefully by a dedicated planning agent first ("even I didn't think about those traces").
  The plan comes back here before any build.
