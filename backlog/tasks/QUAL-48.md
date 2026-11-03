---
id: "QUAL-48"
title: "Every CI guard behind a CLAUDE.md invariant has a red fixture that proves it can fail"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "next"
order: 3
depends_on: []
---

# QUAL-48 · Every CI guard behind a CLAUDE.md invariant has a red fixture that proves it can fail

*Filed 2026-11-03* from the unit-test audit recorded in QUAL-45.

## Why

The guard tests that exist are good: most feed a guard's exported function both a violating and a clean input
(`check-swallowed-errors`, `check-detection-purity`, `check-untested-modules`). But the guards behind the
headline invariants have no unit test at all, so one that quietly stopped checking would stay green:

- `scripts/check-gesture-golden-rule.js` (the gesture golden rule's static enforcer): no test anywhere.
- `scripts/verify-csp.js`, `scripts/check-trailing-slash-redirects.js`, `scripts/check-page-weight.js`: named only
  as step paths in `scripts/check-push.test.mjs`, never run against a fixture.
- `scripts/generate-precache-manifest.mjs`: `sw.test.mjs` feeds the worker a hand-made manifest, so a manifest
  that drops a file the worker expects passes.
- `scripts/generate-language-acceptance.test.mjs:26-29` is titled "not stale" but only checks the doc exists and
  pins one row number; it never compares the doc with `matrixMarkdown()`.

## Outcome

- Each guard above exposes a pure function (or runs on a planted tree) and its test shows one violating input
  failing and one clean input passing.
- The language-acceptance test compares the generated matrix with the committed doc.

## Acceptance

- [ ] Each red fixture is seen failing for the reason the guard exists.
- [ ] No guard's CI behaviour changes on today's tree.
- [ ] `npm run check:fast` and `npm run check:push` pass.
