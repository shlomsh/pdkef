---
id: "SCAN-22"
title: "Scan next: measure the bend at a higher resolution, so a crease's tip goes too"
status: "open"
priority: "P3"
epic: "scan-next"
horizon: "next"
order: 8
depends_on: ["SCAN-20", "SCAN-21"]
---

# SCAN-22 · See the sharp end of a fold

*Opened 2026-11-04* from the first prod scan of a creased form.

## Why

SCAN-17 measures a page on a copy at most 1000 px long (`MEASURE_LONG_EDGE` in `lib/dewarp/index.ts`).
On that scan the fold's tip, a 4 px bulge over about 90 rows at full size, is about 2 px there: near the
smallest bend the measuring can see, so 4 px of the crease stays.

## Outcome

- Measuring at about 1400 px (and the grid along a line refined to match, if the corpus says so), once
  SCAN-21 has made the time affordable.
- Kept only if SCAN-20's corpus improves on creased pages and no page gets worse, and the SCAN-21
  timing budget still holds.

## Acceptance

- [ ] The prod form's left border travels under 2 px (from 4).
- [ ] SCAN-20's table, before and after, with the timing on a phone.
