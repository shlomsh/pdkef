---
id: "DEBT-47"
title: "Sign's funnel has a clean baseline after the dropzone routing fix"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
depends_on: []
---

# DEBT-47 · Sign's funnel has a clean baseline after the dropzone routing fix

*Filed 2026-10-12.* Until 12 Oct 2026 the home file dropzone sent people into Sign who had not
chosen Sign, so `tool_file_accepted` for Sign was inflated: 21 accepted and 0 started over 11-12 Oct.
A production test on 12 Oct (build 624ad0b) confirmed that a real, non-speculative export sends
accepted, started and ready, so the 0 was not a missing event. Sign's accepted and accepted-to-started
figures from before the fix are not a baseline. Expect fewer accepts and a higher started over
accepted afterwards.

## Acceptance

- The fix's deploy date is recorded here.
- The first full UTC day after it is read with `errors:read` and its Sign accepted, started and ready
  written under Outcome as the baseline.
- The daily read labels earlier Sign ratios as pre-fix until then.
- Other Sign save or share paths are checked for a missing `tool_operation_started` (only the main
  download button was tested).

## Outcome
