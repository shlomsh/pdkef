# MOBI-10: can we map a flat form into answerable fields? (spike record, 2026-09-17)

**Decision: REWORK.** Not GO: no source, alone or combined, reaches the ticket's gate (90% field
recall, 90% precision, 85% label association) on either Hebrew form. Not NO-GO: the on-device
geometry path (pdf.js text positions + the page's own vector ink) is at 70-87% recall with labels
at 83-97%, every miss has a named cause, and nothing else is in the running. The next step is a
reviewable field-map stage in the editor, not an automatic question flow. The library we set out
to evaluate, `@firecrawl/anydoc-wasm` / `pdf-inspector`, cannot contribute to this problem at all.

## Samples

Both are public Israeli government forms, digitally generated, with a text layer and no AcroForm.
Neither PDF is committed; the tooling takes `--input <path>`.

| Form | Source | sha256 | Page scored |
| --- | --- | --- | --- |
| Income-tax form 101 (2024), 2 pages | https://www.gov.il/BlobFolder/service/itc101/he/Service_Pages_Income_tax_annual-report-2024_itc101.pdf | `a5bfa867340f6569fb4e7d98e83a421e362f5c4b5ecf32037d6b51869913f8ad` | 1 (139 targets) |
| Health declaration (2021), 1 page | https://www.gov.il/BlobFolder/service/issue_firearms_license_to_a_private_individual/he/services_health-declaration-2021.pdf | `ccd0cb0257126e55192dda3c6cac822c0d3fdf785bbef9780f7e6ded94adba53` | 1 (75 targets) |

The ticket asked for a non-Hebrew form as well. It was not run: the owner chose these two forms,
and field *location* turned out not to depend on text direction (the geometry sources below never
read the text; the label step reads pdf.js text, which comes out in logical order on both forms,
0 reversed words of 124 and 361 Hebrew runs). A Latin-script form would change nothing in the
location numbers and is left for the follow-up ticket to add if it wants a third row.

## Ground truth

`scripts/spike/mobi-10/ground-truth/<form>-page1.json`: one record per atomic answer location
(a comb run is one record with `cells`, each checkbox its own, each table cell its own), bounds
normalized to the page, label in logical Hebrew. Built by two subagents from `pdftotext -bbox`
plus 300-dpi crops, then **reviewed and corrected on the main thread before any scoring**:

- Health form: the 48 grid checkboxes had been mapped onto the printed words כן / לא, not the
  empty squares beside them. Every square was verified in the 300-dpi raster (white interior,
  dark ring on four sides, 51/51) and the records snapped to it.
- Form 101: the children table was mapped as 10 rows; it has 13 (horizontal rules read from
  the raster; the image-only agent counted 13 independently). Both passport fields are 13-cell
  comb runs, not "8 cells (estimated)" and "text". Comb strips were snapped to raster-verified
  comb geometry where the agent's box was the same run at IoU >= 0.25.

Counts after review. Form 101: 62 checkbox, 30 text, 24 date, 20 comb, 3 signature. Health: 51
radio, 15 text, 6 comb, 2 date, 1 signature. Each correction is recorded per target in `notes`.

## Results (IoU >= 0.5, one-to-one greedy matching, `score.mjs`)

| Source | Form 101: recall / precision / labels | Health: recall / precision / labels |
| --- | --- | --- |
| Native AcroForm widgets | 0 found (none exist) | 0 found (none exist) |
| `@firecrawl/anydoc-wasm` 0.2.4 (`pdf-inspector` 1.14.2) | 0 found: output has no coordinates | 0 found |
| LLM vision, image only (reference, no runtime path) | 8.6% / 8.6% / 58% of 12 | 8.0% / 7.0% / 83% of 6 |
| Existing MOBI-03 detector (combs + checkboxes) | 53.2% / **100%** / n.a. | 73.3% / **100%** / n.a. |
| + geometric label association (`label.mjs`) | 53.2% / 100% / **90.5%** | 73.3% / 100% / **96.4%** |
| + ink-grid cell heuristic (`cells.mjs`), union | 69.1% / 91.4% / 83.3% | **86.7% / 94.2% / 96.9%** |
| + narrow tick columns (MOBI-11, 2026-09-20), union | **82.0% / 92.7% / 80.7%** | **86.7% / 94.2% / 96.9%** (unchanged) |
| Gate | 90 / 90 / 85 | 90 / 90 / 85 |

Numbers above are post-MOBI-11-step-1 (2026-09-17): lifting `cells.mjs` into product code
(`src/editor/adapters/pdf/formCells.js`) and writing its unit tests surfaced a real bug — a
closed cell's own printed text was never actually found (a field-name mismatch made the overlap
check silently `NaN`), so the "own text hugging an edge" path never fired and a few explanatory
boxes were never filtered. Fixing it moved precision from 89.0%/80.2% to 91.4%/94.2% at a
negligible recall cost (69.8%→69.1% on form 101; unchanged on the health form) — see
`formCells.js`'s module docstring for the fix and `git log` for the before/after scoring. The
original, pre-fix numbers are what the GO/NO-GO/REWORK decision below was made on; the decision
does not change; the older report files under `scripts/spike/mobi-10/` were not rewritten.

Per kind, union on form 101 (current numbers): comb 20/20, date 23/24, checkbox 36/62 (the 26
misses are the children table's "1"/"2" tick columns, ruled cells rather than drawn squares, plus
none of the drawn squares), signature 1/3, text 16/30 with 7 false positives. On the health form:
radio 51/51, comb 4/6 (phone and mobile are one run to the detector and area-code + number to the
form), text 10/15 with 4 false positives, date 0/2 and signature 0/1 (the physician row has no
ink around it at all).

### What each source actually is

**anydoc / pdf-inspector: cannot locate anything, by design.** For PDF input the wasm has one
output mode, Markdown. `toDocument` is documented in its own `.d.ts` as "Unsupported for `pdf`:
PDF conversion produces Markdown directly", and even the `Document`/`Block`/`Table` types it
returns for docx carry no rect, bounding box or page index. Form grids come out as GFM tables,
checkboxes as literal `√`/`o` text, blanks are dropped, and there is no page break marker even
for the 2-page form. Separately, the published package still pins `pdf-inspector` 1.14.2 (our
bump, firecrawl/anydoc#175, is open and unmerged), so 23-25% of Hebrew words come out reversed.
That is now moot for this ticket: the RTL fix would not add coordinates. Any Firecrawl feature
that does emit layout lives on the hosted API, which is out of bounds (bytes leave the device).
Full evidence: `scripts/spike/mobi-10/report-anydoc.md`.

**LLM vision: right what, wrong where.** Working from 300-dpi pixels alone, the model produced
139 candidates for 139 targets on form 101, found all 13 table rows and every section, and its
labels are good (58-83% of the few geometric matches). Its rectangles drift right and down,
median 5-12 pt, growing toward the page edge, so only 8.6% match at IoU 0.5 and 62% at IoU 0.1.
The product has no model at runtime, so this row is a ceiling on *understanding*, not a path;
it says a model could help name fields but must never place them.

**Geometry: the only viable path, and a heuristics problem.** `formGrid.js` already finds every
comb and every drawn square with zero false positives on both forms. `label.mjs` attaches the
printed label with same-baseline / column-header rules and clears the 85% gate on its own.
`cells.mjs` rebuilds closed cells from the ink grid and classifies them by the text hugging an
edge; it lifts text recall from 0 to 53-67% and dates on form 101 to 96%, at a precision cost
that is entirely explained by seven failure classes in `scripts/spike/mobi-10/report-cells.md`:
checkbox-row captions with a blank margin, instructional panels, the health form's double rules
producing a phantom row, fields with no ink at all, inline blanks mid-sentence, dotted leaders
read as many tiny cells, and an incidental mid-row rule in the children table.

## Why REWORK and not GO

The ticket's own rule: below the gate, no automatic question flow; every candidate goes through
a field-map review step before it can be asked or filled. The numbers put the geometry path
there, and the failure classes are the kind an engineer closes one at a time (row clustering,
merging leaders, dropping captions) rather than the kind that needs a new signal. What the spike
rules out is spending more time on a document-conversion library for this: the value is in our
own ink walk, which already exists.

## Follow-up ticket

MOBI-11: a reviewable field-map stage in Sign. Run the union detector on open, show the proposed
fields as editable regions with their labels, let the person delete, resize, add and re-label,
and only then feed MOBI-06's next/previous navigation. Precision at 91-94% is acceptable for a
review surface and unacceptable for a form that fills itself; recall at 69-87% means "add a
field" stays a first-class action. Bring the cell heuristic's remaining failure classes down with
unit fixtures from these two forms, and add a Latin-script form to the corpus.

**Step 1, done 2026-09-17:** `label.mjs` and `cells.mjs` are lifted into product code -
`src/editor/adapters/pdf/fieldLabels.js` (`labelFieldCandidates`) and `formCells.js`
(`detectCellCandidates`/`detectPageCellCandidates`) - in the editor's own page-percent
coordinate model (0..100, top-left, y down; the one transform `formGrid.js` already uses, see
SIGN-05/ARCH-02), with unit tests (`fieldLabels.test.js`, `formCells.test.js`, synthetic content
streams in `formGrid.test.js`'s own style). The spike's CLI scripts are now thin wrappers over
these modules (fraction <-> percent conversion only), so `score.mjs` against the committed
ground truth stays a live regression check on the product code, not a second implementation.
Verified against both real source PDFs (outside the repo) before and after: identical detection
counts to the historical spike run, confirming the port changed units, not behavior - except for
the bug fix above, found by the new unit tests. Remaining MOBI-11 work: wire this into the Sign
UI as a reviewable proposal, and close the failure classes in `report-cells.md`.

## Reproducing

```bash
cd scripts/spike/mobi-10 && npm install --no-package-lock   # @napi-rs/canvas for overlays, nested only
node scripts/spike/mobi-10/extract.mjs --input <pdf> --page 1 --out <dir>
node scripts/spike/mobi-10/label.mjs --candidates <dir>/candidates.pdfjs-layout.json --text <dir>/text-items.json --out <dir>/candidates.pdfjs-layout+labels.json
node scripts/spike/mobi-10/cells.mjs --input <pdf> --page 1 --baseline <dir>/candidates.pdfjs-layout.json --text <dir>/text-items.json --out <dir>/candidates.combined-heuristic.json
node scripts/spike/mobi-10/score.mjs --truth scripts/spike/mobi-10/ground-truth/<form>-page1.json --candidates <candidates.json> --out <report.json>
node scripts/spike/mobi-10/overlay.mjs --render <page.png> --truth <gt.json> --candidates <a.json> --out <overlay.png>
```

The anydoc runner and the LLM-vision candidate maps were dropped from the branch as negative
results; `scripts/spike/mobi-10/report-anydoc.md` keeps the anydoc evidence (versions, quoted
types, what each mode emitted). `CONTRACT.md` is the shared data shape. No root dependency was
added; nothing fills a form.

---

## Addendum, 2026-09-20 (MOBI-11): a ground-truth error, and the tick columns it hid

Two findings, from re-running this spike's own tooling against the two source PDFs (sha256 as
recorded above, so the inputs are byte-identical to the original run).

### 1. Form 101's children table was recorded one column to the right of its ruled cells

26 of form 101's 62 checkbox targets are the children table's `1 (בחזקתך)` / `2 (קצבת ילדים)`
tick columns, and all 26 were recorded at the wrong x. The page rules that table with verticals at
**x = 520.1, 530.3 and 540.5** - two 10.2pt columns. The targets were recorded at 529.4 (width
8.1) and 537.5 (width 6.3), which puts the `2` box over the *neighbouring* column and the `1` box
on blank paper past the table's last rule.

The printed column headers settle which column is which, independently of any detector: **`2` is
printed at x 522.6-527.8 and `1` at x 532.7-538.0**, so each ruled column brackets its own header
digit, centred. The targets were re-snapped to the ruled columns on that basis; row bands were not
touched, and each corrected target records the reason in its `notes`.

This is the same class of error the original review caught on the health form (48 grid checkboxes
mapped onto the printed words כן / לא rather than the empty squares beside them). It survived
because the children table's tick columns are narrow and unlabelled in the raster, and because no
detector then emitted anything in that region to contradict them.

**Anything measured against form 101's checkbox row before this date understates the detector.**
The often-quoted `checkbox 36/62` was 36 glyph checkboxes matched, with all 26 tick cells scored as
misses no matter where a detector put them.

### 2. `formCells.js` could not see a tick column at all

Independently of the above, the cell detector dropped every cell narrower than `MIN_CELL_WIDTH`
(15pt), a floor written for free-text cells. Form 101's tick columns are 10.2pt, so all 26 were
invisible to it, and `writableArea`'s 25pt blank-strip minimum would have dropped them again.

The fix is not a lower floor on its own, which would admit every dotted-leader gap (failure class
6 below). **A narrow ruled cell is a field when it is empty and its column repeats down the table**
- a tick column recurs at one x across every row, while the gaps between a leader line's dashes
land at a different x on each one. `MIN_TICK_CELL_WIDTH` (6pt) and `MIN_TICK_COLUMN_ROWS` (3)
carry that rule; such a cell is classified `checkbox` and takes its label from the column header.

Measured on form 101, union, IoU >= 0.5, against the corrected ground truth:

| | recall | precision | labels |
| --- | --- | --- | --- |
| before | 69.1% | 91.4% | 83.3% |
| after | **82.0%** | **92.7%** | 80.7% |

Checkbox alone goes 58.1% -> **87.1% recall at 100% precision**: every candidate the change adds is
a real tick cell. The health form is byte-identical before and after (86.7 / 94.2 / 96.9) - it
rules no narrow columns. Label association falls 2.6 points because the 18 new candidates take
their label from a column header up to 13 rows above, and `HEADER_SEARCH_HEIGHT` (220pt) does not
reach the bottom of a 286pt table.

### What is left on form 101, and what it would take

25 misses: text 14, checkbox 8, signature 2, date 1. The 8 checkbox misses are 4 table rows split
by an incidental mid-row rule (failure class 7), not a new class. Reaching the 90% gate needs
**11 more**, and `text` at 53.3% recall / 36.4% precision is now the only place they can come
from - the same caption-versus-field problem failure class 1 names. The gate is no longer blocked
on geometry the detector cannot see; it is blocked on telling a caption from a field.

### Where this work lives now

Re-filed 2026-09-20 into its own epic, **`form-understanding`** ("read what a form asks, ask the
person, fill it back"), because it had outgrown `mobile-round-trip`. This record stays the evidence
base for all of it. MOBI-11 (the review surface) moved with it; MOBI-10 stays where it was decided.

| | |
| --- | --- |
| FORM-01 | caption versus field, the only class left with room to reach the 90% gate |
| FORM-02 | canonical field types, the missing link between a field map and a question |
| FORM-03 | a column header the last row of a tall table can still reach |
| FORM-04 | a Latin-script form in the corpus, so the numbers are not Hebrew-only |
| FORM-05 | whether clip-path rectangles belong in the ink |
| FORM-06 | spike: measure Tesseract `heb` before building any scanned path |
| FORM-07 | a scanned form's ruled geometry, from its raster |
| FORM-08 | re-evaluate `pdf-inspector`, whose MIT crate now has a positioned API |
| FORM-09 | ask the person, and fill only what they confirm |
