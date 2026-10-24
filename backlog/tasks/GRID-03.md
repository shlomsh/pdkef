---
id: "GRID-03"
title: "Merge gets the Undo/Redo stack Edit Pages has, in place of the undo chip"
status: "open"
priority: "P1"
epic: "polish"
horizon: "now"
order: 3
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
