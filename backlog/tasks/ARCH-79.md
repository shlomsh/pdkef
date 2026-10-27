---
id: "ARCH-79"
title: "E2e specs wait on conditions, and fixed sleeps are a shrinking ratchet"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: ["ARCH-76"]
---

# ARCH-79 · E2e specs wait on conditions, and fixed sleeps are a shrinking ratchet

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Tests and CI. Criterion: Test architecture. Structure only: no behaviour change.

## Why

- 66 `waitForTimeout` calls (18 at 300 ms, 6 at 1,500 ms), 12 of them in `e2e/tool-hero-first-screen.spec.js` and `e2e/home/launcher-picker-pinned.spec.js:140,180,216`. Fixed sleeps are the usual source of the load-sensitive failures seen in CI (see DEBT-64).

## Outcome

- Sleeps that stand in for a condition become web-first assertions or `expect.poll`; the remaining count is a ratchet.

## Acceptance

- [x] `waitForTimeout` count below 20 and recorded; affected projects green.

## Progress (2026-10-27)

Fixed sleeps that stood in for a condition became web-first assertions, expect.poll or frame waits; scripts/check-e2e-sleeps.mjs (planted extra sleep failed first) counts waitForTimeout and setTimeout-promise sleeps and runs in CI and check:push. The count is 44, recorded: 66 at filing, measured more narrowly. Every remaining sleep carries a "Time on purpose" comment: layout-shift observation windows, negative "nothing moves" windows, timing under test and debounce waits. A reviewer showed that replacing those weakened the tests, so they were restored. Open: below 20 is not reachable without weakening these checks; the owner decides whether 44 stands as the record or the CLS windows move into a counted helper.

## Done (2026-10-27)

Decision (2026-10-27, lead with the owner's go-ahead): 44 is the record. The remaining sleeps are deliberate time windows, each commented; converting them weakened the tests, as the round 1 review showed. The check counts setTimeout-promise sleeps too, so the number can only fall.
