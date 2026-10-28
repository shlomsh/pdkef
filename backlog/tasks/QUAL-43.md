---
id: "QUAL-43"
title: "A package.json edit that only changes scripts off the build path runs no product e2e"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "now"
depends_on: []
---

# QUAL-43 · A package.json edit that only changes scripts off the build path runs no product e2e

*Filed 2026-10-28* from ARCH-123's first narrowed-share reading: of 29 pushes to main, 17 ran everything and 6
of those were `package.json` alone, for example a new `test:` script for a guard. Lane: [ARCH-123](ARCH-123.md).

## Why

- `package.json` is an unowned file, so any edit to it widens to every spec and the font guards
  (`scripts/affected-scope.mjs`, the "unowned files" rule). Most of those edits add or rename a guard script that
  no spec, build step or preview reads.

## Outcome

- The scope oracle reads what the `package.json` diff changed, the way it already reads a `ci.yml` diff for the
  font-guards job. When only `scripts` entries changed, and none of them is on the build, preview or e2e path,
  the file gets the verdict "no e2e". Every other change (dependencies, overrides, `imports`, any other field, a
  script on that path) widens as before. Units stay wide for `package.json`.

## Acceptance

- [ ] A diff adding a guard script to `package.json` resolves to no product e2e and no font guards, with a test
      seen failing first.
- [ ] A diff touching `build`, `preview`, a script those call, a `test:e2e*` script, a dependency or `imports`
      still widens, each with a test.
- [ ] A `package.json` that cannot be read or parsed on either side widens (fail open).
