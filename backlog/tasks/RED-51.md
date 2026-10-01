---
id: "RED-51"
title: "Whiteout works like correction fluid: matched to the page, no border, colour in one tap"
status: "done"
priority: "P2"
epic: "redact"
depends_on: []
---

# RED-51 · Whiteout works like correction fluid: matched to the page, no border, colour in one tap

*From Shlomi's brief, 2026-10-01, with phone and desktop screenshots.* A whiteout box is a fixed white
patch, so it shows on any off-white or tinted page. Its fill is inset 1px by a transparent border, which
leaves a sliver of whatever sits under its edge. Changing the colour takes three steps through a popover
that covers the box and ends at an unlabelled native colour square. On a phone the selection bar is a dark
full-width slab that runs under iOS 26 Safari's floating toolbar, and with "Every page" showing it wraps
Delete onto a row of its own.

## Decisions

- Whiteout boxes and strokes carry `colorMode: 'auto' | 'custom'`, on Redact's own types, not the shared
  editor model. Absent means custom, so a saved draft keeps its colour with no migration. It is called
  `colorMode` because "fill mode" already names Sign's form-filling UX.
- Auto is the per-channel median of a 4 CSS px ring just outside the box, read from the page canvas only,
  never from an overlay, skipping unpainted (alpha 0) pixels. It is sampled on draw, on every move or
  resize (in the same update, so one undo step, still labelled "Moved"), for Duplicate and Every page
  (each copy on its own page), and when Auto is tapped. Linked boxes share the mode, and each samples its
  own page.
- New boxes always start on Auto. A custom pick (eyedropper or picker) still feeds the remembered whiteout
  colour (`rememberColor`), which the whiteout brush and Sign's whiteout use, so RED-40's memory is
  unchanged for them. An automatic sample never goes through it.
- Redact's selection bar gets its own toolbar (`RedactBoxToolbar`). Sign's shared `ElementToolbar` keeps
  its look and sheds the Redact-only branches it carried: blur strength, Every page, linked sets and find
  sets.
- The bar is a light pill matching the top toolbar (radius, border, shadow) with 44px controls, grouped
  so a narrow phone wraps whole groups, never a lone control. On a phone it floats above Safari's toolbar
  on `env(safe-area-inset-bottom)`; on desktop it stays the floating bar above the box.
- The export needs no change. A page with a whiteout box is already flattened to one picture with the box
  painted in its stored colour and no stroke (`redact.js`, `paintSolids`), the same removal as Blackout.

## Acceptance

- A whiteout drawn on an off-white or tinted page is not visible once deselected, and Peek still outlines
  every patch.
- Moving it onto a differently coloured area updates its fill, and one Undo restores both its position
  and its colour.
- The eyedropper and a custom colour are each one tap from the bar.
- The saved PDF shows the patch in the matched colour with no stroke.
- A draft saved before this opens with its colours unchanged.
- Unit tests for the median, the ring, the re-sample and the toolbar, and an e2e on a tinted page.

## Result

Shipped as decided above, plus a magnifier loupe on the eyedropper (box and brush alike): centred on the
pointer with a mouse, 40px above the finger on touch, press, slide and lift to pick. Measured in WebKit at
390px: a patch on a cream page is the page's own colour (`rgb(247, 241, 222)`, where it was white), it
follows the page onto another tint and one Undo restores both its place and colour, the exported picture
is that colour edge to edge, and the whiteout pill is one 54px row at 375, 390 and 402px. Rule 9 moved
`ElementToolbar`, the font and thickness pickers and `useCoarsePointer` into Sign and `BlurStrengthSlider`
into Redact. Arrow-key moves on whiteout-only pages were found broken (page sizes load only with a blur)
and handed to their own task. A fresh review then tightened it: the eyedropper takes only page pixels and
only the primary button, a click no longer re-samples, a custom colour is one undo step, the brush and the
box each arm their own pipette, the swatch's tick picks its ink by contrast, and the phone pill stays on
top in pseudo full screen, and so does the loupe (both go through one `overlayHost()`, so it follows a full screen
that starts while the eyedropper is armed).
