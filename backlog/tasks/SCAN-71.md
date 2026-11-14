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
