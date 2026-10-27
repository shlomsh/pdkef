---
id: "DEBT-65"
title: "Two layout-shift specs failed once each in the 2026-10-27 nightly"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "now"
order: 10
depends_on: []
---

# DEBT-65 · Two layout-shift specs failed once each in the 2026-10-27 nightly

*Filed 2026-10-27* from the scheduled CI run 40477105436 on e4441808 (`--repeat-each=2`).

## Why

Each spec failed one of its two copies and passed the other, on a different shard:

- `e2e/home/launcher-picker-pinned.spec.js:260` ("picker box is unchanged from first frame to
  settled layout at 390x844"), shard e2e (3): the picker moved 110.97px, bound 0.5px. Its other
  copy passed on e2e (1).
- `e2e/tool-hero-first-screen.spec.js:300` ("Merge restore keeps the hero the same height from
  first paint to the restored workspace"), shard e2e (1): layout shift 0.01206, bound 0.01. Its
  other copy passed on e2e (3).

The last green nightly was defc0e7f (2026-10-26 08:51); 199 commits landed in between (the
unify-and-narrow refactor, the Merge rebuild, SITE-44, SCAN-02). The 10-26 nightly failed only on
"Scan locked dependency graph", not on these. Neither spec showed a failure or retry in the six push
runs checked (40472200000, 40471776015, 40470656888, 40470287093, 40405613892, 40295206414).

Local, on a production build of e4441808: both tests `--repeat-each=10 --workers=4` passed 20 of 20;
both whole spec files `--repeat-each=6 --workers=10` passed 744 of 744. So far it reproduces only on
CI runners. A 111px jump is not timing noise in a measurement: something (recents, the launcher
grid, a font) lands after the first frame on that run.

## Outcome

- Name what moves the picker and what shifts Merge's restore on a slow runner, with evidence (a
  trace or the shift sources from CI), then fix the product or the test's wait.
- Both specs stay green across the next nightlies.

## Acceptance

- [ ] The cause of each failure is named in this ticket with the evidence.
- [ ] Throttled local runs (CPU 4x) of both files with `--repeat-each=10` are green.
- [ ] Three consecutive nightlies with no failure of either spec.
