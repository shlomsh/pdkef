---
id: "QUAL-52"
title: "A Vitest worker dies with its parent, even in a loop that never yields"
status: "done"
priority: "P1"
epic: "robustness"
depends_on: []
---

# QUAL-52 · A Vitest worker dies with its parent, even in a loop that never yields

*Filed 2026-11-04.* Agents on this machine became very slow and hot. The measurement: eight orphaned Vitest workers
had been running since 00:17, about 790% CPU of 10 cores, with no Playwright running at all.

## Cause

A QUAL-50 agent planted a mutant in `useEditorFileSession.ts` (`elements: []`, a new array each render) and ran
`vitest related`. That is an endless render loop that never returns to the event loop, so neither a test timeout nor
the disconnect from a dead parent can reach the worker. The run hung, the agent killed the parent with `pkill`, and
every worker carried on for good, parented to PID 1. Removing the worktree did not stop them.

Reproduced twice: the same mutant, and a plain `while (true) {}` test. The parent is killed, the worker stays at
100% or more. A worker that is not looping exits within 3 seconds of its parent dying, so only this case leaks. It
needs no mutant: any real render loop in a test does the same, and a run nobody kills spins until someone notices.

## Outcome

- A worker exits soon after its parent dies, whatever its main thread is doing.
- A worker that never returns to the event loop is stopped after a bound, and says so, so the run ends in a failure
  that names the problem rather than hanging.
- A healthy worker and a slow one that still yields are left alone.

## Result

*Closed 2026-11-04.* `scripts/vitest-worker-watchdog.mjs` is preloaded into every worker through `execArgv` and runs on
its own thread, so a stuck main thread cannot stop it. Red first: three of its five tests failed before it existed.

| Case | Before | After |
| --- | --- | --- |
| `while (true) {}`, parent killed | worker alive at t+30 s, ppid 1 | gone by t+3 s |
| the QUAL-50 mutant, parent killed | worker alive at t+30 s, about 125% CPU | gone by t+3 s |
| loop with the parent alive | hangs for good | stopped after 5 minutes, the run fails and names the file |

Cost: `src/editor`, 120 files, 6.2 to 6.6 s without it and 6.6 to 6.9 s with it.

Playwright was not the cause. None was running when the machine was hot, `check:push` and `check:fast` run none, and the
commit gate only reads git. This session's own Playwright use was 13 one-off runs. Eight agents at once did add to
the load, since a wide `vitest related` starts a worker per core, but that ended with the agents.
