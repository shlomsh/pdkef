---
id: "LAND-08"
title: "No assertion is skipped by a branch"
status: "in_progress"
priority: "P2"
epic: "honest-tests"
horizon: "next"
depends_on: ["LAND-06"]
---

# LAND-08 · No assertion is skipped by a branch

*Filed 2026-11-27.* `no-conditional-expect` reports 110 assertions behind an `if`, `&&`, `?:` or `catch`
in 54 files (docs/landmines-adoption.md). Some are real silent skips: `src/tools/sign/PdfSignTool.test.tsx:308`
is `if (pageKind) expect(...)` where `pageKind` can be undefined, so the test passes with no assertion.
Others branch on a case parameter (`src/test/cross-tool/textCoverage.test.js:100`) and belong in the case
table, and some loop over the tool list (`e2e/tool-output-paths.spec.js:113`) and may be fine as they are.

## Outcome

- The count comes down in waves, by area as LAND-04 did; a rewrite makes the assertion run
  unconditionally or splits the case, never just reshapes the syntax.
- A branch that is the point of the test (one tool of the list really differs) keeps a one-line disable
  saying so.
- The rule at `error` in `.oxlintrc.json`, `npm run lint:landmines` clean.
