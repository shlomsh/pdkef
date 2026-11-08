---
id: "RED-72"
title: "A new file in Redact starts with a clean finish state"
status: "in_progress"
priority: "P2"
epic: "redact"
horizon: "next"
depends_on: []
---

# RED-72 · A new file in Redact starts with a clean finish state

*Filed 2026-11-08, from the implicit state machine inventory.* `FILE_INITIALIZED` in
`src/tools/redact/state/redactState.ts` says "a new file starts clean" (`:359`) but copies the last
file's finish slice: `finish: afterTool.finish` (`:394`). `disarmed()` touches only the tool slice.
The comment covers `exportedForHandoff`, which the island's invalidation effect clears. Nothing on a
file change clears the other three fields:

- `handoffFailed` stays `true` until the next `HANDOFF_STARTED` (`:572`), so after a failed
  "Compress" hand-off on file A, file B's done strip opens already saying the hand-off failed
  (`RedactDoneStrip`, `RedactFinish`).
- `removedNote` stays until the next `EXPORT_STARTED` or `REMOVE_FAILED`, so A's "removed" note can
  show in B's saved-file check.
- `removing` stays `true` if the file changes while a removal is running, which disables B's
  saved-file check Remove buttons (`SavedFileCheck.tsx:146`) until a `REMOVE_SETTLED` that may
  belong to A.

## Acceptance

- `FILE_INITIALIZED` resets `handoffFailed`, `removing` and `removedNote` to their initial values
  (`:164`), and the comment says which field the invalidation effect owns.
- A late `REMOVE_SETTLED` or `REMOVAL_NOTED` from the previous file's removal cannot change the new
  file's finish state.
- A reducer unit test sets all three, dispatches `FILE_INITIALIZED`, and asserts the clean slice.

## Outcome
