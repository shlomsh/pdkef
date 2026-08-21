# Hebrew text shaping in the PDF export

The design record for why exported Hebrew does not match what the Sign editor shows, what the fix is,
and what was measured to choose it. Investigated 2026-08-21. **Not yet implemented** - the task
breakdown lives in [TODO.md](../TODO.md) under "Hebrew text shaping in the export".

---

## The defect

Type Hebrew with nikud into the Sign tool, download, and the vowel points sit in the wrong place. In the
worst font whole letters land on top of each other or get pushed off the line. The editor preview is
correct; only the download is wrong, so nobody sees it until after they have signed something.

Unpointed Hebrew is mostly fine, which is why this survived so long. Hebrew is not a connecting script,
so bare consonants need no shaping and the naive path gets them right.

## Root cause, precisely

`src/editor/registry/text.ts`'s `serialize` calls `page.drawText(line, ...)`. That reaches
`CustomFontEmbedder.encodeText` in `@cantoo/pdf-lib`:

```js
encodeText(text) {
  const { glyphs } = this.font.layout(text, this.fontFeatures);   // positions discarded
  ...hexCodes[idx] = toHexStringOfMinLength(glyphs[idx].id, 4);
}
```

`font.layout()` **already performs full GSUB/GPOS shaping** - that is how it picks the right glyphs. It
returns `{ glyphs, positions }`, where `positions` carries the per-glyph `xOffset` / `yOffset` /
`xAdvance` that say where a mark attaches to its base letter. pdf-lib destructures out `glyphs`, throws
`positions` away, and lets the PDF's `/W` widths array place everything.

So the shaping is not missing. **It is computed and then discarded.** That makes this far cheaper to fix
than it first appears, and it is the single most important thing to know before touching this code.

Confirmed to be in the file rather than in one renderer: poppler (`pdftoppm`) and macOS CoreGraphics
(`qlmanage`) rasterize the broken output identically.

## The fix

Shape with fontkit, then emit each glyph at its shaped position instead of handing pdf-lib a string.
Everything needed is exported from the `@cantoo/pdf-lib` package root - `setTextMatrix`, `setTextRise`,
`showText`, `pushOperators` - so there is no fork and no new dependency. fontkit is already a
dependency and already runs on this path.

The prototype below produced output matching the editor for all seven catalogued Hebrew fonts:

```js
// Real, searchable text - every glyph placed where the shaper says it goes.
const gidHex = id => id.toString(16).toUpperCase().padStart(4, '0');

export function drawShapedText(page, { text, pdfFont, fkFont, size, rightEdge, y, color }) {
  const { glyphs, positions } = fkFont.layout(text);
  const scale = size / fkFont.unitsPerEm;
  const total = positions.reduce((s, p) => s + p.xAdvance, 0) * scale;

  const fontKey = page.node.newFontDictionary(pdfFont.name, pdfFont.ref);
  const out = [ops.pushGraphicsState(), ops.beginText(),
               ops.setFillingColor(color), ops.setFontAndSize(fontKey, size)];

  let pen = rightEdge - total;                     // RTL: anchor the right edge
  glyphs.forEach((glyph, i) => {
    const { xOffset, yOffset, xAdvance } = positions[i];
    const rise = yOffset * scale;
    out.push(ops.setTextMatrix(1, 0, 0, 1, pen + xOffset * scale, y));
    if (rise) out.push(ops.setTextRise(rise));
    out.push(ops.showText(PDFHexString.of(gidHex(glyph.id))));
    if (rise) out.push(ops.setTextRise(0));
    pen += xAdvance * scale;
  });

  out.push(ops.endText(), ops.popGraphicsState());
  page.pushOperators(...out);
}
```

Cost measured on a five-line sample: **+454 bytes**. Text stays real text (see "Text extraction" below).

### Do not batch glyphs into shared runs

The obvious optimisation - emit consecutive unmoved glyphs as one `showText` and only break out for
marks - is **wrong, and it fails silently**. A batched run advances the pen by the PDF's `/W` widths
array, not by the shaper's advances. Where the two disagree the rest of the run drifts, and letters
overlap. This is what mangled Playpen Sans Hebrew in the first prototype.

Guarding the batch by comparing the shaped advance against the glyph's `hmtx` advance **does not fix
it**, which was verified: the `/W` array pdf-lib writes can disagree with `hmtx` for reasons that check
does not model. Position every glyph individually. It is the only version proven correct across the
catalogue, and it costs nothing worth optimising (see the byte figure above).

## Why not an image

Rasterising text to a canvas PNG (what the retired branch did) makes the output match the editor
exactly, because the output *is* the browser's own rendering. It also stops the text being text:
no selection, no search, no copy, no accessibility, and a much heavier file. **Rejected as a product
decision, not a technical one.** Do not reintroduce it as a fallback for a stubborn font either -
the sanctioned move for a font that cannot be made to agree is to drop it from the catalogue (below).

## Why not HarfBuzz WASM

Bundling a real HarfBuzz build (harfbuzzjs, MIT, no network) would guarantee parity with the browser's
own engine forever. It was measured and found unnecessary: fontkit's shaped advances match the browser's
`measureText` to **0.0% on six of the seven** catalogued Hebrew fonts, and 0.7% on Playpen Sans Hebrew.
There is no disagreement to fix, so the WASM payload buys nothing today.

Keep it in reserve. If a font we genuinely want later fails the parity guard, that is the moment to
reconsider, and the emission code above does not change - only where the positions come from.

## Why not precomposed presentation forms

Unicode's Alphabetic Presentation Forms block has precomposed Hebrew letter-plus-point glyphs, but
coverage is partial and fonts are not obliged to carry them. It would fix some clusters and silently
miss others, which is worse than a uniform fix.

## The font catalogue is ours to curate

`HEBREW_CAPABLE_FONTS` in `src/lib/fonts.js` is a closed, deliberate list of seven: Arimo, Tinos,
Cousine, Assistant, Heebo, Gveret Levin, Playpen Sans Hebrew. We decide what is on it. **We do not owe
correct output for every font that exists, only for the ones we ship** - so when a font cannot be made
to agree with the editor, the answer is to drop it or mark it Latin-only, not to build a special path
around it. `src/lib/fontCoverage.test.js` already sets this precedent by judging Hebrew capability
against the real asset bytes.

As measured, no font needs dropping: per-glyph positioning fixes all seven, Playpen included.

## Text extraction

`pdftotext` was used to check the export is still text.

- **Latin is unaffected.** `Shlomi Shahar - signed 21 Aug 2026` extracts identically from the current
  path and from per-glyph positioning. Per-glyph positioning is *not* itself what degrades extraction.
- **Unpointed Hebrew is unaffected.**
- **Pointed Hebrew gains stray spaces** around the marks, because each repositioned mark becomes its own
  positioned run and the extractor reads the offset as a gap. The words are still there and still
  searchable without their points.

A possible refinement, not built: emit `TJ` with inline adjustments inside one run rather than a fresh
`Tm` per glyph, so an extractor sees contiguous text. Marks with a `yOffset` still need `Ts`. Treat this
as an improvement to chase only if extraction quality on pointed text turns out to matter.

## Measurement pitfalls

An automated parity harness was prototyped (render each font both ways, compare inked pixels as IoU).
It is **not calibrated** and its absolute numbers should not be trusted as a verdict. Three traps, all
of which produced confidently wrong readings before being caught:

1. **Mask on luminance, not alpha.** The comparison canvas is filled white first, so every pixel is
   fully opaque and an alpha test matches the entire page. This scored every font at ~2% and looked like
   a total failure.
2. **Re-rasterize after changing the sample string.** Regenerating the PDFs without re-running
   `pdftoppm` compares fresh browser output against stale crops. This inverted the result, making the
   unpointed control look *worse* than the pointed case.
3. **Thin faces score low from sub-pixel shifts alone.** Poppler and Chromium do not antialias
   identically, and a 4px shift on a hairline font tanks IoU while looking perfect. The noise floor
   sits around 80-88% and varies per font, so a parity guard needs **per-font baselines**, never one
   global threshold.

## The retired branch

`fix/hebrew-pdf-shaping` (head `d47ca5f`, 2026-07-06) held the canvas-to-PNG approach, explicitly marked
not production-ready by its own commit message. It is retired rather than rebased: its approach is the
one ruled out above, and it had drifted far behind `main`.

It is preserved as the tag `archive/hebrew-pdf-shaping` if the raster experiment is ever wanted for
reference. **Do not merge it.** Besides the rasterisation, it carries an unrelated Google Analytics
integration that adds `googletagmanager.com` to `script-src` and three `google-analytics.com` origins to
`connect-src`, via two `is:inline` scripts. That contradicts the privacy invariant and the recorded
decision to drop GA (see TODO.md, "Google Analytics was dropped rather than disclosed").
