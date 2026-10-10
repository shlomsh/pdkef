---
id: "DEBT-44"
title: "Every counted failure leaves a trace in the error reports"
status: "in_progress"
priority: "P1"
epic: "robustness"
horizon: "now"
order: 1
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
