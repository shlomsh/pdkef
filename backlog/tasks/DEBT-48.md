---
id: "DEBT-48"
title: "The usage funnel can say how many sessions finished, not only how many runs"
status: "blocked"
priority: "P3"
epic: "robustness"
depends_on: ["DEBT-46"]
waiting_on: "A full UTC day of production reads on a stamped build with the fix"
---

# DEBT-48 · The usage funnel can say how many sessions finished, not only how many runs

*Filed 2026-10-12.* The funnel counts transitions: accepted fires when a tool goes from no file to a
file, while started, ready and failed fire for every run. Step ratios can exceed 100% (Compress 143%,
Merge 200% on 11-12 Oct), because the same file is run again after a settings change or a second tap.

*Added 2026-10-14 from the daily read.* The same gap hides who failed: Redact counted 4 failed exports of
31 started on 14 Oct, with one drop record (a NotFoundError at `export`) and no report, because reports
and drop records are sent once per distinct cause per page load. One person retrying four times and four
people failing once read the same. A once-per-page-load `failed` answers it.

## Acceptance

- Each funnel step can be counted once per page load, so "of the sessions that opened a file, how many
  finished" is a true proportion, shown next to the run counts in `errors:read`.
- `failed` is one of those steps, so `errors:read` can say how many page loads a tool's failures came from.
- The change fits `src/lib/usageEventSchema.ts` and `api/report.ts` within the existing command budget.

## Outcome

Shipped 2026-10-14, code side. The decision on the event shape: the first event of each kind a tool sends
on a page carries `first: true` (`src/lib/productAnalytics.ts`), the endpoint adds one `HINCRBY` on a
`once:<event>|<tool>|<build>` field of the same day hash (`usageOnceField`), and `errors:read` prints
`pages accepted`, `pages started`, `pages ready` and `pages failed` beside the run counts. To keep the
worst case inside the 500K monthly budget, the usage cap went from 3,000 to 2,400 a day (15.2K commands a
day, about 456K a month). Tabs still on an older build send no `first`, so page columns undercount for a
day after the deploy. Waiting on a production read that shows the page columns filled.
