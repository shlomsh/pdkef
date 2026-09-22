---
id: "SIGN-30"
title: "Double-click locks every Sign toolbar tool"
status: "in_progress"
priority: "P1"
epic: "sign-tool-architecture"
phase: "quick-win"
depends_on: []
legacy_state: "Opened 2026-09-22 from Shlomi's report that double-click does not keep a tool armed"
---

# SIGN-30 · Double-click locks every Sign toolbar tool

## Scope and acceptance

**Double-clicking a Sign toolbar tool does not reliably keep it armed** (Shlomi, 2026-09-22). The
invariant is "an armed tool disarms after one placement; double-click locks it", for every element.

Known causes from a code trace:

- A bare `SET_TOOL` clears `toolLocked`, and three paths re-arm with one: picking a saved signature
  (`SignToolbar.tsx` `handleSelectSavedSignature`), picking a shape from the Shapes menu
  (`chooseShape`), and creating a signature in the dialog (`PdfSignTool.tsx`
  `handleAddSignatureElement`).
- The field-navigation arrows mount on first arm of Text/Date outside the reserved status height, so
  the toolbar can shift between the two clicks of a double-click.
- No real-browser test double-clicks a toolbar button.

Acceptance: with a real mouse double-click, every toolbar tool (Text, Date, Symbols, Shapes, Sign,
Whiteout) stays armed across at least two placements, and a Playwright spec proves it.
