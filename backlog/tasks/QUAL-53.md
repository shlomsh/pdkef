---
id: "QUAL-53"
title: "The nightly flake report counts the nightly"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "now"
depends_on: []
---

# QUAL-53 · The flake report leaves out its own run

*Opened 2026-11-06.* The nightly of 2026-11-06 went red on a camera spec its own flake report did not list.

## Outcome

- The report reads the run it is part of, as well as the completed main runs before it, and still covers `RUNS` runs.
- It starts only once both jobs that upload a JSON report have finished.

## What happened

ARCH-85's job listed runs with `--status completed`, and its own run is still in progress at that point. So the one
run that repeats every spec reached the report a night late, and `e2e-webkit`'s report could be missing for the same reason.

## What changed

`flake-report` reads `$GITHUB_RUN_ID` first, then the last `RUNS - 1` completed main runs, and needs `e2e-webkit` too.
The ticket closes once a nightly's report shows that night's own attempts: `gh run download` on a run still in progress
has not been seen working yet.
