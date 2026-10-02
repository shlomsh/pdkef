---
id: "ENC-09"
title: "The daily read counts protected files as a funnel, not as failures"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
order: 8
depends_on: ["ENC-02"]
---

# ENC-09 · The daily read counts protected files as a funnel, not as failures

*Plan section 6.* `failed` carries no reason, so today 11 Redact failures cannot be told from the
encrypted case (one report per fingerprint, deduplicated per page load). With the gate, a protected file
never reaches `failed`; this ticket makes that visible.

## Brief
- Two anonymous events, no new fields: `tool_needed_unlock` (the gate showed, once per file) and
  `tool_returned_unlocked` (a file came back from Unlock; fired on a hand-off carrying the return marker).
  Add to `TOOL_LIFECYCLE_EVENTS` after `tool_operation_failed`; wire the emits from `NeedsUnlock` and from
  the receivers.
- `scripts/errors-read.mjs`: `sumUsage` hardcodes four columns and skips an unlisted event silently; add
  the two columns and `ready / (accepted - needed unlock)` beside `ready/accepted`, labelled.
- Update `usageEventSchema.test.ts` (4 events and 44 combinations become 6 and 66), the docs that say "four
  lifecycle events" (`ANALYTICS.md`, `docs/maintenance-telemetry.md`), Redact's `lifecycleSpy` expectations.
- The definitions in the plan go into the digest output and into the scheduled-task prompt
  (`~/.claude/scheduled-tasks/pdkef-daily-error-read/SKILL.md`, outside the repo; Shlomi owns it, see open
  decision 6).

## Acceptance
- `src/site-lib/functionImports.test.js` still passes (the schema stays import-free).
- A digest run prints the new columns; an `EncryptedPDFError` report is described in the prompt as a gate
  miss, not noise.
