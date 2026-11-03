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
  separate pages; no zip), Share hands the whole set to the phone's share sheet, and each photo's
  preview has its own Save;
- changing the target recompresses the set;
- clicking a finished photo opens that photo in the single photo's own result view, compare slider
  and Full screen included, with a way back to the set.

The photo presets are 50, 100, 200 and 500 KB (500 replaced 20, which stays one typed number
away). A photo's Full screen, single or from a set, sizes the pair to the screen's width or height,
whichever it meets first, so nothing scrolls.

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

## Target design, second pass (Shlomi's try, 2026-11-03)

His read of the first build: the left-out line broke the card's margins, "All 12 photos" was hard to
find, and the list was cluttered (a status line and a Save on every row). The output is the centre
(guidelines §1), so the set shows as the photos themselves.

- **Strip** (rail top, as a single photo's, §18): the first photo as the 40px thumbnail, "12 photos",
  and once the set is finished "9.6 MB → 917 KB" with the citron "N% smaller" tag.
- **Stage, the set:** the status line, then a muted line for left-out PDFs when there are any, inside
  the stage, so nothing sits between the card's edge and its columns. Then a photo grid,
  `repeat(auto-fill, minmax(140px, 1fr))`, 12px gaps (on desktop, the column count that draws the
  whole set largest on the stage, 140 to 280px a tile, `lib/fitGrid.ts`): a square photo (cover, rounded) and one caption
  line under it, "2.77 MB → 80.8 KB" with the new size bold; "50.7 KB · unchanged" for a photo already
  under the target; the new size in danger ink for a missed one; "Couldn't read this one" for a
  failed one. Waiting photos are dimmed, the working one carries a small ring. A finished photo is one
  button, the whole tile. No per-photo Save in the grid. 12 photos fit at 1440x900 without scrolling;
  a longer set scrolls inside the stage on desktop.
- **Thumbnails** come from the originals as soon as the set is picked, one at a time, 320px JPEG
  (`renderThumbnail`), and never re-render on a target change. A tile holds its square before its
  photo arrives.
- **Stage, one photo:** a bar on top: "← All 12 photos" as a bordered button (36px face, 44px hit),
  the photo's name, then "‹ 3 of 12 ›" stepping through finished photos (disabled at the ends) and a
  bordered Save for that photo. Under it, the single photo's compare and Full screen, unchanged.

## Done when

- [x] Unit tests for the batch state (red first), the hook (`hooks/useImageBatch.test.tsx`) and the
      intake branch (`PdfCompressTool.test.tsx`, "COMP-04 several photos").
- [x] One e2e (`src/tools/compress/e2e/batch-images.spec.js`): several photos picked on `/compress-image/` each land at or under the target, with a
      row each, and Download saves them all.
- [x] English and Hebrew strings; one FAQ entry on `/compress-image/` about several photos.
- [ ] Shlomi has tried it and confirmed before it lands.
