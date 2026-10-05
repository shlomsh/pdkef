---
id: "RED-56"
title: "Redact: defer old-document dispose until after the pdfDocument prop swaps"
status: "open"
priority: "P2"
epic: "redact"
horizon: "next"
depends_on: []
---

# RED-56 · Redact: defer old-document dispose until after the pdfDocument prop swaps

*Filed 2026-10-05.*

## The report

Production reports on 2026-10-05 (build 8c9025a, chromium-140, `/redact/`, after `add_files`): pdf.js
TypeErrors from a destroyed page proxy, in `render_page` and `read_glyphs`.

## Cause

`cancel()` in `src/editor/workspace/loadPdf.ts` (about lines 100-108) disposes the old document at the
start of the next load, before Preact commits the new `pdfDocument` prop. Components still hold the old
document for a moment and call into a destroyed transport.

## Done so far

Commit 2ccc0eed stopped the reports by guarding the canvas on the destroyed flag. That treats the
symptom; this ticket removes the cause.

## Outcome

Dispose the old document only after the `pdfDocument` prop has swapped, so no code path uses a destroyed
document. The `isStale` and `loadingTask.destroyed` guards can then be dropped, or kept as defense.
