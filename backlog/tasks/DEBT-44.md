---
id: "DEBT-44"
title: "Every counted failure leaves a trace in the error reports"
status: "done"
priority: "P1"
epic: "robustness"
depends_on: []
---

# DEBT-44 · Every counted failure leaves a trace in the error reports

Found in the daily read of 10 Oct 2026: Redact counted `tool_operation_failed` 5 times out of 19
started exports and stored zero error reports that day. Every one of those runs called
`reportError('redact', err, 'export')`, and none was an encrypted file (that path returns before the
failed count). The reporting pipeline drops a report silently in several places, so nothing could
say which one fired:

- the browser, in `toErrorReport` (`src/lib/errorReport.ts`): a thrown value that is not an `Error`,
  a stack with no frame inside `/_astro/`, an ignored name, pdf-lib's encrypted error, or a report
  `parseErrorReport` refuses;
- the endpoint (`api/report.ts`): an oversize body, bad JSON or an unknown shape all answer 204 and
  count nothing;
- usage events carry no build, so failures cannot be told apart by release.

An old cached build was checked and ruled out: the reporter and usage events shipped together on
1 Oct and the report shape has only grown compatibly since. Retiring old tabs sooner is out of scope
by decision (cache first keeps the app offline).

## Acceptance

- A report the browser decides not to send goes as a drop record (`parseDropRecord` in
  `src/lib/errorReportSchema.ts`): area, step, reason, a coarse type, a listed name, build.
- Usage events carry the build when the page has one; unstamped events still count.
- The endpoint counts drop records (`drops:<day>`) and its own rejections by reason
  (`rejects:<day>`), within the existing command budget.
- `npm run errors:read` prints both, and the usage table sums stamped and unstamped events.
- One contract test feeds the browser's real output through `POST` and asserts what is stored.

## Outcome

The browser sends a drop record for every report it will not send (`toDropRecord` in
`src/lib/errorReport.ts`), with its own per-page cap so a page past its report cap still leaves a
trace; uncaught noise from outside our code sends none. Usage events carry the build. The endpoint
counts drop records under `drops:<day>` (sharing the error cap) and every refused body under
`rejects:<day>` by reason and engine (its own cap of 200); the budget is about 438K commands a month.
`errors:read` prints both tables, failures by build, and an `UNTRACED` verdict for a tool whose
failures left neither. `src/site-lib/reportContract.test.ts` sends the browser's real output through
the real endpoint. The daily read confirms it in production.
