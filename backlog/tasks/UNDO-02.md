---
id: "UNDO-02"
title: "Edit Pages gets undo and redo, the destructive tool that has neither"
status: "in_progress"
priority: "P2"
epic: "undo-and-redo"
phase: "near-term"
depends_on: []
---

# UNDO-02 · Edit Pages gets undo and redo, the destructive tool that has neither

*Filed 2026-09-20* out of the redo assessment, which surveyed every tool and found this one.

## Problem

Edit Pages (`/edit-pdf/`) reorders, removes and rotates pages and has **no undo at all**. Every
action is reversible only by hand: re-tap the toggle, rotate three more times, drag the page back.
`docs/ux-design-guidelines.md` §6 makes undo the house answer to a reversible action, and this tool
never got it.

## Why it is the cheapest win in the codebase

The tool's whole mutable document state is three lightweight `useState` values in
`PdfEditPagesTool.tsx`: `pages` (whose order *is* the final page order), `removedPageNums`, and
`rotations`. A whole-state snapshot stack fits exactly, and it delivers undo and redo in one change
rather than undo now and redo later. `EditPage` carries a thumbnail, but snapshots share those by
reference, so a snapshot costs an array of pointers, not images.

## Scope and acceptance

- A snapshot history local to `src/tools/edit-pages/`, not `src/lib/`: one consumer today, and
  `docs/module-boundaries.md` puts single-consumer modules in the tool's own folder. It gets promoted
  if Merge and Split adopt it (UNDO-05).
- A hard depth cap on the past stack, with the reason in a comment. Nothing else in the app caps a
  history stack, so there is no precedent to copy and an uncapped one retains every intermediate page
  array for the session.
- Every mutation commits one snapshot: reorder (the SortableJS drop), the keep/remove toggles
  including the bulk actions, and rotate. One user action is one history entry.
- Undo and Redo controls in the tool's existing control style, disabled at the boundaries, 44px
  targets, and every action announced through the existing live region.
- Keyboard comes from UNDO-01's shared `useHistoryShortcuts(onUndo, onRedo)`.
- Tests: rotate, removal and reorder each round-trip (assert the full page-number order, not
  membership); a new action after an undo clears the redo future; the depth cap holds; the
  disabled states are right at both boundaries.
