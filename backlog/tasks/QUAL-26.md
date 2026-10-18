---
id: "QUAL-26"
title: "A newer push to the same pull request cancels its older CI run"
status: "open"
priority: "P3"
epic: "robustness"
horizon: "later"
---

# QUAL-26 · Cancel superseded PR runs

*Filed 2026-10-18* from the CI review behind QUAL-23/24.

## Why

`ci.yml` has no `concurrency` group, so every push to a pull request runs the whole matrix to the end
even after a newer push makes it moot. Pushes to `main` must keep running to completion (each commit
there is vetted on its own), and the nightly and manual dispatch must never be cancelled.

## Scope

- A workflow-level `concurrency` group keyed on the PR (`ci-${{ github.event.pull_request.number ||
  github.run_id }}`) with `cancel-in-progress` true only for `pull_request` events, so `push`,
  `schedule` and `workflow_dispatch` runs each get a unique group and are never cancelled.

## Done when

- Two quick pushes to a test PR show the first run cancelled and the second green, and a push to
  `main` during a running `main` run leaves both to finish.
