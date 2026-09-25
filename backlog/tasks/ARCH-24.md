---
id: "ARCH-24"
title: "Field detection is a capability with one entry point, not a pipeline the Sign tool assembles"
status: "in_progress"
priority: "P2"
epic: "module-boundaries"
phase: "near-term"
depends_on: ["FORM-14", "FORM-21"]
---

# ARCH-24 · Field detection is a capability with one entry point, not a pipeline the Sign tool assembles

## Why

The identification rules are already pure functions over plain data - `findCombRuns(ink)`,
`detectCellCandidates(ink, geometry, pageIndex, textItems)`, `reconcileFields`, `withWidgetFields`,
`fillableTextField(entry)`, `markableButtonField(entry)`, `widgetRegions(fields, geometry,
pageIndex)` - and MOBI-11's corpus (`src/editor/adapters/pdf/corpus/`) covers them element by
element. Purity is not the gap.

The gap is the boundary. `src/tools/sign/useFormFieldRegions.ts` imports **five** detector modules
and assembles the pipeline itself: it builds the page geometry, walks the ink, runs the cell
detector, reconciles, merges the widget source, and extracts the pdf.js text runs. So the Sign tool
does not depend on *field detection*; it depends on how field detection is currently implemented.

That is what makes a new source expensive. Adding OCR, an `/Info`-and-XMP metadata pass, or a
learned detector means editing a Preact hook inside a tool - and it means every other consumer that
ever wants fields (Redact is the obvious next one) copies the same assembly. Two smaller symptoms of
the same thing are already visible: `corpus.test.js` re-implements the hook's pipeline in its own
`detectPage`, which its README flags as a drift risk, and the hook is where the pdf.js text pass
lives although text is an *input to a source*, not something a tool should know to fetch.

## Shape

One entry point, sources behind it:

```
detectFormFields(document, { textRuns, sources? }) -> { combs, cells, checkboxes, pageDirections }
```

- **The tool calls one function.** `useFormFieldRegions` keeps the hook concerns (dynamic import,
  cancellation on unmount, silent failure) and loses the pipeline.
- **A source is `(page, context) -> regions`,** registered in one list. `ink` and `widgets` are the
  two we have; `ocr` and `metadata` are the ones this exists for.
- **Async from the start.** Today both sources are synchronous; OCR will not be, and probably runs
  in a worker. A contract that is sync now is a contract that gets rewritten later.
- **Precedence is data, not code.** `withWidgetFields` currently hard-codes two rules (ink beats
  widget between equals; a comb beats a cell whichever source found it). With N sources that has to
  become a declared order plus per-source confidence, or every new source rewrites the merge.
- **The corpus tests the capability through its entry point,** which removes the duplicated
  `detectPage` and makes a source addable as corpus rows rather than as a new test harness.

Then the boundary is a folder: the capability plus its corpus sit together inside Sign, and the hook
reaches them only through the entry point. (The Nx-project framing this line first had is moot:
the tags were deleted under DEBT-14, and folders are the one definition of a boundary.)

## Decided (2026-09-25)

- **Sign is the only consumer.** Redact does not use detection at all; detection exists for form
  filling, which is Sign's. There is no second ticket for Redact.
- **So it lives in Sign, not in `src/editor/`.** Under rule 9 (ARCH-25), code with one consumer
  belongs to that consumer: the capability and its corpus move to a folder under `src/tools/sign/`
  (for example `src/tools/sign/fields/`), out of `src/editor/adapters/pdf/`. Keeping it in `editor`
  would only be using the fact that rule 9 does not look there. The "new source" acceptance below
  reads accordingly: a third source is added without touching the hook, not without touching Sign.
- **When to start.** MOBI-11 closed 2026-09-25, so it no longer blocks this. What does is the
  form-understanding epic: FORM tickets edit the same detector modules this restructures, and each
  branch in flight would have to rebase onto the new entry point. Start it in a window with no
  FORM branch open (FORM-01 was in progress when this was written).

## Open questions

- Whether `pageDirections` belongs in the same return value - it is text-derived, not geometry, and
  it is here only because the hook already had the text runs in hand.

## Lazy loading is already true, and now guarded

Measured on the built output (2026-09-20): /redact/ and /merge/ cannot reach the five detector
chunks at all, eagerly or lazily, and /sign/ reaches all five only through the dynamic `import()`
in `useFormFieldRegions.ts` - none on first paint. `npm run test:lazy-modules`
(`scripts/check-lazy-modules.js`, after `build`) walks each tool page's static-import graph and
fails if one appears; sabotage-checked with a static import from `PdfWorkspace.tsx`.

One measured cost of Step 3d's layering move: `toPagePercentBox` went from `formGrid.js` (lazy) to
`coords.ts`, which every tool loads, so Redact now carries 102 bytes of minified arithmetic it never
calls. `pdfPointToPagePercent`, which it wraps, was already in that chunk. Left as is - a private
module for ten lines would be the worse trade - but recorded rather than unnoticed.

**This ticket must not regress that.** One entry point makes it easier, not harder: the guard's list
shrinks to that entry point, and a new source inherits the protection instead of needing its own.
An OCR source in particular is the case to watch, since a wasm or worker payload dwarfs anything
here.

## The coupling already cost us one silent outage

Moving `toPagePercentBox` from `formGrid.js` to `coords.ts` left the hook still destructuring it
from `formGrid.js`. It was `undefined`, the first text run threw, and the hook's deliberately silent
`catch` reported "no fields" - **for every document, not just the demo form**. The build passed,
`astro check` passed, and all 3,264 unit tests passed, the corpus included, because the corpus calls
the detector modules directly and never goes through the hook. It was found by opening the demo form
in a browser, which is the only thing that exercises the assembly.

Three things hid it and all three are structural, not careless:

1. The import is dynamic and the modules are `.js`, so TypeScript cannot see a destructured name
   that does not exist.
2. Detection failing is silent by design, so a total failure looks exactly like a PDF with no
   detectable fields.
3. Nothing else uses this wiring. Unit tests test the functions, the corpus tests the capability;
   only a browser tests the assembly.

`useFormFieldRegions.wiring.test.ts` now checks every destructured name against the module's real
exports (sabotage-checked by reintroducing the bug). That is a patch on the symptom. **The cause is
this ticket**: the assembly exists at all, and is spelled out in a tool as untyped dynamic imports.
One entry point makes it a typed function call, and the failure mode disappears rather than being
guarded.

## Acceptance

- [x] One documented entry point; `useFormFieldRegions` imports it and nothing else from the detector.
- [x] Source contract written down, async-capable, with `ink` and `widgets` implemented against it.
- [ ] Precedence declared as data, with the two current rules expressed in it and unchanged in effect.
- [x] The corpus runs through the entry point, and its duplicated `detectPage` is gone.
- [ ] A third source can be added without touching `useFormFieldRegions` - demonstrated by a stub source
      in the corpus, not asserted in prose.
- [x] The practice form still reports 1 comb, 6 cells, 2 checkboxes, and both scored flat forms are
      unchanged.
- [x] `test:lazy-modules` still passes, with its list reduced to the new entry point alone (`pageInk`
      no longer builds as a separate chunk either - see "Step A follow-up" below).

## Step A landed (2026-09-25)

`src/editor/adapters/pdf/detectFormFields.ts` is the one entry point:
`detectFormFields(document, { textRuns, sources? }) -> Promise<{ combs, checkboxes, cells }>`, with the
`FieldSource` / `DetectionContext` / `SourceRegions` types from the adopted plan and two sources, `ink`
and `widgets`, each a thin async wrapper around today's pure functions
(`detectPageRegions`/`detectCellCandidates` for ink, `detectWidgetRegions` for widgets). Reconciliation
(`reconcileFields` then `withWidgetFields`) is called from inside the entry point, in today's order,
unchanged - turning that order into declared data is step B. `pageDirections` is no longer part of the
return value: `useFormFieldRegions.ts` computes it itself from the same text runs
(`dominantTextDirection`), since it is text-derived, not geometry.

All three callers route through it: the hook (one dynamic import of the entry point, one call; the
pdf.js text pass, the Safari `streamTextContent` workaround, and every `if (!current) return`
cancellation point all stay in the hook, since the entry point never touches pdf.js or the DOM), the
element corpus (`corpus.test.js` now calls `detectFormFields` directly; `corpus/detect.js` is deleted
and the README's mentions of it are fixed), and the scored corpus (`scoring/score.js`). The signature-
cell filter (`cell.kind !== 'signature'`) stayed in the hook rather than moving into the entry point:
it is a Sign-specific UX decision (no snap for signatures yet), not a detection rule, and moving it
into the entry point would have silently dropped a real, scored signature candidate on `itc101` -
caught only by running the proof below before committing.

The wiring test (`useFormFieldRegions.wiring.test.js`) still checks every destructured binding, now 5
instead of 8 (`pdf-lib`, `detectFormFields`, `coords`, `pageInk`, `textRuns`); sabotage-checked by
renaming the entry point's export (test failed with a clear diff, restored, green again).
`scripts/check-lazy-modules.js`'s `LAZY_ONLY` list is reduced from 5 rows to 2: `formWidgets.js`,
`formGrid.js`, `formCells.js` and `fieldRegions.js` no longer build as separate chunks at all (confirmed
on the built output - they inline into `detectFormFields`'s ~12 KB chunk, since nothing else imports
them now) and are gone from the list; `pageInk.js` stays its own row because the hook still imports it
directly, for the page geometry it needs to convert pdf.js text into the entry point's `textRuns` shape
in the *same* coordinate frame the entry point computes internally (both sides call
`createPageGeometry({ cropBox: pageCropBox(page), rotation: page.getRotation().angle })` on the same
pdf-lib page) - switching the hook to a pdfjs-derived geometry instead was considered, to get down to
one row, but rejected as an unverified coordinate-frame risk for no requirement it was needed to meet.
Sabotage-checked with a static import of the entry point from `PdfWorkspace.tsx` (multiple violations:
the entry point's own chunk, plus `pageInk` and `pdf-lib`, all went eager on `/sign/` and `/he/sign/`),
restored, green again.

Proof: `node scripts/score-form.mjs --all` exits 0, "0 changed, 10 unchanged, 0 regressed" (all ten
forms, including `itc101`'s signature candidate, held exactly); `npx vitest run src/editor/adapters/pdf
src/tools/sign` is 882 tests green; `npm run typecheck` is clean; the three detection e2e specs
(`form-grid-fill`, `form-cell-fill`, `form-field-nav-phone`) are 17/17 green against a fresh build.
`npm run check:fast` is green.

## Step A follow-up (2026-09-25)

The one remaining gap in step A: the hook still built page geometry and text runs via its own dynamic
imports of `coords.ts`, `pageInk.js` and `textRuns.js`, relying on convention that its geometry matched
the entry point's. `detectFormFields.ts` now exports `pageGeometry(page)` (what it already computed
internally, unchanged) and re-exports `toPageTextRuns`, so both the hook and `scoring/score.js` call
through the entry point instead of duplicating the computation; `useFormFieldRegions.ts` now dynamically
imports only `@cantoo/pdf-lib` and `detectFormFields.ts`. With `pageInk.js`'s only production importers
now behind that one entry point, it stops building as a chunk of its own (confirmed on the built
output), so `LAZY_ONLY` drops to one row. Sabotage-checked twice: a renamed `pageGeometry` export fails
the wiring test with a clear diff; a static import of the entry point from `PdfWorkspace.tsx` fails
`test:lazy-modules` (missing chunk, plus `pdf-lib` going eager on `/sign/`). Both restored, green again.
