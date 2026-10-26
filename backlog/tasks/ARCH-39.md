---
id: "ARCH-39"
title: "One set of PDF primitives in lib"
status: "in_progress"
priority: "P2"
epic: "unify-and-narrow"
horizon: "next"
order: 8
depends_on: []
---

# ARCH-39 · One set of PDF primitives in lib

*Filed 2026-10-26* from the architecture review ([docs/architecture-debt-review-2026-10-26.md](../../docs/architecture-debt-review-2026-10-26.md), section 5).

## Why

`getPdfjs()` is memoized four times (`compress.js:10`, `toImage.js:11`, `lib/thumbnails.js:13`,
`editor/adapters/pdf/pdfjsLoader.js:5`) and only thumbnails shares a worker. The page-to-canvas
render is written five times. pdf-lib documents open through five recipes, with the empty-password
retry duplicated and the page-tree repair applied to Split and Edit Pages only. Bytes conversion is
written five ways (two use a cross-realm unsafe `instanceof ArrayBuffer`), and 13 hand-written
`AbortError` throws carry five messages.

## Outcome

- One pdf.js loader with one shared worker, one `renderPageToCanvas` (white fill, the canvas cap from
  DEBT-63), one `openPdfDoc(bytes, { encryption, repair })`, one `toBytes()` and native
  `signal.throwIfAborted()` (or one small helper), each with every caller moved onto it.
- `lib/thumbnails.js` keeps only thumbnails; the other jobs it carries move to the modules above.
- Source-grep guards (in the style of `pdfjsWasm.test.js`) stop a second pdf.js loader or a
  hand-written `AbortError`.

## Acceptance

- [ ] The guards were red on the old code and are green.
- [ ] Every tool's unit tests and the export e2e guards pass; Compress and PDF to Image output is
      byte-identical for the existing fixtures.
- [ ] Merge and Split's export decide on the page-tree repair deliberately, recorded in this ticket.

## Progress

*2026-10-26*, first pass (lib, adapters and non-island modules; island files were fenced to another agent).

**Primitives, all in `src/lib/`**

- `loadPdfjs.js` `getPdfjs()`: the only `import('pdfjs-dist')`, memoized, a failed import is not cached. `vi.mock('pdfjs-dist')` still reaches it (Vitest mocks by module id), so no test needed rewiring for the loader. `editor/adapters/pdf/pdfjsLoader.js` is now a re-export (many tests mock that path). `thumbnails.js` no longer exports `getPdfjs`; `pdfEncryption.ts` imports it from `loadPdfjs.js`. The shared worker stays in `thumbnails.js` (its only consumer of `PDFWorker`).
- `renderPage.js` `renderPageToCanvas(page, { scale, rotation, background = '#ffffff', signal })`: `clampScaleToCanvas`, background fill (`null` leaves it transparent), render, `signal` cancels the RenderTask. Callers: `thumbnails.js`, `compress.js` (both), `toImage.js` (PNG passes `background: null`, so a PNG keeps its transparency exactly as before), `rasterPage.js`. `compressRenderScale` and `pageRenderScale` are deleted; their tests moved to `canvasLimits.test.js`. `stackedRenderScale` stays.
- `openPdfDoc.ts` `openPdfDoc(input, { encryption: 'throw' | 'ignore' | 'empty-password', shouldUnlock, password, repair, updateMetadata, fast })` returns `{ doc, bytes, repaired, pageCount, encrypted, unlocked }`. `loadPdfWithPages` is now its `{ encryption: 'ignore', repair: true }` preset. Moved: `compressImages.js` (empty-password retry, the Standard-handler check is its `shouldUnlock`), `split.js`, `merge.js` (`loadSourceDoc`), `security.js`, `deleteObjects.js` (two), `redact.js`, `sign.js`, `readDetails.ts`, `runCheck.ts`, `readSavedFile.ts`.
- `toBytes.js` `toBytes(input)`: File/Blob/ArrayBuffer/typed array/DataView to Uint8Array, no `instanceof`. `listDeletableObjects` used `file instanceof ArrayBuffer`, which is false for a buffer from another realm, so it fell through to `file.arrayBuffer()` and threw.
- `abort.js` `throwIfAborted(signal)`: throws `signal.reason` (an AbortError DOMException by default), or a fresh AbortError for a bare `{ aborted: true }`. A small helper rather than native `signal.throwIfAborted()` because callers pass no signal and tests pass bare objects. Replaced in `thumbnails.js` (7), `merge.js`, `split.js`, `editPages.js`, `toImage.js`, `imagesToPdf.js`, `scanPipeline.ts`. Nobody aborts with a custom reason (`grep '.abort(.'` in src finds none), and every catcher (`usePreparedOutput.ts`, `useImagesPdfBuild.ts`, `usePdfShare.js`, `maintenanceTelemetry.ts`, `PdfCompressTool.tsx:754`, `PdfScanTool.tsx:298`) tests `err.name === 'AbortError'`, which still matches. Messages changed from five wordings to the platform's one; no test or UI read them.

**Guards** (`src/lib/pdfPrimitives.test.js`): one `import('pdfjs-dist')` and no second `getPdfjs`; no hand-built AbortError; no `instanceof ArrayBuffer`. Red on the old code (compress, toImage, thumbnails, pdfjsLoader; imagesToPdf, thumbnails, editPages, merge, scanPipeline, split, toImage; deleteObjects), green now. The AbortError guard carries a commented allowlist of the one fenced offender.

**Byte-identical output**: a scratch Vitest (not committed) ran `compressPdf` at three levels, `compressPdfToTarget` and `convertPdfToImages` (PNG and JPEG, separate and stacked, with a rotation) over `num-1.pdf` and `num-5.pdf` with the existing canvas stubs, logging every canvas size, `fillStyle`, `fillRect`, `drawImage` and `toBlob` call. Before and after: identical logs and identical blob hashes. `rasterBytes` moves by 1 byte between runs of the same code (pdf-lib stamps the time), so it was excluded. jsdom stubs the canvas, so real pixels are covered by the export e2e guards, which the lead runs.

One deliberate behaviour change: `rasterPage.js` (Redact's flatten) now fills white behind the page like every other render. It used to leave a transparent page black after JPEG encoding.

**Fenced call sites left for the island pass**

- `src/tools/compress/PdfCompressTool.tsx:497-501`: the second empty-password retry; becomes `openPdfDoc(bytes, { encryption: 'empty-password', updateMetadata: false })` and keep the first read when `unlocked` is false.
- `src/tools/scan/PdfScanTool.tsx:213, 329, 333`: hand-written `AbortError`; use `throwIfAborted` (213 and 333 have an extra condition, so `if (cond) throw new DOMException(...)` becomes a thrown `signal.reason`/helper call). Then empty `FENCED_ABORT_ERROR` in the guard.
- `.arrayBuffer()` reads that could use `toBytes` (none has the `instanceof` bug): `PdfEditPagesTool.tsx:120`, `PdfSplitTool.tsx:140`, `PdfToImageTool.tsx:120`, `PdfCompressTool.tsx:494,526`, `PdfSignTool.tsx:562`, `PdfRedactTool.tsx:519`, `PdfSecurityTool.tsx:155`, `PdfMergeTool.tsx:365`.
- `src/editor-ui/PdfPageCanvas.tsx:53-75`: an on-screen render into a given canvas with its own bucketed scale and no white fill; not a `renderPageToCanvas` caller by design.

**Merge and Split page-tree repair decision**: Split and Edit Pages repair at intake (`loadPdfWithPages` in the island) and hand the repaired file on as the working file, so `splitPdf` and `editPages` export from bytes that are already repaired; a second repair in the export would never fire. Merge does not repair, deliberately: a lost `/Pages` makes `inspectPdf`'s `getPageCount()` throw and the file is reported as damaged (`MergeFileError`, reported, not filtered), and a repair there would need repaired bytes carried through the grid thumbnails, the plan and `mergePdfs`, which is island work with its own tests. Nothing changed; if Merge should repair, it is a new ticket with a Merge-side intake step.

Also changed in passing: `useDeletableObjects.js` keeps the same empty array on a failed scan (`setObjects((prev) => (prev.length ? [] : prev))`), because the real listing now fails later than before on a stub file and its fresh `[]` re-rendered Redact mid-test; two tests that relied on a missing mock export (`PdfEditPagesTool.repair.test.tsx`, `PdfCompressTool.protected.test.tsx`) say what they mean now.

*2026-10-26*, island pass.

- `PdfCompressTool.tsx` `analyzeInner`: the empty-password retry is `openPdfDoc(pdf, { encryption: 'empty-password', updateMetadata: false })`. Pinned by the two existing tests ("re-reads an encrypted PDF with an empty password", "keeps the first read when the re-read throws"), green before and after. Its `superseded()` now throws through `throwIfAborted`.
- `PdfScanTool.tsx`: the three hand-written AbortErrors use `throwIfAborted` (the key-superseded and unmounted conditions pass a bare `{ aborted }`); the catcher still tests `err.name === 'AbortError'`.
- `FENCED_ABORT_ERROR` and `FENCED_PDFJS_LOADER` are gone from `pdfPrimitives.test.js`; no allowlist is left.
- Left on `.arrayBuffer()` deliberately: every remaining island read (`useOpenPageDocument.ts`, `useEditorFileSession.ts`, `PdfCompressTool.tsx` checkEncryption, `PdfMergeTool.tsx`, `PdfSecurityTool.tsx`) hands an ArrayBuffer to `probeEncryption`/pdf.js or to ArrayBuffer-typed state (`needsUnlock.bytes`, `loadPdf(selected, bytes: ArrayBuffer)`), so `toBytes` would add a conversion back. Redact, Sign, Split, Edit Pages and To Image no longer read the file themselves.
- `PdfPageCanvas.tsx` stays as the first pass decided.
