---
id: "FORM-35"
title: "Count how often Sign opens a page that is only an image, before building anything for scans"
status: "open"
priority: "P2"
epic: "form-detection"
horizon: "next"
depends_on: []
---

# FORM-35 · Count how often Sign opens a page that is only an image, before building anything for scans

## Why

FORM-32 and FORM-33 showed that serving scans means a raster geometry pass (FORM-07) first and OCR
or a learned detector only after it, all of it real work. Nobody knows whether scans are common in
Sign: MOBI-14's question ("how often is a PDF with no text layer and no vector ink opened, split by
Hebrew") was never instrumented. `sign_form_detection` (`src/lib/maintenanceEventSchema.ts`) reports
an outcome and a field-count bucket only.

## Scope and acceptance

- [ ] Add one coarse property to `sign_form_detection` from a closed list (for example the first
  page is text, vector-only, or image-only), decided by the detector's existing inputs, never from
  page content beyond that. Same rules as the rest of the schema: no counts, no durations, nothing
  that characterises a document. The site locale (`en`/`he`) only if the schema's review allows it.
- [ ] Schema, sender and `api/report.ts` parse updated together with their tests; `errors:read`
  shows the split.
- [ ] After 4 weeks of data, record the share and decide: scans stay parked, or FORM-07 is next.
