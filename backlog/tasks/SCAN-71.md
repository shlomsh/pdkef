---
id: "SCAN-71"
title: "The corners stop at the page's own edge, not at a table edge or the facing page"
status: "open"
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
outside the repo with a scorer that runs the repo's own `kpi.ts` on `guessCorners` (the camera detector), at the
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
