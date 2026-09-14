---
id: "DEBT-03"
title: "change-scope.mjs diffs with --no-renames so a moved file's old owner is affected too"
status: "done"
priority: "P1"
epic: "architecture-debt"
phase: "quick-win"
depends_on: []
---

# DEBT-03 · A rename must affect both its source and its destination

*Filed 2026-09-14*, finding 8 of
[docs/architecture-debt-review-2026-09-14.md](../../docs/architecture-debt-review-2026-09-14.md).

## Problem

`scripts/change-scope.mjs`'s `changedFiles()` runs `git diff --name-only`; with git's default rename
detection the old path of a moved file is absent (`git diff --name-only 370ace3~1 370ace3` lists 0
`src/components/SignTool` paths, 37 with `--no-renames`). A file moved from `src/tools/a/` to
`src/tools/b/` affects only `tool-b`; `a`'s tests that still import it are skipped.

## Scope

- `--no-renames` on both `git diff` calls in `changedFiles()`.
- One regression test in `src/lib/changeScope.test.js` that stubs `git` and asserts both paths of a
  rename come back.

## Acceptance

- `node scripts/affected-scope.mjs --base 370ace3~1 --head 370ace3` lists `src/components/SignTool/...`
  among its unowned files.

## Landed (2026-09-14, `a4d96fb`)

`--no-renames` on both diffs; `changedFiles(base, head, run = git)` so the regression test injects a
recorder. `changedFiles('370ace3~1', '370ace3')` now returns the 37 `src/components/SignTool` paths.
