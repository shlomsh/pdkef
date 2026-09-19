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

The practice form now reports all 9 (1 comb, 6 cells, 2 checkboxes), pinned by
`formWidgets.test.js` against the shipped asset itself. The two scored spike forms are unchanged -
neither carries a widget, so `detectWidgetRegions` returns nothing on both (verified) and the
recall/precision table in `docs/mobi-10-field-map-spike.md` still stands as measured. This also
reaches any form filled once in another app and passed on, which is the same shape.

Remaining: the reviewable-proposal question above (design decision, not yet scoped), MOBI-06
wiring, closing the report-cells.md failure classes, and the Latin-script corpus addition. Two
things this step deliberately left: a widget's `/TU` tooltip and `/T` name are free, high-precision
labels (the idea harvested below) and are read by nothing yet, since no UI surfaces a label; and
`classifyKind` in `formCells.js` still recognises only Hebrew signature/date roots, so on a Latin
form a signature line arrives as an ordinary text cell - which is what the practice form wants
today, but is a guess, not a decision.

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

