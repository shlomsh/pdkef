---
id: "DEBT-28"
title: "The tool usage funnel has never been recorded: its events go to Vercel custom events, which Hobby drops"
status: "in_progress"
priority: "P3"
epic: "robustness"
horizon: "now"
depends_on: ["DEBT-27"]
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
- [x] Either way, every disclosure is literally true afterwards. The privacy sentence is Shlomi's
      pick: "we keep it only as daily totals per tool for 90 days (Sign's also by browser family and
      version)".

## What was built (2026-10-01)

- `src/lib/usageEventSchema.ts`: import-free, exactly `{name, properties: {tool}}` off the two
  closed lists; 84 adversarial tests, including that no payload parses as another kind.
- `productAnalytics.ts` beacons through `sendBeacon` (production, online, never throws), at most 40
  a page. `window.va` custom events are gone; Vercel gets page views only.
- `/api/report` counts usage as `usage:<day>` field `event|tool`, no browser family, 90 days, under
  its own cap so usage can never spend the error loop's.
- **The Upstash budget, which this work found DEBT-27 had wrong.** The store is on Upstash Free
  (500K commands a month, each pipelined command counted). DEBT-27 allowed 5,000 reports a day at 6
  commands, so a bad day or a flood could spend the month and leave error reporting blind until it
  reset. Now: the day's total expires once instead of on every request, a report costs 5 commands,
  a Sign or usage event 3, a request past the cap 1; caps are 1,000 reports and Sign events and
  3,000 usage events a day (Shlomi's call), 14K commands a day at most, about 420K a month.
  Shlomi chose to stay on Free.
- Limits stack: 40 usage events per page, 10 requests a minute per IP (firewall), the daily caps
  site-wide. `errors:read` prints a "Tool usage" table and says when a day reached a cap.
- Verified locally against the real store: a real Merge run in a production build read back as
  `merge | 1 | 1 | 1 | 0 | 100%`; loading files without downloading sends only `accepted`, so
  `ready` counts only a delivered download; both keys carry their 90-day expiry. Test entries
  deleted. Fresh review: no blockers; its two should-fixes (past-cap cost, a full day being
  invisible) fixed.
