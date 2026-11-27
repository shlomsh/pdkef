---
id: "LAND-08"
title: "No assertion is skipped by a branch"
status: "done"
priority: "P2"
epic: "honest-tests"
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

## Waves

- Wave 1 (2026-11-27): the 62 sites in 36 unit and browser test files. Each assertion now runs every time: case
  tables carry their expected values, `assert(...)` narrows a union instead of an `if`, loops run over filtered lists
  that are first asserted non-empty, and callbacks record and assert afterwards. No disable lines. About half the
  sites could skip silently before: Redact's whiteout handle count, a pdf case in Compress that asserted nothing, the
  fullscreen chevron in Highlight, a Sign corpus null row that asserted nothing, and a Scan photo with no page found.
  The rule is on at `error`; its `allow` map holds the 48 e2e sites in 19 specs, and only goes down.
- Wave 2 (2026-11-27): the 48 sites in 19 Playwright specs and the font guard harness. Case rows carry what each
  route, width or restore case expects (Merge's rail status and picked-up sentence per viewport, Redact's Duplicate
  per width, the Save link per page-grid route, islands per route), and a few phone-only checks became tests of their
  own. 14 lines in 6 files keep a disable, each saying why the branch is the point and what makes both sides run: a
  font guard's calibration mode (14 self-calibrating, 8 hand-picked), the WebKit project's tap, Compress's status
  marker, Highlight's full-screen case, Merge's desktop rail edit, and the app bar crumb, which shows at 390 and 768 px
  and gives way at 320, 360, 375 and 744 px (measured). `scripts/test-double-reasons.mjs` checks each has a reason.
  The `allow` map is gone: the rule is plain `error`.
