---
id: "SEO-43"
title: "Redact's check lists creator, producer and dates, the metadata that says the most about you"
status: "retired"
priority: "P2"
epic: "redact"
---

# SEO-43 · New tool: see and remove what a PDF's metadata says about you

Filed 2026-10-08 from a read of ihatepdf.cv, which has a "privacy scanner" and a "what PDF metadata
reveals" guide. None of their tools fits our privacy story as directly as this one.

## Why

A PDF can carry the author's name, the software and machine that made it, creation and edit dates, XMP
history and leftover document properties. People share files without knowing this. Showing it and
stripping it on the device is useful on its own and pairs with Redact: Redact handles what is on the page,
this handles what is in the file.

## Scope

- Show what the file carries: the Info dictionary, XMP metadata, and anything else worth naming (for
  example embedded files or JavaScript), in plain words, not field names.
- Remove what the person picks, and write a clean copy with pdf-lib. State what was removed, checked
  against the saved bytes, not against the request.
- Decide explicitly: a standalone tool with its own page, a step inside Redact's export, or both. Argue it
  in this ticket before building.
- Before building: a search-volume check for the metadata queries (Keyword Planner) recorded here.

## Acceptance

- A unit test per metadata source showing it is gone from the saved file, each seen failing first.
- The page and FAQ copy in voice, every claim checked against the code.

## 2026-10-08 finding: most of the core already exists in Redact

Filed before reading the code. What is already built:

- Redact's saved-file check reads document details as places it can show and remove one by one: title,
  author, subject, keywords, the XMP stream and attachments, plus parts of the file no page shows
  (`src/tools/redact/check/types.ts` `PlaceKind`, `placeLocator.ts` "document information, XMP",
  `removePlace.ts`).
- Redact's Delete export clears every Info entry (title, author, subject, keywords, creator, producer,
  both dates) and the XMP stream (`clearDocumentDetails`, `src/editor/adapters/pdf/deleteObjects.js`,
  RED-27).
- Gap: the check does not list Creator, Producer or the dates as places, though they are what RED-27
  found on a CamScanner scan (app name, device, exact scan time).

So this ticket is not "write a stripper". It is a product decision about where that existing reading
and removal lives:

1. **Inside Redact only:** add Creator, Producer and dates to the check's places. No new URL, so not
   blocked by the SEO-06 gate.
2. **A standalone page** that reuses the same core. A new URL, so it waits for the SEO-06 gate and a
   volume check, like SEO-20.

Needs Shlomi's call before any build.

## 2026-10-08 Trends read: no standalone page

Shlomi's screenshot, worldwide, past 12 months, read off the chart: `compress pdf` ~78, `pdf metadata`
~5-8, `flatten pdf` ~1-2, `remove metadata from pdf` and `pdf metadata remover` ~0. The removal queries
sit at or below flatten's noise floor (SEO-21). **Decision: no standalone page.** The scope is option 1:
add Creator, Producer, CreationDate and ModDate to Redact's check as places it shows and removes, with a
unit test per key seen failing first.

## 2026-10-08 retired into RED-59

Shlomi: removing metadata is a strong claim that the tool has to show and the docs have to explain.
That whole outcome now lives in RED-59, which carries this ticket's findings.
