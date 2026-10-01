---
id: "RED-15"
title: "Find's boxes cover the matched glyphs exactly, from the same glyph read the export uses"
status: "in_progress"
priority: "P1"
epic: "redact-tool"
phase: "near-term"
depends_on: ["RED-12"]
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

## Result

Done 2026-10-01 on branch `red15-wave2`. Find boxes a match on the page's own glyphs.

- **How.** Matching is unchanged (`PageText`). Each text item is mapped to its glyphs by position
  (`find/itemGlyphs.ts`): the glyphs whose centres sit on the item's baseline, sorted along it, then put in
  the order the item's `str` reads in (reversed for right-to-left, numbers kept left to right, stored
  one-by-one in reading order also handled). The mapping is used only when the glyphs spell the item's text
  exactly; otherwise that item keeps the old measured estimate. A match's box is then the union of its
  glyphs per line (`find/glyphBoxes.ts`): the ink band (-0.25 to 0.9 em) plus 1 pt, drawn back from any
  neighbouring glyph core it would touch, never below the matched glyphs' own cores. The draw-back is
  needed because the forms set lines 1.04 ems apart: no fixed height both covers descenders and accents and
  stays off the lines above and below (a fixed -0.25..0.9 em band still touched a neighbouring core for 4 to 65% of words on
  these forms).
- **Wiring.** `usePageTexts.ts` reads each page's glyphs (`readGlyphs`) beside its text items, within a
  400k-glyph memory budget (later pages fall back to the estimate); `runCheck.ts` does the same so the
  check's "cover this repeat" boxes are exact too. `SearchablePage` gains optional `glyphs`;
  `matchBoxes` takes them as a last argument. `PdfRedactTool.tsx` is untouched.
- **A second fix the acceptance needed.** `textLayer.ts`'s `positionalLines` dropped a blank glyph that
  opened its line in the stream, so on the Hebrew form a 0.244 em space (just under the 0.25 em join gap)
  vanished and "לביטחון לאומי" read as one word: boxing either dropped both from `coveredTerms`. Blanks now
  join the line after the letters have made it (unit test in `textLayer.test.ts`).

Measured on page 1 of the three real forms plus the two Hebrew lines (`spikes/red-01/corpus`), every word
boxed as a one-word match, truth = the glyphs the word's text item drew (scored on the glyph read, as RED-12
scored it; PDFium itself is not installed in this tree):

| form (words) | box leaves part of a letter's core uncovered, before / after | box touches a neighbouring core, before / after | edge past the glyphs in ems, median / p90 / p99, before | after |
| --- | --- | --- | --- | --- |
| IRS 1040 (1011) | 13.2% / 0% | 50.7% / 0% | 0.13 / 0.79 / 1.44 | 0.13 / 0.14 / 0.17 |
| USCIS I-9 (601) | 24.8% / 0% | 79.7% / 0% | 0.27 / 1.01 / 2.06 | 0.14 / 0.14 / 0.14 |
| Health declaration, Hebrew (629) | 1.4% / 0% | 77.6% / 0% | 0.11 / 0.53 / 0.80 | 0.10 / 0.11 / 0.11 |
| Hebrew lines (5) | 20% / 0% | 20% / 0% | n/a | n/a |

Before, 2.5 to 17% of edges stopped short of their letters (negative overshoot, down to -2.4 em); after, no
edge is short of a core (the 25 edges under 0 sit inside a side bearing, where a neighbour's core stops
the pad). The corpus test (`find/glyphBoxes.corpus.test.js`, under 1 s) boxes every word on the five pages
and requires the cores a box reaches to be exactly its own word's letters and each wholly inside; it also
checks that all but 1% of items map to glyphs (a rotated "Form" label falls back to the estimate) and that the estimate fails the same check (so it is not vacuous). Boxing "לביטחון"
from Find now reaches only that word; "המשרד" and "לאומי" stay.
