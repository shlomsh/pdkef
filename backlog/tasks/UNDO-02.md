---
id: "UNDO-02"
title: "Edit Pages gets undo and redo, the destructive tool that has neither"
status: "done"
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

## Done 2026-09-20

Snapshot stack over the tool's document, capped at 50, one entry per user action including the
SortableJS drop. Undo and Redo controls plus the shared `Cmd/Ctrl+Z` and `Shift+Cmd/Ctrl+Z`, which is
what moving the shortcut hook to `src/lib/history/` was for: this is not an editor tool and could not
have reached it in `src/editor-ui/`.

The toolbar row had no disabled state at all, so the new controls rendered identically whether or not
they could act. It has one now.

Two defects an independent review reproduced, both fixed:

- **Undo permanently destroyed thumbnails.** Snapshots held the pages array, but thumbnails arrive
  asynchronously outside history, so an undo restored the thumbnail set from commit time and rendering
  had already finished. On a long scan this blanked most of the grid. Fixed at the right level: a
  thumbnail is not a user edit, so it is no longer under history at all. `amend` applies it to the live
  document and to every snapshot already on the stacks. This is the same defect UNDO-05 records for
  Merge and Split, found here first.
- **Two actions in one task swallowed a step.** The snapshot ref was updated from a `useEffect`, which
  Preact defers to an animation frame, and undo/redo read their stacks from a render-scoped closure.
  Two rotate clicks pushed the same snapshot twice; two `Cmd+Z` keydowns moved back one step while
  pushing two onto the future. The hook owns the document now, as one past/present/future value with
  functional updates throughout.

Each regression test was confirmed to fail against the pre-fix code, so it bites.

A real-browser e2e covers the case the unit test cannot reach: the unit test stubs the drag, so it
never sees SortableJS physically move a DOM node while Preact reconciles a keyed list from state. A
real three-position drag, then undo and redo, restores the visible order exactly.
