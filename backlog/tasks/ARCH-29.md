---
id: "ARCH-29"
title: "One local pre-push command runs exactly what CI would run for the diff"
status: "in_progress"
priority: "P1"
epic: "module-boundaries"
phase: "near-term"
depends_on: ["ARCH-27"]
---

# ARCH-29 · One local pre-push command runs exactly what CI would run for the diff

*Filed 2026-09-25* from ARCH-27. Agents running the whole `ci.yml` chain locally before a push is too
slow, and parallel agents on one Mac roughly double every step (measured: non-Playwright chain 48s
alone, 104s under contention, before build and e2e).

## Scope

1. `npm run check:push` computes the scope once with `scripts/affected-scope.mjs` against
   `origin/main` and runs only the steps that scope selects: the narrowed unit set; `typecheck`
   unless the diff is docs-only; `build` plus the dist guards (`test:csp`, `test:seo`,
   `test:redirects`, `test:css`, `test:weight`, `test:lazy-modules`) only when the diff touches
   anything that reaches `dist/` (source, content, `public/`, config); the narrowed Playwright,
   font-guard and export-guard sets. The cheap source guards always run.
2. It prints the scope first, with the reason, so an agent can see why something ran.
3. CLAUDE.md's "run the whole `ci.yml` chain once before a push" line points at `check:push`
   instead, and `check:guidance` still passes.
4. Consider `typecheck` incrementally (`tsc --incremental` build info) rather than skipping it; it
   is whole-program, so skipping by path is not safe.

## Acceptance

On a scripts-only diff and a `src/tools/sign/`-only diff, `check:push` runs the same set CI then
runs for the same push, and finishes well under the full chain on the same machine.
