---
id: "QUAL-22"
title: "Choose files is reachable by keyboard on every tool's empty state"
status: "done"
priority: "P1"
epic: "polish"
depends_on: []
---

# QUAL-22 · Choose files is reachable by keyboard on every tool's empty state

*Filed 2026-10-14.* Found in passing by a design review of the shared tool-page first screen.

`src/shell/DropzoneEmptyState.tsx` renders "Choose file(s)" as a `<label class="file-picker-button">`
wrapping `<input type="file" hidden>`. `hidden` makes the input `display: none`, so Tab skips it, and
the focus ring rule `.file-picker-button:has(input:focus-visible)` in `Dropzone.module.css` can never
match. Measured on pdkef.com/merge/ and /unlock/ at 1440px: Tab never lands in the dropzone, and
`label.focus()` leaves focus on `<body>`. A keyboard user cannot open a file on any of the ten tools.

## Outcome

- On every tool page (Merge's band variant and Compress's `compact` variant included), Tab reaches
  the "Choose files" control, Enter and Space open the file picker, and the existing focus ring shows
  on keyboard focus only, not after a mouse click.
- Drag-and-drop and paste keep working; the look does not change (a separate redesign of this first
  screen is being discussed elsewhere).
- Guard: `e2e/tool-empty-state-keyboard.spec.js`, red on the old markup.

## Built and verified (2026-10-14)

- The file input is visually hidden (`.file-input` in `Dropzone.module.css`), not `hidden`, so it is
  in the tab order and the existing `:has(input:focus-visible)` ring matches. `.file-picker-button`
  is its positioning context. Enter and Space open the picker natively.
- Guard: `e2e/tool-empty-state-keyboard.spec.js` (all ten tools, Tab, ring, Enter and Space, ring
  absent after a mouse click, a keyboard-picked file reaches the tool), plus a jsdom check that the
  input carries no `hidden` attribute. Red on the old markup (10 of 12 failed: Tab never reached the
  input), green after.
- The spec flaked on CI at first (3 of 12, a different three each run) with focus confirmed on the
  input and no file chooser opened. A keypress sent straight after `waitForEvent('filechooser')` can
  reach the browser before chooser interception is on; one `page.evaluate` round trip between them
  (`pressForChooser`) fixed it. Cause inferred, not observed: 60 repeated route cases on a throwaway
  branch passed, and `main`'s CI run 38624880992 is green. A click hides this race behind its mouse
  moves, so any new spec that presses a key to open a chooser needs the same round trip.
