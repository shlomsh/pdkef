---
id: "RED-56"
title: "Redact: defer old-document dispose until after the pdfDocument prop swaps"
status: "done"
priority: "P2"
epic: "redact"
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

## Done 2026-10-17

`loadPdf` takes an optional `retireDocument(document, release)`. A document already handed to `onDocument`
is no longer destroyed by `cancel()`; it goes to `useDocumentRetirement` (`src/editor-ui/hooks/`), which
releases it in an effect after the first commit that no longer renders it, and on unmount. Redact and Sign
both pass it. A document never handed over (errors, timeouts, owner-restricted) is still destroyed at once.
The `isStale` and `loadingTask.destroyed` guards from 2ccc0eed stay as defense for in-flight async reads.
Test: `useDocumentRetirement.test.tsx` (A then B: A survives the swap, is destroyed after it, never used
after; unmount; published-but-never-committed).
