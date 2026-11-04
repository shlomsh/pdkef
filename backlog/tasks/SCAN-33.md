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

- [x] The white-on-white photo is found within the corpus's corner tolerance. (`edges/faint.test.ts`; the
      real photo is `edges/real/blank-form-on-white-table.pgm`, scored in `realCorpus.test.ts`)
- [x] SCAN-05's KPI table before and after, no row worse. (`edges/real/baseline.json` moved on purpose in
      7c330635 and `realCorpus.test.ts` guards it; found-rate stays 1 at every tolerance)
- [ ] The per-frame time budget holds: no test or recorded measurement of `detectPage`'s time exists yet.
      Measured 2026-11-04 on a desktop in Node, 320x569, 200 runs: faint-outline frame (the blank-form fixture) median 29.4 ms, p95 30.4 ms
      (54.9 / 56.6 before SCAN-33, where it fell through to brightness); dark-desk page 11.0 / 11.5 ms (10.9 / 11.9 before). No numeric budget is
      written anywhere, and a phone has not been measured, so the box stays open.
- [ ] Shlomi glances at the blank form's corners in `edges/real/labels.json` (read by eye).
