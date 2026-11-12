---
id: "FORM-40"
title: "Cells: a table's header row and its row-label cells are not writing spots"
status: "done"
priority: "P2"
epic: "form-detection"
depends_on: []
---

# FORM-40 · A table's header row and its row-label cells are not writing spots

*Filed 2026-11-12 from SNG-25.* On a Google Docs table form (a kibbutz work-months declaration:
columns employer, months, count; rows of employers and printed labels such as "ביטוח לאומי - אבטלה")
the cell detector (`src/tools/sign/lib/fields/formCells.js`) offers a writing spot in:

- the empty part of each **header** cell ("שם המעסיק", "כמות");
- the leftover width of each **row-label** cell, beside the printed label, when the answers for that row
  belong in the other columns;
- a ruled blank right after text already printed on the line ("אני __שלומי שמש__________").

The empty body rows and the months and count columns are right and must stay.

SNG-25 hides these frames until Text or Date is armed, so this now shows only to someone filling, but
a tap there still places text in a header.

## Done when

- The form joins the scored corpus (`src/tools/sign/lib/fields/corpus/scoring/`) with reviewed ground
  truth, the false positives seen failing first.
- Precision on it rises with no recall drop on any other scored form (`baselines.json` only moves
  down in misses, with a stated reason).
- The detector stays a pure strategy behind the one contract (`detectFormFields`); no form-specific
  rule.

## What it was (2026-11-12)

`formCells.js` read every RTL caption hugging a cell's wall, with blank space beside it, as a field
(FORM-14). A table's header, its filled values and its row labels have exactly that shape, so the fix
is the table around them, read in one pass over the page's closed cells (`isTableContent`): a cell's
own one-line text is content, not a caption, in a row of 3 or more cells (`MIN_TABLE_COLUMNS`) once a
blank cell shares its row or sits below it in its column stack. Three limits came from the corpus:

- **Two-cell rows are out.** FORM-14's address block (a "כתובת" line beside a blank cell, over blank
  lines) and its two hugging captions over a data row are the same shape in two columns; both keep
  their fields.
- **Top-corner captions are out.** The 1040's name row (three boxes, a caption over a writing strip
  in each, one box blank) lost two correct "Last name" labels until a band carve was excluded.
- **Kinds are counted before the filter**, so a column's other cells stay `table-cell`.

Element corpus: a new row, "a table's header row, a filled row and a row label", 15 cells to 8, seen
red first. Scored corpus: btl-1500 p6 drops 4 false cells, btl-bl211 p2 drops 1, recall and every
label unchanged on all forms, both re-recorded. On the reported form (kept off the repo: it carries a
name and ID number) the three header cells, the filled row and the two label cells' leftovers are
gone; every blank cell stays.

**The underscore tail after a typed name stays.** "__שלומי שמש__________" leaves a ten-underscore
leader touching the name. Treating an underscore run that touches a word at either end as no blank
(`formLeaders.js`'s `insideWord`, today both ends) removes it, and also BL/1500 page 5's labels glued
to their blanks: recall 70.8 -> 66.7, a date field and a label lost. The text layer cannot tell a typed
answer touching a blank from a label touching one, so it is left as found; with SNG-25 it shows only
while Text or Date is armed.
