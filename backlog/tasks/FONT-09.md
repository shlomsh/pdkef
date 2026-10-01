---
id: "FONT-09"
title: "RTL export mirrors paired punctuation (Bidi_Mirroring)"
status: "done"
priority: "P1"
epic: "fonts-and-script-support"
depends_on: []
---

# FONT-09 · RTL export mirrors paired punctuation (Bidi_Mirroring)

## The gap

Sign's export shapes each right-to-left bidi run with fontkit's `layout(text, ..., 'rtl')`. fontkit
reverses the glyph order but never applies Unicode Bidi_Mirroring (UAX#9 rule L4), so `א(ב)` exported
through Heebo painted `)ב(א` while the editor's textarea showed `(ב)א`. Every bracket pair (`()[]{}<>`,
`«»` and the rest of BidiMirroring.txt) in a Hebrew or Arabic answer came out flipped in the downloaded
PDF, breaking the "fonts render identically on screen and in the export" invariant.

## The fix

One shared `layoutRun` in `src/editor/text/shapeRun.ts` does mirroring, composition and `layout()` for
both `shapedWidth` and `drawShapedRun`, so measurement and drawing see the same glyphs. An RTL run maps
each character to its `bidi-js` `getMirroredCharacter` before shaping, when the font has a glyph for
the mirrored form (HarfBuzz's rule). `/ActualText` keeps the typed characters.

`shapedWidth` moved out of `textMetrics.ts` with it: that module is in the editor's first paint, and
`bidi-js` there measured +5.3 KB brotli of eager JS on /sign/ (121,389 to 126,645). Both callers are
export-only, so the new module rides the lazy export chunk.

Scheherazade New is the one bundled face with an `rtlm` feature, which fontkit applies to the whole RTL
run. Its `rtlm` does not touch `()[]<>«»`, so those are mirrored once, not twice (pinned by a test).

Extraction: `pdftotext` still recovers `א(ב)` exactly. pdf.js ignores `/ActualText` and now reads the
ink, `א)ב(`; pinned in the W6 corpus. `דוא"ל (Email)` extracts as `Email( דוא"ל` in pdftotext both
before and after this change (the ActualText bytes are unchanged), a separate multi-run gap.

## Acceptance

- [x] A unit test exporting `א(ב)` and `דוא"ל (Email)` failed before the fix and passes after it.
- [x] `shapedWidth` and `drawShapedRun` share one layout path.
- [x] `pdftotext` still extracts the typed text (W6 corpus).
- [x] `npm run check:fast` is green; build, `test:weight`, `test:lazy-modules` and `test:csp` pass.
- [x] Font and export guards green on a pinned-Chromium machine: CI run 710 on `d72fdfd` (both
  `font-guards` shards, `export-guards`, and `checks` with poppler for the W6 pdftotext half). The
  2026-09-29 cloud session could not run them (Chromium 1194, not the pinned 1243).
