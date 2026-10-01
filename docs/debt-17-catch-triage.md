# DEBT-17 catch-block triage

Tree: /Users/sh/work/pdkef-debt17, non-test source under src/.

## Summary

- Total triaged: **152** catch sites that discard the error, or use it only for `console.error`/`console.warn`.
- EXPECTED: **106**
- DEFECT: **46**
- Defect areas (11): redact 12, drafts 10, pdf_render 8, pdf_tool_run 5, chunk_load 3, handoff 2, fonts 2, merge 1, security 1, sign_export 1, sign_form_detection 1.
- Defects already surfaced somewhere: **37 of 46** (UI state, a user message, or console). Of those, 19 are console-only (Split 271, EditPages 138, useDeletePreviews 201, usePageSizesPt 31, useDeletableObjects 38, useObjectPreviews 65, PdfPageCanvas 73, pdfObjects 927, readGlyphs 19, deleteObjects 633, sign.js 131, and the seven draftStore IDB catches). Fully silent defects: **9** (PdfMergeTool 556 and 585, PageStrip 379 and 214, PagePreviewDialog 93, useMergeDraft 260, useDraftPersistence 172, readSavedFile 134, liveFontCoverage 128).
- `[surfaced: ...]` in a reason marks a block that already surfaces the error some other way. Sign export (PdfSignTool 884) is the only one that already sends telemetry (`signExportFailed`); reportError would overlap it.
- Out of scope (they use or forward the error, nothing discarded): merge.js 54/67/201 (MergeFileError with `cause`), flatten.js 186 (FormFlattenError), thumbnails.js 125 (rethrow), pdfLib.js 41 (rethrow), liveFontCoverage.js 56 (rethrow), PdfRedactTool 753 (conditional rethrow), usePdfShare.js 81 (returns the error), draftStore.js 692 (`.catch(reject)`), PdfSplitTool 286 (comment text).

## Table

| file:line | attempting | verdict | reason | area |
| --- | --- | --- | --- | --- |
| src/tools/split/PdfSplitTool.tsx:185 | Build split PDFs for download | DEFECT | pdf-lib split threw; [surfaced: status error + console.error] | pdf_tool_run |
| src/tools/split/PdfSplitTool.tsx:271 | Render one page thumbnail | DEFECT | pdf.js render threw on a doc that loaded; [surfaced: console.error only] | pdf_render |
| src/tools/split/PdfSplitTool.tsx:277 | Load PDF into split tool | DEFECT | pdf.js load threw; filter PasswordException/InvalidPDFException by name; [surfaced: status error + console.error] | pdf_render |
| src/tools/split/PdfSplitTool.tsx:293 | Destroy abandoned pdf.js loading task | EXPECTED | best-effort cleanup, comment says nothing actionable | |
| src/tools/split/PdfSplitTool.tsx:464 | Hand split result to Compress | EXPECTED | failure origin is saveHandoff (reports itself); catch mostly fires on its synthetic `Error('handoff')`; [surfaced: handoffFailed state] | |
| src/tools/compress/compressImage.js:63 | Decode image via ImageBitmap | EXPECTED | feature fallback to <img> decode path | |
| src/tools/compress/PdfCompressTool.tsx:224 | Render before/after compare previews | DEFECT | renderer threw on our own output; [surfaced: compareStatus error + console.error] | pdf_render |
| src/tools/compress/PdfCompressTool.tsx:365 | Compress PDF or image | DEFECT | compression step threw; [surfaced: status error + console.error] | pdf_tool_run |
| src/tools/merge/PdfMergeTool.tsx:63 | Detect contentEditable plaintext-only | EXPECTED | feature detect | |
| src/tools/merge/PdfMergeTool.tsx:176 | Read remembered merge options | EXPECTED | stored preference falls back to default | |
| src/tools/merge/PdfMergeTool.tsx:184 | Remember merge options | EXPECTED | blocked localStorage, convenience only | |
| src/tools/merge/PdfMergeTool.tsx:221 | Read first-result-seen flag | EXPECTED | blocked localStorage | |
| src/tools/merge/PdfMergeTool.tsx:229 | Set first-result-seen flag | EXPECTED | blocked localStorage | |
| src/tools/merge/PdfMergeTool.tsx:556 | Lazy-load merge draft persistence chunk | DEFECT | dynamic import failed (stale SW cache / bad deploy); only sets isRestoring false | chunk_load |
| src/tools/merge/PdfMergeTool.tsx:585 | Lazy-load PageStrip chunk | DEFECT | dynamic import failed, silently no page strip | chunk_load |
| src/tools/merge/PdfMergeTool.tsx:621 | Inspect an added file (page count) | EXPECTED | maps to the dedicated "unreadable file" card; user file (see unsure); [surfaced: entry.error='unreadable'] | |
| src/tools/merge/PdfMergeTool.tsx:636 | Render first-page thumbnail of added file | EXPECTED | decoration; encrypted/malformed user PDFs fail pdf.js by design (see unsure) | |
| src/tools/merge/PdfMergeTool.tsx:1065 | Show PWA install prompt | EXPECTED | optional browser API, user may dismiss | |
| src/tools/merge/PdfMergeTool.tsx:1095 | Hand merged PDF to Compress/Sign | EXPECTED | origin is saveHandoff (reports itself) or its synthetic throw; [surfaced: handoffFailed state] | |
| src/tools/merge/merge.js:95 | Read PDF creation date for sorting | EXPECTED | contract is resolve-null; unreadable file just sorts without a date | |
| src/tools/merge/components/PagePreviewDialog.tsx:93 | Render large page preview | DEFECT | renderer threw on a loaded doc; must skip AbortError (signal aborted on close) | pdf_render |
| src/tools/merge/components/usePreparedMerge.ts:98 | Build merged PDF | DEFECT | export step threw (AbortError already filtered); [surfaced: state error + console.error] | merge |
| src/tools/merge/components/useMergeDraft.ts:260 | Save merge draft | DEFECT | saveDraft rejected (it normally returns false); a throw here is our code; result becomes "not saved" | drafts |
| src/tools/merge/components/PageStrip.tsx:167 | Destroy released pdf.js source | EXPECTED | best-effort cleanup | |
| src/tools/merge/components/PageStrip.tsx:214 | Render one page thumbnail in strip | DEFECT | pdf.js page render threw on a doc that loaded; skip aborts (check aborted before) | pdf_render |
| src/tools/merge/components/PageStrip.tsx:379 | Lazy-load PagePreviewDialog chunk | DEFECT | dynamic import failed, preview never opens | chunk_load |
| src/tools/security/security.js:36 | Check if PDF is encrypted | EXPECTED | maps to UnreadablePdfError, a user-facing outcome | |
| src/tools/security/security.js:51 | Decrypt PDF with password | EXPECTED | maps to WrongPasswordError, normal flow (see unsure: swallows non-password errors too) | |
| src/tools/security/security.js:69 | Load PDF before protecting | EXPECTED | maps to "might already be encrypted" user message; user file | |
| src/tools/security/security.js:77 | Encrypt and save protected PDF | DEFECT | pdf-lib encrypt/save threw on a PDF that loaded; [surfaced: SecurityError shown] | security |
| src/tools/edit-pages/PdfEditPagesTool.tsx:138 | Generate page thumbnails | DEFECT | renderer threw; [surfaced: console.error only] | pdf_render |
| src/tools/edit-pages/PdfEditPagesTool.tsx:141 | Load PDF into edit-pages | DEFECT | load threw (filter pdf.js Password/InvalidPDF names); [surfaced: status error + console.error] | pdf_tool_run |
| src/tools/edit-pages/PdfEditPagesTool.tsx:248 | Apply page edits and export | DEFECT | export step threw; [surfaced: status error + console.error] | pdf_tool_run |
| src/tools/redact/useSavedFileCheck.ts:52 | Check saved redacted file | DEFECT | the verifier threw on our own output; [surfaced: state failed + console.error] | redact |
| src/tools/redact/useDeletePreviews.ts:67 | Destroy preview pdf.js doc | EXPECTED | best-effort cleanup | |
| src/tools/redact/useDeletePreviews.ts:201 | Build Delete previews | DEFECT | rewrite/render threw; page falls back to original render; [surfaced: console.error only] | redact |
| src/tools/redact/BrushControls.tsx:56 | Sample canvas pixel colour | EXPECTED | getImageData can throw on tainted/zero canvas; returns null | |
| src/tools/redact/usePageTexts.ts:58 | Read page text for Find | DEFECT | text extraction threw; [surfaced: state failed + console.error] | redact |
| src/tools/redact/usePageSizesPt.ts:31 | Read page sizes | DEFECT | pdf.js getPage/getViewport threw; [surfaced: console.error only] | redact |
| src/tools/redact/useDeletableObjects.js:38 | List deletable objects | DEFECT | object parser threw; [surfaced: console.error, empties list] | redact |
| src/tools/redact/useObjectPreviews.ts:65 | Read text of Delete objects | DEFECT | glyph/preview code threw; [surfaced: console.error only] | redact |
| src/tools/redact/PdfRedactTool.tsx:332 | requestFullscreen | EXPECTED | optional browser API, falls back to pseudo-fullscreen | |
| src/tools/redact/PdfRedactTool.tsx:759 | Remove an unused place from saved file | DEFECT | removePlace threw (PlaceNotFound handled earlier); [surfaced: REMOVE_FAILED + console.error] | redact |
| src/tools/redact/PdfRedactTool.tsx:810 | Export redacted PDF | DEFECT | export step threw; [surfaced: EXPORT_FAILED + console.error] | redact |
| src/tools/redact/PdfRedactTool.tsx:872 | Hand redacted PDF to next tool | EXPECTED | origin is saveHandoff or its synthetic throw; [surfaced: HANDOFF_FAILED + console.error] | |
| src/tools/redact/check/readSavedFile.ts:134 | Find unused parts in saved file | DEFECT | pdf-lib failed to open our own saved output (see unsure); returns [] silently | redact |
| src/tools/redact/check/unusedParts.ts:40 | Decode a PDF stream | EXPECTED | comment: undecodable filter / damaged stream, nothing to read | |
| src/tools/image-to-pdf/PdfImageToPdfTool.tsx:168 | Convert images to PDF | DEFECT | export step threw (corrupt image is possible); [surfaced: status error + console.error] | pdf_tool_run |
| src/tools/sign/useFormFieldRegions.ts:289 | Detect form fields | DEFECT | the detector threw or failed to load; [surfaced: console.warn + detectionError/detectionIssue state] | sign_form_detection |
| src/tools/sign/useAutoFontProvisioning.js:33 | Provision a font pack | EXPECTED | background fetch, retried by clearing `attempted`; offline is the norm (see unsure) | |
| src/tools/sign/PdfSignTool.tsx:340 | requestFullscreen | EXPECTED | optional browser API, pseudo-fullscreen fallback | |
| src/tools/sign/PdfSignTool.tsx:618 | Open file from PWA launch queue | EXPECTED | external launch file; loadFreshFile has its own failure UI; [surfaced: console.error] | |
| src/tools/sign/PdfSignTool.tsx:884 | Sign/export PDF | DEFECT | export threw; [surfaced: signExportFailed telemetry + UI detail + console.error] | sign_export |
| src/tools/sign/components/SignatureDialog.tsx:320 | document.fonts.load for typed name | EXPECTED | offline/slow font, draws with what is loaded | |
| src/shell/FilePreview.tsx:72 | Render PDF preview thumbnail | EXPECTED | comment: nicety; keeps glyph; encrypted PDFs fail by design | |
| src/components/LocalePackRequest.astro:30 | Warm locale pack cache | EXPECTED | background prefetch, never blocks paint | |
| src/editor-ui/useViewDensity.js:12 | Read stored view density | EXPECTED | stored preference falls back to default | |
| src/editor-ui/useViewDensity.js:34 | Set data-view-density attribute | EXPECTED | locked-down contexts | |
| src/editor-ui/useViewDensity.js:44 | Persist view density | EXPECTED | blocked localStorage | |
| src/editor-ui/hooks/toolArming.js:101 | Read touch-hint-seen flag | EXPECTED | blocked localStorage | |
| src/editor-ui/hooks/toolArming.js:109 | Set touch-hint-seen flag | EXPECTED | blocked localStorage | |
| src/editor-ui/PdfPageCanvas.tsx:73 | Render a page onto canvas | DEFECT | pdf.js render threw (cancellation already filtered); [surfaced: console.error only] | pdf_render |
| src/layouts/ToolPageLayout.astro:147 | Parse recent-files index in blocking head script | EXPECTED | stored value will not parse; also inline script, cannot call reportError | |
| src/layouts/ToolPageLayout.astro:159 | Whole blocking head script | EXPECTED | localStorage access; inline script, cannot call reportError | |
| src/layouts/BaseLayout.astro:120 | Dev-only unregister service workers | EXPECTED | dev-only cleanup | |
| src/layouts/BaseLayout.astro:126 | Dev-only clear pdkef caches | EXPECTED | dev-only cleanup | |
| src/lib/usePdfShare.js:8 | navigator.canShare check | EXPECTED | feature detect | |
| src/lib/maintenanceTelemetry.ts:192 | Send a telemetry event | EXPECTED | the reporter itself; must never throw or recurse | |
| src/lib/maintenanceTelemetry.ts:213 | Parse URL for analytics path | EXPECTED | malformed URL falls back to "/" | |
| src/lib/maintenanceTelemetry.ts:234 | Parse URL for analytics sanitising | EXPECTED | malformed URL falls back to safe default | |
| src/lib/productAnalytics.ts:40 | Emit Vercel analytics event | EXPECTED | analytics must never alter the workflow | |
| src/lib/drafts/useDraftPersistence.js:24 | Detect installed standalone mode | EXPECTED | feature detect | |
| src/lib/drafts/useDraftPersistence.js:172 | Save editor draft | DEFECT | saveDraft rejected (it normally returns false); our code threw; becomes "not saved" | drafts |
| src/lib/drafts/useDraftPersistence.js:298 | Render draft preview thumbnail | EXPECTED | comment: decoration; encrypted/malformed PDFs refused by pdf.js | |
| src/lib/drafts/draftStore.js:65 | Read/set tab writer id in sessionStorage | EXPECTED | blocked storage, falls back to random id | |
| src/lib/drafts/draftStore.js:73 | Broadcast draft change via localStorage | EXPECTED | advisory, blocked storage | |
| src/lib/drafts/draftStore.js:95 | Parse cross-tab storage event | EXPECTED | corrupt advisory record ignored | |
| src/lib/drafts/draftStore.js:141 | Hash file bytes (sourceIdForFiles) | EXPECTED | crypto.subtle missing on plain-http LAN; null means "no drafts" | |
| src/lib/drafts/draftStore.js:192 | Save handoff to IndexedDB | DEFECT | IDB write threw after hasIndexedDB passed (see unsure: quota); [surfaced: console.error, returns false] | handoff |
| src/lib/drafts/draftStore.js:222 | Take handoff from IndexedDB | DEFECT | IDB read/delete threw; [surfaced: console.error, returns null] | handoff |
| src/lib/drafts/draftStore.js:244 | Set current-entry pointer | EXPECTED | best-effort localStorage write | |
| src/lib/drafts/draftStore.js:253 | Clear current-entry pointer | EXPECTED | best-effort localStorage | |
| src/lib/drafts/draftStore.js:264 | Read current-entry pointer | EXPECTED | blocked storage returns null | |
| src/lib/drafts/draftStore.js:283 | Write recent-files index | EXPECTED | quota/blocked storage, convenience | |
| src/lib/drafts/draftStore.js:317 | Parse recent-files index | EXPECTED | unparseable stored value falls back to [] | |
| src/lib/drafts/draftStore.js:399 | Prune orphan recent entries | EXPECTED | best-effort cleanup; [surfaced: console.error] | |
| src/lib/drafts/draftStore.js:413 | Hash bytes in cacheRecentFile | EXPECTED | crypto.subtle missing; returns false | |
| src/lib/drafts/draftStore.js:436 | Cache recent file in IndexedDB | DEFECT | IDB write threw (see unsure: quota/private); [surfaced: console.error, returns false] | drafts |
| src/lib/drafts/draftStore.js:475 | Load recent file from IndexedDB | DEFECT | IDB read/delete threw on an opened entry; [surfaced: console.error, returns null] | drafts |
| src/lib/drafts/draftStore.js:520 | Attach draft preview to index | EXPECTED | quota error costs a thumbnail only (comment) | |
| src/lib/drafts/draftStore.js:552 | Read current draft meta | EXPECTED | sync best-effort read | |
| src/lib/drafts/draftStore.js:586 | hasDraftHint | EXPECTED | sync best-effort read | |
| src/lib/drafts/draftStore.js:595 | Test whether index parses | EXPECTED | parse probe | |
| src/lib/drafts/draftStore.js:603 | Access indexedDB | EXPECTED | can throw in private/locked-down contexts (comment) | |
| src/lib/drafts/draftStore.js:638 | storage.persist() | EXPECTED | optional browser API; false is normal (comment) | |
| src/lib/drafts/draftStore.js:639 | storage.persist() sync throw | EXPECTED | optional browser API | |
| src/lib/drafts/draftStore.js:660 | storage.persisted() | EXPECTED | optional browser API, returns 'unknown' | |
| src/lib/drafts/draftStore.js:765 | Hash bytes in saveDraft (multi) | EXPECTED | crypto.subtle missing; save skipped | |
| src/lib/drafts/draftStore.js:766 | Hash bytes in saveDraft (single) | EXPECTED | crypto.subtle missing; save skipped | |
| src/lib/drafts/draftStore.js:799 | Save draft to IndexedDB | DEFECT | the flagship save; IDB write threw (see unsure: quota); [surfaced: console.error, returns false] | drafts |
| src/lib/drafts/draftStore.js:829 | Re-read draft to notify other tabs | EXPECTED | advisory, after a committed save | |
| src/lib/drafts/draftStore.js:905 | Load draft from IndexedDB | DEFECT | restore threw, pointer cleared and work lost; [surfaced: console.error, returns null] | drafts |
| src/lib/drafts/draftStore.js:951 | Delete draft work in IndexedDB | DEFECT | IDB delete threw; [surfaced: console.error, returns false] | drafts |
| src/lib/drafts/draftStore.js:970 | Remove legacy hint key | EXPECTED | best-effort cleanup | |
| src/lib/drafts/draftStore.js:971 | Remove legacy meta key | EXPECTED | best-effort cleanup | |
| src/lib/drafts/draftStore.js:994 | Legacy draft migration (outer) | DEFECT | migrateLegacyDraft catches its own IDB errors, so this is a bug in our code; [surfaced: console.error] | drafts |
| src/lib/drafts/draftStore.js:1013 | Read legacy draft record | DEFECT | IDB read threw (same class as loadDraft); [surfaced: console.error] | drafts |
| src/lib/drafts/draftStore.js:1022 | Delete expired legacy record | EXPECTED | best-effort cleanup; [surfaced: console.error] | |
| src/lib/drafts/draftStore.js:1029 | Hash legacy bytes (multi) | EXPECTED | crypto.subtle missing, record dropped | |
| src/lib/drafts/draftStore.js:1030 | Hash legacy bytes (single) | EXPECTED | crypto.subtle missing, record dropped | |
| src/lib/drafts/draftStore.js:1036 | Delete unaddressable legacy record | EXPECTED | best-effort cleanup; [surfaced: console.error] | |
| src/lib/drafts/draftStore.js:1077 | Write migrated legacy record | DEFECT | IDB write threw; [surfaced: console.error] | drafts |
| src/site-lib/FileDropzone.tsx:75 | Hand file from home page to a tool | EXPECTED | origin is saveHandoff or its synthetic throw; [surfaced: handoffFailed message] | |
| src/site-lib/FileDropzone.tsx:166 | Fetch and open sample PDF | EXPECTED | same-origin fetch can fail offline; [surfaced: sampleLoadFailed message] | |
| src/site-lib/gitLastModified.js:53 | git shallow-repo probe | EXPECTED | build-time script, not browser code | |
| src/site-lib/gitLastModified.js:79 | git log for last-modified date | EXPECTED | build-time script, falls back to null | |
| src/site-lib/RecentFiles.tsx:134 | Intl.RelativeTimeFormat label | EXPECTED | optional API, label omitted | |
| src/editor/workspace/useEditorDraftPersistence.ts:116 | Delete malformed draft work | EXPECTED | best-effort cleanup | |
| src/editor/workspace/loadPdf.ts:61 | Destroy pdf.js handle | EXPECTED | comment: rejection on cancel is expected | |
| src/editor/workspace/loadPdf.ts:143 | Load PDF for Sign/Redact | DEFECT | pdf.js load threw (filter Password/InvalidPDF names); [surfaced: fail(loadFailed) + console.error] | pdf_render |
| src/editor/adapters/pdf/sign.js:67 | Read fontkit metrics for baseline | EXPECTED | falls back to Helvetica offset | |
| src/editor/adapters/pdf/sign.js:82 | Read /UserUnit | EXPECTED | invalid producer output defaults to 1 | |
| src/editor/adapters/pdf/sign.js:131 | Fetch embedded custom font | DEFECT | export font fetch failed, glyphs fall to fallback (see unsure: offline); [surfaced: console.warn] | fonts |
| src/editor/adapters/pdf/textLayer.ts:131 | Invert a glyph text matrix | EXPECTED | degenerate matrix, comment says shows nothing | |
| src/editor/adapters/pdf/pdfObjects.js:927 | Walk a Form XObject | DEFECT | our content-stream walker threw; objects rolled back; [surfaced: console.error only] | redact |
| src/editor/adapters/pdf/readGlyphs.js:15 | commonObjs.get(font name) | EXPECTED | pdf.js throws for an unresolved font, handled as null | |
| src/editor/adapters/pdf/readGlyphs.js:19 | Read glyphs of a page | DEFECT | operator-list/glyph reader threw; [surfaced: console.error, returns null] | redact |
| src/editor/adapters/pdf/deleteObjects.js:633 | Extract objects on one page | DEFECT | our extractor threw; page skipped; [surfaced: console.error only] | redact |
| src/editor/text/liveFontCoverage.js:83 | Load weight-specific font instance | EXPECTED | falls back to the default face | |
| src/editor/text/liveFontCoverage.js:90 | Compute unsupported characters | EXPECTED | mixes offline font fetch with fontkit bugs; returns [] (see unsure) | |
| src/editor/text/liveFontCoverage.js:119 | Load font instance (weighted) | EXPECTED | tries default face next | |
| src/editor/text/liveFontCoverage.js:123 | Load font instance (default face) | EXPECTED | offline/missing font returns null (doc: never invent a warning) | |
| src/editor/text/liveFontCoverage.js:128 | Document-wide coverage scan | DEFECT | inner font loads already caught, so only findUnrepresentableCharacters can land here | fonts |
| src/editor/text/dateFormat.ts:49 | navigator.language | EXPECTED | optional API, falls back to en-US | |
| src/editor/workspace/preferenceStore.ts:91 | Parse saved-signatures JSON | EXPECTED | stored value will not parse, returns null | |
| src/editor/workspace/preferenceStore.ts:166 | Read legacy signature record | EXPECTED | stored value will not parse | |
| src/editor/workspace/preferenceStore.ts:170 | crypto.randomUUID | EXPECTED | optional API, falls through to Date/Math id | |
| src/editor/workspace/preferenceStore.ts:186 | Get tab id from sessionStorage | EXPECTED | blocked storage, makes an id | |
| src/editor/workspace/preferenceStore.ts:189 | Parse preference record | EXPECTED | stored value will not parse | |
| src/editor/workspace/preferenceStore.ts:192 | Parse signature library record | EXPECTED | stored value will not parse | |
| src/editor/workspace/preferenceStore.ts:215 | Restore winning record to localStorage | EXPECTED | best-effort convergence write | |
| src/editor/workspace/preferenceStore.ts:230 | Migrate signature library to asset record | EXPECTED | quota/blocked storage, returns 'failed' | |
| src/editor/workspace/preferenceStore.ts:243 | Read one preference | EXPECTED | storage or parse failure returns null | |
| src/editor/workspace/preferenceStore.ts:256 | Write one preference | EXPECTED | quota/blocked storage, returns false | |
| src/editor/workspace/preferenceStore.ts:264 | Read saved signatures | EXPECTED | storage failure returns null | |
| src/editor/workspace/preferenceStore.ts:275 | Mirror signatures to legacy key | EXPECTED | comment: asset record already succeeded | |
| src/editor/workspace/preferenceStore.ts:277 | Save signature library | EXPECTED | quota (large image data URLs) returns false, kept in memory | |
| src/editor/workspace/preferenceStore.ts:284 | Subscribe: initial preference read | EXPECTED | blocked storage, no-op unsubscribe | |
| src/editor/workspace/preferenceStore.ts:300 | Subscribe: initial signatures read | EXPECTED | blocked storage, no-op unsubscribe | |
| src/editor/workspace/preferenceStore.ts:323 | Parse app-wide style | EXPECTED | bad stored value returns {} | |
| src/editor/workspace/preferenceStore.ts:331 | Get app-wide style | EXPECTED | storage failure returns {} | |
| src/editor/workspace/preferenceStore.ts:344 | Remember app-wide style | EXPECTED | quota/blocked storage returns false | |

## Unsure

- **Handoff catches** (Split 464, Merge 1095, Redact 872, FileDropzone 75): marked EXPECTED because the real failure is inside `saveHandoff`, which is itself DEFECT (draftStore 192), so reporting both double-counts. The outer catch mostly fires on its own `throw new Error('handoff')` when `saveHandoff` returned false.
- **IndexedDB failures** (draftStore 192, 222, 436, 475, 799, 905, 951, 1013, 1077): marked DEFECT because `hasIndexedDB()` already passed, but QuotaExceededError, Safari-private `SecurityError`/`InvalidStateError`/`UnknownError` are environmental. Recommend reportError filters these by `error.name` (or reports once per session), else the flagship drafts area will be mostly noise.
- **pdf.js load of a user's file** (Split 277, EditPages 141, loadPdf 143): an encrypted or malformed PDF is normal. Marked DEFECT on the condition that `PasswordException`, `InvalidPDFException` and `MissingPDFException` are skipped by name.
- **Decorative thumbnails of possibly-encrypted PDFs** (PdfMergeTool 636, FilePreview 72, useDraftPersistence 298): EXPECTED for the same reason. PageStrip 214 and PagePreviewDialog 93 are DEFECT because by then the document already loaded.
- **Merge 621** (inspectPdf failure mapped to the "unreadable" card) and **security.js 36/51/69**: EXPECTED since each maps to a deliberate user-facing outcome, but security.js 51 maps every load failure to WrongPasswordError, so a real pdf-lib bug would hide there.
- **sign.js 131** (custom font fetch): DEFECT for a 404/deploy mismatch, EXPECTED when offline and not yet provisioned.
- **liveFontCoverage 90**: one catch covers both the font fetch (offline, expected) and `unrepresentableCharacters` (our code, defect). Marked EXPECTED; narrowing the try around `unrepresentableCharacters` alone would make it reportable.
- **chunk_load** (PdfMergeTool 556, 585, PageStrip 379): offline with a cold cache is expected; a stale service-worker copy after a deploy is a defect. Kept DEFECT since it is exactly the failure the CLAUDE.md hydration notes describe.
- **readSavedFile 134**: pdf-lib failing to open Redact's own saved output is a defect, but the code comment frames it as "nothing to report".
- **useAutoFontProvisioning 33**: background font-pack fetch; offline expected, 404 a defect. Marked EXPECTED.
- **Build-time and inline-script catches** (gitLastModified.js, ToolPageLayout.astro blocking script): EXPECTED mainly because reportError cannot run there (no `is:inline`; build-time code is not in the browser).

## Draft rule for the next catch

Ask what threw. If it is the environment or the person's data (storage blocked or full, an optional API missing, a cancelled picker, a stored value that will not parse, an encrypted PDF), fall back quietly and say why in a comment. If it is our code or a library we ship (a detector, renderer, parser, export step, or a draft write after IndexedDB was confirmed present), call `reportError(area, error)` before the fallback, even when the UI already shows a message or the console already logs it, because neither reaches us. Keep catches narrow, with the try around only the call that can fail, so a single block never mixes an expected failure with a defect, and never report from best-effort cleanup, telemetry itself, or code that runs before the app can import the reporter.
