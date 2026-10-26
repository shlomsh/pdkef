---
id: "ARCH-36"
title: "Compress, Image to PDF and Unlock/Protect finish through the shared flow"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
order: 5
depends_on: []
---

# ARCH-36 · Compress, Image to PDF and Unlock/Protect finish through the shared flow

*Filed 2026-10-26* from the architecture review ([docs/architecture-debt-review-2026-10-26.md](../../docs/architecture-debt-review-2026-10-26.md), section 2).

## Why

Merge, Split, Edit Pages, PDF to Image and Scan finish through `usePreparedOutput` ->
`useDownloadFlow` -> `DownloadElement` / `FinishRow` / `PhoneFinish`. Compress, Image to PDF and
Unlock/Protect each hand-roll the same share ladder, the `saveHandoff` navigation and the legacy
`DownloadButton`. `useImagesPdfBuild.ts` (111 lines) re-implements `usePreparedOutput`, and
`PdfCompressTool.tsx` (1237 lines) has its own quiet preparer and `a[download]` delivery. PDF to Image
passes dummy props to `FinishRow` (`PdfToImageTool.tsx:441-446`).

## Outcome

- The three tools use `usePreparedOutput` and `useDownloadFlow`; `usePreparedOutput` grows what
  Compress needs (a result meta field) rather than Compress keeping a copy.
- `DownloadButton` and `useImagesPdfBuild.ts` are deleted; Compress's compare previews move into
  their own hook, and the island is a thin component.
- `FinishRow` takes only what each tool really has, so no caller passes placeholders.
- Download, share and hand-off telemetry is the shared flow's, identical across all eight tools.

## Acceptance

- [ ] No import of `DownloadButton` remains; `useImagesPdfBuild.ts` is gone.
- [ ] Each of the three tools' existing e2e and unit tests pass unchanged, plus a unit test per tool
      for share-cancelled and share-failed through the shared flow.
- [ ] Verified on a production build on a phone width and a desktop width for each of the three.

## Progress (part B: Image to PDF, Unlock/Protect, FinishRow)

- Done: `FinishRow` takes only what a tool has: `busy`, `onHandoff` and the Compress/Sign labels are
  optional, and the row is just Share when there is no `onHandoff`. PDF to Image no longer passes
  placeholders. Unit test seen red first.
- Decision (lead): logic only. Image to PDF and Unlock/Protect keep their visible `DownloadButton`
  (markup, classes, labels, busy state); what is shared is the preparer, the share ladder, the
  save-hand-off-then-navigate and telemetry. `DownloadElement` is not adopted.
- Done: `useDownloadFlow`'s `HandoffHrefs` is a partial map over `HandoffTool`, which now includes
  `redact` and `edit-pdf` (Unlock's targets); unit test seen red (3 ts errors) first. `FinishRow` indexes
  its icons and labels as partial maps so the wider type compiles.
- Done: Image to PDF builds with `usePreparedOutput` and shares, records and delivers through
  `useDownloadFlow`; `useImagesPdfBuild.ts` is deleted (tool 524 lines across island and hook, now 428).
  Kept local: the Scan hand-off (it parks the source images, not the output) and the first-build-at-once
  rule (one effect calling `prepareNow`). Unlock/Protect shares, records and hands off through the flow
  (its own copy of the hand-off logic is gone); the output is produced on password submit, so it hands the
  flow a ready/idle `prepared` of its own rather than using `usePreparedOutput`.
- Telemetry names unchanged: `download`, `share`, `export` (the flow records `download` and `share`; the
  islands still record `export`).
- Open: `docs/module-boundaries.md` rows for `imagesToPdf.js` and `pageOrder.js` still name
  `useImagesPdfBuild.ts` (outside this fence).