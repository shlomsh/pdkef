---
id: "RED-15"
title: "Find's boxes cover the matched glyphs exactly, from the same glyph read the export uses"
status: "in_progress"
priority: "P1"
epic: "redact"
horizon: "now"
order: 1
depends_on: []
---

# RED-15 · Find's boxes cover the matched glyphs exactly, from the same glyph read the export uses

*Filed 2026-09-28 from RED-12's spike.*

Find (RED-02) turns a match into a box by splitting a pdf.js text item's one advance with a sans-serif
measurement, then padding each cut edge by 0.35 em (`matchBoxes.ts`). Measured on the three real forms in
`spikes/red-01/` against PDFium's glyph boxes, a word's estimated edge is off by a median 0.12 em, 0.35 em
at p90 and 0.77 em at p99. Two consequences:

- **A Find box can leave a sliver of the match uncovered.** About one cut edge in ten lands further out
  than the padding, so part of a letter of the secret can stay visible in the saved picture.
- **A Find box usually reaches into the next word.** The padding is wider than a word space, so the
  neighbour's first letter is partly painted over, and RED-12's layer then rightly leaves that word out
  (a box reaches its glyph core). On the Hebrew form, boxing "לביטחון" from Find drops "המשרד" too; the
  same word boxed tightly keeps both neighbours.

`src/editor/adapters/pdf/pageGlyphs.ts` now gives every glyph's exact place. Build Find's boxes from it:
match against the page's text as today, map the match to its glyphs, and box their union with a 1 pt pad.

## Acceptance

- On the three real forms and the Hebrew line, a Find box covers every glyph of its match and no glyph
  core of a neighbouring word (a corpus test, scored against PDFium's glyph boxes like the spike did).
- Boxing a middle word from Find keeps both neighbours in the saved file's text layer.

## 2026-10-01 board cleanup

- Dropped RED-12 from depends_on: RED-12 is retired (its text layer was reverted on 2026-09-28). Note the acceptance line about keeping neighbours "in the saved file's text layer" no longer has a layer to check; the box-coverage half still stands.
