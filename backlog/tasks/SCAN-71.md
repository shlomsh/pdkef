---
id: "SCAN-71"
title: "The corners stop at the page's own edge, not at a table edge or the facing page"
status: "in_progress"
priority: "P1"
epic: "scan-next"
horizon: "next"
depends_on: ["SCAN-05"]
---

# SCAN-71 · Corners that stay on the page

*Opened 2026-11-14* from a phone check (iPhone, Chrome, live camera) and a private benchmark of 22 phone photos of
an open book, run through Scan as a PDF. The corner guess often takes a strong edge outside the page instead of the
page's own edge: the far edge of the table, the facing page of an open book, or the photo's own border.

- Live camera, 12 shots: 3 went off the page. One A4 sheet on a flowered cloth took the table edge below it as its
  bottom corners (the PDF page carries a strip of cloth); two open-book shots put a corner on the photo border
  (`x` at 0 or 1), so dark table shows in the result. The other 9 were found well, on cloth and on wood.
- Book benchmark, 22 photos: see the baseline below; only 3 of 22 are found within 0.035.

Different from SCAN-70, where an edge *inside* the page (a printed photo) wins.

## Outcome

- A page lying beside a stronger edge (a table edge, a facing page) is found by its own outline.
- A guess that runs to the photo border is treated as a miss, not a page.

## Acceptance

- [ ] Failing cases in the SCAN-05 corpus first (the shareable A4 shots from this check; the book benchmark stays
      private and is scored outside the repo), then the change.
- [ ] The book benchmark's found@0.035 goes up from 3 of 22 (baseline below), and the SCAN-05 KPI table does not get worse.

## Book benchmark baseline, 2026-11-14

The 22 photos are marked by hand (TL TR BR BL, normalized, read on a 2% grid, about 0.02 accurate) and kept
outside the repo with a scorer that runs the repo's own `kpi.ts` on `guessCorners` (the detector that inspects a photo), at the
corpus size (gray, 320 px long edge): `node --experimental-strip-types ~/.pdkef-phone-check/benchmarks/tipul/score.mts <worktree>`.

| found@0.02 | found@0.035 | found@0.08 | median err | max err | median IoU | confidently wrong |
| --- | --- | --- | --- | --- | --- | --- |
| 1 of 22 | 3 of 22 | 4 of 22 | 0.225 | 0.686 | 0.62 | 18 |

Two failures account for almost all of it:

- **Top corners on the photo border (11 of 22):** the guess puts both top corners at (0,0) and (1,0), taking the
  table and the facing page above the book as part of the page.
- **Half a page (6 of 22):** the guess runs across the middle of the page, at a gap in the text or a figure's
  edge, and keeps only the top or bottom half.

The 4 found are pages whose four edges all show against the table. The earlier "10 of 22" in this ticket came
from the PDF path's page planner, a different detector, read by eye.

## Progress, 2026-11-14: fit the guess to the paper

`edges/grow.ts` `fitToPaper` runs last in `guessCorners`. A side whose two corners sit on the same frame border is
pulled in to the first step up in paper brightness (the page's own edge, up to 30% in); every other side is pushed out
a strip at a time while the strip beyond is still paper, which mends the half pages. Pure; two synthetic tests in
`grow.test.ts`, seen failing first. The SCAN-05 corpus and its `baseline.json` are unchanged.

| | found@0.02 | found@0.035 | found@0.08 | median err | max err | median IoU | confidently wrong |
| --- | --- | --- | --- | --- | --- | --- | --- |
| baseline | 1 of 22 | 3 of 22 | 4 of 22 | 0.225 | 0.686 | 0.62 | 18 |
| `fitToPaper` | 1 of 22 | 4 of 22 | 8 of 22 | 0.143 | 0.585 | 0.81 | 14 |

What is left for the outcome:

- **Only photo inspection gets it.** `guessCorners` is called from `pageWork/steps.ts` `guessWith`. The live camera's
  outline comes from `detectPage` (`capture/observe.ts`) and a PDF's sheets from `planPage` (`pdfSheets.ts`); neither
  has the fit yet, so the phone check's three misses would look the same today.
- **Facing pages.** An open book's left or right edge runs into the facing page with no step in brightness at the
  gutter; that needs a gutter finder (dark crease line), not a brightness step.
- **p-014, p-019** keep their tops on the border (no step found within 30%); **p-021** got worse, 0.500 to 0.585.
- The first acceptance box (shareable failing cases in the SCAN-05 corpus) is still open.

## Progress, 2026-11-14: the live camera and a score for every path

The private scorer now runs all three finders. `detectPage` (the live camera) used to return no page on 12 of the 22
photos and a wrong one on 6: its brightness guess ran to the photo border, where there is no edge, so `scoreQuad` gave
it 0. It now fits the brightness guess before scoring it and fits a winning outline after; the faint find stays
unfitted (a light page on a light table has no brightness step to fit to, and fitting it made the corpus's
low-contrast photo worse). `guessCorners` makes the same decision. The real corpus now scores the camera too
(`cameraReal`, `cameraSynthetic` in `baseline.json`); nothing moved there. Cost: 30.1 to 30.2 ms median per frame
in node.

| book benchmark | found@0.02 | found@0.035 | found@0.08 | median err | median IoU | confidently wrong |
| --- | --- | --- | --- | --- | --- | --- |
| camera, before | 1 of 22 | 3 of 22 | 4 of 22 | 1.000 (12 none) | 0.00 | 6 |
| camera, now | 1 of 22 | 4 of 22 | 8 of 22 | 1.000 (12 none) | 0.00 | 2 |
| photo inspection, now | 1 of 22 | 4 of 22 | 8 of 22 | 0.143 | 0.81 | 14 |
| PDF path (`assess` + `planPage`, 1000 px) | 0 of 22 | 0 of 22 | 2 of 22 | 0.120 | 0.77 | 20 |

The camera's 12 with no outline are 12 that photo inspection gets wrong (error 0.13 to 0.59): it declines
rather than shows a wrong outline, which is the outcome's second line. Finding those pages is the gutter: an open
book's side runs into the facing page with no step in brightness.

The PDF path is a different finder: it reaches out from the text block by a margin (`photoPage.ts` `readPhoto`), so
it is never far off (max 0.185) and never on the edge. Fitting it to the paper is its own design, left for after the
gutter finder.

## Progress, 2026-11-15: the fold between two facing pages

Photo inspection (`guessCorners`) now finds an open book's fold. `edges/fold.ts` `cutAtFold` looks at a left or
right side lying within 20% of its frame edge and moves it in to the fold: a long, nearly vertical line darker than
the paper on both sides (a crease or a shadow valley), scored by a low percentile of its darkness so text cannot fake
it, with text beyond it (a printed box rule on a single sheet has blank margin beyond, and stays), and no darker
than shading gets (a printed rule is ink: real folds score 0.12 to 0.28 of the paper level and the cap is 0.45, so a
form's full-height gridline with text on both sides stays too). `edges/snap.ts`
`snapSides` then moves the other three sides onto the nearest real page edge, either end free by 6%, so a tilted page
is followed. `scoreQuad` judges a fold side by its edges alone (both sides of a fold are the same paper). All pure,
synthetic tests seen failing first, the SCAN-05 corpus and its `baseline.json` unchanged.

| book benchmark, photo inspection | found@0.02 | found@0.035 | found@0.08 | median err | max err | median IoU | confidently wrong |
| --- | --- | --- | --- | --- | --- | --- | --- |
| before | 1 of 22 | 4 of 22 | 8 of 22 | 0.143 | 0.585 | 0.81 | 14 |
| fold + snap | 1 of 22 | 4 of 22 | 10 of 22 | 0.086 | 0.507 | 0.88 | 12 |

Seven photos moved, none got worse: p-001 0.142 to 0.070, p-003 0.219 to 0.070, p-005 0.210 to 0.084, p-011 0.179
to 0.146, p-015 0.215 to 0.174, p-017 0.198 to 0.136, p-021 0.585 to 0.507. On all seven the fold side now sits on
the page's own edge; what is left is a far side (the bottom on p-011, the right on p-015 and p-021) that runs off the
frame or onto the page stack.

What is left for the outcome:

- **The live camera is unchanged.** Wired into `detectPage`, the fold and snap found no page on any of the 12 books:
  after the snap at least one side stays under `MIN_SIDE_SUPPORT` on every one (a side running off the frame or onto
  the page stack has no edge to score), and it cost 8 ms a frame (31 to 39). So the camera does not run it. Showing
  an outline for a book needs a different acceptance for a side that leaves the frame, not more of this finder.
- **No fold found** on p-002, p-007, p-009, p-014, p-019: too faint (p-007, p-019 score 0.012 against 0.08) or the
  guess is elsewhere (p-014).
- found@0.035 is still 4 of 22, the second acceptance line.
- The PDF path is untouched.

## Measured, 2026-11-15: no camera rule for books is worth shipping

Five acceptance rules were run on the camera's path with the fold cut and snap added (script kept outside the repo).
The camera draws an outline, and may take the photo by itself, only at confidence 0.6 (`captureMachine.ts:71`,
`minConfidence` in `capture/types.ts`). An open book's page has two sides with no edge (off the frame, onto the page
stack), so its score stays at 0.27 to 0.41 of that bar however the side rule is loosened.

| rule | shown | found@0.035 | found@0.08 | confidently wrong |
| --- | --- | --- | --- | --- |
| today (every side 0.4) | 10 of 22 | 4 | 8 | 2 |
| frame-border side exempt | 10 | 5 | 8 | 2 (p-008 drops under the 0.6 bar: lost on screen) |
| fold and opposite 0.4, top and bottom 0.2 | 11 | 4 | 9 | 2 (adds p-003 at 0.603) |
| every side 0.2 | 13 | 4 | 10 | 3 (adds p-005, wrong, under the bar) |
| any three sides 0.4 | 12 | 5 | 9 | 3 (adds p-021, 0.51 off, under the bar) |

The fold and snap cost 8.5 ms a frame (30 to 38). The SCAN-05 corpus gives the same result under every rule. A
camera outline for open books needs a detector that sees the book as a whole: [SCAN-10](SCAN-10.md), a learned page
detector behind the same contract, parked 2026-11-15 until Scan's use justifies a trained model.
