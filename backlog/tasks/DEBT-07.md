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

## QUAL-08 input (2026-09-18)

QUAL-08 closed with the recommendation to finish the `SignMessages` cut on architectural grounds,
and its Addendum puts a number on the wall-clock side of this ticket's decision: on the 60 `push`
runs since `9b4f944`, `font-guards` sets the wall on 32 of the 40 green non-docs runs, and
`tool-sign` is an implicit dependency of `fonts`, so every Sign/Redact narrow run still executes
the full guard suite. Median wall for those six green runs is 170s against 180s for the green
`everything` runs; the narrow runs that skip the guards (Merge, page-only) sit at 120-132s.
Flipping `editor` out of `CORE_PROJECTS` therefore buys about 10s of CI wall on an editor-only
push, a gap inside run-to-run noise (those six runs span 146-188s), and a 3x smaller `checks` unit-test step (61s to 22-30s), which is the local `check:fast`
win rather than a CI one. The narrow share is 22% of runs, above the review's 18% estimate, but
the editor-side verdicts contribute little wall time to it for the reason above. Nx itself:
QUAL-08's Result says keep it; ARCH-22 has since given `scripts/` real ownership, which removes
the largest `everything` reason (25% of those runs) and is the change that actually raises the
narrow rate.

## QUAL-08's fonts-edge addendum input (2026-09-18)

QUAL-08's second addendum (filed alongside ARCH-23) checked every `everything`-verdict run's actual
changed files in the 62-push window since `9b4f944`, not just whether `editor` was in the affected
set. Of the 14 runs whose reason was `core project(s) affected` (naming `editor` alongside `site`/
`shell`/sometimes `lib`), **7 (50%) touched no text/font file and no other genuinely repo-wide file**
- five are exactly the `site`/`i18n` -> `editor` hub-reach this ticket's "Investigated" section
already names (`61d7f91a`, `ab7bbb29`, `a9909076`, `5b0a220c` are Hebrew-localized content YAML or
`src/i18n/{toolMessages,cardMessages}.ts`; `79c2238c` is a Sign-only change reaching `editor` through
`editorModel.ts`/`messages.ts`), and two (`8edc224a`, `e0c16e19`) are `src/data/tools.js` - the site
tool registry - reaching `editor`/`shell` the same structural way. The other 7 genuinely touch a
shared file (`src/shell/ToolShell.tsx`, `src/shell/RecentFiles.tsx`, `src/site-lib/gitLastModified.js`)
or `src/editor/text/combPlacement.ts` directly (itself a fonts-and-text.md path, so rightful
independent of the `core`-bucket question). Median wall was 167s for the coarse half against 174s for
the plausible half - inside noise, the same shape as this ticket's own six-run comparison above.

This is a real, comparable coarse share (50%, same order of magnitude as ARCH-23's population) but it
does not change this ticket's own conclusion: the wall-clock case stays weak (the 7s gap here is
smaller than the six-run 10s gap already measured, both inside noise), and the fix for these five
`i18n`-hub cases specifically is the `SignMessages` re-export move this ticket's Problem section
already names as the actual cut - not a new decision. Filed here as the number this ticket's own
"Investigated" section predicted but had not yet measured against real CI runs. Contrast with
ARCH-23's own population (the `tool-sign` edge on `narrow`-verdict runs), which measured 100% coarse
(8 of 8, zero counterexamples) rather than 50% - the reason ARCH-23 was raised to P1 and this ticket
was not.
