---
id: "ARCH-29"
title: "One local pre-push command runs exactly what CI would run for the diff"
status: "done"
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

## Result (2026-09-25)

`scripts/check-push.mjs` (`npm run check:push`) computes the oracle's scope exactly once - reusing
`affected-scope.mjs`'s newly-exported `resolveScope`/`runUnit`/`runE2eProduct`/`runE2ePerf`/`runFonts`/
`runExportGuards` against one base (merge-base of `origin/main` and `HEAD`) and one file list (working
tree, uncommitted and untracked included) - prints the scope with reasons, then runs an ordered step
plan, stopping at the first failure. The one new question, "does this diff reach `dist/`?", is
`fileCannotReachDist()`'s allowlist (docs/backlog, `.github/`, `*.test.*`, `src/test/`, `e2e/` specs,
`scripts/` other than the 4 files `npm run build` itself invokes) - verified against the real build
chain, not inferred. `planSteps()` and `fileCannotReachDist`/`reachesDist` are pure and pinned by 8
scenarios in `scripts/check-push.test.mjs` (docs-only, scripts-only, sign source, sign test-only,
backlog+lib mix, vercel.json, e2e-spec-only, unknown root file).

Two real runs on this branch (both times the oracle widened to "everything" because `package.json` is
unowned by any Nx project - not a narrowing showcase, but proof check:push tracks the oracle exactly):
(a) branch as-is (scripts+docs+backlog): 176.1s across 23 steps, all green, matching
`node scripts/affected-scope.mjs --base <mergebase>`'s own `everything=true, fonts=true,
export_guards=true` verdict. (b) a WIP commit adding a comment to `src/tools/sign/PdfSignTool.tsx`
(reset with `git reset --hard HEAD~1` right after, confirmed HEAD was the WIP commit first): 173.4s
across the same 23 steps, same oracle verdict for the same reason. `check:fast` stayed green throughout.

`typecheck` (`astro check`) has no `--incremental`/`--tsBuildInfoFile` flag (checked `--help`) and two
consecutive full runs measured 18.0s then 16.2s with no `.tsbuildinfo` ever appearing - ordinary
run-to-run noise, not a cache hit. Left as a full run every time; a bare `tsc --incremental` would risk
missing `astro check`'s `.astro`-aware diagnostics, which the ticket rules out.

CLAUDE.md's pre-push line now points at `check:push` ([tests] pointer); `.claude/rules/tests.md` gained
a section on the mechanism. `check:guidance` still passes (185/200 lines).
