---
id: "QUAL-22"
title: "Choose files is reachable by keyboard on every tool's empty state"
status: "in_progress"
priority: "P1"
epic: "polish"
horizon: "now"
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
