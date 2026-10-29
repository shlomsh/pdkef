---
id: "QUAL-44"
title: "E2e keeps only what a real browser proves: duplicates go, jsdom-able cases move to units"
status: "done"
priority: "P2"
epic: "unify-and-narrow"
depends_on: []
---

# QUAL-44 · E2e keeps only what a real browser proves: duplicates go, jsdom-able cases move to units

*Filed 2026-10-29* from a read-only audit (2026-10-28) that classified every Playwright test as KEEP (needs a
real browser), JSDOM (could be a Vitest+jsdom unit) or DUPLICATE (a unit already proves it). Of about 720
executed e2e cases, roughly 36 were duplicates and 35 could move to jsdom. CLAUDE.md wants e2e as sparse
guardrails, about 1 per 10 units, for what jsdom cannot prove.

## Outcome

- Every DUPLICATE named below is deleted once its unit is opened and confirmed to assert the same behaviour.
- Every JSDOM case named below becomes a unit first, seen failing against a deliberately broken
  implementation, and only then is its e2e deleted.
- A case whose e2e asserts something a unit cannot (a rect, real timing, a real download) stays, with the
  reason here.

## Acceptance

- [x] Each test below is listed as deleted, moved or kept, with the covering unit or the reason.
- [x] `npm run check:fast` and `npm run check:push` pass.
- [x] The touched spec folders pass under `npx playwright test <paths> --project chromium`.
- [x] The count of executed e2e cases removed is recorded here.

## Tests

Removed: **44 executed e2e cases** (42 chromium, 2 webkit), counted from `npx playwright test --list`
before (579 chromium, 43 webkit) and after (537, 41). Three spec files are gone:
`tap-outside-deselect.spec.js`, `pinch-cancels-element-gesture.spec.js`, `editor-drop-replace.spec.js`.

### Deleted as duplicates

- `sign/e2e/tap-outside-deselect.spec.js`, all 5 (stationary tap, 6px jitter, selected not editing,
  80px pan, pinch): `PdfWorkspace.test.tsx` "Touch tap outside deselect (MOBI-30)" ~806-858, which drives
  the real touchstart/touchend handlers.
- `sign/e2e/toolbar-double-click-lock.spec.js:126` Shapes and `:155` Sign stay locked after picking from
  their menu: `SignToolbar.test.tsx` "stays locked when a different shape is picked..." ~400 and "stays
  locked when a saved signature is picked..." ~630.
- `sign/e2e/mobile-compact-editing-toolbar.spec.js:77` status line owns Previous/Next: the
  `fieldNavigation` block of `SignToolbar.test.tsx` ~1470-1499. `:146` a fine pointer never collapses the
  toolbar: `DraggableWrapper.test.tsx` "never collapses on a fine pointer", `SignToolbar.test.tsx` "never
  steps aside on a fine pointer", `compactBar.test.ts`.
- `sign/e2e/pinch-cancels-element-gesture.spec.js:125`: `useDraggableElement.pinchCancel.test.tsx`
  (cancel and restore with no commit when a second finger joins, no tap).
- `sign/e2e/touch-edit-reentry.spec.js:215` a drag moves the box and opens no session:
  `useDraggableElement.tap.test.tsx` ~338 (past 8px is `onChange`, never `onTap`); `onTap` is the only route
  into `beginEditFromTap` in `DraggableWrapper.tsx`.
- `e2e/editor-drop-replace.spec.js`, all 3 on /sign/ and /redact/ (asks before replacing, Cancel keeps the
  file, a .txt opens no dialog): `BasePdfTool.test.tsx` "replacing the open file by a window drop" block,
  `useWindowFileDrop.test.tsx:76`. No tool overrides the `dropAnywhere` default.
- `e2e/cross-tool/page-grid-parity.spec.js:201` r rotates, Delete skips, Enter opens the preview, on four
  routes: `shellPageGrid.test.tsx` "keyboard: arrows move across files, R rotates, Delete skips, Enter opens
  the preview" and the `reorderable={false}` test. `:216` undo and redo through a rotation, on four routes:
  `PdfMergeTool.test.tsx:601`, `PdfEditPagesTool.undo.test.tsx:88`; Split and PDF to Image share
  `usePageToolSession` and their own units cover an undo step and rotation as a step.

### Moved to units (each seen red against a deliberate break, then green)

- `sign/e2e/sign-editor.spec.js:272` touchmove `defaultPrevented` during a drag-draw:
  `useWorkspaceGestures.test.js` "touch drag-draw keeps the page from scrolling" (the cancel, and the
  listener registered `{ passive: false }`). Red: preventDefault removed, and separately `passive: false`.
- `redact/e2e/redact-editor.spec.js:370`, the same for Redact: new `redact/hooks/useRedactDrawing.test.tsx`.
- `sign/e2e/form-cell-fill.spec.js:153` plain text, not a comb: `TextNode.test.tsx` "is still plain text,
  not a comb...". Red: comb forced on for a spanned cell.
- `sign/e2e/phone-fill-journey.spec.js:96` an empty box never says double-click on a phone:
  `TextNode.test.tsx` "never tells a phone user to double-click...". Red: placeholder forced to the mouse copy.
- `sign/e2e/form-grid-fill.spec.js:155` no tool left armed, `:217` undo removes the comb in one step:
  `useWorkspaceGestures.test.js` "placing text on a detected comb run". Red: disarm removed; logAction twice.
- `sign/e2e/fill-mode-zoom.spec.js:234` the old editor never gets maximum-scale: new
  `sign/hooks/fill/useFillViewportLock.test.tsx`. Red: the `enabled` check removed.
- `e2e/cross-tool/page-grid-parity.spec.js:125,131,143` page numbers (plain, after skipping page 2, after
  moving page 5 to the front), desktop and phone: `shellPageGrid.test.tsx` "page numbers read as output
  positions". Numbers are drawn only by PageGrid, so one mount covers every tool. Red: the label read the
  source page.
- `e2e/home/recent-files.spec.js:112` two cross-tool records render once each: `FileDropzone.test.tsx`.
  Red: the list rendered twice.
- `merge/e2e/merge-layout.spec.js:343` a Hebrew first file keeps `merged_`: `PdfMergeTool.test.tsx`, same
  title (the e2e read the link's `download` attribute, as the unit does). Red: a Hebrew prefix.
- `redact/e2e/redact-done-strip.spec.js:81` a second Download keeps the strip and one rating ask:
  `PdfRedactTool.export.test.tsx` "RED-66: a second toolbar Download...". Red: the strip toggled.
- `redact/e2e/redact-mobile-export.spec.js:186` Download stays when native Share is missing:
  `PdfRedactTool.export.test.tsx` "keeps the toolbar's own Download unhidden..." (no `.desktop-download`
  class, the only thing that hides it). Red: the class always applied.

### Kept

- `e2e/cross-tool/page-grid-parity.spec.js:173` Split and PDF to Image keep source order: the unit proves
  `reorderable={false}` disables moves, but nothing else checks that those two tools pass it.
- `merge/e2e/merge-mobile.spec.js:202` the two-tap path at 375px: it clicks the real Download, which
  Playwright allows only when nothing covers it, and reads the real download event's file name.
- `sign/e2e/form-grid-fill.spec.js:240` places and clears a checkbox mark: the unit lacks the new mark
  becoming active, the disarm and Undo bringing it back, and the e2e proves a real tap lands on a 2.3mm
  box at 390px.

### Review (fresh reviewer, zero shared context)

Accepted as covered, with the reasoning:
- Drop-replace: the unit proves Replace calls `onFilesAdded`, the same path a picked file takes in every
  tool, and no tool overrides `dropAnywhere`. The unit drops on `window`, which is where the listener is.
- Undo through a rotation: Edit Pages' unit runs it through `usePageToolSession`, the hook Split and PDF to
  Image share; their own units prove the Undo buttons are wired.
- Page numbers: Delete and the arrow keys are PageGrid's own handlers and hand the tools a plan updater, so
  one grid mount covers the numbering every tool shows.
- Recent files: the page-composition guard (one root, one island, one list) stays in the kept
  `recent-files.spec.js` "renders one tile for one stored file through responsive layout changes".
- The RED-66 unit waits on the real 1.5s rating delay (4s ceiling), like the e2e did.

Closed after the review, each seen red first:
- The touchmove units called the drawing handlers directly, so removing the overlay's `onTouchStart`
  wiring left them green. Now a real touchstart goes through the tool too: `PdfRedactTool.arming.test.tsx`
  "cancels the touchmove of a touch-drawn box..." (red: RedactPage's `onTouchStart` removed) and
  `PdfWorkspace.test.tsx` "cancels the touchmove of a touch drag-drawn shape..." (red: the overlay's
  `onTouchStart` removed).
- `?next=0` reaching the viewport lock as `enabled === false`: new `sign/hooks/useFillMode.test.tsx`
  mounts the real `useFillMode` under `?next=0` and `?next=1` (red: `enabled` forced on).
- The `addEventListener` spies restore in `finally`.

## Done (2026-10-29)

44 executed e2e cases removed (42 chromium, 2 webkit), 3 spec files deleted, 3 kept with reasons.
`check:fast` and `check:push` pass; the touched folders (`e2e/cross-tool`, `e2e/home`, `src/tools/sign/e2e`,
`src/tools/redact/e2e`, `src/tools/merge/e2e`) pass under `--project chromium` (258 passed, 9 skipped).
