---
id: "UNDO-04"
title: "History covers moves, resizes, styling and typing, not just add and delete"
status: "open"
priority: "P3"
epic: "undo-and-redo"
phase: "longer-term"
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
