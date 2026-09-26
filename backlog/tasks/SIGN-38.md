---
id: "SIGN-38"
title: "Text placed in a form cell sits at the same height in every font"
status: "in_progress"
priority: "P1"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
---

# SIGN-38 · Text placed in a form cell sits at the same height in every font

## The bug

`cellTextTop` (`src/editor/text/combPlacement.ts`) computed a placed box's top from the strip's centre
using fixed, Arimo-like constants (`TEXT_BOX_LINE_HEIGHT_EM`, `TEXT_BOX_PADDING_EM`), but the rendered
box uses per-family padding (`textBoxPaddingEm(family)`, `src/editor/text/fonts.js`) and the baseline
sits at a per-family offset within the line box. Digits also have different ink heights per face. The
result: the same nominal font size in the same cell lands its digits at a different height depending on
the font. Measured spread of the digits' ink centre below the cell's own middle, 14pt in a 22pt cell:

| Font | Digit centre below cell middle |
| --- | --- |
| Neucha | 0.07pt |
| Arimo | 1.71pt |
| Gveret Levin | 3.26pt |
| Sriracha | 6.06pt |
| Pacifico | 7.75pt (baseline itself below the cell) |

## The fix

Centre the digits' own ink on the strip's centre, not the font's whole em box, then keep today's small
drop toward the writing line so Arimo stays where it is (approved production look):

```
baseline = centre + em * (figureCentreEm(family) + TEXT_BOX_PADDING_EM)
top = baseline - em * baselineDropEm(family)
```

- `src/editor/text/fontManifest.js`: added a per-family `figureCentre` (the midpoint of the digits'
  ink box, em, positive up from the baseline, read from the real TTF outlines) next to `ascent`/
  `descent`, for every bundled family.
- `src/editor/text/fonts.js`: `figureCentreEm(family)`, falling back to `COMB_CAP_HEIGHT_EM / 2` for a
  family with no bundled figure.
- `src/editor/text/combPlacement.ts`: `cellTextTop` and `placeTextOnCell` take `fontFamily`; the boxed
  comb branch and the open-comb strip clamp in `placeCombOnRegion` centre the ink the same way, instead
  of the font's em box.
- `src/tools/sign/fill/slotElement.ts` and `fillSlots.ts` place through `resolveFontFamily(font, text)`
  so a Hebrew switch (e.g. Arimo to Gveret Levin) places against the font that actually renders and
  embeds the text; the element itself still stores the raw carried family, exactly as a tap does.

## Follow-up

Changing the font of an already-placed field element afterwards does not re-place it - see SIGN-39.

## Acceptance

- [x] `fonts.test.js` checks `figureCentre` against the real TTF digit outlines, the same way `hhea`
  ascent/descent is checked.
- [x] `combPlacement.test.ts` re-derives the pinned `placeTextOnCell`/`placeCombOnRegion` tests and adds
  one proving the digit centre is the same (within 0.02em) across Arimo, Gveret Levin, Caveat and
  Pacifico, and that Arimo's own top is unchanged from before this fix (within 0.05pt).
- [x] `formCells.test.js`, `fillSlots.test.ts`, `slotElement.test.ts`, `FieldSlot.test.tsx` and the
  `*.practiceForm.test.tsx` suites pass with `fontFamily` threaded through.
- [ ] `npm run check:fast` is green.
