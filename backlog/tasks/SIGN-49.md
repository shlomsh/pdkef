---
id: "SIGN-49"
title: "Sign's toolbar leads with the form: five tools, More, and the file's actions at the end"
status: "done"
priority: "P2"
epic: "polish"
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

- The row, More menu, status-line link and phone rows above, on `/sign/` and `/he/sign/`.
- The design's finish (ghost controls, group dividers, outlined Download, centred fixed-width More).
- The arm-no-shift, touch-target, one-line, labels-fit and export-quiet guards hold with re-measured
  numbers.

## Outcome

Done 2026-11-12. `MoreToolsMenu` holds Highlight, Comment, Ellipse, Rectangle, Line and Feedback; armed
from it, the button takes the tool's word and icon at the same width, a double-click (or double-tap)
locks the armed or last-picked tool, and the shapes are named for themselves in the status copy. A
failed or unstarted field check ends on a "Send me the details" link (`signFeedbackUrl`). Sign's
finish is scoped by `data-finish="strip"`, so Redact and Highlight are unchanged; its labels follow
the toolbar's own width (`@container toolbar (min-width: 1160px)`), so they show at a 1280px window.
Guards: one line from 648px with Share (compared by centre), 6+6 on phones, every control 44px from
360px, labels at 1280 and icon-only at 1100, Download outlined but never filled. The shared
eleven-control rule moved from 531px to 532px after a 594px window stranded one control (red first).
Every number was measured on macOS Chromium; CI's Linux fonts are the check on the ~36px headroom.
