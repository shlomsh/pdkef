---
id: "MOBI-11"
title: "A reviewable field-map stage in Sign, from the geometry detector, before any guided filling"
status: "in_progress"
priority: "P2"
epic: "form-understanding"
phase: "near-term"
depends_on: ["MOBI-10"]
legacy_state: "In Progress"
---

# MOBI-11 · A reviewable field-map stage in Sign, from the geometry detector, before any guided filling

## Why

MOBI-10's spike ([docs/mobi-10-field-map-spike.md](../../docs/mobi-10-field-map-spike.md)) put the
on-device geometry path at 70-87% field recall, 80-89% precision and 83-97% label association on
two Hebrew government forms, under the 90/90/85 gate for an automatic question flow but well
inside what a person can review and fix. It also ruled out the alternatives: anydoc / pdf-inspector
emits no coordinates for PDF, and a vision model names fields well but places them badly and is
not available at runtime anyway.

## Scope and acceptance

- [x] On opening a PDF with no AcroForm in Sign, run the union detector (`formGrid.js` combs and
  checkboxes, `label.mjs` labels, `cells.mjs` cells, lifted out of `scripts/spike/mobi-10/` into
  `src/editor/adapters/pdf/` with unit fixtures from both spike forms) and offer the result as a
  proposed field map, never as filled content. *Lifted 2026-09-17* — the union detector is
  product code now (`fieldLabels.js`, `formCells.js`, both unit-tested).
- [ ] **Wired 2026-09-17, but not as a review layer** — see "Step 2" below for why. The person
  never sees a proposal to delete/resize/relabel; nothing is written until they tap and type, same
  as every other tool. "Add a field" was already a first-class action (drag a text box by hand) and
  stays exactly that.
- [ ] Each proposal carries its label and kind; a low-confidence proposal is visibly tentative.
- [ ] MOBI-06's next/previous navigation consumes the reviewed map, not the raw detector output.
- [ ] **Split out 2026-09-20**, so this ticket can close on the review surface alone: the
  remaining failure classes are FORM-01 (caption versus field, the only class left with room to
  reach the gate), the label reach on a tall table is FORM-03, and the Latin-script form is
  FORM-04. The tick-column class was closed here; see Step 3.
- [x] Re-score with `score.mjs` against the reviewed ground truth; the numbers go in the spike record.

## Progress

**Step 1, done 2026-09-17 (`src/editor/adapters/pdf/fieldLabels.js`, `formCells.js`, both with
unit tests):** the two spike algorithms are product code, in the editor's page-percent
coordinate model rather than the spike's own 0..1-fraction contract (SIGN-05/ARCH-02: one
transform, not two). The spike's CLI scripts (`label.mjs`, `cells.mjs`) are now thin wrappers
over these modules, so `score.mjs` scoring against the committed ground truth is a live
regression check on the product code.

Writing `formCells.test.js` found a real bug in the ported algorithm (inherited from the spike):
a closed cell's own printed text was never actually detected, because the cell's field names
(`left/right/bottom/top`) didn't match what the overlap check expected (`x0/y0/x1/y1`) - the
comparison was silently `NaN`. Fixed (`cellRect()` in `formCells.js`). Effect on the union
numbers, verified against both real source PDFs (kept outside the repo): form 101 recall/
precision 69.8%/89.0% → 69.1%/91.4%; health 86.7%/80.2% → 86.7%/94.2%. Label association and the
overall REWORK decision are unchanged. Detail and the updated top-line table: `docs/
mobi-10-field-map-spike.md`; the older per-run numbers in `scripts/spike/mobi-10/report-cells.md`
carry a dated addendum rather than being rewritten.

**Step 2, done 2026-09-17 (`useFormFieldRegions.ts`, `useWorkspaceGestures.ts`,
`combPlacement.ts`, `FormFieldHints.tsx`, `PdfWorkspace.tsx`, `PdfSignTool.tsx`):** wired
`formCells.js`'s free-text cells into Sign, but as an extension of MOBI-03/04's already-shipped
pattern, not the "reviewable proposal, delete/resize/add/relabel" layer this ticket originally
described.

Why the deviation: MOBI-03/04 already ships a working answer to the same question, for combs and
checkboxes - a faint outline hint shown only while the matching tool is armed, and a tap near it
snaps the ordinary text-tool/symbol-tool placement to the detected region. No separate "proposal"
state, no accept/reject step; the detected region just makes the existing one-shot tool land in
the right place. Free-text cells now get the same treatment: while the text or date tool is
armed, a solid-bordered hint shows over every detected cell (`FormFieldHints`, new `cell` kind),
and a tap anywhere near one centres the placed text box on the cell instead of the raw tap point
(`combPlacement.ts`'s new `cellRegionAt`/`cellAnchorPoint`). Deliberately narrower than a comb
snap: it only ever moves `left`/`top`, never sets `width` - `comb.js`'s `isComb` is derived from
`width` alone, so giving an ordinary field an explicit width would silently turn it into a
one-character-per-cell comb the moment someone typed a second letter. A "propose, then review and
edit the proposal" layer is a materially bigger, different UI than anything in this editor today
(every tool here is one-shot per the arming-model invariants in `.claude/rules/editor.md`), and
building one wasn't re-litigated against that invariant before starting, so it didn't ship today.
Whether this editor should ever grow that second interaction model, instead of extending the
snap-on-tap pattern further, is now an open design question rather than a decision.

Text extraction reuses the same `pdfjs` document `PdfWorkspace` already renders pages from
(`pdfDocument`, passed into the hook), rather than parsing the file a third time; ink/geometry for
cell detection is a second, independent walk from `detectPageRegions`'s own internal one, kept
separate rather than refactored out of a shipped, tested feature. Per Shlomi's steer: the date
tool places an ordinary text element under the hood and now gets the exact same comb and cell
snap as the text tool throughout (it previously only got neither). Signature-kind cells are
detected but filtered out before reaching the UI - signature placement is a different creation
mode (a saved-signature dialog, not a point tap) and wiring it in is a separate piece of work.
`labelFieldCandidates` (the dedicated label-association pass) is not called in this wiring; each
cell still carries whatever label `formCells.js`'s own header/own-text lookup found, but nothing
in the UI surfaces it yet - the hint layer stays purely visual, `aria-hidden`, matching the
existing comb/checkbox hints exactly.

**Step 3, done 2026-09-19 (`pdfObjects.js`, `formGrid.js`, `fieldRegions.js`,
`useFormFieldRegions.ts`, `formWidgets.test.js`):** the detector was blind to its own demo form.
Opening the bundled practice form in Sign - the file the home page offers on a first visit, and
the one the hero demo tells the story of - surfaced 3 of its 9 fields: the student-ID comb and
the two checkboxes. The six free-text fields (student name, parent/guardian, emergency contact,
allergies, signature line, date) showed no hint at all.

Cause, not a threshold to loosen: every source feeding the detector reads the page's own content
stream, and the practice form is a *live AcroForm*, not a flat one. `scripts/generate-practice-
form.mjs` builds each field with `form.createTextField(...).addToPage(...)`, so pdf-lib paints
that box inside the widget's `/AP /N` appearance stream - a separate object graph the page stream
never invokes. `collectPageInk`'s docstring already scopes out even Form XObjects reached by `Do`;
an annotation appearance is further out still. The ink walk was right to find nothing: at those
coordinates the page really does draw nothing. The three fields that did work each worked by
accident - the generator also paints nine guide boxes for the comb straight into the page stream,
and `collectCheckboxWidgets` was already reading `/Btn` rects off `/Annots`.

So the fix is the `/Tx` counterpart of the `/Btn` reader that already existed:
`collectTextFieldWidgets` (`pdfObjects.js`) walks `/Annots` for text-field widgets and returns
each `/Rect`, skipping hidden, no-view and read-only ones; `detectWidgetRegions` (`formGrid.js`)
puts them in page percentages, a comb widget (comb flag plus `/MaxLen`) becoming a `boxed` comb of
that many cells; `withWidgetFields` (`fieldRegions.js`) folds them into what the ink pass
reconciled, ink winning every overlap. Both halves were needed: `/FT`, `/Ff`, `/T` and `/MaxLen`
all sit on the parent field dict on a pdf-lib-generated form, so reading the widget alone finds
nothing, and the comb arrives from both sources at once and must be reported once.

Review (fresh subagent, zero shared context) found one real bug in the first cut: a widget comb
overlapping a region the ink pass had reported as a plain cell was added without the cell being
removed, leaving two snap targets on one rectangle. It never fired on the practice form - the ink
comb detector classifies that field as a comb too, so the comb-vs-comb branch caught it - but it
is reachable on any form whose teeth the ink heuristics miss while `detectCellCandidates` still
finds the box. Fixed by applying `reconcileFields`'s own precedence rather than the blanket "ink
wins" the first cut claimed: between equals ink wins, but **a comb beats a cell whichever source
found it**, because a cell is the weakest thing either side reports. Regression test included, and
verified to fail without the fix. The same review also added rotation and shifted-crop-box
coverage for the widget path (the practice form is unrotated at the origin, so nothing else
exercised that transform) and isolated two mutation tests behind a per-test reload.

The practice form now reports all 9 (1 comb, 6 cells, 2 checkboxes), pinned by
`formWidgets.test.js` against the shipped asset itself. The two scored spike forms are unchanged -
neither carries a widget, so `detectWidgetRegions` returns nothing on both (verified) and the
recall/precision table in `docs/mobi-10-field-map-spike.md` still stands as measured. This also
reaches any form filled once in another app and passed on, which is the same shape.

**Step 3b, done 2026-09-19 (`formWidgets.js` is new; `pdfObjects.js`, `formGrid.js`,
`useFormFieldRegions.ts`):** the widget path is now a pure core with a thin pdf-lib reader around
it, in one module of its own. `fillableTextField(entry)` is the whole of the flag arithmetic and
`widgetRegions(fields, geometry, pageIndex)` is the whole of the classification and transform;
neither touches a PDF object, so every edge case is a plain object in a test rather than a PDF
someone has to build. `pdfObjects.js` keeps only the reading (`widgetEntries` pulls the five
values a widget states about itself; `pageWidgets` and `inheritedEntry` are now exported and
shared with the `/Btn` collector) and decides nothing.

`detectWidgetRegions` moved out of `formGrid.js` with the rest, which is what keeps the import
graph acyclic: `toPagePercentBox` lives in `formGrid.js` rather than in `coords.ts` where a pure
coordinate transform belongs, so anything importing it cannot also be imported by it. That
inversion is pre-existing and was left alone here; moving `toPagePercentBox` to `coords.ts` (two
real consumers, `formCells.js` and the Sign hook) would let the widget module stand free of the
ink detector entirely, and is worth doing on its own.

47 unit tests, of which 31 are on the pure halves. Each guard was mutation-checked rather than
assumed: dropping the read-only check fails 3, dropping hidden/no-view fails 4, moving the comb
flag one bit fails 4, accepting `/MaxLen` 1 as a run fails 1, forgetting the `MAX_COMB_CELLS` cap
fails 1. Behaviour is unchanged - the practice form still reports 1 comb, 6 cells, 2 checkboxes,
in the detector and in a browser.

**Step 3c, done 2026-09-19 (`src/editor/adapters/pdf/corpus/`, new Nx project `form-corpus`):**
the detector now has a corpus - one row per form element, each built into a real PDF and run
through the whole pipeline, so adding an element is a row rather than a test body and the elements
already there keep proving themselves while the detector is refactored. 65 tests over 27 elements
in five groups: live AcroForm widgets (text, comb, multiline, required, read-only, hidden,
no-view, checkbox, radio, push button, dropdown, signature), printed ink (comb teeth, boxed combs,
painted squares, ruled rows, panels, clipping paths), hybrids where both sources describe one
field, page geometry (rotation, a crop box off the origin, page indices across two pages), and the
known gaps. A third of the rows pin things that must *not* be detected, which is what catches a
change making the detector greedier. `README.md` in the package holds the paradigm.

Specs, not committed `.pdf` files: a binary fixture is opaque in review and has to be regenerated
by hand when the vocabulary grows. The three real documents (our practice form and the two scored
flat forms) run alongside, and the corpus asserts directly that both flat forms carry no widget -
which is what lets this ticket's recall/precision table stand unchanged.

Writing it found three things. **A push button was reported as a checkbox** (`/Btn` covers push
buttons, and `collectCheckboxWidgets` filtered on `/FT` alone), so the Symbol tool offered a
checkmark over a Submit or Print control - fixed by excluding `/Ff` bit 17. Two were in the corpus
itself and are worth recording because both would have been silent: a default field name derived
from the rectangle collides across pages, which is the most natural multi-page case there is; and
an "every region is inside the page" guard was wrong, because pdf-lib insets a bordered field by
half its border width, so a field can legitimately poke past a crop box - the guard now asserts a
region *intersects* the page, which is the real invariant.

Two limits are pinned as `known gap` rows rather than left to be rediscovered: a checkbox square
stroked as a path is never a checkbox candidate (`findCheckboxes` reads `ink.rects`, and pdf-lib
never emits `re` - this is the miss behind "none of the drawn squares" on form 101), and a real
`/Sig` field is invisible because signature placement is a different creation mode.

**Step 3d, done 2026-09-19 (`formWidgets.js`, `pdfObjects.js`, `formGrid.js`, `coords.ts`,
`formCells.js`, corpus):** the visibility rules only ever applied to half the widgets. Shlomi caught
that the checkboxes were never mentioned: `fillableTextField` skipped hidden, no-view and read-only
`/Tx` widgets, while `collectCheckboxWidgets` read `/Btn` rects straight off `/Annots` with none of
those checks - so a hidden checkbox, a no-view checkbox, a read-only checkbox and every option of a
hidden radio group all stayed mark targets. Verified before fixing; the corpus had a row for each
flag on a text field and none on a checkbox, which is exactly why it did not catch it.

Both kinds now answer through one pure function, `visibleWritableRect`, with `fillableTextField`
and the new `markableButtonField` adding only what is specific to their own field type (comb runs;
excluding push buttons). Paired corpus rows for every flag against both kinds keep them in step, and
the README says to add the full set when a field kind is added.

This needed the layering fix Step 3b had flagged: `collectCheckboxWidgets` had to move next to the
decision it now shares, but `formGrid.js` consumes it, so `formWidgets.js` could not keep importing
`toPagePercentBox` from `formGrid.js`. `toPagePercentBox` moved to `coords.ts`, beside the
`pdfPointToPagePercent` it wraps and where a pure coordinate transform belongs (two consumers
updated: `formCells.js` and the Sign hook). The import graph is acyclic without the widget module
having to own things that are not its own.

Remaining: the reviewable-proposal question above (design decision, not yet scoped) and MOBI-06
wiring; closing the report-cells.md failure classes and the Latin-script corpus addition moved to
FORM-01, FORM-03 and FORM-04 (see "Split out 2026-09-20" above). Two things this step deliberately
left: a widget's `/TU` tooltip and `/T` name are free, high-precision
labels (the idea harvested below) and are read by nothing yet, since no UI surfaces a label; and
`classifyKind` in `formCells.js` still recognises only Hebrew signature/date roots, so on a Latin
form a signature line arrives as an ordinary text cell - which is what the practice form wants
today, but is a guess, not a decision.

**Step 4, done 2026-09-22 (`pdfObjects.js`, `formWidgets.js`, `useFormFieldRegions.ts`,
`formWidgets.test.js`, `baselines.json`, `generate-practice-form-truth.mjs`):** closed the second
half of that guess, for the widget path. Our own practice form's `parent_guardian_signature` and
`signature_date` fields were showing the person a generic "double-click to edit" text prompt over
the signature line (reported live, from the shipped Sign tool). Not a form-content problem - the
field's own `/T` name already says "signature" - but `formWidgets.js` never read `/T` at all, so
every non-comb `/Tx` widget reported `kind: 'text'` regardless of its name, same as `classifyKind`'s
Hebrew-only gap but on the side that reads no page ink to begin with. `widgetEntries` now decodes
`/T` and `fillableTextField` classifies it (`classifyTextFieldKind`: `/date$/i` before `/signature/i`,
same order and reason as `generate-practice-form-truth.mjs`'s own `kindOf`, which the two now stay
in step with). Existing behaviour is unchanged everywhere else: `useFormFieldRegions.ts` already
dropped `kind: 'signature'` cells before offering them (signature snap still isn't wired, per Step
3's note above), so the practice form's signature line simply stops being mis-offered as text - it
now offers nothing there until MOBI-06/the reviewable-proposal work above wires a real signature
affordance in. Corpus effect verified with `score.mjs`: `pdkef-practice-form` was the one form whose
truth already expected `signature`/`date` kinds from the widgets and scored a real miss for it
(88.9%/88.9%, `signature: 0` in `byKind`); it now scores 100%/100% and `baselines.json` is
re-recorded per its own ratchet rule. No other scored form's `/Tx` field names match `/signature/i`
or `/date$/i` (checked `irs-1040-2024`, the only other AcroForm among the five - `health`, `itc101`
and `irs-1040-1970` carry no AcroForm at all), so nothing else moved.

## Ideas harvested from the parallel spike branch (deleted 2026-09-17)

A second session ran the same spike on `claude/mobi-10-research-15aa19` with similar tools and,
by its owner's account, similar results; it recorded no scores, so nothing quantitative survives.
Two design ideas from its code are worth keeping, unverified:

- **Read AcroForm `/TU` tooltips as labels** when a form does carry widgets (widget-level `/TU`
  over field-level, then the field name), plus `MaxLen` and the comb flag. Free, high-precision
  labels for hybrid or partially fillable forms; both spike forms had no widgets, so the landed
  `extract.mjs` never needed it.
- **Group a row or column of checkboxes into one radio question** with a shared label found
  above or beside the group, leaving ungroupable checkboxes as they are. A checkbox row is usually
  one question with N options, which is what a review surface should show.

It also tried merging dotted-leader segments closer than 6 pt into one span before treating them
as a blank line, aimed at failure class 2 in `scripts/spike/mobi-10/report-cells.md`; untested.
Its W-9 ground truth was mostly the form's own AcroForm field list (20 of 22 targets), so it does
not stand in for the Latin-script flat form FORM-04 now wants.


**Step 3, 2026-09-20 - the tick columns, and the ground-truth error under them.** Re-ran the
MOBI-10 tooling against both source PDFs (sha256 unchanged) and found form 101's 26 children-table
tick targets recorded one column right of their ruled cells; the printed column headers (`2` at
x 522.6-527.8, `1` at x 532.7-538.0) fix which ruled column is which, and the targets were
re-snapped on that basis, row bands untouched, each carrying its reason in `notes`. Separately,
`formCells.js`'s 15pt width floor made every 10.2pt tick column invisible: `MIN_TICK_CELL_WIDTH`
(6pt) plus `MIN_TICK_COLUMN_ROWS` (3) now admit a narrow *empty* cell whose column repeats down the
table, classified `checkbox`, which is the rule that keeps dotted-leader gaps out (they never recur
at one x). Form 101 union goes **69.1/91.4/83.3 -> 82.0/92.7/80.7**, checkbox alone 58.1% -> 87.1%
recall at 100% precision; the health form is unchanged. Record and remaining-miss breakdown in the
[spike addendum](../../docs/mobi-10-field-map-spike.md).

**The gate is now a `text`-recall problem, not a geometry one.** 11 more fields on form 101 reach
90%, and `text` (53.3% recall, 36.4% precision) is the only class with room - failure class 1, a
caption beside a checkbox versus a real field. Two things worth their own tickets rather than this
one: `HEADER_SEARCH_HEIGHT` (220pt) does not reach the bottom of a 286pt table, which is why label
association fell 2.6 points; and `pageInk.js` discards clip-path rectangles (`re W n`) entirely,
which is right for the health form's 76 phantom squares but may be discarding real table-cell
geometry on forms that rule cells as clip paths.

**Re-filed 2026-09-20** from `mobile-round-trip` into `form-understanding`, which was opened for
this work: reading a flat form well enough to ask a person what it wants outgrew the epic holding
it. MOBI-10 stays where it was decided, per the re-filing convention in `scripts/backlog-epics.mjs`.
What is left here is the review surface itself, the acceptance items above it that are still open;
the detector accuracy work it used to carry is FORM-01, FORM-03 and FORM-04, and the semantic layer
that consumes this map is FORM-02.
