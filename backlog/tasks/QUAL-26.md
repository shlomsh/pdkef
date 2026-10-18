---
id: "QUAL-26"
title: "A newer push to the same pull request cancels its older CI run"
status: "done"
priority: "P3"
epic: "robustness"
---

# QUAL-26 · Cancel superseded PR runs

*Filed 2026-10-18* from the CI review behind QUAL-23/24.

## Why

`ci.yml` has no `concurrency` group, so every push to a pull request runs the whole matrix to the end
even after a newer push makes it moot. Pushes to `main` must keep running to completion (each commit
there is vetted on its own), and the nightly and manual dispatch must never be cancelled.

## Scope

- A workflow-level `concurrency` group keyed on the PR (`ci-${{ github.event.pull_request.number ||
  github.run_id }}`) with `cancel-in-progress: true`; `push`, `schedule` and `workflow_dispatch` runs each get a unique
  group (their run id) that nothing else joins, so they are never cancelled.

## Done when

- Two quick pushes to a test PR show the first run cancelled and the second green, and a push to
  `main` during a running `main` run leaves both to finish.

## Result

Proved on throwaway draft PR #41 (closed, 2026-10-18). With `cancel-in-progress:
${{ github.event_name == 'pull_request' }}` the newer push only queued: run 39149174024 waited behind
the running 39149143468 and was then replaced by the next push, while the running one carried on.
With a literal `true`, the next push (run 39149307133) cancelled the running 39149143468 and the queued
39149207999. Push, nightly and dispatch runs stay apart because their group is their own run id.
