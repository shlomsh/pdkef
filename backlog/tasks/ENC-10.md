---
id: "ENC-10"
title: "The daily read counts protected files as a funnel"
status: "open"
priority: "P3"
epic: "robustness"
horizon: "later"
order: 4
depends_on: ["ENC-02"]
---

# ENC-10 · The daily read counts protected files as a funnel

*Plan section 6.* `failed` carries no reason. ENC-02 already stops a protected file reaching `failed`; this makes the funnel visible.

## Brief
- Two anonymous events, no new fields: `tool_needed_unlock` (the state showed, once per file) and `tool_returned_unlocked` (Unlock's Redact it / Sign it was used; counted under the receiving tool, so it needs a marker, such as `?unlocked=1` stripped with `history.replaceState`). Add to `TOOL_LIFECYCLE_EVENTS` (the schema stays import-free: `src/site-lib/functionImports.test.js`).
- `scripts/errors-read.mjs`: `sumUsage` hardcodes four columns and skips an unlisted event silently; add the columns and `ready / (accepted - needed unlock)`, labelled. Update `usageEventSchema.test.ts` (4 events and 44 combinations become 6 and 66), the docs that say "four lifecycle events" (`ANALYTICS.md`, `docs/maintenance-telemetry.md`), Redact's `lifecycleSpy` expectations, and the scheduled-task prompt's definitions.

## Acceptance
- A digest run prints the new columns; the state emits `tool_needed_unlock` once and never `tool_operation_failed`.
