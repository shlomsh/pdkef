---
id: "ARCH-100"
title: "Island tests wait for what they assert, not for a fixed sleep"
status: "in_progress"
priority: "P1"
epic: "unify-and-narrow"
horizon: "now"
order: 1
depends_on: []
---

# ARCH-100 · Island tests wait for what they assert, not for a fixed sleep

*Filed 2026-10-27* after CI runs 40530978756 and 40537583054 on main went red on island unit tests.

## Why

- ARCH-78 made the island tests run real IndexedDB, pdf-lib and lazy chunks. About 84 fixed sleeps (`flush(10)`, `setTimeout(resolve, 20)`) then assert on that work, and on a loaded CI runner the work takes longer: Merge's prepare and restore hand-off tests failed on main, Security and Redact tests failed under local parallel runs.

## Outcome

- Every assertion that something happened after real work waits for it through `src/test/harness/waitUntil.ts`, which never moves a fake clock. Fixed windows stay only where a test proves something does not happen, or inside fake-timer blocks.

## Acceptance

- [ ] With every remaining fixed sleep planted at 0 ms, the seven tools' island tests all pass.
- [ ] Each converted file passes 3 runs and 4 parallel copies; CI on main is green on the unit job.
