---
id: "RED-76"
title: "Delete's text preview reads a page with one very long line"
status: "open"
priority: "P3"
epic: "redact"
horizon: "later"
depends_on: []
---

# RED-76 · Delete's text preview reads a page with one very long line

*Filed 2026-11-19 from LAND-04.* `src/tools/redact/lib/textLayer.ts:231` takes a line's top with
`Math.min(...glyphs)`. A single line of 200,000 glyphs overflows the call stack (`RangeError`,
reproduced through `previewTexts`). `GLYPH_BUDGET` in `useObjectPreviews.ts` counts across pages,
so one page can still carry that many. Line 70 has the same spread shape over a word.

## Outcome

- The top and bounds are found without spreading an unbounded array, and a unit test feeds one
  line past the old limit.
