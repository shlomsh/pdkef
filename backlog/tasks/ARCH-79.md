---
id: "ARCH-79"
title: "E2e specs wait on conditions, and fixed sleeps are a shrinking ratchet"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
order: 16
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

- [ ] `waitForTimeout` count below 20 and recorded; affected projects green.
