---
id: "SCAN-33"
title: "Scan next: a white page on a white table is found"
status: "in_progress"
priority: "P1"
epic: "scan-next"
horizon: "now"
order: 5
depends_on: []
---

# SCAN-33 · Light page, light surface

*Opened 2026-11-04* from Shlomi's iPhone photo of a blank form on a white table: neither edge strategy
(`lib/edges/scoredRegions.ts` brightness, `lib/edges/outline.ts` outline) finds the page, and the corners
fall back to the whole photo.

## Outcome

The page is found from what does show: a faint edge, the thin shadow along it, the print's own
rectangle inside it, a slight colour difference. A strategy (or a change to `outline.ts`'s thresholds,
local contrast normalisation, a colour edge channel: see SCAN-09's list) behind the `EdgeGuesser`
contract, landed only if the SCAN-05 corpus does not get worse. When nothing is found with confidence,
the camera says a darker surface would help (SCAN-24).

## Acceptance

- [ ] The white-on-white photo is found within the corpus's corner tolerance.
- [ ] SCAN-05's KPI table before and after, no row worse; the per-frame time budget holds.
