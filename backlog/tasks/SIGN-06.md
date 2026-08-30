---
id: "SIGN-06"
title: "Report actual draft-save state"
status: "done"
priority: "P1"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
legacy_state: "Done 2026-08-29"
---

# SIGN-06 · Report actual draft-save state

## Scope and acceptance

**Report actual draft-save state.** `useDraftPersistence.js` replaced a naive `draftSaved={status === 'editing'}` with a revision-tracked `idle/pending/saved/error` state (`draftSaveState`, tied to `draftSaveRevision` so a stale write cannot paint a newer edit as saved); `persist()` reads `saveDraft`'s boolean result and reports `error` on both a `false` return and a rejection, and the visibility/pagehide flush uses the same path. `ToolShell.tsx` renders `error` as "Draft not saved" with `role="alert"`. Regressions prove false/rejected writes report error, saving stays off outside editing, and an older successful write cannot replace the error state of a newer failed revision.
