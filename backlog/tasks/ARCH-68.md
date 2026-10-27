---
id: "ARCH-68"
title: "JavaScript sources are type-checked one folder at a time, and no new .js lands in typed layers"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: ["ARCH-76"]
---

# ARCH-68 · JavaScript sources are type-checked one folder at a time, and no new .js lands in typed layers

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Safety nets. Criterion: Type safety. Structure only: no behaviour change.

## Why

- 138 non-test `.js` files (22.8k lines, 29%) are not type-checked; `tsc --checkJs` reports about 10.6k errors. The heaviest sit on the PDF and redaction paths: `pdfObjects.js`, `deleteObjects.js`, `documentTraces.js`, `formCells.js`.
- Only 4 files carry `@ts-check`.

## Outcome

- `checkJs` per folder starting with `src/editor/adapters/pdf`; a ratchet on `.js` file counts under `src/lib`, `src/editor`, `src/shell`.

## Acceptance

- [x] `src/editor/adapters/pdf` type-checks with no suppressions.
- [x] Adding a `.js` file under those layers fails CI.

## Done (2026-10-27)

Every non-test .js in src/editor/adapters/pdf carries // @ts-check and passes tsc with no suppressions or any-typed JSDoc (scripts/checkjs-folders.json lists the folder). scripts/check-js-typed.mjs fails on a missing @ts-check or a suppression there, and on a .js count rising under src/lib, src/editor or src/shell (jsFiles in ratchet-limits.json: 29, 29, 1). Planted cases failed first. Wired in CI and check:push.
