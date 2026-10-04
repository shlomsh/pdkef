---
id: "RED-54"
title: "Delete offers one show-text operation, not a whole text block"
status: "done"
priority: "P1"
epic: "redact"
depends_on: []
---

# RED-54 · Delete offers one show-text operation, not a whole text block

*Found 2026-10-03 on the Israeli 101 tax form (ITC 101, 2 pages, Hebrew).* Shlomi: "pointing on the
checkmark the ui suggests deleting something much wider and i can not choose only the checkmark".

`extractPageObjects` (`src/editor/adapters/pdf/pdfObjects.js`) reports one text unit per `BT ... ET`.
The 101 form draws most of its section ח table in a single text object, so pointing at any word in it,
including the ZapfDingbats checkbox glyph `(o)Tj`, offers to delete the whole table. The unit is
whatever the producing tool chose, and for forms it is often far too wide.

## Scope

- A text unit is one show-text operation: `Tj`, `TJ`, `'` or `"`, with its operands. Its bbox is the
  union of the glyphs that one operation shows. An operation that shows no glyph is not a unit.
- Deleting one replaces its bytes with an advance-only `TJ` (`[n] TJ`, with `T*` first for `'`, and
  `aw Tw ac Tc T*` first for `"`), so text drawn later in the same text object keeps its position. The
  replacement carries no string bytes: the text is gone from the file, not hidden.
- `spliceOut` (`deleteObjects.js`) learns an optional per-range `replacement`; ranges without one
  behave as today.
- A saved Redact draft made before this change holds `start`/`end` of a whole `BT ... ET`. Export and
  preview still honour it by deleting that whole block, so no saved deletion is ever silently dropped.
- At `ET`, consecutive show ops join into one unit when they share a font resource and size, sit on one
  baseline (starting y within 0.1 x font size) and the next starts within 0.3 x font size of where the
  previous ended (plain distance, so visual-order RTL glyphs still join). A producer that writes one glyph
  per op (our own Sign export) would otherwise give one Delete target per character. A joined unit
  carries `parts` (`start`, `end`, `replacement` per op), and deleting it replaces each op while the
  `Tm`/`Td` between them stay.
- Vertical writing mode keeps the whole-block unit (an `-V` encoding name or a CMap with `/WMode 1`).
- The replacement is only as right as the glyph widths, so the walker reads the widths a viewer uses:
  the standard-14 AFM metrics when a font has no `/Widths`, `/MissingWidth` (else 0) past `LastChar`,
  and a Type3 font's `/FontMatrix`. Spans that only touch keep their own replacements, and numbers are
  written as plain decimals.
- Deleting text also empties the property dict of any enclosing `BDC` that carries `/ActualText`,
  `/Alt` or `/E`. Sign wrote every text element that way before RED-55, so without this the typed
  text stayed in the file after a delete (true of block deletes on production too).

## Acceptance

- Unit tests, each seen failing first: a fixture shaped like the 101 row (one `BT ... ET` holding a
  ZapfDingbats `(o)Tj`, a space, the row number and the row text on two baselines) yields separate
  units for the box, the number and the row text; deleting the box leaves the number and the text at
  the same walker-computed positions; a legacy block-span deletion still removes the whole block.
- `check:fast` green.

## Result

Delete offers one show-text operation, and neighbouring ops in one font on one baseline join into a
single target, so a one-glyph-per-op producer (Sign's own export) still gives words, not letters. On
the 101 form the old target was one text block covering 514 x 797 pt of the page; the checkbox is now
its own 11 x 13 pt target, apart from the row number and the row text. Deleting replaces each op with
an advance-only `TJ`; pdf.js reads zero drift on every other text item of the real form after deleting
the checkbox, or the three widest runs. The walker reads the widths a viewer uses (standard-14 AFM,
`/MissingWidth`, Type3 `/FontMatrix`, `/WMode 1` CMaps), touching cuts keep their own replacements, and
an `/ActualText`, `/Alt` or `/E` dict around deleted text is emptied, also when it opens inside the
text object. Saved block-span deletions still cut their whole block. A fresh review found the touching
spans, widths and ActualText issues; each fix started from a failing test.
