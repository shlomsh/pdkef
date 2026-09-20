---
id: "UNDO-01"
title: "Redo for Sign and Redact, on the keyboard and in the Undo dialog"
status: "in_progress"
priority: "P2"
epic: "undo-and-redo"
phase: "near-term"
depends_on: []
---

# UNDO-01 · Redo for Sign and Redact, on the keyboard and in the Undo dialog

*Filed 2026-09-20* out of the redo assessment. SIGN-12 shipped dependable add/delete undo and closed
with "typing, movement, styling, and redo remain deferred P3 scope". This is the redo half, and it is
small because the command model was built for it.

## Why it is cheap

`src/editor/model/actionHistory.ts` says so in its own doc comment: both add and delete retain
complete element snapshots "so persisted history is self-contained and can later support redo without
reconstructing an element from live editor state". Every entry carries the whole element plus its
index in the flat paint-order array, so `revertHistoryEntries` and its mirror are the same function
with the `operation` branches swapped. Nothing needs new capture, new data or a migration.

There is no forward-stack scaffolding today. Sign's reducer does `actionHistory.slice(1)` and drops
the entry; Redact's `applyRevert` filters it out by id. Both are one line from pushing it somewhere.

## Scope and acceptance

- `applyHistoryEntries()` beside `revertHistoryEntries()`, and pure past/future helpers in
  `src/editor/model/`. Headless, no Preact: `editor` may never import `editor-ui`.
- **The redo stack is strictly linear and is cleared by any new command and by any selective revert.**
  The shared `UndoHistoryModal` reverts an arbitrary checked set from the middle of the stack, so a
  surviving future could re-insert an element a still-live later command assumed was gone. Exact
  z-order across undo then redo holds because of this rule, not independently of it.
- `useUndoShortcut(onUndo)` becomes `useHistoryShortcuts(onUndo, onRedo)` with `Shift+Cmd/Ctrl+Z` and
  `Ctrl+Y`. This also fixes a live bug: the hook never reads `e.shiftKey`, so `Shift+Cmd+Z` performs a
  plain undo today. Keep the `INPUT`/`TEXTAREA` bail-out; Sign's text elements are real `<textarea>`s
  and their native undo stays untouched.
- Sign gains `redoHistory` in the reducer with a `REDO` case; Redact gains the same in `useState`.
  **`REDO` must bump `documentRevision`** exactly as `UNDO` does, or SIGN-14's export invalidation
  lets a stale export download against a changed document.
- The redo affordance lives in the shared `UndoHistoryModal`, plus the keyboard. **No new toolbar
  control** (Shlomi, 2026-09-20): Sign is at twelve controls and SIGN-18 proved a thirteenth re-opens
  the hand-computed 239px/251px thresholds. UNDO-03 carries that separately.
- The redo stack stays in memory. History is persisted through `extra: { actionHistory }`; a restored
  draft having no redoable future is the honest default and avoids doubling an array that has no depth
  cap. Persisting it later is additive (`extra.redoHistory`, absent meaning none, no schema bump).
- Tests: `applyHistoryEntries` round-trips and preserves exact stacking order; a new command and a
  selective revert both clear the future; `documentRevision` advances on redo; the first test in the
  repo to dispatch a `metaKey`/`ctrlKey` keydown, since the shortcut hook has no coverage at all. One
  Sign e2e: place, `Cmd+Z`, `Shift+Cmd+Z`, same rect and same stacking position.
- `toolbar-desktop-one-line.spec.js` and `toolbar-touch-targets.spec.js` passing untouched is the
  evidence that no toolbar cost was incurred.

## What this deliberately does not do

History logs `add` and `delete` only. Redo covers placements, deletions, duplications and clear-page,
and nothing else. If the felt gap is a nudged box that will not come back, redo is not the fix:
UNDO-04 is.
