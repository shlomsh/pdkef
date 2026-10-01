---
id: "FORM-29"
title: "The detector's cell, line and widget readers are type-checked"
status: "open"
priority: "P3"
epic: "form-detection"
horizon: "later"
depends_on: ["FORM-25"]
---

# FORM-29 · The detector's cell, line and widget readers are type-checked

## Why

FORM-25 put `// @ts-check` on `fieldRegions.js` and made `SourceRegions.cells` a `DetectedCell[]`. The
producers are still untyped JS that infer `kind` as `string`, so `detectFormFields.ts` narrows their
output with a cast in two places (`inkSource`, `widgetsSource`). Those casts are trusted, not checked:
a producer that assigned a kind outside `DETECTOR_FIELD_KINDS` would still compile.

## Acceptance

- `// @ts-check` on `formCells.js`, `formLines.js` and `formWidgets.js` (and `formGrid.js` if cheap),
  with `classifyKind` and the widget passthrough returning `DetectorFieldKind`.
- The two `as DetectedCell[]` casts in `detectFormFields.ts` are gone; `npm run typecheck` clean.
- `score-form.mjs --all` unchanged.
