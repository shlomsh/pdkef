---
id: "ARCH-135"
title: "One five-second Undo window for Redact, Scan and Highlight"
status: "done"
priority: "P3"
epic: "unify-and-narrow"
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

- `src/shell/useUndoWindow.ts` (landed with this ticket's start) owns `UNDO_WINDOW_MS` and the timer:
  `start()` opens or restarts the window, `stop()` closes it early, an unmount clears it.
- Redact, `useRemovedMark` and `NotePane` use the hook. Scan's timer lives on its `work` object in
  `scanActions.ts`, outside any hook, so Scan imports `UNDO_WINDOW_MS` only and keeps its timer.
- Redact's chip ends on a file change and on a keyboard Undo of the entry it names, each with a unit
  test.
- The stale Merge reference in `useRedactUndo.ts` is gone.

## Outcome

Done 2026-11-08. `src/shell/useUndoWindow.ts` owns `UNDO_WINDOW_MS` and the timer (5 unit tests). Redact's `useRedactUndo`, Highlight's `useRemovedMark` and `NotePane` run on it; Scan's `scanActions.ts` takes the constant for its own `work.removalTimer`. `UNDO_CHIP_MS` and the stale Merge references are gone. Redact's chip now ends on `FILE_INITIALIZED` (the new file's edits come from `editsForNewFile`) and when an Undo reverts the entry it names (`chipAfterUndo`), with three reducer tests, two red before. `redactReducer` shrank from 240 to 236 lines. NotePane gained an expiry test. Playwright as recorded on ARCH-133.
