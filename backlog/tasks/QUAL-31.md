---
id: "QUAL-31"
title: "check:push typechecks .astro scripts when the diff reaches an .astro file"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
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

- [ ] Unit test in `scripts/check-push.test.mjs`: a diff touching an `.astro` file plans `astro check`;
      a diff touching only `.ts` does not.
- [ ] The run time of the added step is written in the Done section.
