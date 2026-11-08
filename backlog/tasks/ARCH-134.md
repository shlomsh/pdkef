---
id: "ARCH-134"
title: "Decide whether Merge and Scan drafts share a lifecycle core with useDraftPersistence"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
depends_on: []
needs: "A call on reopening MERGE-13's sibling-hook decision"
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
