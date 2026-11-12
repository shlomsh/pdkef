---
id: "SIGN-49"
title: "Sign's toolbar leads with the form: five tools, More, and the file's actions at the end"
status: "in_progress"
priority: "P2"
epic: "polish"
horizon: "now"
depends_on: ["SIGN-48"]
---

# SIGN-49 · Sign's toolbar leads with the form: five tools, More, and the file's actions at the end

*Filed 2026-11-12. Design chosen by Shlomi: direction E on the canvas
https://claude.ai/artifact/7Uz5w2QLpjcThjREyfYbk8 ("Form first" page, desktop and phone boards).*
The desktop toolbar grew packed as Shapes, Highlight and Comment joined it. Sign's job is filling a
form (text, marks, date), signing it and sending it; the toolbar should say so.

## The design

- **Desktop, one row:** Text, Date, Mark, Whiteout, Sign | More ▾ | Undo, Redo, then at the end Full
  screen (labelled), Replace | Share, Download (the quiet outlined button, QUAL-27). Whiteout stays
  first-class, as the way to delete.
- **More** holds Highlight, Comment, the three Shapes and Feedback. Armed from More, the button
  becomes that tool at the same width, so nothing moves (SIGN-30).
- **The status line** keeps its own full-width line under the file name: it already carries tips,
  arming sentences, the Keep-on switch and the field arrows, so nothing else moves into it.
- **A failed field check** links "Send me the details" from its own message, since Feedback is in More.
- **Phone:** two rows of six by meaning: Text, Date, Mark, Whiteout, Sign, More; then Undo, Redo, Full
  screen, Replace, Share, Download. More opens a popover from its tile at the inline end, never a sheet
  (UX guideline 8). Feedback comes back on the phone inside More.
- No vertical tool rail (rejected).

## Acceptance

To be written when it is picked up: the `--controls-per-row` thresholds and the 1300px label step are
re-measured for the new control count, and the arm-no-shift, touch-target, one-line, labels-fit and
export-quiet guards hold on `/sign/` and `/he/sign/`.
