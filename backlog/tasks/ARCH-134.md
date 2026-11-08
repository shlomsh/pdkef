---
id: "ARCH-134"
title: "Decide whether Merge and Scan drafts share a lifecycle core with useDraftPersistence"
status: "done"
priority: "P3"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-134 · Decide whether Merge and Scan drafts share a lifecycle core with useDraftPersistence

*Filed 2026-11-08, from the implicit state machine inventory.* Three hooks run the same draft
lifecycle (restore with a timeout, debounce-save, revision-guarded write, `pagehide` /
`visibilitychange` flush, conflict):

- `src/lib/drafts/useDraftPersistence.js` (Sign and Redact, through `useEditorDraftPersistence.ts`)
- `src/tools/merge/hooks/useMergeDraft.ts` (455 lines)
- `src/tools/scan/hooks/useScanDraft.ts`

MERGE-13 chose a sibling hook on purpose (`useMergeDraft.ts:13-25`): the record shapes and what counts
as "the same snapshot" differ, and one parameterised hook "would read worse than the duplication". The
inventory found the cost of that choice:

- `useMergeDraft`'s public phase is rebuilt every render by a four-level ternary (`:440-446`), with
  `'conflict'` sticky ahead of the revision check.
- `useDraftPersistence` sets `saveState` from five sites and bumps `revisionRef` during render.
- `handedOffRef` (`useMergeLifecycle.ts:22`, set at `:70`) is a latch that is never reset.

The option that keeps MERGE-13's point is a shared lifecycle core (the save state machine, the
revision guard and the flush) with each tool keeping its own record shape and snapshot key.

## Acceptance

- A written decision here: keep the siblings, or extract the core. If extract, a follow-up ticket with
  the core's interface.

## Outcome

Done 2026-11-08. Decision (Shlomi, 2026-11-08): extract the core; MERGE-13's sibling hook is retired.

- `src/lib/drafts/useDraftLifecycle.ts` holds it. `useDraftRestore` runs the check once per mount, shows
  `checking` only on a hinted mount, reports `settled` for gating saves on any mount, releases the caller
  after `RESTORE_TIMEOUT_MS` without cancelling, and now reports a check that throws. `useDraftSave` owns
  snapshot revisions (the one place a revision is bumped in render), the 700ms debounce, the stale-completion
  guard (`write` gets an `isCurrent()`), in-flight writes, the flush on hide and pagehide, the update-reload
  flush with an optional `drain()`, the cross-tab conflict (on `hasWork`), the update hold on 'error', the
  derived public state, and `markSaved()` for a clean restore. 22 unit tests.
- Ports, each keeping its public return value and every existing assertion: `useDraftPersistence.js`
  326 to 178 lines (record, page-1 preview, storage-persisted note, clearDraft); `useMergeDraft.ts` (record
  shape, snapshot key, clean-restore rule; the four-level ternary is gone); `useScanDraft.ts`, which gained
  its first 9 tests, written against the old code and passing unchanged after.
- Intended behaviour changes: a throwing restore is reported and settles at once (it used to wait 4s); the
  record is built when the write starts; a Merge record that fails to build reads "Not saved" and holds
  updates instead of "Saving" forever; Merge reports one step, `autosave_merge_draft`; a hand-off now spends
  Scan's recent-open note, as it already did in Sign and Redact.
- A cold review found four regressions in the first ports, all fixed before landing: Scan's update-reload
  flush lost its wait on a queued forget (now `drain`), `markSaved` could wipe a conflict, a conflict during a
  Merge restore's hydration was dropped (now `hasWork`), and a restored scan flashed "Saving" for a render.
- Checks: `check:fast` passes; the draft unit sweep is 1286/1286; Playwright on the container's Chromium 1243:
  every draft, restore, Recents and hand-off spec passes (271, then 45 on the fixed build), apart from the two
  `back-navigation` specs that need a browser build this container lacks. One Merge unit test failed once
  while Playwright ran beside it and passed 5/5 alone and in the full sweep: timing under load, noted here.
