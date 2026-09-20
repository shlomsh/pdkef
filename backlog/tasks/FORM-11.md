---
id: "FORM-11"
title: "Say what the detector found, and tell a failure from an honest zero"
status: "done"
priority: "P1"
epic: "form-understanding"
phase: "near-term"
depends_on: []
---

# FORM-11 · Say what the detector found, and tell a failure from an honest zero

## Why

Sign has run a form-field detector on open since MOBI-03, and it works: on the practice form
(`public/images/redaction-guide/sample.pdf`) it finds 8 of 9 fields. The product never said so.
The owner reported "it does not detect my form" three times, and each time it took driving a real
browser to establish that detection was in fact working. This is a visibility bug, not a detector
bug.

Three gaps, all measured:

1. The only surface was `FormFieldHints.tsx` - an `aria-hidden`, pointer-events-none overlay
   rendered **only while the Text, Date or Symbols tool is armed**. Loading a PDF disarms every
   tool (`PdfSignTool.tsx`), so on open a person saw nothing at all.
2. `useFormFieldRegions.ts` ended its effect with `catch { setRegions(NONE); }`. "Detection threw"
   and "this PDF has no detectable fields" were one state from outside, including to an engineer
   debugging it - which is exactly how a renamed export once made every document report zero
   fields through a green build (`useFormFieldRegions.wiring.test.js`).
3. No build identifier was rendered anywhere, so "am I running the new code or a service-worker
   cached old one?" could not be answered from the UI. `sw.js` has no `skipWaiting()` on purpose,
   so a stale bundle is an expected state.

## What landed

- **The status line says what was found**, at rest, beside the Next/Previous control and not
  gated on an armed tool: a count, "No form fields found", "Could not check this PDF for form
  fields", "Could not load the form field check" or "The form field check did not start on this
  file". `role="status"`, unlike the hint overlay,
  which is correctly `aria-hidden`. Wording lives in `TOOL_COPY`/`SignMessages`, English and
  Hebrew.
- **Five detection states instead of one silence** (`FormDetectionState`): `pending`, `done`,
  `failed` (the detector ran and threw), `unavailable` (its own chunks never imported - what a
  shell cached before a deploy does, since `sw.js` serves HTML cache-first) and `not-started`
  (the effect's own precondition bail: no bytes, an empty or detached buffer, no page count or no
  pdf.js document). `not-started` is the one with no exception anywhere behind it and the one that
  reproduces the live report exactly; it is reported after a 1.5s grace period, because a load
  sets the bytes and the pdf.js document in two separate steps. Only `unavailable` is the
  person's to act on, so it is the only one whose copy says what to try.
- **The last non-success reason survives a later successful run** (`issueRef`), so "it works if
  you wait" still leaves evidence in the Feedback report while the status line reports the
  current state honestly.
- **The throw is captured and relayable.** `formDetectionDetail.ts` reduces it to one line: the
  error's name always, its message only for the six errors the JS engine itself throws (a message
  a PDF library built can quote a field label or a filename), minus any path- or name-shaped
  token, one line, 200 characters. That line goes to the console and into the prefilled Feedback
  report, where the body says the tool put it there. Nothing else about the document travels.
- **Anonymous maintenance telemetry**: `sign_form_detection`, one event per opened document, with
  a bucketed count or one error code off a closed list (`modules_unavailable` for the stale-shell
  case, `not_started` for the bail). Disclosed in `ANALYTICS.md` and `docs/maintenance-telemetry.md`.
- **The build id is rendered at the bottom of `/about/`**, substituted by
  `scripts/generate-precache-manifest.mjs` from the same hash `sw.js` carries, so the page and the
  cache version can never disagree.

## Deliberately not done

- **No automatic retry of a failed chunk import.** It would mask the very state this ticket
  exists to make visible, and the honest fix for a stale shell is reopening the page, which the
  copy now says. Worth deciding explicitly if the `modules_unavailable` rate turns out to be real.
- **No retry of a failed or never-started run.** Same reasoning: a retry would hide the state.
- **The count line is `display: none` below 560px**, exactly as the idle tip already is: there the
  status line shares one grid cell with the filename, and the file's own name is worth more than a
  count to someone who can see the outlines by arming a tool. A failure is the exception and does
  show, because the devices we cannot reproduce are phones.
- **The summary is a row of the status stack, not a sibling of it.** A sibling grew the identity
  row when the walk finished, which at 900px wrapped it and moved the toolbar and the document
  down a line a moment after every file opened - a layout shift with no input to excuse it, and
  `sign-saved-work-restore-acceptance.spec.js` holds CLS at 0.01. In the cell it costs nothing.
  The cost is that it yields to an armed tool's row, which carries the keep-on switch.
