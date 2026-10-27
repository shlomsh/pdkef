---
id: "QUAL-32"
title: "CI skips Playwright when a push reaches no e2e"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "now"
depends_on: []
---

# QUAL-32 · CI skips Playwright when a push reaches no e2e

*Filed 2026-10-28* from the CI and build-structure assessment of 2026-10-27: a replay of the scope verdict on 58 consecutive pushes to main, job timings from 24 CI runs (2026-10-26/27), and `check:fast`/`check:push` timed on typical diffs. Lane: [ARCH-123](ARCH-123.md).

## Why

- In `.github/workflows/ci.yml` the chromium, webkit and perf e2e jobs are gated on `docs_only` only,
  and each runs `npx playwright test ... $E2E_PATHS`. The comment above "Resolve affected scope" says an
  empty `e2e_paths` means "either everything=true (run the full suite) or nothing e2e-relevant is
  affected", but an empty filter runs every spec in both cases; `--pass-with-no-tests` does not help.
- Locally `runE2eProduct` (`scripts/affected-scope.mjs:597`) already returns early when
  `!scope.everything && !scope.e2e_paths`. CI has no such guard.
- Measured: run 40396079267 (a scripts-only diff, verdict "nothing") ran a 209 s chromium shard, 89 s
  of webkit and 34 s of perf.

## Outcome

- `printOutputs` emits whether product e2e should run at all (for example `run_product`), and the
  three e2e steps run only when it is true. A full run and a narrowed run are unchanged.

## Acceptance

- [ ] A unit test in `scripts/affected-scope.test.mjs` for the new output on the everything, narrowed
      and nothing verdicts.
- [ ] A scripts-only push shows the e2e steps skipped in its CI run, and a full-run push still runs all
      four shards.

## Progress

*2026-10-28.* `runsProductE2e(scope)` in `scripts/affected-scope.mjs` is the one rule for whether product
e2e runs at all (everything, or any e2e path); `runE2eProduct` and `runE2ePerf` use it for their early
return, and `printOutputs` emits `product_e2e`. In `.github/workflows/ci.yml` the Build step and the
chromium, webkit and perf Playwright steps of the `e2e` and `e2e-webkit` jobs run only when
`product_e2e != 'false'` (fail-open, as the font guards gate on `fonts`). The CI summary says when product
e2e is skipped. Unit tests cover the rule, the printed output and the five gates in ci.yml. A dry run on
084d5cbb (a scripts-only commit) prints `product_e2e=false`.

A fresh review found that the gate exposed a gap the old accidental full run had covered: a diff
touching only a build-pipeline script (`tooling`, which no e2e project depends on) narrowed to no e2e;
replaying faffe930 (MEM-22's manifest generator) gave `product_e2e=false`. `buildPipelineFiles` now
derives, from package.json's `build` script, every step that shapes dist/ (not `--check` steps) and
everything it imports, and a change to any of them is wide with the reason `build pipeline: <file>`.
faffe930 now replays as everything; 084d5cbb (a check script only) still skips product e2e.

Closes when a scripts-only push to main shows the e2e steps skipped and a full-run push still runs all
four shards.
