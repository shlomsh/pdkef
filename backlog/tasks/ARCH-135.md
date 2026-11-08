---
id: "ARCH-135"
title: "One five-second Undo window for Redact, Scan and Highlight"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "next"
depends_on: ["RED-72"]
---

# ARCH-135 · One five-second Undo window for Redact, Scan and Highlight

*Filed 2026-11-08, from the implicit state machine inventory.* The chip is shared
(`src/shell/UndoChip.tsx`), but the timing behind it is written four times, each with its own timer
handling:

- `src/tools/redact/hooks/useRedactUndo.ts:13` `UNDO_WINDOW_MS = 5000`, timer at `:69`
- `src/tools/scan/state/scanActions.ts:41` `UNDO_MS = 5000`, timer at `:138`
- `src/tools/highlight/hooks/useRemovedMark.ts:4` `UNDO_CHIP_MS = 5000`, timer at `:25`
- `src/tools/highlight/components/NotePane.tsx:15` `UNDO_MS = 5000`, timer at `:81`

`useRedactUndo.ts:9-12` also cites "Merge's own `UNDO_WINDOW_MS`/`registerUndo`" in
`PdfMergeTool.tsx`, which no longer exists.

Two behaviours differ between the copies. `useRemovedMark` ends the chip on any later change to
`elements`. Redact's chip survives both a keyboard Undo of the same entry and a file change:
`FILE_INITIALIZED` keeps `edits.undoAction` through `...afterTool.edits` (`redactState.ts:380`), so
the last file's chip can show on the next file and its Undo is a silent no-op.

## Acceptance

- One hook in `src/shell/` (beside `UndoChip.tsx`) owns the window constant, the timer, replacing a
  chip, ending it on unmount, and ending it when the caller's "document changed" key changes.
- The four sites use it. Scan's held removal stays in its own state, and only the timer moves.
- Redact's chip ends on a file change and on a keyboard Undo of the entry it names, each with a unit
  test.
- The stale Merge reference in `useRedactUndo.ts` is gone.

## Outcome
