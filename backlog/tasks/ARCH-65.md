---
id: "ARCH-65"
title: "Merge drag options and detection confidence weights are named constants"
status: "in_progress"
priority: "P3"
epic: "unify-and-narrow"
horizon: "now"
order: 10
depends_on: []
---

# ARCH-65 · Merge drag options and detection confidence weights are named constants

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Code. Criterion: Readability and naming. Structure only: no behaviour change.

## Why

- `src/tools/merge/PdfMergeTool.tsx:416,446,449,451,525` passes unnamed Sortable options (`animation: 220` twice, `delay: 100`, `touchStartThreshold: 10`) and a bare `5000`.
- `src/tools/sign/fields/formCells.js:746-750` uses `0.45`, `0.1`, `0.05`, `0.7` as detection confidence weights, while detection is documented as scored and KPI-guarded.

## Outcome

- Named constants with units for the Merge options; the confidence weights in one exported table the detection corpus tests read.

## Acceptance

- [ ] No bare numeric literal remains at those lines; detection KPIs unchanged.
