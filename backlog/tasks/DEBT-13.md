---
id: "DEBT-13"
title: "Trim the e2e specs that re-prove what a unit test already proves under jsdom"
status: "open"
priority: "P3"
epic: "architecture-debt"
phase: "later"
depends_on: []
---

# DEBT-13 · A spec asserts something jsdom cannot

*Filed 2026-09-14*, finding 12 of
[docs/architecture-debt-review-2026-09-14.md](../../docs/architecture-debt-review-2026-09-14.md).

## Problem

`src/tools/merge/e2e/merge-restore.spec.js` (three tests) overlaps `useMergeDraft.test.tsx:119,155,223`
and `PdfMergeTool.test.tsx:691`, with `fake-indexeddb` already a devDependency; only "close and reopen
the tab" is browser-only. `src/tools/security/e2e/unlock-reset-confirmation.spec.js` duplicates
`PdfSecurityTool.test.tsx:78` and does not assert the one thing jsdom lacks (`showModal()` in real
fullscreen). Merge is 28 of the 58 tool e2e tests and where the shard time goes.

## Scope

- `merge-restore.spec.js`: keep one test (rotation and renamed name survive a real tab close and
  reopen); move the rest of its assertions into `useMergeDraft.test.tsx` where they are not already there.
- `unlock-reset-confirmation.spec.js`: either assert the dialog is visible with the tool in fullscreen
  (the invariant `src/shell/ConfirmDialog.tsx` exists for) or delete it in favour of the unit test.
- Restate the guideline in `.claude/rules/editor.md` (or `tests.md` after DEBT-11) as "a spec must
  assert something jsdom cannot"; keep the 1:10 figure as a smell, not a target.

## Acceptance

- Product e2e count drops by at least three with no unit assertion lost (`npm test` count unchanged
  or higher); `e2e (1)` shard step time drops on the next `everything` run (`gh run view --json jobs`).
