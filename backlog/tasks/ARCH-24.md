---
id: "ARCH-24"
title: "Field detection is a capability with one entry point, not a pipeline the Sign tool assembles"
status: "open"
priority: "P2"
epic: "module-boundaries"
phase: "near-term"
depends_on: ["MOBI-11"]
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

Then the Nx question answers itself: the capability plus its corpus is a project, tools depend on it,
and `test:module-boundaries` can state the direction as a rule instead of a convention.

## Open questions

- Where it lives. `src/editor/adapters/pdf/` is the pdf-lib adapter layer and OCR is not that; a
  sibling (`src/editor/fields/`) is probably right, but that is a move of shipped files and should be
  decided against `docs/module-boundaries.md`, not by feel.
- Whether Redact should consume it too, or whether that is a second ticket.
- Whether `pageDirections` belongs in the same return value - it is text-derived, not geometry, and
  it is here only because the hook already had the text runs in hand.

## Acceptance

- [ ] One documented entry point; `useFormFieldRegions` imports it and nothing else from the detector.
- [ ] Source contract written down, async-capable, with `ink` and `widgets` implemented against it.
- [ ] Precedence declared as data, with the two current rules expressed in it and unchanged in effect.
- [ ] The corpus runs through the entry point, and its duplicated `detectPage` is gone.
- [ ] A third source can be added without touching `src/tools/sign/` - demonstrated by a stub source
      in the corpus, not asserted in prose.
- [ ] The practice form still reports 1 comb, 6 cells, 2 checkboxes, and both scored flat forms are
      unchanged.
