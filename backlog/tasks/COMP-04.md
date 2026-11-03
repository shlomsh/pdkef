---
id: "COMP-04"
title: "Compress Image takes many photos at once: one KB target, a row per photo, Download saves them all"
status: "in_progress"
priority: "P2"
epic: "polish"
horizon: "now"
order: 1
---

# COMP-04 · Compress several photos to one size limit

*Filed 2026-11-03,* from Shlomi's question about a Ministry of Justice portal upload: a folder of
photos and scans, each with its own per-file size cap. Compress Image took one file at a time.

## Outcome

On `/compress-image/` (and anywhere the Compress island runs), picking or dropping two or more JPG
or PNG files, or a folder of them, opens a batch view instead of the single-photo view:

- one KB target for the whole set, the same size panel and presets as a single photo;
- every photo goes through the unchanged per-file search (`compressImageToTarget`), one at a time;
- a row per photo with its original size, its new size, and whether it came in at or under the
  target. A missed target keeps the smallest result found, as a single photo does; a photo already
  under the target is kept as it is; a file that cannot be read says so and is left out;
- Download saves every result, one file after another (the same delivery PDF to Image uses for
  separate pages; no zip), Share hands the whole set to the phone's share sheet, and each row has
  its own save link;
- changing the target recompresses the set.

One file keeps today's single-photo view, compare slider and all. The PDF path stays single-file:
PDFs in a mixed drop are skipped and named, as any other unaccepted file is.

## Design

- `src/tools/compress/state/imageBatch.ts`: the pure batch state (rows, target, run token) and its
  selectors (next row, summary, output parts with unique names). Unit tested.
- `src/tools/compress/hooks/useImageBatch.ts`: runs the rows in order through
  `compressImageToTarget`, drops a result whose run went stale, and adapts the set to the
  `PreparedOutput` shape so `useDownloadFlow`, `ResultSheet` and `PhoneFinish` deliver it unchanged.
- `src/tools/compress/components/BatchList.tsx`: the rows, in the result area.
- `useFileIntake` sends two or more images to the batch, anything else down today's path.
- `BasePdfTool` gains `intake.pickMany`: the picker takes several files while the tool keeps
  single-file replace semantics. Only `/compress-image/` turns it on; a drop works on both pages.

## Done when

- [x] Unit tests for the batch state (red first), the hook (`hooks/useImageBatch.test.tsx`) and the
      intake branch (`PdfCompressTool.test.tsx`, "COMP-04 several photos").
- [x] One e2e (`src/tools/compress/e2e/batch-images.spec.js`): several photos picked on `/compress-image/` each land at or under the target, with a
      row each, and Download saves them all.
- [x] English and Hebrew strings; one FAQ entry on `/compress-image/` about several photos.
- [ ] Shlomi has tried it and confirmed before it lands.
