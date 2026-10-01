---
id: "DEBT-28"
title: "The tool usage funnel has never been recorded: its events go to Vercel custom events, which Hobby drops"
status: "in_progress"
priority: "P3"
epic: "robustness"
horizon: "now"
depends_on: ["DEBT-27"]
needs: "The privacy-page sentence for the funnel"
---

# DEBT-28 · The tool usage funnel has never been recorded: its events go to Vercel custom events, which Hobby drops

*Filed 2026-10-01, out of DEBT-27's review.* `src/lib/productAnalytics.ts` sends four lifecycle
events, each carrying only `{tool}`, through `window.va('event', ...)` in production builds:

| Event | Fires when |
| --- | --- |
| `tool_file_accepted` | a tool gets its first file |
| `tool_operation_started` | the tool starts working (processing, merging, converting; Merge's Download tap) |
| `tool_result_ready` | the result is ready |
| `tool_operation_failed` | the tool ends in its error state |

`BasePdfTool.tsx` fires them from every tool's status changes; Sign and Compress also call them
directly. Together they are a per-tool funnel: which tools are used, and where people stop.

Vercel lists custom events from Pro upward only, and the project is on Hobby, so none of them has
ever been recorded. That is from Vercel's docs, not the dashboard; nobody has looked at its Events
tab. MERGE-16 (done) planned its before/after reads on this funnel in the dashboard, so those reads
could not have happened as written.

Not part of the error loop: a real failure behind `tool_operation_failed` is reported by the tool's
own catch (DEBT-17, DEBT-27, enforced by `test:swallowed-errors`). This ticket is only about usage.

## What to build, if the funnel is wanted

DEBT-27 already moved Sign's two maintenance events the same way, so the pieces exist:

- an import-free wire schema for `{name, properties: {tool}}` on the closed lists in
  `productAnalytics.ts`, accepted by `api/report.ts` next to `parseMaintenanceEvent`;
- daily counts in the same store, field `event|tool|engine` or `event|tool` (decide whether the
  browser family earns its place for usage), 90-day expiry, under the same daily cap;
- the transport: `sendBeacon` from `src/lib/errorReport.ts`, with a per-page cap;
- `errors:read` (or a sibling `usage:read`) prints the funnel per tool;
- the privacy page and `ANALYTICS.md` / `docs/maintenance-telemetry.md` say what is now true. This
  is usage, not maintenance, so the privacy sentence is new, in Shlomi's words.

Check the daily cap first: 5,000 shared with error reports could fill on usage alone and blind the
error loop. Usage likely needs its own counter and cap.

## Acceptance

- [x] Shlomi decides: keep the funnel (build the above) or retire the four events and the code.
      Kept, 2026-10-01.
- [ ] If kept: a Sign or Merge run in production shows accepted, started and ready per tool in the
      reader the next minute, and error reports keep their own cap.
- [ ] If retired: `productAnalytics.ts`, its call sites and the disclosures lose them, and
      `ANALYTICS.md` records why.
- [ ] Either way, every disclosure is literally true afterwards.
