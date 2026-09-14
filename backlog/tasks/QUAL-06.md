---
id: "QUAL-06"
title: "Shard the font guards: the font-guards job is the long pole on every run where it runs"
status: "open"
priority: "P2"
epic: "module-boundaries"
phase: "quick-win"
depends_on: []
---

# QUAL-06 · Two shards for the font guards

*Filed 2026-09-14* at the close of the module-boundaries epic.

## Problem

After QUAL-05 and ARCH-20 a run on `main` without font guards is 160-175s wall. On every run where
the guards do run, the `font-guards` job is the long pole: 144-251s for the job, of which the guard
step itself is 108-191s (135 tests on two workers, chromium only), while the `e2e` shards finish at
135-180s. Measured on the nine runs `85ff9a6`..`93c4015` and the two after ARCH-20
(`9b4f944`: 251s job, 191s guards; `86e5a17`: 233s, 186s). The guards run whenever `public/fonts/`,
`src/editor/`, `src/lib/`, `src/tools/sign/` or the guard fixtures change, which is every Sign or
editor commit, so this is the wall most of the time the editor is being worked on.

## Scope

- Matrix the `font-guards` job on `shard: [1, 2]` and run
  `npx playwright test --project=fonts --shard=${{ matrix.shard }}/2`, the same shape QUAL-05 gave
  the product e2e. The job already caches the chromium install (12s on a hit), so the fixed cost per
  shard is checkout + `npm ci` + build + cache restore, about 45s.
- Check the split by time, not by count: `--shard` balances by test count, and the export render
  guard and the shaping guards are not the same size. If one shard lands at over 60% of the guard
  time, list the specs per shard by hand (Playwright accepts file arguments next to `--shard`).
- The manual `update-export-render-baseline` dispatch runs the export render guard on its own after
  the matrix step; keep it in shard 1 only (`if: matrix.shard == 1`), the way the perf budgets are.
- `scripts/affected-scope.mjs`'s `fonts` verdict is computed per job today; both shards will compute
  it and agree, nothing to change there.

## Acceptance

- Five green runs where the guards ran, the `font-guards` shards each under 120s, and the run's wall
  no longer set by this job (compare with the `e2e` shards in `gh run view --json jobs`).
- The 135 guards (plus 3 skipped) still all run: sum the two shards' "passed" lines.
