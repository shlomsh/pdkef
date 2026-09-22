---
id: "MOBI-20"
title: "A symbol's resize handles overlap into a blob on a small detected checkbox"
status: "done"
priority: "P1"
epic: "mobile-round-trip"
phase: "quick-win"
depends_on: ["MOBI-19"]
legacy_state: "Done 2026-09-22"
---

# MOBI-20 · A symbol's resize handles overlap into a blob on a small detected checkbox

## What happened

MOBI-19 fixed the same overlap for text boxes. Shlomi, on the same phone, on a real Hebrew tax form
(a checkbox, not a text field): "same issue with checkbox." First read that as the per-element toolbar
wrapping again (a real, separate, narrower bug - the symbol toolbar's 8 controls can wrap to 2 rows
under a narrow viewport or an element near a page edge, reproduced at a 320px viewport) - Shlomi
corrected that: "the issue are the handles overlapping one another." The actual bug is
`src/editor/registry/symbol.ts`'s four corner handles (`top-left`, `top-right`, `bottom-left`,
`bottom-right` - font size is not a symbol concept, so there is no side-handle pair to worry about),
fixed at 10px/-4px exactly like text's used to be, on an element sized to match a *detected* printed
checkbox rather than a freshly-placed one.

Measured on the practice form fixture with real Playwright rendering: a checkbox tapped from a
detected field hint (`[class*="field-hint-checkbox"]`) placed a symbol at 4.28x4.28px. Every one of the
four corner handles' pairwise clearance came back around -7px to -8px - the same solid-blob overlap
MOBI-19 fixed for text, now in two dimensions on a small square rather than stacked along one edge on a
short strip. The matching visual (a teal 3-4-circle cluster) is visible in both Shlomi's screenshot and
the reproduction.

## Outcome (2026-09-22)

Same architecture as MOBI-19, generalised from one axis to two. `SymbolNode.tsx` measures its own
rendered size with a `ResizeObserver` (same pattern as `TextNode.tsx`'s effects) and hands
`.symbol .resizer` in `EditorElement.module.css` two raw values, `--half-width` and `--half-height`,
via `ElementResizers.tsx`'s `style` prop (already generic from MOBI-19, no change needed there).

The CSS does the same `clamp()`/`max()` arithmetic MOBI-19 landed, applied per axis: `--handle-size`
shrinks toward the same 5px floor using whichever half-dimension is smaller (so a thin rectangle, not
just a small square, is covered too), with the unchanged 10px ceiling. Each corner's horizontal spread
(`--h-spread`, shared by the top-left/bottom-left pair and separately by top-right/bottom-right) and
vertical spread (`--v-spread`, shared by top-left/top-right and bottom-left/bottom-right) each take
`max(handle-size + 3px, half-dimension - 1px)` - the old design's natural spread where the symbol is
big enough, the handles' own minimum-plus-3px-of-daylight floor where it is not. A symbol at or above
the crossover (roughly 30px on the smaller dimension, same as text's) is pixel-identical to before. The
diagonal pairs (e.g. top-left vs bottom-right) need no formula of their own: a hypotenuse is always at
least as long as either leg, so clearing the horizontal and vertical pairs clears the diagonal for free.

Verified with real rendered measurements on the same fixture's real detected checkbox, not eyeballing:
`resizer-handle-spacing.spec.js` gained a second case (its non-overlap helper factored out to cover
both text and symbol) confirming 4 handles, all at or above 2px of true edge-to-edge clearance - 11px
measured on the 4.28px checkbox, comfortably clear.

**The toolbar-wrap finding from the first misread is real but separate and not fixed here** - a
symbol's shared 8-control toolbar can still wrap to 2 rows on a narrow enough viewport or an element
positioned close to a page edge (reproduced at 320px width), unlike text's, which MOBI-16 gave a
collapse-to-compact treatment that has no clean equivalent for a type with no "editing" session. Left
open, pending a decision on how far to take it (trim the shared toolbar to always fit one row, vs. just
bound how much a wrapped bar can cover) - see the conversation for the options weighed.

Guards: `SymbolNode.test.tsx`'s "passes its measured size to the resize handles" describe block (mocks
`getBoundingClientRect` on the symbol's own visual wrapper, now marked `data-editor-symbol-visual`, to
pin the floor and a normal size) and `resizer-handle-spacing.spec.js`'s second test (real touch input,
a real detected checkbox, the same clearance guard MOBI-19 already proved for text).
