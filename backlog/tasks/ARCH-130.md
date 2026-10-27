---
id: "ARCH-130"
title: "Exports only tests use, and exports nothing uses, are deleted"
status: "done"
priority: "P3"
epic: "unify-and-narrow"
depends_on: []
---

# ARCH-130 · Exports only tests use, and exports nothing uses, are deleted

*Filed 2026-10-27* from ARCH-114, which listed them instead of deleting them. Structure only: no behaviour change.

## Why

- 19 exports are called only by their tests, never by the product; 7 are used nowhere. They pass the unused-exports ratchet because they sit in its baseline.
- Test-only: `coords.ts` percentToPx, `strokeGeometry.ts` strokeSvgPath, `hebrewCombiningCorpus.js` COMPOSABLE_BASES, CALIBRATION_MARK, ORDER_VARIANT_GROUPS, `appUpdate.ts` isUpdateWaiting, `errorReportStore.ts` reportCommands, `tools.js` variantsOf, `pdfObjects.js` hasFillableAcroForm, `fontCoverageReport.js` CYRILLIC_ANCHOR, COMBINATION_COVERAGE, LANGUAGE_COVERAGE, `fonts.js` HEBREW_CAPABLE_FONTS, `actionTrail.ts` resetActionTrailForTests, `errorReport.ts` resetErrorReportingForTests, setReportingEnabledForTests, `IslandErrorBoundary.tsx` default, `maintenanceTelemetry.ts` sanitizeAnalyticsPath, resetMaintenanceEventsForTests.
- Never used: `src/editor/interaction/constants.ts` SECOND_FINGER_WINDOW_MS, DOUBLE_TAP_MS, SPOT_REACH_PX, MIN_TOUCH_TARGET_PX, HANDLE_HIT_PX, HANDLE_HIT_FLOOR_PX; `src/editor/model/actionHistory.ts` HistoryOperation.

## Outcome

- Each one reviewed: dead code is deleted with the tests that only exercise it; a reset hook that a test needs as a seam is tagged `@testSeam`; a corpus or report table a guard reads stays and is tagged.

## Acceptance

- [x] None of the 26 is left untagged, and the unused-exports record is lowered.

## Closed 2026-10-28

Of the 26: 13 tagged `@testSeam` (the four reset/set hooks, the seven corpus and coverage tables, `hasFillableAcroForm`, which the detection-purity allowlist names, and `IslandErrorBoundary`'s default export, which tests render), 6 test-only functions deleted with their test cases (percentToPx, strokeSvgPath, isUpdateWaiting, reportCommands, variantsOf, sanitizeAnalyticsPath), and the 6 never-used constants and `HistoryOperation` deleted; their design values stay in docs/sign-next-gen-guidelines.md §2.5 and a comment in constants.ts. The font coverage generator now writes the tags it reports. unusedExports {7, 155, 212} -> {0, 155, 192}.
