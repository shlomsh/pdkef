---
id: "MOBI-19"
title: "A text box's resize handles overlap into a blob on any short single-line field"
status: "done"
priority: "P1"
epic: "mobile-round-trip"
phase: "quick-win"
depends_on: ["MOBI-12"]
legacy_state: "Done 2026-09-22"
---

# MOBI-19 · A text box's resize handles overlap into a blob on any short single-line field

## What happened

MOBI-16 fixed the per-element formatting toolbar wrapping over the document on a phone. Shlomi's
follow-up, on the same screenshot: "the text element handles are not fixed" - the toolbar was never
the only problem. A text box carries six resize handles (`top-left`, `top-right`, `bottom-left`,
`bottom-right`, `left`, `right` - `src/editor/registry/text.ts`): the four corners resize font size
(MOBI-12), the two sides resize the comb span. `EditorElement.module.css` positioned every one of them
at a fixed 10px with a fixed -4px offset, regardless of the box's own height.

Measured on the practice form's "Emergency Contact" field (a real Playwright render, not eyeballing):
`top-left`, `left` and `bottom-left` landed at y = 790.8, 793.8, 796.8 - three 10px circles inside an
8px-tall box, i.e. one solid blob on each edge. This is not a fluke of that one field: MOBI-12's own
text cites a real "31x7px" date box as typical, so most single-line fields in this app are shorter than
the ~22px two adjacent 10px handles need to avoid touching at all.

MOBI-12 already fixed which handle a touch on the overlap actually *means* (`nearestHandle`, routes to
whichever handle's centre is nearest the touch point) - the remaining problem was purely visual: three
solid dots rendering on top of each other read as a rendering glitch, not as three distinct controls.

## Options considered

Discussed with Shlomi directly:

1. **Drop the corner handles for text.** Rejected - Shlomi: the corners are the font-size gesture
   (MOBI-12) and the sides are how a multi-column comb matches its span to the printed cells exactly;
   neither is expendable.
2. **Hide corners below a measured height threshold, keep them above it.** Preserves the gesture for a
   tall or multi-line box, loses it below the threshold (which is most single-line fields anyway).
3. **Scale every handle's size to the box's own measured height** (Shlomi's pick). Keeps all six
   handles, all their gestures, on every box; only the visual spread shrinks on a short one.

Shipped option 3 first, on a formula that kept each handle's *centre* where the old fixed -4px/10px
geometry already put it and only shrank the *size*. That undersold the fix: on the field the report's
screenshot showed (measured ~8px tall), centres are only ~3px apart, and two circles that close still
touch at any size down to a legible floor - "looks still overlapping" was accurate, not a rendering
artefact. The size-only version is not what shipped; the real fix also has to move handles apart, not
just make them smaller.

## Outcome (2026-09-22)

`TextNode.tsx` measures its own `.text-display` node's real rendered height with a `ResizeObserver`
(same pattern as its existing `scaleFactor` effect just above it - ordinary layout measurement, not the
gesture-time path `editor.md`'s golden rule governs, since nothing here writes back to `onChange` or
persisted state) and hands `[data-editor-text] .resizer` in `EditorElement.module.css` exactly one raw
value, `--half-height` (half the measured box height), via `ElementResizers.tsx`'s new optional `style`
prop - applied to each handle's own inline style directly, since the component renders a flat list of
sibling handles with no wrapping element of its own for the property to cascade from.

The CSS does the arithmetic, in two parts:

- **Size**: `--handle-size: clamp(5px, half-height - 2px, 10px)`. 10px is the unchanged ceiling (every
  other element type's fixed size, and what a tall/multi-line text box still uses); 5px is a floor
  small enough to fit the shortest printed comb cell while staying a visible dot.
- **Spread**: how far a corner handle's centre sits from the box's own vertical centre (where the side
  handles live), `max(handle-size + 1px, half-height - 1px)`. The second term is the old design's
  natural spread, correct once the box is tall enough that it already clears the handles' combined
  radii on its own; the first is the floor that design was missing - the smallest gap two handles that
  size actually need, plus a visible 1px of daylight - so a short box's corner handles float outward
  past its own top/bottom edge exactly as far as they must to clear the side handle, however short the
  box gets, rather than collapsing onto it. Where the natural spread already wins (any normal or
  multi-line box), the two formulas agree exactly and nothing moves from before.

The coarse-pointer 44px touch halo (`.resizer::before`) keeps its `calc((var(--handle-size, 10px) -
44px) / 2)` override for text, so the invisible touch target stays exactly 44px at every handle size and
position - shrinking or moving the visible dot never shrinks what a finger can actually hit.

Verified on the practice form's own 8px field with real rendered measurements, not eyeballing: the
`resizer-handle-spacing.spec.js` e2e checks every one of the six handles' real `getBoundingClientRect()`
pairwise and fails if any two circles are closer than the sum of their radii (with a 0.5px
floating-point allowance). On that field the fix lands centres 6px apart against 5px of combined
radius - a full 1px of clear space, not a bare non-overlap.

Guards: `TextNode.test.tsx`'s "passes its measured box height to the resize handles" describe block
(jsdom can only prove `--half-height` reaches the DOM correctly - it has no CSS engine to evaluate
`clamp()`/`max()`, see editor.md's "these need a real browser" note) and
`src/tools/sign/e2e/resizer-handle-spacing.spec.js` (the real non-overlap proof above, in a real
browser, on the exact field the report screenshot showed).
