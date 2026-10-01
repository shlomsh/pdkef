---
id: "RED-16"
title: "One text reader: Delete's previews read their text from the glyph read, and the second decoder goes"
status: "open"
priority: "P3"
epic: "redact-tool"
phase: "near-term"
depends_on: []
---

# RED-16 · One text reader: Delete's previews read their text from the glyph read, and the second decoder goes

*Split from RED-12 on 2026-09-28, where it was the last bullet ("One text reader afterwards").*

Delete's previews come from our own content-stream parser, with its own partial ToUnicode decoding and
reading-order fix (`src/editor/adapters/pdf/visualOrder.js`). RED-12 now reads every glyph's Unicode
value and exact place through pdf.js (`src/editor/adapters/pdf/pageGlyphs.ts`), including Hebrew in the
page's own glyph order. Take Delete's preview text from that read and retire the second decoder.

## Acceptance

- Delete's previews read the same text pdf.js reads, Hebrew in order, with RED-13's guards still green.
- `visualOrder.js` and the parser's own ToUnicode decoding are gone, or what remains says why.

## 2026-10-01 board cleanup

- Dropped RED-12 from depends_on: RED-12 is retired (its text layer was reverted on 2026-09-28; `pageGlyphs.ts` is still the glyph read this ticket builds on).
- Priority P2 -> P3: it is a pure refactor.
