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

Taken 2026-09-26 on this Mac (10 cores) by one session, no parallel agents; other sessions kept the
load average at 5-7 throughout. SNG numbers come from a detached checkout of `a754f257`.

| Case | guards | units (files / tests) | typecheck | total |
| --- | --- | --- | --- | --- |
| (a) empty diff: widens to the whole suite | 1.3s | 17.8s (207 / 4,099) | astro check 18-21s | ~39s |
| (b) SNG branch, base = merge-base | 1.3s | 10.5s (38 / 680) | astro check 18-20s | ~31s |
| (c) one Sign file edited on SNG, base = merge-base (today) | 1.3s | 10.5s (38 / 680) | 18.5s | ~30s |
| (c) same edit, base = HEAD | 1.3s | 9.4s (9 / 92) | 17.6s | ~28s |
| (c) one editor file edited, base = HEAD | 1.3s | 10.1s (20 / 257) | 18.6s | ~30s |
| (d) 3 x (b) in parallel, each | 1.5s | 18s | 20s | ~40s |
| (e) typecheck alone | | | tsc cold 5.2s, warm incremental 1.6-2.0s, astro check 18-21s | |

- **The typecheck is 60% of check:fast and never narrows.** `astro check` costs 18-21s whatever
  changed. `tsc --noEmit` catches the same `.ts` error (probe: a `string` assigned to `number` in
  `fillTap.ts`, both flag it) in 5s cold and 2s warm, but not `.astro` files, and it reports two
  false errors today (`window.va` in `maintenanceTelemetry.ts` and `productAnalytics.ts`, declared
  only through an `.astro` import chain).
- **Unit narrowing has a floor near 9s.** `src/tools/sign/PdfSignTool.test.tsx` alone takes 6s and
  almost any Sign edit selects it. Whole suite 18s, whole branch 10.5s, the edit alone 9.4s. Vitest's
  own startup is ~1-2s.
- **Contention hits units, not astro check**: 3 parallel runs take units from 10s to 18s each.
- **One implementer brief end to end** (two-line edit plus one test, `implementer` agent): 92s,
  7 tool calls; 62s of it was check:fast run twice, because the first run was piped through
  `tail -60` and the agent re-ran it to see the result. Research agents (80-496s, 13-56 tool calls)
  are bound by tool calls, not checks.
