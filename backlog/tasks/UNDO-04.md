---
id: "UNDO-04"
title: "History covers moves, resizes, styling and typing, not just add and delete"
status: "in_progress"
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
