---
id: "ARCH-133"
title: "The page tools' download flow is one state value, not eight"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-133 · The page tools' download flow is one state value, not eight

*Filed 2026-11-08, from the implicit state machine inventory.* `src/shell/pageWorkspace/useDownloadFlow.ts`
drives Download, the finish strip and the next-tool hand-offs for Merge, Split, Edit Pages, To Image,
Image to PDF, Scan, Compress and Security. Its one flow lives in `tap`, `pendingDownload`,
`stripOpen`, `downloadedOnce`, `handoffBusy`, `handoffFailed`, `quietPendingRef` and `handoffRunRef`:

- `tap` is set in 7 places; `reset()` (`:250-260`) is a hand-kept list of nine assignments that has
  to grow with every new field.
- A no-deps effect (`:136-138`) calls `prepared.prepareNow()` on every render while a tap waits on a
  `pending` output, to recover a tap that went stale when the plan changed mid-build.
- `usePreparedOutput` (`src/lib/output/usePreparedOutput.ts`) keeps the build phase a second time
  beside `quietPrepare.ts`'s `latest/timer/controller`, and `rearmedKeyRef` (`:78`, `:113-120`)
  patches a key left pending for good.

## Shape

One discriminated union for the person's side of the flow (`idle`, `waiting` for a build, `delivered`,
`handing-off`, `handoff-failed`), held in one reducer with `downloadedOnce` and the strip as fields of
the states that have them, so `reset()` is one dispatch. `handoffBusy` stays on `useNavigatingAway()`
(the bfcache rule in `tools-and-shell.md`). The stale-tap recovery becomes a transition on
`prepared.generation`, not a per-render effect. `usePreparedOutput`'s internals are out of scope here;
open a follow-up if the reducer makes its double bookkeeping obvious.

## Acceptance

- The hook's public return value is unchanged, so no caller changes.
- Its existing unit tests pass unchanged, plus one test per transition, including a plan change while a
  tap waits.
- `e2e/handoff/merge-handoff.spec.js` and `e2e/home/back-navigation.spec.js` stay green.

## Outcome

Done 2026-11-08. `downloadFlowState.ts` holds `downloadFlowReducer` and its transition table: `tap` is `idle`, `processing` with an optional `waiting { openStrip }` (what `pendingDownload` and `quietPendingRef` were), or `done`, beside `stripOpen`, `downloadedOnce` and `handoffFailed`. `reset()` is one `RESET` dispatch; `handoffBusy` stays on `useNavigatingAway()` and `handoffRunRef` stays a ref (the UI never reads it). The no-deps `prepareNow` effect stays: an existing test remounts a pending output with the same generation, which a dependency list would miss. The returned object is unchanged and no caller moved. 12 reducer tests; the hook's existing tests pass unchanged; `useDownloadFlow` shrank from 209 to 186 lines. Playwright, chromium project, run locally against the container's Chromium 1243 (the pinned 1.64.1 wants 1248): 636 passed; of 14 failures, 10 were specs that launch their own browser build (back-navigation, camera), `mark-outline` fails at aeb5d43 too, and the other three passed on rerun.
