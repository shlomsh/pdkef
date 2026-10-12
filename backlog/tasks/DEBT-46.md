---
id: "DEBT-46"
title: "Split reports started for its automatic prepare, not for a saved result"
status: "open"
priority: "P1"
epic: "robustness"
horizon: "now"
depends_on: []
---

# DEBT-46 · Split reports started for its automatic prepare, not for a saved result

*Filed 2026-10-12, from the daily read.* Split showed 3 files accepted, 11 started and 1 ready on
11 Oct. `PdfSplitTool.tsx` passes `analyticsStatus={status === 'preparing' ? 'processing' : saved ? 'done' : status}`,
and `preparing` runs automatically, debounced, after every change to the page selection, mode or
rotation. `BasePdfTool` counts each entry into `processing` as `tool_operation_started`, while
`done` only follows a save. So started counts edits and ready counts saves: the ready/started ratio
means nothing, and auto-prepare can use up the 40 usage events a page load may send
(`MAX_USAGE_EVENTS_PER_PAGE`).

## Acceptance

- Split reports `tool_operation_started` once per save action, like the other tools. Auto-prepare is
  either not counted or reported as its own event.
- A unit test seen failing first: three selection changes send no started; one save sends one started
  and one ready.
- The Split row in `npm run errors:read` reads as started >= ready.

## Outcome
