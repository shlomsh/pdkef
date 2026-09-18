---
id: "DEBT-15"
title: "Field placement: a points-based combFontSize signature, and comments that carry the why, not the incident log"
status: "open"
priority: "P3"
epic: "architecture-debt"
phase: "later"
depends_on: []
---

# DEBT-15 · combFontSize's signature, and the comment density around field placement

*Filed 2026-09-19* while landing the MOBI-06 field-placement fixes (commits `6b71e946`..`156fc40b`),
from Shlomi's read that the area "smells like high-complexity code" worth refactoring on SOLID
lines. The reconciliation of the two detectors (`fieldRegions.js`) and the pure `writableArea()` /
`confidenceOf()` split in `formCells.js` landed in that work; these two are what was deliberately
left for a change of their own.

## Problem

**1. `combFontSize(preferredSize, cellWidthPercent, pageWidthPoints, cellHeightPercent = 0, pageHeightPoints = 0)`**
(`src/editor/text/combPlacement.ts`). Five positional parameters, the last two optional as a pair,
mixing page-percent inputs with a points output, and every caller converting percent to points
inline the same way (`(x / 100) * pagePoints` appears in `combFontSize`, `cellFontSize`,
`placeTextOnCell` and `placeCombOnRegion`). The optional pair is only ever passed for a boxed comb, so
the signature encodes a caller-side decision the function cannot see. The `combFontSize` unit tests
call it positionally in nine places, which is what made changing it in-place churn.

**2. Comment density.** The files touched most in this work are between a third and a half comment
lines: `fieldOrder.ts` 51%, `combPlacement.ts` 47%, `signHelpers.js` 47%, `formCells.js` 32%. Much of
it is valuable *why* (bidi anchoring, the one-edge match in `elementIsOnField`, why a closed box
centres the baseline), but a growing share is incident narrative - "live report", "live QA on
health-declaration-page1-geometry.pdf", "MOBI-06 Next from the last field in a row looped back" -
which belongs in the commit message or a `docs/` record, not next to the line, and which goes stale
the moment the behaviour it describes is refined (the open-teeth height cap added and removed inside
one afternoon left two rounds of such prose to rewrite).

## Scope

- Replace `combFontSize`'s signature with one that takes points and an options object, e.g.
  `fitCombFont(preferredSize, { cellWidthPoints, heightPoints? })`, and give `cellFontSize` the same
  shape; add one `toPoints(percent, pagePoints)` helper (or reuse `coords.ts` if it already has the
  conversion) so the four inline conversions collapse to one. Callers in `combPlacement.ts` only;
  update `combPlacement.test.ts` to the new shape. No behaviour change - the existing tests are the
  oracle.
- One pass over `combPlacement.ts`, `fieldOrder.ts`, `formCells.js`, `fieldRegions.js` and
  `signHelpers.js` that keeps every comment stating a constraint, an invariant or a non-obvious
  reason, and moves incident narrative into `docs/sign-form-fields.md` (new, one page: what the
  detectors find, how they are reconciled, how a box is placed on each kind of field, with the
  live-form measurements that fixed the numbers). Target: no file in the set above 35% comment lines
  without a stated reason in the PR.
- Do not touch behaviour, constants or the public exports of `fieldOrder.ts` / `formCells.js` in the
  same change; if a smell there turns out to need a code change, file it separately.

## Acceptance

- `combFontSize` (or its successor) has no optional positional parameters and takes points; grep
  finds one percent-to-points conversion in `combPlacement.ts`.
- The five files' comment-line share is at or under 35% each, or the exception is named in the
  commit message; `docs/sign-form-fields.md` exists and is linked from `.claude/rules/editor.md`.
- `check:fast`, the full unit suite and `src/tools/sign/e2e/form-*.spec.js` unchanged and green.
