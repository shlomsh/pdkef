---
id: "FORM-31"
title: "A Wingdings checkbox is the square a person sees, not the font's line box"
status: "done"
priority: "P2"
epic: "form-detection"
depends_on: ["FORM-30"]
---

# FORM-31 · A Wingdings checkbox is the square a person sees, not the font's line box

## Why

FORM-30's overlays showed every BL/211 checkbox region offset from its printed square: 12.6 x 9.7pt
around a 10.1pt glyph, 2.2pt too high and 1pt too far left. A tick placed in it lands off-centre, and
every match scored an IoU of 0.50 to 0.51 against the 0.5 bar, so recall on those boxes was one small
shift from collapsing (it did on five boxes of the employer page). SNG-09 fixed this for Zapf Dingbats
on form 101 and recorded that "other checkbox glyphs keep the advance-by-ascent box".

## What changed

- `pdfObjects.js`: `SYMBOL_FONT_CHECKBOX_SQUARES` gives Wingdings 0x6F and 0x71 their inner (hole)
  square and Wingdings 2 0x2A its outer ring edge, read from the glyphs embedded in BL/211 and Thai
  SSO and cross-checked against Wingdings.ttf. 0xA8 is one contour with no hole, so it keeps the line
  box, pinned by a test.
- Guards: unit tests in `pdfObjects.test.js` (one and two-byte fonts, Tm/Tz/Ts), and
  `corpus/wingdingsCheckboxSquare.test.js`, which runs the real detector on BL/211 and Thai SSO and
  checks every glyph against the embedded font's contour placed by pdf.js, within 0.1pt. Both were red
  first.
- Truth: the checkbox boxes of BL/211 (both pages) and Thai SSO are snapped to the printed square, the
  FORM-26 / SNG-09 precedent. Sizes and positions only.

## Result

| Form | Before | After |
| --- | --- | --- |
| BL/211 p7 | recall 39.5%, precision 75.6%, checkbox 24 of 29 | 45.3%, 86.7%, checkbox 29 of 29 |
| BL/211 p2 | 64.5%, 30.1% | unchanged |
| every other scored form | | unchanged, 0 regressed |

Label association on p7 went 94.1 to 92.3: the five newly matched boxes are graded now, and the yes/no
box t029 reads "לא," where the truth wants the question too. That is a label gap, not this ticket's.
