---
id: "MOBI-11"
title: "A reviewable field-map stage in Sign, from the geometry detector, before any guided filling"
status: "in_progress"
priority: "P2"
epic: "mobile-round-trip"
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
- [ ] Bring the failure classes in `scripts/spike/mobi-10/report-cells.md` down with fixtures,
  and add a Latin-script flat form to the ground-truth corpus so the numbers are not Hebrew-only.
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

Remaining: the reviewable-proposal question above (design decision, not yet scoped), MOBI-06
wiring, closing the report-cells.md failure classes, and the Latin-script corpus addition.

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
not stand in for the Latin-script flat form this ticket still wants.


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
