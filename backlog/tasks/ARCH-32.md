---
id: "ARCH-32"
title: "e2e selected by file-level reachability: a src/editor/ change runs the pages that import it"
status: "open"
priority: "P2"
epic: "module-boundaries"
phase: "near-term"
depends_on: ["ARCH-31", "DEBT-07"]
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
