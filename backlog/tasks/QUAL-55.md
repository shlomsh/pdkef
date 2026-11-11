---
id: "QUAL-55"
title: "The update tests' setup stops timing out waiting for a worker to take a tab"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
depends_on: []
---

# QUAL-55 · The update tests' setup stops timing out waiting for a worker to take a tab

*Filed 2026-11-11*, found while landing MEM-37, MEM-39 and MEM-40.

## Why

`e2e/offline/app-update.spec.js` now and then fails in setup, not in an assertion: `waitForController` waits
20 s for `navigator.serviceWorker.controller` and one tab never gets one. Seen on 2026-11-11 about once in
sixty whole-file runs, on three branches (a main-based one included), most often in "a critical build
reaches two tabs with no navigation, even past a file open in Compress", once in "offline, a critical build
does nothing and shows nothing until back online". Alone, the tests pass.

It was not reproduced on demand: on main at 0b9c2c46, 0 failures in 140 whole-file test runs and in 80
instrumented runs of the two critical-build tests under CPU load, and two scripted sweeps that opened the
second tab around the worker's activation never left it uncontrolled. Logs and scripts:
the 2026-11-11 session's `scratchpad/critical-flake/` (not kept in the repo).

What the code says about a failing run: `waitControlled` awaits `navigator.serviceWorker.ready` before
`waitForController`, so a registration with an active worker exists and this one document is not its client.
The unproven candidate: the second tab's navigation starts before the worker activates and commits after
`clients.claim()` ran, so it was not a client when the claim happened and no `controllerchange` ever fires
for it. `twoTabsOneHoldingCompress` opens the second tab while the first tab's worker is still installing.
If that is the cause, a person who opens a second tab in that same moment of a first install has a tab the
worker does not control until its next navigation; whether a real browser session can land there is not
shown.

## What

1. Read the next failure. Since 2026-11-11 the timeout carries the tab's URL, its controller, the
   `pdkef:file-opened` key and every registration's worker states, so a single occurrence says whether it is
   "active worker, tab never claimed" or something else. CI's flake report is where it will show first.
2. If it is the unclaimed tab: decide between the test (the second tab opens after the first is controlled;
   the test is about a critical build, not about two tabs racing a first install) and the product (a page
   that finds an active registration and no controller after load asks to be claimed, or reloads once).
   Prove the product case exists before changing `appUpdate.ts` or `sw.js`.
3. If it is something else, record it here and re-plan.

Not the fix: a longer timeout, a retry, or a guess.

## Done when

- A failing instance has been read and its cause is written here.
- The setup no longer times out across 300 whole-file runs, or the remaining cause is a recorded browser
  behaviour with its own ticket.
