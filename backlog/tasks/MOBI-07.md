---
id: "MOBI-07"
title: "Pre-generate the signed PDF so Share is one tap, not two"
status: "open"
priority: "P2"
epic: "mobile-round-trip"
phase: "quick-win"
depends_on: []
legacy_state: "Open"
---

# MOBI-07 · Pre-generate the signed PDF so Share is one tap, not two

## Scope and acceptance

**Sharing a finished form costs two taps and a wait, every single time.** `PdfSignTool.jsx`'s
`handleSavePdf` runs the export, and `usePdfShare` then holds the generated `File` so the *next* tap
can open the native sheet. The comment explains why correctly: `navigator.share()` needs a fresh user
activation and PDF generation is asynchronous, so calling share after an await risks the browser
blocking it. The button reads "Share", becomes "Share now", and the user taps again.

The constraint is real but the timing is a choice. Nothing requires generation to start at tap time.
Once at least one element has been placed, export the document on a debounced idle and hand the result
to `prepare()`, so `shareReady` is already true when the user reaches for the button. One tap, no wait,
and the label reads "Share now" from the start, which is also better copy.

Four things to get right rather than skip. **Do not report speculative exports as user exports**:
`runExport` fires `signExportSucceeded` and `signExportFailed` maintenance telemetry, and counting
background runs would silently corrupt the export-duration signal SIGN-13 exists to collect. **Reuse
the existing guards** rather than adding new ones: `runExport` already tracks `requestId`,
`documentRevisionRef` and `currentFileRef` so a stale result cannot land, and a speculative run is
exactly the case those were built for. **Never pre-run while `exportBlocked`**, since a document with
text no bundled font can draw must still refuse at the honest moment rather than burning CPU on a run
that will be rejected. And **respect the device**: this repeatedly re-renders a whole PDF on a phone,
so debounce generously, cancel superseded runs, and do not start one while a gesture is in flight.

**Acceptance.** After placing an element and pausing, the Share control is already in its ready state
with no prior tap, and one tap opens the native share sheet. Editing after a speculative export
invalidates it, so the shared file always matches what is on screen; prove this with a test that edits
between the pre-generation and the tap. No maintenance telemetry event is emitted for a speculative
run. No speculative run starts while export is blocked. Measured before-and-after tap counts and
wall-clock time to the share sheet on a real phone, not asserted.
