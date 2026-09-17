---
id: "SIGN-27"
title: "One context row over the editor toolbar on phones"
status: "in_progress"
priority: "P2"
epic: "sign-tool-architecture"
phase: "quick-win"
depends_on: []
legacy_state: "Opened 2026-09-17 from Shlomi's phone screenshots of /redact/"
---

# SIGN-27 · One context row over the editor toolbar on phones

## Scope and acceptance

**The sticky editor card took ~250px of a 390px-wide phone before the first page pixel** (Shlomi,
2026-09-17, screenshots of /redact/): a 34px thumbnail beside a two-line identity (name, then
"1 page · 388 KB · Draft saved"), a hint band that reserved the height of the tallest armed state
even while idle ("Tip: pick a tool to start..."), and the two-row button grid. His three points: the
thumbnail says nothing the document under it does not; the idle tip and "Click and drag on a page
to draw a blackout box." are wasted space for a returning user; squeeze it.

The fix is one row above the grid, the same height in every state:

- The editor variant of `ToolShell` renders no `FilePreview` at any width (also spares Sign and
  Redact a page-1 render). The identity reads as one line everywhere; on phones the pages/size text
  hides and only the name and the draft chip stay.
- On phones the identity text and the status line share one grid cell. Idle shows the filename
  (the idle tip is not rendered); armed shows the tool's sentence with the keep-on switch *beside*
  it, reading "Keep on" (`keepOnShort`, both catalogues) since the sentence has just named the tool.
- **Arming must not move the toolbar.** The second click of a double-click lands on the button the
  first one did (editor.md), and a sticky bar that changes height is a layout shift. So the hidden
  per-tool reservations in `EditorToolStatus` stay at every width; the saving comes from what they
  measure, not from dropping them. Redact's undo chip now rides inside that stack (`override`)
  instead of replacing it, which closes the shift it caused when its 5s timer cleared.
- Delete's sentence drops "from the file" (the idle tip's job): it was a third line every Redact
  row then paid for.

**Acceptance.** `e2e/tool-toolbars/toolbar-phone-row.spec.js`: at 390px both tools' cards are
under 170px, arming leaves the toolbar rect unchanged, the switch sits on the sentence's row and
reads "Keep on". Unit contracts in `EditorToolStatus.test.tsx` and `ToolShell.test.tsx`. Measured
on the build: Redact card 260px → 155px; the "Page 1" heading starts 110px higher.

## Out of scope, filed as the next step

Step 2 of the same design: move Download / Share / Replace to a sticky bottom sheet (UX guideline
§8, the Merge pattern) so the top row is one line of tools. It changes where Download lives and
needs a home for Sign's optional Date and Feedback controls, so it is its own decision.
