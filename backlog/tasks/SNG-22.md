---
id: "SNG-22"
title: "Fill mode draws its own text caret, 1.05em tall, so a tall-metric font's caret stays inside the field"
status: "open"
priority: "P3"
epic: "sign-next-gen"
phase: "longer-term"
depends_on: []
---

# SNG-22 · Fill mode draws its own text caret, 1.05em tall

*Filed 2026-09-26.* On iOS the native caret is as tall as the font's own line metrics, not the
field's 1.05em line box, so in Gveret Levin (hhea 1.30em, win 1.64em) it runs well above and below the
field (Shlomi, iPhone, form 101). CSS cannot set a caret's height. The colour already follows the text
(`caret-color: currentColor`, fd70218e). Fonts measured by vertical metrics run from Neucha 1.10em up to
Suranna 2.19em.

The comb fields already hide the native caret and draw their own (`useCombCaret.ts`, `CombCells`).
Do the same for plain fill inputs and the committed text box: `caret-color: transparent`, and a bar of
the text's colour, 1.05em tall, at the selection's position, read from a zero-width marker in the text
box's existing `.text-measure` mirror, so right-to-left and mixed text place it correctly. iOS's own
selection, loupe and editing stay underneath.

## Acceptance

- [ ] The caret is 1.05em tall in every shipped font, in the text's colour, and blinks like the platform's.
- [ ] Its position is right in Hebrew, English and mixed text, at the start, the middle and the end.
- [ ] Selection handles and the iOS loupe still work (a hand-run check on an iPhone).
