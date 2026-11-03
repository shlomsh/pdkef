---
id: "QUAL-51"
title: "The 23 faults the fresh mutation probe found unguarded each get a test that fails on them"
status: "in_progress"
priority: "P2"
epic: "robustness"
horizon: "now"
order: 1
depends_on: []
---

# QUAL-51 · The 23 faults the fresh mutation probe found unguarded each get a test that fails on them

*Filed 2026-11-04* from the second mutation probe, run after QUAL-45..50 landed. The first probe (QUAL-45)
measured the modules the audit had read; this one measured 24 modules nobody had touched, so it says how good
the suite is where no one has been looking.

## The probe

Commit 9e294aa0. 24 modules, three mutants each, chosen from the source before reading any test. Kinds: boundary,
value, guard. A mutant was run against the module's sibling tests (direct), then `vitest related` (related). Every
"caught" that looked odd was replayed alone, because load on a shared `node_modules` produced false catches.

72 mutants, 1 equivalent (`capsuleState.ts:47`), 71 real. Caught directly 46 (65%), with related 48 (68%),
survived 23. The first probe caught 73% directly (51 of 70); the difference is inside the noise of two samples
this size, about 11 points either way.

| Area | Direct | With related | Survived |
| --- | --- | --- | --- |
| Redact | 9/12 | 9/12 | 3 |
| Small tools | 9/12 | 9/12 | 3 |
| Sign | 7/12 | 8/12 | 4 |
| Editor | 8/12 | 8/12 | 4 |
| Lib and shell | 7/12 | 8/12 | 4 |
| Highlight | 6/11 | 6/11 | 5 |

The survivors share four shapes: stale async guards, cleanup (listeners, observers, handles, object URLs), exact
boundaries, and component wiring.

## The survivors

Sign

1. `src/tools/sign/lib/fill/fillTap.ts:78`: `at.x <= box.left + box.width` to `<`.
2. `src/tools/sign/components/nodes/SymbolNode.tsx:13`: `=== 'cross' ? 'x'` to `? 'check'`.
3. `SymbolNode.tsx:14`: default `|| 'check'` to `|| 'x'`.
4. `SymbolNode.tsx:43`: `return () => observer.disconnect();` to `return () => {};`.

Redact

5. `src/tools/redact/components/BrushControls.tsx:36`: `resolveBrush` precedence swapped, app style over carried.
6. `src/tools/redact/lib/deleteMarquee.ts:37`: default overlap threshold 0.5 to 0.4.
7. `src/tools/redact/hooks/useDeletePreviews.ts:189`: stale preview handles not destroyed when a rebuild is cancelled.

Highlight

8. `src/tools/highlight/hooks/useOpenMarks.ts:16`: `?? pickedId ?? focused` to `?? focused ?? pickedId`.
9. `useOpenMarks.ts:38`: `root.removeEventListener('focusout', read);` deleted.
10. `src/tools/highlight/PdfHighlightTool.tsx:50`: `if (!marks.canUndo) return;` deleted.
11. `PdfHighlightTool.tsx:73`: `if (isCurrent()) setPdfDocument(doc);` to `setPdfDocument(doc);`.
12. `PdfHighlightTool.tsx:108`: `multiple: false` to `multiple: true`.

Editor

13. `src/editor/highlight/resolveDirection.ts:37`: the run row's bottom edge becomes exclusive (`<=` to `<`).
14. `src/editor/model/strokeGeometry.ts:40`: a point at exactly the minimum step is dropped (`>=` to `>`).
15. `strokeGeometry.ts:116`: `if (mapped.length === 1) parts.push(...)` deleted, a single point draws no dot.
16. `src/editor/text/hebrewComposition.js:123`: blocked rule, equal combining class no longer blocks (`>=` to `>`).

Lib and shell

17. `src/shell/pageWorkspace/FinishRow.tsx:31`: `{ready && <PdfShareButton` to `{true &&`.
18. `src/shell/FilePreview.tsx:75`: the `cancelled = true` cleanup deleted.
19. `FilePreview.tsx:50`: `revokeObjectURL` on file change deleted.
20. `src/lib/gestures/tapOutsideDeselect.ts:81`: `MAX_SCALE_DELTA` 0.02 to 0.2.

Small tools

21. `src/tools/compress/lib/jpegBytes.js:23`: `len < 2` to `len <= 2`, an empty segment is rejected.
22. `jpegBytes.js:61`: the TIFF magic-42 check deleted.
23. `src/tools/merge/hooks/useLinkedHighlight.ts:60`: the stale-source clear `current && !current.isConnected` deleted.

Caught only by distant tests, so pinned in a sibling test as well:

- `src/shell/pageWorkspace/FinishRow.tsx:40`: `disabled={busy || !ready}` to `disabled={!ready}`.
- `src/tools/sign/lib/fields/formCells.js:311`: `rightHug` 0.5 to 0.7.

## Test health found on the way

- `src/test/cross-tool/draftCheckingPlaceholder.test.tsx` fails alone (2 of 3 tests) and passes in full runs. It
  waits a fixed 30 ms, on the wall clock at about line 112 and on fake timers at about line 148. It gave three
  false catches in the probe. It should wait for the condition, not for a time.
- CI's e2e-webkit job failed twice on 9e294aa0 with different specs, then passed. `note-writer.spec.js:128` found
  no `[data-pseudo-fullscreen]`; `panel-gutters-webkit.spec.js:46` found no `[role="toolbar"][data-mode]`. Both
  are in `src/tools/highlight/e2e/` and both go through Highlight's fullscreen path.
- `src/tools/sign/lib/fields/corpus/layout/layout.test.js` ("keeps the pull quote passing") takes 1.2 s alone and
  reached the 5 s timeout in full local runs.

## Outcome

- Each of the 23 survivors and the 2 distant catches has a test that fails on that mutant, by name, and passes on
  the real code; or a written reason why the mutant changes nothing a person could observe.
- A test that fails on today's real code is treated as a bug report, not adjusted to pass.
- The placeholder test passes alone and in a full run, with no fixed wait.
- The two WebKit specs have a known cause and are fixed at it, not retried.
- The layout corpus test holds in a full local run.
