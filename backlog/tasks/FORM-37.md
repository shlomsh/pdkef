---
id: "FORM-37"
title: "BTL 1500's Wingdings checkboxes miss FORM-31's printed square"
status: "done"
priority: "P2"
epic: "form-detection"
depends_on: []
---

# FORM-37 · BTL 1500's Wingdings checkboxes miss FORM-31's printed square

## Why

FORM-36's held-out form, BL/1500 (05.2026), has 95 `❑` checkboxes on pages 2-6, set in
`BCDEEE+Wingdings-Regular`, code 0x71: the same glyph FORM-31 handles in `SYMBOL_FONT_CHECKBOX_SQUARES`
(`src/editor/adapters/pdf/pdfObjects.js`). On BL/211 the detector reports the printed square (7.4pt); here it
reports the glyph's advance by the font's ascent and descent (10.7 x 9.7pt), so every box scores IoU 0.38-0.45
and checkbox recall is 0 on four pages (`baselines.json`, `btl-1500-2026-p2..p6`). The family name parses
(`symbolFontFamily` accepts `Wingdings-Regular`), so the lookup fails later: likely the character code (a
two-byte or re-encoded font after the file passed through pdf-lib) or a path that never reaches the table.
Inferred, not verified.

## Scope and acceptance

- [x] Find where the square lookup is skipped for this file, verified with the page's own font dictionary.
- [x] Fix it generally (red test first, from a fixture of the real glyph's encoding), not by a font-name rule.
- [x] BL/1500 checkbox rows rise; BL/211 and every other row hold. Re-record the changed rows.

## Outcome

The two forms embed Wingdings the same way (Type0, Identity-H, two-byte code 0x0089), but their ToUnicode maps
differ: BL/211 maps the box to the private-use U+F071, whose low byte `symbolCode` already read as the Wingdings
code, while BL/1500 maps it to the real character U+2751, which `symbolCode` dropped for a two-byte font. The box
still passed as a checkbox through `CHECKBOX_GLYPHS`, with the advance-by-ascent box. `symbolCode` now also reads
U+274F and U+2751 as Wingdings 0x6F and 0x71 when the font's family is Wingdings, with a red-first test from that
encoding in `pdfObjects.test.js`.

| Page | Recall | Precision | Checkbox recall / precision | Labels |
| --- | --- | --- | --- | --- |
| p2 | 59.6 -> 82.7 | 43.7 -> 60.6 | 0 -> 100 / 85.7 | 83.9 -> 76.7 |
| p3 | 26.3 -> 100 | 17.9 -> 67.9 | 0 -> 100 / 100 | 80.0 -> 47.4 |
| p4 | 29.5 -> 67.9 | 18.1 -> 41.7 | 0 -> 100 / 93.8 | 60.9 -> 60.4 |
| p5 | 29.2 -> 70.8 | 28.0 -> 68.0 | 16.7 -> 100 / 100 | 71.4 -> 70.6 |
| p6 | 47.8 -> 88.1 | 28.3 -> 52.2 | 0 -> 100 / 87.1 | 78.1 -> 81.4 |

Every other corpus row, BL/211 included, is unchanged. The label rate falls only because the newly matched
checkboxes are now evaluated: a per-target comparison shows no label that was right before is wrong now (0 lost
on every page). Of the 93 new checkbox matches, 60 are labelled right; most of the rest take the item number
(". 1") or a parenthesis reversed by the RTL text layer. That is FORM-38.
