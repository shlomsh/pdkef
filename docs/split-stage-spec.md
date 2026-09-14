# Split tool, the stage: canvas and commands together

Chosen by Shlomi on 2026-09-14 after real user feedback: they added a file, looked straight at the
page thumbnails and never saw "1. Select split mode". The mode changes the output from one PDF to
one PDF per page, so missing it is a wrong result. The direction: never block the person before they
see value, show the best default, make the canvas show the outcome, and keep the tweaks in the same
scope as the canvas at every width.
Sketches: canvas https://claude.ai/code/artifact/04a61526-d581-42b9-9c67-80265d9fee7a (boards
"Desktop · One PDF", "Desktop · One PDF per page", "States", "Tablet", "Phone"); artboard sources in
`/private/tmp/claude-501/-Users-sh-work-pdkef--claude-worktrees-split-mode-selection-ux-7d8972/754ce8e9-1c6a-473f-9fa4-7f8d8e4efb5a/scratchpad/split-stage/`
(`*.body.html` plus `build.sh`; plain HTML with inline styles).

## The principle

The stage is the canvas and its commands, together. A command that changes the shape of the output
(the mode) is never out of view while the canvas is, and the canvas changes shape the moment the
command changes. The preview is the mode. Direction A's rule still holds: the output is the centre,
the input file is a rail you glance at ([merge-direction-a-spec.md](./merge-direction-a-spec.md)).

Why the old screen failed: the mode was a real decision presented as an already-made one. One card
preselected, two cards that differ only by tint, a heading numbered "1." that needs no action, and a
page grid with all the visual mass below it. Nothing downstream reacted to the choice.

## The canvas: output groups, not input pages

Heading names the output, honestly counted (guideline §5):

- One PDF: `extracted_<file base>.pdf` (".pdf" muted, fixed) · "3 of 3 pages".
- One PDF per page: "2 PDFs, one page each" · "from 3 pages".

Groups:

- **One PDF**: a single document frame (1px `--color-primary` border, `--radius`,
  `--color-primary-soft` fill) with a caption row "one document · pages 1-3" (which pages, never "in this order": Split does not reorder), holding
  the included pages in order.
- **One PDF per page**: each included page in its own small frame with its own caption
  `<file base>-page-<n>.pdf`, so the person sees the files before any file exists.
- **Not included**: a run under the frames, captioned "not included · tap a page to add it".
  Excluded pages are dimmed (opacity .45, dashed border, as Merge's skipped cell). When every
  page is included the run shows one line, "every page is in the document", never disappears.
- Tap a page to toggle it. The cell slides between the frame and the run, 200 ms,
  `--ease-emphasized`, none under `prefers-reduced-motion`. Switching mode regroups the same
  cells in place with the same motion, so the change is visible where the eye already is.
- Zero included pages: the frame stays, empty and dashed, "Pick at least one page". Never hidden.
- Cells reuse `PageGrid.module.css` page cards: 110px on desktop, 72px and 4 per row at 375.
  Selection state is the frame membership; the per-card checkbox goes.

## The rail: one row per kind, guideline §4 order

1. **Input**: the file row (name with `unicode-bidi: plaintext`, "3 pages · 1.3 MB", Replace).
2. **Status**: "Rendering 2 of 3" while thumbnails come in, then nothing; alone, end-aligned.
3. **Commands on the selection**: the page range field (existing `.page-selector-*` classes), then
   Select all and Clear as bordered buttons, 36px face, 44px hit area. Field and grid are the same
   selection; either edits the other.
4. **The setting that changes the output**: a two-way segmented control, "One PDF" and "One PDF
   per page", full rail width, 44px tall, `role="radiogroup"` with roving focus (pattern from
   `src/editor-ui/ViewControl.tsx`, restyled as text segments). One outcome sentence under it,
   always present: "Selected pages become a single PDF." / "Each selected page becomes its own
   PDF." A segmented control shows the alternative next to the default; two cards with one tinted
   did not say "choose".
5. **Primary**: the Download element, one element with states, 64px, same place. Under it on
   desktop, a quiet line for the other mode: "or save each page as its own PDF" / "or save them as
   one PDF", which flips the segment. That is the second entry point, where the eye ends up.
6. **Next steps**, after saved: Share, Compress it, Merge these, as equal secondary buttons.

No "1." / "2." step numbers anywhere. Mode names are outcomes, not verbs; "Extract Pages" and
"Split into Individual Pages" both read like the page title.

## The Download element: states

- **Zero pages**: not a disabled button. Dashed, "Pick at least one page".
- **Preparing**: same box, tinted, "Preparing 3 pages…" with an inline ring, `aria-busy`, still
  tappable (the tap queues the download).
- **Ready**: primary, "Download 1 PDF" over "3 pages · 1.3 MB", or "Download 2 PDFs" over
  "1 page each · 0.9 MB". Full-white detail line, never reduced opacity.
- **Saved**: success tint, check drawn once, "Saved · extracted_<name>.pdf · again". Per-page saved
  keeps the per-file list ("…-page-1.pdf · Download") in the canvas under the frames, with
  "Download all 2" as the element's label.

Whether the split precomputes on idle like Merge, or on tap, is the build ticket's call; the states
are the same either way.

## Responsive: the rail never leaves the stage

| Width | Canvas | Commands |
| --- | --- | --- |
| 1024 and up | fills the remaining width | rail 300px on the right, `position: sticky; top: var(--space-3)`, own scroll, rows 1 to 6 |
| 768 to 1023 | full width | rows 1 to 3 as a chip bar above the canvas, `sticky; top: 0`; rows 4 and 5 side by side in a sticky bottom sheet, 44px |
| 767 and down | full width, 4 cells per row | chip bar on top (file name, "Pages 1-3 · edit", All, Clear); bottom sheet with the segmented control over the Download element, `env(safe-area-inset-bottom)` kept, `.main` reserves the sheet's height as Merge does (`MergeDocument.module.css`) |

The bottom sheet is Merge's phone pattern (`MergeRail.module.css`). Merge stacks the rail under the
canvas between 768 and 1023, which is exactly the "scroll away from the mode" failure, so Split uses
the sheet at that width too. On phones the "or save each page…" line is dropped: the segment is one
thumb away. Next steps sit in the canvas under the frames, so the sheet stays two rows.

## Acceptance, in numbers

- At 1280, 820 and 375, with the canvas scrolled to its last row, the segmented control's rect is
  fully inside the viewport.
- Flipping the segment changes the canvas heading text and the number of frames without any
  scroll position change.
- Segment height 44px; Select all and Clear 36px face inside a 44px hit area; cells 110px at
  1280, 72px at 375.
- The Download element keeps one height (64px desktop, 56px phone) across all four states.
- A Hebrew file name renders in reading order in the rail row, the chip, the canvas heading and the
  per-page captions.
- No element on the loaded screen contains the text "1." or "2." as a step label.

## Follow-ups for the build ticket

- `e2e/tool-output-paths.spec.js` pins the old button copy ("Extract 1 page to single PDF",
  "Download PDF"); it changes with the labels above.
- `src/tools/split/PdfSplitTool.test.tsx` selects the mode by card text ("Individual Pages"); it
  moves to the segment's accessible name.
- Add one e2e for the sticky acceptance line above (segment rect inside the viewport at the last
  grid row, three widths), modelled on `src/tools/merge/e2e/merge-mobile.spec.js`.
