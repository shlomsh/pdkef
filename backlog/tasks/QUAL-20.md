---
id: "QUAL-20"
title: "The home demo's scroll-progress e2e fails under a full 4-worker run"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "next"
depends_on: []
---

# QUAL-20 · The home demo's scroll-progress e2e fails under a full 4-worker run

*Found 2026-10-01* in ARCH-32's `check:push` (full suite, 4 workers, port 4391), on a branch whose
product code is identical to `origin/main` (`5fab1a06`): only `scripts/` and a rule file differed.

`e2e/demo/workspace-flow.spec.js:232` "desktop keeps one compact launcher and live demo after
completion" failed in `expectProgress` (`e2e/demo/heroDemoHelpers.js:94`): it polls a stage's
`--p-track` for 10s, expecting 0.81, and saw 1 the whole time. The spec then passed 5/5 on three runs
in a row on its own against the same build.

`--p-track` comes from scroll-driven animation (`animation-timeline: view()`), so the value depends on
the scroll position the helper set and on the compositor keeping up. Under load the helper's scroll
apparently lands past the stage, or a later scroll is not yet applied when the poll starts.

## Scope

Reproduce it under load (the full product run, or the spec with `--repeat-each` beside another suite),
then make `scrollStory` / `expectProgress` wait for the scroll the test asked for (the scroll position
itself, then the property) instead of polling only the property. No retries and no wider tolerance.

## Acceptance

- Three consecutive full `npm run test:e2e:product` runs pass with this spec included.
