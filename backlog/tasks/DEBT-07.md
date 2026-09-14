---
id: "DEBT-07"
title: "editor leaves CORE_PROJECTS after the ownership moves, or Nx leaves the repo: decide on QUAL-08's numbers"
status: "open"
priority: "P2"
epic: "architecture-debt"
phase: "near-term"
depends_on: ["DEBT-04", "DEBT-05", "DEBT-06", "QUAL-08"]
---

# DEBT-07 · Inference is load-bearing or it is gone

*Filed 2026-09-14*, findings 1 and 7 of
[docs/architecture-debt-review-2026-09-14.md](../../docs/architecture-debt-review-2026-09-14.md).

## Problem

With `editor` a core project by fiat, no changed file produces a different CI verdict with `@nx/js`
inference on or off, and `nx` + `@nx/js` are 227 of 854 lock packages (~90 MB) installed by all five
jobs. After DEBT-04, `editor`'s real dependents are Sign, Redact and `fonts`; the graph can say so.
If after that the core set is still effectively "everything", the machinery is a 60-line ownership
script wearing Nx.

## Scope

- After DEBT-04: remove `editor` from `CORE_PROJECTS`, same shape as DEBT-06 (own root in
  `unit_paths`, test cases, header and doc). Verify with `nx show projects --affected
  --files=src/editor/model/editorModel.ts` that the answer is Sign, Redact, `fonts`, `cross-tool-tests`,
  `site-e2e` and nothing else.
- Read QUAL-08's table. If the narrow share is at or above the review's 18% estimate and the
  `editor`/`editor-ui` verdicts are contributing to it, close this ticket with the numbers in
  `docs/nx-affected-ci.md`.
- Otherwise file the removal: `nx`, `@nx/js`, `nx.json`, the 18 `project.json` files and the `.nx/`
  ignore go; `affected-scope.mjs` keeps `deriveScope()` and gets `projectRoots()` from a literal
  roots map plus the two implicit-dependency lists moved in from `e2e/project.json` and
  `e2e/sign/project.json`. `affectedScope.test.js` unchanged.

## Acceptance

- Either: an `src/editor/`-only commit runs Sign, Redact, the editor's own tests, the font guards and
  `site-e2e`, and nothing for the seven other tools, on one green CI run.
- Or: `npm ci` installs 624 lock packages and `node scripts/affected-scope.mjs` prints the same verdict
  as before for each row of `docs/nx-affected-ci.md`'s table.

## Added after DEBT-04 landed (2026-09-14)

DEBT-04's landing note lists what still keeps `editor` in every tool's affected set: `lib -> editor`
via `liveFontCoverage.js` and five lib tests of editor modules (DEBT-05), `shell -> editor` via
`CompareSlider.tsx -> gestures/controller.ts`, and `editor -> site` / `lib -> site` via tests importing
`src/test/fixtures/` (unowned, so `site` claims it; an Nx project at `src/test/` fixes it). The
"editor leaves CORE" branch of this ticket is only real once those three are gone; measure the
`editorModel.ts` affected set first.
