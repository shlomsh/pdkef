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
- Book benchmark, 22 photos: 12 guesses snapped to the photo border, mostly where the facing page or the table
  met the page.

Different from SCAN-70, where an edge *inside* the page (a printed photo) wins.

## Outcome

- A page lying beside a stronger edge (a table edge, a facing page) is found by its own outline.
- A guess that runs to the photo border is treated as a miss, not a page.

## Acceptance

- [ ] Failing cases in the SCAN-05 corpus first (the shareable A4 shots from this check; the book benchmark stays
      private and is scored outside the repo), then the change.
- [ ] The book benchmark's count of right corners goes up from 10 of 22, and the SCAN-05 KPI table does not get worse.
