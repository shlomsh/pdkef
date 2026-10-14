---
id: "DEBT-51"
title: "Redact export: a file gone from disk after opening says so, instead of Try again"
status: "open"
priority: "P2"
epic: "robustness"
horizon: "next"
depends_on: []
---

# DEBT-51 · Redact export: a file gone from disk after opening says so, instead of Try again

*Filed 2026-10-14 from the daily read.* Redact counted 4 failed exports of 31 started on 14 Oct (13%,
against about 6% over the fortnight before), all on build 03e7d2e, chromium-150. The only trace is one
drop record: area `redact`, step `export`, reason `no_frame`, `DOMException` `NotFoundError`. No error
report, because the exception carries no stack frame.

The export reads the opened file again (`file.arrayBuffer()` in `src/editor/adapters/pdf/redact.js`,
reached from `applyPageEdits(sourceFile, ...)` in `src/tools/redact/PdfRedactTool.tsx`). In Chromium a
`File` whose file on disk was moved, renamed or deleted after it was picked rejects that read with
`NotFoundError`. That this is the cause is inferred, not read from a stack: no other step in the export
throws a DOMException of that name. If it holds, the cause is the person's environment, and per the
tools-and-shell rule it falls back quietly. Today the person sees "Could not export the PDF. Your edits
are still here. Try again.", and trying again can never work, which fits four failures from what is
probably one page load (DEBT-48 would say).

## Acceptance

- [ ] A unit test, seen failing first, gives the export a `File` whose `arrayBuffer()` rejects with a
  `NotFoundError` DOMException and asserts the outcome below.
- [ ] That case is not reported (`// expected:` with the reason) and does not offer Try again: the person
  is told the file is no longer where it was and is offered to open it again. Their marks stay. Copy in
  the app's voice.
- [ ] Decide here whether the case still counts as `tool_operation_failed`, and match whatever DEBT-44
  settles for Merge's flagged files, so the two tools count a person's file the same way.
- [ ] A `docs/error-known-items.json` entry (area `redact`, step `export`, name `NotFoundError`) lands
  with the fix.
- [ ] The daily read shows no `NotFoundError` drop at `export` from a stamped build containing the fix.
