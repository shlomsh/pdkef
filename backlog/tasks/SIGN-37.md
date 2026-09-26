---
id: "SIGN-37"
title: "Typed signatures are saved sharp enough for the size they are placed at"
status: "in_progress"
priority: "P1"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
---

# SIGN-37 · Typed signatures are saved sharp enough for the size they are placed at

## The bug

`SignatureDialog.tsx` rasterised every typed signature at a fixed 44px font, then `trimCanvas` cropped
it with a fixed 8px margin. The resulting PNG is roughly 60px tall. Once placed, a signature is
commonly stretched to 400+ CSS px tall, so it renders blurry both on screen and in the exported PDF.
Production has the same bug: a drawn signature or an upload is sized from the input itself, but a typed
one was sized from a constant with no relation to how large it might end up.

## The fix

- `signatureImagePolicy.ts` gets a pure `typedSignatureFontPx({ widthPerPx, heightPerPx })`: the largest
  font size whose canvas stays within 90% of `MAX_SAVED_SIGNATURE_PIXELS`, clamped to
  `[TYPED_SIGNATURE_MIN_FONT_PX, TYPED_SIGNATURE_MAX_FONT_PX]` (44 to 240).
- `SignatureDialog.tsx`'s typed branch measures the name once at a reference size to get the canvas's
  width and height per 1px of font size, calls `typedSignatureFontPx`, then draws at that size. The
  8px trim margin scales proportionally with the chosen font size.

## Note

A signature already saved in someone's library keeps its old, fixed-44px resolution until it is
recreated; this change only affects signatures typed from here on.

## Acceptance

- [x] `typedSignatureFontPx` is a pure function with unit tests: a typical name lands within the clamp
  with its canvas inside the pixel budget, a very long name computes down to the minimum, a short name
  clamps to the maximum, and bad input returns the minimum.
- [ ] `npm run check:fast` is green.
