---
id: "READ-14"
title: "Highlight PDF: a third mark style, Pencil, hatching in the mark's color"
status: "in_progress"
priority: "P2"
epic: "highlight-pdf"
horizon: "next"
order: 14
depends_on: ["READ-13"]
---

# READ-14 · Pencil, a third mark style

*Opened 2026-11-02.* While designing the open-mark outline ([READ-13](READ-13.md)), hatching the open mark's
fill read well but too loud for a selection. Shlomi: "since we already have the new library let's allow a
third type of highlight to the two we have now, a pencil sketch." The "Pencil shading" option in
https://claude.ai/artifact/TGjFAxSxw9SRDpjusNDiPo shows the hatching.

## Outcome

A highlight can be Clean, Sketch or Pencil, picked in one toggle in the opacity popover. A pencil mark is hatching in the mark's own color,
with no outline of its own (an outline means the mark is open, READ-13). It looks the same on screen, in
print and in the downloaded PDF, and opening our own export again brings it back as Pencil.

## Decided

- **A style, not a stroke.** `HighlightElement.style` becomes `'underline' | 'pencil'`
  (`src/editor/model/editorModel.ts:169-170`). In the model it is a style; in the UI it is a look of a highlight,
  beside Clean and Sketch (see "Pencil moved into the look toggle" below).
- **One drawing for every surface.** A pure function beside `src/editor/geometry/sketchStroke.ts` takes the
  bands, the seed (`strokeSeed(id)`) and the page turns, and returns rough.js generator output: hachure at
  about -41 degrees, a gap of about 3.4px and a line weight of about 1.6px at 100%, in the mark's color. Screen
  (`HighlightNode`), print (`PrintSheets.tsx`) and export (`src/editor/registry/highlightPdf.ts`) all draw
  that output, the way READ-11's sketch does.
- **Still a highlight to every other viewer.** The export stays a standard `/Highlight` annotation with
  QuadPoints. Its appearance stream draws the hatch as stroked lines under `BM Multiply`, which the sketch
  branch does not do yet (it only fills, `m c h f`).

## Steps

1. **Unknown styles degrade, never vanish, and this lands first.** A build that does not know a style drops
   the whole element (`src/editor/registry/draftValidation.ts:322-325`, schema in
   `src/editor/registry/highlight.ts`), and `markerMemory.ts`'s parser rejects unknown values. A tab still on
   an older build could restore a draft with pencil marks, lose them, and autosave the draft without them.
   Make an unknown `style` read as a plain highlight, and ship that in a deploy before the style itself.
2. **The model and every place that lists styles**: the schema, `markerState.ts`, `markerMemory.ts`,
   `markEdit.ts`, `keys.ts` (`U` toggles underline; decide whether Pencil gets a key), `markerBadge.ts`,
   `cursor.ts`, `useMarkSwipe.ts`, `clickMark.ts`.
3. **The pure hatch function**, unit tests first: the same id gives the same output, a multi-line passage
   hatches each band, turned pages hatch in the displayed orientation.
4. **Screen and print** draw it, multiplied like the bands.
5. **Export**: stroked hatch lines in the appearance stream; `highlightPdf.test.ts` asserts them.
6. **Round trip**: `src/editor/comments/importAnnotations.ts` brings our own pencil marks back as Pencil.
   Check first how READ-11's sketch comes back (or whether it does) and use the same mechanism.
7. **The picker**: Pencil is the third segment of the opacity popover's look toggle (`StrokeChoice.tsx`), not of
   `StyleToggle`. Check the panel at phone width (44px targets).
8. **Legibility**: look at it on a scanned page and on pointed Hebrew, and tune the gap and weight if letters
   get lost in the lines.

## Acceptance

- [x] Pencil is picked from the opacity popover's Clean | Sketch | Pencil toggle on desktop and touch, and a pencil
      mark shows no outline until it is opened. (`pencil-mark.spec.js`; the touch row and the toggle's fit at 402,
      393 and 375 px in `mark-toolbar.spec.js`.)
- [x] Screen, print and the downloaded PDF draw the same hatch (unit tests on the shared function and the
      appearance stream).
- [ ] The exported PDF shows the hatch in Preview and Acrobat and is still listed as a highlight there.
      Quick Look (CoreGraphics, Preview's renderer) and poppler draw it on 2026-11-02; Acrobat not yet looked at.
- [x] Opening our own export again brings the marks back as Pencil (`/PDkefStyle /Pencil`; checked in the
      browser on a real export, and in `importAnnotations.test.ts`). READ-11's Sketch stroke does not come back
      on import; it reads as Clean.
- [ ] A build without Pencil reads a pencil mark as a highlight and never drops it. Written (step 1), but it
      only holds for users once step 1 is deployed alone before the rest.
- [x] Looked at on a scanned page and on pointed Hebrew (2026-11-02, default 50% yellow): the points and
      letters stay readable, gap and weight unchanged.

## What shipped, and where it differs from the plan

- The hatch is `src/editor/geometry/hatchStroke.ts` (rough.js, roughness 0.5, `hachureAngle` -41, which climbs
  49 degrees on screen) and `hatchInk.ts`, in the editor because the PDF export needs it too. It has no `turns`
  argument: it is drawn in displayed space and the export maps it through the page matrix, so a turned page
  hatches as shown.
- Sign shows an imported pencil mark as a plain highlight (it hands in no hatch) and still exports it as Pencil.

## Pencil moved into the look toggle (2026-11-02)

Shipped first as a third button beside Highlight and Underline, with the touch panel's segments cut to 28 px to
fit. Shlomi: a highlight can be clean, sketch or pencil, so those are one 3-way toggle in the dropdown, and the old
Clean | Sketch scraps looked bad too. Now:

- The kind switch is Highlight | Underline again (40 px halves on touch). Highlight stays pressed on a pencil mark,
  and a click there keeps the pencil.
- `StrokeChoice` is one segmented toggle: a mint track, equal segments, each word marked in its own look (a band,
  a sketched band, static hatch lines from `hatchLines`, since rough.js stays lazy), and a paper thumb that slides
  under the picked one. A highlight gets Clean | Sketch | Pencil in its opacity popover, an underline Clean | Sketch
  in its thickness menu. A highlight's choice carries its style, so Clean from a pencil mark is `{ style:
  'highlight', stroke: undefined }`.
- The opacity face on a pencil mark shows its percent over hatching. `P` still toggles Pencil.
- The model and the PDF are unchanged (`style: 'pencil'`, `/PDkefStyle /Pencil`).
- Measured in Chromium on 2026-11-02: three 69 px segments in a 240 px popover at desktop, 402 and 375 px (44 tall
  on touch), no overflow, and the mark row one line at all three.
