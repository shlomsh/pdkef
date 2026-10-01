---
id: "DEBT-24"
title: "Sign's maintenance events have probably never arrived: Hobby has no custom events"
status: "retired"
priority: "P2"
epic: "robustness"
depends_on: ["DEBT-17"]
---

# DEBT-24 · Sign's maintenance events have probably never arrived: Hobby has no custom events

*Retired 2026-10-01: folded back into DEBT-27, which owns the outcome. Split off, it let DEBT-27 close with a gap in "track, reproduce, fix". The work and its evidence are recorded there.*

*Filed 2026-10-01, out of DEBT-17.* `sign_export` and `sign_form_detection` go out through
`window.va('event', ...)`. Vercel's limits page lists custom events from Pro upward only, and the
project's team reports `plan: hobby` from the API. So the events are probably being dropped on
Vercel's side. The client cannot tell, because `reportMaintenanceEvent` returns true once the call
is made. This is inferred, not measured: nobody has looked at the dashboard's Events tab.

Two more facts from the same research:

- `window.va` does not exist until `inject()` runs, which BaseLayout defers to window `load`. Any
  event fired before that is silently dropped (`window.va?.(...)`).
- The disclosure said "a 10% random sample". No sampling exists in code; DEBT-17 corrected the doc.

## Acceptance

- [ ] Shlomi confirms from the dashboard whether either event has ever arrived.
- [ ] If not, move both events to DEBT-17's same-origin `/api/report` endpoint (as counts on a closed
      list, the same storage) or retire them. Either way, the disclosure says what is true afterwards.
