---
id: "ARCH-121"
title: "Fixed sleeps in e2e specs are replaced by web-first assertions"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-121 · Fixed sleeps in e2e specs are replaced by web-first assertions

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding Q3.
Area: Tests and CI. Criterion: Test architecture. Structure only: no behaviour change.

## Why

- 43 `waitForTimeout` sites remain in e2e (66 earlier tonight), ratcheted at 44.

## Outcome

- Sleeps replaced with web-first assertions and the record lowered.

## Acceptance

- [x] The `waitForTimeout` count is lower than 43 and the record matches.

## Closed 2026-10-27

The record is 44 -> 42. Two sleeps became conditions (the hero's verb animations finishing; Sign's scroll offset at rest for 30 frames), each run 3 times on chromium. The other 41 were already marked as deliberate observation windows by ARCH-79 (negative checks, CLS sampling, gesture timing) and stay.
