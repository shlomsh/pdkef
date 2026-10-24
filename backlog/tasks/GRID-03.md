---
id: "GRID-03"
title: "Merge gets the Undo/Redo stack Edit Pages has, in place of the undo chip"
status: "done"
priority: "P1"
epic: "polish"
depends_on: ["GRID-01"]
---

# GRID-03 · One undo model: the Undo/Redo stack

Design: [docs/shared-page-grid.md](../../docs/shared-page-grid.md), decision 2.

`useEditHistory` moves to `src/lib/history/`. Merge's present becomes `{ entries, plan }`, so skip,
rotate, move, file reorder and file removal are each one step. `HistoryButtons` (Undo, Redo) sits in
the document header where the chip was; `useHistoryShortcuts` binds Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z.
`PageGrid` drops `onRegisterUndo`. `useUndoChip` stays for Split until GRID-05.

## Acceptance

- A unit test per action proves undo then redo restores it, including removing a file.
- Restoring saved work and loading files never become undo steps.
- The undo, picked-up and shortcuts lines in the header no longer compete (the chip's priority rule
  goes with the chip).

## Outcome (2026-10-24)

Done. Merge's document `{ entries, plan, sortMode }` lives in `src/lib/history/useEditHistory.js`;
undoing a sort brings the sort choice back too. The chip, its CSS and keys are gone; `useUndoChip`
moved into Split (its one consumer) for GRID-05. The phone's restored-work sentence takes its own line
so the grid no longer rises when it times out (caught by merge-saved-work-restore-acceptance).
