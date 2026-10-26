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

## Progress (part A: Compress)

- Done: `usePreparedOutput` carries an optional generic `meta` beside the blob (`Built<M>` returns it,
  `PreparedOutput<M>.meta` reads it back; null until ready and withdrawn with the blob), unit tested.
- Done: Compress's compare previews live in `src/tools/compress/useComparePreviews.ts` with a unit test;
  `PdfCompressTool.tsx` went from 1237 to 1010 lines.
- Open: moving Compress's delivery onto `usePreparedOutput` + `useDownloadFlow` + `DownloadElement` /
  `FinishRow` / `PhoneFinish` needs decisions first (see the hand-back): `DownloadElement` takes
  `DownloadMessages` that `CompressMessages` lacks (`savedLabel`, `downloadAgain`, ... in English and
  Hebrew), `PhoneFinish` needs a `PageWorkspace` phone bar Compress's layout does not have, and
  Compress's unit and e2e specs locate `DownloadButton`'s markup (`.download-button`, `a[download]`,
  the `Download Compressed PDF` link name).
