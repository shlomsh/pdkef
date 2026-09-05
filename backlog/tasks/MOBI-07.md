---
id: "MOBI-07"
title: "Pre-generate the signed PDF so Share is one tap, not two"
status: "done"
priority: "P2"
epic: "mobile-round-trip"
phase: "quick-win"
depends_on: []
legacy_state: "Done 2026-09-05"
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

## Outcome (2026-09-05)

`runExport` in `src/components/PdfSignTool.tsx` takes a `{ speculative }` option. A new effect,
debounced `SPECULATIVE_EXPORT_DEBOUNCE_MS` (1500ms) after the last committed edit
(`documentRevision`), calls it once at least one element exists and `exportReadiness.blocked` is
false, handing the result straight to `usePdfShare`'s `prepare()`. Because state only updates once
per gesture on release (the golden rule in Part II §1.2/§4), this effect structurally cannot fire
mid-drag/resize/create - there is nothing for it to react to until the gesture already committed.

Four things from the scope, addressed:
- **Not counted as a user export**: `signExportSucceeded`/`signExportFailed` are only reported when
  `!speculative`; a speculative failure is swallowed with a `console.error` and no user-facing state
  change, since the user never asked for this run and will get the honest refusal if they later tap
  an export button themselves.
- **Existing guards reused, not duplicated**: `requestId`/`documentRevisionRef`/`currentFileRef`
  gate a speculative result exactly as they already gated a real one, so a stale speculative result
  can never call `prepare()`. The one addition is `activeExportSpeculativeRef`, which the existing
  "edits invalidate an in-flight export" effect reads to skip its user-facing announcement for a
  superseded *speculative* run (it was never shown as "preparing" in the first place) while
  preserving that announcement for a superseded real export.
- **Never pre-runs while blocked**: gated on `exportReadiness.blocked` (`getSignExportReadiness`,
  the same computation `PdfWorkspace` already used to disable the buttons).
- **Respects the device**: a 1500ms debounce (autosave's own debounce is 700ms; this is heavier
  work, so longer), and the speculative run never touches `status`/progress/announcements, so it
  can never show the "signing" spinner block that replaces the whole button row.

Test: `src/components/PdfSignTool.test.tsx`'s new MOBI-07 case places a text element, never clicks
Share or Download, and asserts the Share button's title flips to the ready state on its own, that no
`reportSampledMaintenanceEvent` call happens, that the signing-spinner text never appears, and that a
further edit reverts the button to not-ready before a second background export lands.

Not done here, left to be measured live per the acceptance line: before/after tap counts and
wall-clock time to the share sheet on a real phone.
