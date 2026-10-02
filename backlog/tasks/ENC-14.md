---
id: "ENC-14"
title: "The daily read counts protected files as a funnel, not as failures"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
order: 6
depends_on: ["ENC-02", "ENC-04"]
---

# ENC-14 · The daily read counts protected files as a funnel, not as failures

*Plan section 6.* `failed` carries no reason, so today 11 Redact failures cannot be told from the encrypted case (one report per fingerprint, deduplicated per page load). With the gate a protected file never reaches `failed`; this makes that visible.

## Brief
- Two anonymous events, no new fields: `tool_needed_unlock` (the gate showed, once per file; emit from `NeedsUnlock`) and `tool_returned_unlocked` (a file came back from Unlock: the receiving tool fires it on `?unlocked=1` and strips the parameter with `history.replaceState`, so a reload does not count twice). Add to `TOOL_LIFECYCLE_EVENTS` after `tool_operation_failed`; the schema stays import-free (`src/site-lib/functionImports.test.js`).
- `scripts/errors-read.mjs`: `sumUsage` hardcodes four columns and skips an unlisted event silently; add two columns and `ready / (accepted - needed unlock)` beside `ready/accepted`, labelled.
- Update `usageEventSchema.test.ts` (4 events and 44 combinations become 6 and 66), the docs that say "four lifecycle events" (`ANALYTICS.md`, `docs/maintenance-telemetry.md`) and the island-test expectations, including Redact's `lifecycleSpy` (an exact call list).

## Acceptance
- A digest run prints the new columns; a protected file in each wired tool emits `tool_needed_unlock` and never `tool_operation_failed`; a returned file emits `tool_returned_unlocked` once.
