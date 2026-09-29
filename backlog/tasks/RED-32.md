---
id: "RED-32"
title: "Blur and whiteout brushes: any size, any color, removed from the saved file like a box"
status: "done"
priority: "P2"
epic: "redact-tool"
phase: "near-term"
depends_on: ["RED-30"]
---

# RED-32 · Blur and whiteout brushes: any size, any color, removed from the saved file like a box

*Shlomi, 2026-09-29: let people delete anything on the page even in tight spots, on white, grey or any
background color, and let them choose the brush's radius.*

A box can't reach between tightly spaced lines or around a stamp. A brush can.

- **Two brushes:** Blur brush (strength from the RED-30 slider) and Whiteout brush (a color).
- **Size:** 2 to 40, in page points so it is the same on the page at any zoom. A ring the size of the
  brush follows the pointer; the whiteout ring previews the color.
- **Color:** quick picks (white, the page's grey, light blue), the existing color picker, and an
  eyedropper that samples the rendered page, so a grey band or a colored footer is matched exactly.
- **Stays armed** until Stop or Esc: painting takes several strokes. This is a deliberate exception to
  the one-shot rule; add it to `.claude/rules/editor.md` in the same change.
- **One stroke is one element**, from press to release: select it, delete it, change its strength or
  color later. No resize. Undo takes back one stroke.
- **Gesture golden rule:** the stroke paints in the DOM (or a canvas) during the gesture and commits one
  element on release through `src/lib/gestures/controller.ts`.
- **Saved file:** a page with a brush stroke is saved as one picture, like a page with a box
  (f520b47b), so nothing under a stroke survives as text. Screen and export use the same stroke path and
  the same blur rule.
- Brush size, strength and whiteout color are remembered per document and become the default for new
  documents.

## Acceptance

- A whiteout stroke painted with the eyedropper's color on a grey band is invisible against it in the
  export.
- Text fully under a stroke is absent from the saved file's text layer (the saved-file check finds none).
- Two lines 17px apart: a 5pt brush clears one without touching the other.
- Undo removes the last stroke only; a selected stroke can be deleted or recolored.

## Undo and redo

Through the existing stack and the same `useRedactCommands` commit path as boxes, so Cmd/Ctrl+Z, the
toolbar Undo, redo and the five-second undo chip behave exactly as they do for boxes.

- **Painting a stroke** is one `add` entry holding the whole stroke. Undo removes exactly that stroke;
  redo puts it back with the same points, size, color or strength, and the same z-order.
- **Recoloring or changing a stroke's strength** is one `update` entry; a burst of color picks folds into
  one step (`canCoalesce`).
- **Deleting a stroke** is a removal with the undo chip, like deleting a box.
- **Not history:** brush size, the armed brush, the eyedropper, and the hover ring. They are settings or
  view state.
- **Size in the draft:** `past` is persisted and up to `MAX_HISTORY_DEPTH` (100) steps deep, so a stroke's
  points are simplified on commit (drop points closer than ~0.5pt, keep endpoints). A 100-stroke page
  must keep the draft small enough to save.
- `draftValidation.ts` accepts the new element type, so undo still reaches strokes after a reload.

Acceptance: paint three strokes, undo three times, redo three times: identical pixels and order to
before. Recolor a stroke, undo restores its color. Reload mid-way; undo still takes back the strokes
drawn before the reload.

## Result

Shipped on branch `red32-brushes`. Box or Brush inside Blur and Whiteout, size 2 to 40 in page points,
whiteout quick colours, picker and eyedropper, one element per stroke, saved as pictures like boxes. The
saved-file check counts strokes (`checkBoxesFromElements`). Strokes use the page's real width and height
in points (`usePageSizesPt`), so a tap is round on A4 and Letter. Brush mode and size live in the
document's carried style (`brushMode`, `brushSize`) and the app-wide style, not browser-wide storage.
