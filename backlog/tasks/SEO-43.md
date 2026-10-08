---
id: "SEO-43"
title: "New tool: see and remove what a PDF's metadata says about you"
status: "open"
priority: "P2"
epic: "search-and-languages"
horizon: "later"
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
