---
id: "QUAL-07"
title: "Skip the second product-e2e shard when the affected set is small enough for one"
status: "retired"
priority: "P3"
epic: "module-boundaries"
phase: "quick-win"
depends_on: ["ARCH-20"]
---

# QUAL-07 · One shard is enough for a narrowed run

*Filed 2026-09-14* from `docs/nx-affected-ci.md`'s follow-ups.

## Problem

ARCH-20 narrows the product e2e on a tool-only commit to that tool's `src/tools/<tool>/e2e/` plus
the cross-tool specs under `e2e/`, ten to forty tests instead of 134. Both `e2e` shards still start,
pay the ~65s fixed cost (checkout, `npm ci`, build, browser install with webkit's apt libraries) and
split a set that one runner finishes in under 30s. `--pass-with-no-tests` keeps an empty shard
green; it does not make it free. The wall does not move (the shards are parallel) but the second
runner is 2-3 minutes of billed time per narrowed run for nothing.

## Scope

- Have `scripts/affected-scope.mjs` also print `e2e_shards` (`2` when `everything=true` or the
  narrowed path set lists more than N tests, else `1`). Count with
  `npx playwright test --list --project=chromium --project=webkit <paths>`, which needs no server,
  or approximate from the number of spec files; pick N from the measured per-test time (about 1.3s
  chromium, 3s webkit on two workers) so that one shard never exceeds what two would have taken.
- Gate the matrix: `if: matrix.shard == 1 || steps.affected.outputs.e2e_shards == '2'` on the
  Playwright steps (the job still starts; a job-level `if` cannot read a step output from inside
  the same matrix, so the cheapest honest form is skipping the expensive steps and letting the
  second runner exit in ~15s). If that is too ugly, compute `e2e_shards` in a small job between
  `scope` and `e2e` and put the `strategy.matrix` on its output; measure that the extra job does
  not add to the critical path before choosing it.
- When one shard runs, it runs both projects unsharded: `--shard=1/1`, or no `--shard` at all.

## Acceptance

- A tool-only commit shows one shard doing the work and the other finishing in under 20s (or not
  starting), with every narrowed test still run once; an `everything` commit is unchanged.
- The run's wall time on a narrowed commit is not worse than before this ticket.

## Retired (2026-09-24)

Not worth the matrix complexity. The wall does not move (the shards are parallel), so the only gain
is billed runner minutes on narrowed runs, which are under a third of pushes. The ROI review on
2026-09-24 (ARCH-22's post-landing check) recommended no further narrowing work. Reopen if runner
minutes become a cost that matters.
