---
id: "FORM-29"
title: "The detector's cell, line and widget readers are type-checked"
status: "done"
priority: "P3"
epic: "form-detection"
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

## 2026-10-01 done

`formCells.js`, `formLines.js` and `formWidgets.js` are `// @ts-check`ed with JSDoc typedefs for
edges, rules, text points, closed cells and resolved cells; `classifyKind` and the widget passthrough
return `DetectorFieldKind`. The two `as DetectedCell[]` casts in `detectFormFields.ts` (`inkSource`,
`widgetsSource`) are gone and `npm run typecheck` is clean. No `any` was added: the few places where
a value could be undefined are narrowed with a cast to the real type, each with a one-line comment.
`formGrid.js` was left as it is (not cheap). Behaviour is unchanged: `score-form.mjs --all` reports
0 changed, 9 unchanged, and the sign unit suite passes untouched.
