# One page grid: Merge's grid, layout and undo, shared with Edit Pages

*Decided 2026-10-24 by Shlomi (GRID epic).* Dragging pages in Edit Pages felt loose next to Merge.
That was a symptom: the two tools showed a document's pages through two unrelated implementations.
The requirement is symmetric: page size, where rotate sits, preview, skip, drag, keyboard and undo
behave identically in every tool that shows a grid of pages. Merge's grid is the reference
implementation; it moves to `src/shell/` and the other tools adopt it.

## What was different (measured on 3b0df114)

| | Merge (`PageStrip`) | Edit Pages (`PageGrid.module.css`) |
| --- | --- | --- |
| Cell | fitted to the stage on desktop, 104 to 240px; 104x138 tablet; 72x96 phone; landscape spans 2 | fixed 80x104 thumb, landscape cropped by `object-fit: cover` |
| Grid | document scrolls, no inner scroll box | `max-height: 440px; overflow-y: auto` |
| Thumbnails | lazy near the viewport, raster follows the cell | all pages up front, 150px PNG, stored in undo history |
| Actions | rotate, skip, preview in a hover cluster on the thumbnail; tap reveals it on a phone | rotate left/right under the number, a keep/remove badge, a 44px drag bar |
| Skip | eye button, Delete key; dimmed, dashed, "skipped" | click anywhere on the card toggles remove; red, grayscale |
| Drag | whole card, `fallbackTolerance: 4`, 150ms touch delay, document cursor lock | the top bar only, no tolerance |
| Keyboard | arrows move, R rotates, Delete skips, Enter previews | none on cards |
| Number | output position | original page number |
| Undo | one 5s chip | 50-step Undo/Redo stack with Cmd+Z |

## Decisions

1. **Merge's whole layout**, not only the grid: document column (header + grid) and a rail with the
   Download element, so the stage fit measures the same surroundings in both tools.
2. **The Undo/Redo stack wins** in both tools: `useEditHistory` (50 steps, Undo and Redo buttons in the
   document header, Cmd/Ctrl+Z and Shift+Cmd/Ctrl+Z). Merge's undo chip goes.
3. **Output position** under each page, in both tools. The preview title and the cell's accessible
   label still name the source page.
4. **Split and PDF to Image follow** on the same grid (without drag) once Edit Pages has landed on it.
5. Edit Pages' "remove" becomes Merge's **skip**: the same eye button, Delete key, look and word.

## The contract

### `src/lib/pagePlan.ts` (pure)

```ts
export interface PlanEntry { key: string; fileId: number; pageIndex: number; rotation: 0 | 90 | 180 | 270; skipped: boolean }
planForFile(fileId, pageCount): PlanEntry[]
moveEntry(plan, from, to) / updateEntry(plan, key, patch) / rotateEntry(plan, key, delta) / outputPageCount(plan)
```

Moved out of `src/tools/merge/mergePlan.ts`, which keeps only what is about several files
(`fileOrder`, `isGrouped`, `regroupPlan`, `moveFileBlock`, `insertPages`, `removeFile`, `toMergeMap`,
the merged name helpers) and re-exports nothing. The field stays `fileId`: Merge's saved work stores
plans with it, so renaming it would need a draft migration for no gain. Edit Pages uses `fileId: 0`.

### `src/shell/pageGrid/` (from `src/tools/merge/components/PageStrip.tsx`)

`PageGrid.tsx`, `PageGrid.module.css`, `stageFit.ts`, `useStageFit.ts` (moved from `src/tools/merge/`).

```ts
interface GridSource { id: number; file: File; pageCount: number | null; error: 'encrypted' | 'unreadable' | null }
interface PageGridProps {
  sources: GridSource[];
  plan: PlanEntry[];
  onPlanChange: (update: (current: PlanEntry[]) => PlanEntry[]) => void; // one history step per call
  announce: (message: string) => void;
  messages: PageGridMessages;
  /** Captions, tags and the colour band name each page's file. Merge: true. Edit Pages: false. */
  labelSources: boolean;
  grouped: boolean;               // only read when labelSources
  gridRef: RefObject<HTMLUListElement>;
  onRenderedCountChange?: (count: number) => void;
  onFirstKeyboardFocus?: () => void;
}
```

- The grid owns thumbnails (lazy, per source, raster follows the cell), the action cluster, the
  preview dialog, Sortable, the keyboard model and the phone's tap-to-select. A tool never renders
  its own thumbnails for the grid.
- Every cell carries `data-key`, `data-file-id`, `data-skipped`, `data-selected`, `data-rotation`,
  `--tag-color` and `--moment-delay`. Merge-only visuals that a rail drives (linked highlight, the
  file-drop insertion line, the download sweep) stay in Merge's own CSS, selecting those attributes
  under `[data-page-grid]`; the grid module does not know about them.
- `onRegisterUndo` goes (decision 2): every `onPlanChange` call is one history step in the tool.
- `PageGridMessages` is the slice of `MergeMessages` the grid reads (`pageItemLabel`, `skippedState`,
  `skippedBadge`, `rotatePage`, `skipPage`, `includePage`, `openPreview`, `pageSkipped`,
  `pageIncluded`, `pageRotated`, `pageMoved`, the `preview*` strings, `captionPages`, `stripHint`,
  the `tip*` strings). `MergeMessages` extends it; Edit Pages passes the English set.

### `src/shell/pageWorkspace/` (from Merge's layout)

`PageWorkspace.tsx` + `.module.css`, the generic part of `MergeDocument.module.css` and
`MergeRail.module.css`: the `.layout > .main > (.document, .rail)` skeleton, the document header
(heading, count, a right-hand status slot), the rail's scrolling and pinned regions, and the phone
bar. Slots: `heading`, `headerStatus`, `grid`, `railContent`, `railPinned`, `phoneBar`. Merge's file
list, chips and file-drop line stay in Merge. `DownloadElement` moves to `src/shell/` with its own
`DownloadMessages` slice.

### `src/lib/history/useEditHistory.js` and `src/shell/HistoryButtons.tsx`

`useEditHistory` moves from `src/tools/edit-pages/` unchanged. `HistoryButtons` is the Undo/Redo pair
both tools put in `headerStatus`; `useHistoryShortcuts` binds the keys. In Merge the present is the
whole document (`{ entries, plan }`), so removing a file is undoable as it is today with the chip.

### The parity guard

`e2e/cross-tool/page-grid-parity.spec.js` loads the same PDF in `/merge/` and `/edit-pdf/` at a desktop
and a phone width and asserts equal cell rects, the action cluster at the same offset from the
thumbnail, a drag that starts on the thumbnail and reorders, R rotates, Delete skips, Enter opens the
preview. It is the reason "identical" stays true after either tool changes.

## Tickets

GRID-01 to GRID-04 land on main in one push: rule 9 of `docs/module-boundaries.md` (a common-layer
module needs two consumers, no exceptions) only holds once Edit Pages is the second consumer.


GRID-01 shared grid (Merge on it, nothing visible changes) · GRID-02 shared workspace layout (same) ·
GRID-03 Undo/Redo stack in Merge · GRID-04 Edit Pages on the grid, the layout and the stack, with the
parity guard · GRID-05 Split on the grid · GRID-06 PDF to Image on the grid.

## GRID-05 and GRID-06: Split and PDF to Image (decided 2026-10-25)

The target is the sketch Shlomi approved on 2026-10-25: all four tools share the heading (output name,
count, Undo/Redo), the cell (thumbnail, output number under it, rotate / skip / preview on hover or tap,
a skipped page dimmed) and the rail order (revised the same day: the output choice, which pages, Download,
hand-offs, then Replace file last; Merge keeps its own; docs/ux-design-guidelines.md section 20).
Split's file card, framed "one document" box, always-on tile icons and undo chip go.

### Decisions

6. **No drag in Split or PDF to Image.** Their output keeps source order; `PageGrid` gets
   `reorderable={false}`.
7. **Split's selection is the plan's `skipped`.** A tile toggle is the skip button, Select all / Clear
   become Include all / Skip all / Invert (Edit PDF's words), and the page-range field stays as Split's
   own control, kept in step with the plan both ways.
8. **The number under a page is its output position in both modes.** One PDF per page keeps its file
   names (`<name>-page-<source page>.pdf`), so with pages skipped a file's name and the number under its
   page can differ; the heading names the pattern. Shlomi confirmed on
   2026-10-25: the number is a running index in the new file, in every grid tool.

9. **Several files are one prepared output.** One PDF per page builds `parts`; Download saves each part,
   Share offers all of them, and there is no hand-off (Compress and Sign take one PDF).
10. **One PDF gains Sign** beside Compress, like Edit PDF and Merge. A protected file shows `NeedsUnlock`,
    like Edit PDF, instead of a plain link.
11. The mode switch and the output name stay outside the Undo stack, like Edit PDF's page numbers. Every
    plan change is a step: a tile, a bulk button, rotate, and each typed range that parses to a different
    selection.

### Contract additions (GRID-05)

`src/lib/pagePlan.ts` (pure):

```ts
includeAll(plan) / skipAll(plan) / invert(plan)   // moved from src/tools/edit-pages/editPlan.ts, same no-op contract
includedPageNumbers(plan): number[]               // 1-based source page numbers of the kept entries, in plan order
withIncludedPages(plan, pageNumbers: number[]): PlanEntry[]  // skipped = not in the list; same array when nothing changes
```

`src/shell/pageGrid/PageGrid.tsx`: `reorderable?: boolean` (default `true`). False creates no Sortable and
binds no move keys; rotate, skip, preview, R, Delete, Enter and the phone tap behave as before.

`src/lib/usePreparedOutput.ts`: `build` may resolve `{ parts: OutputPart[]; pageCount }` instead of
`{ blob; pageCount }`, with `OutputPart = { blob: Blob; filename: string }`. For parts, `blob` and `url`
are null, `parts` holds them and `size` is their sum; for a single blob `parts` is null.

`src/shell/pageWorkspace/useDownloadFlow.ts`: with `prepared.parts`, Share prepares every part
(`usePdfShare().prepareFiles`), a Download tap saves each part in order (200 ms apart, as Split does
today) and counts as one delivery, and `requestHandoff` does nothing. The tap path is the existing one:
`DownloadElement` has no `href`, so its click is the preparing tap, delivered at once because the output
is ready.

`src/shell/pageWorkspace/FinishRow.tsx`: `tools?: HandoffTool[]` (default `['compress', 'sign']`); Split's
One PDF per page passes `[]`.

Split's page-range field stays in `src/tools/split/` until PDF to Image is its second consumer (GRID-06
moves it to `src/shell/pageWorkspace/`, rule 9).

### Contract additions (GRID-06)

12. **PDF to Image on the grid, without drag.** It gains rotate (the export renders each page at its
    rotation) and the Undo/Redo stack; a protected file shows `NeedsUnlock` instead of failing.
13. **Saving one image is a fourth action, PDF to Image only.** The always-on arrow on each tile becomes
    an action in the hover/tap cluster, present once that page's image is built (as today).
14. **One segmented option control.** PDF to Image's `OptionRow` and Split's `ModeControl` are the same
    control written twice; one `OptionRow` in `src/shell/pageWorkspace/` serves Split's mode and PDF to
    Image's format, quality and output rows (label, options, a one-line note, a compact form for the
    phone bar, 44px targets).
15. **Hand-offs: Share only.** Compress Image has no hand-off intake, so none is offered.
16. A one-page PDF shows no range field and no bulk row, as today.

`src/shell/pageGrid/PageGrid.tsx`: `cellAction?: (entry: PlanEntry) => CellAction | null` with
`CellAction = { href: string; download: string; label: string; tip: string }`, rendered as a link after
the preview button, inside the same cluster and with the same reveal rules. Null renders nothing.

`src/lib/usePreparedOutput.ts`:
- `OutputPart` gains an optional `pageNumber` (the 1-based source page an image came from).
- `PreparedOutput.parts` items gain `url`: an object URL made when the output is ready and revoked
  when it is replaced, cleared or unmounted.
- `autoBuild?: boolean` (default `true`). False builds nothing until `prepareNow` (hover, focus, tap):
  PDF to Image above 30 pages, as today.

`PageRangeField` moves from `src/tools/split/` to `src/shell/pageWorkspace/` (Split and PDF to Image).
`PageToggleTile` is deleted.
