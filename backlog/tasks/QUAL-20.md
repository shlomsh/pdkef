---
id: "QUAL-20"
title: "The home demo's scroll-progress e2e fails under a full 4-worker run"
status: "done"
priority: "P2"
epic: "robustness"
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

- [x] Three consecutive full `npm run test:e2e:product` runs pass with this spec included.

## Done (2026-10-02)

**Root cause (test timing only, product code unchanged).** `ScrollDriver.tsx` ties `--p-track` to the
scroll position only for `SCRUB_HOLD_MS` (1.8s) after a scroll event; after that autoplay walks the value
away (sign at 0.81 reads 1 about five seconds later and stays there). The old `expectProgress` sampled
from the test process, so a worker stalled for roughly five seconds between `scrollTo` and its first
sample saw autoplay's value, 1, for the whole 10s. Reproduced deterministically with a 6s stall injected
before the first poll (old helper failed 3/3). A second way to miss: a `scrollTo` to the spot the page
already sits at (scroll restoration after a reload) fires no scroll event, so the driver never scrubs
(4 of 10 reloads under CPU throttling).

**Fix.** `scrollStory` (`e2e/demo/heroDemoHelpers.js`) scrolls and observes inside one `page.evaluate`: it
scrolls, waits two animation frames (the driver's handler runs in a rAF), checks `scrollY` against the
target and `--p-track` against the fraction (the same 0.005 tolerance), and steps one pixel off and back
to give the driver a scroll event when it did not follow, recomputing the target each pass, up to 8s. No
retries, no wider tolerance, no longer timeout.

**Verified.** The original failure never recurred organically under load, so the proof is the mechanism
plus the acceptance: the 6s-stall repro passes; the spec passes 40/40 with `--repeat-each=40 --workers=4`
beside CPU burners; three consecutive full `npm run test:e2e:product` runs pass (302 chromium and webkit
tests, 5 perf, each run). One earlier attempt at the three runs failed in eight unrelated specs that
each hung 15 minutes or more while the machine's load average was above 20; the demo spec passed in that
run too, and the three consecutive runs were repeated on a quiet machine.
