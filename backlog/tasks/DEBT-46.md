---
id: "DEBT-46"
title: "Split counts started on the person's Download or Share, not on each background prepare"
status: "done"
priority: "P3"
epic: "robustness"
depends_on: []
---

# DEBT-46 · Split's usage funnel counts the person's action

*Filed 2026-10-04 as DEBT-40, renumbered 2026-10-12 because the number was reused; the same problem showed again in the 12 Oct read (11 started, 1 ready).* The daily error read showed Split at 1 accepted, 6 started, 0 ready on 4 Oct.
`PdfSplitTool.tsx` mapped `status === 'preparing'` to `processing`, so every option change that
rebuilt the output on idle reported `tool_operation_started`. Merge had the same shape and fixed it in
MERGE-12; Split follows that model.

## What to build

A `tap` state in `PdfSplitTool` (`idle | processing | done`), passed to `BasePdfTool` as
`analyticsStatus` (or `error` while the prepare has failed, as Merge does). A Download tap, or a
completed Share, sets `processing` for one render and then `done` once delivered; a tap during
`preparing` stays `processing` until the queued download goes out. Background prepares report nothing.

## Acceptance

- [x] A test seen failing first: changing the page selection or mode with a file open reports no
      `tool_operation_started`.
- [x] A Download tap on a ready output reports started then ready, once each; a second tap after a
      change reports them again.
- [x] A tap while preparing reports started at the tap and ready when the queued download is delivered.
- [x] A shared result reports started then ready.
- [x] `ANALYTICS.md` decision log has the 2026-10-04 row.
