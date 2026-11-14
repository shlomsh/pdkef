---
id: "SCAN-72"
title: "An open book in front of the camera comes out as two pages, not one spread"
status: "open"
priority: "P2"
epic: "scan-next"
horizon: "next"
depends_on: ["SCAN-71"]
---

# SCAN-72 · Split the spread in the camera

*Opened 2026-11-14* from a phone check (iPhone, Chrome, live camera). Two of five open-book shots were taken as
the whole spread, both pages on one PDF page, with no split at the spine. The standing decision is "spreads: split
first": a sure split happens by itself, an unsure one asks. SCAN-36 covers the same for a scanned PDF; this is the
camera path.

## Outcome

- A spread found by the camera becomes two pages, split at the spine, in reading order (right to left for Hebrew).
- A spread whose spine is not sure asks, as the PDF path will.

## Acceptance

- [ ] A failing case from a shareable book page first, then the change, sharing the split with SCAN-36.
- [ ] Checked on the phone with five open-book shots.
