---
id: "QUAL-45"
title: "Every real survivor of the 2026-11-03 mutation probe fails a unit test"
status: "open"
priority: "P1"
epic: "robustness"
horizon: "now"
order: 1
depends_on: []
---

# QUAL-45 · Every real survivor of the 2026-11-03 mutation probe fails a unit test

*Filed 2026-11-03* from a read-only audit of all 786 unit test files (8,725 tests) at `ec0e0176`: seven area
reviews plus a hand mutation probe. This ticket holds the audit's scorecard; QUAL-46 to QUAL-50 are its other
findings.

## Why

- The probe planted 72 small bugs, three per module, in 24 modules picked at random from those with a sibling
  test (boundary flip, wrong value, deleted guard), and ran the tests that import each module directly. 51 of 70
  non-equivalent mutants were caught (73%). Scan 100%, Highlight 83%, editor and editor-ui 83%, Redact 78%,
  lib 71%, **Sign 47%**.
- Seven survivors were then re-run under `npx vitest related <file> --run`, so every test that reaches the
  module counts. Three were caught there (draftPolicy's 28 days, useElementResize's direction, the saved-file
  check's outcome), so the direct numbers understate the suite by about a third of the survivors. The four
  below survived every related test and are the reason this is P1:
  - `src/tools/redact/hooks/useSavedFileCheck.ts:97` deleting `if (!current) return;` (160 related tests green):
    a stale check writes its result over a newer export's.
  - `src/lib/pdf/openPdfDoc.ts:81` deleting `if (!isPasswordFailure(error)) throw error;` (1,040 green): a real
    parse error on the empty-password retry is swallowed.
  - `src/tools/sign/lib/flatten.js:65` dropping `- by0 * sy` (126 green): flattened annotations land at the
    wrong height when the form BBox has a y origin.
  - `src/tools/sign/lib/fields/corpus/scoring/match.js:69` reversing the sort (216 green): the scorer that guards
    field detection's KPI matches greedily from the worst pair and nothing notices.

## Outcome

- Each survivor below has a unit test that was first seen failing against the mutant, then passing on the
  real code; or it is written up here as equivalent, with the reason.

Survivors (direct-importer run; the four above also survived every related test):

- `useSavedFileCheck.ts:97` stale guard; `:106` `labels.length > 0` to `> 1`.
- `openPdfDoc.ts:81` rethrow; `:101` `if (doc.isEncrypted) return null;` (possibly near-equivalent).
- `flatten.js:65` y origin; `:63` `bx1 - bx0 > 0` to `>= 0` (no degenerate BBox case).
- `match.js:66` `>=` to `>` on the IoU threshold; `:69` sort order; `:75` the used-target `continue` (caught only
  by the scoring corpus).
- `src/tools/sign/lib/signatureImagePolicy.ts:24` `0.9 *` to `1.0 *` (the "within 90%" test passes anyway);
  `:40` the `comma < 0` guard.
- `src/tools/sign/lib/fields/corpus/snap/sampleTaps.js:63` taps below the rule instead of above.
- `src/tools/sign/lib/fields/formGrid.js:207` the `MERGE_PITCH_JITTER` clause (the postal-code case it was added
  for is not pinned).
- `src/editor-ui/highlight/highlightSwipeGesture.ts:76` `bandsBetween` arguments swapped (the test mocks the
  reader, and the real one is not symmetric).
- `src/tools/highlight/lib/zoom/inkBounds.ts:15` `<` to `<=` on `MIN_ROWS`; `:18` `floor` to `ceil` on the trim.
- `src/lib/telemetry/maintenanceTelemetry.ts:40` a NaN or negative duration bucketed as `under_1s`.
- Caught only by related tests (pin them in the sibling test too, so a narrowed local run sees them):
  `src/lib/drafts/draftPolicy.js:7` `28 *` to `27 *`; `src/editor-ui/hooks/useElementResize.js:196` swapped
  signs.

Equivalent, no action: `src/lib/drafts/sha256.ts:115` (differs only for inputs of 512 MiB or more),
`signatureImagePolicy.ts:32` `<=` to `<`.

## Acceptance

- [ ] Every survivor above is marked killed (with the test's name) or equivalent (with the reason).
- [ ] Each new test's red run against its mutant is recorded here.
- [ ] `npm run check:fast` and `npm run check:push` pass.

## How the probe was run

A detached worktree off `origin/main` with `node_modules` symlinked from the main checkout; one mutation at a
time with `sed`, `npx vitest run <importers>` or `npx vitest related <file> --run`, then revert. A planted
`throw` at the end of the module proved the worktree tests its own source. No stash, nothing in the shared
checkout.

## Audit scorecard (2026-11-03)

Seven axes, 1 to 5: real (a plausible bug fails a test), contract (behaviour over internals and source text),
mocks (fakes only at true edges), risk coverage, no duplication, maintainability, determinism.

| Area | Tests | Real | Contract | Mocks | Risk | No dup | Maint | Determ | Caught (direct) | Avg |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Editor core + editor-ui | 1,242 | 4 | 4 | 3.5 | 3.5 | 4.5 | 3.5 | 4 | 83% | 3.9 |
| Shell + lib + cross-tool | ~900 | 4 | 4 | 4 | 3.5 | 3.5 | 3.5 | 3.5 | 71% | 3.7 |
| scripts (CI guards) | 1,341 | 4 | 3 | 5 | 3 | 4 | 3 | 4 | not probed | 3.7 |
| Redact | 971 | 4 | 4 | 3.5 | 4 | 3 | 3 | 3 | 78% | 3.5 |
| Sign | 1,457 | 3.5 | 3 | 4 | 3.5 | 3 | 3 | 4 | 47% | 3.4 |
| Small tools + site | 1,510 | 4 | 3 | 4 | 3.5 | 2.5 | 3 | 4 | Scan 100% | 3.4 |
| Highlight | 893 | 4 | 3 | 3 | 3 | 3 | 3 | 4 | 83% | 3.3 |

Static counts that looked alarming and were not: 684 "bare `toHaveBeenCalled()`" are mostly
`.not.toHaveBeenCalled()`, real negative assertions; 0 files without an assertion; the one skip
(`src/tools/sign/lib/sign.test.js:662`) is the `pdftotext` guard, which CI installs. About 205 tests are one
generated static scan (`noCamelCaseSvgAttrs.test.js`).
