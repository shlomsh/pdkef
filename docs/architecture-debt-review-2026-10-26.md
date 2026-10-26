# Architecture debt after the October tools (review of 2026-10-26)

A read-only review of `origin/main` at `275e2983`, covering the ~50k changed lines in `src/` since
2026-10-05 (Scan, Unlock/Protect, Compress Image, and polish across every tool). It looks for
non-functional debt only: components to unify, code to simplify, duplication, boundaries and style,
plus how code shape widens Nx affected. It is the context behind the `unify-and-narrow` lane; the
tickets (ARCH-34 to ARCH-40, DEBT-62, DEBT-63) carry the execution.

Five reviewers read disjoint lanes (simple tools + shell, lib + adapters, the editor stack, a
cross-tool comparison, Nx affected) and every finding quotes its line. The lead re-checked the
headline claims against the checkout; line numbers below are from `275e2983`. Nx counts are
*inferred* from an import graph and a commit replay, not from running `nx`.

## What holds up

- Redact goes through the shared editor core: registry renderers, drag and resize hooks, action
  history, draft persistence. Scan sits on shared shell and lib, not a parallel stack.
- No tool imports another tool, and no core project imports a tool.
- Merge, Split, Edit Pages, PDF to Image and Scan share one finish flow
  (`usePreparedOutput` -> `useDownloadFlow` -> `DownloadElement` / `FinishRow` / `PhoneFinish`).

## What does not, ranked

### 1. A loop between the core projects sends a third of commits wide (ARCH-34)

`site`, `editor`, `editor-ui`, `lib`, `shell`, `i18n` and `site-test` form one dependency cycle, so a
change to any of them reaches 23 of 24 projects. About 200 of the 582 commits in the window went
wide on e2e. The edges that close the loop:

- `src/i18n/toolMessages.ts` (2466 lines, 53 commits in the window) imports types from shell (`:21`)
  and editor (`:22`, `:1527`), and is imported by pages (`HomePageLayout.astro:35`,
  `localizedToolPage.ts:26`). See ARCH-35.
- `src/lib/signHelpers.js:1-2` imports `constants/signGeometry.js` and `editor/text/fonts.js`: lib
  reaching up into editor and site. Its consumers are Sign, editor and editor-ui only.
- `src/shell/pageWorkspace/PhoneFinish.tsx:2` imports `editor-ui/ExportHandoffs.tsx`.
- The `site` project (`src/project.json`, root `src`) swallows `src/data`, `src/site-lib` and
  `src/constants`; `signGeometry.js` and `data/tools.js` give editor, lib and i18n back-edges into it.
  A test-only import (`languageCoverage.test.js` -> `data/tools.js`) is the only `editor -> site` edge.
- `site-test` mixes test-support helpers (13 importing projects) with the repo-wide guards.

The reach walk adds its own widening: `affected-scope.mjs:295` treats any file outside the import
graph as unknown and goes wide, including CSS that `import-graph.mjs` already records and
`src/content/**` yaml. Unowned files (`ANALYTICS.md`, `public/images`, `public/.well-known`, `sw.js`)
force everything too. `site-e2e`'s implicitDependencies list every tool, so a tool-only commit runs
all 51 site-wide specs. `unit_paths` and the `test` targets in 18 project.json files are dead since
ARCH-28.

### 2. Three tools still hand-roll the finish flow (ARCH-36)

Compress, Image to PDF and Unlock/Protect each carry their own share handler, `saveHandoff`
navigation (`PdfSecurityTool` copies `useDownloadFlow.ts:148-170`) and the legacy `DownloadButton`.
`useImagesPdfBuild.ts` (111 lines) is a second `usePreparedOutput`. `PdfCompressTool.tsx` is 1237
lines with its own quiet preparer and `a[download]` delivery. PDF to Image passes dummy props to
`FinishRow` (`PdfToImageTool.tsx:441-446`).

### 3. Opening a file is written five times (ARCH-37)

- Split (`:115-175`), Edit Pages (`:93-153`) and PDF to Image (`:98-152`) paste the same ~60 lines:
  picked-file guard, encryption probe, repaired copy, lazy `PageGrid`.
- `PdfSignTool.tsx` (1201 lines) and `PdfRedactTool.tsx` (1421 lines) duplicate the session skeleton:
  load, add files, recents, unique ids, draft persistence. They have drifted: only Sign handles
  `launchQueue`, Redact's announcements are hard-coded English, and Redact's comment at `:420` reads
  "Mirrors PdfSignTool.tsx's own invalidation effect". Sign hand-rolls export request ids
  (`:283-292`) where Redact uses `lib/useLatestRun`.
- Smaller copies between the two editors: the fullscreen toggle, the undo/redo pair, two
  `useCoarsePointer` hooks with different semantics (`sign/useCoarsePointer.ts`,
  `redact/RedactBoxBar.tsx`).

### 4. Adding a tool means editing about nine lists (ARCH-38)

`ANALYTICS_TOOLS`, `RATING_TOOLS`, `PAGE_SLUGS`, `CAPABILITIES`, `LOCALIZED_TOOL_ISLANDS`,
`toolMessageTables`, `RETURN_TO`, and `HANDOFF_HREFS`, declared separately in Split (`:44`), PDF to
Image (`:46`), Edit Pages (`:42`), Merge (`:199`) and Scan (`:42`). The "save hand-off, then navigate"
code is copied 7 times (`useDownloadFlow`, `NeedsUnlock`, Image to PDF, Unlock, Sign, Redact,
`FileDropzone`). `ToolPageLayout` and `ToolHero` special-case `sign`/`redact`/`merge` by slug.

### 5. PDF primitives are repeated in lib and the tools (ARCH-39)

- `getPdfjs()` is memoized four times: `compress.js:10`, `toImage.js:11`, `lib/thumbnails.js:13`,
  `editor/adapters/pdf/pdfjsLoader.js:5`. Only thumbnails shares a worker.
- The white-filled page-to-canvas render is written five times (`thumbnails.js:103`,
  `compress.js:65`, `:243`, `toImage.js:54`, `rasterPage.js:43`); only the editor's clamps the area.
- Five recipes open a document with pdf-lib; the empty-password retry is in `compressImages.js:117`
  and `PdfCompressTool.tsx:497`, and the page-tree repair runs for Split and Edit Pages only.
- File/ArrayBuffer-to-bytes is written five ways (`deleteObjects.js:35`, `:644` use a cross-realm
  unsafe `instanceof ArrayBuffer`); 13 hand-written `AbortError` throws carry five messages.
- `lib/thumbnails.js` does four jobs in 390 lines; `pdfObjects.js` is 1335 lines.

### 6. Tool text follows four conventions (ARCH-35)

`i18n/toolMessages.ts` is one 2466-line table; Sign uses `SignMessages`, Scan `scanMessages.ts`, Edit
Pages a private non-localizable `messages.ts`, and Unlock/Protect (~25) and Redact (including
"Undid:"/"Redid:" in `redactState.ts:455/471`) inline English. Splitting the table per tool is also
the largest single cut to the core loop in section 1.

### 7. Small seams (ARCH-40)

- Dead: `flattenPdf` and `rasterizeAllPages` (`flatten.js`) have only test callers.
- Stale: `toolPage.css:71` and `sitemap.xml.js:138` name the deleted `[locale]/[tool].astro`.
- Wrong: `split.js:12-14` says Compress names output `compressed_x.pdf`; it writes `x-compressed`.
- Scan's photo tiles were cloned from Image to PDF (Sortable config, focus, accepted types, tile CSS);
  there are 5 `Sortable.create` sites. `.loaded-layout` and `.result` are re-declared in 3 modules.
- Merge re-implements `moveEntry` and the sort chain (`PdfMergeTool.tsx:742-785`) that
  `lib/pageOrder.js` has; `pagePlan.ts` exports a second `moveEntry` with another signature.
- About 20 ad-hoc breakpoints and a few raw colour literals (`#8a221c`, `#6b1813`).

## Two findings that may be bugs (DEBT-62, DEBT-63)

- Six tools accept only `f.type === 'application/pdf'` (Split `:117`, Edit Pages `:94`, PDF to Image
  `:99`, Unlock/Protect `:137`, Sign `:540`, Redact `:503`), while Compress and Merge use
  `lib/fileKind.js` `deriveFileKind`. A PDF the browser reports with an empty type would be dropped
  silently by six tools and accepted by two.
- Compress renders at scale up to 2.0 (`compress.js:31-38`) and PDF to Image stacks pages into one
  canvas (`toImage.js` `stackCanvases`) without the `MAX_CANVAS_AREA` clamp that only
  `editor/adapters/pdf/rasterPage.js:9` applies. A very large page could exceed the browser's canvas
  limit.

Both are unconfirmed; each ticket starts from a test that must fail first.

## Open product question

Output names follow six conventions (`merged_x`, `extracted_x`, `x-compressed`, `x_modified`,
`x_unlocked`, ...) through seven copies of a base-name regex. Which convention is right is a product
call for Shlomi; ARCH-38's shared filename helper can carry either.
