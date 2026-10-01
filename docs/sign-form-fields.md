# How Sign finds and fills form fields

A flat PDF form has no field list, only ink: rules, boxes and teeth drawn into the page. Sign reads that
ink, decides where a person would write, and places a text box there so that "tap, type, Next" works on
a phone. This page records what the detectors find, how their answers are reconciled, how a box is placed
on each kind of field, and the live-form measurements that fixed the numbers the code comments used to
carry. The code comments keep the reasons; the measurements live here.

Detection is pure geometry behind `detectFormFields` (`src/tools/sign/fields/`), and nothing about how the
UI draws or walks a field feeds back into it (`test:detection-purity`).

## What the detectors find

- **Combs and checkboxes** (`formGrid.js`). A comb is five or more equal cells on one baseline at a
  regular pitch: an identity number, a date, a phone number. Its teeth are the seed, and a run is extended
  by one pitch at each end when real ink stands where the next wall would be, since form 101's nine-digit
  identity comb draws only eight teeth and takes its outer walls from the enclosing table. A run also has
  to stop: form 101's two date fields share a baseline and a pitch, with a table rule between them, and
  read as one sixteen-cell target without that boundary. A checkbox is an isolated near-square in the
  checkbox size band. A comb is either *open* (teeth on a rule) or *boxed* (every cell closed).
- **Closed cells** (`formCells.js`). Ruled boxes the comb detector leaves alone: a name, an address line,
  a table cell, a date or signature line. A cell is kept only when real ink closes all four sides, and
  text decides what it is (empty, or a short label hugging an edge, is an input; a block of prose is an
  explanatory box). It also reports a cell drawn around a comb, which is what reconciliation is for.
- **Widgets** (`formWidgets.js`). A form that is still fillable states its `/Tx` fields outright, and
  the widget's `/Rect` is the field. The ink detectors cannot see these at all.
- **Leaders and open lines** (`formLeaders.js`, `formLines.js`). A run of printed dots after a label (the
  Thai-form convention, FORM-19), and a bare signature or date rule with a short caption and nothing drawn
  around it. Neither re-reports ground another detector already published.

## How the detectors are reconciled

`fieldRegions.js` folds each source's regions into one set per page, from two declared lists:
`SOURCE_ORDER` (the earlier source wins a same-kind tie, so `ink` beats `widgets`) and `KIND_PRECEDENCE`
(`combs`, `checkboxes`, `cells`). A cell is the weakest thing either side reports, so a comb beats a cell
whichever source found it and claims it; keeping both would put a plain text box and a nine-cell comb on
one rectangle. `cells` is the only reclaimable kind, and `formCells.js` caps its own confidence at 0.7,
below the comb detector's 0.8, for the same reason. A source missing from `SOURCE_ORDER` is appended last
rather than dropped (ARCH-24 step C; `fieldRegions.test.js` and `corpus/thirdSourceContract.test.js`).

Two details are geometry rather than precedence:

- **The claim question is asked of the printed box.** A cell's own bounds are the strip a person writes
  in, which can be a fraction of the box it was cut from, so its `enclosure` (the ruled rectangle) is what
  claim tests compare, on both sides. Measured on the MOBI-10 source PDFs: the health form rules a box per
  yes/no question with the two captions on its top line and blank space under them. All 20 of those boxes
  contain their radio whole (containment 0.98-1.00 against the enclosure, 0.16-0.17 against the strip),
  and asking the question of the strip published every one as a second field over a radio pair the
  checkbox detector had already reported.
- **An open comb takes the bounds of the cell drawn around it** (`absorbWritable`, from its own source
  only). The teeth alone do not say how tall the field is. Form 101's identity number is 4-7pt ticks on
  the rule of a 23pt cell, the same height as the name cells beside it, and text placed on the ticks alone
  stood 5pt lower than its neighbours (live report). A boxed comb never needs this, its boxes are the field.

Within one source, combs and checkboxes do not block each other. Filtering a checkbox against the same
source's just-accepted combs was a real bug, which is why `fold` blocks only on what earlier sources
accepted.

## How a box is placed on each kind of field

A placed box is an ordinary text element. Placement (`src/editor/text/combPlacement.ts`) decides only its
span, size and position; the `left` edge is always the field's own left edge, whichever way the text
reads, because a span fixed by the paper has no growing edge to anchor.

- **Free text, no field.** A raw tap; the size is the document's carried size, or the default.
- **Plain line (open comb).** The digits' baselines sit exactly on the printed rule, since that is what a
  person writes on. When the comb sits inside a printed cell (`writable`), the box is centred in that cell
  instead, so it lines up with the cells beside it in the same row.
- **Closed box (boxed comb).** There is no writing line, so the digits belong in the middle. The *baseline*
  is centred, not the em box, and the box is then lifted by its own baseline drop, which the exporter
  subtracts back off.
- **Comb cells.** One character per cell; the box takes the run's span and `combCells`, and the font size
  is shrunk to the cell width (and, for a boxed comb, to the cap height). That shrink belongs to this
  element alone and is never written back to the document's carried size.
- **Cell.** The box takes the cell's whole span as `minWidth`, never `width`, which would make it a comb
  and snap a name to one letter per imaginary cell. The size is capped at the cell's line height. The
  box's top is the cell's middle less half the box's height, lowered by the box's bottom padding so the
  answer sits toward the writing line instead of hanging off a caption above it.
- **Where in a cell.** The cell's `writable` strip when it has one, else its bounds. A caption band's
  strip is published as the bounds themselves; a caption hugging a wall leaves the bounds the whole cell
  and names the strip beside it `writable`. On an RTL form a box with a span starts its text at the
  right edge, the wall such a caption is printed against, so the box must land on the blank. A cell
  printing only separators (form 101's `/  /` dates) is not captioned: a person writes across the marks,
  so the box takes the whole cell.

Next/Previous order (`fieldOrder.ts`) runs page, then row, then the start edge, right to left on an RTL
page. The direction comes from the page's own printed text, never the site locale. A box counts as "on" a
field by its left edge and a generous vertical band, with the nearest top breaking ties.

## Comb placement

*(To be filled from `combPlacement.ts`.)*

## The measurements behind the numbers

Everything below was measured on the scored corpus (the two MOBI-10 spike forms, itc form 101 and the
health declaration, plus `irs-1040-2024`) and is pinned by `src/tools/sign/fields/corpus/`.

**Cell bounds are the band under the caption, not the ruled box.** Form 101 rules one box per field and
prints the caption inside it, in a band above the writing line. Publishing the whole box put its bounds
about half on the caption: five of form 101's labelled cells sat on a real target at IoU 0.44-0.49, just
under the 0.5 match threshold, and scored as false positives on a field they had correctly found.
Publishing the band under the caption took those five to IoU 0.56-0.65. On page 1 that moved recall from
82.0% to 85.6%, precision from 92.7% to 96.7% and text recall from 53.3% to 70.0%, with no new miss or
false positive on either spike form.

**A side carve is not trusted as bounds.** A caption hugging the right wall is a much weaker guess at the
field's extent. It read form 101's three date cells (printed `/ /` separators a person writes across) and
two of its phone cells as labels, and each time left a 40pt sliver against the left wall. Published as
bounds, those five went from IoU 0.54-0.74 down to 0.09-0.22, turning five true positives into false ones.
So the whole cell is published as bounds, and the blank strip is published separately as `writable` for
placement only.

**Separators are not a caption.** Form 101's two lower phone cells print an area-code `/` under the
caption. Counted as caption, the slash became the caption's left edge and its bottom, the carve went
sideways, and the typed box was the sliver left of the slash (w6.72 and w5.60 of the page). On the caption
alone the carve is a band and the box takes the cell's whole width under it (w28.94 and w26.13). The three
`/ /` date cells keep the whole w12.35 span.

**`HEADER_GAP_RATIO` = 3** (measured 2026-09-25, every page of every scored PDF). A caption beside an
answer hugs one wall; a heading centred over a table's rows is set apart from both. Every RTL heading
reaches at most ratio 1.35 (itc101's "שם" column caption, pulled slightly off-centre by its short width),
and the only two RTL labels the test has to keep are itc101's phone cells at 9.08 and 13.74. 3 sits between
them with more than 2x headroom on both sides. LTR captions are screened out first by `RTL_RE` (FORM-14),
where the side carve only ever caught a heading or a table's own column caption.

**`MAX_HEIGHTS_BETWEEN` = 12.** The busiest band that closes a cell on the scored corpus spans 7.

**`MIN_TICK_CELL_WIDTH` = 6.** Form 101 rules its children table as 13 rows of 6.3pt and 8.1pt columns a
person ticks, and a floor written for free-text cells cannot see any of them (MOBI-11: 26 of that form's 43
missed fields were exactly these). The leader-line failure class the higher floor excludes never recurs at
one x down the rows, so the column, not the width, keeps the lower floor safe.

**`MIN_FLOOR_RISE_FRACTION` = 0.3** (2026-09-26, FORM-26). Form 101's private-address row prints one ruled
box with an inner underline; short ticks standing on the underline split the ~23pt writing strip into
street, number and city columns. Those three ticks reach 0.330 of the 22.7pt band (rise 7.49pt). The
tallest floor-anchored noise in the same band, short decorative strokes under a caption and the postcode
comb's own teeth, reaches at most 0.239 (rise 5.43pt). 0.3 sits above the noise and below the real ticks.
The `floorTicked` flag is tied to the coverage gate that admitted the tick: on `irs-1040-2024`, two walls
whose ink fell a point or two short of the band's top (a date line's separator, a line item's own box)
still rose past the fraction and were misread as ticks, published as spurious one-line fields with a
borrowed nearby number as their caption.

**Floor ticks divide a column only into captioned fields** (FORM-27). Form 101's children table has open
combs with 7.2pt teeth in a 21.9pt row, 0.33 of it, which read as ticks and chopped the identity and
birth-date columns into per-digit slivers. Those have no caption and were dropped, taking the printed cell
with them. So the wall column is also built, tagged `tickDivided`, and kept unless a captioned
floor-ticked column inside it survives.

**A floor-ticked column reads its caption below the floor** (FORM-26 part B). The captions on form 101's
address row (מיקוד, עיר/ישוב, מספר, רחוב/שכונה) are printed under their tick-divided columns. `headerAbove`
searched 220pt upward from there and borrowed form 101's date-of-birth label (measured 2026-09-26). The
floor-to-outer-bottom-rule gap on that row is 6.92pt (582.71 to 575.79), well inside `LONE_CAPTION_GAP`
(12pt).

**Background panels are not boxes.** Form 1040 paints its whole body as one 492x666pt fill, and its left
side at x=91.6 would otherwise split every field it crosses. Form 101's large frames are stroked, so they
keep their walls.

**Rows are scoped per column.** Rule heights are collected page-wide, but a cell's top and bottom are the
nearest rules crossing its own column. Form 101's children table is cut at y=450.42 and nearby heights by
boxes to its left, and that must not split rows it never touches. On the health declaration, a height
1.3pt inside a row (the top of a radio square beside it) closed the row's other columns short of their real
rule, so rules are tested *at* a height within `POS_TOLERANCE`. The sliver between that table's frame and
each radio square, whose right wall is the square's side, is the junction case: a rule ending against a
wall marks a smaller box beside the column. A stray height 1.2pt from a band's top once read the top rule
itself as crossing every column and dropped the whole row.

**A table's header sits above its first row.** Form 101's children table is 13 rows of about 22pt, 286pt
tall, so its last rows cannot see their own header from where they stand (FORM-03). The reach follows the
recovered stack rather than a longer fixed distance, so a page with no table pulls in no further text.

**The own-text bug from the spike.** `textInsideCell` once called `rectIntersectArea(cell, item)` directly,
but a cell is `{left, right, bottom, top}` and the area function takes `{x0, y0, x1, y1}`. The comparison
was silently `NaN` and a cell's own printed text was never found. It went unnoticed in the spike's scored
numbers because `headerAbove` still supplied most labels. A form whose blank sits on the same line as its
label was undercounted until `cellRect` bridged the two shapes.

**Fill-order and matching incidents** (`fieldOrder.ts`). Form 101 has 38 comb runs on page 1 alone, which
is why "next field" exists. Two-column forms share an edge in both directions at once: in the health
declaration fixture (`health-declaration-page1-geometry.pdf`), `combined-heuristic-0000`'s right edge is
`-0001`'s left and its bottom is `-0004`'s top, so a box placed on that point satisfies both fields' bands
and only the nearer top can choose. In MOBI-06 live QA, Next from the last cell in a row re-selected the
first cell's own box instead of creating one on the row below, because a box on one field could graze its
neighbour's band; matching is now resolved against the whole order. A boxed comb centres the baseline, so
a font whose baseline sits well below its em-box centre pulls a placed box's top above `region.top`, by an
amount no fixed constant fits for every family, which is why the vertical slack is generous and ties break
by closeness.

**Text direction and insets** (`signHelpers.js`). A direction list limited to Latin and Hebrew/Arabic left
Devanagari, Thai, Cyrillic, Greek and CJK unmatched: typing Hebrew then Devanagari left the new box
right-anchored and right-aligned with the RTL toggle lit for no visible reason, so any letter now counts
(UAX #9 first strong). Arabic Extended-A/B were missing from the RTL range, so U+08A0 read as LTR. Digits
and ID punctuation (327-69-8221, 27/05/2008) are neutral; without that they inherited the previous
element's direction and landed right-anchored after a Hebrew field. A phone number on a Hebrew form aligns
to the right of its cell like the Hebrew answers around it, while its layout direction stays LTR (live
report). Form 101's phone cell, where ten digits nearly fill the span, gets no inset: a fixed inset pushed
the last digit past the wall (live report), which is why `fieldTextInset` is capped at half the free span.
