---
id: "ARCH-130"
title: "Exports only tests use, and exports nothing uses, are deleted"
status: "in_progress"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
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

- [ ] None of the 26 is left untagged, and the unused-exports record is lowered.
