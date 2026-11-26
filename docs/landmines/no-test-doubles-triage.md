# Kept test doubles: what each one would take (LAND-04)

Triage of the 411 sites `no-test-doubles` reports on main at bffa3a063 (2026-11-26), one route per site, read against
docs/landmines/no-test-doubles.md. Shlomi's call, 2026-11-26: a new browser test is fine for a capability core to a tool that
nothing lower can test; anything else that would need one stays a double. "Reason true" says whether the site's `Forced:` line
held up; `no` and `unsure` sites were mostly tried, and a false reason usually means the site can go now.

| Route | Sites |
| --- | --- |
| Can go now, within the current rules | 45 |
| Would go with a real matchMedia in the test setup | 42 |
| Would go with a new browser test, core to a tool | 32 |
| Would go with a product change | 106 |
| Stays: needs a browser test, not core to a tool | 98 |
| Stays: cannot be real in any test | 54 |
| Goes with the site it puts back | 34 |

Done since (2026-11-26): waves 17 (the "now" sites), 18 (a real `matchMedia` for jsdom, `src/test/support/screen.ts`) and
19 (page measures, Scan's corner trace and camera shot policy, and the comment rail's stacking as pure functions) and 20 (dead
catches, Scan's worker supervision, and small decisions as pure inputs) took the count to 314 in 129 files. A few "now" sites stayed after all: their tries are noted in the LAND-04 wave lines.

Open before the next wave:

- **The service worker.** `scripts/sw.test.mjs` (11 sites) was judged core, since working offline is a promise of every tool,
  and `src/site-lib/appUpdate.test.ts` (10) not. One real service worker test in Chromium could carry both, or neither.
- **Product changes.** Most are a pure function or reducer pulled out of a hook (Scan's camera shooting, about 20 sites; worker
  supervision; Scan's corner trace; page measures and other browser facts), or a loader that takes a `Blob` so a held or failing
  file is real. Each must be a design production uses too: a parameter added only so a test can pass a fake does not count.
- **Unreachable branches.** Several catches guard a failure no real call makes (`saveHandoff`, `saveDraft`, the rating and page
  view sends). Removing the branch removes the double.


## Can go now, within the current rules (45)

| Site | Reason true | How |
| --- | --- | --- |
| `src/editor-ui/PdfPageCanvas.destroyed.test.tsx:63` | unsure | pdf.js range transport (getDocument range option) lets the test hold page data until after destroy; a real pause. |
| `src/editor-ui/whiteout/pageSampling.browser.test.tsx:85` | no | Already in a browser file: draw a cross-origin image served by MSW without CORS; the canvas is really tainted. |
| `src/editor/comments/readBack.test.ts:34` | yes | Tried in wave 17: the real importer catches everything, so only a chunk that cannot load reaches the catch, and without the mock swapping the catch for a throw survived. Stays. |
| `src/editor/highlight/flip.test.ts:18` | no | by the operational rule the swipe reader is a collaborator; use real createSwipeReader and assert the geometry |
| `src/editor/highlight/flip.test.ts:34` | no | same: real createSwipeReader over real bands, assert the flipped geometry |
| `src/editor/workspace/useEditorDraftPersistence.test.tsx:152` | no | Write the malformed record straight into fake-indexeddb, then real loadDraft returns it; the store API is not the only writer. |
| `src/editor/workspace/useEditorDraftPersistence.test.tsx:167` | no | Seed a nameless record by a raw IndexedDB put; older sessions could leave one. |
| `src/editor/workspace/useEditorDraftPersistence.test.tsx:306` | unsure | Hold a real readwrite transaction open on the recents store so the real write waits; release it. |
| `src/lib/drafts/draftStore.test.js:1089` | no | Pre-create the same-named DB and store without a keyPath in fake-indexeddb, then write a string record; the put() limit is only the product store. |
| `src/lib/handoff/settleHandoff.test.ts:50` | yes | Make the real write answer false (a removed or unhashable record); the rejection never happens, so test the false path. |
| `src/lib/handoff/useHandoffIntake.test.tsx:428` | no | Use the real holdDraftStore (a held write transaction) instead of a wrapped cacheRecentFile. |
| `src/lib/handoff/useHandoffIntake.test.tsx:454` | yes | Same real false answer as settleHandoff: the real write never rejects, so drive the false path. |
| `src/lib/telemetry/analyticsSink.test.ts:125` | yes | vi.mock clientBuckets spy:true and assert one call for two sends; no UA change needed |
| `src/lib/telemetry/productAnalytics.noStorage.test.ts:16` | no | visit test; strip or ignore ready rather than a NaN clock |
| `src/lib/telemetry/productAnalytics.test.ts:190` | no | these tests are about visit; compare with toMatchObject or strip ready instead of a NaN clock |
| `src/lib/telemetry/visitRecency.test.ts:146` | no | pre-seed a same-length garbage last-visit key, fillStorage; storage really full; run and passed |
| `src/shell/pageWorkspace/useSaveToDrive.test.tsx:137` | unsure | Spy-through window.open: jsdom's own open returns undefined, which is a blocked popup (tried at 174, 14 of 14 green). |
| `src/shell/pageWorkspace/useSaveToDrive.test.tsx:174` | no | Spy-through window.open: jsdom's own open returns undefined (tried, 14 of 14 green); keep no mock in this test. |
| `src/test/cross-tool/draftRestoreRace.test.tsx:137` | no | Ran it: removing the recents index entry after each seed gives a false hint with no mock; 6 of 6 pass. |
| `src/test/support/redactTool.browser.tsx:139` | unsure | Count commits through real outputs: undo depth (press Undo until disabled) or history entries, not a wrapped commit. |
| `src/test/support/redactTool.browser.tsx:140` | unsure | Count commits through real outputs: undo depth (press Undo until disabled) or history entries, not a wrapped commit. |
| `src/tools/compress/PdfCompressTool.flows.browser.test.tsx:730` | unsure | Try a PDF whose image stream is corrupt (the file already has a broken photo fixture) so the real engine rejects; verify it does. |
| `src/tools/compress/lib/compressImages.test.js:43` | yes | encodeImage is a parameter the size search is generic over; pass plain recording functions as test input, not vi.fn(impl). |
| `src/tools/compress/lib/compressImages.test.js:286` | yes | encodeImage is a parameter the size search is generic over; pass plain recording functions as test input, not vi.fn(impl). |
| `src/tools/compress/lib/compressImages.test.js:326` | yes | encodeImage is a parameter the size search is generic over; pass plain recording functions as test input, not vi.fn(impl). |
| `src/tools/compress/lib/compressImages.test.js:410` | yes | encodeImage is a parameter the size search is generic over; pass plain recording functions as test input, not vi.fn(impl). |
| `src/tools/highlight/components/HighlightPage.test.tsx:574` | unsure | Mount with the real marks reducer wrapped in a spy-through so the real swipe draws and its release behaves; the dispatch recorder is a harness choice. |
| `src/tools/highlight/hooks/useScanCheck.test.tsx:83` | unsure | No ric in jsdom so the real hook falls back to setTimeout(1000); use fake timers on that path. Loses idle-callback branch coverage. |
| `src/tools/redact/PdfRedactTool.flows.browser.test.tsx:91` | yes | spy-through console.error without implementation, or a console filter in config; noise only |
| `src/tools/redact/PdfRedactTool.flows.browser.test.tsx:397` | unsure | MSW network error on the chunk request of a fresh dynamic import, with the applyPageEdits spy mock dropped |
| `src/tools/redact/PdfRedactTool.flows.browser.test.tsx:603` | unsure | CDP Storage.overrideQuotaForOrigin to a tiny quota in this existing Chromium file, then real saveHandoff fails |
| `src/tools/redact/hooks/useDeletableObjects.test.jsx:93` | no | wait on the hook's own settled state instead of the console.error signal; spy-through |
| `src/tools/redact/hooks/useObjectPreviews.test.tsx:112` | unsure | real page of GLYPH_BUDGET glyphs with a longer test timeout; slow, not impossible |
| `src/tools/scan/PdfScanTool.camera.browser.test.tsx:104` | yes | Split into its own file run by a Chromium project launched without the fake camera; real getUserMedia then answers NotFoundError. No new test. |
| `src/tools/scan/PdfScanTool.corners.browser.test.tsx:158` | unsure | Pick a real photo with no page in it (flat paper) so the real first look finds none; test input. |
| `src/tools/scan/PdfScanTool.result.browser.test.tsx:82` | unsure | Feed a real noise photo too big for 1 MB so the real build reports metTarget false; test input, no override. |
| `src/tools/scan/e2e/camera.spec.js:221` | unsure | Playwright CDP Emulation.setCPUThrottlingRate on the real worker instead of a Worker subclass; confirm throttle reaches workers. |
| `src/tools/scan/hooks/useCameraShots.test.tsx:36` | no | Deleted both lines and ran the file: 9 of 9 pass on jsdom real requestAnimationFrame. |
| `src/tools/scan/hooks/useCameraShots.test.tsx:37` | no | Deleted both lines and ran the file: 9 of 9 pass on jsdom real requestAnimationFrame. |
| `src/tools/scan/hooks/useScanDraft.test.tsx:39` | no | restorePages is a handler the tool supplies (state-setter like); a plain recording function is test input, not vi.fn(impl). |
| `src/tools/scan/hooks/useScanDraft.test.tsx:115` | yes | Seed a record with files: [] straight into fake-indexeddb (saveDraft refuses it) so the real loadDraft hands it back. |
| `src/tools/sign/PdfSignTool.protected.test.tsx:91` | yes | Existing e2e/handoff/encrypted-roundtrip-sign.spec.js really navigates to /unlock/; move the parked-record assertion there. |
| `src/tools/sign/PdfSignTool.test.tsx:49` | unsure | Omits case is a unit test on formDetectionEvent (test input); carries case from a real image-only PDF through the real walk. |
| `src/tools/sign/e2e/field-move-scroll.spec.js:371` | unsure | Playwright spec: record 'scroll' events and scrollY change instead of wrapping window.scrollTo; weaker for a no-op scroll. |
| `src/tools/sign/hooks/useAutoFontProvisioning.test.jsx:58` | no | Drop mockResolvedValueOnce: second render runs before the real call rejects, so spy-through passes (run, 6 of 6 green). |

## Would go with a real matchMedia in the test setup (42)

| Site | Reason true | How |
| --- | --- | --- |
| `src/editor-ui/ArmHint.test.tsx:16` | yes | Real matchMedia with (hover: hover) and (pointer: fine) flipped by window state. |
| `src/editor-ui/comments/CommentSheet.coarse.test.tsx:26` | yes | coarse pointer through an evaluating matchMedia |
| `src/editor-ui/hooks/useCoarsePointer.test.tsx:41` | yes | Real matchMedia with a window-state flip and change events; setup's always-true one cannot flip. |
| `src/editor-ui/hooks/useCoarsePointer.test.tsx:43` | yes | Same real matchMedia with change listeners. |
| `src/lib/drafts/useDraftPersistence.test.jsx:328` | yes | matchMedia evaluating (display-mode: standalone) from window state; the navigator.standalone write goes with it. |
| `src/lib/drafts/useDraftPersistence.test.jsx:328` | yes | matchMedia evaluating (display-mode: standalone) from window state; the navigator.standalone write goes with it. |
| `src/shell/pageWorkspace/useDownloadFlow.test.tsx:116` | yes | Real matchMedia with max-width evaluated against a test-set window width. |
| `src/shell/pageWorkspace/useSaveToDrive.test.tsx:98` | yes | Real matchMedia returning false for (hover: hover) and (pointer: fine), as on a phone. |
| `src/shell/verb/VerbStage.test.tsx:11` | yes | Real matchMedia answering prefers-reduced-motion no-preference by window state. |
| `src/test/support/setup.js:39` | yes | This is the always-true matchMedia; replace with one that evaluates queries against window state a test sets. |
| `src/tools/highlight/components/HighlightPage.test.tsx:379` | yes | matchMedia evaluating (pointer: coarse) from window state. |
| `src/tools/highlight/components/HighlightPage.test.tsx:380` | yes | matchMedia evaluating (pointer: coarse) from window state. |
| `src/tools/highlight/components/HighlightPage.test.tsx:625` | yes | matchMedia evaluating prefers-reduced-motion from window state. |
| `src/tools/highlight/components/HighlightPage.test.tsx:626` | yes | matchMedia evaluating prefers-reduced-motion from window state. |
| `src/tools/highlight/components/HighlightWorkspace.test.tsx:105` | yes | matchMedia answering (pointer: coarse) true from window state a test sets. |
| `src/tools/highlight/components/HighlightWorkspace.test.tsx:125` | yes | matchMedia answering (pointer: coarse) false from window state a test sets. |
| `src/tools/highlight/components/PrintMenu.test.tsx:92` | yes | matchMedia answering (pointer: fine) from window state a test sets. |
| `src/tools/highlight/components/PrintMenu.test.tsx:119` | yes | matchMedia answering (pointer: fine) from window state a test sets. |
| `src/tools/highlight/components/capsule/ReadingCapsule.test.tsx:14` | yes | Window-size model: innerWidth plus resize event set by the test, same env as matchMedia. |
| `src/tools/highlight/hooks/useLampEntrance.test.tsx:66` | yes | matchMedia evaluating prefers-reduced-motion from window state. |
| `src/tools/highlight/hooks/useMarkerArming.test.tsx:26` | yes | matchMedia that answers (pointer: coarse) false from window state a test sets. |
| `src/tools/highlight/lib/lampEntrance/lampDom.test.tsx:14` | yes | matchMedia that evaluates prefers-reduced-motion against window state the test sets. |
| `src/tools/merge/hooks/useLinkedHighlight.test.tsx:43` | yes | matchMedia evaluating per-test queries from window state. |
| `src/tools/merge/hooks/useLinkedHighlight.test.tsx:43` | yes | matchMedia evaluating per-test queries from window state. |
| `src/tools/redact/components/RedactBox.floating.test.tsx:19` | yes | fine pointer through a matchMedia that evaluates queries against a window state |
| `src/tools/redact/components/RedactBox.test.tsx:13` | yes | fine pointer through an evaluating matchMedia |
| `src/tools/redact/components/RedactWorkspaceToolbar.test.tsx:91` | yes | coarse pointer through an evaluating matchMedia |
| `src/tools/redact/hooks/useRedactEditor.test.tsx:522` | yes | prefers-reduced-motion false through an evaluating matchMedia |
| `src/tools/scan/hooks/useMediaQuery.test.tsx:29` | yes | Set the window width or media state; a real evaluating matchMedia fires change when the test crosses the query. |
| `src/tools/sign/components/DraggableWrapper.interaction.test.tsx:170` | yes | Real matchMedia evaluating (pointer: coarse) against a test-set window state; fine pointer by default. |
| `src/tools/sign/components/DraggableWrapper.interaction.test.tsx:170` | yes | Real matchMedia evaluating (pointer: coarse) against a test-set window state. |
| `src/tools/sign/components/DraggableWrapper.tapFocus.test.tsx:18` | yes | Real matchMedia evaluating (pointer: coarse) against a test-set window state. |
| `src/tools/sign/components/DraggableWrapper.test.tsx:301` | yes | Real matchMedia evaluating (pointer: coarse) against a test-set window state. |
| `src/tools/sign/components/ElementToolbar.test.tsx:24` | yes | Real matchMedia evaluating (pointer: coarse) against a test-set window state. |
| `src/tools/sign/components/ElementToolbar.test.tsx:24` | yes | Real matchMedia evaluating (pointer: coarse) against a test-set window state. |
| `src/tools/sign/components/FontPickerMenu.test.tsx:18` | yes | Real matchMedia evaluating (pointer: coarse) against a test-set window state. |
| `src/tools/sign/components/FontPickerMenu.test.tsx:18` | yes | Real matchMedia evaluating (pointer: coarse) against a test-set window state. |
| `src/tools/sign/components/PdfWorkspace.test.tsx:1137` | yes | Real matchMedia evaluating (pointer: coarse) against a test-set window state. |
| `src/tools/sign/components/PdfWorkspace.test.tsx:1137` | yes | Real matchMedia evaluating (pointer: coarse) against a test-set window state. |
| `src/tools/sign/components/SignToolbar.test.tsx:1474` | yes | Real matchMedia evaluating (pointer: coarse) against a test-set window state. |
| `src/tools/sign/components/nodes/TextNode.test.tsx:797` | yes | Real matchMedia evaluating (pointer: coarse) against a test-set window state. |
| `src/tools/sign/components/nodes/TextNode.test.tsx:797` | yes | Real matchMedia evaluating (pointer: coarse) against a test-set window state. |

## Would go with a new browser test, core to a tool (32)

| Site | Reason true | How |
| --- | --- | --- |
| `scripts/sw.test.mjs:76` | yes | real service worker suite in Chromium: real self scope, skipWaiting, claim; shares one test with the other sw mocks |
| `scripts/sw.test.mjs:80` | yes | real clients.matchAll in the same real service worker suite |
| `scripts/sw.test.mjs:80` | yes | real clients.matchAll in the same real service worker suite |
| `scripts/sw.test.mjs:82` | yes | real registration in the same real service worker suite |
| `scripts/sw.test.mjs:1215` | yes | real window client in the sw suite; a page without a handler is a silent tab |
| `scripts/sw.test.mjs:1488` | yes | real waiting worker needs two worker versions in the sw suite |
| `scripts/sw.test.mjs:1622` | yes | real window client in the sw suite |
| `scripts/sw.test.mjs:2162` | yes | real fetch in Chromium answers an opaque redirect when MSW sends a 3xx, in the sw suite |
| `scripts/sw.test.mjs:2451` | yes | real registration queues unregister behind the install; sw suite shows it for real |
| `scripts/sw.test.mjs:2618` | yes | real window client in the sw suite |
| `src/editor-ui/PdfPageCanvas.sharpness.test.tsx:27` | yes | real page canvas in Chromium: set device pixel ratio, shown width and real resize; one sharpness test |
| `src/editor-ui/PdfPageCanvas.sharpness.test.tsx:29` | yes | real ResizeObserver in the same sharpness test |
| `src/editor-ui/PdfPageCanvas.sharpness.test.tsx:36` | yes | real layout width in the same sharpness test |
| `src/editor/registry/signature.test.ts:72` | yes | real canvas tint in Chromium: one test that draws a signature and reads the stored pixel |
| `src/lib/images/imagePage.test.js:32` | yes | Real redraw of a truncated PNG in Chromium; same shared test file as the other image sites. |
| `src/lib/images/imagePage.test.js:47` | yes | Real redraw failing on garbage in Chromium; same file. |
| `src/lib/images/imagesToPdf.test.js:73` | yes | Real redraw in Chromium; same shared image browser test file. |
| `src/lib/images/imagesToPdf.test.js:80` | yes | Real redraw in Chromium; same shared image browser test file. |
| `src/lib/images/imagesToPdf.test.js:85` | yes | Real redraw in Chromium; same shared image browser test file. |
| `src/test/cross-tool/shellPageGrid.test.tsx:112` | yes | One PageGrid Chromium test: real IntersectionObserver, scroll and layout. Shares with 767, setup.js 13 and edit-pages open 77. |
| `src/test/cross-tool/shellPageGrid.test.tsx:767` | yes | Same PageGrid Chromium test: real getBoundingClientRect gives the data-edge marks. |
| `src/test/support/setup.js:13` | yes | Overlay follow-resize needs real ResizeObserver: one editor-overlay Chromium test; jsdom tests mounting overlays must move or lose the polyfill. |
| `src/tools/compress/PdfCompressTool.flows.browser.test.tsx:763` | yes | Playwright e2e of the real hand-off navigation Compress to Sign; shares one test with other navigate sites. Alternative: shell passes navigate as a prop. |
| `src/tools/compress/hooks/useImageBatch.test.tsx:45` | yes | Same shared real-image compress browser test as compressCallbacks (real photo, Chromium encoder). |
| `src/tools/compress/lib/compressCallbacks.test.ts:24` | yes | One browser test of real image compress via Chromium canvas encoder; could share one file with useImageBatch 45 and the existing image flow. |
| `src/tools/edit-pages/PdfEditPagesTool.open.test.tsx:77` | unsure | Replace-file on a real detached grid in Chromium; share the PageGrid browser test (shellPageGrid 112) so Sortable.destroy runs for real. |
| `src/tools/highlight/components/NoteWriter.test.tsx:37` | yes | Real Chromium dialog showModal/close for writing a note. One NoteWriter browser test (open, type, save, discard) covers both lines. |
| `src/tools/highlight/components/NoteWriter.test.tsx:38` | yes | Real Chromium dialog showModal/close for writing a note. One NoteWriter browser test (open, type, save, discard) covers both lines. |
| `src/tools/merge/lib/merge.test.js:471` | yes | Real redrawPng in Chromium; shares one image-redraw browser test file with imagePage and imagesToPdf sites (truncated PNG rescued). |
| `src/tools/redact/PdfRedactTool.flows.browser.test.tsx:581` | yes | Playwright e2e of the real Redact to Unlock hand-off navigation; one test for all hand-off sites |
| `src/tools/sign/lib/fontOfflinePacks.test.js:14` | yes | Real sw.js registered in Chromium, real message round trip; one test can serve all three sites (offline Sign fonts). |
| `src/tools/sign/lib/fontOfflinePacks.test.js:17` | yes | Same real service worker test, controller property is real there. |

## Would go with a product change (106)

| Site | Reason true | How |
| --- | --- | --- |
| `src/editor-ui/comments/CommentRail.test.tsx:56` | yes | card stacking as a pure function of measured heights; component only measures |
| `src/editor-ui/comments/CommentRail.test.tsx:58` | yes | same pure stacking function takes the rail height as input |
| `src/editor-ui/comments/CommentRail.test.tsx:68` | yes | same pure stacking function takes card heights as input |
| `src/editor-ui/highlight/highlightSwipeGesture.test.ts:151` | yes | Drop the injected reader seam; bands come from createSwipeReader on a real canvas. |
| `src/editor-ui/highlight/highlightSwipeGesture.test.ts:164` | yes | Same: reader seam removed, direction asserted through real bands. |
| `src/editor/text/dateFormat.test.ts:97` | yes | detectLocale takes the language string; callers pass navigator.language |
| `src/editor/text/dateFormat.test.ts:103` | yes | detectLocale takes the language string; callers pass navigator.language |
| `src/editor/workspace/loadPdf.test.ts:93` | unsure | loadPdf takes a Blob/stream so a held read stalls it (pdf.js can be slow via a range transport, but only inside product). |
| `src/lib/drafts/draftRemovalWatch.test.ts:33` | yes | Watch takes an onRemoved callback and the caller reloads, so the test records a real callback; a real reload ends the test page. |
| `src/lib/drafts/useDraftPersistence.test.jsx:167` | yes | saveDraft never rejects, so the hook catch is unreachable with the real store; remove it or make store failure a real input. |
| `src/lib/gestures/tapOutsideDeselect.test.ts:154` | yes | readTapSample takes the visualViewport object as an argument; production passes window.visualViewport |
| `src/lib/handoff/sendHandoff.test.ts:86` | yes | Delete the dead rejection branch: saveHandoff catches and answers false, which the test above already covers. |
| `src/lib/pdf/thumbnails.test.js:245` | yes | render() exposes a step between finished render and return, or takes a hook, so the abort can land there for real. |
| `src/lib/telemetry/analyticsSink.noBrowser.test.ts:26` | yes | page address read through a typeof-guarded reader like the other three globals, or passed in |
| `src/lib/telemetry/errorReport.page.test.ts:46` | yes | readBuildCommit parses a Server-Timing entry list passed in, so tests give the list as input |
| `src/lib/telemetry/pagePerformance.test.ts:141` | yes | page measures as a pure function of entry lists; real loads give no chosen sizes |
| `src/lib/telemetry/pagePerformance.test.ts:152` | yes | same pure measure function takes the observer entries as input |
| `src/lib/telemetry/pagePerformance.test.ts:158` | yes | absent Resource Timing is a null input to the pure measure function |
| `src/lib/telemetry/pagePerformance.test.ts:160` | yes | absent PerformanceObserver is a null input to the pure measure function |
| `src/lib/telemetry/productAnalytics.test.ts:117` | yes | navigation type read by a pure parser of the entry list |
| `src/lib/telemetry/productAnalytics.test.ts:129` | yes | navigation type read by a pure parser of the entry list |
| `src/lib/telemetry/productAnalytics.test.ts:131` | yes | navigation type read by a pure parser of the entry list |
| `src/lib/telemetry/productAnalytics.test.ts:175` | yes | build commit parsed from a Server-Timing entry list passed in |
| `src/lib/telemetry/productAnalytics.test.ts:362` | yes | collectPageMeasures result as pure function of entry lists the test supplies |
| `src/lib/telemetry/productAnalytics.test.ts:376` | yes | same pure measure function as line 362 |
| `src/lib/telemetry/productAnalytics.test.ts:385` | yes | ready computed from a number input; real clock is never NaN |
| `src/lib/telemetry/ratingReport.test.ts:115` | yes | real sendBeacon wrapper already catches; reportRating's own catch is unreachable, remove it or test the wrapper |
| `src/lib/telemetry/ratingReport.test.ts:140` | yes | same as line 115: reportRatingComment's catch is unreachable behind the wrapper |
| `src/shell/pageWorkspace/useDownloadFlow.test.tsx:370` | yes | Real saveHandoff never throws: drop the unreachable catch, or let the transport throw for a real cause. |
| `src/shell/pageWorkspace/useDownloadFlow.test.tsx:425` | unsure | Hand-off save takes a Blob so a held read stalls it; late failure still needs a real reject (blocked store). |
| `src/shell/pageWorkspace/useDownloadFlow.test.tsx:425` | unsure | Same as above: held read plus late failure from real inputs. |
| `src/shell/pageWorkspace/useOpenPageDocument.test.tsx:117` | yes | Page loader takes a Blob so a held file can stall it. |
| `src/site-lib/pageView.test.ts:41` | yes | real readAndStampVisits swallows storage errors, so the catch is unreachable; remove it |
| `src/site-lib/reportContract.test.ts:45` | yes | build commit parsed from a Server-Timing entry list passed in |
| `src/test/cross-tool/draftCheckingPlaceholder.test.tsx:48` | yes | Same loader cross-realm fix; loadDraft then runs real without the copy wrapper. |
| `src/test/cross-tool/draftRestoreRace.test.tsx:107` | unsure | Loader copies bytes into the page realm before pdf.js (cross-realm ArrayBuffer fix); the hold can then use real holdDraftStore, as the placeholder test does. |
| `src/test/cross-tool/draftRestoreRace.test.tsx:132` | yes | Same cross-realm bytes fix in the loader; the real peekHandoff then runs with no wrapper. |
| `src/test/cross-tool/shellPageGrid.test.tsx:279` | yes | Thumbnail queue (cancel, failure report) as a module taking each render outcome as data; real pdf.js render cannot be held or failed on cue. |
| `src/test/cross-tool/shellPageGrid.test.tsx:298` | yes | Thumbnail queue (cancel, failure report) as a module taking each render outcome as data; real pdf.js render cannot be held or failed on cue. |
| `src/test/cross-tool/shellPageGrid.test.tsx:344` | yes | Delete the unreachable null-aspects fallback: a real source never reports no page sizes. |
| `src/test/support/redactTool.browser.tsx:110` | yes | Export runs through a job module with pure tests of held and superseded runs; no real input holds an export on cue. |
| `src/test/support/scanTool.browser.tsx:100` | yes | Scan steps run through a queue module with pure scheduling tests; island tests drop held-at-start cases. No real input holds a step on cue. |
| `src/tools/compress/PdfCompressTool.flows.browser.test.tsx:117` | yes | Same gated-Blob input: build, thumbnail and probe read the file through one loader taking a Blob, so no hold-through wrapper is needed. |
| `src/tools/compress/PdfCompressTool.flows.browser.test.tsx:800` | yes | probeEncryption returns an unknown outcome as a value instead of rejecting; the catch is dead since pdf.js errors never escape it. |
| `src/tools/compress/PdfCompressTool.flows.browser.test.tsx:812` | yes | Probe reads the file through the same gated-Blob loader, so a held first check and a newer pick need no replaced probe. |
| `src/tools/compress/PdfCompressTool.flows.browser.test.tsx:834` | yes | Probe reads the file through the same gated-Blob loader, so a held first check and a newer pick need no replaced probe. |
| `src/tools/compress/PdfCompressTool.test.tsx:79` | yes | One shared file read feeds analysis, thumbnails and build; a gated Blob subclass as the picked file then stalls the build deterministically. |
| `src/tools/compress/components/BatchWorkspace.test.tsx:66` | yes | Batch queue and order as a pure reducer fed settled results; the workspace test stops needing a compressor result in jsdom. |
| `src/tools/compress/hooks/useImageBatch.test.tsx:82` | yes | Batch queue and unmount guard as a pure reducer fed settled results; no held compress needed. |
| `src/tools/highlight/hooks/useMarkSwipe.test.tsx:384` | yes | Hook builds the reader itself from the page canvas via createSwipeReader (spy-through) instead of taking readerAt. |
| `src/tools/highlight/hooks/useMarkSwipe.test.tsx:394` | yes | Same change: hook calls createSwipeReader itself; spy-through shows no call for a mouse. |
| `src/tools/highlight/hooks/useNoteRoom.test.tsx:26` | yes | useNoteRoom returns the room to make (a value) instead of calling zoom.makeRoom; test reads the value. |
| `src/tools/highlight/hooks/useScanCheck.test.tsx:128` | yes | Real readScan returns null once not live, so the hook post-read live check is unreachable; drop it or let a held step stall readScan. |
| `src/tools/image-to-pdf/lib/buildImagesPdf.test.ts:29` | yes | imagesToPdf returns instead of throwing at its end, or exposes the save step to abort |
| `src/tools/merge/hooks/useMergeDraft.test.tsx:466` | yes | Draft size check reads file.size before arrayBuffer(); test builds a File from repeated Blob references, no 200MB copy. |
| `src/tools/merge/hooks/useMergeDraft.test.tsx:479` | yes | Draft size check reads file.size before arrayBuffer(); test builds a File from repeated Blob references, no 200MB copy. |
| `src/tools/redact/PdfRedactTool.flows.browser.test.tsx:478` | yes | loader takes a Blob so a held file can stall the pdf.js load |
| `src/tools/redact/hooks/useDeletePreviews.test.ts:112` | yes | bytes come from a Blob whose read can fail once |
| `src/tools/redact/hooks/useDeletePreviews.test.ts:141` | yes | same Blob loader gives a held parse to cancel mid-way |
| `src/tools/redact/hooks/useObjectPreviews.destroyed.test.tsx:69` | yes | loader takes a Blob so a held file keeps the new document's read pending |
| `src/tools/redact/hooks/useObjectPreviews.test.tsx:90` | unsure | real null from readGlyphs always comes with the reader's own report; separate the hook's report from the reader's |
| `src/tools/redact/hooks/useRedactCommands.test.ts:42` | yes | export describeRedactUpdate from its own lib module and use the real one |
| `src/tools/redact/hooks/useSavedFileCheck.test.tsx:132` | yes | check takes its bytes as a Blob a test can hold open |
| `src/tools/redact/lib/deleteObjects.test.js:519` | unsure | damaged pages are tolerated so the catch is unreachable; drop it or find a page the extractor rejects |
| `src/tools/redact/lib/find/pageText.test.ts:126` | yes | the algorithm returns its trim count so no global is patched |
| `src/tools/redact/lib/textLayer.test.ts:165` | yes | the algorithm returns its comparison count so no global is patched |
| `src/tools/scan/PdfScanTool.viewer.browser.test.tsx:140` | yes | Inspect and process share one decode, so an unreadable photo fails once at inspect (existing unreadable path); the process-only failure state is unreachable. |
| `src/tools/scan/components/ScanCornersView.test.tsx:165` | yes | Lift the trace request out of the view into a host hook; the view gets sides as a prop (test data), and the stale-answer guard becomes a pure reducer. |
| `src/tools/scan/components/ScanCornersView.test.tsx:178` | yes | Lift the trace request out of the view into a host hook; the view gets sides as a prop (test data), and the stale-answer guard becomes a pure reducer. |
| `src/tools/scan/components/ScanCornersView.test.tsx:187` | yes | Lift the trace request out of the view into a host hook; the view gets sides as a prop (test data), and the stale-answer guard becomes a pure reducer. |
| `src/tools/scan/components/ScanCornersView.test.tsx:196` | yes | Lift the trace request out of the view into a host hook; the view gets sides as a prop (test data), and the stale-answer guard becomes a pure reducer. |
| `src/tools/scan/components/ScanCornersView.test.tsx:205` | yes | Lift the trace request out of the view into a host hook; the view gets sides as a prop (test data), and the stale-answer guard becomes a pure reducer. |
| `src/tools/scan/components/ScanCornersView.test.tsx:205` | yes | Lift the trace request out of the view into a host hook; the view gets sides as a prop (test data), and the stale-answer guard becomes a pure reducer. |
| `src/tools/scan/components/ScanCornersView.test.tsx:219` | yes | Lift the trace request out of the view into a host hook; the view gets sides as a prop (test data), and the stale-answer guard becomes a pure reducer. |
| `src/tools/scan/components/ScanCornersView.test.tsx:227` | yes | Lift the trace request out of the view into a host hook; the view gets sides as a prop (test data), and the stale-answer guard becomes a pure reducer. |
| `src/tools/scan/components/ScanCornersView.test.tsx:227` | yes | Lift the trace request out of the view into a host hook; the view gets sides as a prop (test data), and the stale-answer guard becomes a pure reducer. |
| `src/tools/scan/components/Viewfinder.test.tsx:10` | yes | Viewfinder takes the camera handle as a prop (useCamera moves to the parent); the handle is then plain test data. |
| `src/tools/scan/hooks/useCameraShots.test.tsx:8` | yes | Shooting policy becomes a pure machine fed frame observations and photo outcomes; frame grabbing stays in the thin hook, covered by camera e2e. |
| `src/tools/scan/hooks/useCameraShots.test.tsx:10` | yes | Same policy machine: camera open and takePhoto outcomes are data events, so no camera module is replaced. |
| `src/tools/scan/hooks/useCameraShots.test.tsx:12` | yes | Same policy machine: camera open and takePhoto outcomes are data events, so no camera module is replaced. |
| `src/tools/scan/hooks/useCameraShots.test.tsx:38` | yes | Same policy machine: worker answers are data events; the hook only wires Worker. |
| `src/tools/scan/hooks/useCameraShots.test.tsx:42` | yes | Same policy machine: camera open and takePhoto outcomes are data events, so no camera module is replaced. |
| `src/tools/scan/hooks/useCameraShots.test.tsx:64` | yes | Refused, held and never-answered photos become outcome events of the policy machine; the three-second close wait a pure function over a pending promise. |
| `src/tools/scan/hooks/useCameraShots.test.tsx:73` | yes | Refused, held and never-answered photos become outcome events of the policy machine; the three-second close wait a pure function over a pending promise. |
| `src/tools/scan/hooks/useCameraShots.test.tsx:80` | yes | Refused, held and never-answered photos become outcome events of the policy machine; the three-second close wait a pure function over a pending promise. |
| `src/tools/scan/hooks/useCameraShots.test.tsx:92` | yes | Refused, held and never-answered photos become outcome events of the policy machine; the three-second close wait a pure function over a pending promise. |
| `src/tools/scan/hooks/useCameraShots.test.tsx:92` | yes | Refused, held and never-answered photos become outcome events of the policy machine; the three-second close wait a pure function over a pending promise. |
| `src/tools/scan/hooks/useCameraShots.test.tsx:106` | yes | Refused, held and never-answered photos become outcome events of the policy machine; the three-second close wait a pure function over a pending promise. |
| `src/tools/scan/hooks/useCameraShots.test.tsx:106` | yes | Refused, held and never-answered photos become outcome events of the policy machine; the three-second close wait a pure function over a pending promise. |
| `src/tools/scan/hooks/useCameraShots.test.tsx:121` | yes | Refused, held and never-answered photos become outcome events of the policy machine; the three-second close wait a pure function over a pending promise. |
| `src/tools/scan/hooks/useCameraShots.test.tsx:133` | yes | Refused, held and never-answered photos become outcome events of the policy machine; the three-second close wait a pure function over a pending promise. |
| `src/tools/scan/hooks/useCameraShots.test.tsx:145` | yes | Refused, held and never-answered photos become outcome events of the policy machine; the three-second close wait a pure function over a pending promise. |
| `src/tools/scan/hooks/useCameraShots.test.tsx:147` | yes | useCamera takes a pageHidden signal as input from the host; jsdom and Playwright cannot hide a page on cue. |
| `src/tools/scan/hooks/useScanPdfPages.browser.test.tsx:72` | yes | Cancel guard becomes a consumer taking an async iterable of sheets as an argument; the test passes its own iterable. |
| `src/tools/scan/hooks/useScanResults.test.tsx:73` | yes | Export adoptResult as a pure function over a ProcessedPage and the removed set; test passes the result as data. Real processPage cannot decode in jsdom. |
| `src/tools/scan/lib/pageWork/offThread.test.ts:36` | yes | Worker supervision (probe, timeout, death, capability flags) as a pure machine fed events and flags as data; real Worker stays in e2e. |
| `src/tools/scan/lib/pageWork/offThread.test.ts:38` | yes | Worker supervision (probe, timeout, death, capability flags) as a pure machine fed events and flags as data; real Worker stays in e2e. |
| `src/tools/scan/lib/pageWork/offThread.test.ts:57` | yes | Worker supervision (probe, timeout, death, capability flags) as a pure machine fed events and flags as data; real Worker stays in e2e. |
| `src/tools/scan/lib/pageWork/page.worker.test.ts:13` | yes | Worker module exports a pure answer(request) and wires self in one line; Node really lacks OffscreenCanvas, so the probe says no. |
| `src/tools/scan/lib/pageWork/processPixels.test.ts:102` | yes | Catch of a failing step becomes a pure settle(fn) helper; test hands it a throwing function as input. No real photo makes measure or trace throw. |
| `src/tools/scan/lib/pageWork/processPixels.test.ts:204` | yes | Catch of a failing step becomes a pure settle(fn) helper; test hands it a throwing function as input. No real photo makes measure or trace throw. |
| `src/tools/scan/lib/scanPipeline.browser.test.ts:65` | yes | Worker choice and crash handling become a pure supervisor over events and capability flags (probe, crash, no worker) fed as data; real worker covered by e2e. |
| `src/tools/scan/lib/scanPipeline.browser.test.ts:169` | yes | Worker choice and crash handling become a pure supervisor over events and capability flags (probe, crash, no worker) fed as data; real worker covered by e2e. |
| `src/tools/security/PdfSecurityTool.browser.test.tsx:126` | unsure | Compare render takes a source a held file can stall, instead of a held mock of the renderer. |
| `src/tools/sign/PdfSignTool.test.tsx:28` | unsure | Export takes a source a held read can stall; failures from real input (emoji, offline font) cover some, a plain Error has no real cause. |
| `src/tools/split/PdfSplitTool.load.test.tsx:55` | yes | Page loader takes a Blob so a held file can stall it. |

## Stays: needs a browser test, not core to a tool (98)

| Site | Reason true | How |
| --- | --- | --- |
| `scripts/sw.test.mjs:2210` | yes | real quota refusal via CDP quota in a new Chromium test; storage fault edge, not core |
| `scripts/sw.test.mjs:2490` | yes | real full disk via CDP quota in a new Chromium test; storage fault edge, not core |
| `src/editor-ui/comments/useCommentsView.test.tsx:39` | yes | ResizeObserver callbacks need Chromium layout; comment rail chrome, not core |
| `src/editor-ui/hooks/useCurrentPage.test.jsx:54` | yes | Real IntersectionObserver callbacks need Chromium layout and scroll; fullscreen page indicator, not core. |
| `src/editor-ui/hooks/useVisualViewportScale.test.tsx:26` | yes | Real visualViewport resize and scale need Chromium and CDP pinch; toolbar pinch edge, not core. |
| `src/editor-ui/hooks/useVisualViewportScale.test.tsx:30` | yes | Same real visualViewport listeners in Chromium; not core. |
| `src/editor-ui/hooks/useVisualViewportScale.test.tsx:36` | yes | Same real visualViewport in Chromium; not core. |
| `src/editor-ui/hooks/visualViewportClamp.test.tsx:38` | yes | Real visualViewport offsets need a CDP pinch in Chromium; toolbar clamp edge layout, not core. |
| `src/editor-ui/hooks/workspaceFullscreen.test.tsx:16` | yes | Real requestFullscreen granted in Chromium after a user click; chrome, not core. |
| `src/editor-ui/hooks/workspaceFullscreen.test.tsx:26` | yes | Chromium really refuses requestFullscreen without user activation; chrome, not core. |
| `src/editor-ui/hooks/workspaceFullscreen.test.tsx:53` | yes | Real grant inside the wait in Chromium; chrome, not core. |
| `src/editor/workspace/preferenceStore.test.ts:403` | unsure | Needs Chromium launched with site data blocked so storage throws SecurityError; not core. |
| `src/lib/drafts/draftSourceId.test.ts:53` | yes | Missing crypto.subtle happens on insecure http origins; needs a Chromium page on a non-secure host. Fallback hash, not core. |
| `src/lib/drafts/draftSourceId.test.ts:63` | yes | Missing crypto.subtle happens on insecure http origins; needs a Chromium page on a non-secure host. Fallback hash, not core. |
| `src/lib/drafts/draftStore.test.js:792` | yes | Browser granting persist(): CDP durableStorage grant in Chromium; persistence request is not a tool capability. |
| `src/lib/drafts/draftStore.test.js:806` | yes | Same as 792: granted persist() in Chromium via CDP grant. |
| `src/lib/drafts/draftStore.test.js:868` | yes | persisted() true needs CDP durableStorage grant in Chromium; infrastructure. |
| `src/lib/drafts/draftStore.test.js:871` | yes | persisted() false is the Chromium default; same new browser file as 868. |
| `src/lib/drafts/draftStore.test.js:892` | yes | persisted() rejects only in a sandboxed opaque-origin frame in Chromium; infrastructure, not core. |
| `src/lib/drafts/useDraftPersistence.test.jsx:243` | yes | Hidden page needs Chromium; flush-on-hide safety net is not a tool capability. |
| `src/lib/drafts/useDraftPersistence.test.jsx:362` | yes | persisted() false needs real navigator.storage (Chromium); unpersisted warning is chrome. |
| `src/lib/drafts/useDraftPersistence.test.jsx:378` | yes | Same as 362. |
| `src/lib/drafts/useDraftPersistence.test.jsx:388` | yes | Same as 362. |
| `src/lib/drafts/useDraftPersistence.test.jsx:411` | yes | Same as 362. |
| `src/lib/pageLayout/swipeReader.test.ts:64` | yes | Null 2d context (webgl first) and tainted canvas are real in Chromium; edge failures of line snapping, not core. |
| `src/lib/pageLayout/swipeReader.test.ts:68` | yes | Null 2d context (webgl first) and tainted canvas are real in Chromium; edge failures of line snapping, not core. |
| `src/lib/pdf/thumbnails.test.js:313` | yes | Real createImageBitmap needs Chromium; photo thumbnail decode, not core. |
| `src/lib/telemetry/errorReport.beacon.test.ts:83` | yes | offline needs CDP network emulation in a new Chromium test; telemetry gate, not core |
| `src/lib/telemetry/errorReport.beacon.test.ts:94` | yes | as above, offline via CDP; telemetry, not core |
| `src/lib/telemetry/errorReport.page.test.ts:18` | yes | needs a real controlling worker in Chromium; telemetry page facts, not core; could ride the sw browser-core test |
| `src/lib/telemetry/maintenanceTelemetry.test.ts:150` | yes | offline needs CDP network emulation in a new Chromium test; telemetry, not core |
| `src/lib/telemetry/workerDownloads.test.ts:50` | yes | needs a real controlling worker and its messages in Chromium; download telemetry, not core; could ride the sw browser-core test |
| `src/shell/Popover.test.tsx:22` | yes | Real anchor position is visible only with Chromium layout; popover placement is chrome. |
| `src/shell/RatingPrompt.test.tsx:298` | yes | Real navigator.clipboard in Chromium with granted permission; rating prompt chrome. |
| `src/shell/RatingPrompt.test.tsx:300` | yes | Same real clipboard in Chromium; rating chrome. |
| `src/shell/RatingPrompt.test.tsx:308` | yes | Chromium clipboard write really rejects without permission; rating chrome. |
| `src/shell/RatingPrompt.test.tsx:308` | yes | Same real clipboard rejection; rating chrome. |
| `src/shell/pageWorkspace/useSaveToDrive.test.tsx:64` | yes | Real window.open popup in Chromium; Drive save is not core. |
| `src/shell/useModalDialog.test.tsx:31` | yes | Checked: jsdom 31 has no showModal or close. Real dialog needs Chromium in a new test; the hook is shell chrome. |
| `src/shell/useModalDialog.test.tsx:33` | yes | Checked: jsdom 31 has no showModal or close. Real dialog needs Chromium in a new test; the hook is shell chrome. |
| `src/site-lib/FileDropzone.test.tsx:136` | yes | Real offline needs CDP emulation in a browser test; hiding the Drive link offline is chrome. |
| `src/site-lib/FileDropzone.test.tsx:139` | yes | Real offline needs CDP emulation in a browser test; hiding the Drive link offline is chrome. |
| `src/site-lib/PinnedNotes.test.tsx:98` | yes | Real layout needs Chromium; folding of long notes is page chrome, not core. |
| `src/site-lib/PinnedNotes.test.tsx:99` | yes | Real layout needs Chromium; folding of long notes is page chrome, not core. |
| `src/site-lib/PinnedNotes.test.tsx:114` | yes | Real layout needs Chromium; folding of long notes is page chrome, not core. |
| `src/site-lib/appUpdate.test.ts:56` | yes | Update coordinator needs a real service worker and two builds (Playwright territory); infrastructure, not core. |
| `src/site-lib/appUpdate.test.ts:75` | yes | Update coordinator needs a real service worker and two builds (Playwright territory); infrastructure, not core. |
| `src/site-lib/appUpdate.test.ts:79` | yes | Update coordinator needs a real service worker and two builds (Playwright territory); infrastructure, not core. |
| `src/site-lib/appUpdate.test.ts:81` | yes | Update coordinator needs a real service worker and two builds (Playwright territory); infrastructure, not core. |
| `src/site-lib/appUpdate.test.ts:201` | yes | Update coordinator needs a real service worker and two builds (Playwright territory); infrastructure, not core. |
| `src/site-lib/appUpdate.test.ts:447` | yes | Update coordinator needs a real service worker and two builds (Playwright territory); infrastructure, not core. |
| `src/site-lib/appUpdate.test.ts:461` | yes | Update coordinator needs a real service worker and two builds (Playwright territory); infrastructure, not core. |
| `src/site-lib/appUpdate.test.ts:469` | yes | Update coordinator needs a real service worker and two builds (Playwright territory); infrastructure, not core. |
| `src/site-lib/appUpdate.test.ts:913` | yes | Update coordinator needs a real service worker and two builds (Playwright territory); infrastructure, not core. |
| `src/site-lib/appUpdate.test.ts:929` | yes | Update coordinator needs a real service worker and two builds (Playwright territory); infrastructure, not core. |
| `src/site-lib/chunkReload.test.ts:82` | yes | A real reload is observable only in Playwright navigation, not in Vitest; maintenance path, not core. |
| `src/site-lib/swInstallReport.test.ts:26` | yes | Real CacheStorage needs Chromium in a new browser test; maintenance telemetry is not core. |
| `src/site-lib/swInstallReport.test.ts:28` | yes | Real CacheStorage needs Chromium in a new browser test; maintenance telemetry is not core. |
| `src/site-lib/swInstallReport.test.ts:51` | yes | Real offline via CDP network emulation in a browser test; maintenance telemetry is not core. |
| `src/test/harness/browserToolHarness.browser.test.ts:68` | yes | Harness self-test of late frames; timing double in test support, not product. |
| `src/test/support/setup.js:25` | yes | Only keeps the fullscreen page indicator mountable in jsdom; real IO needs layout, and the indicator is chrome. |
| `src/tools/highlight/components/HighlightPage.test.tsx:248` | yes | Click anchor percent needs a real mark rect; popover placement is chrome. |
| `src/tools/highlight/components/HighlightWorkspace.test.tsx:210` | yes | Workspace width needs real layout; note placement detail, not core. |
| `src/tools/highlight/components/HighlightWorkspace.test.tsx:214` | yes | Reporting ResizeObserver needs real layout; side-note room placement is not core. |
| `src/tools/highlight/components/HighlightWorkspace.test.tsx:356` | yes | Print menu anchored to a button rect needs real layout; chrome. |
| `src/tools/highlight/components/LampCord.test.tsx:57` | yes | getClientRects needs real layout; lamp cord is chrome. Double stays. |
| `src/tools/highlight/components/NotePane.test.tsx:109` | yes | scrollIntoView and offsetHeight need real layout; keeping a mark visible above the pane is chrome. |
| `src/tools/highlight/components/NotePane.test.tsx:112` | yes | offsetHeight needs real layout; chrome. |
| `src/tools/highlight/components/RestToolbar.test.tsx:104` | yes | Row position for Undo needs real layout; toolbar placement is chrome. |
| `src/tools/highlight/components/RestToolbar.test.tsx:233` | yes | Hint clamp to page card needs real layout; chrome. |
| `src/tools/highlight/components/RestToolbar.test.tsx:237` | yes | documentElement.clientWidth needs a real page width; chrome. |
| `src/tools/highlight/hooks/useBoardPan.test.tsx:68` | yes | Hidden page needs a real browser (CDP emulation); Space-pan reset on hide is chrome. |
| `src/tools/highlight/hooks/useCordTuck.test.tsx:29` | yes | getClientRects needs real layout; cord tuck is chrome. Double stays. |
| `src/tools/highlight/hooks/useHighlightComments.test.tsx:25` | yes | Comment rail width needs real layout and a reporting ResizeObserver; side-rail layout is not core. |
| `src/tools/highlight/hooks/useLampEntrance.test.tsx:41` | yes | Boxes and offsets need real layout; lamp entrance is decoration. |
| `src/tools/highlight/hooks/useLampEntrance.test.tsx:43` | yes | Boxes and offsets need real layout; lamp entrance is decoration. |
| `src/tools/highlight/hooks/useLampEntrance.test.tsx:59` | yes | Chromium has real animate, but lamp entrance is decoration. |
| `src/tools/highlight/hooks/useMarkSwipe.test.tsx:264` | yes | visualViewport scale needs a real pinch (CDP page scale); sideways pan on a zoomed phone is an edge. |
| `src/tools/highlight/hooks/useNoteFocusOut.test.tsx:99` | yes | Real window focus loss needs Chromium; closing a note on focus-out is chrome. |
| `src/tools/highlight/lib/enhance/assessor.test.ts:27` | yes | Real worker death: dispatch a real ErrorEvent on a spy-through Worker in Chromium; fallback robustness, not core. |
| `src/tools/highlight/lib/enhance/assessor.test.ts:37` | yes | Real worker death: dispatch a real ErrorEvent on a spy-through Worker in Chromium; fallback robustness, not core. |
| `src/tools/highlight/lib/enhance/readScan.test.ts:128` | yes | Real worker path needs Chromium (assessor.browser.test covers the worker); crooked-scan hint is not core. |
| `src/tools/highlight/lib/enhance/readScan.test.ts:136` | yes | A module worker that cannot start cannot be made in Chromium either; fallback robustness, not core. |
| `src/tools/highlight/lib/lampEntrance/lampDom.test.tsx:9` | yes | Real layout needs Chromium; lamp/hint/position detail is chrome, not core. Double stays. |
| `src/tools/highlight/lib/lampEntrance/lampPlayer.test.ts:10` | yes | Chromium has real Element.animate, but lamp entrance animation is decoration, not core. Double stays. |
| `src/tools/highlight/lib/lampEntrance/lampPlayer.test.ts:17` | yes | Chromium has real Element.animate, but lamp entrance animation is decoration, not core. Double stays. |
| `src/tools/redact/hooks/useRedactFinish.test.tsx:152` | yes | real window.open needs Chromium; Drive tab chrome, not core |
| `src/tools/redact/hooks/useSavedFileCheck.test.tsx:103` | yes | needs a real failed dynamic import in Chromium; deploy-staleness recovery, not core |
| `src/tools/scan/hooks/usePinchZoom.test.tsx:22` | unsure | Needs a real track with zoom capability (Chromium fake device PTZ, unverified) in a new browser test; pinch zoom is an extra, not core. |
| `src/tools/scan/lib/camera/cameraStream.test.ts:19` | unsure | Real track from the fake camera plus applyConstraints advanced zoom would do it, in a new browser test; pacer step-down is not core. |
| `src/tools/security/PdfSecurityTool.test.tsx:174` | yes | Production-shaped stack only exists in the built bundle in a browser; telemetry, not core. |
| `src/tools/sign/components/FontPickerMenu.test.tsx:251` | yes | Needs real dialog showModal in Chromium; jsdom 31 has none. Font sheet is chrome, not core. |
| `src/tools/sign/components/FontPickerMenu.test.tsx:253` | yes | Same real dialog close() need; chrome, not core. |
| `src/tools/sign/components/FontSheet.test.tsx:28` | yes | Real dialog.showModal needs Chromium; font sheet is chrome, not core. |
| `src/tools/sign/components/FontSheet.test.tsx:30` | yes | Real dialog.close needs Chromium; font sheet is chrome, not core. |
| `src/tools/sign/hooks/useAutoFontProvisioning.test.jsx:25` | yes | Offline needs Chromium context.setOffline; hook gate is chrome. Could share the offline font test; put-back of 67. |
| `src/tools/sign/hooks/useAutoFontProvisioning.test.jsx:67` | yes | Offline needs Chromium context.setOffline; one hook gate, not core. |
| `src/tools/sign/hooks/useFormFieldRegions.states.test.tsx:126` | yes | Stale chunk needs page.route abort in Playwright; edge case, not core. |

## Stays: cannot be real in any test (54)

| Site | Reason true | How |
| --- | --- | --- |
| `scripts/sw.test.mjs:452` | yes | a write deaf to abort is a hung disk; no environment produces it |
| `scripts/sw.test.mjs:1993` | yes | real storage does not fail reading an entry it holds |
| `scripts/sw.test.mjs:2254` | yes | storage that never answers a write has no real cause |
| `scripts/sw.test.mjs:2325` | yes | a cache that cannot be opened has no real cause on demand |
| `scripts/sw.test.mjs:2375` | yes | storage slow to open has no real cause on demand |
| `src/editor-ui/hooks/useCoarsePointer.test.tsx:113` | yes | Absent matchMedia exists in no test browser; with a real env the guard is unreachable. |
| `src/editor-ui/hooks/useVisualViewportScale.test.tsx:49` | yes | A browser with no visualViewport does not exist in Chromium or WebKit; only the dead guard. |
| `src/editor-ui/hooks/visualViewportClamp.test.tsx:51` | yes | Absent visualViewport cannot occur in any test browser. |
| `src/editor-ui/hooks/workspaceFullscreen.test.tsx:41` | yes | A request the browser never answers happens only in embedded browsers; Chromium always answers. |
| `src/editor-ui/hooks/workspaceFullscreen.test.tsx:65` | yes | Late grant after the timeout needs an unanswered request; no test browser does that. |
| `src/editor-ui/hooks/workspaceFullscreen.test.tsx:83` | yes | Held request, second press: needs a browser that withholds its answer. |
| `src/editor-ui/hooks/workspaceFullscreen.test.tsx:103` | yes | Unanswered request again; only embedded browsers. |
| `src/editor-ui/hooks/workspaceFullscreen.test.tsx:114` | yes | Unanswered request again; only embedded browsers. |
| `src/editor-ui/hooks/workspaceFullscreen.test.tsx:126` | yes | Late grant of an unanswered request; no test browser. |
| `src/editor-ui/hooks/workspaceFullscreen.test.tsx:145` | yes | Refusal arriving after the timeout needs a held request; embedded browsers only. |
| `src/lib/drafts/draftStore.test.js:840` | yes | A real persist() never throws synchronously; only an invented browser does. |
| `src/lib/drafts/draftStore.test.js:883` | yes | A real persisted() never throws synchronously. |
| `src/lib/gestures/controller.test.ts:89` | yes | headless Chromium keeps visibilityState visible (tried); no real hidden page |
| `src/lib/output/usePdfShare.test.jsx:57` | yes | OS share sheet: navigator.share is absent or native; no test can open or dismiss it. |
| `src/lib/output/usePdfShare.test.jsx:84` | yes | OS share sheet: navigator.share is absent or native; no test can open or dismiss it. |
| `src/lib/output/usePdfShare.test.jsx:97` | yes | OS share sheet: navigator.share is absent or native; no test can open or dismiss it. |
| `src/lib/pdf/thumbnails.test.js:389` | yes | Chromium accepts the resize options; an engine rejecting them cannot be made for real. |
| `src/lib/telemetry/analyticsSink.test.ts:115` | yes | a real sendBeacon with the fixed URL does not throw; unreachable state |
| `src/lib/telemetry/errorReport.beacon.test.ts:102` | yes | a real sendBeacon with the fixed URL does not throw; unreachable state |
| `src/lib/telemetry/errorReport.page.test.ts:35` | yes | matchMedia with a valid query never throws in any real browser |
| `src/lib/telemetry/maintenanceTelemetry.beacon.test.ts:56` | yes | a real sendBeacon with the fixed URL and Blob does not throw in Chromium or jsdom; the catch guards an unreachable state |
| `src/lib/telemetry/pagePerformance.test.ts:74` | yes | headless Chromium keeps visibilityState visible even with another tab in front (tried with Playwright) |
| `src/lib/telemetry/productAnalytics.test.ts:166` | yes | a real sendBeacon with the fixed URL does not throw; unreachable state |
| `src/shell/RatingPrompt.test.tsx:283` | yes | navigator.share is an OS share sheet. |
| `src/shell/RatingPrompt.test.tsx:291` | yes | Share rejection (AbortError) comes from the OS share sheet. |
| `src/shell/pageWorkspace/useSaveToDrive.test.tsx:102` | yes | No browser lacks matchMedia. |
| `src/shell/pageWorkspace/useSaveToDrive.test.tsx:106` | yes | A throwing matchMedia is not real in any browser. |
| `src/site-lib/DriveOpen.chrome.test.tsx:25` | yes | Google Picker scripts and sign-in cannot run in any test environment. |
| `src/site-lib/DriveOpen.test.tsx:22` | yes | Google's sign-in popup and its script cannot run in any test. |
| `src/site-lib/DriveOpen.test.tsx:76` | yes | Answer from Google's popup; cannot be real. |
| `src/site-lib/DriveOpen.test.tsx:117` | yes | Answer from Google's popup; cannot be real. |
| `src/site-lib/DriveOpen.test.tsx:131` | yes | Answer from Google's popup; cannot be real. |
| `src/test/support/mockFileShare.js:7` | yes | navigator.share opens the OS share sheet and canShare is device-bound; neither can be real in Chromium or Playwright. |
| `src/test/support/mockFileShare.js:10` | yes | navigator.share opens the OS share sheet and canShare is device-bound; neither can be real in Chromium or Playwright. |
| `src/tools/compress/PdfCompressTool.flows.browser.test.tsx:371` | yes | Real share needs the OS share sheet, which no test can close or fail on cue (NotAllowed without activation is real, AbortError is not). |
| `src/tools/compress/PdfCompressTool.flows.browser.test.tsx:560` | yes | No environment holds a real image decode on cue; only a stalled stream could, and a blob URL has none. |
| `src/tools/image-to-pdf/PdfImageToPdfTool.test.tsx:631` | yes | OS share sheet cancel or failure exists only on devices with one |
| `src/tools/image-to-pdf/PdfImageToPdfTool.test.tsx:646` | yes | OS share sheet cancel or failure exists only on devices with one |
| `src/tools/redact/PdfRedactTool.flows.browser.test.tsx:260` | yes | fullscreenEnabled false is iOS Safari; Chromium and Playwright report true |
| `src/tools/redact/PdfRedactTool.flows.browser.test.tsx:336` | yes | OS share sheet exists only on devices with one |
| `src/tools/redact/PdfRedactTool.flows.browser.test.tsx:339` | yes | OS share sheet exists only on devices with one |
| `src/tools/redact/PdfRedactTool.flows.browser.test.tsx:411` | yes | no real browser refuses createObjectURL for a Blob |
| `src/tools/redact/hooks/useObjectPreviews.destroyed.test.tsx:67` | yes | shipped pdf.js hangs on a destroyed document, it never throws this; the guarded branch is unreachable |
| `src/tools/security/PdfSecurityTool.finish.test.tsx:67` | yes | Share sheet's own refusal comes from the OS. |
| `src/tools/sign/PdfSignTool.test.tsx:299` | yes | navigator.share opens an OS share sheet; headless Chromium has none. |
| `src/tools/sign/PdfSignTool.test.tsx:468` | yes | OS share sheet, no test environment has one. |
| `src/tools/sign/PdfSignTool.test.tsx:918` | yes | OS share sheet, no test environment has one. |
| `src/tools/sign/PdfSignTool.test.tsx:921` | yes | navigator.canShare pairs with the OS share sheet; no real one. |
| `src/tools/sign/hooks/useFieldNavigation.reveal.test.tsx:22` | yes | Soft keyboard shrinking only the visual viewport exists on real iOS devices; no Chromium or Playwright can raise one. |

## Goes with the site it puts back (34)

| Site | Reason true | How |
| --- | --- | --- |
| `src/editor-ui/ArmHint.test.tsx:53` | yes | Put-back of matchMedia (env-matchmedia). |
| `src/editor-ui/PdfPageCanvas.sharpness.test.tsx:51` | yes | puts back devicePixelRatio set at line 27 (browser-core) |
| `src/editor-ui/hooks/useCurrentPage.test.jsx:64` | yes | Put-back of IntersectionObserver (skip). |
| `src/editor-ui/hooks/workspaceFullscreen.test.tsx:67` | yes | Put-back of exitFullscreen mock at 65 (never). |
| `src/editor-ui/hooks/workspaceFullscreen.test.tsx:85` | yes | exitFullscreen mock paired with 83 (never). |
| `src/editor-ui/hooks/workspaceFullscreen.test.tsx:128` | yes | exitFullscreen mock paired with 126 (never). |
| `src/lib/drafts/draftStore.test.js:794` | yes | Pair of 792 (skip). |
| `src/lib/drafts/draftStore.test.js:808` | yes | Pair of 806 (skip). |
| `src/lib/drafts/useDraftPersistence.test.jsx:254` | yes | Undoes 243 (skip). |
| `src/lib/drafts/useDraftPersistence.test.jsx:346` | yes | Undoes 328 (env-matchmedia). |
| `src/lib/gestures/controller.test.ts:94` | yes | puts back line 89's hidden page (never) |
| `src/lib/telemetry/errorReport.page.test.ts:11` | yes | puts back line 18's serviceWorker define (skip) |
| `src/lib/telemetry/maintenanceTelemetry.test.ts:157` | yes | puts back line 150's offline define (skip) |
| `src/lib/telemetry/maintenanceTelemetry.test.ts:158` | yes | puts back line 150's offline define (skip) |
| `src/lib/telemetry/pagePerformance.test.ts:77` | yes | puts back line 74's hidden page (never) |
| `src/shell/RatingPrompt.test.tsx:268` | yes | Removes the share and clipboard mocks (never for share, skip for clipboard). |
| `src/shell/verb/VerbStage.test.tsx:36` | yes | Put-back of matchMedia (env-matchmedia). |
| `src/site-lib/DriveOpen.chrome.test.tsx:127` | yes | Answers the picker mock at line 25 (never). |
| `src/site-lib/DriveOpen.chrome.test.tsx:129` | yes | Answers the picker mock at line 25 (never). |
| `src/site-lib/swInstallReport.test.ts:57` | yes | Removes the onLine override set at 51; goes with it. |
| `src/test/cross-tool/shellPageGrid.test.tsx:122` | yes | Restores IntersectionObserver after the one set at 112; goes with it. |
| `src/tools/highlight/hooks/useScanCheck.test.tsx:85` | unsure | Pair of line 83 (now). |
| `src/tools/redact/components/RedactBox.test.tsx:23` | yes | puts back the matchMedia of line 13 (env-matchmedia) |
| `src/tools/redact/components/RedactWorkspaceToolbar.test.tsx:78` | unsure | undoes the matchMedia of line 91 (env-matchmedia); setup.js already defines one, so the stated reason is muddled |
| `src/tools/scan/hooks/useMediaQuery.test.tsx:21` | yes | Restores window.matchMedia after the override on the next line; goes with it. |
| `src/tools/sign/components/DraggableWrapper.interaction.test.tsx:175` | yes | Put-back of the matchMedia stub (env-matchmedia). |
| `src/tools/sign/components/DraggableWrapper.test.tsx:296` | yes | Put-back of matchMedia (env-matchmedia). |
| `src/tools/sign/components/ElementToolbar.test.tsx:29` | yes | Put-back of matchMedia (env-matchmedia). |
| `src/tools/sign/components/FontPickerMenu.test.tsx:39` | yes | Put-back of matchMedia stub (env-matchmedia). |
| `src/tools/sign/components/PdfWorkspace.test.tsx:1180` | yes | Put-back of matchMedia delete (env-matchmedia). |
| `src/tools/sign/components/SignToolbar.test.tsx:1470` | yes | Put-back of matchMedia (env-matchmedia). |
| `src/tools/sign/components/nodes/TextNode.test.tsx:802` | yes | Put-back of matchMedia (env-matchmedia). |
| `src/tools/sign/hooks/useFieldNavigation.reveal.test.tsx:65` | yes | Put-back of visualViewport stub at 22 (never). |
| `src/tools/sign/lib/fontOfflinePacks.test.js:26` | yes | Put-back of serviceWorker stub (browser-core). |
