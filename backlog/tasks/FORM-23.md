---
id: "FORM-23"
title: "One typed vocabulary for field kinds and candidates"
status: "in_progress"
priority: "P2"
epic: "form-understanding"
phase: "near-term"
depends_on: ["ARCH-24", "FORM-24"]
---

# FORM-23 · One typed vocabulary for field kinds and candidates

## Why

The kind vocabulary is kept three times (`formCells.js`'s output kinds, `corpus/scoring/candidates.js`'s
`KINDS`, `match.js`'s `KIND_GROUPS`) and the region shape is described in JSDoc typedefs repeated
per file. A replacement strategy has no single type to implement, and a kind added in one list is
silently unknown to the others.

## Acceptance

- [x] One `.ts` module exporting the field-kind union and the candidate/region interface; every
      detector, the entry point and the scoring harness import it instead of re-declaring.
- [x] The three kind lists become one, or are derived from it.
- [x] No behaviour change: `score-form.mjs --all` identical, both corpora green, `npm run typecheck`
      clean.

## Landed (2026-09-25, `46e53ea`)

`src/editor/adapters/pdf/fieldTypes.ts` is the one module: `FIELD_KINDS` (the scoring contract's full
nine-kind enum, `as const`) and `FieldKind` off it; `DETECTOR_FIELD_KINDS` (the six kinds our own
detectors assign) declared `as const satisfies readonly FieldKind[]` so a typo there is a compile
error, not a silent ninth kind, and `DetectorFieldKind` off that; `PercentBox`, `FieldCandidate`,
`PageTextRun`, `DetectedCell`; and the source contract - `DetectionContext`, `SourceRegions`,
`FieldSource` - moved here from `detectFormFields.ts` and re-exported there so existing imports keep
working. `CombRegion`/`FieldRegion` are re-exported from `combPlacement.ts`, not duplicated.

Three copies became two derivations and one checked test:
- `formCells.js`'s `PercentBox`/`PageTextRun`/`FieldCandidate` JSDoc typedefs now read
  `@typedef {import('./fieldTypes.ts').X} X`.
- `corpus/scoring/candidates.js`'s `KINDS` (detector kind -> contract kind) is now
  `Object.fromEntries(DETECTOR_FIELD_KINDS.map((kind) => [kind, kind]))` - identity by construction,
  built from the one list instead of retyped.
- `corpus/scoring/match.js`'s `KIND_GROUPS` is exported and checked, not derived: a mechanical
  derivation from `FIELD_KINDS` would group `signature`/`select` (self-match-only) and `unknown`
  (its own special case in `kindsCompatible`) incorrectly. `match.test.js` asserts every grouped kind
  plus those three self-only kinds equals `FIELD_KINDS` exactly, so an added kind with no decision
  made here fails the test instead of silently matching nothing.
- `useFormFieldRegions.ts` dropped its `as Array<FieldRegion & { kind: string }>` widening cast:
  `detectFormFields`'s own return type now says `cells: DetectedCell[]`, asserting once, at the entry
  point, what every caller used to re-assert locally.

`fieldRegions.js` was read but not touched (another branch is working in it; nothing here needed a
change to it). `scripts/check-detection-purity.mjs`'s `DETECTION_MODULES` now lists `fieldTypes.ts`.

Verified: `node scripts/score-form.mjs --all` -> `0 changed, 10 unchanged, 0 regressed`;
`npx vitest run src/editor/adapters/pdf src/tools/sign` -> 47 files, 898 tests passed;
`npm run typecheck` -> 0 errors; `npm run test:detection-purity` -> 13 modules, 0 violations;
`npm run check:fast` green end to end. Not run: Playwright / `test:e2e` (out of scope for this change
per the brief).
