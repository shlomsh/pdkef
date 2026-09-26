---
id: "ARCH-31"
title: "check:push stops testing what a change cannot reach: test-only diffs, the typecheck, another worktree's preview"
status: "done"
priority: "P1"
epic: "module-boundaries"
phase: "near-term"
depends_on: ["ARCH-29", "ARCH-30"]
---

# ARCH-31 · check:push checks what the change can reach

*Filed 2026-09-26* after ARCH-30, from Shlomi: "check the same for check:push".

## Measured (2026-09-26, one session, load 6-12 from other sessions)

| One-file change on main | unit | typecheck | build | e2e product + perf | total |
| --- | --- | --- | --- | --- | --- |
| Merge component (`PdfMergeTool.tsx`) | 7.0s | 20.4s | 6.5s | 50.9 + 14.1s | 107s |
| Merge unit test only (`merge.test.js`) | 2.1s | 17.4s | 5.6s | 52.0 + 15.2s | 96s |
| `src/editor/model/actionHistory.ts` | 10.4s | 29.0s | 15.9s | 97.9 + 15.1s, export 7.7s | 195s |
| ARCH-30's branch (package.json: everything) | 17.1s | 16.9s | 6.7s | 74.7 + 15.6s, fonts 39.2s | 186s |

Replaying the planner over the last 79 pushes to `main` (origin/main reflog): 12 docs-only, 15 narrowed
to a tool, 2 without e2e, 50 everything (36 a core project, 23 of those `src/editor/`; 14 an unowned
root file). 4 non-docs pushes changed only test files.

## Scope

1. A diff of only `*.test.*` and `*.spec.*` files (plus docs) selects no product e2e for a unit test and
   runs only the changed specs; font and export guards run only when one of their own specs changed.
2. check:push's typecheck uses check:fast's `chooseTypecheck()`: tsc unless the diff touches an
   `.astro` file or a type config. CI keeps `astro check`.
3. check:push refuses to start Playwright when port 4173 belongs to another worktree's process
   (Playwright reuses it locally and would test that worktree's build); it only warned before.

Not here: narrowing e2e by file-level reachability for core changes is ARCH-32.

## Result

- `narrowTestOnlyChange()`: replayed over the same 79 pushes, 4 narrow from 11-12 e2e paths to the 1-2
  specs they changed; a unit-test-only push (the 96s `merge.test.js` case) drops its 67s of Playwright
  and the build. Only `.spec.js` narrows (Playwright discovers nothing else).
- Typecheck: 48 of the 67 non-docs pushes now take tsc (~2-5s) instead of `astro check` (17-29s).
- Port guard: with a server from another directory on 4173, check:push stopped in 1.9s naming it.
- Reviewer's dormant notes, not changed: a narrowed single spec still launches the `perf` project for
  zero tests (a few seconds), and Playwright path filters are substrings (no colliding paths today).
