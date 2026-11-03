---
id: "QUAL-49"
title: "Copy-pasted unit suites collapse into one parametrised guard each"
status: "in_progress"
priority: "P3"
epic: "robustness"
horizon: "next"
order: 4
depends_on: []
---

# QUAL-49 · Copy-pasted unit suites collapse into one parametrised guard each

*Filed 2026-11-03* from the unit-test audit recorded in QUAL-45. Roughly 100 to 150 tests (1 to 2% of the
suite) assert what another test already does.

## Why

- **Verbs.** Fourteen `*Verb.test.tsx` files repeat "hides the whole stage from assistive tech", "never carries a
  style attribute (CSP)" and "has no text" with identical bodies (for example
  `src/tools/split/verb/SplitVerb.test.tsx:22-35` and `src/tools/edit-pages/verb/RotatePagesVerb.test.tsx:19-32`).
  One `describe.each` over a glob of every verb would also cover verbs added later.
- **Page-grid tools.** Split, PDF to Image and Edit Pages each re-run the same shell behaviour ("offers Replace
  file once", "Include all, Skip all and Invert are one step each", "a skipped tile stays in place") that
  `src/lib/pages/pagePlan.test.ts`, `src/test/cross-tool/shellPageRangeField.test.tsx` and
  `src/shell/pageWorkspace/ReplaceFileLine.test.tsx` already prove. One shared page-grid contract, run per tool.
- **Rotation export.** "runs every element serializer through the same cropped transform at 0/90/180/270
  degrees" is in both `src/tools/sign/lib/sign.test.js:70` and `src/editor/export/drawElements.test.ts:34`.
- **Highlight.** `src/tools/highlight/components/HighlightPage.test.tsx` re-asserts its hooks' own tests (mouse
  drag lays a mark, touch press starts the swipe, click-mark sequences already in `clickMark.test.ts`).
- **CI workflow.** `ci-nightly-dispatch`, `ci-unit-shards`, `ci-update-cost` and `ci-single-build` each parse
  `ci.yml` for one structure; one file. `check-fast.test.mjs` and `check-push.test.mjs` both compare the same
  two step lists.
- **Smaller.** Catalogue key parity copied in Split, PDF to Image and Image to PDF (the `: SplitMessages` type
  already enforces keys; placeholder and em-dash parity are the parts worth keeping, as one shared test over
  every tool); `draftRecentIndex.test.ts` repeats `draftStore.test.js`'s pointer and cap cases;
  `dedupePrefix` asserted in three files; the Noto Sans JP and Bengali blocks in `src/editor/text/fonts.test.js`;
  the "drops a probe result that lands after a newer pick" race in three tools.

## Outcome

- Each group above is one test (or one parametrised table) in the layer that owns the behaviour, and the copies
  are gone.
- No behaviour loses coverage: before deleting a copy, the surviving test is shown failing against the fault
  the copy caught.

## Acceptance

- [ ] The test count removed and added is recorded here per group.
- [ ] `npm run check:fast` and `npm run check:push` pass.
