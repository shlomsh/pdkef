---
id: "QUAL-24"
title: "Local checks run only what the diff reaches; CI runs every unit test; nightly hunts flakes"
status: "done"
priority: "P2"
epic: "robustness"
---

# QUAL-24 · Light local checks, more on CI and nightly

*Filed 2026-10-18.* Shlomi: check:fast per subagent is too long; more tests should run on GitHub CI
and more coverage nightly, while lowering the load locally.

## Why

`check:fast` applies CI's fail-open rules on a laptop. On QUAL-23's own commit (ci.yml, one spec, a
ticket) it ran the full unit suite (35s) because of the `ci-workflows` widen rule, which is about
CI's environment and means nothing locally, plus a 31s `astro check` in a fresh worktree because
`.astro/types.d.ts` did not exist yet: 68s for a change no unit test can see. An empty diff, an
unpaired deletion or a CI oracle file widen the same way.

## Scope

- **Local** (`check:fast`, `check:push`): `selectUnitTests(..., { mode: 'local' })` never widens to
  the whole suite. A whole-suite reason is printed as "CI runs the full suite" and selection carries
  on with the seeds; an empty diff or no seeds runs no unit tests. Typecheck is always `tsc`
  (after `astro sync` when `.astro/types.d.ts` is missing); `astro check` is CI's. An unusable
  `--since` fails instead of widening. `check:push` with an empty diff runs no build.
- **CI on every push**: `checks` runs the whole unit suite, unnarrowed; `astro check` moves to its
  own parallel `typecheck` job.
- **Nightly**: the chromium e2e shards run with `--repeat-each=2`, so a flaky spec turns the nightly
  red instead of a push.

## Done when

- `check:fast` on QUAL-23's diff runs in well under 15s, with the reasons printed.
- A CI run on the branch shows `checks` running every unit file and `typecheck` as its own job.

## Result

- `check:fast` on this branch's whole diff (ci.yml, scripts, one spec, two tickets): 68.5s before
  (full unit suite plus `astro check`), 6.9s after (15 seeds, tsc). `check:push` on the same diff:
  7.6s. The full unit suite still passes locally (422 files, 7897 tests).
- CI run 39141500514: `checks` ran every unit file in 194s and `typecheck` ran as its own job in
  63s, both beside the e2e shards; the whole run took 225s.
- The nightly `--repeat-each=2` pass is wired but first runs on the next cron after this lands.
