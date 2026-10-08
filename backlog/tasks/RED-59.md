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
