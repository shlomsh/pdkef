---
id: "FORM-20"
title: "A checkbox printed as a symbol-font glyph"
status: "done"
priority: "P3"
epic: "form-detection"
depends_on: ["FORM-16"]
---

# FORM-20 · A checkbox printed as a symbol-font glyph

## Why

สปส.1-10 prints its four checkboxes as Wingdings glyphs, so there is no ink square for
`findCheckboxes` to read and all four are missed (`corpus/scoring/baselines.json`, FORM-16).
`formCells.js` already recognises such glyphs as noise (`GLYPH_NOISE_RE`, "checkbox glyphs rendered
as text") and drops the cell; it never turns them into targets. Which glyph codes mean an empty box
depends on the font, so this needs the font name as well as the character.

## Acceptance

- สปส.1-10 checkbox recall up, no scored form drops, gains re-recorded.
- A unit test pins a symbol-font box glyph as a checkbox and a symbol-font bullet as nothing.

## 2026-10-01 done

`collectCheckboxGlyphs` (`pdfObjects.js`) now reads a box glyph in a symbol font by family and code:
`SYMBOL_FONT_CHECKBOX_CODES` has the Wingdings squares (0x6F, 0x71, 0xA8) and Wingdings 2's 0x2A, which is
what สปส.1-10 draws its four boxes with. That page's font is an embedded `Wingdings 2` subset whose
ToUnicode puts the glyph at U+F02A; the code is the low byte, and the glyph's outline in the embedded font
(two nested rectangles) confirmed it is an empty box rather than a table lookup taken on trust. The family
is part of the evidence, so the same code in Times, or a bullet (Wingdings 0x6C), is nothing. สปส.1-10 recall
82.6 -> 91.3, checkbox recall 0 -> 100, precision held at 100; no other scored form moved. Unit tests in
`pdfObjects.test.js` pin the box, the bullet, the wrong family, the subset-tagged name and the two-byte
ToUnicode path.
