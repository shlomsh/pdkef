---
id: "DEBT-12"
title: "Ratchets that ratchet: a page-count-invariant duplication factor, stale-exception detection, one import scanner"
status: "open"
priority: "P3"
epic: "architecture-debt"
phase: "near-term"
depends_on: []
---

# DEBT-12 · Apply the ratchet pattern the same way everywhere

*Filed 2026-09-14*, finding 11 of
[docs/architecture-debt-review-2026-09-14.md](../../docs/architecture-debt-review-2026-09-14.md).

## Problem

`MAX_DUPLICATION_FACTOR` in `check-css-duplication.js` is shipped bytes over distinct bytes, which
grows with page count by construction; it has been raised three times and its own comment says it
must be re-based whenever a page is added, against CLAUDE.md's "ratchets only ever go down".
`check-editor-dependency-directions.mjs`'s `EXCEPTIONS` has no stale-entry failure (the boundaries
checker has one) and carries a "temporary coverage export bridge" with no expiry. The box-resize
owner check is an inline grep in `ci.yml`, absent from `check:fast`. The two import-graph guards
carry two scanners with different regexes; only the boundaries one is AST-tested.

## Scope

- Replace the factor with mean shipped bytes per page over distinct bytes (or shipped bytes over
  `pages * distinct`), re-measure on the current build, set the limit just above it, and rewrite the
  constant's comment to say why it no longer moves with page count.
- `EXCEPTIONS`: fail on an entry no import matches; either retire the `textCoverage.js ->
  registry/text.ts` bridge or give the entry an `until:` ticket id the guard prints.
- Move the `maxWidthFromRightGrowth`/`maxHeightFromBottomGrowth` single-owner grep into
  `check-editor-dependency-directions.mjs` and drop the `ci.yml` step.
- `check-editor-dependency-directions.mjs` imports `collectSourceFiles` and `importSpecifiers` from
  `check-module-boundaries.mjs` (keeping its own `layerFor` and rules); delete its copy of the scanner.

## Acceptance

- `npm run test:css` green on the current build; adding a throwaway content page moves the new factor
  by under 0.5% (measure before and after, note it in the constant's comment).
- Both guards red on a stale exception or allowlist entry; `check:fast` covers the single-owner grep.
- `src/test/moduleBoundariesImportScan.test.js` is the only scanner test, and both guards go through it.
