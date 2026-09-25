---
id: "FORM-25"
title: "Detection's contract is type-checked, not only documented"
status: "open"
priority: "P2"
epic: "form-understanding"
phase: "near-term"
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

- [ ] `// @ts-check` on `fieldRegions.js` at least (and every detector where it is cheap), with a typed
      `reconcile` return; `npm run typecheck` clean.
- [ ] A test where a slow stub source resolves after a fast one, asserting output follows the
      `sources` array order.
- [ ] `score-form.mjs --all` unchanged.
