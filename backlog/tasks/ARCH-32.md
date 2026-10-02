---
id: "ARCH-32"
title: "e2e selected by file-level reachability: a src/editor/ change runs the pages that import it"
status: "done"
priority: "P2"
epic: "robustness"
depends_on: ["ARCH-31"]
---

# ARCH-32 · e2e selected by file-level reachability

*Filed 2026-09-26* from ARCH-31's measurements. ARCH-28 did this for unit tests; e2e still decides by
Nx project, and a core project (`site`, `shell`, `editor`, `lib`) runs every spec.

## Why

Of the last 79 pushes to `main`, 36 ran every e2e spec because a core project changed, 23 of them
through `src/editor/`, which only Sign and Redact import. DEBT-07 measured that the project graph
still connects `editor` to 18 of 19 projects, so Nx alone cannot narrow it. A `src/editor/` push took
195s in check:push, 98s of it product e2e; Sign + Redact + the site-wide specs are roughly two thirds
of the suite's test time, so the estimate is 30-40s saved on about a quarter of pushes.

## Scope

- From a changed file, walk reverse imports (the scanner `check-module-boundaries.mjs` already has)
  to the tool islands and pages that reach it; run those tools' `src/tools/<t>/e2e/` plus site-e2e.
- Fail open exactly as now: CSS, unowned files, anything the scanner cannot resolve widens.
- The site-wide specs (~25s wall on any tool change) are the remaining floor; splitting them by tool
  is a separate question.

## Folded in

- DEBT-07: the `editor`-leaves-`CORE_PROJECTS` branch, and the `SignMessages` re-export cut (`i18n` -> `editor`), which is why the project graph still connects `editor` to 18 of 19 projects. The Nx-removal branch is not taken (ARCH-27).

## 2026-10-01 board cleanup

- depends_on: dropped DEBT-07 (merged into this ticket).

## Done (2026-10-01)

- `scripts/import-graph.mjs` holds the import scan, extracted from `check-module-boundaries.mjs` (which
  imports it back; its output is unchanged). `buildReachGraph()` adds test files, specs, `<script src>`
  edges, `api/` and `middleware.ts`; a full scan is about 0.1s.
- `affected-scope.mjs`: when a core project is affected, `narrowByReachability` walks reverse imports
  from each changed `src/` file. Only a tool file or a top-level tool page is a safe end of the walk and
  selects that tool; unit tests end it silently. Everything else widens with a reason naming the file:
  any other page (tool specs also visit `/` and `/he/<tool>/`), an `e2e/` file outside the site-wide
  set, a file nothing live imports, anything the scan did not see (CSS, YAML, a deleted file), a diff
  with no `src/` file. Output shape unchanged, so CI and `check:push` needed no edit.
- Fresh review found two wrong narrowings in the first version (home-page code and the localized tool
  page treated as covered by site-wide specs, while Sign, Redact and Merge specs visit them). Fixed by the
  rule above and pinned by tests on the real graph.
- Replay of the last 79 pushes: 46 ran every spec before, 39 after. The gain is smaller than this
  ticket estimated: the "23 pushes through `src/editor/`" did not reproduce in this window, and code that
  reaches the home page must widen. Biggest remaining wide reasons: unowned files (19, unchanged rule) and
  `src/editor/text/liveFontCoverage.js`, which the shaping harness loads by path string, so nothing
  imports it (9; importing it instead would let those narrow).
- DEBT-07's `SignMessages` cut is not needed: a core verdict no longer decides e2e by the Nx graph.
- `check:push` on the branch: full suite (the oracle changed), 295 passed and 1 failed in
  `e2e/demo/workspace-flow.spec.js` with no product diff; that spec passed 15/15 alone. Filed as QUAL-20.
