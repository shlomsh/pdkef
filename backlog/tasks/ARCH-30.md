---
id: "ARCH-30"
title: "A subagent's check:fast costs what its own edit touched, not what the branch has changed"
status: "in_progress"
priority: "P1"
epic: "module-boundaries"
phase: "near-term"
depends_on: ["ARCH-28", "ARCH-29"]
---

# ARCH-30 · A subagent's check:fast costs what its own edit touched

*Filed 2026-09-26* from Shlomi: "the last check fast was not very fast. those subagents became very
slow and time consuming lately" and "every subagent running sanity tests is checking far more than the
code changes actually touched".

## Why

`check:fast` seeds `vitest related` from `git merge-base origin/main HEAD`, so on a long-lived branch
every subagent re-tests the whole branch (claude/sign-nextgen-plan: 60 files, 62 test files, 1,544
tests) and always runs a whole-project `astro check`.

## Scope

1. Measure (a) clean main, (b) the SNG branch as a fixed range, (c) a one-file edit on a long-lived
   branch, (d) 1 vs 3 parallel check:fast, (e) astro check vs incremental tsc; time one implementer
   brief end to end.
2. Propose an iteration check scoped to a given ref; implement once agreed. CI and check:push stay
   whole-branch.

## Measurements

(filled in below)
