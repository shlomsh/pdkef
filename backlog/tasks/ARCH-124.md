---
id: "ARCH-124"
title: "check-ratchet-raises is tested for a direct push to main"
status: "done"
priority: "P3"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-124 · check-ratchet-raises is tested for a direct push to main

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding G5.
Area: Tests and CI. Criterion: Guardrails and CI health. Structure only: no behaviour change.

## Why

- `scripts/check-ratchet-raises.mjs:12` falls back to the merge base with `origin/main`, which on a direct push to main may compare HEAD with itself (inferred, not run).

## Outcome

- A test of the push-to-main case with the previous tip as base.

## Acceptance

- [x] A planted raised limit on a direct push to main fails the check.

## Done (2026-10-28)

- On a push to main, CI passes `github.event.before` (the previous tip) as `--base`; the 2026-10-28 run compared
  against f2b4054, the tip before it. So the case worked, and was untested.
- `scripts/check-ratchet-raises.mjs` exports `raisesSince(base, { cwd })`; its test builds throwaway git repos: a
  raised limit on a direct push to main fails (the real CLI exits 1 naming the path), a lowered one passes, and a
  base without the limits file passes.
