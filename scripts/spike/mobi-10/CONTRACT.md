# MOBI-10 spike: shared data contract

All agents read and write this shape. Do not invent a variant.

## Coordinates

`bounds` are **normalized to the page: fractions 0..1, origin top-left, y grows downward.**
- From a pdftoppm render: `x = px / imageWidth`, `y = py / imageHeight`.
- From PDF user space (pdf.js / pdf-lib, origin bottom-left, points): `x = x0 / pageWidth`,
  `y = (pageHeight - y1) / pageHeight`, width/height divided by page width/height. Page 1 of
  `itc101.pdf` is 595.275 x 841.89 pt; `health.pdf` is 595.32 x 841.92 pt. Both A4, no rotation.

## CandidateField (every source emits an array of these)

```ts
type CandidateField = {
  id: string;                 // unique within the file, e.g. "native-0007"
  pageIndex: number;          // 0-based
  bounds: { x: number; y: number; width: number; height: number }; // normalized, see above
  kind: 'text' | 'comb' | 'checkbox' | 'radio' | 'date' | 'signature' | 'select' | 'table-cell' | 'unknown';
  label?: string;             // nearest label text, verbatim, logical order Hebrew
  question?: string;          // only if traceable to the label; never invented
  options?: Array<{ label: string; value?: string }>;
  required: boolean | 'unknown';
  confidence: number;         // 0..1
  source: 'native-widget' | 'pdfjs-layout' | 'pdf-inspector' | 'llm-vision' | 'combined-heuristic';
  cells?: number;             // comb only: number of cells
  notes?: string;
};
```

A comb run is ONE candidate with `cells`, not one per cell.

## Ground truth file (`ground-truth/<form>-page1.json`)

```json
{
  "form": "itc101",
  "sha256": "<of the source PDF>",
  "sourceUrl": "<gov.il URL>",
  "pageIndex": 0,
  "pageSize": { "width": 595.275, "height": 841.89 },
  "render": { "file": "itc101-1.png", "width": 1241, "height": 1754 },
  "targets": [
    { "id": "t001", "kind": "comb", "bounds": { "x": 0.1, "y": 0.2, "width": 0.3, "height": 0.02 },
      "label": "מספר זהות", "cells": 9, "notes": "" }
  ]
}
```

`targets` use the same `kind` enum as CandidateField. One target per atomic answer location:
one per comb run, one per checkbox, one per free-text cell, one per table cell a person writes into,
one per signature area. Decorative rules and pre-printed content are not targets.

## Matching (scorer)

A candidate matches a target when: same `pageIndex`, compatible kind (see table in `score.mjs`),
IoU >= 0.5 (configurable). One-to-one, greedy by IoU. Label association is scored separately on
matched pairs: exact or normalized-whitespace containment either way counts as correct.
