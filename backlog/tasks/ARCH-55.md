---
id: "ARCH-55"
title: "pdfObjects.js splits into a parser, one text-state interpreter and extractors"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
order: 6
depends_on: []
---

# ARCH-55 · pdfObjects.js splits into a parser, one text-state interpreter and extractors

*Filed 2026-10-27* from the architecture and code-cleanliness audit (https://claude.ai/artifact/P5jLxma4CJSeFDkrP49UwV).
Area: Code. Criterion: Size and complexity. Structure only: no behaviour change.

## Why

- `src/editor/adapters/pdf/pdfObjects.js` is 1,335 lines, unchanged since the last review: `extractPageObjects` is 472 lines (`:864`), `walkStream` 382 (`:909`), `readFont` nests 7 deep (`:370`).
- A 34-line text-state operator switch (`Tf/Tc/Tw/Tz/TL/Ts/Tm/Td/TD/T*`) exists twice in the file (`:641`, `:1186`) and a 10-line variant in `src/tools/sign/fields/pageInk.js:136`, so PDF operator handling can drift between them.

## Outcome

- Separate modules for stream parsing, one shared text-state reducer, and object extraction; `pageInk.js` uses the shared reducer.

## Acceptance

- [ ] No file in the split is over 500 lines.
- [ ] One text-state implementation remains; existing PDF object tests pass.
