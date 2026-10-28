---
id: "QUAL-43"
title: "A package.json edit that only changes scripts off the build path runs no product e2e"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
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

- [x] A diff adding a guard script to `package.json` resolves to no product e2e and no font guards, with a test
      seen failing first.
- [x] A diff touching `build`, `preview`, a script those call, a `test:e2e*` script, a dependency or `imports`
      still widens, each with a test.
- [x] A `package.json` that cannot be read or parsed on either side widens (fail open).

## Done (2026-10-28)

- `packageJsonReachesE2e` in `scripts/unowned-verdicts.mjs` reads the package.json diff. When only `scripts`
  entries changed and none is on the e2e path, `resolveScope` leaves package.json out of the Nx query and
  `deriveScope` leaves it out of the unowned list. The e2e path is build, preview, dev, the install lifecycle
  `npm ci` runs (install, prepare), their pre/post hooks, every `test:e2e*` script, and every script named in the
  text of one already on it, on either side.
- Live probes on the real package.json, oracle committed: a new guard script and an edit to `test:css` give no
  product e2e and no font guards; an edit to `build` or `postinstall` still runs everything.
- The first cut still widened, because Nx marks every project affected by the root package.json; a live probe
  showed it. The review found the install lifecycle and non-`npm run` callers missing; both are fixed with tests.
- Units stay wide for package.json (`scripts/unit-scope.mjs`): many guard tests read it as text.
