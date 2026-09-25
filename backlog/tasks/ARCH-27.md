---
id: "ARCH-27"
title: "Replay real pushes through a path map and decide whether Nx still earns its place"
status: "in_progress"
priority: "P3"
epic: "module-boundaries"
phase: "near-term"
depends_on: ["ARCH-22"]
---

# ARCH-27 · Replay real pushes through a path map and decide whether Nx still earns its place

*Filed 2026-09-25*, from the ARCH-22 post-landing check (97 push runs on `main` since `19dca856`).

## Why

Nx's only remaining job is the affected-scope oracle in `scripts/affected-scope.mjs`. DEBT-14 deleted
the project tags, and module boundaries are enforced by `check-module-boundaries.mjs`, not Nx. So the
question is narrow: does Nx's project graph produce verdicts a plain path map could not?

What the check measured:
- Nx produces only the "narrow" bucket: 30% of pushes, median wall 143s vs 169s for "everything",
  so roughly 8s per push averaged over all pushes, plus fewer runner minutes on narrow runs.
- The biggest saving, docs-only (12s), comes from `scripts/change-scope.mjs`, which does not use Nx.
- 46 of 53 wide runs are core-project reach (editor, shell, site, lib). No oracle can narrow those,
  so the everything share (58% to 55%) is a layout ceiling, not an Nx shortfall.

What Nx costs: the `nx` devDependency, 27 `project.json` files, 454 lines of oracle, about 3s per
job across 8 jobs, and ownership surprises (a root `ANALYTICS.md` forced everything on run
35513879228). It fails safe: unsure means wide.

Every narrow verdict seen in the window (tool-sign, tool-redact, tool-merge, the corpus, tooling)
looks reproducible by a small folder-to-project map with one explicit edge (`src/editor-ui/` reaches
sign and redact). That is the "second hand-written map" ARCH-20 chose not to build, and it is
inferred, not measured. This ticket measures it.

## Scope

1. Write a throwaway path-map oracle (not wired into CI) with the same outputs as
   `affected-scope.mjs`: `everything`, `fonts`, `unit_paths`, e2e projects.
2. For every push run `scripts/ci-narrowing-report.mjs --since 19dca856 --events push` lists, diff
   the push's files (previous run's sha to this sha) and compare the path map's verdict with the one
   Nx gave in CI.
3. Record every divergence with run id, sha, files and both verdicts. A divergence where the path
   map is *narrower* than Nx is a correctness risk; one where it is wider is only lost speed.

## Decision rule

- Zero narrower divergences: drop Nx at the next point it causes pain (a major upgrade, a new
  ownership surprise), replacing it with the path map and its unit tests. File that as its own ticket.
- Any narrower divergence Nx caught through the import graph: Nx has earned its place; close this
  with the evidence and stop revisiting it.

## Out of scope

Removing Nx in this ticket. Changing what counts as a core project.
