# Module boundaries: target layout, dependency rules, and the ratchet that gets there

Filed under ARCH-15, out of the 2026-09-13 CI review. This is the design record ARCH-16 through
ARCH-20 and QUAL-05 execute against. It does not move a single file; it says where every file in
`src/components/` ends up, which `src/lib/` modules travel with which tool, what already breaks the
rules today (so the checker can be green from day one), and what still needs a human decision this
ticket does not make.

Related but narrower: [docs/editor-module-boundaries-plan.md](./editor-module-boundaries-plan.md)
(ARCH-01 through ARCH-11) drew the boundaries *inside* `src/editor/` (model/geometry/text/registry/
workspace/pdf-adapter) and is enforced by `scripts/check-editor-dependency-directions.mjs`. This
record is one level up: the folders `src/` itself is cut into, and the tool-to-tool, tool-to-shell
and editor-to-tool edges that the inner plan does not cover. The two checkers stay separate; nothing
here replaces `test:editor-dependency-directions`.

## Target layout

```
src/shell/       BasePdfTool, ToolShell, FileDropzone, DownloadButton, PdfShareButton, Popover,
                 ErrorMessage, ProgressRing, DropzoneEmptyState, RecentFiles, FilePreview,
                 ConfirmDialog, homeWorkspace, sampleDocument         (imports no tool)
src/editor/      the headless core, leaks fixed (ARCH-19)
src/editor-ui/   ElementToolbar, ElementResizers, FontPickerMenu, ColorPicker*, ThicknessPickerMenu,
                 ArmHint, EditorToolStatus, EditorExportActions, EditorPageHeader, FullscreenButton,
                 ViewControl, UndoHistoryModal, PdfPageCanvas,
                 SignatureDialog                                       (shared by Sign and Redact)
src/tools/<t>/   the island, its components, its lib modules, its unit tests, its e2e specs;
                 one folder per tool: merge, sign, redact, compress, split, edit-pages, to-image,
                 image-to-pdf, security (redact owns DeletableObjectOverlay/DeleteMark - see ARCH-17
                 below, not shared with Sign)
src/lib/         the genuinely shared modules only (about eight today)
site             src/pages, src/content, src/data, src/i18n, src/layouts, src/styles and the
                 .astro components, as today
```

This is ARCH-15's own text, unchanged; everything below is the working-out.

## Dependency rules

1. A tool may import `shell`, `editor-ui`, `editor`, `lib`, and site's `i18n`/`data`. A tool may
   never import another tool.
2. `shell`, `editor-ui`, `editor` and `lib` may never import a tool, and may never import the
   `components` module (see below). They may import site's `i18n`/`data` (`site-i18n`/`site-data`),
   but never `site` itself (pages/layouts/content/styles).
3. `editor` may never import `editor-ui` or `shell`. It is headless; Preact only renders from its
   state and binds events to it.
4. The site (pages, layouts, content, data, i18n, styles, and the `.astro` files still under
   `src/components/`) may reach a tool only through that tool's island entry point, `Pdf*Tool.tsx`
   directly under `src/tools/<name>/`.
5. **`components` is what is left of the flat `src/components/` now that ARCH-16 through ARCH-18
   have landed:** only `.astro` site components (which classify as `site`, not `components`) and
   `HeroDemo/` remain there. `components` MUST NOT import a tool. The reverse allowance this rule
   used to carry - "a tool MAY import `components` during the transition, because that folder is
   where the future `shell` and `editor-ui` still live" - retired the moment ARCH-16 gave `shell`
   and `editor-ui` their own folders; rule 1's list is exhaustive and does not include `components`,
   so a tool importing it is now a violation like any other not on that list.
6. **A test file may not launder a cross-tool import a real edge in the same location would be
   forbidden from making** (DEBT-02, out of the 2026-09-14 architecture-debt review): a test under
   `shell`, `editor-ui`, `editor` or `lib`, or under one tool's own `src/tools/<name>/` folder, may
   not import another tool's files. `src/test/` (including `src/test/cross-tool/`, the placement
   `docs/nx-affected-ci.md` already asked for) is exempt: a test placed there classifies as
   `test-support`, neither a core module nor a tool, so the rule never reaches it. Unlike rules 1-5,
   rule 6 carries no allowlist - it holds at zero violations, not a ratchet down from today's count.
7. **A `*.spec.js` under `src/tools/<t>/e2e/` may only reference that tool's own routes, plus `/`.**
   The tool -> routes map is derived, never hand-written: a top-level `src/pages/<slug>.astro` that
   imports `../tools/<t>/Pdf*Tool` maps route `/<slug>` to tool folder `<t>` (so `/compress/` and
   `/compress-image/` both belong to `compress`, `/unlock/` to `security`, `/pdf-to-image/` to
   `to-image`, `/edit-pdf/` to `edit-pages`). A route may appear as a string literal, a template
   literal, or inside a regex literal, with or without a trailing slash and optionally behind a
   locale prefix (`/he/redact`); comments are stripped first, so a route named only in prose never
   counts. A spec that genuinely needs another tool's page - `toolbar-touch-targets.spec.js` driving
   both `/sign` and `/redact`, `merge-handoff.spec.js` ending on `/compress/` - belongs under `e2e/`
   instead of a tool's own `e2e/` folder (DEBT-01).

`scripts/check-module-boundaries.mjs` enforces exactly these seven rules; its header comment is the
canonical copy; keep this section and that comment in sync by hand; the classification table in the
script is data (an ordered list of path prefixes), so landing ARCH-16/17/18 is "add or edit one row,"
never "teach the script a new rule." Rule 7 is a separate pass (`toolSpecRouteViolations()`,
`specRouteViolation()`) rather than an edge in the same import graph, since it scans spec text for
route mentions instead of import specifiers.

**DEBT-04:** `src/editor/registry/types.ts` used to import the `SignMessages` type from
`src/i18n/toolMessages.ts` - an `editor -> site-i18n` edge none of the seven rules above actually
covers, so `check-module-boundaries.mjs` never flagged it even though it made the headless core
depend on the site's message shape. The interface now lives in `src/editor/registry/messages.ts`;
`i18n` imports and re-exports it, so the editor imports nothing from `i18n`.

## Evidence

Measured on this checkout (`arch-15`, forked from `main` at `d9a689a`, four commits after the
`4ca0e26` the ticket measured on; none of the four touch `src/lib/`, `src/editor/` or the flat
`src/components/` tree in a way that would move these numbers) with a throwaway script that resolves
every relative `import`/`export ... from`/dynamic `import()` in `src/**/*.{ts,tsx,js,jsx,astro}` the
same way `check-module-boundaries.mjs` does (including a `.js` specifier that resolves to a `.ts`
file, which the ticket's own predecessor guard already handles and this one had to learn too):

- **246 files, 783 resolved relative import edges** in the scanned graph.
- `src/components/` has **117 raw filesystem entries** (82 distinct components once a
  `.test.tsx`/`.module.css` companion is folded into its base name). The ticket's "about 70" is in
  the right neighborhood; the gap is almost certainly counting method (raw file count vs. distinct
  component identity), not drift between `4ca0e26` and this checkout.
- **33 edges violate the five rules above** on this checkout: 24 from flat `components` files into
  `MergeTool/`or `SignTool/` (rule 5), 1 tool-to-tool edge (`src/components/MergeTool/useMergeDraft.ts`
  importing `src/components/SignTool/useDraftPersistence.js` - rule 1, and not one the ticket
  mentioned by name; see Surprises), and 8 from `src/editor/` into `src/components/` (rule 2/3). All
  33 are on `scripts/module-boundaries-allowlist.json` today, and `npm run test:module-boundaries` is
  green with them there.
- `src/lib/` has **46 non-test modules**: 13 have three or more consumers among islands/editor files,
  15 have exactly one, and 10 have none at all among islands/editor (their only consumers are other
  `src/lib/` files, or nothing in `src/`). See Surprises for how these compare to the ticket's 8/15/14.

### Surprises versus the ticket's numbers

- **`model/editorModel.ts` does not import from `src/components`.** The ticket lists it as one of
  "four" editor files that leak into components. On this checkout it is a types-only file; the only
  mention of `src/components` is a doc comment pointing at where the fields it describes get
  *rendered* (`// - rendering: src/components/SignTool/nodes/*.tsx.`), not an import. The real count
  is **three** files (`registry/renderers.ts`, `registry/text.ts`,
  `workspace/useEditorDraftPersistence.ts`), eight edges. ARCH-19's scope should drop the
  `editorModel.ts` line item, or re-verify it fresh before starting, in case a file changed between
  `4ca0e26` and whatever commit ARCH-19 starts from.
- **A fourth violation the ticket did not name:** `src/components/MergeTool/useMergeDraft.ts` imports
  `src/components/SignTool/useDraftPersistence.js` (for `RESTORE_TIMEOUT_MS`, on inspection). That is
  a real tool-to-tool edge, Merge depending on Sign, not just the "components cycle" the ticket
  described. It is allowlisted alongside the rest; ARCH-18 should look at it specifically, since it
  will not resolve itself the way the flat-file violations do when Merge and Sign both move (they
  become two different `tool:` modules, and this edge stays a real tool-to-tool violation until
  someone moves the constant somewhere both can reach, e.g. `src/editor/workspace/`).
- **The lib consumer counts are close but not identical:** 46 modules matches exactly; "15 have
  exactly one consumer" matches exactly; "3+ consumers" is 13 here against 8 in the ticket, and "no
  island/editor consumer" is 10 here against 14. The likely cause is methodology, not code drift: the
  ticket's count of 8 modules with 3+ consumers looks like it may not count `src/editor/registry/*`
  files as consumers (only `src/components/`), which would move `signHelpers.js` out of the "3+" tier
  in their count; recompute before relying on the exact numbers, but treat the shape (most lib modules
  are single-tool or zero-tool, a handful are genuinely universal) as solid either way.
- **Two of the checker scripts named in the ticket's Notes need no change at all.**
  `scripts/check-gesture-golden-rule.js` walks `src/` generically (`readdirSync` from `path.join(__dirname, '..', 'src')`,
  no hardcoded subfolder) and `scripts/check-class-resolution.js` has no `src/components` literal
  either. Both are already move-proof. Keep them off the actual work list for ARCH-16/17/18; the
  ticket listed them defensively and it cost nothing to verify, but there is nothing to do there.
- **`vitest.config.js`'s `DOM_TESTS` needs less than ARCH-17 assumes, and one thing more.** The line
  `'src/**/*.{test,spec}.{jsx,tsx}'` is already a repo-wide catch-all for `.tsx`/`.jsx` tests, so
  `src/tools/**/*.test.{tsx,jsx}` (ARCH-17's planned addition) is already covered; adding it is a
  no-op, not a fix. What actually needs attention is the `.js` list:
  `'src/lib/{compress,compressImage,thumbnails,toImage}.test.js'` is a literal path list, not a
  glob pattern with a wildcard folder, so `compress.test.js` and `compressImage.test.js` (single-tool,
  see the consumer table) moving into `src/tools/compress/` and `toImage.test.js` moving into
  `src/tools/to-image/` will silently stop getting jsdom unless this line is rewritten - `thumbnails.test.js`
  stays in `src/lib/` (multi-tool consumer, see below) so at least one entry survives unchanged.
- **No CSS Module in this tree uses a cross-file `composes: X from './other.module.css'`.** Every
  `composes:` in the repo composes a class defined in the same file. That is one less hazard ARCH-16
  has to worry about when it moves CSS Modules into `src/shell/`/`src/editor-ui/`: a relative import
  in the `.tsx` that pulls in a `.module.css` is the only path that needs rewriting, not a path buried
  inside a stylesheet.

## Per-file move table for `src/components/`

Grouped by destination. A `.test.*`/`.module.css` companion moves with its file unless noted. "single
consumer" in the tool tables below cites the import graph as of this checkout.

### `src/shell/`

`BasePdfTool.{tsx,test.tsx}`, `ToolShell.{tsx,module.css}`, `FileDropzone.{tsx,test.tsx,module.css}`,
`DownloadButton.tsx`, `PdfShareButton.tsx`, `Popover.{tsx,test.tsx}`, `ErrorMessage.tsx`,
`ProgressRing.tsx`, `DropzoneEmptyState.{tsx,test.tsx}`, `RecentFiles.{tsx,test.tsx,module.css}`,
`FilePreview.{tsx,test.tsx,module.css}`, `ConfirmDialog.tsx`, `homeWorkspace.ts`, `sampleDocument.ts`
- this is the ticket's list verbatim.

Three files the ticket's example list does not name, but that belong here by the same test (no
single tool owns them; they are consumed by the generic tool chrome or by more than one tool):

- `Dialog.module.css` - consumed by `ConfirmDialog.tsx` (shell) and, cross-tool, by
  `MergeTool/PagePreviewDialog.tsx`. Pairing it with `ConfirmDialog` is the natural read; Merge keeps
  importing it as `tool -> shell`, which rule 1 allows.
- `PdfTool.module.css` and `FileList.module.css` - the two highest-fanout stylesheets in the tree
  (own doc comments list 8-9 tool consumers each; verified against the current tree: `PdfTool.module.css`
  is imported by all nine islands plus `BasePdfTool`/`PdfShareButton`/`ProgressRing`/`ErrorMessage`;
  `FileList.module.css` by Merge, Compress, ImageToPdf, ToImage, Split). Neither is Sign/Redact-only,
  so `editor-ui` is the wrong home; neither belongs to one tool, so no `tools/<t>/` is right either.
  `shell` is where multi-tool, non-editor chrome lives.
- `PageGrid.module.css` - documented as split/edit-pages only, but the real import graph also reaches
  it from Compress and from Merge's `PageStrip.module.css`. Same reasoning as above: shell.
- `CompareSlider.{tsx,test.tsx,module.css}` - a drag-based before/after image slider. It is imported
  by one `.astro` site component (`CompareFigure.astro`, for blog-style content) and by one tool
  (`PdfCompressTool.tsx`, the compress preview the `compare-preview.spec.js` perf budget measures).
  It imports `src/editor/gestures/controller.ts` directly, so it needs to land somewhere that may
  import `editor` - `shell` qualifies, `site` does not (rule 4 forbids the site importing a tool
  directly, and `PdfCompressTool.tsx` importing it back is `tool -> shell`, allowed). This is a gap
  in the ticket's shell list, not a contradiction of it: nothing in the target layout names a home
  for a component two different consumers (one site, one tool) both need, and shell is the closest
  fit already defined.

None of these four additions are in the ticket's example list. Flagging them here is the point of
this record: ARCH-16 should not have to rediscover them by running the mover and reading a build
error.

### `src/editor-ui/` (shared by Sign and Redact)

`ArmHint.tsx`, `ColorPicker.tsx`, `ColorPickerMenu.{tsx,test.tsx}`,
`EditorControls.module.css`, `EditorExportActions.{tsx,test.tsx}`,
`EditorPageHeader.{tsx,module.css}`, `EditorToolStatus.tsx`, `ElementResizers.tsx`,
`ElementToolbar.{tsx,test.tsx}`, `FontPickerMenu.{tsx,test.tsx}`, `FullscreenButton.tsx`,
`PdfPageCanvas.tsx`, `SignatureDialog.{tsx,test.tsx,module.css}`, `ThicknessPickerMenu.tsx`,
`UndoHistoryModal.{tsx,module.css}`, `ViewControl.{tsx,test.tsx,module.css}` - the ticket's list,
minus two files it landed differently, plus one addition:

- `DeletableObjectOverlay.tsx` and `DeleteMark.tsx` were on the ticket's original list here, but
  ARCH-17 (`de31529`) put them in `src/tools/redact/` instead - they render Redact's own delete
  affordance, not a surface Sign shares, so `editor-ui` was the wrong call. Recorded here so a
  future reader does not go looking for them in the wrong folder.

- `src/lib/useViewDensity.js` is consumed only by `ViewControl.tsx`. It is not itself a component, so
  it was never going to appear in a "components that move" list, but its only consumer is moving to
  `editor-ui`, so it is the one `src/lib/` module in this record that travels with `editor-ui` rather
  than with a tool or staying in `lib`. Call this out explicitly in ARCH-16/17 so it does not get
  stranded.

### `src/tools/<name>/`

| Tool | Island + test | Tool-owned components | Notes |
| --- | --- | --- | --- |
| `merge` | `PdfMergeTool.{tsx,test.tsx}` | `MergeTool/` (whole folder, ARCH-18) | `SortToolbar.module.css`'s header comment cites "MERGE-06," but its only real consumer today is `PdfImageToPdfTool.tsx` (verified: it is not imported, only mentioned in a comment, by anything Merge-owned) - see `tools/image-to-pdf` below. |
| `sign` | `PdfSignTool.{tsx,test.tsx}` | `SignTool/` (whole folder, ARCH-18) | |
| `redact` | `PdfRedactTool.{tsx,test.tsx,module.css}` | `RedactBox.tsx`, `RedactToolbar.tsx` | |
| `compress` | `PdfCompressTool.{tsx,test.tsx,module.css}` | - | also owns `compress-image` per CLAUDE.md's tool list; no separate island exists for it today, `compressImage.js` just moves alongside |
| `split` | `PdfSplitTool.{tsx,test.tsx,module.css}` | - | |
| `edit-pages` | `PdfEditPagesTool.{tsx,test.tsx}` | - | |
| `to-image` | `PdfToImageTool.{tsx,test.tsx,module.css}` | - | |
| `image-to-pdf` | `PdfImageToPdfTool.{tsx,test.tsx}` | - | `SortToolbar.module.css` moves here (see `merge` row) |
| `security` | `PdfSecurityTool.{tsx,test.tsx,module.css}` | - | |

### Stays flat in `src/components/` (the ARCH-18 end state)

Every `.astro` file (`AppBar`, `CardDecor`, `CompareFigure`, `CompareTable`, `ContentImage`,
`ContentPage`, `ContentTable`, `DocumentationLanguageSelector`, `FeatureCard`, `Footer`,
`LanguageFlag`, `LocalePackRequest`, `OfflineProof`, `OrganizationSchema`, `OtherGuides`,
`RelatedGuides`, `SeoSchema`, `ToolAboutCard`, `ToolCrossLinks`, `ToolFaqCard`, `ToolHero`,
`ToolLanguagesCard`, `TrustChips`) plus `compareFigure.css` (its companion) and `HeroDemo/` (whole
folder) - the SEO/site surface this epic does not touch, per CLAUDE.md's own architecture section.

### Needed a decision this ticket did not make (resolved since)

Four files did not fit any single destination above cleanly when this record was written, flagged
here so ARCH-16/17/18 would make a deliberate call instead of discovering the problem mid-move. All
four are now resolved:

- **`noCamelCaseSvgAttrs.test.js`** is a repository-wide guard (scans every source file for
  camelCase SVG attributes), not a test of any one component. It does not belong to `shell`,
  `editor-ui`, or a tool; it moved to `src/test/`, the cross-cutting test infrastructure home this
  record proposed for it.
- **`draftCheckingPlaceholder.test.tsx`** and **`draftRestoreRace.test.tsx`** both render `PdfSignTool`
  and (the second) `PdfRedactTool` together, to test the shared `draftStore.js` restore path across
  both tools at once. Once Sign and Redact are separate `tool:` modules, a test that imports both is
  itself a tool-to-tool edge. The checker excludes `.test.`/`.contract.`/`.spec.` files from
  scanning entirely, so these two are invisible to `check-module-boundaries.mjs` as written.
  That means the checker will not block this move, but the *organizational* problem is
  real. ARCH-20 settled it: they live in `src/test/cross-tool/`, with `textCoverage.test.js` (which imports
  Sign's `textMessages.ts`), because `src/test/` is the cross-cutting bucket that runs on every
  narrowed CI run, and a test importing a tool from inside `src/editor/` would otherwise give Nx a
  real `editor -> tool` edge that widens every Sign or Redact commit to everything.
- **`overlayElements.test.tsx`** only touches `SignTool/` (`ShapeNode`, `LineNode`, `DraggableWrapper`,
  `WhiteoutNode`) despite the generic name; it moved with `tools/sign/` cleanly, no decision needed -
  listed here only so it was not confused with the two draft tests above.

## `src/lib/` consumer table

Computed from the same resolved-import graph as the Evidence section (not the ticket's numbers, not
a guess). "Tool" is filled in only when every direct consumer among islands/editor files agrees;
"stays lib" covers both the genuinely-universal modules and the ones ARCH-17/20 should leave alone
because a *tool* importing `lib` is always legal regardless of who else uses it.

### Multiple tool or shell/editor consumers - stays in `src/lib/`

| Module | Direct consumers |
| --- | --- |
| `signHelpers.js` | `ElementToolbar`, `SignTool/DraggableWrapper`, `SignTool/PdfWorkspace`, `SignTool/nodes/{SignatureNode,TextNode}`, `editor/registry/{ellipse,line,rectangle,signature,symbol,textPdf,whiteout}.ts` (the editor core itself - this one can never move to a tool) |
| `drafts/` (`draftStore.js`, `draftPolicy.js`, `useDraftPersistence.js`; DEBT-04 move A, out of `src/editor/workspace/`) | `PdfMergeTool`, `MergeTool/useMergeDraft` (two dynamic imports plus one direct), `PdfRedactTool`, `PdfSignTool`, `FileDropzone` (shell), `useHandoffIntake.ts` (lib) - and `editor/workspace/useEditorDraftPersistence.ts`, the one editor-side consumer, since it stays in the editor for its registry dependency (`editor/registry/draftValidation.ts`, which `drafts/` imports back the other way) |
| `format.js` | all nine `Pdf*Tool.tsx` |
| `usePdfShare.js` | all nine `Pdf*Tool.tsx` |
| `thumbnails.js` | `FilePreview` (shell), `MergeTool/{PagePreviewDialog,PageStrip}`, `PdfCompressTool`, `PdfEditPagesTool`, `PdfMergeTool`, `SignTool/useDraftPersistence` |
| `useObjectUrls.js` | `MergeTool/usePreparedMerge`, `PdfCompressTool`, `PdfEditPagesTool`, `PdfImageToPdfTool`, `PdfSecurityTool` |
| `fileKind.js` | `FilePreview` (shell), `PdfCompressTool`, `PdfMergeTool` |
| `productAnalytics.ts` | `BasePdfTool` (shell), `PdfCompressTool`, `PdfSignTool` |
| `pageOps.js` | `lib/editPages.js` (edit-pages), `lib/merge.js` (merge) - shared between two tools' own lib modules |
| `pdfRender.js` | `PdfCompressTool` (via `tools/compress/compress.js`), `PdfSplitTool`, `tools/to-image/toImage.js`, `editor-ui/PdfPageCanvas.tsx`, `lib/thumbnails.js`, `editor/adapters/pdf/redact.js` - moved from `src/editor/adapters/pdf/renderContext.js` under DEBT-04, since the editor core (`redact.js`) was one consumer among several outside it |
| `platform.ts` | `DropzoneEmptyState` (shell), `PdfMergeTool` |
| `dropFiles.js` | moved to `src/shell/` (DEBT-04) - `BasePdfTool` and `DropzoneEmptyState` were its only consumers, both already `shell` |
| `sort.js` | `PdfImageToPdfTool`, `PdfMergeTool` |
| `useHandoffIntake.ts` | `PdfCompressTool`, `PdfSplitTool` |

### Moved out of `src/lib/` to `src/editor-ui/hooks/` (DEBT-04)

Sign and Redact were each other's only consumers, never a third tool, so these six belong with the
rest of the Sign/Redact shared chrome rather than in `lib`. Consumers unchanged from the table above.

| Module | Direct consumers |
| --- | --- |
| `toolArming.js` | `RedactToolbar`, `SignTool/SignToolbar` - the shared arming helper `editor.md` already documents by name |
| `useCurrentPage.js` | `PdfRedactTool`, `PdfSignTool` |
| `useDraggableElement.js` | `RedactBox`, `SignTool/DraggableWrapper` |
| `useElementResize.js` | `RedactBox`, `SignTool/DraggableWrapper` |
| `usePdfCoordinates.ts` | `PdfRedactTool`, `SignTool/nodes/TextNode`, plus `useDraggableElement.js`/`useElementResize.js`/`useWorkspaceGestures.ts` internally |
| `useUndoShortcut.js` | `PdfRedactTool`, `PdfSignTool` |

### Site-only or build-only - no island/editor consumer, stays in `src/lib/` (not tool-ownable, but also arguably not "shared tool logic"; not decided here)

| Module | Consumers |
| --- | --- |
| `contentMarkup.ts` | `.astro`/layout/page files only |
| `gitLastModified.js` | `src/pages/**` only |
| `markdownRender.js` | `src/pages/**` only |
| `cspHash.js` | `CompareFigure.astro` only |
| `localeOfflinePacks.js` | `LocalePackRequest.astro` only |
| `maintenanceTelemetry.ts` | `BaseLayout.astro` only |
| `acceptNegotiation.js` | none in `src/` (consumed by `scripts/`) |
| `fontCoverageReport.js` | none in `src/` (consumed by `scripts/`) |
| `liveFontCoverage.js` | none in `src/` (consumed by `scripts/`) |

### Single-tool consumer - candidates to move with that tool (ARCH-17/18)

| Module | Sole consumer(s) | Moves with |
| --- | --- | --- |
| `mergePlan.ts` | `MergeTool/{PageStrip,useMergeDraft,usePreparedMerge}`, `lib/merge.js` | `merge` |
| `merge.js` | `MergeTool/usePreparedMerge`, `PdfMergeTool` | `merge` |
| `outline.js` | `lib/merge.js` only (transitive) | `merge` |
| `useFormFieldRegions.ts` | `PdfSignTool`, `SignTool/PdfWorkspace`, `lib/useWorkspaceGestures.ts` | `sign` |
| `useWorkspaceGestures.ts` | `PdfSignTool`, `SignTool/PdfWorkspace` | `sign` |
| `signExportReadiness.ts` | `PdfSignTool`, `SignTool/PdfWorkspace` | `sign` |
| `useAutoFontProvisioning.js` | `SignTool/PdfWorkspace` | `sign` |
| `fontOfflinePacks.js` | `lib/useAutoFontProvisioning.js` only (transitive) | `sign` (see note) |
| `compress.js` | `PdfCompressTool`, `lib/compressImage.js` | `compress` |
| `compressImage.js` | `PdfCompressTool` | `compress` |
| `targetSizeSearch.js` | `lib/{compress,compressImage}.js` only (transitive) | `compress` |
| `editPages.js` | `PdfEditPagesTool` | `edit-pages` |
| `security.js` | `PdfSecurityTool` | `security` |
| `split.js` | `PdfSplitTool` | `split` |
| `toImage.js` | `PdfToImageTool` | `to-image` |
| `imageToPdf.js` | `PdfImageToPdfTool` | `image-to-pdf` |
| `useDeletableObjects.js` | `PdfRedactTool` | `redact` |
| `useViewDensity.js` | `ViewControl.tsx` | `editor-ui`, not a tool - see the `editor-ui` section above |
| `fontCoverageTable.js` | `src/editor/text/fonts.js` (the editor core) | moved to `src/editor/text/` (DEBT-04) - the core itself was the sole consumer |

A module marked "transitive" above (`outline.js`, `fontOfflinePacks.js`, `targetSizeSearch.js`) has no
*direct* island/editor consumer; it is only reached through another `lib` module that itself has one.
Moving it is optional tidiness, not correctness: a tool importing `lib` is always legal, so
`tools/merge/` reaching back into `src/lib/outline.js` (if it is left there) is not a violation.
ARCH-17/20 can decide per module; this table just says which tool would claim it if moved.

## Places that hardcode today's paths

Verified on this checkout; ARCH-16/17/18/19 touch these as the folders they name move. Everything the
ticket listed was confirmed real except the two noted as already move-proof (see Surprises).

- The per-family `@source` entry sheets in `src/styles/` (`homePage.css`, `contentPage.css`,
  `toolPage.css`, `sharedSources.css`) list individual `.astro` files and a few flat components by
  relative path.
- The `paths:` frontmatter of `.claude/rules/editor.md` (dozens of `src/components/*` globs),
  `.claude/rules/home-page.md` (`FileDropzone*`, `RecentFiles*`, `DropzoneEmptyState*`,
  `Dropzone.module.css`, `homeWorkspace.ts`), and, not named in the ticket but real,
  `.claude/rules/fonts-and-text.md` (`FontPickerMenu*`, `SignatureDialog*`,
  `SignTool/{FontSupportNotice,ExportReadinessNotice}*`, `SignTool/nodes/**`). `csp-scripts-pwa.md`
  and `content-and-copy.md` only glob `.astro` files under `src/components/`, which do not move in
  this epic, so they need no change.
- `DOM_TESTS` in `vitest.config.js` - see Surprises for exactly which lines matter.
- `scripts/check-editor-dependency-directions.mjs` - its `EXCEPTIONS` list and `layerFor()` both
  hardcode `src/components/SignTool/` paths; every ARCH-16/17/18/19 move that touches Sign needs a
  matching edit here, and ARCH-19 in particular changes what the exceptions list has to say.
- `scripts/change-scope.mjs`'s `FONT_GUARD_INPUTS` hardcoded `/^src\/components\/SignTool\//` (true
  when this record was written; ARCH-20 deleted the list entirely rather than relocating it - the
  `fonts` Nx project's own `implicitDependencies` in `e2e/sign/project.json` is the input list now,
  DEBT-10).
- `playwright.config.js`'s `FONT_GUARDS` and `PERF_BUDGETS` globs match `**/sign/*-guard.spec.js`,
  `**/merge/merge-ready-time.spec.js`, etc.; they follow the `e2e/<tool>/` directories into
  `src/tools/<tool>/e2e/` when ARCH-17/18 move them, or need rewriting if the glob shape changes.
- The Architecture section of `CLAUDE.md` names `src/components/Pdf*Tool.tsx` and describes Sign/Redact
  sharing `src/editor/`; update the paths once ARCH-16/17/18 land, in the same change, not left stale.
- `docs/ux-design-guidelines.md` (named in ARCH-18's own acceptance criteria already) and
  `docs/editor-module-boundaries-plan.md` both narrate file paths in prose; re-read them once the
  moves land rather than assuming they are still accurate.

Confirmed *not* needing changes, despite being named in the ticket's Notes: `scripts/check-gesture-golden-rule.js`
and `scripts/check-class-resolution.js` (both walk `src/` generically, no hardcoded subfolder).

## Sequence

```
ARCH-16 (shell, editor-ui out of components)
    |
    v
ARCH-17 (compress, split, edit-pages, to-image, image-to-pdf, security, redact -> src/tools/)
    |
    +--------------------+
    v                    v
ARCH-18                ARCH-19
(merge, sign ->        (editor core stops
 src/tools/,             importing components;
 blocked on the          allowlist's editor
 merge-tool epic          entries drop to zero)
 branch landing)
    |                    |
    +--------------------+
                 v
              ARCH-20
      (Nx on the drawn boundaries)

QUAL-05 (e2e sharding) runs independently, alongside any of the above - no file-move dependency.
```

**Status as of this revision: ARCH-16 through ARCH-19 and QUAL-05 have landed on `main`; ARCH-20 is
in progress on a separate branch.** ARCH-16 landed first because nothing else could move until the
shared shell and editor UI had a folder that was not the one every tool was also leaving (the
ticket's own framing: "tools cannot move into folders of their own until the things they share have
a home"). ARCH-17 landed next: the six simple tools plus Redact proved the pattern (island + owned
components + owned lib modules + owned e2e, one commit each) on tools with no epic-in-flight
complication. ARCH-18 and ARCH-19 both depended only on ARCH-16 (not on ARCH-17) and ran in
parallel: ARCH-18 was blocked externally on the merge-tool epic branch landing on `main`, which had
nothing to do with the editor core, so a second session picked up ARCH-19 while ARCH-18 waited; both
have since landed. ARCH-20 depends on all three folder-moving tickets because Nx's tags need the
folders to exist to enforce anything precise, and is the one still in flight. QUAL-05 had no
`depends_on` in the backlog and touched only `ci.yml`'s job matrix, so it landed independently of the
rest.

## Ratchet proof (this ticket, not a future one)

Two throwaway edits were made and reverted to prove the checker actually goes red, per the ticket's
acceptance criteria; see the session's final report for the exact commands and output. In short: an
import from `src/editor/geometry/coords.ts` to `src/components/DownloadButton.tsx` fails with
"editor may not import the transitional components module," and an import from
`src/components/MergeTool/DownloadElement.tsx` to `src/components/SignTool/textMessages.ts` fails
with "a tool may not import another tool." Both edits were reverted before committing; `git diff`
on both files is empty.
