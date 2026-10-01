---
id: "FORM-25"
title: "Detection's contract is type-checked, not only documented"
status: "done"
priority: "P2"
epic: "form-detection"
depends_on: ["ARCH-24", "FORM-23"]
---

# FORM-25 · Detection's contract is type-checked, not only documented

## Why

Review findings on FORM-23 and ARCH-24 step C (2026-09-25), carried over so both could close:

- `tsconfig.json` has `allowJs` but not `checkJs`, and no detector `.js` file has `// @ts-check`, so
  the `@typedef {import('./fieldTypes.ts').X}` lines in `formCells.js` and friends are read only when a
  TS file consumes them. `reconcile()` returns `cells: Array` (untyped), so `detectFormFields`'s
  `DetectedCell[]` return type is trusted, not checked, one hop upstream.
- `reconcile()` orders unknown sources by the caller's `sources` array (via `Promise.all` index
  order), which is correct, but no test resolves sources out of order to prove it.

## Acceptance

- [x] `// @ts-check` on `fieldRegions.js` at least (and every detector where it is cheap), with a typed
      `reconcile` return; `npm run typecheck` clean.
- [x] A test where a slow stub source resolves after a fast one, asserting output follows the
      `sources` array order.
- [x] `score-form.mjs --all` unchanged.

## 2026-10-01 done

`fieldRegions.js` is `@ts-check`ed and `reconcile` is generic over the cell type, so its return is
typed. That surfaced the one real gap: `SourceRegions.cells` was `FieldRegion[]` while
`detectFormFields` returned `DetectedCell[]`. The contract is now `DetectedCell[]`; the untyped cell,
line and widget producers are narrowed by two casts in `detectFormFields.ts`, removed by FORM-29.
`thirdSourceContract.test.js` resolves a slow and a fast stub in both array orders and asserts the
earlier source in the array wins the tie. `score-form.mjs --all`: no form changed.
