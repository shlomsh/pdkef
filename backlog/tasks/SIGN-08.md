---
id: "SIGN-08"
title: "Share the effective typography descriptor"
status: "done"
priority: "P1"
epic: "sign-tool-architecture"
phase: "near-term"
depends_on: []
legacy_state: "Done 2026-09-02"
---

# SIGN-08 · Share the effective typography descriptor

## Scope and acceptance

**Share the effective typography descriptor.** `fonts.js`, text renderer/serializer, font picker, `SignatureDialog`: resolve face, available weight/style, size, and direction once for preview and export. Unsupported styles must not silently export differently. Typed signatures must await fonts and fit their canvas without clipping. Extend the existing WYSIWYG epic rather than introducing a second engine.

**Done 2026-09-02.** `resolveTypography(fontFamily, text, fontWeight, fontStyle, fontSize)` in
`fonts.js` is now the one descriptor `TextNode.tsx` (preview), `ElementToolbar.tsx` (the Bold/Italic
controls and the font picker's current family/weight/style), and `registry/text.ts`'s `serialize`
(export) all resolve through, instead of each independently calling `resolveFontSubstitution`/
`hasRealFace`/`textBoxPaddingEm` and risking drift. It returns `family` (same rule as
`resolveFontFamily`), `requestedWeight`/`requestedStyle` (what was asked for), `canBold`/`canItalic`
(whether the *resolved* family has a real file for that axis), `weight`/`style` (the requested values
clamped to `canBold`/`canItalic` - never the raw element flags), `paddingEm`, and `size` (defaulting
to `DEFAULT_FONT_SIZE_PT`).

**The clamp is what closes the "unsupported styles export differently" gap, and it was a real, live
bug, not a hypothetical.** Before this, `TextNode.tsx` rendered `element.fontWeight`/`fontStyle`
directly into CSS, so a stale draft or a family switch carrying `fontWeight: 'bold'` with no real bold
face for its resolved family painted a browser-*synthesized* bold on screen (`ElementToolbar`'s
`canBold` already gated the *toolbar's* display of this, but not the canvas itself), while
`registry/text.ts`'s `serialize` asked `loadCustomFont` for the same missing file, 404'd, and silently
embedded Regular - bold in the editor, upright in the download, with nothing surfacing the divergence.
Both sides now render/embed `typography.weight`/`typography.style` (the clamped values), so the two
are structurally the same value rather than two computations that happened to agree until a draft or a
family switch made them not.

**Typed signatures (`SignatureDialog.tsx`) fixed a second, independent bug.** The 'type' tab used to
draw straight onto a fixed 600x180 canvas without waiting for the chosen `@font-face` to actually load
- a real risk since the face loads lazily and drawing before it resolves silently falls back to the
generic `cursive` font, so the saved signature could look nothing like the preview just chosen. It now
`await document.fonts.load(fontSpec, typedName)` first (`.check()` cannot do this job - see
`liveFontCoverage.js`'s note on why - `.load()` is what actually triggers the fetch). The canvas is
then sized from `ctx.measureText()`'s real width plus `fonts.js`'s own per-font `textBoxPaddingEm`/
`DEFAULT_LINE_HEIGHT_EM` (the same rule that already keeps the editor's text boxes from clipping a tall
ascender/descender, e.g. Gveret Levin's loops) instead of a fixed box that could clip a long name
horizontally or a tall face vertically.

**Verified:** `resolveTypography` unit tests in `fonts.test.js` (requested-vs-clamped weight/style,
clamping against the *resolved* family rather than the requested one, size defaulting, agreement with
`resolveFontFamily`/`textBoxPaddingEm`); a new `SignatureDialog.test.tsx` case asserting
`document.fonts.load` is awaited before any draw and that the final canvas is sized from the measured
text rather than a fixed box. Full suite (1,862 tests), typecheck (0 errors), production build, and
the CSP/gesture-golden-rule/CSS/page-weight guards all pass (`/sign/` 586,727 / 600,000 brotli - within
budget, SIGN-14's split remains the honest fix once it's exhausted). `findUnrepresentableCharacters`
(`textCoverage.js`) was deliberately left alone: it already lands on the same embedded file either way,
since `loadCustomFont`'s own 404-to-Regular fallback produces an identical result to clamping first.
