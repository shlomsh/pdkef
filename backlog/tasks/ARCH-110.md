---
id: "ARCH-110"
title: "Scan folds its co-changing fields into the scan reducer"
status: "open"
priority: "P3"
epic: "unify-and-narrow"
horizon: "later"
depends_on: []
---

# ARCH-110 · Scan folds its co-changing fields into the scan reducer

*Filed 2026-10-27* from the re-score of the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV), finding P6.
Area: Code. Criterion: Thin components over pure logic. Structure only: no behaviour change.

## Why

- `src/tools/scan/PdfScanTool.tsx:100` keeps 11 `useState` calls beside the scan reducer.

## Outcome

- Co-changing fields folded into scan actions.

## Acceptance

- [ ] The island holds fewer `useState` calls, with the reducer tests covering the new actions.
