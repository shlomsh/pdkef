---
id: "ARCH-132"
title: "Every handler that awaits and then writes state goes through useLatestRun"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: ["DRIVE-08", "DRIVE-09"]
---

# ARCH-132 · Every handler that awaits and then writes state goes through useLatestRun

*Filed 2026-11-08, from the implicit state machine inventory.* DEBT-18 made
`src/lib/hooks/useLatestRun.ts` the one answer to "is this async result still wanted?", and Sign,
Redact, Compress and Security use it. Handlers written since then hand-roll the same guard in their
own shape, and the two places that skipped it are bugs (DRIVE-08, DRIVE-09):

- `src/shell/pageWorkspace/useOpenPageDocument.ts`: `pickedRef` identity (`:95`), checked at `:120`,
  `:130`, `:139`.
- `src/shell/pageWorkspace/useSaveToDrive.ts`: no guard (DRIVE-08 fixes it, through `useLatestRun`).
- `src/site-lib/DriveOpen.tsx`: no guard. DRIVE-09 fixes it with an in-flight flag instead, because a
  second tap there must be ignored, not supersede the first (`useLatestRun.begin()` supersedes).
- `src/shell/pageWorkspace/useDownloadFlow.ts`: `handoffRunRef` epoch (`:93`, `:154`). Left to ARCH-133,
  which replaces that hook's state.

An effect's own `let cancelled = true` cleanup is the right tool inside an effect and stays (about 30
sites); this ticket is about handlers, which have no cleanup to hang a flag on.

## Acceptance

- `useOpenPageDocument` uses `useLatestRun`, with its existing tests green.
- `tools-and-shell.md` gains one line under "Catching errors" or beside it: a handler that awaits and
  then writes state captures a `useLatestRun` ticket before its first `await`; an effect uses its own
  cleanup flag.
- No new hand-rolled `Ref.current++` run counters in `src/shell/` or `src/lib/` (grep in the PR).

## Outcome

Done 2026-11-08. `useOpenPageDocument` takes a `useLatestRun` ticket in `open()` and settles it on its three final paths; `pickedBefore` keeps the replace_file / add_files trail. Its existing stale-pick and stale-probe tests pass unchanged (a refactor, so no red step). DRIVE-08 moved `useSaveToDrive` onto `useLatestRun`, DRIVE-09 took an in-flight flag, ARCH-133 kept `handoffRunRef`. The rule is the new "Async results that went stale" section of `tools-and-shell.md`. A grep finds no hand-rolled `Ref.current++` run counter left in `src/shell/` or `src/lib/` other than `handoffRunRef`; `useDraftPersistence.js`'s `revisionRef` counts document revisions, not runs.
