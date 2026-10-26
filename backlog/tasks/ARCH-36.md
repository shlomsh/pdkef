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

## Progress (part A: Compress)

- Done: `usePreparedOutput` carries an optional generic `meta` beside the blob (`Built<M>` returns it,
  `PreparedOutput<M>.meta` reads it back; null until ready and withdrawn with the blob), unit tested.
- Done: Compress's compare previews live in `src/tools/compress/useComparePreviews.ts` with a unit test;
  `PdfCompressTool.tsx` went from 1237 to 1010 lines.
- Done (logic only, no visible change, lead's decision): Compress builds through `usePreparedOutput` (sizes, level
  flags and file name ride in `meta`; the encryption gate is `autoBuild` closed, a new file is a new key) and
  delivers through `useDownloadFlow` (tap, deliver-when-ready, Share ladder, `recordAction('download'|'share')`),
  still rendering `DownloadButton`. `useLastResult.ts` keeps the last landed result on screen while a new build
  runs. `usePreparedOutput` gained `onReady` and registers a key while rendering. Not adopted: `DownloadElement`,
  `FinishRow`, `PhoneFinish`. Hand-offs are passed as empty strings until `HandoffHrefs` is made partial.

## Review fixes

A reviewer found four regressions from moving Compress, Image to PDF and Unlock/Protect onto
`usePreparedOutput` and `useDownloadFlow`. Each fix started as a test seen failing.

- Compress hung on "processing": re-clicking the selected target preset bumped the run token under a build
  in flight, the build threw its supersede AbortError, and the unchanged key was never rebuilt. Compress's
  option handlers now return early for an unchanged value, and `usePreparedOutput` re-arms the current key
  once (per key change) when its build aborts with nothing newer queued, so a supersede that left the key
  alone cannot strand it. A build that always aborts runs twice, not forever.
- Replaced files' results stayed cached: `usePreparedOutput` takes an optional `cacheScope`; when it changes
  the result cache is cleared (`clearCache()` on the quiet preparer). Compress, Split, Edit Pages and PDF to
  Image pass their load id or file number.
- `useDownloadFlow`: a superseded hand-off no longer clears `handoffBusy` for the newer run, on failure or on
  a refused `proceed`; `reset()` clears it itself.
- The ready-tap `announce(messages.ready)` predates this branch (GRID-04, Merge's flow), so the flow is kept.
  Image to PDF's own announce now says an unchanged ready message once instead of alternating a trailing
  no-break space on every tap.
