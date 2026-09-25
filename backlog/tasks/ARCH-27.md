---
id: "ARCH-27"
title: "Replay real pushes through a path map and decide whether Nx still earns its place"
status: "done"
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

## Result (2026-09-25)

The goal this serves is CI, and the chain agents run locally, running only what a change touches or
impacts. Nx is one tactic toward that. Three measurements, spikes committed under
`scripts/spike/arch-27/`:

**1. Replay (`path-map-replay.mjs`).** 98 push runs since `19dca856`; 15 docs-only, 83 compared. Nx
was re-run at each push's own sha (detached checkout, `nx show projects --affected`), and matched the
CI verdict on all 83. A hand-written dependents table fed into the same `deriveScope()` gave identical
`everything`, `fonts`, `export_guards`, `unit_paths` and `e2e_paths` on **83 of 83**: 0 narrower,
0 wider. The only difference is the reason text on 25 wide runs (the map names one more core
project). The one edge that matters for narrowing is `editor-ui -> {tool-sign, tool-redact}`.

**2. Graph drift (`graph-drift.mjs`).** All 156 first-parent commits graphed. The project graph
changed 4 times: 3 folder or `project.json` moves (a map edit in the same commit anyway) and 1
ordinary import (`src/lib/signHelpers.js` importing `src/constants/signGeometry.js`, adding
`lib -> site`) between two core projects, so no verdict could change. A hand map missed zero
verdicts in the window.

**3. Where the time goes (measured on the Mac, not CI).** The non-Playwright chain is 48s alone,
104s while sibling worktrees run tests, which is the normal state with parallel agents.
`check:fast` is 24s. Only the unit run is narrowed today; `typecheck` (17-30s), `build` (7-16s) and
the dist guards run in full on every non-docs push. At file level the gap is large: for real
`editor`, `lib` and `shell` pushes the oracle ran all 193 unit files because they are core projects,
while `vitest related <changed files>` selected 2, 13 and 1. On CI, per-job setup (checkout, `npm ci`
~10s, Playwright system deps 14-26s, build ~12s) is a floor narrowing cannot touch.

## Decision

- **Nx does not earn its place, but removing it is not the win.** It adds nothing over a small map,
  and costs `nx` + `@nx/js` in every job's install and a few seconds of graph per job. Its removal
  is DEBT-07's second branch; do it as part of ARCH-28, which rewrites the oracle anyway, not as its
  own project.
- **The win is file-level impact instead of project-level.** 46 of 53 wide runs in the ARCH-22
  window were core reach, and no project graph can narrow those. ARCH-28 takes unit tests to
  `vitest related`, with the caveats measured here (`.astro`, moved files, tests that read fixtures
  by path, config files) handled as explicit widen rules.
- **Locally, agents should run the oracle's scope, not the whole chain.** ARCH-29 gives them one
  command that runs exactly what CI would run for their diff.
