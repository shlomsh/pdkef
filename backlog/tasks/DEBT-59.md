---
id: "DEBT-59"
title: "Background builds count as started and ready, so completed outruns opened"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "now"
depends_on: []
---

# DEBT-59 · Background builds count as started and ready, so completed outruns opened

*Filed 2026-10-21.* On many days a tool shows more results ready than files opened. Read per page
load (`once:`) the funnel is sound on every one of those days; the extra is runs nobody asked for.

- Compress builds a fresh result after each option change, before Download, and each build passes
  through `analyticsStatus` `processing` -> `done`. 8 Oct: 3 opened, 16 started, 16 ready.
- Split still shows it after DEBT-46 (11 Oct: 3 opened, 11 started, 1 ready).
- Redact's repeat exports (21 Oct: 6 page loads opened, 4 finished, 8 exports) are real asks and
  stay counted as runs; the funnel reads page loads.

## Acceptance

- `tool_operation_started` only on a tap (Download, Share, Retry), `tool_result_ready` only when
  that tapped result is delivered, in Compress and Split, as Merge does since MERGE-12.
- Every other tool audited for the same pattern, and fixed where found.
- A unit test per tool, red before the change: option changes with no tap send neither event.
- ANALYTICS.md change-log row.
