---
id: "FORM-39"
title: "Read four weeks of Sign's page_kind and decide whether scans come next"
status: "open"
priority: "P2"
epic: "form-detection"
horizon: "later"
depends_on: ["FORM-35"]
---

# FORM-39 · Read four weeks of Sign's page_kind and decide whether scans come next

## Why

FORM-35 shipped `page_kind` on `sign_form_detection` on 2026-10-08. FORM-32 and FORM-33 showed that serving scans
means a raster geometry pass (FORM-07) first and OCR or a learned detector after it, all real work. This ticket
is the decision those numbers feed, due from 2026-11-05.

## Scope and acceptance

- [ ] From 2026-11-05, run `npm run errors:read` and record the share of `sign_form_detection` successes per
      `page_kind` (and how many still arrive without one, from cached clients).
- [ ] Decide and record here: scans stay parked, or FORM-07 is next. Read the shares with their known blur: a scan that also
      paints one axis-aligned box (a border or a white background) reads as `vector`, a scan with an OCR text
      layer reads as `text`, and ink inside Form XObjects or curved art reads as `image` or `none`. If the
      `vector` share is large with few fields found, sample whether those are scans before deciding.
