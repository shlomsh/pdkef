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

## Investigated (2026-09-17)

DEBT-04's second pass (2026-09-15) landed `site-test` and named two more edges its own pass had not
cut: `site -> editor` (via `src/i18n/toolMessages.ts`'s `import type { SignMessages }`, `src/i18n/`
having no Nx project of its own so `site` claimed it) and `site-test -> editor` (via
`src/test/signLanguagePage.test.js` importing `LANGUAGE_COVERAGE` from
`src/editor/text/fontCoverageReport.js`). Both are now cut, one commit each:

- `src/i18n/` got its own Nx project (`src/i18n/project.json`, name `i18n`, same shape as `site-test`).
- `signLanguagePage.test.js` moved to `src/test/seo/signLanguagePage.test.js` with its own nested
  project (`seo-content-guards`, sibling of `cross-tool-tests` inside `site-test`, same shape).

Measured, `nx show projects --affected --files=src/editor/model/editorModel.ts` (cold graph,
`rm -rf .nx`, `NX_DAEMON=false`):

- **Before** (unchanged from DEBT-04's own note, reproduced): 18 of 19 projects (only `font-assets`
  absent) - `editor`, `cross-tool-tests`, `tool-redact`, `site-e2e`, `tool-sign`, `fonts`, `editor-ui`,
  `site-test`, `tool-image-to-pdf`, `tool-edit-pages`, `tool-compress`, `tool-security`,
  `tool-to-image`, `tool-merge`, `tool-split`, `shell`, `lib`, `site`.
- **After both cuts**: still 18 projects, but `lib` and `site-test` are genuinely gone -
  `cross-tool-tests`, `editor`, `editor-ui`, `fonts`, `i18n`, `seo-content-guards`, `shell`, `site`,
  `site-e2e`, `tool-compress`, `tool-edit-pages`, `tool-image-to-pdf`, `tool-merge`, `tool-redact`,
  `tool-security`, `tool-sign`, `tool-split`, `tool-to-image`.

**Not the seven-project target** (`editor`, `cross-tool-tests`, `tool-redact`, `site-e2e`, `tool-sign`,
`fonts`, `editor-ui`) - eleven extra projects remain: `site`, `i18n`, `seo-content-guards`, `shell`,
and all eight tool projects except `tool-redact`/`tool-sign`. This is a real, structural finding, not a
missed step in either cut:

- The `signLanguagePage.test.js` move fully worked in isolation - it is the entire reason `lib` and
  `site-test` now correctly drop out (`lib`'s only path to `editor` was `lib -> site-test -> editor`,
  entirely through that one file). `seo-content-guards` itself still carries a real, expected edge to
  `editor` (same shape as `cross-tool-tests` - it is a legitimate cross-cutting guard, not a misplaced
  test), which is why it - like `cross-tool-tests` - belongs in any honest "final" target list.
- The `src/i18n/` split did **not** shrink the set the way `site-test`'s split did, and this is
  structural: `site` has a real, unavoidable edge to `i18n` (astro pages/layouts import the message
  catalogues to render at all - not an inference artifact), and every tool has its own real, permitted
  edge straight to `i18n` (module-boundaries rule 1: "a tool may import site's i18n/data"). `i18n`
  itself still has a real edge to `editor` (`toolMessages.ts`'s `SignMessages` re-export), so
  `tool -> i18n -> editor` and `site -> i18n -> editor` reproduce the same "everything" result the old
  `site`-fallback attribution produced - just through a real graph edge into a narrow, non-core project
  instead of through `CORE_PROJECTS`'s override on `site`. This confirms what DEBT-04's own note already
  flagged: severing it needs the design decision left open there (moving or duplicating `SignMessages`
  so `i18n` no longer imports anything from `editor`), not a mechanical reattribution - out of scope for
  this pass, which only proves the graph mechanism itself is clean where a mechanical fix is possible.

Full detail and prose in `docs/nx-affected-ci.md` ("What landed", the `seo-content-guards` and
"Where this still falls short" notes, and the rewritten `shell -> i18n` coupling section).

This ticket's own decision - whether to actually flip `CORE_PROJECTS` to drop `editor` (which today
would still only narrow `lib`/`site-test` out, not reach the seven-project target), and whether Nx
itself is worth keeping at all - still waits on QUAL-08's separate CI-narrowing-value measurement,
untouched here. Status stays `open`.
