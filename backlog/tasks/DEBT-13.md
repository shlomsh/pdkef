---
id: "DEBT-13"
title: "Trim the e2e specs that re-prove what a unit test already proves under jsdom"
status: "done"
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

## Landed (2026-09-17)

Re-verified the 2026-09-14 finding against the current tree (post MEM-01..03) before touching
anything - the file had grown a fourth test since filing, and the two draft-persistence tests no
longer overlapped the ticket's own line numbers, but the substance held.

**Before:** `npx playwright test --project=chromium --project=webkit --list` → **165 tests in 43
files**. `npm test` → **2931 tests, 154 files, all passed**.

**After:** same `--list` → **162 tests in 42 files** (drop of 3 tests, 1 file). `npm test` →
**2932 tests, 154 files, all passed** (net +1: no assertion lost, one gained).

**`src/tools/merge/e2e/merge-restore.spec.js`: 4 tests → 2.**
- Kept `'a file set and a page rotation survive closing and reopening the tab'` unchanged - the one
  real `page.close()`/reopen round trip, browser-only.
- Deleted `'moving the pointer to a second file set and back leaves the first set's rotation
  untouched'`. It never closed/reopened a tab - it wrote a second entry into IndexedDB via
  `page.evaluate` and flipped a `localStorage` pointer, which is exactly what
  `setCurrentEntry`/`readCurrentEntryId` (`src/lib/drafts/draftStore.js`) plus fake-indexeddb can do
  under jsdom. Added `useMergeDraft.test.tsx`'s `'moving the pointer to a second entry and back
  leaves the first entry's plan untouched'`: two real `saveDraft('merge', ...)` calls (the second
  moves the pointer, same as opening a different file set) then `setCurrentEntry` back to the first
  entry's id, asserting `loadDraft('merge')` returns its original plan. Same claim, no browser
  needed.
- Deleted `'a renamed output name survives closing and reopening the tab'`. Everything it proved is
  already proved elsewhere: the real tab-close/reopen mechanic by test 1 above; renaming feeding into
  what gets restored by `PdfMergeTool.test.tsx`'s `'passes the edited name down for draft
  persistence, and restores it as the customised name'` (~line 976) together with
  `useMergeDraft.test.tsx`'s `'autosaves the renamed output name once one is set, and it comes back
  on restore'`; and the renamed `download` attribute by `PdfMergeTool.test.tsx`'s own
  `download`-attribute assertion at line 892 (`'March invoices.pdf'`, the same string this e2e test
  used).
- Left `'a long output name wraps at 375px instead of truncating'` completely untouched - a real
  layout/line-wrap fact, outside this ticket's scope.

**`src/tools/security/e2e/unlock-reset-confirmation.spec.js`: deleted outright.** Re-verified its one
test assertion for assertion against `PdfSecurityTool.test.tsx`'s `'confirms before a replacement
closes the file with a password typed'` (~line 78): dialog visible with both filenames, Cancel keeps
the old file, choosing Replace swaps to the new file. Two assertions the unit test did not yet make
were added to it rather than left for the e2e file to carry alone: the password stays typed after
Cancel, and clears once Replace is confirmed (both provable under jsdom - `handleFilesAdded` in
`PdfSecurityTool.tsx` resets `password` unconditionally on every accepted file, the same code path a
first load takes). Re-verified the suggested rescue too: `grep -rn requestFullscreen src/tools/`
shows only `PdfRedactTool.tsx` and `PdfSignTool.tsx` ever call it; `ConfirmDialog` is used generically
by `BasePdfTool.tsx` for every tool's replace/clear confirmation *and* directly by Sign and Redact,
but Unlock/Security's workspace never enters the real Fullscreen API, so there is no fullscreen
scenario on this page to rescue the spec with. Deleted.

**Finding, not fixed (out of this ticket's scope - trimming, not adding):** no e2e spec anywhere
proves `ConfirmDialog` (`src/shell/ConfirmDialog.tsx`) is actually visible while its tool is in real
fullscreen. `src/tools/redact/e2e/redact-editor.spec.js` is the only spec with a real-fullscreen
case, and its own fullscreen test asserts `aria-busy` on the fullscreen element, not confirm-dialog
visibility. `ConfirmDialog`'s header comment says `showModal()`'s entire reason for existing over
`<dialog open>` is to keep the dialog visible over a real Fullscreen API element - that exact
invariant currently has no guard. Sign and Redact are the only two tools where this can ever come up
(the only two that call `requestFullscreen`). Flagging as a candidate follow-up ticket, not filing
one.

**`.claude/rules/tests.md`:** added one guideline sentence to the existing "Playwright is for what
jsdom cannot prove" paragraph, naming the concrete list (tab close/reopen via real storage, real
layout/wrapping, a real Fullscreen element, drag-time pointer behaviour, hydration/CSP flows) and
restating the 1:10 figure as a smell to notice, not a target to hit.

**Verification, all green:** `npm test` (2932/2932), `npx playwright test --project=chromium
src/tools/merge/e2e/merge-restore.spec.js` against a fresh `npm run build` (2/2), `npm run
check:fast`, `npm run typecheck` (0 errors), `npm run check:guidance`, `npm run
test:module-boundaries` (0 violations), `npm run test:editor-dependency-directions`.
