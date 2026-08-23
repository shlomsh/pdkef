# Hebrew text in the PDF export

The design record for why exported Hebrew does not match what the Sign editor shows. Opened 2026-08-21
for one defect, **reframed 2026-08-22** once browser verification turned up two more and a deliberate
search turned up a third.

## The root cause, and why it produces defects that look unrelated

**The export does not have a text pipeline. It has a shaper and a painter.**

Drawing text correctly is five stages, in every text stack ever written, including the one Chrome runs
to draw the editor the user is looking at. Here is what the export has:

| # | stage | what it does | have it? | the defect when it is missing |
|---|---|---|---|---|
| 1 | **Normalization** | compose base + mark into the glyph the font expects | **no** | nikud lands outside its letter |
| 2 | **Bidi (UAX#9)** | resolve direction, order runs | **no** | `1,250` exports as `052,1` |
| 3 | **Itemization** | split into runs by script, direction **and font** | **partial** | Arabic exports as nothing at all |
| 4 | Shaping | GSUB/GPOS per run | yes (fontkit) | - |
| 5 | Positioning | paint glyphs where the shaper said | yes, since H1-H4 | marks placed by `/W` advance |

Every defect found so far is a missing layer. **Not one is a bug inside fontkit.** They present as three
unrelated bugs (vowel points, letter order, disappearing text) because they are three different stages of
one absent pipeline, and that is why fixing them one symptom at a time does not converge.

**This framing is predictive, which is the only reason to trust it.** Layer 3 was not found from a bug
report. It was found by asking what a missing itemization stage would look like, and then looking. It
took one command, and the answer was that Arabic is lost entirely, in all seven fonts.

The practical consequence: **"are we done" is a structural question, do we have the layers, not an
empirical one, have the bug reports stopped.**

### How to read the rest of this document

- **Layer 5, positioning** - "The defect" through "Text extraction" below. Investigated and implemented
  2026-08-21. This is the only part that is done.
- **Layer 1, normalization** - "Layer 1: marks that need composition don't get it". Open.
- **Layer 2, bidi** - "Layer 2: mixed-direction lines don't bidi-reorder". Open, highest severity.
- **Layer 3, itemization** - "Layer 3: characters no bundled font can draw are silently dropped". Open.
- **Cross-cutting** - "Why no engine swap fixes this", the guards, and the measurement hazards. Read
  these before proposing to swap fontkit for something else, because the intuitive fix does not work.

**Three "why not" sections below are superseded** and each carries a pointer to what replaced it. They
were decided on measurements that could not have detected layer 1, and they are kept as written because
the reasoning trail is the point.

---

## Layer 5: the export discarded the positions the shaper computed (fixed 2026-08-21)

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
category in question. (**This regex has one gap, found 2026-08-22:** it drops a combining mark that opens
the string with no base before it. See "Small defects in the shipped emission code" at the end.) Validated to produce the four cells above and to render them correctly through
`drawShapedRun`. Note this changes `combCellCount` for pointed text, which is the point - a pointed word
needs fewer boxes than it has code points.

## Why not an image

Rasterising text to a canvas PNG (what the retired branch did) makes the output match the editor
exactly, because the output *is* the browser's own rendering. It also stops the text being text:
no selection, no search, no copy, no accessibility, and a much heavier file. **Rejected as a product
decision, not a technical one.** Do not reintroduce it as a fallback for a stubborn font either -
the sanctioned move for a font that cannot be made to agree is to drop it from the catalogue (below).

## Why not HarfBuzz WASM

> **Superseded 2026-08-22 - the measurement this rested on was blind.** Read "Layer 1: marks that need
> composition don't get it" below before quoting this section. The conclusion happens to survive, but
> not for the reason given here, and the reason matters. Kept as written for the record.

Bundling a real HarfBuzz build (harfbuzzjs, MIT, no network) would guarantee parity with the browser's
own engine forever. It was measured and found unnecessary: fontkit's shaped advances match the browser's
`measureText` to **0.0% on six of the seven** catalogued Hebrew fonts, and 0.7% on Playpen Sans Hebrew.
There is no disagreement to fix, so the WASM payload buys nothing today.

Keep it in reserve. If a font we genuinely want later fails the parity guard, that is the moment to
reconsider, and the emission code above does not change - only where the positions come from.

**What is wrong with that argument:** every Hebrew combining mark has `xAdvance` 0 in all seven fonts,
so mark position contributes exactly nothing to a total-advance comparison. That check can read 0.0%
agreement with every mark in the string in the wrong place. "There is no disagreement to fix" was never
established; it was assumed by a measurement that could not see the disagreement. There *is* one, in all
seven fonts.

## Why not precomposed presentation forms

> **Superseded 2026-08-22 - this reasoned its way past what the browser actually does.** See "Layer 1: marks
> that need composition don't get it" below. Kept as written for the record.

Unicode's Alphabetic Presentation Forms block has precomposed Hebrew letter-plus-point glyphs, but
coverage is partial and fonts are not obliged to carry them. It would fix some clusters and silently
miss others, which is worse than a uniform fix.

**What is wrong with that argument:** it treats presentation forms as *our* strategy to adopt or
reject, and never asked what the editor already renders. The browser reaches those glyphs on its own,
in all seven catalogued fonts, and four of the seven have no GPOS anchor for a dagesh because they
expect it. Partial coverage is a real property and it is not an objection, because the composition is
gated on the font actually having a glyph for the composed character. That is how HarfBuzz does it
(`font->get_nominal_glyph (composed, &glyph)`), and a font without the glyph simply keeps today's
path. "Fix some clusters and miss others" describes the status quo, not the proposal.

## The font catalogue is ours to curate

`HEBREW_CAPABLE_FONTS` in `src/lib/fonts.js` is a closed, deliberate list of seven: Arimo, Tinos,
Cousine, Assistant, Heebo, Gveret Levin, Playpen Sans Hebrew. We decide what is on it. **We do not owe
correct output for every font that exists, only for the ones we ship** - so when a font cannot be made
to agree with the editor, the answer is to drop it or mark it Latin-only, not to build a special path
around it. `src/lib/fontCoverage.test.js` already sets this precedent by judging Hebrew capability
against the real asset bytes.

As measured, no font needs dropping: per-glyph positioning fixes all seven, Playpen included.

**Curation is not a remedy for the composition defect found on 2026-08-22, and the measurement is what
rules it out.** fontkit's output changes under canonical reordering in **all seven** fonts, so the
divergence is uniform rather than a quirk of one face. There is no font to drop that makes it go away;
dropping Arimo would only move the symptom to Tinos. The curation rule stays exactly as valuable as it
was, for a *future* font that fails the guard, which is what it was written for.

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

> **Guard A does not check what its name suggests, and Guard B checks a narrower claim than it looks
> like.** Both are still worth having; neither can see a misplaced mark. Every Hebrew combining mark has
> `xAdvance` 0 in all seven fonts, so Guard A can pass at 0.0% with every mark in the string in the wrong
> place - which is exactly the state the catalogue was in when Guard A was written and passing. Guard B
> asserts that emission faithfully transcribes fontkit's `positions`, which is a real and useful
> invariant, but says nothing about whether those positions are right. **The chain "our shaper agrees
> with the browser" then "our export honours our shaper" has no link that tests the first clause.** See
> "A guard that can see a misplaced mark" below.

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

---

## Layer 2: mixed-direction lines don't bidi-reorder (found 2026-08-22, open)

Found while manually verifying the fix above in a real browser: a text element whose line mixes Latin
and Hebrew - `"Arimo: שלום"`, a label prefix being the concrete case that surfaced it, but any Latin +
Hebrew line qualifies - exports with the Hebrew segment in the wrong left-right order relative to the
editor. **Nikud still attaches to the right base letter** (that's what H1 fixed, and it's unaffected by
this); what's wrong is the order of the *letters themselves* within the mixed line.

### The defect, precisely

`shapedWidth`/`drawShapedRun` (and, before them, pdf-lib's own `encodeText`) call `fontkit`'s
`font.layout(text)` **once, on the entire line**, mixed directions and all. Empirically, fontkit only
reorders a run into RTL visual order when the *whole string handed to `layout()`* is RTL:

```
font.layout('שלום').glyphs.map(g => g.id)             // [2506, 2498, 2505, 2518]  (ם,ו,ל,ש - reversed, correct)
font.layout('Arimo: שלום').glyphs.slice(-4).map(g=>g.id) // [2518, 2505, 2498, 2506]  (ש,ל,ו,ם - NOT reversed)
```

(Glyph ids for Arimo: ש=2518, ל=2505, ו=2498, ם=2506 - checked individually via
`font.glyphForCodePoint()`.) So for a pure-RTL line the array already comes out in correct visual order
and painting it left-to-right with increasing pen position (what `drawShapedRun` does) is right. For a
mixed line, the Hebrew segment stays in *logical* (typed) order inside that same array, and painting it
left-to-right therefore paints it backwards relative to how a browser bidi-resolves the same string.

Confirmed with a real download: the editor renders `"Arimo: "` followed by `ם‑ו‑ל‑ש` (final-mem
immediately after the colon, shin at the line's end - correct RTL, first-typed letter at the fixed right
anchor per the `usesRtlAnchoring` view flag). The exported PDF's content stream, decoded and read
directly, shows the opposite: `ש‑ל‑ו‑ם` in that position (`Tm` x running 344.0 → 362.2, first glyph
`0x09D6`=ש, last `0x09CA`=ם). A pure-RTL line with no Latin prefix (just `שָׁלוֹם` alone) was re-verified
separately and matches the editor exactly in both letter order and nikud position - **the H1-H4 fix
itself is correct; this is a different bug with a different root cause, on a code path the original
investigation didn't exercise.**

### Confirmed not a regression from H1-H4

Called the **unmodified** `page.drawText()` (untouched in `node_modules`, not the new `drawShapedRun`)
with the identical mixed string and font:

```js
page.drawText('Arimo: שלום', { x: 300 - width, y: 700, size: 24, font, color: rgb(0,0,0) });
// content stream: <00240055004C00500052001D000309D609C909C209CA> Tj
//                  A    r    i    m    o    :    ' '  ש    ל    ו    ם   -- same un-reversed order
```

Same glyph order, same bug. `drawShapedRun` changed **how each glyph's position is computed** (shaped
offsets instead of `/W`-table advances); it did not touch **which glyphs come out of `layout()` or in
what order** - that was already wrong before this epic, for any element whose text mixes scripts on one
line. `getEffectiveTextDirection()`/`detectTextDirection()` (`src/lib/signHelpers.js`) already computes
a single overall direction per *element* (first-strong-character heuristic, used to decide which edge is
the anchored one) - what's missing is running that same idea at the *run* level, inside a line, before
handing text to fontkit.

### Why a fix here would reuse this epic's building blocks, not replace them

The natural fix is a small bidi pre-pass: split each line into contiguous same-direction runs (a
simplified version is probably enough for this app's real content - short names, addresses, form
labels - rather than a full UAX#9 implementation), call `shapedWidth`/`drawShapedRun` **once per run**
instead of once per line, and place each run's start `x` according to the *resolved visual order of
runs*, not their logical order. Concretely: `drawShapedRun` already accepts a `text` fragment and an `x`
- calling it per-run rather than per-line is a call-site change, not a rewrite of the emission primitive.
The `positions`-based per-glyph placement H1 built (§"The fix" above) is exactly what each run needs
internally, since within a single-direction run fontkit's shaping is already correct (that's what six
months of Hebrew content on this app, and Guard A/B, have been validating). This is the "kill two birds"
angle: solving mixed-direction ordering properly gives H1's positioning code a correctly-ordered sequence
of runs to draw, and needs no second positioning mechanism alongside it.

What a fix needs to get right, none of it explored yet:
- **Run splitting.** Where do runs break - only on strong-direction changes, or also around weak/neutral
  characters (digits, punctuation, spaces) per the real UAX#9 rules? `רחוב 17` (street name + digits) is
  a realistic form value and worth checking explicitly, since digits are weak-directional and may behave
  differently from the strong-LTR Latin case measured here.
- **Run *placement* order**, not just each run's internal glyph order - i.e. actually implementing the
  bidi reordering step (UAX#9 rule L2: reverse contiguous sequences of characters at each odd embedding
  level), not just concatenating shaped runs left to right in logical order (that's the current bug,
  just at run granularity instead of glyph granularity).
- **Comb fields** - do they need this at all? Comb cells are already single-character/cluster and
  positioned by cell index, not by a shaped line, so they may be unaffected. Worth confirming rather than
  assuming.
- **A guard.** Something in the shape of Guard A/B but for run order specifically - e.g. assert the
  first-strong-direction segment of a mixed string lands at the anchored edge, mirroring what Guard A
  already checks for a pure-RTL string's total advance.

Not investigated: whether this is worth fixing at all given how often real form content actually mixes
scripts on one line (a name + a Hebrew label the user typed themselves, rather than Latin generated by
this app, is the more common real case, and doesn't hit this - the label prefix used to surface this was
this task's own verification harness, not necessarily representative). That product-scope judgment call,
and the actual bidi design, are both open - this section exists so the next look starts from measured
facts instead of re-deriving them.

### The paragraph direction is not ours to auto-detect (2026-08-22)

The single easiest way to build this wrong, so it is recorded before anyone builds it.

The editor renders text in a `<textarea>` carrying **`dir={textDirection}`**
(`src/components/SignTool/nodes/TextNode.tsx`), and that value comes from
`getEffectiveTextDirection(element)` in `src/lib/signHelpers.js`:

```js
detectTextDirection(element.text) || element.textDirection || 'ltr'
```

So **the browser resolves bidi with an explicit paragraph direction**, not with UAX#9's own
auto-detection of the paragraph level. A bidi implementation in the export that auto-detects will
therefore agree with the editor on most strings and disagree on precisely the ambiguous ones, which are
the strings this whole defect is about. Worse, it will look fixed: the obvious test cases are the ones
where both methods happen to agree.

**Rule: the export resolves with the paragraph direction `getEffectiveTextDirection(element)` returns,
and never with the library's auto-detection.** Note the fallback chain matters too - a neutral-only or
empty string returns `null` from `detectTextDirection` and falls through to the element's stored
`textDirection`, then to `'ltr'`. Both sides have to walk the same chain.

### Digits settle the product-scope question (measured 2026-08-22)

The paragraph above wonders whether this is worth fixing at all, on the theory that a Latin prefix
beside Hebrew is mostly something this app's own harness produces. **A number beside Hebrew is not,
and it fails worse.** fontkit reverses the whole string whenever it judges the string RTL, digit runs
included, which UAX#9 requires it not do. Measured through the same `layout()` call the export makes:

| typed | emitted in visual order |
|---|---|
| `תאריך 21/08/2026` | `6202/80/12 ךיראת` |
| `טלפון 054-1234567` | `7654321-450 ןופלט` |
| `סכום 1,250 שח` | `חש 052,1 םוכס` |
| `רחוב 17` | `71 בוחר` |

The editor renders all four correctly. Note what kind of failure this is. Not a mark in the wrong
place, and not letters reordered inside a word that is still recognisably that word. **The document
states a different number than the one the user typed and looked at before signing it.** A date, a
phone number, an amount and a house number are the ordinary content of a form, and not one of these
examples needs a single Latin character to reproduce.

Worth recording alongside it, because it is the same root cause seen from the other side: the two mixed
cases fail in **opposite** directions.

- fontkit judges `Arimo: שלום` LTR (first strong character is Latin), reverses nothing, and the Hebrew
  comes out backwards.
- fontkit judges `שלום world` RTL, reverses everything, and `world` comes out as `dlrow`.

So per-run splitting is not an optimisation over a working default. **There is no single `layout()`
call that gets a mixed line right**, whichever direction it guesses.

---

## Layer 1: marks that need composition don't get it (found 2026-08-22, open)

Found in the same browser verification pass as the bidi defect above and, like it, **not a regression
from H1-H4**: it reproduces identically through the unmodified `page.drawText()`.

### The mechanism, and the wrong first answer

The first diagnosis was "HarfBuzz reorders marks before shaping and fontkit doesn't." **That is wrong**,
and the difference matters, because a reordering pre-pass and a composition pre-pass are not the same
piece of code and do not generalise the same way.

Take `ב` + sheva (U+05B0, ccc 10) + dagesh (U+05BC, ccc 21). That is what typing produces, and it is
**already canonically ordered** (ccc ascending), which is why `String.normalize('NFC')` is a no-op on
it. Measured against the real Arimo bytes:

| what | result |
|---|---|
| fontkit, as typed | 3 glyphs; the dagesh is a separate mark at offset (0,0) |
| fontkit, dagesh moved adjacent to its base | 2 glyphs; gid 2546, which is Arimo's glyph for **U+FB31 BET WITH DAGESH** |
| Arimo's `hebr` GPOS `mark` feature | an anchor for **sheva**-on-bet, and **none for dagesh**-on-bet |
| the base coverage of Arimo's dagesh mark lookup | exactly ח ם ן ע ץ, the five letters with **no** precomposed form, plus the shin/sin-dot forms |

Read the last two rows together: Arimo deliberately routes dagesh-on-bet through composition to U+FB31
and provides **no GPOS anchor for it**, because it does not expect to need one. `ccmp` can reach that
glyph, but a ligature lookup only matches an adjacent pair, and none of Arimo's `ccmp` lookups sets
`ignoreMarks` or a mark filtering set, so the sheva sitting between base and dagesh blocks it. fontkit
runs no composition step, hands GSUB a sequence `ccmp` cannot match, and then GPOS has nothing to fall
back on. The dagesh keeps its (0,0) offset and paints at the cluster origin.

**So this is glyph selection, not positioning.** The correct output uses a *different glyph*, not the
same glyphs at better offsets, which is why no amount of work on the emission code reaches it.

### What the browser does, measured rather than assumed

In Chromium, for **every one of the seven** catalogued fonts, these three inputs render **pixel-identical**:

```
בְ + dagesh   (typed, canonical)     U+05D1 U+05B0 U+05BC
בּ + sheva    (dagesh moved adjacent) U+05D1 U+05BC U+05B0
U+FB31 + sheva (precomposed)          U+FB31 U+05B0
```

fontkit produces a **different** glyph and position sequence for the first two in **all seven** fonts.
That is the divergence, stated at the level that matters: **the browser is insensitive to canonical
ordering here and fontkit is not.**

One honest loose end. HarfBuzz's Hebrew presentation-form table in `compose_hebrew` is gated
`if (!found && (c->plan && !c->plan->has_gpos_mark))`, and Arimo *does* have GPOS mark lookups, so the
exact internal route HarfBuzz takes is **not pinned down** - it may compose at the character level, or
reach the same glyph another way. The observable behaviour is not in doubt; the mechanism inside
HarfBuzz is. One command settles it and neither `hb-shape` nor `uharfbuzz` is installed on this machine:

```
hb-shape --font-file=public/fonts/Arimo-Regular.ttf --unicodes=05D1,05B0,05BC
```

Run it before building the pre-pass. If the output is one `bet_dagesh`-ish glyph, it composes and the
pre-pass should compose. If it is three glyphs with a positioned dagesh, HarfBuzz is doing something
else and the pre-pass would be the wrong shape.

### It is not an Arimo quirk, and Tinos is also wrong

`ב` + sheva + dagesh, per font. The overlap column is geometry, not eyeballing: the dagesh's emitted ink
span against the base letter's ink span, both at the same pen position.

| font | dagesh GPOS anchor (`hebr` `mark`) | has U+FB31 | dagesh ink inside the letter | verdict |
|---|---|---|---|---|
| **Arimo** (default) | no | yes (2546) | **0%** | **wrong** |
| **Tinos** | no | yes (2535) | **33%** | **wrong** |
| Cousine | no | yes (2347) | 100% | survives by glyph design |
| Assistant | yes | yes | 100% | anchored, (119,7) |
| Heebo | yes | yes | 100% | anchored, (65,4) |
| Gveret Levin | yes | yes | 100% | anchored, (73,-89) |
| Playpen Sans Hebrew | no | yes (889) | 100% | survives, see note |

Three things to take from this table.

1. **Tinos is broken too**, and was believed fine. Its dagesh glyph is origin-centred (bbox x ∈ [-80,80])
   with no anchor, exactly like Arimo's; only a third of it overlaps the letter. The earlier reading that
   "Tinos and Cousine place their un-ligated dagesh acceptably" holds for Cousine and not for Tinos.
   Judging this by eye at editor sizes is what missed it.
2. **Cousine and Playpen are not correct, they are lucky.** They pass because their dagesh glyph is
   drawn pre-positioned inside the em rather than origin-centred. That is a property of those font
   files, not of our pipeline, and a font update could take it away without anything failing.
3. **Containment is not correctness.** 100% means the mark's ink falls within the letter's horizontal
   ink span. It does not mean it is where the browser puts it. All seven still differ from the browser
   under reordering.

Note on Playpen: it has no dagesh-on-bet anchor reachable from `hebr`'s default langsys, yet fontkit
emits (312,31) for it, so that offset arrives by a route the scan did not enumerate (another langsys, or
`mkmk`). Unresolved and low-stakes, but do not treat the "no anchor" column as complete for that font.

### The harness, and the way it lies to you

Reproducing this needs the fonts compared **in one rasterizer**, which is what the rejected
poppler-against-Chromium pixel harness could never do. Rendering all variants to a canvas in the same
Chromium and hashing the ink solves that, and the whole probe is about forty lines: embed each TTF as a
`data:` URI in an `@font-face`, draw each variant at 120px, read back `getImageData`, compare hashes and
ink bounding boxes.

**It produced a completely clean, completely meaningless result on the first run.** Every font agreed
with every other font, byte for byte. The cause: `document.fonts.ready` does **not** load a face nothing
on the page uses, so all seven `@font-face` families silently fell back to one system font, and the
probe compared that font against itself seven times.

Two rules follow, and they are the same rule this repo already learned from 0x0 jsdom rects:

- **Force the load and check it**: `await document.fonts.load('120px "X"')` for each family, then assert
  `document.fonts.check(...)` for each.
- **Assert the measurement discriminates before trusting what it says.** Seven fonts must produce seven
  *distinct* signatures for the same string. That single assertion is what caught it, and no amount of
  staring at the plausible-looking table would have.

## Layer 3: characters no bundled font can draw are silently dropped (found 2026-08-22, open)

**This one did not come from a bug report.** It came from asking what a missing itemization stage would
look like, and then looking. That is the whole reason the layer framing above is worth anything, so the
provenance is part of the record.

### Measured

`font.layout()` returns glyph id 0, `.notdef`, for any character the embedded font has no glyph for.
Across the catalogue:

| typed | result |
|---|---|
| `مرحبا` (Arabic) | **all `.notdef`, in all seven fonts** |
| `שלום 😀` | the emoji is `.notdef` |
| `สวัสดี` (Thai) | all `.notdef` |
| `“curly quotes”`, `en–dash` | fine, all seven |

The editor renders every one of these correctly, because the browser falls back **per character** to a
system font. The export embeds **one font per element**, so anything that font lacks becomes `.notdef`
and the reader sees a blank or a box depending on the viewer. Either way the content is gone.

That is the same mechanism `CLAUDE.md` already warns about ("the browser silently substitutes a *system*
font per character for glyphs the file lacks, while a PDF embeds one font per run with no fallback"), and
it is the same failure shape as the other two: correct on screen, wrong in the file, invisible until
after the document is signed.

### What already exists, and exactly where it stops

`resolveFontFamily` in `src/lib/fonts.js` is layer 3, deferred to element granularity. It handles
Hebrew-typed-into-a-Latin-only-face by swapping the whole element's family, and its comment says plainly
why it does not go finer:

> a run-by-run split would render "רחוב 17" in two different faces, and the editor and the PDF would
> have to agree on where every run starts

That is a sound decision made without run infrastructure. It covers the Hebrew/Latin axis and nothing
else, so a script **no** bundled font covers falls straight through it.

### Three traps in building the check (all measured 2026-08-22)

**Trap 1: you cannot name the lost characters from the glyphs.** The obvious implementation is to run
`layout()`, filter for glyph id 0, and read each one's `codePoints` back to tell the user what was
dropped. **It does not work.** fontkit caches glyph objects by id, so a font instance has exactly one
`.notdef` object, and its `codePoints` array holds whatever was set when it was first created. Measured
on one Arimo instance, `.notdef` reported `U+645` for an emoji, for a tab and for a Thai string, because
an Arabic word had been laid out first. The `.notdef` **count** is reliable; the identity is not.

Detect coverage per character with `font.hasGlyphForCodePoint(cp)` instead, which is also the precedent
`src/lib/fontCoverage.test.js` already sets.

**Trap 2: the naive check refuses on characters the user cannot see.** `hasGlyphForCodePoint` is honest
about *every* code point, including the invisible ones, and the bundled fonts do not cover them:

| character | fonts missing it |
|---|---|
| **TAB U+0009** | **all seven** |
| soft hyphen U+00AD, ZWSP U+200B, word joiner U+2060, BOM U+FEFF | Heebo, Gveret Levin, Playpen |
| **LRM U+200E, RLM U+200F**, LRE U+202A, PDF U+202C | Gveret Levin, Playpen |

**RLM and LRM ride along invisibly in Hebrew copied from the web, Word or WhatsApp**, which is how this
app's users get text in the first place. A check that does not exclude them refuses the whole document
and names a character the user cannot see, cannot find and cannot delete. That is a worse experience
than the defect being fixed.

It is not only a check problem, though the drawing half is narrower than first written here. **Correction:
an earlier draft of this section claimed an RLM draws a `.notdef` box in Gveret Levin. It does not**, and
the first measurement that said so was taken by typing an RTL string directly into a shell command, where
what you see is not the byte order you get. Rebuilt from explicit code points:

| character | in cmap? | does `layout()` emit `.notdef`? |
|---|---|---|
| RLM, ZWSP, soft hyphen, BOM | often no | **no** - fontkit swallows Unicode default-ignorables cleanly |
| **TAB U+0009** | **no, in any bundled font** | **yes in Arimo**, the default face |

TAB is a **control** character rather than a default-ignorable **format** one, so nothing swallows it and
it reaches the page as a box. That is the only one of these that draws, and it draws in the default font.

So both halves are real, at different sizes: the coverage check must ignore all of them or it refuses
documents over invisible characters, and the drawing path must strip at least TAB or it prints a box.
Strip both in one place regardless, so the two paths cannot disagree.

**Rule: strip `\p{Cc}` and `\p{Cf}` on the export path, in one place that both the drawing path and the
coverage check go through.** Strip in the check alone and the check passes while the box still gets
drawn.

**Trap 3, and it is the one that actually shipped for a few hours: the strip must run AFTER bidi, never
before.** LRM/RLM (U+200E/200F) and the embedding controls (U+202A-202E, U+2066-2069) are themselves
`\p{Cf}`, and they are the characters that *steer* UAX#9. Stripping first deletes the input the algorithm
exists to read, which reintroduces the exact editor/export ordering divergence layer 2 closes. Measured
on `"הקובץ ‎(v2)‎ מוכן"`, a Hebrew sentence with a parenthesised Latin token the author isolated with LRM
marks, which is what text pasted from Word or WhatsApp routinely looks like:

| pipeline | resolved visual order |
|---|---|
| marks intact (what the editor shows) | `מוכן ‎(v2)‎ הקובץ` |
| stripped before bidi | `) מוכןv2הקובץ (` |

The parentheses are torn off `v2` and land at opposite ends of the line. **Correct order: normalize TAB
to a space, resolve bidi with the marks intact, then strip each resolved run** (UAX#9 rule X9 removes the
controls from display once they have done their job) and drop any run left empty. `normalizeTabsForBidi`
and `stripInvisibleFormatting` in `text.ts` are that split, and the reason each exists is in its doc
comment.

Note the overlap with layer 2: UAX#9 removes bidi controls from display as part of the bidi stage, so
once that lands it owns U+200E/200F/202A-202E/2066-2069 and this rule covers the rest.

**Testing this needs the right font.** Arimo maps RLM, so an RLM test in Arimo passes vacuously and
proves nothing. Use Gveret Levin, which does not.

### The proportionate fix is to refuse, not to fall back

Building a font fallback engine, and bundling a face per script, is not proportionate and never becomes
proportionate: the set of scripts is open, and page weight is budgeted.

**Detect instead.** If any character in an element has no glyph in the resolved font, say so before the
user downloads. That converts silent content loss into a visible, honest limitation, which is what this
product's voice calls for anyway, and it is the same move `src/lib/fontCoverage.test.js` already makes by
judging Hebrew capability against real asset bytes rather than a claim.

This is what makes "done" provable for the whole epic. With it, **every text the editor can display
either exports faithfully or is refused with a clear message. There is no third outcome.** No amount of
shaping work reaches that statement, because shaping is not where this hole is.

Two follow-ons worth recording, neither required:

- Shipping an Arabic-capable face is then a **product decision**, not a bug fix, and it can be taken on
  its own merits. Arabic is a language of this app's own country; that is an argument, but it is a
  separate one, and it drags in a joining script that layer 4 would then have to shape correctly.
- Once layer 2 exists, run-level font resolution becomes possible, because the run infrastructure is
  exactly what `resolveFontFamily`'s objection says is missing. **Unlocked by layer 2, not required by
  it.** Do not bundle the two.

## The browser shapes word by word, and we shape the whole line (found 2026-08-22)

The one divergence found so far that lives **inside** layer 4, the layer we thought we had. It also
turns out to be the cheapest fix in the whole document, and it is what finally settles which fonts we
can honestly ship.

### Measured

Comparing fontkit's total advance against the browser's `measureText`, per font, over 25 realistic form
strings (names, addresses, dates, amounts, in both scripts):

| font | `calt`? | strings disagreeing, whole-line | after shaping per whitespace segment |
|---|---|---|---|
| Arimo (default) | no | 2/25 | **0** |
| Tinos | no | 2/25 | **0** |
| Cousine | no | 0 | 0 |
| Assistant | no | 0 | 0 |
| Heebo | no | 0 | 0 |
| Gveret Levin | yes | 0 | 0 |
| **Playpen Sans Hebrew** | yes | **22/25**, worst 2.68% | **still 4/15**, worst 2.8px at 40px |

Isolating Arimo's case: `Tel Aviv` disagrees by 113 font units, while `Tel`, `Av` and a lone space each
match exactly. The disagreement is a kern pair **spanning the space**. Blink shapes and caches text
**word by word** (its ShapeCache), so a feature whose context crosses a space never fires in the browser;
fontkit shapes the whole line and fires it.

**So the fix is to match the browser's segmentation: shape per whitespace-delimited segment, not per
line.** That drops six of the seven fonts to exact agreement. It composes with layer 2 rather than
fighting it, since bidi already splits a line into runs and this splits those runs further.

### What this costs us honestly

**Parity here is parity with Chrome specifically.** Word-by-word shaping is Blink's caching strategy, not
a specification, and another engine may segment differently. We cannot match every browser at once, so
the promise is bounded by the browser the editor ran in. Worth stating plainly rather than discovering.

**Advance parity is necessary, not sufficient.** These numbers compare widths. Two fonts can agree on
total advance while choosing different glyphs, which matters most for exactly the `calt` fonts this
section is about. **Gveret Levin reads 0/25 and still deserves a glyph-level check** before it is
trusted, because it is the Hebrew handwriting fallback and its `calt` may simply be picking equal-width
alternates. Use the Tier 3 pixel probe, not the advance guard.

### Playpen Sans Hebrew is the first font the curation rule should actually drop

Playpen is a handwriting face whose whole appeal is that letters vary. It carries `calt` and 959 glyphs,
and uses **three different glyph ids for a single final mem** depending on context. fontkit and HarfBuzz
walk that contextual substitution differently, so the export draws **different letterforms** from the
ones the editor showed. Per-segment shaping cuts the damage but does not close it, because the remaining
disagreement is *within* a word.

That is a divergence inside the shaper. No pipeline stage fixes it. The only two options are to bundle
HarfBuzz for the sake of one decorative font, or to drop the font.

**Recommendation: drop it, or mark it approximate and say so in the UI.** This is exactly the case "The
font catalogue is ours to curate" was written for, and it is the first font to actually trigger it. We
owe correct output for the fonts we ship, and this one cannot be made correct at a proportionate price.

## Why no engine swap fixes this

This is the load-bearing conclusion, and it is the thing to read before reopening "should we bundle
HarfBuzz".

**HarfBuzz does not do bidi.** `hb_buffer` requires the caller to have resolved direction and to hand it
runs that are already single-direction. Chrome's stack is Blink (ICU bidi) and then HarfBuzz (normalize,
then shape). Our stack is `fontkit.layout()` and nothing above it.

So the three defects are not three instances of one problem, and only one of them is inside any shaper:

| defect | which layer | would bundling HarfBuzz fix it? |
|---|---|---|
| mixed-direction ordering | UAX#9 bidi, **above** the shaper | **No.** We would still need a bidi implementation. |
| composition before shaping | normalization, **inside** `hb-shape` | Yes. |
| unrepresentable characters | itemization / font fallback, **above** the shaper | **No.** HarfBuzz shapes with the font it is given. |

**One in three.** That is the number to hold on to before reaching for a bigger engine: swapping the
shaper closes a third of the gap while feeling like a decisive fix, which makes it the most expensive
wrong move available here.

That reframes the question the whole investigation has been circling. It is not "can an independent
shaping engine underwrite a WYSIWYG promise." It is **"we are missing the layers above the shaper, and
`layout()` was never the whole text pipeline."** Both gaps are named, published specification layers
rather than undocumented HarfBuzz behaviour, and both are bounded:

- **UAX#9 bidi.** A real spec with a real MIT implementation. `bidi-js` is 12KB minified and already in
  the tree transitively (via jsdom), so its licence and audit story are known. Do not hand-roll run
  splitting: hand-rolling fails exactly on the weak-directional digit cases already measured above.
- **Canonical composition**, gated on the font having a glyph for the composed character. The Hebrew
  presentation-form table is roughly forty entries.

**The decision: build the missing layers, keep HarfBuzz in reserve, and give the reserve a trigger.**
The trigger is falsifiable: **a divergence that is not attributable to a documented pipeline stage.**
Every defect so far is a named, published stage that we simply do not have, which is a bounded gap. One
that fits no stage would mean the surface is not enumerable after all, and that is the moment the WASM
payload starts paying for itself.

The bounded-ness argument leans on Hebrew specifically. Hebrew is non-joining and non-reordering; its
OpenType requirements are `ccmp`, `mark`, `mkmk`, and that is the list. **The argument expires the day
the catalogue adds Arabic or an Indic script**, where there is a joining state machine and a reordering
engine to re-derive, and where "we implemented the specs the shaper skips" stops being a small claim.

The layers also compose in one direction, which is a good sign: bidi splits a line into single-direction
runs, composition normalizes each run, per-glyph emission draws it. Same order as Chrome's stack. When
the bidi layer lands, pass `direction` explicitly to `layout()` (the signature is
`layout(string, userFeatures, script, language, direction)`) so fontkit stops guessing per run. Whether
an explicit direction alone suppresses the digit reversal is **worth measuring rather than assuming**;
passing `script` and `language` alone was measured and changes nothing.

## A guard that can see a misplaced mark

Guards A and B are blind to this class by construction (see the note in "The two guards" above). Three
tiers, cheapest first, and the third is the one that anchors the other two to reality.

**Tier 1 - order-insensitivity. No browser, deterministic, targets the exact defect.** For every
catalogued font, over an enumerated corpus of Hebrew clusters, assert our pipeline produces an identical
glyph-and-position sequence for **every canonically-equivalent ordering** of the same input. The browser
is order-insensitive; fontkit is order-sensitive in 7 of 7 fonts today, so this fails now and passes when
the pre-pass lands. The corpus is enumerable rather than sampled: 27 bases times roughly 20 points times
the dagesh/shin-dot dimension is a few thousand strings, and `layout()` is fast enough to run all of them
per font. *False negative:* a mark placed consistently wrong in every ordering. *False positives:* none
to speak of. Cheap to build correctly.

**Tier 2 - mark containment. Closes Tier 1's false negative, still no rasterizer.** For each emitted
mark, assert its ink box (fontkit bbox translated by the position we emit) overlaps its base glyph's ink
box. Pure arithmetic; it is what produced the overlap column in the table above, where it read 0% for
Arimo and 33% for Tinos. *False positives are real:* marks that legitimately sit outside the base ink
(meteg, some handwriting faces), so it needs a per-font tolerance. That maintenance cost is why it is
Tier 2 and not Tier 1.

**Tier 3 - the reference anchor. Browser, a handful of strings per font.** Assert that **Chromium
itself** is order-insensitive and matches the composed form. This is the test that fails if a browser
update moves the reference out from under us, and it is the only one that checks the clause Guard A's
name claims. It is the probe described above, non-vacuity assertion included, and without that assertion
it is worse than no test.

### The platform decides what an advance guard can prove (found in CI, 2026-08-23)

Guard A passed on macOS and failed 20 of 21 cases the first time it ran on the Linux CI runner. Nothing
was wrong with the export. **Chromium quantizes every glyph advance to a whole pixel when font hinting
is on**, which is the default on the runner and not on macOS, and the error accumulates per glyph:
every `measureText` result came back an exact integer, and the drift reached **2.416px on a 9-glyph
string**. No fixed percentage absorbs that without also going blind to real divergence.

Two things came out of fixing it, and the second one matters more than the first.

1. **Ask for unhinted metrics** (`ctx.textRendering = 'geometricPrecision'`), because a PDF has no
   hinting and unhinted advances are the thing actually worth comparing. Then **derive the tolerance
   from the measurement rather than the platform**: an integral width across a multi-glyph string means
   the platform quantized, so the bound becomes the quantization itself, half a pixel per glyph. On a
   subpixel platform the guard demands exact agreement, because that is what six of the seven fonts
   deliver.
2. **Sharpening the measurement immediately caught a real defect.** With unhinted metrics, Playpen Sans
   Hebrew diverges by **2.304px on `שלום עולם` at 32px**, where the old hinted measurement had reported
   agreement. The guard had been reporting a pass on a font already known to be wrong, purely because
   the measurement was too coarse to see it. That is the same lesson as the vacuous font-loading probe
   and the 0x0 jsdom rects, in a third costume: **a guard is only as good as the resolution of what it
   measures, and a green run proves nothing about the part it cannot resolve.**

Playpen is now carried in the spec as a named `KNOWN_DIVERGENCE_PX` entry rather than a tolerance, so a
regression past its measured figure still fails, and the entry disappears when H10 is decided.

**Still rejected: cross-rasterizer pixel diffing.** The reasoning in "the one that was rejected" above is
unchanged and the numbers here agree with it. Tier 3 is not that: it compares Chromium against Chromium.

## Small defects in the shipped emission code

Found while reviewing the H1-H4 diff. None is a reason to hold it, all three are cheap, and one is a
silent-corruption landmine worth defusing while the code is fresh.

1. **`newFontDictionary` mints a key per call.** Verified in `@cantoo/pdf-lib`: it calls
   `Font.uniqueKey(tag)` with no dedup, so every emitted run adds a `/Font` resource entry. Measured: a
   3-line element plus a 12-cell comb produced **15 entries for one font**. Not a correctness bug, but it
   scales with the document. A per-page `Map` keyed by the font ref fixes it. Note that Guard B cannot
   see this: its mock is `newFontDictionary: vi.fn(() => 'F1')`.
2. **`drawShapedRun` emits raw glyph IDs, valid only because `embedFont` defaults to `subset: false`.**
   pdf-lib's subset embedder remaps IDs through `includeGlyph()`, which is also what registers a glyph in
   the subset, so turning subsetting on later would silently corrupt every shaped run. Nothing currently
   documents the coupling. **Make it fail loudly** rather than silently: assert the embedder is not a
   subset embedder, with a comment naming `includeGlyph`.
3. **The comb grapheme regex drops a leading orphan mark.** `/\P{M}\p{M}*/gu` requires a base before any
   mark, so a string that opens with a combining mark loses it: `"ָשלום"` yields `["ש","ל","ו","ם"]`,
   verified. The previous `Array.from` code preserved it. Rare, but this is character *loss*, which is
   worse than misplacement. `/\p{M}+|\P{M}\p{M}*/gu` keeps the orphan as its own cluster (verified) and
   leaves every other case unchanged.

### Two smaller things review caught in the same code

- **Judge only what will be drawn.** The coverage pre-pass read the whole of `element.text`, but a comb
  field renders `slice(0, cellCount)` and ignores the overflow, so a document could be refused over a
  character that was never going to reach the page. The pre-pass now checks the drawn cells for a comb
  and the full string otherwise.
- **A refusal has to say where.** Refusing the whole document is the right call, because a silently
  missing glyph in a signed document is the defect this layer exists to close. But a 20-page document
  refused with no location is one the user cannot act on, especially when the offending character is
  invisible. `UnrepresentableTextError` now carries 1-based page numbers and the message names them.
  **Still open as a product question:** whether one stray emoji in one element should block the whole
  download, or whether this belongs earlier, as a live warning in the editor rather than a refusal at
  save time. The current behaviour is deliberate, not settled.

## The order to fix these in

Ranked by what the failure does to the document, not by how visible it is.

1. **Layer 3, refuse unrepresentable characters.** Silent total content loss, and the cheapest of the
   three: a coverage check and a message, no new pipeline stage. Do it first because it is the one that
   makes "done" a provable statement rather than a hope.
2. **Layer 2, bidi.** Changes what the document *says*. Needs no Latin character to trigger, so it fires
   on ordinary form content: dates, phone numbers, amounts, house numbers.
3. **Layer 1, composition**, once `hb-shape` has confirmed the mechanism. A legibility defect in text
   that remains correct and readable, which is why it ranks below the other two despite being the one
   found first.
4. **The three small items** in "Small defects in the shipped emission code", cheap enough to ride along
   with the layer-5 commit rather than waiting for any of the above.

Note that this is close to the reverse of the order they were discovered in. Discovery order tracked how
visible each defect was; this order tracks how much damage each does.

The currently-implemented per-glyph emission (layer 5) **ships as it is**. It is correct within its
scope, a strict improvement for pure-RTL pointed text, and the primitive every remaining fix draws
through.

## What "done" means, and why it is provable

Not "per-glyph parity across every font and mark combination". That is unbounded without a reference
engine, and it is the wrong shape of promise. The bar is bounded by two things this project already
controls: the catalogue is closed by policy, and the pipeline has a fixed number of stages.

> **Every text the editor can display either exports faithfully, or is refused with a clear message.
> There is no third outcome.**
>
> Concretely: characters no resolved font can draw are refused before download (layer 3); mixed-direction
> lines are ordered by UAX#9 (layer 2); and for the seven fonts we ship, the exported glyph sequence is
> invariant under canonical reordering and matches the composed form the browser renders, across an
> exhaustively enumerated corpus of base-plus-mark clusters (layer 1).

Each clause is checkable, and each is complete over the space it claims rather than sampled. The reason
this is worth stating as a single sentence: **it is the first version of the promise that does not depend
on nobody having reported the next bug yet.**
