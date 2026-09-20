---
id: "MOBI-14"
title: "A scanned form finds nothing: the detector reads vector ink, and a scan has none"
status: "open"
priority: "P3"
epic: "mobile-round-trip"
phase: "later"
depends_on: ["MOBI-13"]
---

# MOBI-14 · A scanned form finds nothing: the detector reads vector ink, and a scan has none

## What we know, measured

MOBI-13 added IRS Form 1040 (1970) to the scored corpus as its first genuinely scanned document. It
scores **0% recall against 64 annotated targets, with 0 candidates emitted**, and the cause is not
subtle:

```
ink: verticals 0  horizontals 0  rects 0
regions: combs 0  cells 0  checkboxes 0
```

The whole page is one `CCITTFaxDecode` image XObject (2925x4105, 1 bit). Every rule, box and comb on
that form is pixels. `collectPageInk` walks content-stream drawing operators, so there is nothing for
it to find, and `collectCheckboxGlyphs` has no text layer to read either. The detector is not doing
badly here; it is answering a question the document does not pose.

**This is not a regression and the baseline is not a target.** `baselines.json` records it as
`recall 0.0, precision null`, and `scoring.test.js` pins `candidates` at exactly 0, so the day
anything starts finding fields on a scan the row fails and has to be re-recorded by whoever earned
it. The truth file is already annotated and waiting to measure that.

## Why it might be worth doing

A scan is not an exotic input. It is what a person gets when someone photographs or faxes a form and
sends it on, which is squarely the "fill a form from a chat and send it back" case this epic is
about. Today such a file opens fine, renders fine, and offers zero assistance: every field has to be
placed by hand.

## Why it might not

Nothing here is free. Finding boxes in a raster means image processing in the browser - thresholding
and run-length or Hough-style line finding over a 2925x4105 bitmap - on a device that may be a phone,
with the result feeding the same `FieldRegion` shape the vector path produces. That is a real
feature, not an adjustment, and it must stay on-device like everything else.

Before building it, answer the cheap question first: **how often does anyone actually open a scan?**
The allowlisted maintenance telemetry could say, and a measured "almost never" closes this ticket
honestly for the price of a week's data.

## Scope, if it is taken

- [ ] Decide from evidence whether scanned input is common enough to serve.
- [ ] If yes: a raster line-finding pass behind the existing detector, feeding `FieldRegion`, never
      replacing the vector path on a document that has one.
- [ ] Re-record `irs-1040-1970` in `baselines.json`, which is the only proof the work did anything.
- [ ] The three other verified public-domain scans in MOBI-13 (`f1040--1962` with its non-zero
      CropBox origin and Flate raster, `f1040--1944` with one page sliced into 25 CCITT strips) are
      ready to widen the evidence if this is built.

## Not in scope

OCR. Reading a scan's *text* is a different and much larger problem; this is about finding the boxes
a person writes in, which is geometry.

## Acceptance

- [ ] Either a measured decision not to build it, recorded here with the evidence and the date, or
      `irs-1040-1970` scoring above zero with its baseline re-recorded in the change that earned it.
