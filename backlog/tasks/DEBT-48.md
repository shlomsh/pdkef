---
id: "DEBT-48"
title: "The usage funnel can say how many sessions finished, not only how many runs"
status: "open"
priority: "P3"
epic: "robustness"
horizon: "later"
depends_on: ["DEBT-46"]
needs: "A decision on a once-per-page-load flag in the usage event shape"
---

# DEBT-48 · The usage funnel can say how many sessions finished, not only how many runs

*Filed 2026-10-12.* The funnel counts transitions: accepted fires when a tool goes from no file to a
file, while started, ready and failed fire for every run. Step ratios can exceed 100% (Compress 143%,
Merge 200% on 11-12 Oct), because the same file is run again after a settings change or a second tap.

## Acceptance

- Each funnel step can be counted once per page load, so "of the sessions that opened a file, how many
  finished" is a true proportion, shown next to the run counts in `errors:read`.
- The change fits `src/lib/usageEventSchema.ts` and `api/report.ts` within the existing command budget.

## Outcome
