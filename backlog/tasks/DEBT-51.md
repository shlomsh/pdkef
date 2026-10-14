---
id: "DEBT-51"
title: "Redact and Sign export from the bytes they hold, so a file gone from disk still exports"
status: "blocked"
priority: "P2"
epic: "robustness"
depends_on: []
waiting_on: "A full UTC day of production reads on a stamped build with the fix"
---

# DEBT-51 · Redact and Sign export from the bytes they hold, so a file gone from disk still exports

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

**Decision (2026-10-14):** both tools already hold the bytes they read when the file was opened
(Redact's `fileBytesRef`, Sign's `sourceBytes`), so the export reads those and never the `File` again.
The failure cannot happen, so no message, no report and no counting question remain. Sign re-read the
`File` the same way (`sign.js`) and is fixed with it.

## Acceptance

- [x] Redact's and Sign's exports read the held bytes; the adapters accept an `ArrayBuffer`. Review found
  two more re-reads on Redact's flow, the saved-file check and the details row; both read the held bytes too.
- [x] Unit tests, seen failing first: an export whose `File` rejects with `NotFoundError` succeeds in
  both tools, and two exports in a row from the same bytes both succeed (nothing detaches the buffer).
- [ ] A `docs/error-known-items.json` entry (area `redact`, step `export`, name `NotFoundError`) lands
  with the fix.
- [ ] The daily read shows no `NotFoundError` drop at `export` from a stamped build containing the fix.
