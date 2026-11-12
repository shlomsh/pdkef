---
id: "MEM-49"
title: "A hand-off outlives its read: the file reaches recents before the record is deleted"
status: "in_progress"
priority: "P1"
epic: "robustness"
horizon: "now"
depends_on: []
---

# MEM-49 · A hand-off outlives its read

*Filed 2026-11-12.*

## Why

Home practice form -> `/sign/` landed on an empty Sign page in a fresh browser (reported 2026-11-12). The hand-off
record was deleted from IndexedDB (`takeHandoff`) and its sessionStorage marker cleared before the PDF was written
anywhere durable; the first durable write (`cacheRecentFile`) waited for the thumbnail render. Any reload in that
window (service-worker update, refresh, iOS discarding the tab, a dev-server reload) lost the file with no error.
Measured on a production build: a reload 150-300 ms after arriving ended empty; on a cold `astro dev` the window is
seconds wide. Same shape in `useHandoffIntake` for the non-editor tools.

## What

`peekHandoff` reads without deleting, `commitHandoff` deletes, `takeHandoff` stays as peek + commit for callers
that already hold the file (Drive). `settleHandoff` (`src/lib/handoff/settleHandoff.ts`) writes the PDF of a single-file record
to recents with `cacheRecentFile` (a single-file record only: a multi-file set for Merge / Image to PDF is held by that tool's own draft, and its members must not take recents slots, so it commits as soon as it is read; no preview; the preview upgrades the entry by content hash later), and only then
commits the record and clears the pending marker. Both the editor path (`useEditorDraftPersistence`) and
`useHandoffFilesIntake` use it, so a reload re-opens the same record. A failed cache write still commits (nothing
durable is possible; a stale record is bounded by `HANDOFF_MAX_AGE_MS` anyway).

Side effect checked: the editor hand-off passes `restored=true`, so a failed or slow load runs `clearDraft`, which
clears only this tool's work on the entry the pointer names. Because `settleHandoff` finishes before `loadPdf`, the
pointer already names the handed-over file, not the previous one.

## Done when

- Unit guards: `useHandoffIntake.test.tsx` and `useEditorDraftPersistence.test.tsx` fail if the record is deleted
  before the recents write resolves; `draftStore.test.js` covers peek/commit.
- `e2e/handoff/reload-mid-arrival.spec.js`: a real reload 0-500 ms after `/sign/` commits still shows the document
  (red at 120-300 ms with the old order, green with the fix).
