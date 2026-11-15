---
id: "SCAN-75"
title: "Corners sit on the paper: edge following for the first guess and for the person's fix"
status: "in_progress"
priority: "P1"
epic: "scan-next"
horizon: "now"
depends_on: ["SCAN-71"]
---

# SCAN-75 · Corners sit on the paper: edge following

*Opened 2026-11-15.* Scored against 22 hand-traced book pages (`scripts/scan-corpus/book-pages/labels.json`; the page
images are private), Scan's first corners are far from the paper: the PDF path's worst corner is a median 8.8% of the
picture away, and no page is within 3.5%. Flattening depends on the corners by design, so the corners come first.

Shlomi's two aims (2026-11-15), since scans come in many shapes and a person's fix is always needed:

1. Automatic corners as close to the real ones as possible, most of all in good light on a contrasting background.
2. An excellent experience when correcting the border: sides that follow the paper, pins, zoom, undo and redo.

## Outcome

One pure edge-following core serves both. Given rough corners, each side slides onto the paper's edge and the corners
are where the followed sides meet. The detector uses it to pull its first guess onto the paper; the corner editor uses
it so a side follows the paper when a person moves a corner. The person's manual controls all stay.

## Acceptance

- [x] `followEdges` is a pure module with unit tests, scored on the 22 pages through the repo's own code.
- [x] The PDF path's first corners use it; the 22-page numbers before and after are in this ticket.
- [x] Photo inspection and the camera's accepted shot use it, or the ticket says with numbers why not. (As a repair
      only; the numbers are below.)
- [x] The corner editor: four corners and straight lines by default; with Fine-tune edges on, the page's traced border
      is drawn and a point can be pinned by dragging it. Every change (corners, pins, the switch, Whole photo,
      Auto-detect) can be undone and redone.
- [x] The traced border and its pins reach the flattening only for a page in Fine-tune edges; the choice is kept in the
      on-device draft and is part of the processed-page key.
- [x] Zoom in the corner editor.
- [x] E2E for the trace and a pin drag in a real browser (`e2e/corner-pin.spec.js`).
- [ ] Checked on a real phone.

## Built, 2026-11-15

`src/tools/scan/lib/edges/follow.ts`, pure, in the page worker.

`followEdges(image, start)`: two candidates from the same start, a near reach (precise) and a far reach (for a first
guess far from the paper: first consistent edge outward from the text, a side with too little edge left alone); the
one whose weakest side has the most edge under it is kept. Wired into the PDF path (`sheetCorners.ts` `onThePaper`),
replacing the corner swap against the 320 px edge guess. On the 22 pages, from the PDF plan's corners:

| | Plan alone | Near reach only | Near and far, chosen by support |
| --- | --- | --- | --- |
| Pages within 2% | 0 | 9 | 10 |
| Pages within 3.5% | 0 | 12 | 14 |
| Pages within 8% | 8 | 14 | 17 |
| Median worst-corner error | 0.088 | 0.031 | 0.027 |
| Pages worse than the plan | | 3 | 2 (p-003, p-011) |

About 50 ms a sheet at 1000 px for the near reach alone; about 115 ms at 1152x1536 for both. p-003 and p-011 are worse
under both candidates: the neighbouring page's outer edge beats the faint fold. Other selection scores (sum of side
strengths, strength times coverage) picked no better than the near reach alone.

`traceSides(image, quad, pins)`: each side's edge between FIXED corners, 15 points a side. It is the labelling page's
method, restored exactly after Shlomi judged its lines far better than two earlier variants: an unsigned step across
the side on a twice-blurred gray, a smoothness charge of 1.2 per px plus 4 per px beyond a 10 px jump between
neighbours, reach 70 px, ends held at the corners, a pin forcing its point (constants tuned at a 1536 px long edge and
scaled). No stay penalty, no inner preference (it made the trace worse, 4.7 px), no band around pins. Against the
hand-traced borders from the hand-placed corners, at full size: 0.03 px from Shlomi's lines with his pins, 2.16 px
with none; straight sides are 9.8 px away.

## The Edges screen, simple by default, 2026-11-15

Shlomi's call after a day of detector rounds: the detector cannot find the real border with high fidelity, so the
automatic result is four corners with straight lines between them, and the traced border with its dots is a tool a
person turns on. The screen has to feel simple to someone who is not technical.

- **Default:** the photo in its own panel, four corners, straight lines, the magnifier. One hint line over the photo
  ("Drag each corner onto a corner of the page.") with Undo and Redo at its end.
- **One bar under the panel:** Auto-detect, Whole photo, Rotate, Fine-tune edges, then "Use these edges" at the far
  end. On a narrow screen the four tools are a row with the icon over the word and "Use these edges" takes the full
  width under them.
- **Fine-tune edges** (`ScanPage.fine`, a pressed toggle): the `tracePage` job runs at a 1536 px long edge and the
  traced border is drawn with a dot at every point (`cornerTrace.tsx`); a dot is dragged to pin its point and a pin is
  tapped to remove it (`cornerPins.tsx`); the hint becomes the dots sentence. Pins live with the corners and are
  cleared for the sides a moved corner touches. Whole photo turns it off.
- **Undo and redo** (`cornerHistory.ts`, `useCornerHistory`) step over corners, pins and the switch.
- **Zoom** (`cornerZoom.ts`, `useCornerZoom`): fit to 6x by wheel or trackpad pinch about the pointer, touch pinch,
  and Cmd/Ctrl with `=`, `-`, `0`. No zoom buttons; while zoomed in a "Fit page" chip sits over the photo, since the
  corners may be out of view. Browser cases in `e2e/corner-zoom.spec.js`.
- **A pin stays where it is dropped.** The pin browser test found a pin dragged 30 px landing 8 px short: the trace
  held a pin within its 70 px reach. A side now reaches as far as its farthest pin, and a pin outside the picture is
  held at the picture's edge.

The control is named **Edges** ("Use these edges", "Adjust edges").

## The traced border in the flattening, 2026-11-15

`tracedCurves.ts` `curvesFromSides` fits each traced side to the dewarp's own curve form in the homography's unit
square, and `measureBend` takes those curves in place of the ones it measures, with a looser squaring gate for them
(`MAX_SQUARE_TRACED` 0.07 against 0.035), which removes the three tilted pages of the scratch experiment. Pins travel
with the page to the worker and are part of `resultKey` and the draft. On the 22 pages from the hand-placed corners,
the flattened border's mean distance from a rectangle: 7.4 px before, 5.1 px with the automatic trace, 3.9 px with
Shlomi's pins; no page tilted; text rows unchanged. Three pages are worse with no pins (p-013, p-017, p-021).
Since the same day this applies only to a page in Fine-tune edges (below).

## The flattening follows the screen

The flattening uses the traced border only for a page in Fine-tune edges, pins included: what a person sees is what is
used. By default a page is flattened as before this ticket, from its corners and its text rows. This replaces a first
version that traced every photographed page automatically (and carried a `paper` flag so that a scanner's sheet,
whose only edge is the picture's frame, was left alone; `e2e/cross-tool/scan-offer.spec.js` had caught a 3 degree
scan coming back still leaning). The cost: on the 22 pages the automatic trace made the flattened border squarer on
average (7.4 px to 5.1 px from a rectangle). The gain: the three pages it made worse (p-013, p-017, p-021) are gone,
and the text rows come out equally straight either way. `Assessment.photo` stays: the PDF path's `onThePaper` still
runs only on a photographed page.

## The photo path: following as a repair only, 2026-11-15

A camera or library photo keeps `guessCorners`' 320 px guess, and `repairGuess` (`edges/repair.ts`, called from
`guessWith`, so the accepted shot, a library photo and Auto-detect) replaces it with the followed guess only when that
makes the outline clearly more page-shaped: the worst corner's distance from a right angle drops by 5 degrees or more.
A guess that is already page-shaped is never touched.

Measured on three sets: the 22 book pages (as 1000 px photos), the 20 labelled fixtures (`corpus.ts` and `real/`,
320 px, the good-light, contrasting-background case), and 33 real photos with no labels (31 full-size camera shots
from the phone check, two photos of a sheet on a table), judged by eye wherever a result moved.

| | Book pages within 2 / 3.5 / 8%, median | Fixtures worse than the guess by over 1% | The 33 real photos |
| --- | --- | --- | --- |
| Guess alone (before) | 0 / 4 / 8, 0.124 | | |
| Guess, always followed | 7 / 8 / 12, 0.079 (5 pages worse) | 8 of 20 (b) | 15 move by over 2%: about 7 repaired, 2 broken |
| Plan (`assess` + `planPage`), followed, the book carried | 7 / 14 / 20, 0.028 | 13 of 20 (a) | not run |
| Best of the guess, the followed guess and the followed plan, by edge support | 7 / 11 / 15, 0.032 | 5 of 20 | not run |
| Followed plan only where `Assessment.photo`, else the guess | 7 / 14 / 20, 0.028 | 0 of 20 | 4 move, all for the worse |
| **Followed guess as a repair (wired)** | 1 / 5 / 9, 0.110 (p-019 worse by 0.015) | 0 of 20 | 3 move, all repaired |

(a) On the fixtures no book is carried and none reads as a photo, so the plan's quad is taken unfollowed (the followed
guess where there is no plan page). (b) Followed at 320 px, a size the following was not tuned for; no larger
originals are in the repo.

- Edge support is not a selector: a wrong quad that sits on other strong edges scores high (p-015 0.370, p-020 0.235,
  p-021 0.526 chosen over a plan within 0.08).
- The plan is not a start for a photo. Its sheets in a PDF each hold one page that fills the sheet; a camera photo
  shows a page among other things. On three open-book shots it took the half-visible facing page or a box across both
  pages, and on one sheet photo it ran the top side up to the picture's edge. With no book carried (a first shot) it
  also loses three book pages outright (p-004 0.024 to 0.321, p-005, p-007).
- Always following the guess repairs outlines that are grossly wrong (4-069, the brochure shots, three open-book
  shots) and breaks two that are right: on an envelope printed to its edge it shrinks onto the white panel, because
  the follower trusts an edge only where blank margin lies just inside it, as on a text page.
- The repair keeps the first and drops the second. On the 33 photos it changes 4-069, 2-068 and 4-114 (thresholds of 5
  to 8 degrees give the same three); the envelope, both sheet photos and every fixture stay as they were. On the book
  pages p-002 (0.144 to 0.015) and p-014 (0.292 to 0.185) are repaired.
- What it leaves: a guess that is a tidy rectangle around the wrong thing (half a brochure, a sheet plus the cloth
  below it). That is the first guess's to fix, not the following's.

About 66 ms a photo for the repair at 1000 px, on top of 41 ms for the guess.

## Margins around the text, tried and parked

Shlomi asked for a step that pads a book page so its text sits centred. A first version (find the ink's box, pad to
even margins) changed 38 of 44 outputs, mostly wrongly: ink is not only text (page-edge shadow, the neighbouring page,
figures), and the padding's tone did not match the paper. It is not in this ticket's code. It needs a finder that
reads text rows and a fill that matches the paper, as its own ticket.

## What the scratch experiment showed, 2026-11-15

Method: follow each side by dynamic programming over offsets across it (free ends, 24 points), gain = a step with the
page side brighter, or a thin dark line (a page lying on other pages), counted only where the strip just inside is
blank paper, since a paper edge has margin inside it and a line of text has more text. Corners = where the fitted ends
of neighbouring sides meet, three passes with the reach halving, corners held inside the picture.

Starting from the PDF path's corners, at 1152x1536:

| | Start | Followed |
| --- | --- | --- |
| Pages within 2% | 0 | 9 |
| Pages within 3.5% | 0 | 12 |
| Pages within 8% | 8 | 14 |
| Median worst-corner error | 0.088 | 0.031 |

Three pages got worse (p-000, p-003, p-011): the start was further from the edge than the reach, or a stronger edge
further out (the neighbouring page) beat the faint fold. A variant with a longer reach, a first-edge-from-inside
preference and a coverage rule fixes those (p-000 0.207 to 0.008) and loses precision elsewhere; not combined yet.
Without the blank-margin rule 12 pages got worse: the top side locks onto a line of text.

Curved sides and flattening, same day, all from the hand-traced corners: feeding the traced curves to the dewarp
makes the flattened border about twice as square (mean distance from a rectangle 7.4 px to 3.5 px on all 22 pages)
and does not change how straight the text rows come out (the row fit does that work). Three pages came out tilted by
about 2 degrees because the lean exceeded `MAX_SQUARE` and squaring was skipped; not tested with a looser gate.
