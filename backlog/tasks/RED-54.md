---
id: "RED-54"
title: "Delete offers one show-text operation, not a whole text block"
status: "in_progress"
priority: "P1"
epic: "redact"
horizon: "now"
order: 1
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
- Vertical writing mode keeps the whole-block unit.

## Acceptance

- Unit tests, each seen failing first: a fixture shaped like the 101 row (one `BT ... ET` holding a
  ZapfDingbats `(o)Tj`, a space, the row number and the row text on two baselines) yields separate
  units for the box, the number and the row text; deleting the box leaves the number and the text at
  the same walker-computed positions; a legacy block-span deletion still removes the whole block.
- `check:fast` green.
