---
id: "ARCH-24"
title: "Field detection is a capability with one entry point, not a pipeline the Sign tool assembles"
status: "open"
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

- [ ] One documented entry point; `useFormFieldRegions` imports it and nothing else from the detector.
- [ ] Source contract written down, async-capable, with `ink` and `widgets` implemented against it.
- [ ] Precedence declared as data, with the two current rules expressed in it and unchanged in effect.
- [ ] The corpus runs through the entry point, and its duplicated `detectPage` is gone.
- [ ] A third source can be added without touching `useFormFieldRegions` - demonstrated by a stub source
      in the corpus, not asserted in prose.
- [ ] The practice form still reports 1 comb, 6 cells, 2 checkboxes, and both scored flat forms are
      unchanged.
- [ ] `test:lazy-modules` still passes, with its list reduced to the new entry point.
