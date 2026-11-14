---
id: "SCAN-70"
title: "A colour flyer is found by its edges, not by the photo printed inside it"
status: "open"
priority: "P2"
epic: "scan-next"
horizon: "next"
depends_on: ["SCAN-05"]
---

# SCAN-70 · A colour flyer's own edges

*Opened 2026-11-14* from two phone checks on the same day (iPhone, Chrome, live camera). A glossy A5 flyer with a
large printed photo, on a dark table, was taken twice, and both times the page came out as a thin strip: the corners
went round the printed photo inside the flyer, not the paper's edge (about 1400x470 px out of a page about 1080x1650).
The flyer's back, mostly flat colour, was found whole.

## Outcome

- A flyer whose printed picture has strong edges of its own is found by the paper's outline.
- Judged on the SCAN-05 corpus with at least one such flyer in it (one Shlomi can share), with no KPI getting worse.

## Acceptance

- [ ] A failing case in the corpus first, then the change.
- [ ] The SCAN-05 KPI table does not get worse.
