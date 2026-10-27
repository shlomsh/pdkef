---
id: "QUAL-31"
title: "check:push typechecks .astro scripts when the diff reaches an .astro file"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: []
---

# QUAL-31 · check:push typechecks .astro scripts when the diff reaches an .astro file

*Filed 2026-10-27* after main went red on a type error that passed `check:push`.

## Why

- `scripts/check-push.mjs` typechecks with `tsc` through `check-fast.mjs` (comment at line 23: "CI
  carries the full suite and `astro check`"). `tsc` does not read the scripts inside `.astro` files.
- On 2026-10-27 `src/layouts/BaseLayout.astro:152` passed an untyped id to `clearTimeout`. `check:push`
  was green, CI's `astro check` failed, and main was red until 7ba3815a.

## Outcome

- When the diff reaches an `.astro` file, `check:push` runs `astro check` as its typecheck step (or adds
  it beside `tsc`). Other diffs keep today's narrowed `tsc`.

## Acceptance

- [x] Unit test in `scripts/check-push.test.mjs`: a diff touching an `.astro` file plans `astro check`;
      a diff touching only `.ts` does not.
- [x] The run time of the added step is written in the Done section.

## Done

*2026-10-27.* `planSteps` adds an `astro-check` step (`npm run typecheck`, which is `astro check`) when
the diff reaches an `.astro` file, in its own stage before the build so the two never write `.astro/` at
once. `astro check` on this worktree: 15.8 s wall, 0 errors.

A `.ts` or `.js` change that only an `.astro` page consumes still skips it locally; CI's `astro check`
catches that, as it did for the incident above.
