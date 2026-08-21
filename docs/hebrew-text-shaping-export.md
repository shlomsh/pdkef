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

**This design is validated, not proposed.** It was run against the real `src/lib/comb.js`,
`src/lib/fonts.js`, `src/lib/signHelpers.js` and `src/constants/signGeometry.js`, through a port of
`text.ts`'s `serialize`, covering multi-line RTL pointed Hebrew, Latin, both comb paths, and the
Latin-only-font substitution path (Pacifico asked to render Hebrew, which `resolveFontFamily` sends to
Gveret Levin). All produced correct PDFs. What is left is implementation, not investigation.

Two helpers do the work. `shapedWidth` returns `null` for a font whose fontkit instance is unreachable,
which is the caller's signal to use today's path unchanged:

```js
const gidHex = id => id.toString(16).toUpperCase().padStart(4, '0');

// Shaped width in points, or null when this font can't be shaped - the caller
// must then fall back to page.drawText(). Reaching the fontkit instance through
// pdfFont.embedder.font is an internal field, and is exactly how sign.js's
// baselineOffset() already reads ascent/descent, guard and all.
export function shapedWidth(pdfFont, text, size) {
  const fk = pdfFont?.embedder?.font;
  if (!fk?.unitsPerEm) return null;
  const { positions } = fk.layout(text);
  return positions.reduce((s, p) => s + p.xAdvance, 0) * size / fk.unitsPerEm;
}

// Emits `text` with every glyph at its shaped position. `x` is the LEFT edge;
// callers that anchor a right edge (RTL, comb cells) subtract shapedWidth first.
export function drawShapedRun(page, { text, pdfFont, size, x, y, color }) {
  const fk = pdfFont.embedder.font;
  const { glyphs, positions } = fk.layout(text);
  const scale = size / fk.unitsPerEm;
  const fontKey = page.node.newFontDictionary(pdfFont.name, pdfFont.ref);
  const out = [pushGraphicsState(), beginText(), setFillingColor(color), setFontAndSize(fontKey, size)];
  let pen = x;
  glyphs.forEach((glyph, i) => {
    const { xOffset, yOffset, xAdvance } = positions[i];
    const rise = yOffset * scale;
    out.push(setTextMatrix(1, 0, 0, 1, pen + xOffset * scale, y));
    if (rise) out.push(setTextRise(rise));
    out.push(showText(PDFHexString.of(gidHex(glyph.id))));
    if (rise) out.push(setTextRise(0));
    pen += xAdvance * scale;
  });
  out.push(endText(), popGraphicsState());
  page.pushOperators(...out);
}
```

Cost measured on a five-line sample: **+454 bytes**. Text stays real text (see "Text extraction" below).

### How it drops into `serialize`

Nothing about the surrounding geometry changes. `baselineAdjustedY`, `textBoxPaddingEm`,
`DEFAULT_LINE_HEIGHT_EM`, the multi-line split and the RTL anchor all stay exactly as they are. Only the
two `page.drawText(...)` calls are replaced:

- **Plain lines.** Per line, `const lineWidth = shapedWidth(resolvedFont, line, size)`. If it is `null`,
  keep today's `drawText` call verbatim. Otherwise `drawShapedRun` at `isRtl ? pdfX - lineWidth : pdfX`.
- **Comb cells.** Same substitution per cell, with the cell's shaped width used to centre it
  (`x: center - cellWidth / 2`) instead of `widthOfTextAtSize`.

**Use the shaped width, not `widthOfTextAtSize`, for the RTL anchor.** The two disagree - on Playpen Sans
Hebrew by 52 font units on one sample - because `widthOfTextAtSize` sums `hmtx` advances while the shaper
reports what it will actually use. The shaped total is the one the editor agrees with.

### Do not batch glyphs into shared runs

The obvious optimisation - emit consecutive unmoved glyphs as one `showText` and only break out for
marks - is **wrong, and it fails silently**. A batched run advances the pen by the PDF's `/W` widths
array, not by the shaper's advances. Where the two disagree the rest of the run drifts, and letters
overlap. This is what mangled Playpen Sans Hebrew in the first prototype.

Guarding the batch by comparing the shaped advance against the glyph's `hmtx` advance **does not fix
it**, which was verified: the `/W` array pdf-lib writes can disagree with `hmtx` for reasons that check
does not model. Position every glyph individually. It is the only version proven correct across the
catalogue, and it costs nothing worth optimising (see the byte figure above).

## Comb fields are broken a second, separate way

Found while validating the above, and it is a real defect, not a theory. `combCharacters()` is
`Array.from(text)`, which splits on **code points**, so every nikud mark becomes its own comb cell:

```
"שָׁלוֹם"  by code point -> ["ש","ָ","ׁ","ל","ו","ֹ","ם"]   // marks stranded in their own boxes
          by cluster    -> ["שָׁ","ל","וֹ","ם"]              // correct
```

Rendered, the code-point version puts a lone dot and a lone kamatz in boxes of their own. This is
independent of the shaping bug and survives fixing it.

The fix is to split on grapheme clusters - a base character plus any combining marks that follow it:

```js
Array.from((element?.text || '').replace(/\r?\n/g, '').matchAll(/\P{M}\p{M}*/gu), m => m[0])
```

A plain regex rather than `Intl.Segmenter`: it needs no availability check, and `\p{M}` is precisely the
category in question. Validated to produce the four cells above and to render them correctly through
`drawShapedRun`. Note this changes `combCellCount` for pointed text, which is the point - a pointed word
needs fewer boxes than it has code points.

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

**Decided: accept it.** The words remain present and searchable without their points, which is how Hebrew
is searched in practice, and the alternative is a wrong-looking document. A `TJ`-with-inline-adjustments
emission would likely tidy it up (marks with a `yOffset` would still need `Ts`), but it trades a real
rendering fix for a cosmetic extraction one. Not on the backlog; reopen only if someone reports it.

## The two guards, and the one that was rejected

Correctness here is a chain of two claims, and each half has its own cheap, deterministic check. Both
were run; neither needs rasterisation.

**Guard B - the export honours the shaper.** A pure unit test, no browser. Pass a mock page
(`{ node, pushOperators }`) to `drawShapedRun`, then read the captured operators: `op.name` stringifies
to `Tm` / `Tj` / `Ts` and `op.args` to the operands. Assert every `Tm` x-position equals the running sum
of fontkit's `xAdvance` plus that glyph's `xOffset`. Validated on `שָׁלוֹם` in Heebo: seven glyphs, **max
deviation 0.00e+0, exact**. This is also the regression test for the no-batching rule, because a batched
run emits fewer `Tm`s than there are glyphs.

**Guard A - our shaper agrees with the browser.** Needs a browser, so it belongs in Playwright. For each
family in `HEBREW_CAPABLE_FONTS`, compare fontkit's total shaped advance against the same string's
`measureText` width in the page. Measured today: **0.0% on six of seven, 0.7% on Playpen Sans Hebrew**,
so the tolerance is per font. This is the check that would catch a newly added font whose shaping fontkit
reads differently from the browser, which is the scenario the catalogue rule exists for.

**Rejected: pixel-diffing the rendered output.** Tempting, and it was prototyped as an IoU of inked
pixels. It compares two different rasterizers (poppler against Chromium), so its noise floor sits around
80-88% and varies per font - a hairline face shifted 4px looks perfect and scores terribly. Calibrating
that per font is a maintenance burden that buys little over Guards A and B together. Do not revive it
without a reason; if the pixel path is ever wanted, render the PDF with pdf.js **inside the same browser**
that draws the reference so there is only one rasterizer in play.

### Measurement pitfalls, if a pixel harness is ever built anyway

The prototype produced three confidently wrong readings before each of these was caught:

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
