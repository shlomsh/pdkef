---
id: "UNDO-04"
title: "History covers moves, resizes, styling and typing, not just add and delete"
status: "done"
priority: "P1"
epic: "undo-and-redo"
phase: "near-term"
depends_on: ["UNDO-01"]
---

# UNDO-04 · History covers moves, resizes, styling and typing, not just add and delete

*Filed 2026-09-20.* This is the gap people actually feel, and neither UNDO-01 nor any amount of redo
closes it.

## Problem

`HistoryOperation` is `'add' | 'delete'`. Moves, resizes, colour, font and text content are
deliberately untracked (`PdfRedactTool.tsx:161-165`; SIGN-12; `docs/sign-tool-product-decisions.md` §5
makes the broader case optional follow-up). So undo and redo cover placements, deletions, duplications
and clear-page, and a nudged box does not come back.

## Shape of the work

- A third `update` operation carrying before/after snapshots.
- **The geometry half is clean**, because the gesture golden rule already gives it one commit point:
  `src/lib/gestures/controller.ts` calls `commit(latestPatch)` exactly once per gesture behind a
  `finished` guard, and every drag-created element is already logged inside that callback. One gesture
  is one command, for free.
- **Typing is the hard half** and needs coalescing. Sign's text elements are real `<textarea>`s whose
  native undo the shortcut hook currently, correctly, leaves alone; a history entry per keystroke would
  be wrong and per-session would be too coarse.
- Sizing note: the persisted history array has no depth cap today, and an `update` operation would push
  far more entries through it than add/delete ever did. Cap it as part of this work.

## 2026-09-25: raised to P1 for the next-generation Sign

An accidental move on a phone has no way back, and Shlomi named it directly: undo "only removes the last
elements added". This is now a prerequisite of SNG-05 (`docs/sign-next-gen.md` §5.5). The audit that day
found every move, resize, keystroke and style change already funnels through one function per tool:
- Sign: `updateElement`, `PdfWorkspace.tsx:229`
- Redact: `PdfRedactTool.tsx:591`

So the fix is:
- an `'update'` entry `{id, before, after}` in the pure core, with its branch in
  `revertHistoryEntries`/`applyHistoryEntries` and `draftValidation`;
- logging at those two choke points;
- one step per text edit session, and same-element nudges within about 500ms merged;
- a label per entry.

No "Moved · Undo" chip (Shlomi's call).

## 2026-09-26: done

Branch `claude/undo-04-update-history`.

- **Core** (`src/editor/model/actionHistory.ts`): `ActionHistoryEntry` is now a union of snapshot
  entries (add, delete) and `UpdateHistoryEntry` (`updates: [{ id, before, after }]`, only the changed
  fields, so a signature's image is never copied into a move). Reverted and re-applied in place, so
  z-order never moves. `captureElementUpdate` returns null for a no-op, so a click that ends where it
  started logs nothing.
- **Labels and kinds** (`src/editor/model/updateKind.ts`): `classifyElementUpdate` names a change move,
  resize, text or style from the fields it touched; `createUpdateEntry` is the one way either tool
  builds an entry. Sign labels are localised (en, he); Redact's match its `Added ... box` voice.
- **Folding** (`historyStack.ts` `pushCommand`): a text edit session (`group`) is one step; same-element
  changes of the same kind to the same fields within 500ms fold; a fold that nets to nothing removes
  the step; never folds while a redo is pending. History is capped at 100, on push and on restore.
- **Choke points**: Sign's `updateElement` (`PdfWorkspace.tsx`) and Redact's (`PdfRedactTool.tsx`).
  No gesture code logs anything; drag-create stays unlogged.
- **Restore** (`draftValidation.ts`): a malformed update drops alone, and an update whose patch would
  make an invalid element is dropped by replaying the history against the restored elements.
- **Found on the way**: `useHistoryShortcuts` re-subscribed in an effect, so a Redo pressed right after
  an Undo reached the previous render's handler and was dropped. It now reads a ref. And a touch tap
  inside the 8px tap slop committed a tiny move; it no longer commits one (it would otherwise log a
  "Moved" step and clear the redo stack).
- **Tests**: unit tests for every pure decision; reducer, workspace and Redact component tests; e2e
  `sign-undo-redo-keyboard.spec.js` "undoing a drag-move restores the pre-drag position" (a Symbols
  element, the same `updateElement` path as a signature). A typing session was probed in a real build:
  one Undo clears the whole session.
- **Open, for Shlomi**: Undo does not roll back the carried or app-wide style (SIGN-33/35), so undoing a colour change
  leaves the next placement in that colour. Recorded in `.claude/rules/editor.md`.
- **Left as is**: a line dragged against the page edge has its endpoints clamped separately, so it is
  labelled "Resized line". Label only.
