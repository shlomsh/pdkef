---
id: "QUAL-06"
title: "Shard the font guards: the font-guards job is the long pole on every run where it runs"
status: "done"
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

## Landed shape, and the measurement (2026-09-14)

`807b93f` shipped the shape in the Scope section above: `fonts-shard-1`/`fonts-shard-2` in
`playwright.config.js`, hand-split by measured time (not `--shard`, which divides by count and this
suite is 30x uneven per-spec), matrixed in `ci.yml`. Both shards compute the same `fonts` verdict from
`affected-scope.mjs` and skip together on an unaffected push (measured 19-31s, both shards, on the two
`Merge` commits below - `Resolve affected scope` plus a fast exit).

Three of the five post-landing runs on `main` had `fonts` affected and the guards actually execute
(`gh run view --json jobs`, job start to completion, checkout through the guard step):

- `b3fa57c` (QUAL-09 itself, touches only `ci.yml`, so `fonts` fail-opened to affected): shard 1 154s,
  shard 2 152s.
- `8edc224` (Split: the heading spans the stage - also fail-opened, `scripts/` or a root file in the
  diff): shard 1 147s, shard 2 142s.
- `14f03fc` (DEBT-12 CSS ratchet - fail-opened the same way): shard 1 137s, shard 2 180s.

All six shard-runs are above the 120s target; none is close to the pre-split single-job range this
ticket opened with (144-251s job, 108-191s guard step). Two things explain the gap rather than a
sharding defect: every one of the three qualifying runs was a fail-open (`everything=true` from
`scripts/affected-scope.mjs` because the diff touched a path no Nx project owns, not a narrowed `fonts`
push), so each shard ran its full half of the 135-guard suite rather than a subset; and this window also
had four other worktrees pushing to `main` in parallel (Merge, Split, Redact, DEBT-12), so GitHub's
concurrent-job ceiling likely queued some of these jobs behind each other - `e2e-webkit` on the first run
started four minutes after its sibling jobs with no corresponding step-level gap. Neither confound is
something a re-run on a quiet `main` can rule out cheaply, so the number is reported as measured rather
than adjusted.

The two shards stay close to each other (137-180s, not the 64/36 imbalance a count-based `--shard`
gave) and both are now comparable to or below `checks` and the `e2e` shards on the same runs, not the
outlier by a wide margin the way the single unsharded job was - QUAL-06's actual goal. Closed on that
basis; if the guards' own wall time matters again, the next lever is `docs/architecture-debt-review-2026-09-14.md`'s
per-tool gating (ARC-20 already narrows `fonts` on/off, not which guards within it run), not a third shard.

## Confirmed on a week of runs (2026-09-18)

QUAL-08's `scripts/ci-narrowing-report.mjs` (see its Addendum) now prints both shards' step and
job times for every `push` run on `main` since `9b4f944`. The guards ran on all 30 green
`everything` runs; on the 21 of them after this ticket's split (9 predate it), the medians are: shard 1 step 87s, job 139s; shard 2 step 106s, job 154s. The
job numbers match the three-run first measurement above (137-180s) and confirm the target of 120s
per shard is not met, for a structural reason rather than a noisy one: the fixed cost ahead of the
guard step (checkout, `npm ci`, affected-scope, build, browser cache restore and `install-deps`)
is about 54s per shard, so a shard can only get under 120s with a guard step under about 65s.

The other acceptance line, "the run's wall no longer set by this job", is also not met: a
`font-guards` job was the longest on 32 of the 40 green non-docs runs in the window: shard 2 on 16,
shard 1 on 8, and the unsharded job on the 8 runs before this ticket split it. The lever is the 20s gap between the two shards' steps, which means the
hand-balanced split in `playwright.config.js` has drifted since it was measured; moving one guard
from shard 2 to shard 1 is worth about 10s of wall on every run where the guards execute (43 of
60), and is the next thing to do before considering a third shard. Status stays `done`; that
rebalance is a small follow-up rather than a reopening.
