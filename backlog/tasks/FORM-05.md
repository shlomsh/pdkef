---
id: "FORM-05"
title: "Do the clip-path rectangles a form rules its cells with belong in the ink?"
status: "done"
priority: "P2"
epic: "form-detection"
depends_on: []
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

## 2026-10-01 done

Measured on every scored form (page-stream clip rectangles only, `re ... W n`; Form XObjects are not
walked, as in `pageInk.js`). "Would-be" is the change in detector candidates when the distinct clip
rects are fed to the cell and line detectors as a separate stroked channel (a throwaway probe, deleted;
its baseline run reproduced every recorded candidate and match count exactly). "Matches" is the change
in matched targets.

| Form (page) | Clip rects (operators / distinct) | Would-be candidates | Matches |
| --- | --- | --- | --- |
| Practice form | 0 / 0 | 0 | 0 |
| Health declaration | 1,027 / 129 | +6 | +1 (65 to 66 of 75) |
| Form 101 | 1 / 1 | +1 | 0 |
| IRS 1040 2024 | 0 / 0 | 0 | 0 |
| IRS 1040 1970 | 0 / 0 | 0 | 0 |
| Thai pnd90 (p3) | 36 / 7 | 0 | 0 |
| Thai lor-yor 01 | 593 / 11 | 0 | 0 |
| USCIS I-9 | 1 / 1 | 0 | 0 |
| Thai SSO 1-10 | 14 / 4 | 0 | 0 |
| HMRC SA100 (p6) | 1 / 1 | 0 | 0 |

On health, 14 of the 129 distinct clip rects overlap a target at IoU 0.5, yet only one new target
is matched (the e-mail text field), at a cost of 5 false positives (precision 100 to 93%); no target
was lost. Restricting to cell-sized rects (not page-sized) gives +4 candidates and no match at all. Decision: not worth it on any form we have. The rule stays as is, with the numbers recorded in
`pageInk.js`'s docstring beside it; detection is unchanged (`node scripts/score-form.mjs --all`
reports 0 changed).
