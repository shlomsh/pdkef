---
id: "FORM-05"
title: "Do the clip-path rectangles a form rules its cells with belong in the ink?"
status: "open"
priority: "P2"
epic: "form-understanding"
phase: "near-term"
depends_on: []
legacy_state: "Open"
---

# FORM-05 · Do the clip-path rectangles a form rules its cells with belong in the ink?

## Why

`src/editor/adapters/pdf/pageInk.js` publishes only rectangles a painting operator confirms. That
rule was measured and it was right: the health declaration issues 1,635 `re` operators of which
**1,027 are clipping paths that draw nothing**, and counting them inflated the checkbox count by
76 phantom 13.3x10.8 squares.

The 2026-09-20 research found the same decision taken the other way, deliberately, in Firecrawl's
`pdf-inspector` (MIT): it holds each `re` as pending and promotes it on a paint operator, exactly
as we do, **and then separately harvests clip-path rectangles**, with the comment that "many PDFs
define table cells as clipping paths instead of stroked rects".

Both can be true. Discarding them is right for the health form and may be losing real cell
geometry on forms that rule cells that way. Nobody has checked, and the answer is cheap.

## Scope and acceptance

- [ ] Measure first, on both evidence forms plus FORM-04's Latin form if it exists: how many
  clip-path rectangles would become candidates, and how many are real fields.
- [ ] If they are worth keeping, they are a **separate channel**, never merged into `rects`: the
  76 phantom squares are what merging costs, and `findCheckboxes` reads `rects` directly.
- [ ] A finding of "not worth it on any form we have" closes this ticket and belongs in
  `pageInk.js`'s docstring beside the rule it confirms, so the next agent does not re-open it.
